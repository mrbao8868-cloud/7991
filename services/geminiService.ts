

import { GoogleGenAI, Type, GenerateContentResponse, Chat } from "@google/genai";
import { Topic, QuestionType, CognitiveLevel, Question, GeneratedMatrixResponse, GeneratedTopicConfig, TopicConfig, RateLimitError, questionKeys, SpecTopic, ObjectiveSpec, ApiKeyRequiredError, ExamConfig, InitialAnalysisResult, TocItem, GenerationMode } from '../types';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function attemptWithRetries<T>(ai: GoogleGenAI, apiCall: (ai: GoogleGenAI) => Promise<T>, operationName: string): Promise<T> {
    const maxRetries = 3;
    let lastError: any = new Error(`Thao tác "${operationName}" thất bại mà không có thông tin lỗi cụ thể.`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await apiCall(ai);
        } catch (error: any) {
            lastError = error;
            const errorMessage = (typeof error?.message === 'string') ? error.message : '';
            
            if (errorMessage.includes('API key not valid') || errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('Requested entity was not found.')) {
                throw new ApiKeyRequiredError('Khóa API không hợp lệ hoặc đã bị thu hồi.');
            }

            let isRateLimitError = false;
            let isNetworkError = false;
            
            try {
                const parsed = JSON.parse(errorMessage);
                if (parsed?.error?.code === 429 || parsed?.error?.status === 'RESOURCE_EXHAUSTED') {
                    isRateLimitError = true;
                }
            } catch (e) {
                if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit') || errorMessage.toLowerCase().includes('resource_exhausted')) {
                    isRateLimitError = true;
                }
            }

            if (!isRateLimitError && errorMessage.toLowerCase().includes('xhr error')) {
                isNetworkError = true;
            }

            const isRetryable = isRateLimitError || isNetworkError;

            if (isRetryable && attempt < maxRetries) {
                const delayTime = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                console.warn(`Lỗi ${isRateLimitError ? 'Rate limit' : 'Mạng'} trong "${operationName}". Thử lại sau ${Math.round(delayTime / 1000)}s... (Lần thử ${attempt})`);
                await delay(delayTime);
                continue;
            }
            
            if (isRateLimitError) {
                throw new RateLimitError(`Bạn đã vượt quá hạn mức sử dụng API. Thao tác "${operationName}" thất bại sau ${maxRetries} lần thử. Vui lòng kiểm tra lại gói cước hoặc chi tiết thanh toán.`);
            }
            
            let finalMessage = `Thao tác "${operationName}" thất bại.`;
            if(errorMessage) {
                try {
                    const parsed = JSON.parse(errorMessage);
                    finalMessage += ` Chi tiết: ${parsed?.error?.message || errorMessage}`;
                } catch (e) {
                    finalMessage += ` Chi tiết: ${errorMessage}`;
                }
            }
            throw new Error(finalMessage);
        }
    }
    throw lastError;
}

export async function withRetry<T>(
    keysToTry: string[],
    onKeyRotated: (newKey: string) => void,
    apiCallBuilder: (ai: GoogleGenAI) => Promise<T>,
    operationName: string
): Promise<T> {
    if (keysToTry.length === 0) {
        throw new ApiKeyRequiredError("Không có Khóa API nào được cung cấp.");
    }

    for (const key of keysToTry) {
        try {
            const ai = new GoogleGenAI({ apiKey: key });
            const result = await attemptWithRetries(ai, apiCallBuilder, operationName);
            onKeyRotated(key);
            return result;
        } catch (error) {
            if (error instanceof ApiKeyRequiredError || error instanceof RateLimitError) {
                const errorType = error instanceof RateLimitError ? "đã hết hạn ngạch" : "không hợp lệ";
                console.warn(`Khóa API bắt đầu bằng ${key.substring(0, 4)}... ${errorType}. Đang thử khóa tiếp theo.`);
                continue; // Try the next key
            }
            throw error;
        }
    }

    throw new ApiKeyRequiredError(`Tất cả ${keysToTry.length} Khóa API đã cung cấp đều không hợp lệ hoặc đã hết hạn ngạch. Vui lòng thêm một khóa API mới đang hoạt động.`);
}

/**
 * Robust JSON parser that attempts to recover data from truncated or slightly malformed JSON responses.
 */
function safeParseQuestionsJson(jsonText: string): any[] {
    let cleanText = jsonText.trim();
    
    // 1. Try standard parse first (best case)
    try {
        const parsed = JSON.parse(cleanText);
        if (Array.isArray(parsed)) return parsed;
        // If it returns an object that wraps questions (e.g. { questions: [...] }), try to extract
        if (typeof parsed === 'object' && parsed !== null) {
             const values = Object.values(parsed);
             const arrayVal = values.find(v => Array.isArray(v));
             if (arrayVal) return arrayVal as any[];
        }
    } catch (e) {
        // Proceed to recovery
    }

    // 2. Extract JSON from markdown code blocks
    // Look for ```json ... ``` or just ``` ... ``` and capture content
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
    const match = cleanText.match(codeBlockRegex);
    if (match) {
        cleanText = match[1].trim();
        try {
            const parsed = JSON.parse(cleanText);
            if (Array.isArray(parsed)) return parsed;
            if (typeof parsed === 'object' && parsed !== null) {
                 const values = Object.values(parsed);
                 const arrayVal = values.find(v => Array.isArray(v));
                 if (arrayVal) return arrayVal as any[];
            }
        } catch (e) {
            // Continue if extraction failed to produce valid JSON
        }
    }

    // 3. Heuristic: Find first '[' and last ']' to isolate the array
    const start = cleanText.indexOf('[');
    const end = cleanText.lastIndexOf(']');
    
    if (start !== -1 && end !== -1 && end > start) {
        const bracketContent = cleanText.substring(start, end + 1);
        try {
             const parsed = JSON.parse(bracketContent);
             if (Array.isArray(parsed)) return parsed;
        } catch (e) {
            // Check for truncation if this fails
        }
    }

    // 4. Handle truncation - Try to find the last valid array closure within the extracted block
    if (start !== -1) {
        // We work with the substring starting from '['
        const arrayStartText = cleanText.substring(start);
        
        // Find the last closing brace '}' which signifies end of an object
        let endIndex = arrayStartText.lastIndexOf('}');
        
        let attempts = 0;
        // Search backwards up to 50 objects deep to find a valid JSON structure
        while (endIndex > 0 && attempts < 50) {
            // Try closing the array at this object
            const attemptStr = arrayStartText.substring(0, endIndex + 1) + ']';
            try {
                const parsed = JSON.parse(attemptStr);
                if (Array.isArray(parsed)) {
                    console.warn(`Recovered ${parsed.length} questions from truncated JSON.`);
                    return parsed;
                }
            } catch (e) {
                // Invalid JSON, likely cut in middle of object or structure invalid
            }
            // Move back to previous '}'
            endIndex = arrayStartText.lastIndexOf('}', endIndex - 1);
            attempts++;
        }
    }

    throw new Error("Không thể phân tích dữ liệu JSON (dữ liệu có thể bị cắt cụt hoặc không hợp lệ).");
}

const analysisResponseSchema = {
    type: Type.OBJECT,
    properties: {
        subjects: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "An array of subject names found on the cover page. E.g., ['Lịch sử', 'Địa lý']. If only one subject, return an array with one element."
        },
        examTitle: { type: Type.STRING, description: "A suggested exam title based on the document's content. E.g., 'KIỂM TRA GIỮA HỌC KỲ I'. Crucially, you must IGNORE document-specific headers that are not exam titles, such as 'MỤC LỤC' (Table of Contents), 'ĐÁP ÁN' (Answer Key), 'BẢN ĐẶC TẢ' (Specification), or 'CHUYÊN ĐỀ' (Thematic Unit). The title should describe the type of assessment. " },
        schoolName: { type: Type.STRING, description: "The name of the school found on the page. E.g., 'SỞ GD&ĐT LÀO CAI'" },
        departmentName: { type: Type.STRING, description: "The name of the department or team. E.g., 'TRƯỜNG THPT SỐ 3 BẢO THẮNG'" }
    },
    required: ['subjects', 'examTitle', 'schoolName', 'departmentName']
};

const tocResponseSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            chapter: { type: Type.STRING, description: "The chapter name or main section title (e.g., 'Chương 1: Chất và sự biến đổi'). If not applicable, use a general label." },
            lessonName: { type: Type.STRING, description: "The specific lesson title or topic name (e.g., 'Bài 1: Nguyên tử')." }
        },
        required: ['chapter', 'lessonName']
    }
};

const questionSchema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING, description: 'The question text/stem in Vietnamese.' },
    learningObjective: { type: Type.STRING, description: 'The specific learning objective ("Yêu cầu cần đạt") this question assesses, in Vietnamese. Must match the requested objective.' },
    type: { type: Type.STRING, enum: Object.values(QuestionType), description: 'The type of question.' },
    level: { type: Type.STRING, enum: Object.values(CognitiveLevel), description: 'The cognitive level of the question.' },
    options: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'An array of options. For Multiple Choice, it MUST contain EXACTLY 4 options. For True/False, it MUST contain EXACTLY 4 statements (sub-questions). For other types, it MUST be an empty array.'
    },
    answer: { type: Type.STRING, description: 'The correct answer. For Multiple Choice, it is the letter (A, B, C, D). For True/False, it MUST be a string specifying True/False for each option (e.g., "a) Đ, b) S, c) Đ, d) S"). For essays, provide a model answer.' },
  },
  required: ['text', 'type', 'level', 'answer', 'learningObjective']
};

const generatedTopicConfigSchema = {
    type: Type.OBJECT,
    properties: {
        chapter: { type: Type.STRING },
        name: { type: Type.STRING },
        subject: { type: Type.STRING },
        mc_knowledge: { type: Type.NUMBER }, mc_comprehension: { type: Type.NUMBER }, mc_application: { type: Type.NUMBER },
        tf_knowledge: { type: Type.NUMBER }, tf_comprehension: { type: Type.NUMBER }, tf_application: { type: Type.NUMBER },
        sa_knowledge: { type: Type.NUMBER }, sa_comprehension: { type: Type.NUMBER }, sa_application: { type: Type.NUMBER },
        essay_knowledge: { type: Type.NUMBER }, essay_comprehension: { type: Type.NUMBER }, essay_application: { type: Type.NUMBER },
    },
    required: ['chapter', 'name', 'subject', ...questionKeys]
};

const matrixResponseSchema = {
    type: Type.OBJECT,
    properties: {
        examTitle: { type: Type.STRING },
        topics: {
            type: Type.ARRAY,
            items: generatedTopicConfigSchema
        }
    },
    required: ['examTitle', 'topics']
};

const objectiveCountsSchema = {
    type: Type.OBJECT,
    properties: {
        mc_knowledge: { type: Type.NUMBER }, mc_comprehension: { type: Type.NUMBER }, mc_application: { type: Type.NUMBER },
        tf_knowledge: { type: Type.NUMBER }, tf_comprehension: { type: Type.NUMBER }, tf_application: { type: Type.NUMBER },
        sa_knowledge: { type: Type.NUMBER }, sa_comprehension: { type: Type.NUMBER }, sa_application: { type: Type.NUMBER },
        essay_knowledge: { type: Type.NUMBER }, essay_comprehension: { type: Type.NUMBER }, essay_application: { type: Type.NUMBER },
    },
    required: questionKeys,
};

const objectiveSpecSchema = {
    type: Type.OBJECT,
    properties: {
        learningObjective: { type: Type.STRING, description: 'The specific learning objective ("Yêu cầu cần đạt") in Vietnamese.' },
        specificCompetency: { type: Type.STRING, description: 'The specific competency ("Năng lực đặc thù") this objective addresses, in Vietnamese. For example: "Năng lực tư duy và lập luận toán học", "Năng lực ngôn ngữ".' },
        counts: objectiveCountsSchema
    },
    required: ['learningObjective', 'specificCompetency', 'counts']
};

const specTopicSchema = {
    type: Type.OBJECT,
    properties: {
        id: { type: Type.STRING },
        chapter: { type: Type.STRING },
        name: { type: Type.STRING },
        objectives: {
            type: Type.ARRAY,
            items: objectiveSpecSchema,
        }
    },
    required: ['id', 'chapter', 'name', 'objectives']
};

export const analyzeDocumentCover = async (
    keysToTry: string[],
    onKeyRotated: (newKey: string) => void,
    coverImage: string
): Promise<InitialAnalysisResult> => {
     const imagePart = {
        inlineData: {
            mimeType: 'image/jpeg',
            data: coverImage,
        },
    };

    const prompt = `
        You are an AI assistant for Vietnamese educators. Analyze the provided image, which is the cover page of an educational document.
        Your task is to extract the following information and return it as a single, valid JSON object:
        1.  'subjects': Identify all distinct subjects mentioned. If it's a combined document (e.g., "Lịch sử và Địa lí"), return an array like ["Lịch sử", "Địa lí"]. If only one subject is found, return an array with that single subject.
        2.  'examTitle': Suggest a suitable exam title. It is usually written in uppercase at the top. For example, 'KIỂM TRA GIỮA HỌC KỲ I'. Crucially, you must IGNORE document-specific headers that are not exam titles, such as 'MỤC LỤC' (Table of Contents), 'ĐÁP ÁN' (Answer Key), 'BẢN ĐẶC TẢ' (Specification), or 'CHUYÊN ĐỀ' (Thematic Unit). The title should describe the type of assessment.
        3.  'schoolName': Identify the name of the school or the superior educational department. E.g., 'SỞ GD&ĐT LÀO CAI'.
        4.  'departmentName': Identify the specific school name or department name if available. E.g., 'TRƯỜNG THPT SỐ 3 BẢO THẮNG'. If not present, you can return the same as schoolName.
        
        Extract the information as accurately as possible. If a piece of information is not present, return an empty string for that field.
    `;

     const response: GenerateContentResponse = await withRetry(keysToTry, onKeyRotated, (ai) => {
        return ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }, imagePart] },
            config: {
                systemInstruction: 'You are an expert AI assistant that extracts key information from Vietnamese educational documents and provides it in a structured JSON format.',
                responseMimeType: 'application/json',
                responseSchema: analysisResponseSchema
            }
        });
    }, "Phân tích bìa tài liệu");

    const jsonText = response.text.trim();
    const parsed = JSON.parse(jsonText);
    
    // Basic validation
    if (parsed && Array.isArray(parsed.subjects) && typeof parsed.examTitle === 'string') {
        return parsed;
    }
    throw new Error("Cấu trúc phản hồi từ AI không hợp lệ khi phân tích bìa.");
};

export const extractTableOfContents = async (
    keysToTry: string[],
    onKeyRotated: (newKey: string) => void,
    images: string[]
): Promise<TocItem[]> => {
    // Send all images to AI to find the structure
    // Optimization: Depending on document size, we might only need the first 10 pages, 
    // but the user might upload a spec document where the "list of lessons" is deep inside.
    // For now, we use all images as gemini-2.5-flash handles large context well.
    const imageParts = images.map(imgBase64 => ({
        inlineData: {
            mimeType: 'image/jpeg',
            data: imgBase64,
        },
    }));

    const prompt = `
        Analyze the provided document images. Your goal is to extract the **Table of Contents** or the **List of Lessons/Topics** that can be used to generate an exam.
        
        Look for sections labeled "Mục lục", "Nội dung", "Chương trình", or simply scan the document structure to identify:
        1. **Chapters** (Chương/Chủ đề lớn)
        2. **Lessons** (Bài học/Chuyên đề nhỏ/Đơn vị kiến thức) contained within those chapters.

        Return a JSON array where each item represents a Lesson/Topic and its corresponding Chapter.
        Structure: [{ "chapter": "Name of Chapter", "lessonName": "Name of Lesson" }, ...]

        - If the document is a specification ("Bản đặc tả"), extract the rows from the specification matrix.
        - If the document is a textbook or review material, extract the lessons.
        - Ensure "chapter" and "lessonName" are in Vietnamese (unless the subject is English).
        - If a lesson does not belong to a clear chapter, use a generic chapter name like "Nội dung chung" or "Chuyên đề".
    `;

    const response: GenerateContentResponse = await withRetry(keysToTry, onKeyRotated, (ai) => {
        return ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }, ...imageParts] },
            config: {
                systemInstruction: 'You are an expert AI assistant. Extract the Table of Contents or List of Lessons from the document into a structured JSON array.',
                responseMimeType: 'application/json',
                responseSchema: tocResponseSchema
            }
        });
    }, "Trích xuất Mục lục");

    const jsonText = response.text.trim();
    const parsed = JSON.parse(jsonText);

    if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({
            id: crypto.randomUUID(),
            chapter: item.chapter || "Chương không xác định",
            lessonName: item.lessonName || "Bài không xác định"
        }));
    }
    throw new Error("Cấu trúc mục lục trả về từ AI không hợp lệ.");
};


export const generateMatrixFromImages = async (
    keysToTry: string[],
    onKeyRotated: (newKey: string) => void,
    images: string[],
    config: ExamConfig,
    selectedTopics?: TocItem[],
    mode: GenerationMode = 'generate'
): Promise<GeneratedMatrixResponse> => {
    const imageParts = images.map(imgBase64 => ({
        inlineData: {
            mimeType: 'image/jpeg',
            data: imgBase64,
        },
    }));

    let scopeInstruction = '';
    
    if (selectedTopics && selectedTopics.length > 0) {
        const topicsList = selectedTopics.map(t => `- Chapter: "${t.chapter}", Lesson: "${t.lessonName}"`).join('\n');
        scopeInstruction = `
            **CRITICAL SCOPE INSTRUCTION**:
            The user has explicitly selected the following topics for the exam. You MUST ONLY generate the matrix for these specific topics. IGNORE any other content in the document.
            
            SELECTED TOPICS LIST:
            ${topicsList}

            For each selected topic above, you must create a corresponding entry in the output matrix. Do not skip any selected topic.
        `;
    } else {
        scopeInstruction = 'You are to analyze all content present in the provided document images.';
    }

    const multiSubjectInstruction = config.isMultiSubject && config.subjectAllocations
        ? `This is a multi-subject exam. You must distribute the questions and points according to the following allocation: ${config.subjectAllocations.map(s => `${s.subjectName}: ${s.percentage}%`).join(', ')}. When you identify a topic, you MUST assign it to the correct subject in the 'subject' field.`
        : `This is a single-subject exam for ${config.subjectsSummary}. All topics should be assigned to this subject.`;
    
    const totalTnkqCount = config.mcCount + config.tfCount + config.saCount;
    const tnkqPointPerQuestion = totalTnkqCount > 0 ? config.tnkqPoints / totalTnkqCount : 0;
    const essayPointPerQuestion = config.essayCount > 0 ? config.essayPoints / config.essayCount : 0;
    
    const containsEnglishSubject = config.subjectsSummary.toLowerCase().includes('tiếng anh');
    let languageInstruction = 'All text output must be in Vietnamese.';
    if (containsEnglishSubject) {
        if (config.isMultiSubject) {
            languageInstruction = "For any topics related to the subject 'Tiếng Anh', all text output (chapter, name) must be in English. For all other subjects, the output must be in Vietnamese.";
        } else {
            languageInstruction = 'All text output (chapter, name, etc.) must be in English.';
        }
    }
    const systemInstruction = `You are an expert AI curriculum designer for education. Your primary function is to generate a valid and logical exam matrix based on source material and strict constraints. ${languageInstruction}`;


    let prompt = '';

    if (mode === 'extract') {
        prompt = `
            You are an expert AI assistant for Vietnamese educators. You are analyzing a "Review Outline" (Đề cương ôn tập) which contains a list of EXISTING questions.

            **YOUR TASK (EXTRACTION MODE):**
            1. Scan the entire document images provided.
            2. Identify ALL questions present in the document.
            3. Group these questions by their Topic/Chapter/Lesson.
            4. For each topic, count EXACTLY how many questions exist in the document for each type (MC, TF, SA, Essay) and cognitive level (Knowledge, Comprehension, Application).
            5. Create a matrix that reflects the EXACT structure of the uploaded outline.
            
            **CRITICAL:** 
            - IGNORE the target question counts (mcCount, tfCount, etc.) provided in the configuration. Instead, report the ACTUAL counts found in the document.
            - If a topic has 50 questions in the document, your matrix must show 50 questions for that topic.
            - Assign topics to the correct subject in the 'subject' field.
            - Return a single JSON object containing the exam title (based on the document header) and an array of topic objects with their actual question counts.
        `;
    } else {
        prompt = `
            You are an expert AI assistant for Vietnamese educators, specializing in curriculum design and exam matrix creation. Your task is to analyze the provided document images and create a detailed exam matrix.

            ${scopeInstruction}
            
            **HIGH-LEVEL EXAM CONFIGURATION:**
            - Exam Duration: ${config.duration}. This is a critical factor for you to consider when assessing the complexity and length of the topics.
            - Exam Difficulty Guideline: ${config.difficulty}. Use this to inform your question distribution. For 'Dễ' (Easy), prioritize 'Biết' (Knowledge) questions. For 'Trung bình' (Medium), ensure a balanced distribution. For 'Trung bình khá' (Medium-Hard), increase the proportion of 'Vận dụng' (Application) questions. This is a general guideline to be used in conjunction with the percentages below.
            - ${multiSubjectInstruction}
            - Total points for Objective Questions (TNKQ: 'mc', 'tf', 'sa'): ${config.tnkqPoints}.
            - Total points for Essay Questions ('essay'): ${config.essayPoints}.
            - Total Score: ${config.tnkqPoints + config.essayPoints} points.
            - Total number of Multiple Choice ('mc') questions: ${config.mcCount}.
            - Total number of True/False ('tf') questions: ${config.tfCount}.
            - Total number of Short Answer ('sa') questions: ${config.saCount}.
            - Total number of Essay ('essay') questions: ${config.essayCount}.
            - Cognitive Level Distribution: ${config.knowledgePct}% for Knowledge (Biết), ${config.comprehensionPct}% for Comprehension (Hiểu), ${config.applicationPct}% for Application (Vận dụng).

            **REQUIRED TASKS & CRITICAL CONSTRAINTS:**
            1.  Base your analysis SOLELY on the content visible in the images and within the defined scope. Do not use external knowledge.
            2.  Identify a suitable overall title for the exam.
            3.  Generate the matrix topics based strictly on the 'SELECTED TOPICS LIST' provided above.
            4.  For each topic, assign it to the correct subject in the 'subject' field (e.g., "Lịch sử", "Địa lí").
            5.  Distribute the EXACT specified number of questions for each type across the extracted topics and cognitive levels ('knowledge', 'comprehension', 'application').
            6.  The NUMBER of questions for every specific type and level (e.g., 'mc_knowledge') MUST be an INTEGER.
            7.  The sum of all 'mc_knowledge', 'mc_comprehension', and 'mc_application' counts across all topics MUST equal EXACTLY ${config.mcCount}.
            8.  The sum of all 'tf_knowledge', 'tf_comprehension', and 'tf_application' counts across all topics MUST equal EXACTLY ${config.tfCount}.
            9.  The sum of all 'sa_knowledge', 'sa_comprehension', and 'sa_application' counts across all topics MUST equal EXACTLY ${config.saCount}.
            10. The sum of all 'essay_knowledge', 'essay_comprehension', and 'essay_application' counts across all topics MUST equal EXACTLY ${config.essayCount}.
            11. The distribution of points across the cognitive levels AND subjects should be as close as possible to the specified percentages. For calculation, assume each TNKQ question is worth ${tnkqPointPerQuestion.toFixed(3)} points and each Essay question is worth ${essayPointPerQuestion.toFixed(3)} points.
            12. Return a single JSON object containing the exam title and an array of topic objects. Each topic object must contain the integer counts for all 12 question type/level combinations (e.g., 'mc_knowledge'). Ensure all 12 count fields and the 'subject' field are present for each topic.
        `;
    }
    
    const response: GenerateContentResponse = await withRetry(keysToTry, onKeyRotated, (ai) => {
        return ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }, ...imageParts] },
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: matrixResponseSchema
            }
        });
    }, "Tạo Ma trận từ Tài liệu");

    const jsonText = response.text.trim();
    const parsedResponse = JSON.parse(jsonText);

    if (parsedResponse && Array.isArray(parsedResponse.topics) && typeof parsedResponse.examTitle === 'string') {
        return parsedResponse;
    }
    throw new Error("Cấu trúc phản hồi từ AI không hợp lệ.");
};


export const generateSpecification = async (
    keysToTry: string[],
    onKeyRotated: (newKey: string) => void,
    topics: Topic[]
): Promise<SpecTopic[]> => {
    const hasEnglishTopic = topics.some(t => t.subject?.toLowerCase().includes('tiếng anh'));

    const promptIntro = hasEnglishTopic
        ? `You are an expert in curriculum design. Your task is to create a detailed exam specification based on the provided exam matrix. For topics in English, create specific, detailed "learning objectives" in English. For topics in Vietnamese, create "Yêu cầu cần đạt" in Vietnamese.`
        : `You are an expert in Vietnamese curriculum design. Your task is to create a detailed exam specification ("Bản đặc tả") based on the provided exam matrix.`;

    const objectiveInstruction = hasEnglishTopic
        ? `Break down the topic into specific, detailed learning objectives. These objectives must be in the same language as their corresponding topic (English for 'Tiếng Anh' topics, Vietnamese for others).`
        : `Break down the topic into specific, detailed learning objectives ("Yêu cầu cần đạt").`;
    
    const systemInstruction = hasEnglishTopic
        ? "You are an expert AI assistant for educators. Your task is to create a detailed and accurate exam specification based on a provided matrix, handling both English and Vietnamese content as instructed. You must strictly follow the question counts and return a valid JSON array as per the schema."
        : "You are an expert AI assistant for Vietnamese educators. Your task is to create a detailed and accurate exam specification based on a provided matrix. You must strictly follow the question counts and return a valid JSON array as per the schema.";


    const prompt = `
        ${promptIntro}
        For each topic provided, you must:
        1. ${objectiveInstruction} There can be one or more objectives per topic. For each objective, you MUST also provide a corresponding 'specificCompetency' ("Năng lực đặc thù cần đạt"). This competency describes the skill the student demonstrates (e.g., "Năng lực tư duy và lập luận toán học", "Năng lực ngôn ngữ"). This field is mandatory.
        2. Distribute the required number of questions for that topic among the learning objectives you've created.
        3. The total number of questions for each type/level, when summed across all objectives within a topic, MUST EXACTLY MATCH the numbers provided for that topic in the input. Do not add or remove any questions.

        Here is the exam matrix data:
        ${JSON.stringify(topics.map(t => ({
            id: t.id,
            chapter: t.chapter,
            name: t.name,
            subject: t.subject, // Provide subject to AI for context
            ...questionKeys.reduce((acc, key) => ({ ...acc, [key]: t[key] }), {})
        })))}

        Return a single JSON array of SpecTopic objects.
    `;

    const response: GenerateContentResponse = await withRetry(keysToTry, onKeyRotated, (ai) => {
        return ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: specTopicSchema
                }
            }
        });
    }, "Tạo Bản Đặc tả");

    const jsonText = response.text.trim();
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
        return parsed;
    }
    throw new Error("Cấu trúc Bản đặc tả trả về từ AI không hợp lệ. Phản hồi không phải là một mảng JSON.");
};


const generateQuestionsForObjective = async (
    keysToTry: string[],
    onKeyRotated: (newKey: string) => void,
    chapter: string,
    topicName: string,
    objective: ObjectiveSpec,
    subject: string | undefined,
    onQuestionsGenerated: (questions: Question[]) => void,
    mode: GenerationMode,
    images: string[] // We need images for extraction mode
): Promise<void> => {
    const isEnglishSubject = subject?.toLowerCase().includes('tiếng anh');
    const questionRequests: string[] = [];
    let totalQuestionsToGenerate = 0;

    const typeMap = {
        mc: { vi: "Trắc nghiệm nhiều lựa chọn", en: "Multiple Choice" },
        tf: { vi: "Trắc nghiệm Đúng/Sai", en: "True/False" },
        sa: { vi: "Trả lời ngắn", en: "Short Answer" },
        essay: { vi: "Tự luận", en: "Essay" }
    };
    const levelMap = {
        knowledge: { vi: "Biết", en: "Knowledge" },
        comprehension: { vi: "Hiểu", en: "Comprehension" },
        application: { vi: "Vận dụng", en: "Application" }
    };

    for (const key of questionKeys) {
        const count = objective.counts[key] || 0;
        if (count > 0) {
            const [typeKey, levelKey] = key.split('_');
            const typeText = isEnglishSubject ? typeMap[typeKey as keyof typeof typeMap].en : typeMap[typeKey as keyof typeof typeMap].vi;
            const levelText = isEnglishSubject ? levelMap[levelKey as keyof typeof levelMap].en : levelMap[levelKey as keyof typeof levelMap].vi;
            questionRequests.push(isEnglishSubject ? `${count} ${typeText} question(s) at the ${levelText} level` : `${count} câu hỏi loại "${typeText}" ở mức độ "${levelText}"`);
            totalQuestionsToGenerate += count;
        }
    }

    if (totalQuestionsToGenerate === 0) {
        return;
    }

    const essayAnswerInstruction = isEnglishSubject
        ? `For Essay questions, provide a detailed model answer. The answer MUST be structured as a list of bullet points (using '-'). Each bullet point should represent a key idea or a part of the solution. You MUST suggest a reasonable point value for each bullet point, formatted like this: "- [Main point] (0.25 points)".`
        : `For Essay questions, provide a detailed model answer. The answer MUST be structured as a list of bullet points (using '-'). Each bullet point should represent a key idea or a part of the solution. You MUST suggest a reasonable point value for each bullet point, formatted like this: "- [Nội dung chính] (0.25 điểm)".`;

    const latexInstruction = `
        - **CRITICAL FORMATTING RULE**: **DO NOT USE LaTeX** for simple chemical formulas or math expressions. Use **Unicode** text ("dạng thường").
        - **Chemistry**: Use standard Unicode characters.
          - INCORRECT: \\ce{H2O}, \\(O_2\\), \\ce{Fe^{3+}}, \\ce{NaCl}
          - CORRECT: H₂O, O₂, Fe³⁺, NaCl
        - **Math**: Use Unicode for exponents and symbols.
          - INCORRECT: \\(x^2\\), 30^{\\circ}
          - CORRECT: x², 30°, π, ≈, ≤, ≥
        - **Exceptions (Use LaTeX wrapped in \\(...\\))**:
          - Fractions: \\(\\frac{a}{b}\\)
          - Roots: \\(\\sqrt{x}\\)
          - Vectors: \\(\\vec{a}\\)
        - If you must use LaTeX, ensure JSON escaping is correct.
    `;
    
    // Prepare image parts for extraction
    const imageParts = images.map(imgBase64 => ({
        inlineData: {
            mimeType: 'image/jpeg',
            data: imgBase64,
        },
    }));

    let basePrompt = '';

    if (mode === 'extract') {
         basePrompt = `
            Learning Objective: "${objective.learningObjective}"
            Topic: "${topicName}"

            **TASK: EXTRACT QUESTIONS VERBATIM**
            Based on the provided document images, find and transcribe exactly ${totalQuestionsToGenerate} questions that match the topic "${topicName}".
            
            The required composition is:
            - ${questionRequests.join('\n- ')}
            
            **RULES FOR EXTRACTION:**
            1. **DO NOT GENERATE NEW QUESTIONS.** You must find existing questions in the document images that fit this topic.
            2. Transcribe the text, options, and answers EXACTLY as they appear in the image.
            3. If the document does not provide an answer key, you must solve the question and provide the correct answer yourself.
            4. If there are not enough questions in the document to match the exact count requested, please transcribe as many as you can find for this topic.
            5. Follow the JSON format strictly.
            
            ${isEnglishSubject ? '' : latexInstruction}
            
            **FORMAT GUIDELINES BY QUESTION TYPE:**
             1. **Multiple Choice (Trắc nghiệm nhiều lựa chọn):**
               - 'options': EXACTLY 4 distinct strings.
               - 'answer': The letter of the correct option (e.g., "A").

            2. **True/False (Trắc nghiệm Đúng/Sai):**
               - The 'text' field must be the main context/stem.
               - The 'options' array MUST contain EXACTLY 4 distinct sub-statements (a, b, c, d).
               - The 'answer' field MUST specify the Truth value for EACH option (e.g., "a) Đ, b) S, c) Đ, d) S").

            3. **Short Answer (Trả lời ngắn):**
               - 'options': Empty array.
               - 'answer': A concise model answer.

            4. **Essay (Tự luận):**
               - ${essayAnswerInstruction}

            The final JSON array should contain exactly ${totalQuestionsToGenerate} question objects.
        `;
    } else {
         basePrompt = `
            Learning Objective: "${objective.learningObjective}"

            Based on the provided context, generate a single JSON array containing a total of ${totalQuestionsToGenerate} questions that SPECIFICALLY assess this learning objective. The required questions are:
            - ${questionRequests.join('\n- ')}

            CRITICAL GUIDELINES FOR EACH QUESTION:
            - The 'learningObjective' field in the JSON response for each question MUST EXACTLY match "${objective.learningObjective}".
            - IMPORTANT: For multiple-choice and true/false options, provide ONLY the text of the option. DO NOT include the option letter (e.g., "A.", "B.", "C.") in the option string itself. The application will add these letters automatically.
            ${isEnglishSubject ? '' : latexInstruction}
            
            **FORMAT GUIDELINES BY QUESTION TYPE:**
            1. **Multiple Choice (Trắc nghiệm nhiều lựa chọn):**
               - 'options': EXACTLY 4 distinct strings.
               - 'answer': The letter of the correct option (e.g., "A").

            2. **True/False (Trắc nghiệm Đúng/Sai):**
               - The 'text' field must be the main context/stem (e.g., a statement, a math problem, or a data set) belonging to the lesson "${topicName}".
               - The 'options' array MUST contain EXACTLY 4 distinct sub-statements (a, b, c, d) related to that context.
               - The 'answer' field MUST specify the Truth value for EACH option in a readable string format like: "a) Đ, b) S, c) Đ, d) S".
               - **CRITICAL RANDOMIZATION RULE:** You MUST randomly configure the 4 options so that the number of "True" statements is randomly chosen to be **1, 2, or 3**. Do NOT always make it 1 True/3 False. Do NOT always make it 2 True/2 False. Vary it.
               - All 4 statements must strictly relate to the provided context and lesson content.

            3. **Short Answer (Trả lời ngắn):**
               - 'options': Empty array.
               - 'answer': A concise model answer.

            4. **Essay (Tự luận):**
               - ${essayAnswerInstruction}

            The final JSON array should contain exactly ${totalQuestionsToGenerate} question objects.
            Return a single JSON array containing all the generated question objects.
        `;
    }
    
    const prompt = isEnglishSubject ? `
        Subject: English
        Chapter: "${chapter}"
        Topic: "${topicName}"
        
        Generate/Extract questions in ENGLISH.

        ${basePrompt}
    ` : `
        Chương: "${chapter}"
        Chủ đề: "${topicName}"
        
        ${mode === 'extract' ? 'Trích xuất' : 'Tạo'} câu hỏi bằng TIẾNG VIỆT.

        ${basePrompt}
    `;

    const systemInstruction = isEnglishSubject ? 
    "You are an expert in creating educational materials for English language learners. You will generate a batch of questions in English based on a specific learning objective. You must strictly adhere to the requested JSON schema and question counts." :
    "You are an expert in creating educational materials for Vietnamese schools. You will generate a batch of questions based on a specific learning objective. All content must be in Vietnamese and strictly adhere to the requested JSON schema and question counts.";

    // If Extract mode, we must pass the images. If Generate mode, we rely on internal knowledge (or context if passed, but usually standard gen doesn't need images at this granular level unless we pass specific pages. For now, we will pass images if in extract mode).
    const contentPayload = mode === 'extract' 
        ? { parts: [{ text: prompt }, ...imageParts] }
        : prompt;

    const response: GenerateContentResponse = await withRetry(keysToTry, onKeyRotated, (ai) => {
        return ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contentPayload,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: questionSchema
                }
            }
        });
    }, `Tạo/Trích xuất ${totalQuestionsToGenerate} câu hỏi cho mục tiêu "${objective.learningObjective}"`);

    const jsonText = response.text.trim();
    
    let parsedQuestions: any[];
    try {
        parsedQuestions = safeParseQuestionsJson(jsonText);
    } catch (e) {
        console.error("JSON Parse Error:", e);
        throw new Error(`Lỗi định dạng dữ liệu từ AI: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (Array.isArray(parsedQuestions)) {
        if (parsedQuestions.length !== totalQuestionsToGenerate) {
            console.warn(`AI returned ${parsedQuestions.length} questions, but ${totalQuestionsToGenerate} were requested for objective "${objective.learningObjective}". Using the returned questions anyway.`);
        }
        const questionsWithIds = parsedQuestions.map(q => ({ ...q, id: crypto.randomUUID() }));
        onQuestionsGenerated(questionsWithIds);
    } else {
        throw new Error(`Cấu trúc câu hỏi trả về từ AI không hợp lệ cho mục tiêu "${objective.learningObjective}", không phải là một mảng JSON.`);
    }
};


export const generateAllQuestionsForTopics = async (
    keysToTry: string[],
    onKeyRotated: (newKey: string) => void,
    topics: Topic[],
    specification: SpecTopic[],
    onTopicUpdate: (updatedTopic: Topic) => void,
    mode: GenerationMode,
    images: string[]
): Promise<void> => {
    const topicMap = new Map(topics.map(t => [t.id, t]));
    let masterError: Error | null = null;

    for (const spec of specification) {
        if (masterError) break;

        const originalTopic = topicMap.get(spec.id);
        if (!originalTopic) continue;

        try {
            onTopicUpdate({ ...originalTopic, generationStatus: 'generating', questions: [] });

            let allQuestionsForTopic: Question[] = [];
            
            for (const obj of spec.objectives) {
                if (masterError) break;
                
                const onQuestionsGenerated = (newQuestions: Question[]) => {
                    allQuestionsForTopic.push(...newQuestions);
                    onTopicUpdate({
                        ...originalTopic,
                        questions: [...allQuestionsForTopic],
                        generationStatus: 'generating',
                    });
                };
                
                // If extract mode, we pass all images. This might be heavy, but necessary to find the question in the document.
                // Optimization: In a real app, we would map topics to specific pages.
                await generateQuestionsForObjective(
                    keysToTry, 
                    onKeyRotated, 
                    spec.chapter, 
                    spec.name, 
                    obj, 
                    originalTopic.subject, 
                    onQuestionsGenerated,
                    mode,
                    images
                );
            }
            
            if (masterError) continue;

            onTopicUpdate({
                ...originalTopic,
                questions: allQuestionsForTopic,
                generationStatus: 'completed',
                generationError: undefined
            });
        } catch (error) {
            console.error(`Failed to generate questions for topic "${spec.name}":`, error);
            const errorMessage = error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định khi tạo câu hỏi.";
            onTopicUpdate({
                ...originalTopic,
                questions: [],
                generationStatus: 'failed',
                generationError: errorMessage
            });

            if (error instanceof RateLimitError || error instanceof ApiKeyRequiredError) {
                if (!masterError) masterError = error;
            }
        }
    }

    if (masterError) {
        throw masterError;
    }
};

/**
 * Uses AI to review and standardize formula formatting in a batch of text strings.
 */
export const standardizeExamContent = async (
    keysToTry: string[],
    onKeyRotated: (newKey: string) => void,
    textsToStandardize: string[],
    onProgress?: (processedCount: number, totalCount: number) => void
): Promise<string[]> => {
    const BATCH_SIZE = 15; // Process 15 strings per call to be safe with limits and speed
    const standardizedTexts: string[] = new Array(textsToStandardize.length).fill('');
    const batches = [];

    // Create batches
    for (let i = 0; i < textsToStandardize.length; i += BATCH_SIZE) {
        batches.push({
            indices: Array.from({ length: Math.min(BATCH_SIZE, textsToStandardize.length - i) }, (_, k) => i + k),
            texts: textsToStandardize.slice(i, i + BATCH_SIZE)
        });
    }

    let completed = 0;

    for (const batch of batches) {
        try {
            const prompt = `
                You are a Vietnamese educational content formatter.
                TASK: Convert ALL LaTeX math/chemistry formulas to standard Unicode text ("dạng thường") unless it is structurally impossible (like complex fractions).
                
                Input: Array of strings.
                Output: Array of strings with LaTeX removed.

                RULES:
                1. **Chemistry**: Convert ALL \\ce{...} tags to Unicode.
                   - "\\ce{H2SO4}" -> "H₂SO₄"
                   - "\\(\\ce{Na+}\\)" -> "Na⁺"
                2. **Math**: Convert LaTeX symbols to Unicode.
                   - "\\(x^2\\)" -> "x²"
                   - "\\(30^\\circ\\)" -> "30°"
                   - "\\(\\pi\\)" -> "π"
                   - "\\le" -> "≤"
                3. **Only Keep LaTeX** for vertical structures like fractions (\\frac) or large operators (\\int).
                
                Input Array:
                ${JSON.stringify(batch.texts)}
            `;

            const response: GenerateContentResponse = await withRetry(keysToTry, onKeyRotated, (ai) => {
                return ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                    config: {
                        systemInstruction: "You are a specialized AI text formatter. You simplify LaTeX syntax to plain text where possible. Return valid JSON only.",
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        }
                    }
                });
            }, "Chuẩn hóa công thức");

            const processedBatch = JSON.parse(response.text);
            
            if (Array.isArray(processedBatch) && processedBatch.length === batch.indices.length) {
                batch.indices.forEach((globalIndex, localIndex) => {
                    standardizedTexts[globalIndex] = processedBatch[localIndex];
                });
            } else {
                console.warn("AI returned mismatched array length for batch. Falling back to original text.");
                batch.indices.forEach((globalIndex, localIndex) => {
                    standardizedTexts[globalIndex] = batch.texts[localIndex];
                });
            }

        } catch (error) {
            console.error("Error standardizing batch, keeping original:", error);
            batch.indices.forEach((globalIndex, localIndex) => {
                standardizedTexts[globalIndex] = batch.texts[localIndex];
            });
        }
        
        completed += batch.indices.length;
        if (onProgress) onProgress(completed, textsToStandardize.length);
        // Small delay to be gentle on rate limits
        await delay(500); 
    }

    return standardizedTexts;
}


export const sendChatMessage = async (
    apiKey: string,
    history: {role: string, parts: {text: string}[]}[],
    message: string
): Promise<string> => {
    if (!apiKey) {
        throw new Error("Vui lòng nhập API Key để sử dụng Chatbot.");
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    // Convert generic history format to Gemini Chat history format
    // Note: Gemini SDK Chat expects 'user' and 'model' roles.
    
    const chat: Chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        history: history,
        config: {
            systemInstruction: "Bạn là trợ lý ảo chuyên biệt cho ứng dụng 'Tạo đề thi theo công văn 7991'. NHIỆM VỤ DUY NHẤT của bạn là hướng dẫn người dùng cách sử dụng các chức năng của phần mềm (Tải file PDF, Cấu hình ma trận, Chỉnh sửa đặc tả, Xuất file). TUYỆT ĐỐI KHÔNG trả lời các câu hỏi kiến thức chung, không làm bài tập hộ, và không tự tạo đề thi trong cửa sổ chat này. Nếu người dùng hỏi ngoài phạm vi hướng dẫn sử dụng, hãy từ chối lịch sự.",
        }
    });

    try {
        const result: GenerateContentResponse = await chat.sendMessage({ message: message });
        return result.text || "Xin lỗi, tôi không thể trả lời câu hỏi này.";
    } catch (error: any) {
        console.error("Chat error:", error);
        throw new Error("Đã xảy ra lỗi khi kết nối với AI.");
    }
}
