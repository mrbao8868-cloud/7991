import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Topic, QuestionType, CognitiveLevel, Question, GeneratedMatrixResponse, GeneratedTopicConfig, TopicConfig, RateLimitError, questionKeys, SpecTopic, ObjectiveSpec, ApiKeyRequiredError, ExamConfig, InitialAnalysisResult } from '../types';

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

const analysisResponseSchema = {
    type: Type.OBJECT,
    properties: {
        subjects: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "An array of subject names found on the cover page. E.g., ['Lịch sử', 'Địa lý']. If only one subject, return an array with one element."
        },
        examTitle: { type: Type.STRING, description: "A suggested exam title based on the document's content. E.g., 'KIỂM TRA GIỮA HỌC KỲ I'" },
        schoolName: { type: Type.STRING, description: "The name of the school found on the page. E.g., 'SỞ GD&ĐT LÀO CAI'" },
        departmentName: { type: Type.STRING, description: "The name of the department or team. E.g., 'TRƯỜNG THPT SỐ 3 BẢO THẮNG'" }
    },
    required: ['subjects', 'examTitle', 'schoolName', 'departmentName']
};

const questionSchema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING, description: 'The question text in Vietnamese.' },
    learningObjective: { type: Type.STRING, description: 'The specific learning objective ("Yêu cầu cần đạt") this question assesses, in Vietnamese. Must match the requested objective.' },
    type: { type: Type.STRING, enum: Object.values(QuestionType), description: 'The type of question.' },
    level: { type: Type.STRING, enum: Object.values(CognitiveLevel), description: 'The cognitive level of the question.' },
    options: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'An array of EXACTLY 4 options (A, B, C, D) for multiple choice questions. For other question types, this MUST be an empty array.'
    },
    answer: { type: Type.STRING, description: 'The correct answer. For multiple choice, it should be the letter (e.g., "A"). For True/False, it should be "Đúng" or "Sai". For essays/short answer, provide a brief model answer or key points.' },
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
        counts: objectiveCountsSchema
    },
    required: ['learningObjective', 'counts']
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
        2.  'examTitle': Suggest a suitable exam title. It is usually written in uppercase at the top. For example, 'KIỂM TRA GIỮA HỌC KỲ I'.
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


export const generateMatrixFromImages = async (
    keysToTry: string[],
    onKeyRotated: (newKey: string) => void,
    images: string[],
    config: ExamConfig,
    scopeHint?: string
): Promise<GeneratedMatrixResponse> => {
    const imageParts = images.map(imgBase64 => ({
        inlineData: {
            mimeType: 'image/jpeg',
            data: imgBase64,
        },
    }));

    const scopeInstruction = scopeHint
        ? `The user has provided a strict focus for this analysis. You MUST EXCLUSIVELY analyze content related to: "${scopeHint}". Any chapters, lessons, or topics present in the images that do NOT fall under this scope must be completely IGNORED. Your entire output must be confined to this scope. This is the most critical instruction.`
        : 'You are to analyze all content present in the provided document images.';

    const multiSubjectInstruction = config.isMultiSubject && config.subjectAllocations
        ? `This is a multi-subject exam. You must distribute the questions and points according to the following allocation: ${config.subjectAllocations.map(s => `${s.subjectName}: ${s.percentage}%`).join(', ')}. When you identify a topic, you MUST assign it to the correct subject in the 'subject' field.`
        : `This is a single-subject exam for ${config.subjectsSummary}. All topics should be assigned to this subject.`;
    
    const totalTnkqCount = config.mcCount + config.tfCount + config.saCount;
    const tnkqPointPerQuestion = totalTnkqCount > 0 ? config.tnkqPoints / totalTnkqCount : 0;
    const essayPointPerQuestion = config.essayCount > 0 ? config.essayPoints / config.essayCount : 0;

    const prompt = `
        You are an expert AI assistant for Vietnamese educators, specializing in curriculum design and exam matrix creation. Your task is to analyze the provided document images and create a detailed exam matrix.

        **PRIMARY INSTRUCTION: SCOPE OF ANALYSIS**
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
        3.  Within the defined scope, identify the main chapters. For each chapter, extract the titles of ALL individual lessons or large sections within it. Each of these lesson/section titles will become a "Nội dung/đơn vị kiến thức".
        4.  CRITICAL RULE: You MUST identify and list EVERY single lesson found within the document for the relevant chapters (respecting the scope). Do not skip or combine lessons. The names for chapters and lesson titles MUST be extracted as verbatim as possible from the document.
        5.  For each topic, assign it to the correct subject in the 'subject' field (e.g., "Lịch sử", "Địa lí").
        6.  Distribute the EXACT specified number of questions for each type across the extracted topics and cognitive levels ('knowledge', 'comprehension', 'application').
        7.  The NUMBER of questions for every specific type and level (e.g., 'mc_knowledge') MUST be an INTEGER.
        8.  The sum of all 'mc_knowledge', 'mc_comprehension', and 'mc_application' counts across all topics MUST equal EXACTLY ${config.mcCount}.
        9.  The sum of all 'tf_knowledge', 'tf_comprehension', and 'tf_application' counts across all topics MUST equal EXACTLY ${config.tfCount}.
        10. The sum of all 'sa_knowledge', 'sa_comprehension', and 'sa_application' counts across all topics MUST equal EXACTLY ${config.saCount}.
        11. The sum of all 'essay_knowledge', 'essay_comprehension', and 'essay_application' counts across all topics MUST equal EXACTLY ${config.essayCount}.
        12. The distribution of points across the cognitive levels AND subjects should be as close as possible to the specified percentages. For calculation, assume each TNKQ question is worth ${tnkqPointPerQuestion.toFixed(3)} points and each Essay question is worth ${essayPointPerQuestion.toFixed(3)} points.
        13. Return a single JSON object containing the exam title and an array of topic objects. Each topic object must contain the integer counts for all 12 question type/level combinations (e.g., 'mc_knowledge'). Ensure all 12 count fields and the 'subject' field are present for each topic.
    `;
    
    const response: GenerateContentResponse = await withRetry(keysToTry, onKeyRotated, (ai) => {
        return ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: { parts: [{ text: prompt }, ...imageParts] },
            config: {
                systemInstruction: 'You are an expert AI curriculum designer for Vietnamese education. Your primary function is to generate a valid and logical exam matrix based on source material and strict constraints. All text output must be in Vietnamese.',
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
    const prompt = `
        You are an expert in Vietnamese curriculum design. Your task is to create a detailed exam specification ("Bản đặc tả") based on the provided exam matrix.
        For each topic provided, you must:
        1. Break down the topic into specific, detailed learning objectives ("Yêu cầu cần đạt"). There can be one or more objectives per topic.
        2. Distribute the required number of questions for that topic among the learning objectives you've created.
        3. The total number of questions for each type/level, when summed across all objectives within a topic, MUST EXACTLY MATCH the numbers provided for that topic in the input. Do not add or remove any questions.

        Here is the exam matrix data:
        ${JSON.stringify(topics.map(t => ({
            id: t.id,
            chapter: t.chapter,
            name: t.name,
            ...questionKeys.reduce((acc, key) => ({ ...acc, [key]: t[key] }), {})
        })))}

        Return a single JSON array of SpecTopic objects.
    `;

    const response: GenerateContentResponse = await withRetry(keysToTry, onKeyRotated, (ai) => {
        return ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: {
                systemInstruction: "You are an expert AI assistant for Vietnamese educators. Your task is to create a detailed and accurate exam specification based on a provided matrix. You must strictly follow the question counts and return a valid JSON array as per the schema.",
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
    onQuestionsGenerated: (questions: Question[]) => void
): Promise<void> => {
    const questionRequests: string[] = [];
    let totalQuestionsToGenerate = 0;

    for (const key of questionKeys) {
        const count = objective.counts[key] || 0;
        if (count > 0) {
            const [typeKey, levelKey] = key.split('_');
            const typeMap: { [key: string]: string } = { mc: "Trắc nghiệm nhiều lựa chọn", tf: "Trắc nghiệm Đúng/Sai", sa: "Trả lời ngắn", essay: "Tự luận" };
            const levelMap: { [key: string]: string } = { knowledge: "Biết", comprehension: "Hiểu", application: "Vận dụng" };
            questionRequests.push(`${count} câu hỏi loại "${typeMap[typeKey]}" ở mức độ "${levelMap[levelKey]}"`);
            totalQuestionsToGenerate += count;
        }
    }

    if (totalQuestionsToGenerate === 0) {
        return;
    }

    const prompt = `
        Chapter: "${chapter}"
        Topic: "${topicName}"
        Learning Objective: "${objective.learningObjective}"

        Based on the above context, generate a single JSON array containing a total of ${totalQuestionsToGenerate} questions that SPECIFICALLY assess this learning objective. The required questions are:
        - ${questionRequests.join('\n- ')}

        CRITICAL GUIDELINES FOR EACH QUESTION:
        - The question text MUST be in Vietnamese.
        - The 'learningObjective' field in the JSON response for each question MUST EXACTLY match "${objective.learningObjective}".
        - CRITICAL: For ALL mathematical expressions (fractions, exponents, roots, symbols, etc.), you MUST use standard LaTeX syntax enclosed in \\(...\\) for inline math. This applies to the 'text', 'options', and 'answer' fields.
        - IMPORTANT: The backslashes in the delimiters MUST be correctly escaped for the final JSON output. A correct JSON value would be "Giá trị của x là \\(x = \\sqrt{4}\\)".
          - Example for a fraction: "phép tính \\(-\\frac{3}{8} + \\frac{5}{6}\\)"
          - Example for an exponent: "tính \\((\\frac{-1}{2})^3\\)"
          - Example for absolute value: "Cho \\(|a| = -(-\\frac{2}{5})\\)"
          - Example for square root: "tính \\(\\sqrt{12} + \\sqrt{27} - \\sqrt{3}\\)"
        - IMPORTANT: Do NOT use LaTeX for simple numbers in a sentence (e.g., "Câu 1", "3,0 điểm", "năm 2024"). Only use it for mathematical formulas.
        - For Multiple Choice questions, the 'options' field MUST be an array with EXACTLY 4 distinct strings. The 'answer' field MUST be the letter of the correct option (e.g., "A").
        - For True/False, the answer must be "Đúng" or "Sai".
        - For Short Answer, provide a concise model answer.
        - For Essay questions, provide a detailed model answer. The answer MUST be structured as a list of bullet points (using '-'). Each bullet point should represent a key idea or a part of the solution. You MUST suggest a reasonable point value for each bullet point, formatted like this: "- [Nội dung chính] (0.25 điểm)".
        - The final JSON array should contain exactly ${totalQuestionsToGenerate} question objects.

        Return a single JSON array containing all the generated question objects.
    `;

    const response: GenerateContentResponse = await withRetry(keysToTry, onKeyRotated, (ai) => {
        return ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: {
                systemInstruction: "You are an expert in creating educational materials for Vietnamese schools. You will generate a batch of questions based on a specific learning objective. All content must be in Vietnamese and strictly adhere to the requested JSON schema and question counts.",
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: questionSchema
                }
            }
        });
    }, `Tạo ${totalQuestionsToGenerate} câu hỏi cho mục tiêu "${objective.learningObjective}"`);

    const jsonText = response.text.trim();
    const parsedQuestions = JSON.parse(jsonText);

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
    onTopicUpdate: (updatedTopic: Topic) => void
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
                
                await generateQuestionsForObjective(keysToTry, onKeyRotated, spec.chapter, spec.name, obj, onQuestionsGenerated);
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