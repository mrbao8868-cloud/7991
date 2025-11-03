import React, { useState, useEffect, useRef } from 'react';
import { Topic, SpecTopic, questionKeys, WorkspaceTab, ApiKeyRequiredError, RateLimitError, ExamConfig, TopicConfig, GeneratedMatrixResponse, QuestionType, Question, ObjectiveSpec, GenerationOptions } from '../types';
import { CheckIcon, DocumentArrowDownIcon, DocumentTextIcon, ExclamationTriangleIcon, QuestionMarkCircleIcon, SparkleIcon, KeyIcon, ChevronDownIcon } from './icons';
import { generateAllQuestionsForTopics, generateSpecification, generateMatrixFromImages } from '../services/geminiService';
import MathRenderer from './MathRenderer';

interface ExamWorkspaceProps {
    examConfig: ExamConfig;
    documentImages: string[];
    generationOptions: GenerationOptions | null;
    apiKeys: string[];
    activeApiKey: string | null;
    onBack: () => void;
    onApiKeyError: (message?: string) => void;
    onSetActiveKey: (key: string) => void;
    onOpenApiModal: () => void;
    onStatusUpdate: (message: string) => void;
}

const SmallSpinner: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`animate-spin h-5 w-5 ${className || 'text-primary-600'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const GenerationPlaceholder = ({ icon, title, description, buttonText, onGenerate, isLoading, disabled = false, error, onRetry }: any) => (
    <div className="text-center p-8 sm:p-12 bg-slate-50 rounded-lg shadow-inner min-h-[400px] flex flex-col justify-center items-center">
        {isLoading ? (
             <>
                <div className="relative w-16 h-16">
                    <div className="absolute inset-0 bg-primary-100 rounded-full animate-ping"></div>
                    <div className="relative flex items-center justify-center w-16 h-16 bg-primary-200 rounded-full">
                       {icon || <SparkleIcon className="w-8 h-8 text-primary-600"/>}
                    </div>
                </div>
                <h3 className="text-xl font-semibold text-slate-800 mt-6">{title}</h3>
                <p className="text-slate-500 mt-2 max-w-md">{description}</p>
             </>
        ) : error ? (
             <div className="bg-red-50 border-l-4 border-red-400 p-4 max-w-xl text-left">
                <div className="flex">
                    <div className="flex-shrink-0"><ExclamationTriangleIcon className="h-5 w-5 text-red-400" /></div>
                    <div className="ml-3">
                         <h3 className="text-sm font-semibold text-red-800">Đã xảy ra lỗi</h3>
                        <p className="text-sm text-red-700 mt-1">{error}</p>
                        {onRetry && <div className="mt-4"><button onClick={onRetry} className="text-sm font-medium text-primary-600 hover:text-primary-500">Thử lại</button></div>}
                    </div>
                </div>
            </div>
        ) : (
            <>
                <div className="flex items-center justify-center w-16 h-16 bg-slate-200 rounded-full">
                    {icon || <SparkleIcon className="w-8 h-8 text-slate-500"/>}
                </div>
                <h3 className="text-xl font-semibold text-slate-800 mt-4">{title}</h3>
                <p className="text-slate-500 mt-2 max-w-md">{description}</p>
                {buttonText && onGenerate && (
                    <div className="mt-6">
                        <button onClick={onGenerate} disabled={disabled} className="inline-flex items-center justify-center px-6 py-2.5 border border-transparent text-base font-medium rounded-full shadow-sm text-white bg-primary-600 hover:bg-primary-700 disabled:bg-slate-400 disabled:cursor-not-allowed">
                            <SparkleIcon className="w-5 h-5 mr-2"/>
                            {buttonText}
                        </button>
                    </div>
                )}
            </>
        )}
    </div>
);

const Stepper: React.FC<{ activeTab: WorkspaceTab; matrixDone: boolean; specDone: boolean; questionsDone: boolean; onTabChange: (tab: WorkspaceTab) => void; canAccessSpec: boolean; canAccessQuestions: boolean }> = 
({ activeTab, matrixDone, specDone, questionsDone, onTabChange, canAccessSpec, canAccessQuestions }) => {
    const steps = [
        { id: 'matrix', name: '2. Ma trận', done: matrixDone },
        { id: 'spec', name: '3. Bản đặc tả', done: specDone, disabled: !canAccessSpec },
        { id: 'questions', name: '4. Câu hỏi & Đáp án', done: questionsDone, disabled: !canAccessQuestions }
    ];

    const allSteps = [
         { id: 'analyze', name: '1. Phân tích', done: true },
         ...steps
    ];

    return (
        <nav aria-label="Progress">
            <ol role="list" className="flex items-center">
                {allSteps.map((step, stepIdx) => (
                    <li key={step.name} className={`relative ${stepIdx !== allSteps.length - 1 ? 'pr-8 sm:pr-20' : ''}`}>
                         <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            {stepIdx !== allSteps.length - 1 && <div className={`h-0.5 w-full ${step.done ? 'bg-primary-600' : 'bg-slate-200'}`} />}
                        </div>
                        <button
                            disabled={step.id !== 'analyze' && (step.disabled || !step.done)}
                            onClick={() => onTabChange(step.id as WorkspaceTab)}
                            className={`relative flex h-8 w-8 items-center justify-center rounded-full ${activeTab === step.id ? 'bg-primary-600' : step.done ? 'bg-primary-600 hover:bg-primary-700' : 'bg-slate-300'} disabled:bg-slate-300 disabled:cursor-not-allowed`}
                        >
                            {step.done && activeTab !== step.id ? (
                                <CheckIcon className="h-5 w-5 text-white" />
                            ) : (
                                <span className={`h-2.5 w-2.5 rounded-full ${activeTab === step.id ? 'bg-white' : 'bg-transparent'}`} />
                            )}
                        </button>
                        <p className={`mt-2 text-sm font-semibold ${activeTab === step.id ? 'text-primary-600' : 'text-slate-600'}`}>{step.name}</p>
                    </li>
                ))}
            </ol>
        </nav>
    );
};


const ExamWorkspace: React.FC<ExamWorkspaceProps> = ({ examConfig, documentImages, generationOptions, apiKeys, activeApiKey, onBack, onApiKeyError, onSetActiveKey, onOpenApiModal, onStatusUpdate }) => {
    // Workspace state
    const [examTitle, setExamTitle] = useState('');
    const [topics, setTopics] = useState<Topic[]>([]);
    const [specification, setSpecification] = useState<SpecTopic[] | null>(null);
    const [activeTab, setActiveTab] = useState<WorkspaceTab>('matrix');
    
    // State for generation processes
    const [isGeneratingMatrix, setIsGeneratingMatrix] = useState(true);
    const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);
    const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
    const [matrixError, setMatrixError] = useState<string | null>(null);
    const [specError, setSpecError] = useState<string | null>(null);
    const [questionsError, setQuestionsError] = useState<string | null>(null);

    const printableAreaRef = useRef<HTMLDivElement>(null);
    const allQuestions = topics.flatMap(t => t.questions || []);

    // Auto-generate matrix on component mount
    useEffect(() => {
        handleGenerateMatrix();
    }, []);

    useEffect(() => {
        if (isGeneratingMatrix) {
            onStatusUpdate('AI đang đọc tài liệu và tạo Ma trận chi tiết...');
            return;
        }
        if (isGeneratingSpec) {
            onStatusUpdate('AI đang phân rã chủ đề và tạo Bản đặc tả chi tiết...');
            return;
        }
        if (isGeneratingQuestions) {
            const completedCount = topics.filter(t => t.generationStatus === 'completed').length;
            const totalCount = topics.length;
            const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
            onStatusUpdate(`AI đang soạn câu hỏi... Hoàn thành ${progress}% (${completedCount}/${totalCount} chủ đề)`);
            return;
        }

        switch (activeTab) {
            case 'matrix':
                if (topics.length > 0) {
                    onStatusUpdate('Kiểm tra lại ma trận do AI đề xuất. Bấm "Tiếp tục" để tạo bản đặc tả.');
                } else {
                    onStatusUpdate('Sẵn sàng tạo ma trận từ tài liệu.');
                }
                break;
            case 'spec':
                if (specification) {
                    onStatusUpdate('Kiểm tra lại bản đặc tả. Bấm "Tiếp tục" để soạn câu hỏi.');
                } else {
                    onStatusUpdate('Sẵn sàng tạo bản đặc tả. Bấm "Tạo Bản đặc tả" để AI bắt đầu làm việc.');
                }
                break;
            case 'questions':
                const questionsDone = topics.every(t => t.generationStatus === 'completed');
                if (questionsDone) {
                    onStatusUpdate('Hoàn tất! Xem lại đề thi và đáp án, sau đó có thể tải về dưới dạng .doc.');
                } else if (topics.some(t => t.generationStatus === 'failed')) {
                    onStatusUpdate('Một số chủ đề tạo câu hỏi bị lỗi. Vui lòng thử lại các chủ đề bị lỗi.');
                } else if (topics.some(t => t.generationStatus === 'pending')) {
                     onStatusUpdate('Sẵn sàng soạn câu hỏi. Bấm "Bắt đầu soạn câu hỏi" để AI làm việc.');
                } else {
                     onStatusUpdate('Đã tạo xong câu hỏi cho các chủ đề.');
                }
                break;
            default:
                onStatusUpdate('Sẵn sàng tạo đề thi.');
        }
    }, [isGeneratingMatrix, isGeneratingSpec, isGeneratingQuestions, activeTab, topics, specification, onStatusUpdate]);
    
     const handleGenerateMatrix = async () => {
        if (!activeApiKey) {
            onApiKeyError("Vui lòng chọn một Khóa API để tiếp tục.");
            return;
        }
        setIsGeneratingMatrix(true);
        setMatrixError(null);
        try {
            const keysToTry = [activeApiKey, ...apiKeys.filter(k => k !== activeApiKey)];
            const extractedData = await generateMatrixFromImages(keysToTry, onSetActiveKey, documentImages, examConfig, generationOptions?.scopeHint);
            
            if (!examConfig) return;
            setExamTitle(extractedData.examTitle);
            const topicsFromAI: Topic[] = extractedData.topics.map(t => ({
                mc_knowledge: 0, mc_comprehension: 0, mc_application: 0,
                tf_knowledge: 0, tf_comprehension: 0, tf_application: 0,
                sa_knowledge: 0, sa_comprehension: 0, sa_application: 0,
                essay_knowledge: 0, essay_comprehension: 0, essay_application: 0,
                ...t,
                id: crypto.randomUUID(),
                questions: [],
                generationStatus: 'pending',
            }));
            setTopics(topicsFromAI);
            setActiveTab('matrix');
        } catch (error: unknown) {
            handleGenerationError(error, setMatrixError);
        } finally {
            setIsGeneratingMatrix(false);
        }
    };


    const handleGenerationError = (error: unknown, setErrorState: (message: string) => void) => {
        console.error("Generation failed", error);
        if (error instanceof ApiKeyRequiredError) {
            onApiKeyError(error.message);
        } else if (error instanceof RateLimitError) {
            setErrorState(error.message);
        } else {
            const errorMessage = error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định.";
            setErrorState(errorMessage);
            setTopics(prevTopics => 
                prevTopics.map(t => t.generationStatus === 'generating' ? { ...t, generationStatus: 'failed', generationError: errorMessage } : t)
            );
        }
    };

    const handleGenerateSpec = async () => {
        if (!activeApiKey) {
            onApiKeyError("Vui lòng chọn một Khóa API để tiếp tục.");
            return;
        }
        setIsGeneratingSpec(true);
        setSpecError(null);
        try {
            const keysToTry = [activeApiKey, ...apiKeys.filter(k => k !== activeApiKey)];
            const spec = await generateSpecification(keysToTry, onSetActiveKey, topics);
            setSpecification(spec);
        } catch (error: unknown) {
            handleGenerationError(error, setSpecError);
        } finally {
            setIsGeneratingSpec(false);
        }
    };
    
    const onTopicUpdate = (updatedTopic: Topic) => {
        setTopics(prevTopics => 
            prevTopics.map(t => t.id === updatedTopic.id ? updatedTopic : t)
        );
    };

    const handleGenerateQuestions = async () => {
        if (!specification || !activeApiKey) return;
        setIsGeneratingQuestions(true);
        setQuestionsError(null);
        setTopics(prev => prev.map(t => ({ ...t, generationStatus: 'pending', generationError: undefined })));
        try {
            const keysToTry = [activeApiKey, ...apiKeys.filter(k => k !== activeApiKey)];
            await generateAllQuestionsForTopics(keysToTry, onSetActiveKey, topics, specification, onTopicUpdate);
        } catch (error: unknown) {
            handleGenerationError(error, setQuestionsError);
        } finally {
            setIsGeneratingQuestions(false);
        }
    };
    
    const handleRetryTopic = async (topicId: string) => {
        if (!specification || !activeApiKey) return;

        const topicToRetry = topics.find(t => t.id === topicId);
        const specForTopic = specification.find(s => s.id === topicId);
        if (!topicToRetry || !specForTopic) return;
        
        onTopicUpdate({ ...topicToRetry, generationStatus: 'pending', generationError: undefined });
        setIsGeneratingQuestions(true); // Show a general loading state
        try {
            const keysToTry = [activeApiKey, ...apiKeys.filter(k => k !== activeApiKey)];
            await generateAllQuestionsForTopics(keysToTry, onSetActiveKey, [topicToRetry], [specForTopic], onTopicUpdate);
        } catch (error: unknown) {
            handleGenerationError(error, (msg) => {
                const failedTopic = topics.find(t => t.id === topicId);
                if (failedTopic) {
                     onTopicUpdate({ ...failedTopic, generationStatus: 'failed', generationError: msg });
                }
            });
        } finally {
             setIsGeneratingQuestions(false);
        }
    };

    const handleDownloadXls = (tableId: string, filename: string) => {
        const table = document.getElementById(tableId);
        if (!table) return;

        const template = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <!--[if gte mso 9]>
                <xml>
                    <x:ExcelWorkbook>
                        <x:ExcelWorksheets>
                            <x:ExcelWorksheet>
                                <x:Name>Sheet1</x:Name>
                                <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
                            </x:ExcelWorksheet>
                        </x:ExcelWorksheets>
                    </x:ExcelWorkbook>
                </xml>
                <![endif]-->
                <meta charset="UTF-8">
                <style>
                    table, th, td {
                        border: 1px solid black;
                        border-collapse: collapse;
                    }
                    th, td { padding: 5px; text-align: center; vertical-align: middle; }
                </style>
            </head>
            <body>
                ${table.outerHTML.replace(/<br\s*\/?>/gi, ' ')}
            </body>
            </html>
        `;

        const blob = new Blob([template], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
    
    const handleDownloadDocx = async (contentElementId: string, filename: string) => {
        const contentElement = document.getElementById(contentElementId);
        if (!contentElement) return;

        // 1. Fetch KaTeX CSS to inline it.
        let katexCss = '';
        try {
            const response = await fetch('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css');
            if (response.ok) {
                katexCss = await response.text();
            } else {
                console.warn('Could not fetch KaTeX CSS for DOCX export.');
            }
        } catch (error) {
            console.error('Error fetching KaTeX CSS:', error);
        }

        // 2. The CSS file uses relative paths for fonts, e.g., url(fonts/KaTeX_Main-Regular.woff2).
        //    We need to replace these with absolute URLs so Word can download them.
        const katexCssWithAbsoluteFontPaths = katexCss.replace(
            /url\(fonts\//g, 
            'url(https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/'
        );

        const template = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
                <title>${examTitle || 'Đề thi'}</title>
                <style>
                    /* Inlined and corrected KaTeX CSS */
                    ${katexCssWithAbsoluteFontPaths}

                    /* Document-specific styles */
                    @page WordSection1 {
                        size: 21cm 29.7cm; /* A4 portrait */
                        margin: 2cm 2cm 2cm 2cm;
                        mso-header-margin: .5in;
                        mso-footer-margin: .5in;
                        mso-paper-source: 0;
                    }
                    div.WordSection1 {
                        page: WordSection1;
                    }
                    body {
                        font-family: 'Times New Roman', serif;
                        font-size: 13pt;
                        line-height: 1.5;
                    }
                    table {
                        border-collapse: collapse;
                        width: 100%;
                    }
                    td, th {
                        padding: 4px;
                    }
                    .break-before-page {
                        page-break-before: always;
                    }
                    .break-inside-avoid {
                        page-break-inside: avoid;
                    }
                </style>
            </head>
            <body>
                <div class="WordSection1">
                    ${contentElement.innerHTML}
                </div>
            </body>
            </html>
        `;

        // Use the older .doc format which is more lenient with HTML content.
        // Modern Word will open this in compatibility mode but it's more reliable than the .docx HTML hack.
        const blob = new Blob([template], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Ensure the filename ends with .doc
        const docFilename = filename.endsWith('.doc') ? filename : filename.replace(/\.docx$/, '.doc') || `${filename}.doc`;
        link.download = docFilename;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const renderMatrix = () => {
        const tnkqPointsFromConfig = examConfig.tnkqPoints;
        const essayPointsFromConfig = examConfig.essayPoints;

        const groupedTopics = topics.reduce((acc, topic) => {
            (acc[topic.chapter] = acc[topic.chapter] || []).push(topic);
            return acc;
        }, {} as {[key: string]: Topic[]});
    
        const totals = questionKeys.reduce((acc, key) => ({ ...acc, [key]: 0 }), {} as TopicConfig);
        topics.forEach(t => questionKeys.forEach(k => { totals[k] += t[k]; }));

        const totalTnkqCountInMatrix = (totals.mc_knowledge + totals.mc_comprehension + totals.mc_application) + 
                                     (totals.tf_knowledge + totals.tf_comprehension + totals.tf_application) +
                                     (totals.sa_knowledge + totals.sa_comprehension + totals.sa_application);

        const totalEssayCountInMatrix = totals.essay_knowledge + totals.essay_comprehension + totals.essay_application;

        const tnkqScorePerItem = totalTnkqCountInMatrix > 0 ? tnkqPointsFromConfig / totalTnkqCountInMatrix : 0;
        const essayScorePerItem = totalEssayCountInMatrix > 0 ? essayPointsFromConfig / totalEssayCountInMatrix : 0;
            
        const totalMcQuestions = totals.mc_knowledge + totals.mc_comprehension + totals.mc_application;
        const totalTfQuestions = totals.tf_knowledge + totals.tf_comprehension + totals.tf_application;
        const totalSaQuestions = totals.sa_knowledge + totals.sa_comprehension + totals.sa_application;
    
        const totalMcPoints = totalMcQuestions * tnkqScorePerItem;
        const totalTfPoints = totalTfQuestions * tnkqScorePerItem;
        const totalSaPoints = totalSaQuestions * tnkqScorePerItem;

        const totalTnkqPoints = totalMcPoints + totalTfPoints + totalSaPoints;
        const totalEssayPoints = totalEssayCountInMatrix * essayScorePerItem;
        const actualTotalExamScore = totalTnkqPoints + totalEssayPoints;
    
        const totalKnowPoints = (totals.mc_knowledge + totals.tf_knowledge + totals.sa_knowledge) * tnkqScorePerItem + (totals.essay_knowledge * essayScorePerItem);
        const totalCompPoints = (totals.mc_comprehension + totals.tf_comprehension + totals.sa_comprehension) * tnkqScorePerItem + (totals.essay_comprehension * essayScorePerItem);
        const totalAppPoints = (totals.mc_application + totals.tf_application + totals.sa_application) * tnkqScorePerItem + (totals.essay_application * essayScorePerItem);
    
        const formatPoints = (points: number) => points.toFixed(2).replace('.', ',');
    
        const renderMatrixCell = (count: number, score: number) => {
            if (!count || count === 0) return <td className="border border-slate-300 p-2"></td>;
            return (
                <td className="border border-slate-300 p-2 text-center align-middle" dangerouslySetInnerHTML={{ __html: `${count}<br/>(${formatPoints(score)})` }} />
            );
        };
        
        let chapterIndex = 0;
        return (
            <div>
                <h2 className="text-xl font-bold text-center mb-1 uppercase">A. MA TRẬN ĐỀ KIỂM TRA</h2>
                <h3 className="text-xl font-bold text-center mb-4 uppercase">{examConfig.examTime}</h3>
                <div className="overflow-x-auto">
                    <table id="matrix-table" className="w-full border-collapse border border-slate-400 text-sm">
                        <thead className="align-middle text-center font-semibold bg-slate-50">
                             <tr>
                                <th rowSpan={4} className="border border-slate-300 p-2 w-[3%]">TT</th>
                                <th rowSpan={4} className="border border-slate-300 p-2 w-[10%]">Chủ đề/Chương</th>
                                <th rowSpan={4} className="border border-slate-300 p-2 w-[60%]">Nội dung/đơn vị kiến thức</th>
                                <th colSpan={12} className="border border-slate-300 p-2">Mức độ đánh giá</th>
                                <th colSpan={4} className="border border-slate-300 p-2">Tổng</th>
                            </tr>
                            <tr>
                                <th colSpan={9} className="border border-slate-300 p-2">TNKQ</th>
                                <th colSpan={3} className="border border-slate-300 p-2">Tự luận</th>
                                <th rowSpan={3} className="border border-slate-300 p-2 w-[2%]">Biết</th>
                                <th rowSpan={3} className="border border-slate-300 p-2 w-[2%]">Hiểu</th>
                                <th rowSpan={3} className="border border-slate-300 p-2 w-[2%]">Vận dụng</th>
                                <th rowSpan={3} className="border border-slate-300 p-2 w-[3%]">Tỉ lệ % điểm</th>
                            </tr>
                            <tr>
                                <th colSpan={3} className="border border-slate-300 p-2">Nhiều lựa chọn</th>
                                <th colSpan={3} className="border border-slate-300 p-2">"Đúng-Sai"</th>
                                <th colSpan={3} className="border border-slate-300 p-2">Trả lời ngắn</th>
                                <th colSpan={3} className="border border-slate-300 p-2">Tự luận</th>
                            </tr>
                            <tr>
                                {['Biết','Hiểu','V.dụng'].map((level, i) => <th key={`mc-${i}`} className="border border-slate-300 p-2 w-[1.5%]">{level}</th>)}
                                {['Biết','Hiểu','V.dụng'].map((level, i) => <th key={`tf-${i}`} className="border border-slate-300 p-2 w-[1.5%]">{level}</th>)}
                                {['Biết','Hiểu','V.dụng'].map((level, i) => <th key={`sa-${i}`} className="border border-slate-300 p-2 w-[1.5%]">{level}</th>)}
                                {['Biết','Hiểu','V.dụng'].map((level, i) => <th key={`essay-${i}`} className="border border-slate-300 p-2 w-[1.5%]">{level}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {Object.keys(groupedTopics).map(chapter => {
                                const chapterTopics = groupedTopics[chapter];
                                return (
                                <React.Fragment key={chapter}>
                                    {chapterTopics.map((topic, topicIndex) => {
                                        const knowCount = topic.mc_knowledge + topic.tf_knowledge + topic.sa_knowledge + topic.essay_knowledge;
                                        const knowScore = (topic.mc_knowledge + topic.tf_knowledge + topic.sa_knowledge) * tnkqScorePerItem + (topic.essay_knowledge * essayScorePerItem);
                                        const compCount = topic.mc_comprehension + topic.tf_comprehension + topic.sa_comprehension + topic.essay_comprehension;
                                        const compScore = (topic.mc_comprehension + topic.tf_comprehension + topic.sa_comprehension) * tnkqScorePerItem + (topic.essay_comprehension * essayScorePerItem);
                                        const appCount = topic.mc_application + topic.tf_application + topic.sa_application + topic.essay_application;
                                        const appScore = (topic.mc_application + topic.tf_application + topic.sa_application) * tnkqScorePerItem + (topic.essay_application * essayScorePerItem);
    
                                        const rowTotalScore = knowScore + compScore + appScore;
                                        const rowPercentage = actualTotalExamScore > 0 ? `${Math.round((rowTotalScore / actualTotalExamScore) * 100)}` : '0';
                                        
                                        return (
                                            <tr key={topic.id}>
                                                {topicIndex === 0 && <td rowSpan={chapterTopics.length} className="border border-slate-300 p-2 font-bold text-center align-middle">{++chapterIndex}</td>}
                                                {topicIndex === 0 && <td rowSpan={chapterTopics.length} className="border border-slate-300 p-2 text-left font-semibold align-top">{chapter}</td>}
                                                <td className="border border-slate-300 p-2 text-left align-middle">{topic.name}</td>
                                                {renderMatrixCell(topic.mc_knowledge, topic.mc_knowledge * tnkqScorePerItem)}
                                                {renderMatrixCell(topic.mc_comprehension, topic.mc_comprehension * tnkqScorePerItem)}
                                                {renderMatrixCell(topic.mc_application, topic.mc_application * tnkqScorePerItem)}
                                                {renderMatrixCell(topic.tf_knowledge, topic.tf_knowledge * tnkqScorePerItem)}
                                                {renderMatrixCell(topic.tf_comprehension, topic.tf_comprehension * tnkqScorePerItem)}
                                                {renderMatrixCell(topic.tf_application, topic.tf_application * tnkqScorePerItem)}
                                                {renderMatrixCell(topic.sa_knowledge, topic.sa_knowledge * tnkqScorePerItem)}
                                                {renderMatrixCell(topic.sa_comprehension, topic.sa_comprehension * tnkqScorePerItem)}
                                                {renderMatrixCell(topic.sa_application, topic.sa_application * tnkqScorePerItem)}
                                                {renderMatrixCell(topic.essay_knowledge, topic.essay_knowledge * essayScorePerItem)}
                                                {renderMatrixCell(topic.essay_comprehension, topic.essay_comprehension * essayScorePerItem)}
                                                {renderMatrixCell(topic.essay_application, topic.essay_application * essayScorePerItem)}
                                                {renderMatrixCell(knowCount, knowScore)}
                                                {renderMatrixCell(compCount, compScore)}
                                                {renderMatrixCell(appCount, appScore)}
                                                <td className="border border-slate-300 p-2 text-center align-middle">{rowPercentage}%</td>
                                            </tr>
                                        );
                                    })}
                                </React.Fragment>
                            )})}
                        </tbody>
                         <tfoot className="font-bold text-center bg-slate-50">
                            <tr>
                                <td colSpan={3} className="border border-slate-300 p-2">Tổng số câu</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{totalMcQuestions}</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{totalTfQuestions}</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{totalSaQuestions}</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{totalEssayCountInMatrix}</td>
                                <td className="border border-slate-300 p-2">{totals.mc_knowledge + totals.tf_knowledge + totals.sa_knowledge + totals.essay_knowledge}</td>
                                <td className="border border-slate-300 p-2">{totals.mc_comprehension + totals.tf_comprehension + totals.sa_comprehension + totals.essay_comprehension}</td>
                                <td className="border border-slate-300 p-2">{totals.mc_application + totals.tf_application + totals.sa_application + totals.essay_application}</td>
                                <td className="border border-slate-300 p-2"></td>
                            </tr>
                            <tr>
                                <td colSpan={3} className="border border-slate-300 p-2">Tổng số điểm</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{formatPoints(totalMcPoints)}</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{formatPoints(totalTfPoints)}</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{formatPoints(totalSaPoints)}</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{formatPoints(totalEssayPoints)}</td>
                                <td className="border border-slate-300 p-2">{formatPoints(totalKnowPoints)}</td>
                                <td className="border border-slate-300 p-2">{formatPoints(totalCompPoints)}</td>
                                <td className="border border-slate-300 p-2">{formatPoints(totalAppPoints)}</td>
                                <td className="border border-slate-300 p-2">{formatPoints(actualTotalExamScore)}</td>
                            </tr>
                            <tr>
                                <td colSpan={3} className="border border-slate-300 p-2">Tỉ lệ %</td>
                                <td colSpan={9} className="border border-slate-300 p-2">{actualTotalExamScore > 0 ? Math.round(totalTnkqPoints / actualTotalExamScore * 100) : 0}%</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{actualTotalExamScore > 0 ? Math.round(totalEssayPoints / actualTotalExamScore * 100) : 0}%</td>
                                <td className="border border-slate-300 p-2">{actualTotalExamScore > 0 ? Math.round(totalKnowPoints / actualTotalExamScore * 100) : 0}%</td>
                                <td className="border border-slate-300 p-2">{actualTotalExamScore > 0 ? Math.round(totalCompPoints / actualTotalExamScore * 100) : 0}%</td>
                                <td className="border border-slate-300 p-2">{actualTotalExamScore > 0 ? Math.round(totalAppPoints / actualTotalExamScore * 100) : 0}%</td>
                                <td className="border border-slate-300 p-2">100%</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    };

    const renderSpecification = () => { 
        if (!specification || !Array.isArray(specification)) return null;
        
        const tnkqPointsFromConfig = examConfig.tnkqPoints;
        const essayPointsFromConfig = examConfig.essayPoints;

        const specTotals = questionKeys.reduce((acc, key) => ({ ...acc, [key]: 0 }), {} as TopicConfig);
        specification.forEach(specTopic => {
            if (specTopic?.objectives && Array.isArray(specTopic.objectives)) {
                specTopic.objectives.forEach(obj => {
                    questionKeys.forEach(key => {
                        specTotals[key] += obj.counts[key] || 0;
                    });
                });
            }
        });
        
        const totalTnkqCountFromSpec = (specTotals.mc_knowledge + specTotals.mc_comprehension + specTotals.mc_application) +
                                   (specTotals.tf_knowledge + specTotals.tf_comprehension + specTotals.tf_application) +
                                   (specTotals.sa_knowledge + specTotals.sa_comprehension + specTotals.sa_application);
        
        const tnkqScorePerItem = totalTnkqCountFromSpec > 0 ? tnkqPointsFromConfig / totalTnkqCountFromSpec : 0;

        const mcScore = (specTotals.mc_knowledge + specTotals.mc_comprehension + specTotals.mc_application) * tnkqScorePerItem;
        const tfScore = (specTotals.tf_knowledge + specTotals.tf_comprehension + specTotals.tf_application) * tnkqScorePerItem;
        const saScore = (specTotals.sa_knowledge + specTotals.sa_comprehension + specTotals.sa_application) * tnkqScorePerItem;
        const essayScore = essayPointsFromConfig;
        const totalScore = mcScore + tfScore + saScore + essayScore;
        const formatScore = (score: number) => {
            if (score === 0) return '';
            return Number.isInteger(score) ? String(score) : score.toFixed(2).replace('.', ',');
        };

        const chapterMap = new Map<string, { chapterRowCount: number; topics: Map<string, { topicRowCount: number; objectives: ObjectiveSpec[] }> }>();
        specification.forEach(specTopic => {
            if (!specTopic || !Array.isArray(specTopic.objectives)) return;
            
            if (!chapterMap.has(specTopic.chapter)) chapterMap.set(specTopic.chapter, { chapterRowCount: 0, topics: new Map() });
            const chapterData = chapterMap.get(specTopic.chapter)!;
            if (!chapterData.topics.has(specTopic.name)) chapterData.topics.set(specTopic.name, { topicRowCount: 0, objectives: [] });
            const topicData = chapterData.topics.get(specTopic.name)!;
            topicData.objectives.push(...specTopic.objectives);
        });
        for (const [_, chapterData] of chapterMap) {
            let chapterTotal = 0;
            for (const [_, topicData] of chapterData.topics) {
                if (topicData && Array.isArray(topicData.objectives)) {
                  topicData.topicRowCount = topicData.objectives.length;
                  chapterTotal += topicData.topicRowCount;
                } else {
                  topicData.topicRowCount = 0;
                }
            }
            chapterData.chapterRowCount = chapterTotal;
        }

        let chapterIndex = 0;
        return (
             <div>
                <h2 className="text-xl font-bold text-center mb-1 uppercase">B. BẢN ĐẶC TẢ ĐỀ KIỂM TRA</h2>
                <h3 className="text-xl font-bold text-center mb-4 uppercase">{examConfig.examTime}</h3>
                 <div className="overflow-x-auto">
                    <table id="spec-table" className="w-full border-collapse border border-slate-400 text-sm">
                        <thead className="align-middle text-center font-semibold bg-slate-50">
                             <tr>
                                <th rowSpan={4} className="border border-slate-300 p-2 w-[3%]">TT</th>
                                <th rowSpan={4} className="border border-slate-300 p-2 w-[10%]">Chủ đề/Chương</th>
                                <th rowSpan={4} className="border border-slate-300 p-2 w-[18%]">Nội dung/đơn vị kiến thức</th>
                                <th rowSpan={4} className="border border-slate-300 p-2 w-[23%]">Yêu cầu cần đạt</th>
                                <th rowSpan={4} className="border border-slate-300 p-2 w-[23%]">Năng lực đặc thù</th>
                                <th colSpan={12} className="border border-slate-300 p-2">Số câu hỏi ở các mức độ đánh giá</th>
                            </tr>
                            <tr>
                                <th colSpan={9} className="border border-slate-300 p-2">TNKQ</th>
                                <th colSpan={3} className="border border-slate-300 p-2">Tự luận</th>
                            </tr>
                            <tr>
                                <th colSpan={3} className="border border-slate-300 p-2">Nhiều lựa chọn</th>
                                <th colSpan={3} className="border border-slate-300 p-2">"Đúng-Sai"</th>
                                <th colSpan={3} className="border border-slate-300 p-2">Trả lời ngắn</th>
                                <th colSpan={3} className="border border-slate-300 p-2">Tự luận</th>
                            </tr>
                            <tr>
                                {['Biết','Hiểu','V.dụng'].map((level, i) => <th key={`mc-spec-${i}`} className="border border-slate-300 p-2 w-[1.5%]">{level}</th>)}
                                {['Biết','Hiểu','V.dụng'].map((level, i) => <th key={`tf-spec-${i}`} className="border border-slate-300 p-2 w-[1.5%]">{level}</th>)}
                                {['Biết','Hiểu','V.dụng'].map((level, i) => <th key={`sa-spec-${i}`} className="border border-slate-300 p-2 w-[1.5%]">{level}</th>)}
                                {['Biết','Hiểu','V.dụng'].map((level, i) => <th key={`essay-spec-${i}`} className="border border-slate-300 p-2 w-[1.5%]">{level}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {[...chapterMap.entries()].map(([chapter, chapterData]) => {
                                let isFirstChapterRow = true;
                                return [...chapterData.topics.entries()].map(([topicName, topicData]) => {
                                    let isFirstTopicRow = true;
                                    if (!topicData || !Array.isArray(topicData.objectives)) {
                                        return null;
                                    }
                                    return topicData.objectives.map((objective: ObjectiveSpec) => {
                                        const row = (
                                            <tr key={objective.learningObjective} className="text-center">
                                                {isFirstChapterRow && <td rowSpan={chapterData.chapterRowCount} className="border border-slate-300 p-2 font-bold align-middle">{++chapterIndex}</td>}
                                                {isFirstChapterRow && <td rowSpan={chapterData.chapterRowCount} className="border border-slate-300 p-2 text-left font-semibold align-top">{chapter}</td>}
                                                {isFirstTopicRow && <td rowSpan={topicData.topicRowCount} className="border border-slate-300 p-2 text-left align-top">{topicName}</td>}
                                                <td className="border border-slate-300 p-2 text-left align-middle">{objective.learningObjective}</td>
                                                <td className="border border-slate-300 p-2 text-left align-middle">{objective.specificCompetency}</td>
                                                {questionKeys.map(key => <td key={key} className="border border-slate-300 p-2 align-middle">{objective.counts[key] || ''}</td>)}
                                            </tr>
                                        );
                                        isFirstChapterRow = false; isFirstTopicRow = false; return row;
                                    });
                                });
                            })}
                        </tbody>
                        <tfoot className="font-bold text-center bg-slate-50">
                            <tr>
                                <td colSpan={5} className="border border-slate-300 p-2">Tổng số câu</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{specTotals.mc_knowledge + specTotals.mc_comprehension + specTotals.mc_application}</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{specTotals.tf_knowledge + specTotals.tf_comprehension + specTotals.tf_application}</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{specTotals.sa_knowledge + specTotals.sa_comprehension + specTotals.sa_application}</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{specTotals.essay_knowledge + specTotals.essay_comprehension + specTotals.essay_application}</td>
                            </tr>
                            <tr>
                                <td colSpan={5} className="border border-slate-300 p-2">Tổng số điểm</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{formatScore(mcScore)}</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{formatScore(tfScore)}</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{formatScore(saScore)}</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{formatScore(essayScore)}</td>
                            </tr>
                            <tr>
                                <td colSpan={5} className="border border-slate-300 p-2">Tỉ lệ %</td>
                                <td colSpan={9} className="border border-slate-300 p-2">{totalScore > 0 ? Math.round((mcScore + tfScore + saScore) / totalScore * 100) : '0'}%</td>
                                <td colSpan={3} className="border border-slate-300 p-2">{totalScore > 0 ? Math.round(essayScore / totalScore * 100) : '0'}%</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    };

    const renderExamAndAnswers = () => {
        const tnkqPoints = examConfig.tnkqPoints;
        const essayPoints = examConfig.essayPoints;
        
        const allQuestions = topics.flatMap(t => t.questions || []);

        const mcQuestions = allQuestions.filter(q => q.type === QuestionType.MULTIPLE_CHOICE);
        const tfQuestions = allQuestions.filter(q => q.type === QuestionType.TRUE_FALSE);
        const saQuestions = allQuestions.filter(q => q.type === QuestionType.SHORT_ANSWER);
        const essayQuestions = allQuestions.filter(q => q.type === QuestionType.ESSAY);
        
        const tnkqQuestionCount = mcQuestions.length + tfQuestions.length + saQuestions.length;
        const tnkqScorePerItem = tnkqQuestionCount > 0 ? tnkqPoints / tnkqQuestionCount : 0;
        
        let questionCounter = 0;
        const formatPoints = (points: number) => points.toLocaleString('vi-VN');

        const examPart = (
            <div>
                 <table style={{ width: '100%', border: 'none', fontFamily: 'Times New Roman, serif', fontSize: '13pt' }}>
                    <tbody>
                        <tr>
                            <td style={{ textAlign: 'center', width: '50%', verticalAlign: 'top', paddingBottom: '1em' }}>
                                <div style={{ textTransform: 'uppercase' }}>{examConfig.schoolName}</div>
                                <div style={{ fontWeight: 'bold', textTransform: 'uppercase', borderBottom: '1px solid black', display: 'inline-block', paddingBottom: '2px', minWidth: '200px' }}>{examConfig.departmentName}</div>
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 'bold', width: '50%', verticalAlign: 'top', paddingBottom: '1em' }}>
                                {examConfig.examTime.toUpperCase()}<br />
                                {examConfig.schoolYear.toUpperCase()}<br />
                                MÔN: {examConfig.subjectsSummary.toUpperCase()}<br />
                                <span style={{ fontWeight: 'normal' }}><i>Thời gian làm bài: {examConfig.duration}</i></span>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <table style={{ width: '100%', border: 'none', marginTop: '1.5em', marginBottom: '1.5em', fontFamily: 'Times New Roman, serif', fontSize: '12pt' }}>
                    <tbody>
                        <tr>
                            <td style={{ width: '45%' }}><b>Họ và tên:</b> ............................................................</td>
                            <td style={{ width: '30%' }}><b>Số báo danh:</b> ...........................</td>
                            <td style={{ width: '25%', textAlign: 'left' }}>{examConfig.examCode && <span><b>Mã đề {examConfig.examCode}</b></span>}</td>
                        </tr>
                    </tbody>
                </table>
        
                {(mcQuestions.length + tfQuestions.length + saQuestions.length) > 0 && (
                    <div className="mb-8">
                        <p className="font-bold text-center mb-4 uppercase">A. PHẦN TRẮC NGHIỆM KHÁCH QUAN ({formatPoints(tnkqPoints)} điểm)</p>

                        {mcQuestions.length > 0 && (
                            <div className="mb-6">
                                <p className="font-bold mb-2">I. Trắc nghiệm nhiều lựa chọn</p>
                                {mcQuestions.map(q => (
                                    <div key={q.id} className="mb-4 exam-question">
                                        <p style={{marginBottom: '0.25em'}}><b>Câu {++questionCounter}: </b><MathRenderer content={q.text} /></p>
                                        {Array.isArray(q.options) && q.options.length === 4 && (
                                            <div style={{ paddingLeft: '1em' }}>
                                                <p style={{ display: 'block', marginBottom: '0.25em' }}><b>A. </b><MathRenderer content={q.options[0]} /></p>
                                                <p style={{ display: 'block', marginBottom: '0.25em' }}><b>B. </b><MathRenderer content={q.options[1]} /></p>
                                                <p style={{ display: 'block', marginBottom: '0.25em' }}><b>C. </b><MathRenderer content={q.options[2]} /></p>
                                                <p style={{ display: 'block' }}><b>D. </b><MathRenderer content={q.options[3]} /></p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {tfQuestions.length > 0 && (
                            <div className="mb-6">
                                <p className="font-bold mb-2">II. Câu hỏi đúng sai</p>
                                {tfQuestions.map(q => (
                                    <div key={q.id} className="mb-4 exam-question">
                                        <p style={{marginBottom: '0.25em'}}><b>Câu {++questionCounter}: </b><MathRenderer content={q.text} /></p>
                                        {Array.isArray(q.options) && q.options.length === 4 && (
                                            <div style={{ paddingLeft: '1em' }}>
                                                <p style={{ display: 'block', marginBottom: '0.25em' }}><b>A. </b><MathRenderer content={q.options[0]} /></p>
                                                <p style={{ display: 'block', marginBottom: '0.25em' }}><b>B. </b><MathRenderer content={q.options[1]} /></p>
                                                <p style={{ display: 'block', marginBottom: '0.25em' }}><b>C. </b><MathRenderer content={q.options[2]} /></p>
                                                <p style={{ display: 'block' }}><b>D. </b><MathRenderer content={q.options[3]} /></p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {saQuestions.length > 0 && (
                             <div className="mb-6">
                                <p className="font-bold mb-2">III. Trả lời ngắn</p>
                                {saQuestions.map(q => (
                                     <div key={q.id} className="mb-4 exam-question">
                                        <p><b>Câu {++questionCounter}: </b><MathRenderer content={q.text} /></p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                
                {essayQuestions.length > 0 && (
                     <div className="mb-8">
                        <p className="font-bold text-center mb-2 uppercase">B. PHẦN TỰ LUẬN ({formatPoints(essayPoints)} điểm)</p>
                         {essayQuestions.map(q => (
                            <div key={q.id} className="mb-4 exam-question">
                                <p><b>Câu {++questionCounter}: </b><MathRenderer content={q.text} /></p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
        
        const mcMidpoint = Math.ceil(mcQuestions.length / 2);
        const mcAnswersCol1 = mcQuestions.slice(0, mcMidpoint);
        const mcAnswersCol2 = mcQuestions.slice(mcMidpoint);

        const tfMidpoint = Math.ceil(tfQuestions.length / 2);
        const tfAnswersCol1 = tfQuestions.slice(0, tfMidpoint);
        const tfAnswersCol2 = tfQuestions.slice(tfMidpoint);

        let answerCounter = 0;
    
        const answerPart = (
            <div>
                <h2 className="text-lg font-bold text-center mb-6 uppercase">ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM</h2>
                
                {(mcQuestions.length + tfQuestions.length + saQuestions.length) > 0 && (
                    <div className="mb-8 break-inside-avoid">
                        <p className="font-bold mb-2">A. PHẦN TRẮC NGHIỆM KHÁCH QUAN ({formatPoints(tnkqPoints)} điểm)</p>
                        <p className="mb-4">Mỗi câu trả lời đúng được {tnkqScorePerItem.toFixed(2).replace('.',',')} điểm.</p>
                        
                        {mcQuestions.length > 0 && (
                            <div className="mb-6">
                                <p className="font-semibold mb-2">I. Trắc nghiệm nhiều lựa chọn</p>
                                <div className="flex justify-center space-x-16">
                                    <table className="w-auto border-collapse">
                                        <thead>
                                            <tr>
                                                <th className="border p-2 font-bold">Câu</th>
                                                <th className="border p-2 font-bold">Đáp án</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {mcAnswersCol1.map((q) => (
                                                <tr key={q.id}>
                                                    <td className="border p-2 text-center">{++answerCounter}</td>
                                                    <td className="border p-2 text-center">{q.answer}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {mcAnswersCol2.length > 0 && (
                                        <table className="w-auto border-collapse">
                                            <thead>
                                                <tr>
                                                    <th className="border p-2 font-bold">Câu</th>
                                                    <th className="border p-2 font-bold">Đáp án</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {mcAnswersCol2.map((q) => (
                                                    <tr key={q.id}>
                                                        <td className="border p-2 text-center">{++answerCounter}</td>
                                                        <td className="border p-2 text-center">{q.answer}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        )}

                        {tfQuestions.length > 0 && (
                            <div className="mb-6">
                                <p className="font-semibold mb-2">II. Câu hỏi đúng sai</p>
                                <div className="flex justify-center space-x-16">
                                    <table className="w-auto border-collapse">
                                        <thead>
                                            <tr>
                                                <th className="border p-2 font-bold">Câu</th>
                                                <th className="border p-2 font-bold">Đáp án</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tfAnswersCol1.map((q) => (
                                                <tr key={q.id}>
                                                    <td className="border p-2 text-center">{++answerCounter}</td>
                                                    <td className="border p-2 text-center">{q.answer}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {tfAnswersCol2.length > 0 && (
                                        <table className="w-auto border-collapse">
                                            <thead>
                                                <tr>
                                                    <th className="border p-2 font-bold">Câu</th>
                                                    <th className="border p-2 font-bold">Đáp án</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {tfAnswersCol2.map((q) => (
                                                    <tr key={q.id}>
                                                        <td className="border p-2 text-center">{++answerCounter}</td>
                                                        <td className="border p-2 text-center">{q.answer}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        )}

                         {saQuestions.length > 0 && (
                            <div className="mb-6">
                                <p className="font-semibold mb-2">III. Trả lời ngắn</p>
                                {saQuestions.map((q) => (
                                    <div key={q.id} className="mb-1"><b>Câu {++answerCounter}:</b> <MathRenderer content={q.answer}/></div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
    
                {essayQuestions.length > 0 && (
                     <div className="mb-8">
                        <p className="font-bold mb-2">B. PHẦN TỰ LUẬN ({formatPoints(essayPoints)} điểm)</p>
                         <div className="space-y-4">
                            {essayQuestions.map((q) => {
                                const formattedAnswer = q.answer
                                    .trim()
                                    .split('- ')
                                    .filter(part => part.trim())
                                    .map(part => `- ${part.trim()}`)
                                    .join('<br />');
                                return (
                                 <div key={q.id}>
                                    <p><b>Câu {++answerCounter}:</b></p>
                                    <div className="pl-4"><MathRenderer content={formattedAnswer} /></div>
                                </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );

        return (
            <div>
                <div id="exam-paper-content">
                    {examPart}
                    <div className="text-center font-bold my-10">------- HẾT -------</div>
                </div>
                <div className="break-before-page"></div>
                <div id="answer-key-content">
                    {answerPart}
                </div>
            </div>
        );
    };
    
    const renderTabContent = () => {
        switch (activeTab) {
            case 'matrix': 
                if (isGeneratingMatrix || matrixError) {
                    return <GenerationPlaceholder
                        icon={<DocumentTextIcon className="w-8 h-8 text-slate-500" />}
                        title={isGeneratingMatrix ? "AI đang tạo Ma trận..." : "Lỗi khi tạo Ma trận"}
                        description="AI đang phân tích toàn bộ tài liệu và áp dụng cấu hình của bạn để tạo ra ma trận chi tiết. Quá trình này có thể mất vài phút."
                        isLoading={isGeneratingMatrix}
                        error={matrixError}
                        onRetry={handleGenerateMatrix}
                    />;
                }
                return (
                    <>
                        {renderMatrix()}
                        <div className="mt-8 pt-6 border-t flex justify-end no-print">
                            <button
                                onClick={() => handleDownloadXls('matrix-table', 'Ma_tran_de_thi.xls')}
                                className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-transparent text-base font-medium rounded-full shadow-sm text-white bg-primary-600 hover:bg-primary-700"
                            >
                                <DocumentArrowDownIcon className="w-5 h-5"/>
                                Tải Ma trận (.xls)
                            </button>
                        </div>
                    </>
                );
            case 'spec':
                if (specification) {
                    return (
                        <>
                            {renderSpecification()}
                            <div className="mt-8 pt-6 border-t flex justify-end no-print">
                                <button
                                    onClick={() => handleDownloadXls('spec-table', 'Ban_dac_ta.xls')}
                                    className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-transparent text-base font-medium rounded-full shadow-sm text-white bg-primary-600 hover:bg-primary-700"
                                >
                                    <DocumentArrowDownIcon className="w-5 h-5"/>
                                    Tải Đặc tả (.xls)
                                </button>
                            </div>
                        </>
                    );
                }
                return <GenerationPlaceholder 
                    icon={<DocumentTextIcon className="w-8 h-8 text-slate-500" />}
                    title={isGeneratingSpec ? "AI đang tạo Bản đặc tả..." : "Sẵn sàng tạo Bản đặc tả"}
                    description="AI sẽ phân rã mỗi chủ đề thành các 'Yêu cầu cần đạt' cụ thể và phân bổ số lượng câu hỏi tương ứng."
                    buttonText="Tạo Bản đặc tả"
                    onGenerate={handleGenerateSpec}
                    isLoading={isGeneratingSpec}
                    error={specError}
                    onRetry={handleGenerateSpec}
                />;
            case 'questions':
                const allGeneratedQuestions = topics.flatMap(t => t.questions || []);

                const hasStartedGeneration = topics.some(t => t.generationStatus !== 'pending');
                const questionsDone = topics.length > 0 && topics.every(t => t.generationStatus === 'completed');

                if (!hasStartedGeneration && !isGeneratingQuestions) {
                     return <GenerationPlaceholder 
                        icon={<QuestionMarkCircleIcon className="w-8 h-8 text-slate-500" />}
                        title="Soạn Câu hỏi & Đáp án"
                        description="Dựa trên Bản đặc tả, AI sẽ soạn toàn bộ câu hỏi cho đề thi, bao gồm cả đáp án chi tiết."
                        buttonText="Bắt đầu soạn câu hỏi"
                        onGenerate={handleGenerateQuestions}
                        isLoading={isGeneratingQuestions}
                        disabled={!specification}
                        error={questionsError}
                        onRetry={handleGenerateQuestions}
                    />;
                }
                
                return (
                    <div>
                        {questionsDone ? (
                            <div className='p-4 border border-green-300 bg-green-50 rounded-lg flex items-center space-x-3'>
                                <CheckIcon className="w-6 h-6 text-green-600"/>
                                <div>
                                    <h3 className='font-semibold text-green-800'>Hoàn tất!</h3>
                                    <p className='text-sm text-green-700'>Tất cả câu hỏi đã được tạo. Bạn có thể xem lại và tải về đề thi.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="mb-6">
                                <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3'>
                                    {topics.map(topic => (
                                        <div key={topic.id} className={`p-3 rounded-md border text-sm ${
                                            topic.generationStatus === 'completed' ? 'bg-green-50 border-green-200' :
                                            topic.generationStatus === 'failed' ? 'bg-red-50 border-red-200' :
                                            topic.generationStatus === 'generating' ? 'bg-blue-50 border-blue-200' :
                                            'bg-slate-50 border-slate-200'
                                        }`}>
                                            <p className='font-medium truncate text-slate-800'>{topic.name}</p>
                                            <div className='flex items-center justify-between mt-1'>
                                                <p className='text-xs text-slate-500'>{topic.chapter}</p>
                                                {topic.generationStatus === 'completed' && <span className='text-xs font-semibold text-green-700'>Hoàn thành</span>}
                                                {topic.generationStatus === 'generating' && <div className='flex items-center space-x-1'><SmallSpinner className='w-3 h-3'/><span className='text-xs font-semibold text-blue-700'>Đang tạo...</span></div>}
                                                {topic.generationStatus === 'pending' && <span className='text-xs font-semibold text-slate-600'>Đang chờ</span>}
                                                {topic.generationStatus === 'failed' && 
                                                    <div className='flex items-center space-x-1'>
                                                        <span className='text-xs font-semibold text-red-700'>Thất bại</span>
                                                        <button onClick={() => handleRetryTopic(topic.id)} className='text-xs font-medium text-primary-600 hover:underline'>Thử lại</button>
                                                    </div>
                                                }
                                            </div>
                                             {topic.generationError && <p className='text-xs text-red-600 mt-1 truncate' title={topic.generationError}>{topic.generationError}</p>}
                                        </div>
                                    ))}
                                </div>
                                {questionsError && (
                                    <div className="mt-4 text-sm text-red-600 p-3 bg-red-50 rounded-md">
                                        <p><span className="font-semibold">Lỗi tổng thể:</span> {questionsError}</p>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {questionsDone && (
                             <div className="mt-8 border-t pt-6 flex justify-end">
                                <button
                                    onClick={() => handleDownloadDocx('exam-preview-content', 'De_thi_va_dap_an.docx')}
                                    className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-transparent text-base font-medium rounded-full shadow-sm text-white bg-primary-600 hover:bg-primary-700"
                                >
                                    <DocumentArrowDownIcon className="w-5 h-5"/>
                                    Tải Đề & Đáp án (.doc)
                                </button>
                            </div>
                        )}

                        <div className="mt-6">
                             <div id="exam-preview-content" className="p-6 bg-slate-50/70 rounded-lg border">
                                {allGeneratedQuestions.length > 0 ? (
                                    <div className="preview-container" style={{ fontFamily: "'Times New Roman', serif", fontSize: '13pt', lineHeight: 1.5 }}>
                                        {renderExamAndAnswers()}
                                    </div>
                                ) : (
                                    <div className="text-center py-16">
                                        {isGeneratingQuestions ? (
                                            <>
                                                <SmallSpinner className="mx-auto h-8 w-8 text-primary-500" />
                                                <p className="mt-3 text-slate-500">AI đang soạn câu hỏi, vui lòng đợi...</p>
                                            </>
                                        ) : (
                                            <>
                                                <QuestionMarkCircleIcon className="mx-auto h-12 w-12 text-slate-300" />
                                                <p className="mt-3 text-slate-500">Chưa có câu hỏi nào được tạo.</p>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            default: return null;
        }
    };

    const handleNextTab = () => {
        if (activeTab === 'matrix') {
             setActiveTab('spec');
        } else if (activeTab === 'spec') {
             setActiveTab('questions');
        }
    };
    
    const matrixDone = topics.length > 0;
    const questionsDone = topics.length > 0 && topics.every(t => t.generationStatus === 'completed');

    return (
        <>
         <div className="max-w-7xl mx-auto py-8 space-y-6 px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <h1 className="text-2xl font-bold text-slate-800 uppercase">{examConfig.examTime}</h1>
                 <button onClick={onBack} className="px-4 py-2 border border-slate-300 text-sm font-medium rounded-full shadow-sm text-slate-700 bg-white hover:bg-slate-50 self-start sm:self-center">
                    Tạo đề mới
                </button>
            </div>

            <div className="no-print">
                <Stepper
                    activeTab={activeTab}
                    matrixDone={matrixDone}
                    specDone={!!specification}
                    questionsDone={questionsDone}
                    onTabChange={setActiveTab}
                    canAccessSpec={matrixDone}
                    canAccessQuestions={!!specification}
                />
            </div>
            
             <div className="mt-8 bg-white p-6 sm:p-8 rounded-xl shadow-lg border border-slate-200">
                {renderTabContent()}
             </div>

             <div className="mt-6 flex justify-between items-center no-print">
                <div>
                     {activeTab !== 'matrix' && (
                        <button onClick={() => setActiveTab(activeTab === 'spec' ? 'matrix' : 'spec')} className="px-6 py-2 border border-slate-300 text-sm font-medium rounded-full shadow-sm text-slate-700 bg-white hover:bg-slate-50">
                            Quay lại
                        </button>
                     )}
                </div>
                 <div>
                    {activeTab !== 'questions' && (
                        <button
                            onClick={handleNextTab}
                            disabled={activeTab === 'matrix' ? !matrixDone : !specification}
                            className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-full shadow-sm text-white bg-primary-600 hover:bg-primary-700 disabled:bg-slate-400 disabled:cursor-not-allowed"
                        >
                           Tiếp tục
                        </button>
                    )}
                 </div>
             </div>
        </div>

        {/* This div is for printing content. It's hidden in the normal view. */}
        <div id="printable-area" ref={printableAreaRef} className="hidden print:block">
            <div className="p-4">
                {renderMatrix()}
                <div className="break-before-page"></div>
                {renderSpecification()}
                <div className="break-before-page"></div>
                {allQuestions.length > 0 && (
                     <div className="preview-container" style={{ fontFamily: "'Times New Roman', serif", fontSize: '13pt', lineHeight: 1.5 }}>
                        {renderExamAndAnswers()}
                    </div>
                )}
            </div>
        </div>
        </>
    );
};

export default ExamWorkspace;