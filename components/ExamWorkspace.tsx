

import React, { useState, useEffect, useRef } from 'react';
import { Topic, SpecTopic, questionKeys, WorkspaceTab, ApiKeyRequiredError, RateLimitError, ExamConfig, TopicConfig, GeneratedMatrixResponse, QuestionType, Question, ObjectiveSpec, GenerationOptions } from '../types';
import { CheckIcon, DocumentArrowDownIcon, DocumentTextIcon, ExclamationTriangleIcon, QuestionMarkCircleIcon, SparkleIcon, KeyIcon, ChevronDownIcon, DocumentArrowUpIcon } from './icons';
import { generateAllQuestionsForTopics, generateSpecification, generateMatrixFromImages, standardizeExamContent } from '../services/geminiService';
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

// Declare global katex for TS
declare global {
    interface Window {
        katex: any;
        KATE_IS_READY?: boolean;
    }
}

const SmallSpinner: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`animate-spin h-5 w-5 ${className || 'text-primary-600'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const GenerationPlaceholder = ({ icon, title, description, buttonText, onGenerate, isLoading, disabled = false, error, onRetry, progress }: any) => (
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
                {progress !== undefined && (
                     <div className="w-64 mt-4 bg-slate-200 rounded-full h-2.5 dark:bg-slate-300">
                        <div className="bg-primary-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                         <p className="text-xs text-slate-500 mt-1 text-right">{Math.round(progress)}%</p>
                    </div>
                )}
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

const Stepper: React.FC<{ activeTab: WorkspaceTab; matrixDone: boolean; specDone: boolean; questionsDone: boolean; onTabChange: (tab: WorkspaceTab) => void; canAccessSpec: boolean; canAccessQuestions: boolean, exportStepName: string }> = 
({ activeTab, matrixDone, specDone, questionsDone, onTabChange, canAccessSpec, canAccessQuestions, exportStepName }) => {
    const steps = [
        { id: 'matrix', name: '2. Tạo ma trận', done: matrixDone },
        { id: 'spec', name: '3. Bản đặc tả', done: specDone, disabled: !canAccessSpec },
        { id: 'questions', name: '4. Đề thi', done: questionsDone, disabled: !canAccessQuestions },
        { id: 'export', name: exportStepName, done: false, disabled: !questionsDone }
    ];

    const allSteps = [
         { id: 'analyze', name: '1. Chọn nội dung', done: true },
         ...steps
    ];

    return (
        <nav aria-label="Progress">
            <ol role="list" className="flex items-center flex-wrap gap-y-4">
                {allSteps.map((step, stepIdx) => (
                    <li key={step.name} className={`relative flex items-center ${stepIdx !== allSteps.length - 1 ? 'pr-4 sm:pr-8 lg:pr-12' : ''}`}>
                        <button
                            disabled={step.id !== 'analyze' && (step.disabled || (step.id !== activeTab && !step.done))}
                            onClick={() => onTabChange(step.id as WorkspaceTab)}
                            className={`flex items-center group focus:outline-none disabled:cursor-not-allowed`}
                        >
                            <span className={`flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-full ${activeTab === step.id ? 'bg-primary-600' : step.done ? 'bg-primary-600 group-hover:bg-primary-700' : 'bg-slate-300'}`}>
                                {step.done && activeTab !== step.id ? (
                                    <CheckIcon className="h-5 w-5 text-white" />
                                ) : (
                                    <span className={`h-2.5 w-2.5 rounded-full ${activeTab === step.id ? 'bg-white' : 'bg-transparent'}`} />
                                )}
                            </span>
                            <span className={`ml-3 text-sm font-semibold whitespace-nowrap ${activeTab === step.id ? 'text-primary-600' : 'text-slate-600'}`}>{step.name}</span>
                        </button>
                         {stepIdx !== allSteps.length - 1 && (
                            <div className="hidden sm:block absolute top-0 right-0 h-full w-5" aria-hidden="true">
                                <svg
                                    className="h-full w-full text-slate-300"
                                    viewBox="0 0 22 80"
                                    fill="none"
                                    preserveAspectRatio="none"
                                >
                                    <path
                                        d="M0 -2L20 40L0 82"
                                        vectorEffect="non-scaling-stroke"
                                        stroke="currentcolor"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </div>
                         )}
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
    
    // State for Exporting
    const [isExporting, setIsExporting] = useState(false);
    const [previewHtml, setPreviewHtml] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0); // Trigger for re-rendering formulas

    // New state for intermediate processing
    const [isProcessingFormulas, setIsProcessingFormulas] = useState(false);
    const [formulaProgress, setFormulaProgress] = useState(0);

    const [matrixError, setMatrixError] = useState<string | null>(null);
    const [specError, setSpecError] = useState<string | null>(null);
    const [questionsError, setQuestionsError] = useState<string | null>(null);

    const [katexReady, setKatexReady] = useState(false);

    const printableAreaRef = useRef<HTMLDivElement>(null);
    const allQuestions = topics.flatMap(t => t.questions || []);

    const isStem = ['toán', 'lý', 'lí', 'hóa', 'vật lí', 'vật lý', 'hóa học', 'khoa học tự nhiên'].some(s => examConfig.subjectsSummary.toLowerCase().includes(s));
    // Changed to "Xem & Tải về"
    const exportStepName = '5. Xem & Tải về';

    // Auto-generate matrix on component mount
    useEffect(() => {
        handleGenerateMatrix();
    }, []);

    // Listen for KaTeX readiness
    useEffect(() => {
        if (window.KATE_IS_READY) {
            setKatexReady(true);
        } else {
            const handleReady = () => setKatexReady(true);
            document.addEventListener('katex-ready', handleReady);
            return () => document.removeEventListener('katex-ready', handleReady);
        }
    }, []);

    // Generate HTML whenever activeTab is export or topics change (and not processing)
    useEffect(() => {
        if (activeTab === 'export' && !isProcessingFormulas) {
             const html = generateExamHtmlContent();
             setPreviewHtml(html);
        }
    }, [activeTab, topics, examConfig, katexReady, refreshTrigger, isProcessingFormulas]);

    useEffect(() => {
        if (isGeneratingMatrix) {
            onStatusUpdate('AI đang tạo Ma trận chi tiết dựa trên nội dung bạn đã chọn...');
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
            onStatusUpdate(`AI đang soạn đề thi... Hoàn thành ${progress}% (${completedCount}/${totalCount} chủ đề)`);
            return;
        }
        if (isProcessingFormulas) {
            onStatusUpdate(`Đang rà soát và chuẩn hóa công thức với AI... (${Math.round(formulaProgress)}%)`);
            return;
        }
        if (isExporting) {
             onStatusUpdate('Đang tạo và tải xuống file Word...');
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
                    onStatusUpdate('Kiểm tra lại bản đặc tả. Bấm "Tiếp tục" để soạn đề thi.');
                } else {
                    onStatusUpdate('Sẵn sàng tạo bản đặc tả. Bấm "Tạo Bản đặc tả" để AI bắt đầu làm việc.');
                }
                break;
            case 'questions':
                const questionsDone = topics.every(t => t.generationStatus === 'completed');
                if (questionsDone) {
                    onStatusUpdate('Hoàn tất! Bấm "Tiếp tục" để chuẩn hóa công thức và xem trước.');
                } else if (topics.some(t => t.generationStatus === 'failed')) {
                    onStatusUpdate('Một số chủ đề tạo câu hỏi bị lỗi. Vui lòng thử lại các chủ đề bị lỗi.');
                } else if (topics.some(t => t.generationStatus === 'pending')) {
                     onStatusUpdate('Sẵn sàng soạn đề thi. Bấm "Bắt đầu soạn câu hỏi" để AI làm việc.');
                } else {
                     onStatusUpdate('Đã tạo xong câu hỏi cho các chủ đề.');
                }
                break;
             case 'export':
                onStatusUpdate('Bạn có thể Copy trực tiếp nội dung vào Word hoặc tải file .doc');
                break;
            default:
                onStatusUpdate('Sẵn sàng tạo đề thi.');
        }
    }, [isGeneratingMatrix, isGeneratingSpec, isGeneratingQuestions, isExporting, isProcessingFormulas, formulaProgress, activeTab, topics, specification, onStatusUpdate]);
    
     const handleGenerateMatrix = async () => {
        if (!activeApiKey) {
            onApiKeyError("Vui lòng chọn một Khóa API để tiếp tục.");
            return;
        }
        setIsGeneratingMatrix(true);
        setMatrixError(null);
        try {
            // Prepare keys list: Active key first, then others
            const keysToTry = [activeApiKey, ...apiKeys.filter(k => k !== activeApiKey)];
            
            const mode = generationOptions?.mode || 'generate';
            const extractedData = await generateMatrixFromImages(keysToTry, onSetActiveKey, documentImages, examConfig, generationOptions?.selectedTopics, mode);
            
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
            const mode = generationOptions?.mode || 'generate';
            // If extracting, we pass the images so the service can read them.
            const imagesToPass = mode === 'extract' ? documentImages : [];
            await generateAllQuestionsForTopics(keysToTry, onSetActiveKey, topics, specification, onTopicUpdate, mode, imagesToPass);
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
            const mode = generationOptions?.mode || 'generate';
             const imagesToPass = mode === 'extract' ? documentImages : [];
            await generateAllQuestionsForTopics(keysToTry, onSetActiveKey, [topicToRetry], [specForTopic], onTopicUpdate, mode, imagesToPass);
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

    // --- Helper to convert LaTeX to MathML for Word Doc Export ---
    const convertLatexToMathML = (text: string) => {
        if (!text) return '';
        if (!window.katex) return text;
        
        let processed = text;
        
        // 1. Force fix common malformed delimiters from AI (space fix)
        processed = processed.replace(/\\\s+\(/g, '\\('); 
        processed = processed.replace(/\\\s+\)/g, '\\)');
        processed = processed.replace(/\\\s+\[/g, '\\['); 
        processed = processed.replace(/\\\s+\]/g, '\\]');
        // Fix weird \ce spacing like "\ ce" -> "\ce"
        processed = processed.replace(/\\\s+ce/g, '\\ce'); 

        const render = (tex: string, display: boolean) => {
            try {
                 // Clean up newlines which can break KaTeX
                 let cleanTex = tex.replace(/\n/g, ' ').trim();
                 // Unescape any HTML entities if present
                 cleanTex = cleanTex.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
                 
                 const mathML = window.katex.renderToString(cleanTex, {
                    throwOnError: false,
                    output: 'mathml', // Force MathML output
                    displayMode: display,
                    trust: true, 
                    strict: false,
                    // Ensure mhchem is working implicitly, but if not, simple fallback
                    macros: { "\\ce": "\\mathrm" } 
                });

                // CLEANUP FOR WORD COMPATIBILITY
                
                // 1. Remove the entire <annotation>...</annotation> block. 
                let clean = mathML.replace(/<annotation[\s\S]*?<\/annotation>/g, '');
                
                // 2. Remove <semantics> tags but keep their inner content
                clean = clean.replace(/<\/?semantics>/g, '');
                
                // 3. Remove attributes that Word hates (class, style)
                // Remove ALL attributes from ANY tag, except xmlns
                // Strategy: find a tag start <tagname ...> and strip ...
                // Regex: <([a-zA-Z]+)\s+[^>]*> -> <$1>
                // But we need to preserve xmlns in <math>
                
                // First, clean generic tags
                clean = clean.replace(/<([a-z]+)\s+[^>]*?>/g, (match, tagName) => {
                    if (tagName === 'math') return match; // Handle math separately
                    return `<${tagName}>`;
                });

                // Clean <math> specifically: ensure xmlns, remove class/style
                if (clean.includes('<math')) {
                     // Rebuild math tag
                     clean = clean.replace(/<math[^>]*>/, '<math xmlns="http://www.w3.org/1998/Math/MathML">');
                }

                return clean;
            } catch (e) {
                // If rendering fails, return LaTeX wrapped so user can see it
                return display ? `\\[${tex}\\]` : `\\(${tex}\\)`; 
            }
        };
        
        // Replace Display Math $$...$$
        processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (m, t) => render(t, true));
        
        // Replace Display Math \[...\]
        processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (m, t) => render(t, true));
        
        // Replace Inline Math \(...\)
        processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (m, t) => render(t, false));
        
        // Replace Inline Math $...$ (careful not to match currency)
        processed = processed.replace(/\$([^\$\n]+?)\$/g, (m, t) => {
            // Only render if it looks like math (has =, ^, _, \, or numbers)
            if (/[=\^_{}\\]/.test(t) || /\d/.test(t) || t.includes('\\ce')) { 
                 return render(t, false);
            }
            return m;
        });

        // Convert newlines to breaks for HTML display
        return processed.replace(/\n/g, '<br/>');
    };

    const generateExamHtmlContent = () => {
        if (!examConfig || topics.length === 0) return '';
        
        const tnkqPoints = examConfig.tnkqPoints;
        const essayPoints = examConfig.essayPoints;
        
        const mcQuestions = allQuestions.filter(q => q.type === QuestionType.MULTIPLE_CHOICE);
        const tfQuestions = allQuestions.filter(q => q.type === QuestionType.TRUE_FALSE);
        const saQuestions = allQuestions.filter(q => q.type === QuestionType.SHORT_ANSWER);
        const essayQuestions = allQuestions.filter(q => q.type === QuestionType.ESSAY);
        
        let questionCounter = 0;
        let answerCounter = 0; 
        
        const formatPoints = (points: number) => points.toLocaleString('vi-VN');

        let htmlContent = '';

        htmlContent += `
            <table style="width: 100%; border: none; font-family: 'Times New Roman', serif; font-size: 13pt;">
                <tr>
                    <td style="text-align: center; width: 50%; vertical-align: top;">
                        <div style="text-transform: uppercase;">${examConfig.schoolName}</div>
                        <div style="font-weight: bold; text-transform: uppercase; text-decoration: underline;">${examConfig.departmentName}</div>
                    </td>
                    <td style="text-align: center; font-weight: bold; width: 50%; vertical-align: top;">
                        ${examConfig.examTime.toUpperCase()}<br />
                        ${examConfig.schoolYear.toUpperCase()}<br />
                        MÔN: ${examConfig.subjectsSummary.toUpperCase()}<br />
                        <span style="font-weight: normal; font-style: italic;">Thời gian làm bài: ${examConfig.duration}</span>
                    </td>
                </tr>
            </table>
            <br />
            <table style="width: 100%; border: none; font-family: 'Times New Roman', serif; font-size: 13pt;">
                <tr>
                    <td style="width: 45%;"><b>Họ và tên:</b> ............................................................</td>
                    <td style="width: 30%;"><b>Số báo danh:</b> ...........................</td>
                    <td style="width: 25%; text-align: left;">${examConfig.examCode ? `<b>Mã đề ${examConfig.examCode}</b>` : ''}</td>
                </tr>
            </table>
            <br />
        `;

        if ((mcQuestions.length + tfQuestions.length + saQuestions.length) > 0) {
            htmlContent += `<p style="font-weight: bold; text-align: center; text-transform: uppercase;">A. PHẦN TRẮC NGHIỆM KHÁCH QUAN (${formatPoints(tnkqPoints)} điểm)</p>`;
            
            if (mcQuestions.length > 0) {
                htmlContent += `<p style="font-weight: bold;">I. Trắc nghiệm nhiều lựa chọn</p>`;
                mcQuestions.forEach(q => {
                    htmlContent += `<div style="margin-bottom: 1em;">`;
                    htmlContent += `<p style="margin-bottom: 0.25em;"><b>Câu ${++questionCounter}: </b>${convertLatexToMathML(q.text)}</p>`;
                    if (Array.isArray(q.options) && q.options.length === 4) {
                        htmlContent += `<div style="padding-left: 1em;">`;
                        htmlContent += `<p style="margin-bottom: 0.25em;"><b>A. </b>${convertLatexToMathML(q.options[0])}</p>`;
                        htmlContent += `<p style="margin-bottom: 0.25em;"><b>B. </b>${convertLatexToMathML(q.options[1])}</p>`;
                        htmlContent += `<p style="margin-bottom: 0.25em;"><b>C. </b>${convertLatexToMathML(q.options[2])}</p>`;
                        htmlContent += `<p><b>D. </b>${convertLatexToMathML(q.options[3])}</p>`;
                        htmlContent += `</div>`;
                    }
                    htmlContent += `</div>`;
                });
            }

            if (tfQuestions.length > 0) {
                htmlContent += `<p style="font-weight: bold; margin-top: 1em;">II. Câu hỏi đúng sai</p>`;
                tfQuestions.forEach(q => {
                    htmlContent += `<div style="margin-bottom: 1em;">`;
                    htmlContent += `<p style="margin-bottom: 0.25em;"><b>Câu ${++questionCounter}: </b>${convertLatexToMathML(q.text)}</p>`;
                    if (Array.isArray(q.options) && q.options.length === 4) {
                        htmlContent += `<div style="padding-left: 1em;">`;
                        htmlContent += `<p style="margin-bottom: 0.25em;"><b>a) </b>${convertLatexToMathML(q.options[0])}</p>`;
                        htmlContent += `<p style="margin-bottom: 0.25em;"><b>b) </b>${convertLatexToMathML(q.options[1])}</p>`;
                        htmlContent += `<p style="margin-bottom: 0.25em;"><b>c) </b>${convertLatexToMathML(q.options[2])}</p>`;
                        htmlContent += `<p><b>d) </b>${convertLatexToMathML(q.options[3])}</p>`;
                        htmlContent += `</div>`;
                    }
                    htmlContent += `</div>`;
                });
            }

            if (saQuestions.length > 0) {
                htmlContent += `<p style="font-weight: bold; margin-top: 1em;">III. Trả lời ngắn</p>`;
                saQuestions.forEach(q => {
                    htmlContent += `<div style="margin-bottom: 1em;">`;
                    htmlContent += `<p><b>Câu ${++questionCounter}: </b>${convertLatexToMathML(q.text)}</p>`;
                    htmlContent += `</div>`;
                });
            }
        }

        if (essayQuestions.length > 0) {
            htmlContent += `<p style="font-weight: bold; text-align: center; text-transform: uppercase; margin-top: 1.5em;">B. PHẦN TỰ LUẬN (${formatPoints(essayPoints)} điểm)</p>`;
            essayQuestions.forEach(q => {
                htmlContent += `<div style="margin-bottom: 1em;">`;
                htmlContent += `<p><b>Câu ${++questionCounter}: </b>${convertLatexToMathML(q.text)}</p>`;
                htmlContent += `</div>`;
            });
        }

        htmlContent += `<div style="text-align: center; font-weight: bold; margin-top: 2em; margin-bottom: 2em;">------- HẾT -------</div>`;
        htmlContent += `<br clear=all style='mso-special-character:line-break;page-break-before:always'>`;
        
        htmlContent += `<h2 style="text-align: center; text-transform: uppercase; font-weight: bold;">ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM</h2>`;
        
        answerCounter = 0;

        if ((mcQuestions.length + tfQuestions.length + saQuestions.length) > 0) {
            htmlContent += `<p style="font-weight: bold;">A. PHẦN TRẮC NGHIỆM KHÁCH QUAN (${formatPoints(tnkqPoints)} điểm)</p>`;

            if(mcQuestions.length > 0) {
                htmlContent += `<p style="font-weight: bold; margin-top: 0.5em;">I. Trắc nghiệm nhiều lựa chọn</p>`;
                htmlContent += `<table style="width: 50%; border-collapse: collapse; margin: 0 auto;">`;
                htmlContent += `<tr><th style="border: 1px solid black; padding: 4px;">Câu</th><th style="border: 1px solid black; padding: 4px;">Đáp án</th></tr>`;
                mcQuestions.forEach(q => {
                    htmlContent += `<tr><td style="border: 1px solid black; padding: 4px; text-align: center;">${++answerCounter}</td><td style="border: 1px solid black; padding: 4px; text-align: center;">${q.answer}</td></tr>`;
                });
                htmlContent += `</table>`;
            }

            if(tfQuestions.length > 0) {
                htmlContent += `<p style="font-weight: bold; margin-top: 1em;">II. Câu hỏi đúng sai</p>`;
                htmlContent += `<table style="width: 80%; border-collapse: collapse; margin: 0 auto;">`;
                htmlContent += `<tr><th style="border: 1px solid black; padding: 4px;">Câu</th><th style="border: 1px solid black; padding: 4px;">Đáp án</th></tr>`;
                tfQuestions.forEach(q => {
                    htmlContent += `<tr><td style="border: 1px solid black; padding: 4px; text-align: center;">${++answerCounter}</td><td style="border: 1px solid black; padding: 4px; padding-left: 10px;">${q.answer}</td></tr>`;
                });
                htmlContent += `</table>`;
            }

            if(saQuestions.length > 0) {
                htmlContent += `<p style="font-weight: bold; margin-top: 1em;">III. Trả lời ngắn</p>`;
                saQuestions.forEach(q => {
                    htmlContent += `<p><b>Câu ${++answerCounter}:</b> ${convertLatexToMathML(q.answer)}</p>`;
                });
            }
        }

        if(essayQuestions.length > 0) {
            htmlContent += `<p style="font-weight: bold; margin-top: 1.5em;">B. PHẦN TỰ LUẬN (${formatPoints(essayPoints)} điểm)</p>`;
            essayQuestions.forEach(q => {
                const formattedAnswer = q.answer.trim().split('- ').filter(p => p.trim()).map(p => `- ${p.trim()}`).join('<br/>');
                htmlContent += `<div><p><b>Câu ${++answerCounter}:</b></p><div style="padding-left: 20px;">${convertLatexToMathML(formattedAnswer)}</div></div>`;
            });
        }
        
        return htmlContent;
    };

    // Separate AI Standardization Logic for Reuse
    const standardizeTopicsWithAI = async () => {
        if (!activeApiKey) {
            onApiKeyError("Vui lòng chọn một Khóa API để tiếp tục.");
            return;
        }

        setIsProcessingFormulas(true);
        setFormulaProgress(0);

        try {
            // 1. Flatten all text content that needs checking
            const allTextEntries: { topicId: string, questionId: string, type: 'text' | 'answer' | 'option', index?: number, value: string }[] = [];
            
            topics.forEach(t => {
                t.questions.forEach(q => {
                    allTextEntries.push({ topicId: t.id, questionId: q.id, type: 'text', value: q.text });
                    allTextEntries.push({ topicId: t.id, questionId: q.id, type: 'answer', value: q.answer });
                    if (q.options) {
                        q.options.forEach((opt, optIdx) => {
                             allTextEntries.push({ topicId: t.id, questionId: q.id, type: 'option', index: optIdx, value: opt });
                        });
                    }
                });
            });

            // 2. Extract just the strings for AI
            const rawTexts = allTextEntries.map(e => e.value);
            const keysToTry = [activeApiKey, ...apiKeys.filter(k => k !== activeApiKey)];

            // 3. Send to AI for standardization
            const standardizedTexts = await standardizeExamContent(
                keysToTry, 
                onSetActiveKey, 
                rawTexts,
                (processed, total) => {
                    setFormulaProgress((processed / total) * 100);
                }
            );

            // 4. Re-apply standardized text back to topics structure
            const newTopics = JSON.parse(JSON.stringify(topics)) as Topic[]; // Deep copy
            
            standardizedTexts.forEach((newText, idx) => {
                const entry = allTextEntries[idx];
                const topic = newTopics.find(t => t.id === entry.topicId);
                const question = topic?.questions.find(q => q.id === entry.questionId);
                
                if (question) {
                    if (entry.type === 'text') question.text = newText;
                    else if (entry.type === 'answer') question.answer = newText;
                    else if (entry.type === 'option' && typeof entry.index === 'number' && question.options) {
                        question.options[entry.index] = newText;
                    }
                }
            });

            setTopics(newTopics);
            
            // 5. Force Re-render of HTML Preview
            // Incrementing this trigger tells the useEffect to regenerate the HTML string
            setRefreshTrigger(prev => prev + 1);

            // 6. Final render prep
            setFormulaProgress(100);
            
            // Ensure KaTeX is ready
            if (!katexReady) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }

        } catch (error) {
            console.error("Formula standardization failed:", error);
            onStatusUpdate("Lỗi khi chuẩn hóa công thức. Vui lòng thử lại.");
        } finally {
            setIsProcessingFormulas(false);
        }
    };

    // Transition Logic now uses the shared function
    const handleTransitionToExport = async () => {
        await standardizeTopicsWithAI();
        setActiveTab('export');
    };

    const handleDownloadDocx = async () => {
        if (!examConfig || topics.length === 0) return;

        setIsExporting(true);
        try {
            // HTML content is already generated in previewHtml or re-generate if needed
            const htmlContent = previewHtml || generateExamHtmlContent();

            const template = `
                <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns:m="http://schemas.microsoft.com/office/2004/12/omml" xmlns="http://www.w3.org/TR/REC-html40">
                <head>
                    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
                    <title>${examTitle || 'Đề thi'}</title>
                    <style>
                        @page WordSection1 {
                            size: 21cm 29.7cm; 
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
                        }
                        td, th {
                            padding: 4px;
                        }
                        m\\:oMathPara, m\\:oMath {
                            display: inline-block;
                        }
                    </style>
                </head>
                <body>
                    <div class="WordSection1">
                        ${htmlContent}
                    </div>
                </body>
                </html>
            `;

            const blob = new Blob([template], { type: 'application/msword' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'De_thi_va_dap_an.doc';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Export failed:", error);
            onStatusUpdate("Có lỗi xảy ra khi xuất file.");
        } finally {
            setIsExporting(false);
            onStatusUpdate('Xuất file hoàn tất! Vui lòng kiểm tra thư mục tải xuống.');
        }
    };
    
    const handleCopyToClipboard = () => {
        const content = document.getElementById('exam-export-preview');
        if (!content) return;
        
        const range = document.createRange();
        range.selectNode(content);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        document.execCommand('copy');
        window.getSelection()?.removeAllRanges();
        
        onStatusUpdate('Đã copy nội dung vào bộ nhớ tạm! Hãy mở Word và dán (Paste) vào.');
    };

    const renderMatrix = () => {
        // Business Rules:
        const SCORE_MC = 0.25;
        const SCORE_SA = 0.25;
        // SCORE_TF is calculated dynamically below based on the configured Total TNKQ points
        // minus the points allocated to MC and SA.

        const essayPointsFromConfig = examConfig.essayPoints;

        const groupedTopics = topics.reduce((acc, topic) => {
            (acc[topic.chapter] = acc[topic.chapter] || []).push(topic);
            return acc;
        }, {} as {[key: string]: Topic[]});
    
        const totals = questionKeys.reduce((acc, key) => ({ ...acc, [key]: 0 }), {} as TopicConfig);
        topics.forEach(t => questionKeys.forEach(k => { totals[k] += t[k]; }));

        const totalEssayCountInMatrix = totals.essay_knowledge + totals.essay_comprehension + totals.essay_application;

        // Essay score is dynamic (remaining points / total essay questions)
        const essayScorePerItem = totalEssayCountInMatrix > 0 ? essayPointsFromConfig / totalEssayCountInMatrix : 0;
            
        const totalMcQuestions = totals.mc_knowledge + totals.mc_comprehension + totals.mc_application;
        const totalTfQuestions = totals.tf_knowledge + totals.tf_comprehension + totals.tf_application;
        const totalSaQuestions = totals.sa_knowledge + totals.sa_comprehension + totals.sa_application;
    
        // Calculate points based on counts and fixed scores for MC/SA
        const pointsForMc = totalMcQuestions * SCORE_MC;
        const pointsForSa = totalSaQuestions * SCORE_SA;
        
        // The remaining points in TNKQ are assigned to TF questions
        const currentTnkqPoints = examConfig.tnkqPoints;
        const remainingForTf = Math.max(0, currentTnkqPoints - (pointsForMc + pointsForSa));
        
        // Dynamic score per TF question
        const SCORE_TF = totalTfQuestions > 0 ? remainingForTf / totalTfQuestions : 0;

        const totalMcPoints = pointsForMc;
        const totalTfPoints = totalTfQuestions * SCORE_TF;
        const totalSaPoints = pointsForSa;

        const totalTnkqPoints = totalMcPoints + totalTfPoints + totalSaPoints;
        const totalEssayPoints = totalEssayCountInMatrix * essayScorePerItem;
        const actualTotalExamScore = totalTnkqPoints + totalEssayPoints;
    
        const totalKnowPoints = (totals.mc_knowledge * SCORE_MC) + (totals.tf_knowledge * SCORE_TF) + (totals.sa_knowledge * SCORE_SA) + (totals.essay_knowledge * essayScorePerItem);
        const totalCompPoints = (totals.mc_comprehension * SCORE_MC) + (totals.tf_comprehension * SCORE_TF) + (totals.sa_comprehension * SCORE_SA) + (totals.essay_comprehension * essayScorePerItem);
        const totalAppPoints = (totals.mc_application * SCORE_MC) + (totals.tf_application * SCORE_TF) + (totals.sa_application * SCORE_SA) + (totals.essay_application * essayScorePerItem);
    
        const formatPoints = (points: number) => {
            if (Number.isInteger(points)) return points.toString();
            return points.toFixed(2).replace('.', ',');
        };
    
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
                                        const knowScore = (topic.mc_knowledge * SCORE_MC) + (topic.tf_knowledge * SCORE_TF) + (topic.sa_knowledge * SCORE_SA) + (topic.essay_knowledge * essayScorePerItem);
                                        const compCount = topic.mc_comprehension + topic.tf_comprehension + topic.sa_comprehension + topic.essay_comprehension;
                                        const compScore = (topic.mc_comprehension * SCORE_MC) + (topic.tf_comprehension * SCORE_TF) + (topic.sa_comprehension * SCORE_SA) + (topic.essay_comprehension * essayScorePerItem);
                                        const appCount = topic.mc_application + topic.tf_application + topic.sa_application + topic.essay_application;
                                        const appScore = (topic.mc_application * SCORE_MC) + (topic.tf_application * SCORE_TF) + (topic.sa_application * SCORE_SA) + (topic.essay_application * essayScorePerItem);
                                        const totalScore = knowScore + compScore + appScore;

                                        return (
                                        <tr key={topic.id}>
                                            {topicIndex === 0 && <td rowSpan={chapterTopics.length} className="border border-slate-300 p-2 text-center align-middle font-semibold">{++chapterIndex}</td>}
                                            {topicIndex === 0 && <td rowSpan={chapterTopics.length} className="border border-slate-300 p-2 font-semibold align-middle">{chapter}</td>}
                                            <td className="border border-slate-300 p-2">{topic.name}</td>
                                            
                                            {/* MC */}
                                            {renderMatrixCell(topic.mc_knowledge, topic.mc_knowledge * SCORE_MC)}
                                            {renderMatrixCell(topic.mc_comprehension, topic.mc_comprehension * SCORE_MC)}
                                            {renderMatrixCell(topic.mc_application, topic.mc_application * SCORE_MC)}
                                            
                                            {/* TF */}
                                            {renderMatrixCell(topic.tf_knowledge, topic.tf_knowledge * SCORE_TF)}
                                            {renderMatrixCell(topic.tf_comprehension, topic.tf_comprehension * SCORE_TF)}
                                            {renderMatrixCell(topic.tf_application, topic.tf_application * SCORE_TF)}

                                            {/* SA */}
                                            {renderMatrixCell(topic.sa_knowledge, topic.sa_knowledge * SCORE_SA)}
                                            {renderMatrixCell(topic.sa_comprehension, topic.sa_comprehension * SCORE_SA)}
                                            {renderMatrixCell(topic.sa_application, topic.sa_application * SCORE_SA)}

                                            {/* Essay */}
                                            {renderMatrixCell(topic.essay_knowledge, topic.essay_knowledge * essayScorePerItem)}
                                            {renderMatrixCell(topic.essay_comprehension, topic.essay_comprehension * essayScorePerItem)}
                                            {renderMatrixCell(topic.essay_application, topic.essay_application * essayScorePerItem)}

                                            {/* Totals */}
                                            <td className="border border-slate-300 p-2 text-center font-semibold bg-slate-50">{formatPoints(knowCount + compCount + appCount)}</td>
                                            <td className="border border-slate-300 p-2 text-center font-semibold bg-slate-50">{formatPoints(knowScore)}</td>
                                            <td className="border border-slate-300 p-2 text-center font-semibold bg-slate-50">{formatPoints(compScore)}</td>
                                            <td className="border border-slate-300 p-2 text-center font-semibold bg-slate-50">{formatPoints(appScore)}</td>
                                            <td className="border border-slate-300 p-2 text-center font-bold bg-slate-50">{formatPoints((totalScore / actualTotalExamScore) * 100)}%</td>
                                        </tr>
                                        )
                                    })}
                                </React.Fragment>
                                );
                            })}
                             {/* Summary Row */}
                             <tr className="bg-slate-100 font-bold">
                                <td colSpan={3} className="border border-slate-300 p-2 text-center">Tổng</td>
                                <td colSpan={12} className="border border-slate-300 p-2 text-center"></td>
                                <td className="border border-slate-300 p-2 text-center">{totals.mc_knowledge + totals.mc_comprehension + totals.mc_application + totals.tf_knowledge + totals.tf_comprehension + totals.tf_application + totals.sa_knowledge + totals.sa_comprehension + totals.sa_application + totals.essay_knowledge + totals.essay_comprehension + totals.essay_application}</td>
                                <td className="border border-slate-300 p-2 text-center">{formatPoints(totalKnowPoints)}</td>
                                <td className="border border-slate-300 p-2 text-center">{formatPoints(totalCompPoints)}</td>
                                <td className="border border-slate-300 p-2 text-center">{formatPoints(totalAppPoints)}</td>
                                <td className="border border-slate-300 p-2 text-center">100%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div className="mt-4 flex justify-end">
                     <button onClick={() => handleDownloadXls('matrix-table', 'ma_tran.xls')} className="text-sm text-primary-600 hover:text-primary-800 font-medium flex items-center">
                        <DocumentArrowDownIcon className="w-4 h-4 mr-1"/> Tải Ma trận (Excel)
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10 no-print">
                <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
                    <Stepper 
                        activeTab={activeTab} 
                        matrixDone={topics.length > 0} 
                        specDone={!!specification} 
                        questionsDone={topics.every(t => t.generationStatus === 'completed') && topics.length > 0}
                        onTabChange={setActiveTab}
                        canAccessSpec={topics.length > 0}
                        canAccessQuestions={!!specification}
                        exportStepName={exportStepName}
                    />
                </div>
            </div>

            <div className="flex-grow p-4 sm:p-6 lg:p-8 overflow-y-auto bg-slate-100">
                <div className="max-w-[1920px] mx-auto bg-white rounded-xl shadow-lg border border-slate-200 min-h-[600px] flex flex-col p-6">
                    
                    {activeTab === 'matrix' && (
                        <div className="space-y-6">
                            {isGeneratingMatrix ? (
                                <GenerationPlaceholder 
                                    isLoading={true} 
                                    title="Đang phân tích và tạo ma trận" 
                                    description="AI đang đọc tài liệu và xây dựng khung ma trận theo yêu cầu..." 
                                />
                            ) : matrixError ? (
                                 <GenerationPlaceholder 
                                    error={matrixError} 
                                    onRetry={handleGenerateMatrix}
                                />
                            ) : (
                                <>
                                    {renderMatrix()}
                                    <div className="mt-8 pt-6 border-t border-slate-200 flex justify-end gap-3 no-print">
                                        <button onClick={onBack} className="px-6 py-2.5 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50">
                                            Quay lại cấu hình
                                        </button>
                                        <button onClick={() => { setActiveTab('spec'); if (!specification) handleGenerateSpec(); }} className="px-6 py-2.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700">
                                            Tiếp tục: Tạo Bản đặc tả
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'spec' && (
                        <div className="space-y-6">
                            {isGeneratingSpec ? (
                                <GenerationPlaceholder 
                                    isLoading={true} 
                                    title="Đang xây dựng Bản đặc tả" 
                                    description="AI đang chi tiết hóa các đơn vị kiến thức và xác định mục tiêu cần đạt..." 
                                />
                            ) : specError ? (
                                <GenerationPlaceholder 
                                    error={specError} 
                                    onRetry={handleGenerateSpec}
                                />
                            ) : specification ? (
                                <div className="space-y-6">
                                    <h2 className="text-xl font-bold text-center mb-4 uppercase">B. BẢN ĐẶC TẢ ĐỀ KIỂM TRA</h2>
                                    <div className="overflow-x-auto">
                                        <table className="w-full border-collapse border border-slate-400 text-sm">
                                            <thead className="bg-slate-50 font-semibold">
                                                <tr>
                                                    <th rowSpan={2} className="border border-slate-300 p-2 w-[15%]">Chương/Chủ đề</th>
                                                    <th rowSpan={2} className="border border-slate-300 p-2 w-[25%]">Nội dung/Đơn vị kiến thức</th>
                                                    <th rowSpan={2} className="border border-slate-300 p-2 w-[30%]">Mức độ đánh giá (Yêu cầu cần đạt)</th>
                                                    <th colSpan={4} className="border border-slate-300 p-2">Số câu hỏi theo mức độ</th>
                                                </tr>
                                                <tr>
                                                    <th className="border border-slate-300 p-2 w-[7.5%]">Nhận biết</th>
                                                    <th className="border border-slate-300 p-2 w-[7.5%]">Thông hiểu</th>
                                                    <th className="border border-slate-300 p-2 w-[7.5%]">Vận dụng</th>
                                                    <th className="border border-slate-300 p-2 w-[7.5%]">Vận dụng cao</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {specification.map((spec, idx) => (
                                                    <React.Fragment key={spec.id}>
                                                        {spec.objectives.map((obj, objIdx) => {
                                                            const know = (obj.counts.mc_knowledge || 0) + (obj.counts.tf_knowledge || 0) + (obj.counts.sa_knowledge || 0) + (obj.counts.essay_knowledge || 0);
                                                            const comp = (obj.counts.mc_comprehension || 0) + (obj.counts.tf_comprehension || 0) + (obj.counts.sa_comprehension || 0) + (obj.counts.essay_comprehension || 0);
                                                            const app = (obj.counts.mc_application || 0) + (obj.counts.tf_application || 0) + (obj.counts.sa_application || 0) + (obj.counts.essay_application || 0);
                                                            
                                                            return (
                                                                <tr key={`${spec.id}-${objIdx}`}>
                                                                    {objIdx === 0 && <td rowSpan={spec.objectives.length} className="border border-slate-300 p-2 align-middle font-medium">{spec.chapter}</td>}
                                                                    {objIdx === 0 && <td rowSpan={spec.objectives.length} className="border border-slate-300 p-2 align-middle">{spec.name}</td>}
                                                                    <td className="border border-slate-300 p-2">
                                                                        <div className="font-semibold text-primary-700 mb-1">{obj.specificCompetency}:</div>
                                                                        {obj.learningObjective}
                                                                    </td>
                                                                    <td className="border border-slate-300 p-2 text-center">{know > 0 ? know : ''}</td>
                                                                    <td className="border border-slate-300 p-2 text-center">{comp > 0 ? comp : ''}</td>
                                                                    <td className="border border-slate-300 p-2 text-center">{app > 0 ? app : ''}</td>
                                                                    <td className="border border-slate-300 p-2 text-center"></td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </React.Fragment>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="mt-8 pt-6 border-t border-slate-200 flex justify-end gap-3 no-print">
                                        <button onClick={() => setActiveTab('matrix')} className="px-6 py-2.5 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50">
                                            Quay lại Ma trận
                                        </button>
                                        <button 
                                            onClick={() => { setActiveTab('questions'); if(topics.some(t => t.generationStatus === 'pending')) handleGenerateQuestions(); }} 
                                            className="px-6 py-2.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                                        >
                                            Tiếp tục: Tạo Đề thi
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}

                    {activeTab === 'questions' && (
                         <div className="space-y-6">
                            {questionsError && !isGeneratingQuestions ? (
                                <GenerationPlaceholder error={questionsError} onRetry={handleGenerateQuestions} />
                            ) : topics.some(t => t.generationStatus === 'pending' || t.generationStatus === 'generating') || isGeneratingQuestions ? (
                                <div className="text-center py-12">
                                     <h3 className="text-xl font-semibold text-slate-800 mb-6">AI đang soạn thảo câu hỏi...</h3>
                                     <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {topics.map(topic => (
                                            <div key={topic.id} className={`p-4 rounded-lg border text-left transition-colors ${
                                                topic.generationStatus === 'completed' ? 'bg-green-50 border-green-200' :
                                                topic.generationStatus === 'failed' ? 'bg-red-50 border-red-200' :
                                                topic.generationStatus === 'generating' ? 'bg-primary-50 border-primary-200 ring-1 ring-primary-300' :
                                                'bg-white border-slate-200 opacity-60'
                                            }`}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-bold uppercase text-slate-500 truncate max-w-[70%]">{topic.chapter}</span>
                                                    {topic.generationStatus === 'completed' && <CheckIcon className="w-5 h-5 text-green-600"/>}
                                                    {topic.generationStatus === 'failed' && <ExclamationTriangleIcon className="w-5 h-5 text-red-500"/>}
                                                    {topic.generationStatus === 'generating' && <SmallSpinner />}
                                                </div>
                                                <div className="font-medium text-slate-800 text-sm line-clamp-2 h-10">{topic.name}</div>
                                                <div className="mt-2 text-xs text-slate-500">
                                                    {topic.generationStatus === 'pending' && 'Đang chờ...'}
                                                    {topic.generationStatus === 'generating' && 'Đang tạo câu hỏi...'}
                                                    {topic.generationStatus === 'completed' && `${topic.questions.length} câu hỏi`}
                                                    {topic.generationStatus === 'failed' && <span className="text-red-600">Thất bại</span>}
                                                </div>
                                            </div>
                                        ))}
                                     </div>
                                </div>
                            ) : isProcessingFormulas ? (
                                <GenerationPlaceholder 
                                    isLoading={true} 
                                    title="Đang chuẩn hóa công thức" 
                                    description="Hệ thống đang quét toàn bộ câu hỏi và sử dụng AI để chuẩn hóa mã LaTeX/MathML. Vui lòng không tắt trình duyệt..."
                                    progress={formulaProgress}
                                />
                            ) : (
                                <div className="space-y-8">
                                    <div className="flex justify-between items-center no-print">
                                        <h2 className="text-xl font-bold uppercase">C. ĐỀ KIỂM TRA & ĐÁP ÁN</h2>
                                        <div className="flex gap-2">
                                             <button onClick={() => handleGenerateQuestions()} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md">
                                                Tạo lại tất cả
                                            </button>
                                        </div>
                                    </div>

                                    {/* Preview Area */}
                                    <div id="exam-preview" className="bg-white p-8 border border-slate-200 shadow-sm rounded-lg min-h-[800px]">
                                         <div className="text-center mb-8">
                                            <h3 className="font-bold text-lg uppercase">{examConfig.schoolName}</h3>
                                            <h4 className="font-bold uppercase text-slate-600">{examConfig.departmentName}</h4>
                                            <div className="mt-4 font-bold uppercase text-xl">{examTitle}</div>
                                            <div className="text-sm italic">Môn: {examConfig.subjectsSummary} - Thời gian: {examConfig.duration}</div>
                                         </div>

                                         <div className="space-y-8">
                                            {topics.map((topic, idx) => (
                                                <div key={topic.id} className="border-b border-slate-100 pb-6 last:border-0">
                                                    <div className="flex justify-between items-start mb-4">
                                                        <h5 className="font-bold text-primary-700">{idx + 1}. {topic.name} ({topic.chapter})</h5>
                                                        {topic.generationStatus === 'failed' && (
                                                            <button 
                                                                onClick={() => handleRetryTopic(topic.id)}
                                                                className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full hover:bg-red-200 flex items-center"
                                                            >
                                                                <span className="mr-1">Lỗi tạo câu hỏi</span>
                                                                Thử lại
                                                            </button>
                                                        )}
                                                    </div>
                                                    
                                                    <div className="pl-4 space-y-6">
                                                        {topic.questions.map((q, qIdx) => (
                                                            <div key={q.id} className="bg-slate-50 p-4 rounded-md border border-slate-100">
                                                                <div className="flex gap-2">
                                                                    <span className="font-bold text-slate-700 whitespace-nowrap">Câu {qIdx + 1}:</span>
                                                                    <div className="flex-grow">
                                                                        <div className="text-slate-800 mb-2">
                                                                            <MathRenderer content={q.text} />
                                                                        </div>
                                                                        
                                                                        {q.type === QuestionType.MULTIPLE_CHOICE && q.options && (
                                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 ml-2">
                                                                                {q.options.map((opt, oIdx) => (
                                                                                    <div key={oIdx} className={`text-sm ${['A','B','C','D'][oIdx] === q.answer ? 'font-semibold text-green-700' : 'text-slate-600'}`}>
                                                                                        <span className="font-bold mr-1">{['A','B','C','D'][oIdx]}.</span> 
                                                                                        <MathRenderer content={opt} />
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}

                                                                        {q.type === QuestionType.TRUE_FALSE && q.options && (
                                                                            <div className="grid grid-cols-1 gap-2 ml-2 mt-2">
                                                                                 {q.options.map((opt, oIdx) => (
                                                                                    <div key={oIdx} className="text-sm flex gap-2">
                                                                                        <span className="font-bold">{['a','b','c','d'][oIdx]})</span>
                                                                                        <MathRenderer content={opt} />
                                                                                    </div>
                                                                                 ))}
                                                                                 <div className="mt-2 text-xs font-semibold text-green-700 bg-green-50 inline-block px-2 py-1 rounded">
                                                                                    Đáp án: {q.answer}
                                                                                 </div>
                                                                            </div>
                                                                        )}
                                                                        
                                                                        {(q.type === QuestionType.SHORT_ANSWER || q.type === QuestionType.ESSAY) && (
                                                                             <div className="mt-3 text-sm bg-blue-50 p-3 rounded text-blue-800 border border-blue-100">
                                                                                <span className="font-bold underline mr-1">Đáp án mẫu:</span>
                                                                                <MathRenderer content={q.answer} />
                                                                             </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex-shrink-0 ml-2">
                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-800">
                                                                            {q.level === 'Biết' ? 'NB' : q.level === 'Hiểu' ? 'TH' : 'VD'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {topic.questions.length === 0 && topic.generationStatus !== 'failed' && (
                                                            <div className="text-sm text-slate-400 italic">Chưa có câu hỏi nào được tạo.</div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                         </div>
                                    </div>

                                    <div className="mt-8 pt-6 border-t border-slate-200 flex justify-end gap-3 no-print">
                                        <button onClick={() => setActiveTab('spec')} className="px-6 py-2.5 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50">
                                            Quay lại Đặc tả
                                        </button>
                                        <button onClick={() => handleTransitionToExport()} className="px-6 py-2.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700">
                                            Tiếp tục: {exportStepName}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'export' && (
                        <div className="space-y-6">
                            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-primary-50 p-4 rounded-lg border border-primary-200">
                                <div>
                                    <h3 className="text-lg font-bold text-primary-900">Xuất Đề thi & Đáp án</h3>
                                    <p className="text-sm text-primary-700 mt-1">Đề thi đã được chuyển đổi sang định dạng MathML tương thích với Word.</p>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={standardizeTopicsWithAI}
                                        disabled={isProcessingFormulas}
                                        className="inline-flex items-center px-3 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:bg-slate-200 disabled:text-slate-400"
                                    >
                                        {isProcessingFormulas ? <SmallSpinner className="mr-2" /> : <SparkleIcon className="w-4 h-4 mr-2" />}
                                        {isProcessingFormulas ? 'Đang xử lý...' : 'Chuyển đổi công thức (AI)'}
                                    </button>
                                    <button 
                                        onClick={handleCopyToClipboard}
                                        className="inline-flex items-center px-4 py-2 border border-primary-600 text-sm font-medium rounded-md text-primary-700 bg-white hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                                    >
                                        <DocumentTextIcon className="w-5 h-5 mr-2"/>
                                        Sao chép toàn bộ
                                    </button>
                                    <button 
                                        onClick={handleDownloadDocx}
                                        disabled={isExporting}
                                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-slate-400"
                                    >
                                        {isExporting ? <SmallSpinner className="text-white mr-2"/> : <DocumentArrowDownIcon className="w-5 h-5 mr-2"/>}
                                        {isExporting ? 'Đang tải...' : 'Tải file Word (.doc)'}
                                    </button>
                                </div>
                            </div>
                            
                            <div className="border border-slate-300 shadow-md bg-white p-8 min-h-[1000px] mx-auto w-full max-w-[21cm]" style={{ fontFamily: '"Times New Roman", serif', fontSize: '13pt', lineHeight: 1.5 }}>
                                <div id="exam-export-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ExamWorkspace;
