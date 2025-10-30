export enum QuestionType {
  MULTIPLE_CHOICE = 'Trắc nghiệm nhiều lựa chọn',
  TRUE_FALSE = 'Trắc nghiệm Đúng/Sai',
  SHORT_ANSWER = 'Trả lời ngắn',
  ESSAY = 'Tự luận',
}

export enum CognitiveLevel {
  KNOWLEDGE = 'Biết',
  COMPREHENSION = 'Hiểu',
  APPLICATION = 'Vận dụng',
}

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  level: CognitiveLevel;
  learningObjective: string; // Yêu cầu cần đạt
  options?: string[];
  answer: string;
}

export interface TopicConfig {
  mc_knowledge: number;
  mc_comprehension: number;
  mc_application: number;
  tf_knowledge: number;
  tf_comprehension: number;
  tf_application: number;
  sa_knowledge: number; // Short Answer
  sa_comprehension: number;
  sa_application: number;
  essay_knowledge: number;
  essay_comprehension: number;
  essay_application: number;
}

export const questionKeys: (keyof TopicConfig)[] = [
    'mc_knowledge', 'mc_comprehension', 'mc_application',
    'tf_knowledge', 'tf_comprehension', 'tf_application',
    'sa_knowledge', 'sa_comprehension', 'sa_application',
    'essay_knowledge', 'essay_comprehension', 'essay_application',
];

export interface GeneratedTopicConfig {
  chapter: string;
  name: string;
  mc_knowledge?: number;
  mc_comprehension?: number;
  mc_application?: number;
  tf_knowledge?: number;
  tf_comprehension?: number;
  tf_application?: number;
  sa_knowledge?: number;
  sa_comprehension?: number;
  sa_application?: number;
  essay_knowledge?: number;
  essay_comprehension?: number;
  essay_application?: number;
}

export interface Topic extends TopicConfig {
  id: string;
  chapter: string;
  name: string;
  questions: Question[];
  generationStatus: 'pending' | 'generating' | 'completed' | 'failed';
  generationError?: string;
}

export interface GeneratedMatrixResponse {
    examTitle: string;
    topics: GeneratedTopicConfig[];
}

export interface GenerationOptions {
    startPage?: number;
    endPage?: number;
    scopeHint?: string;
}

export class RateLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RateLimitError';
    }
}

export class ApiKeyRequiredError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ApiKeyRequiredError';
    }
}


// New types for the Specification
export interface ObjectiveSpec {
  learningObjective: string;
  counts: Partial<TopicConfig>;
}

export interface SpecTopic {
  id: string;
  chapter: string;
  name: string;
  objectives: ObjectiveSpec[];
}

export type WorkspaceTab = 'analyze' | 'matrix' | 'spec' | 'questions';

export interface ExamConfig {
    schoolName: string;
    departmentName: string;
    subject: string;
    schoolYear: string;
    examCode?: string;
    examTime: string;
    duration: string;
    mcPoints: number;
    essayPoints: number;
    knowledgePct: number;
    comprehensionPct: number;
    applicationPct: number;
}