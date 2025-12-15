
import { GoogleGenAI, Type, GenerateContentResponse, Chat } from "@google/genai";
import { Topic, QuestionType, CognitiveLevel, Question, GeneratedMatrixResponse, GeneratedTopicConfig, TopicConfig, RateLimitError, questionKeys, SpecTopic, ObjectiveSpec, ApiKeyRequiredError, ExamConfig, InitialAnalysisResult, TocItem, GenerationMode } from '../types';

// IMPORTANT: Throttling Delay to prevent "User has exceeded quota" errors.
// Slightly reduced for paid keys user experience, but still safe.
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Disable all safety settings to prevent false positives blocking generation.
const SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
];

async function attemptWithRetries<T>(ai: GoogleGenAI, apiCall: (ai: GoogleGenAI) => Promise<T>, operationName: string): Promise<T> {
    const maxRetries = 5;
    let lastError: any = new Error(`Thao tác "${operationName}" thất bại mà không có thông tin lỗi cụ thể.`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await apiCall(ai);
        } catch (error: any) {
            lastError = error;
            const errorMessage = (typeof error?.message === 'string') ? error.message : JSON.stringify(error);
            const lowerMsg = errorMessage.toLowerCase();

            // Handle 404/Not Found separately - often confused with invalid key
            if (lowerMsg.includes('requested entity was not found') || lowerMsg.includes('404')) {
                throw new Error("Không tìm thấy Model AI. Có thể dự án Google Cloud của bạn chưa bật Vertex AI API hoặc Model này không khả dụng ở vùng hiện tại.");
            }

            // Key validity check
            if (lowerMsg.includes('api key not valid') || lowerMsg.includes('api_key_invalid')) {
                throw new ApiKeyRequiredError('Khóa API không hợp lệ.');
            }

            let isRateLimitError = false;
            let isNetworkError = false;
            let isServerOverloaded = false;

            // Detect Quota/Rate Limit Errors
            // FIX: Be more specific to avoid catching "Deadline Exceeded" as a quota error.
            if (
                lowerMsg.includes('429') || 
                lowerMsg.includes('resource_exhausted') || 
                lowerMsg.includes('quota')
            ) {
                isRateLimitError = true;
            }
            
            // Only treat "rate limit" or "exceeded" as RateLimitError if context implies it
            if (lowerMsg.includes('rate limit') || (lowerMsg.includes('exceeded') && (lowerMsg.includes('quota') || lowerMsg.includes('limit') || lowerMsg.includes('balance')))) {
                isRateLimitError = true;
            }

            // Server/Network Errors
            if (lowerMsg.includes('503') || lowerMsg.includes('overloaded') || lowerMsg.includes('unavailable')) {
                isServerOverloaded = true;
            }

            if (!isRateLimitError && (lowerMsg.includes('xhr error') || lowerMsg.includes('fetch failed') || lowerMsg.includes('deadline exceeded') || lowerMsg.includes('timeout'))) {
                isNetworkError = true;
                // Explicitly ensure "deadline exceeded" is NOT treated as a rate limit
                isRateLimitError = false; 
            }

            const isRetryable = isRateLimitError || isNetworkError || isServerOverloaded;

            if (isRetryable && attempt < maxRetries) {
                // Exponential backoff with jitter
                const baseDelay = isRateLimitError ? 8000 : 3000; 
                const delayTime = (baseDelay * attempt) + (Math.random() * 2000);
                
                console.warn(`Lỗi ${isRateLimitError ? 'Hạn mức/Quota' : 'Kết nối/Timeout'} trong "${operationName}". Đang đợi ${Math.round(delayTime / 1000)}s để thử lại... (Lần thử ${attempt})`);
                await delay(delayTime);
                continue;
            }
            
            if (isRateLimitError) {
                throw new RateLimitError(`Bạn đã vượt quá hạn mức sử dụng API (Quota Exceeded). Vui lòng thử lại sau hoặc đổi API Key khác.`);
            }
            
            let finalMessage = `Thao tác "${operationName}" thất bại.`;
            if (errorMessage) {
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

    const uniqueKeys = Array.from(new Set(keysToTry));

    for (const key of uniqueKeys) {
        try {
            const ai = new GoogleGenAI({ apiKey: key });
            const result = await attemptWithRetries(ai, apiCallBuilder, operationName);
            onKeyRotated(key);
            return result;
        } catch (error) {
            if (error instanceof ApiKeyRequiredError || error instanceof RateLimitError) {
                const errorType = error instanceof RateLimitError ? "đã hết hạn ngạch" : "không hợp lệ";
                console.warn(`Khóa API ...${key.slice(-4)} ${errorType}. Đang thử khóa tiếp theo.`);
                continue; // Try the next key
            }
            throw error;
        }
    }

    throw new ApiKeyRequiredError(`Tất cả ${uniqueKeys.length} Khóa API đã cung cấp đều không thể sử dụng (Hết hạn ngạch hoặc lỗi). Vui lòng kiểm tra lại.`);
}

function safeParseQuestionsJson(jsonText: string): any[] {
    let cleanText = jsonText.trim();
    try {
        return JSON.parse(cleanText);
    } catch (e) { }

    cleanText = cleanText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');

    try {
        return JSON.parse(cleanText);
    } catch (e) { }

    if (cleanText.startsWith('[')) {
        let endIndex = cleanText.lastIndexOf('}');
        let attempts = 0;
        while (endIndex > 0 && attempts < 50) {
            const attemptStr = cleanText.substring(0, endIndex + 1) + ']';
            try {
                const parsed = JSON.parse(attemptStr);
                if (Array.isArray(parsed)) return parsed;
            } catch (e) { }
            endIndex = cleanText.lastIndexOf('}', endIndex - 1);
            attempts++;
        }
    }
    throw new Error("Không thể phân tích dữ liệu JSON (dữ liệu có thể bị cắt cụt hoặc không hợp lệ).");
}

// Schemas (Keeping them same as before, just ensuring imports are correct)
const analysisResponseSchema = {
    type: Type.OBJECT,
    properties: {
        subjects: { type: Type.ARRAY, items: { type: Type.STRING } },
        examTitle: { type: Type.STRING },
        schoolName: { type: Type.STRING },
        departmentName: { type: Type.STRING }
    },
    required: ['subjects', 'examTitle', 'schoolName', 'departmentName']
};

const tocResponseSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            chapter: { type: Type.STRING },
            lessonName: { type: Type.STRING }
        },
        required: ['chapter', 'lessonName']
    }
};

const questionSchema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING },
    learningObjective: { type: Type.STRING },
    type: { type: Type.STRING, enum: Object.values(QuestionType) },
    level: { type: Type.STRING, enum: Object.values(CognitiveLevel) },
    options: { type: Type.ARRAY, items: { type: Type.STRING } },
    answer: { type: Type.STRING },
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
        topics: { type: Type.ARRAY, items: generatedTopicConfigSchema }
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
        learningObjective: { type: Type.STRING },
        specificCompetency: { type: Type.STRING },
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
        objectives: { type: Type.ARRAY, items: objectiveSpecSchema }
    },
    required: ['id', 'chapter', 'name', 'objectives']
};

export const analyzeDocumentCover = async (keys: string[], onRotate: any, coverImage: string): Promise<InitialAnalysisResult> => {
     const imagePart = { inlineData: { mimeType: 'image/jpeg', data: coverImage } };
     const prompt = `Analyze this document cover. Extract: subjects (array), examTitle (ignore general headers), schoolName, departmentName.`;
     const response: GenerateContentResponse = await withRetry(keys, onRotate, (ai) => {
        return ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }, imagePart] },
            config: { responseMimeType: 'application/json', responseSchema: analysisResponseSchema, safetySettings: SAFETY_SETTINGS }
        });
    }, "Phân tích bìa tài liệu");
    if (!response.text) throw new Error("AI không trả về kết quả.");
    return JSON.parse(response.text.trim());
};

export const extractTableOfContents = async (keys: string[], onRotate: any, images: string[]): Promise<TocItem[]> => {
    const imageParts = images.map(img => ({ inlineData: { mimeType: 'image/jpeg', data: img } }));
    const prompt = `Extract Table of Contents/List of Lessons. Return array of {chapter, lessonName}. Use Vietnamese.`;
    const response: GenerateContentResponse = await withRetry(keys, onRotate, (ai) => {
        return ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }, ...imageParts] },
            config: { responseMimeType: 'application/json', responseSchema: tocResponseSchema, safetySettings: SAFETY_SETTINGS }
        });
    }, "Trích xuất Mục lục");
    if (!response.text) throw new Error("AI không trả về kết quả.");
    const parsed = JSON.parse(response.text.trim());
    return Array.isArray(parsed) ? parsed.map((item: any) => ({ ...item, id: crypto.randomUUID() })) : [];
};

export const generateMatrixFromImages = async (keys: string[], onRotate: any, images: string[], config: ExamConfig, selectedTopics?: TocItem[], mode: GenerationMode = 'generate'): Promise<GeneratedMatrixResponse> => {
    const imageParts = images.map(img => ({ inlineData: { mimeType: 'image/jpeg', data: img } }));
    let scopeInstruction = selectedTopics?.length ? `SELECTED TOPICS:\n${selectedTopics.map(t => `- ${t.chapter}: ${t.lessonName}`).join('\n')}` : 'Analyze all content.';
    
    // Throttling: Wait a bit before big analysis
    await delay(3000);

    const prompt = `
        Create an exam matrix.
        ${scopeInstruction}
        Constraints:
        - Multiple Choice (MC): ${config.mcCount} questions
        - True/False (TF): ${config.tfCount} questions
        - Short Answer (SA): ${config.saCount} questions
        - Essay: ${config.essayCount} questions
        - Difficulty: ${config.difficulty}
        
        CRITICAL DISTRIBUTION RULES:
        - You MUST distribute the questions across topics to match these Cognitive Level percentages as closely as possible:
          * Knowledge (Biết): ${config.knowledgePct}% of total questions
          * Comprehension (Hiểu): ${config.comprehensionPct}% of total questions
          * Application (Vận dụng): ${config.applicationPct}% of total questions
        
        Return JSON matching schema.
    `;
    
    const response: GenerateContentResponse = await withRetry(keys, onRotate, (ai) => {
        return ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }, ...imageParts] },
            config: { responseMimeType: 'application/json', responseSchema: matrixResponseSchema, safetySettings: SAFETY_SETTINGS }
        });
    }, "Tạo Ma trận");

    if (!response.text) throw new Error("AI không trả về kết quả.");
    return JSON.parse(response.text.trim());
};

export const generateSpecification = async (keys: string[], onRotate: any, topics: Topic[]): Promise<SpecTopic[]> => {
    // Throttling
    await delay(3000);

    const prompt = `
        Create detailed exam specification based on this matrix:
        ${JSON.stringify(topics.map(t => ({ id: t.id, chapter: t.chapter, name: t.name, ...questionKeys.reduce((acc, k) => ({...acc, [k]: t[k]}), {}) })))}
        
        CRITICAL INSTRUCTION for "specificCompetency" (Yêu cầu cần đạt):
        For every objective, you MUST explicitly list the requirements for THREE cognitive levels:
        1. "Biết:" (Knowledge)
        2. "Hiểu:" (Comprehension)
        3. "Vận dụng:" (Application)
        
        IMPORTANT: Keep descriptions EXTREMELY CONCISE (under 15 words each). Do NOT write long paragraphs.
        
        Format strictly as follows using newlines:
        "- Biết: [concise text]
         - Hiểu: [concise text]
         - Vận dụng: [concise text]"

        Distribute questions exactly as in matrix.
    `;

    const response: GenerateContentResponse = await withRetry(keys, onRotate, (ai) => {
        return ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: { type: Type.ARRAY, items: specTopicSchema }, safetySettings: SAFETY_SETTINGS }
        });
    }, "Tạo Bản Đặc tả");

    if (!response.text) throw new Error("AI không trả về kết quả.");
    return JSON.parse(response.text.trim());
};

const generateQuestionsForObjective = async (keys: string[], onRotate: any, chapter: string, topicName: string, objective: ObjectiveSpec, subject: string | undefined, onQuestionsGenerated: any, mode: GenerationMode, images: string[]) => {
    const imageParts = images.map(img => ({ inlineData: { mimeType: 'image/jpeg', data: img } }));
    
    // Updated prompt instructions for simple Vietnamese math notation
    const prompt = `
        ${mode === 'extract' ? 'EXTRACT exact questions from images' : 'GENERATE questions'} for:
        Objective: "${objective.learningObjective}"
        Topic: "${topicName}"
        Counts: ${JSON.stringify(objective.counts)}
        
        FORMATTING INSTRUCTIONS:
        - Do NOT use complex LaTeX delimiters like $$, \\(, \\), \\[.
        - For exponents, use the caret symbol ^ (e.g., x^2, m/s^2).
        - For subscripts, use the underscore symbol _ (e.g., H_2O, a_1).
        - Use standard Unicode symbols for math (e.g., ≈, ≤, ≥, π, °, ±, →).
        - Write fractions as a/b (e.g. 1/2, 3/4).
        - Ensure text uses Vietnamese terms and notation styles.
        
        CRITICAL for "Trắc nghiệm Đúng/Sai" (True/False):
        - You MUST generate exactly 4 sub-statements labeled a, b, c, d for every True/False question.
        - Put these 4 statements in the "options" array.
        - The "answer" field MUST strictly list the result for each sub-statement (e.g., "a) Đúng, b) Sai, c) Sai, d) Đúng").

        CRITICAL for "Trắc nghiệm nhiều lựa chọn" (Multiple Choice):
        - The "answer" field MUST BE JUST THE LETTER (A, B, C, or D).
        - The "options" array MUST contain ONLY the content of the answer. DO NOT include prefixes like "A.", "B.", "C.", "D." or "1.", "2.".
        - Example: options: ["7 chu kì", "8 chu kì", ...] NOT ["A. 7 chu kì", "B. 8 chu kì", ...]

        CRITICAL for "Trả lời ngắn" (Short Answer):
        - The "answer" field MUST BE THE FINAL RESULT ONLY (e.g., "5", "-10", "4a^2", "15 cm").
        - DO NOT write full sentences like "Kết quả là...", "Đáp số:". Just the value.
        - Phrase the question so it explicitly asks for a specific value (e.g., "Tính giá trị của...", "Kết quả phép tính là...").

        Return JSON array.
    `;

    const contentPayload = mode === 'extract' ? { parts: [{ text: prompt }, ...imageParts] } : prompt;

    // Critical Throttling for question generation loops
    await delay(4000);

    const response: GenerateContentResponse = await withRetry(keys, onRotate, (ai) => {
        return ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contentPayload,
            config: { responseMimeType: 'application/json', responseSchema: { type: Type.ARRAY, items: questionSchema }, safetySettings: SAFETY_SETTINGS }
        });
    }, `Tạo câu hỏi: ${topicName}`);

    if (!response.text) throw new Error("AI không trả về kết quả.");
    const questions = safeParseQuestionsJson(response.text.trim());
    onQuestionsGenerated(questions.map((q: any) => ({ ...q, id: crypto.randomUUID() })));
};

export const generateAllQuestionsForTopics = async (keys: string[], onRotate: any, topics: Topic[], specification: SpecTopic[], onTopicUpdate: any, mode: GenerationMode, images: string[]) => {
    const topicMap = new Map(topics.map(t => [t.id, t]));
    let masterError: Error | null = null;

    for (const spec of specification) {
        if (masterError) break;
        const originalTopic = topicMap.get(spec.id);
        if (!originalTopic) continue;

        try {
            onTopicUpdate({ ...originalTopic, generationStatus: 'generating', questions: [] });
            let allQs: Question[] = [];
            
            for (const obj of spec.objectives) {
                if (masterError) break;
                // Accumulate questions
                await generateQuestionsForObjective(keys, onRotate, spec.chapter, spec.name, obj, originalTopic.subject, (newQs: Question[]) => {
                    allQs.push(...newQs);
                    onTopicUpdate({ ...originalTopic, questions: [...allQs], generationStatus: 'generating' });
                }, mode, images);
            }
            if (!masterError) onTopicUpdate({ ...originalTopic, questions: allQs, generationStatus: 'completed' });

        } catch (error) {
            console.error(`Error topic ${spec.name}:`, error);
            onTopicUpdate({ ...originalTopic, questions: [], generationStatus: 'failed', generationError: error instanceof Error ? error.message : String(error) });
            if (error instanceof RateLimitError || error instanceof ApiKeyRequiredError) {
                if (!masterError) masterError = error as Error;
            }
        }
    }
    if (masterError) throw masterError;
};

export const sendChatMessage = async (apiKey: string, history: any[], message: string): Promise<string> => {
    if (!apiKey) throw new Error("No API Key");
    const ai = new GoogleGenAI({ apiKey });
    const chat = ai.chats.create({ model: 'gemini-2.5-flash', history, config: { safetySettings: SAFETY_SETTINGS } });
    const res = await chat.sendMessage({ message });
    return (res as GenerateContentResponse).text || "";
};
