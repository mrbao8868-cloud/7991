
import React, { useState, useEffect, useRef } from 'react';
import { Topic, SpecTopic, questionKeys, WorkspaceTab, ApiKeyRequiredError, RateLimitError, ExamConfig, TopicConfig, GeneratedMatrixResponse, QuestionType, Question, ObjectiveSpec, GenerationOptions } from '../types';
import { CheckIcon, DocumentArrowDownIcon, DocumentTextIcon, ExclamationTriangleIcon, SparkleIcon, PencilIcon, TrashIcon } from './icons';
import { generateAllQuestionsForTopics, generateSpecification, generateMatrixFromImages } from '../services/geminiService';
import MathRenderer from './MathRenderer';
import MathKeyboard from './MathKeyboard';

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

const Stepper = ({ activeTab, matrixDone, specDone, questionsDone, onTabChange, canAccessSpec, canAccessQuestions, exportStepName }: any) => {
    const steps = [
        { id: 'matrix', name: '2. Ma trận (Phụ lục 1)', done: matrixDone },
        { id: 'spec', name: '3. Bản đặc tả (Phụ lục 2)', done: specDone, disabled: !canAccessSpec },
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
                            onClick={() => onTabChange(step.id)}
                            className={`flex items-center group focus:outline-none disabled:cursor-not-allowed`}
                        >
                            <span className={`flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-full ${activeTab === step.id ? 'bg-primary-600' : step.done ? 'bg-primary-600 group-hover:bg-primary-700' : 'bg-slate-300'}`}>
                                {step.done && activeTab !== step.id ? <CheckIcon className="h-5 w-5 text-white" /> : <span className={`h-2.5 w-2.5 rounded-full ${activeTab === step.id ? 'bg-white' : 'bg-transparent'}`} />}
                            </span>
                            <span className={`ml-3 text-sm font-semibold whitespace-nowrap ${activeTab === step.id ? 'text-primary-600' : 'text-slate-600'}`}>{step.name}</span>
                        </button>
                         {stepIdx !== allSteps.length - 1 && (
                            <div className="hidden sm:block absolute top-0 right-0 h-full w-5" aria-hidden="true">
                                <svg className="h-full w-full text-slate-300" viewBox="0 0 22 80" fill="none" preserveAspectRatio="none"><path d="M0 -2L20 40L0 82" vectorEffect="non-scaling-stroke" stroke="currentcolor" strokeLinejoin="round"/></svg>
                            </div>
                         )}
                    </li>
                ))}
            </ol>
        </nav>
    );
};

const ExamWorkspace: React.FC<ExamWorkspaceProps> = ({ examConfig, documentImages, generationOptions, apiKeys, activeApiKey, onBack, onApiKeyError, onSetActiveKey, onOpenApiModal, onStatusUpdate }) => {
    const [examTitle, setExamTitle] = useState('');
    const [topics, setTopics] = useState<Topic[]>([]);
    const [specification, setSpecification] = useState<SpecTopic[] | null>(null);
    const [activeTab, setActiveTab] = useState<WorkspaceTab>('matrix');
    
    const [isGeneratingMatrix, setIsGeneratingMatrix] = useState(true);
    const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);
    const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
    
    const [isExporting, setIsExporting] = useState(false);
    const [previewHtml, setPreviewHtml] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0); 

    const [matrixError, setMatrixError] = useState<string | null>(null);
    const [specError, setSpecError] = useState<string | null>(null);
    const [questionsError, setQuestionsError] = useState<string | null>(null);

    // Editing State
    const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
    const [tempQuestion, setTempQuestion] = useState<Question | null>(null);
    const activeTextareaRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

    const allQuestions = topics.flatMap(t => t.questions || []);
    const exportStepName = '5. Xem & Tải về';

    useEffect(() => { handleGenerateMatrix(); }, []);

    useEffect(() => {
        if (activeTab === 'export') {
             const html = generateExamHtmlContent();
             setPreviewHtml(html);
        }
    }, [activeTab, topics, examConfig, refreshTrigger]);

    useEffect(() => {
        if (isGeneratingMatrix) onStatusUpdate('AI đang tạo Ma trận chi tiết...');
        else if (isGeneratingSpec) onStatusUpdate('AI đang tạo Bản đặc tả chi tiết...');
        else if (isGeneratingQuestions) onStatusUpdate('AI đang soạn đề thi...');
        else if (isExporting) onStatusUpdate('Đang xuất file Word...');
    }, [isGeneratingMatrix, isGeneratingSpec, isGeneratingQuestions, isExporting, onStatusUpdate]);
    
     const handleGenerateMatrix = async () => {
        if (!activeApiKey) { onApiKeyError("Vui lòng chọn một Khóa API."); return; }
        setIsGeneratingMatrix(true); setMatrixError(null);
        try {
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
                ...t, id: crypto.randomUUID(), questions: [], generationStatus: 'pending',
            }));
            setTopics(topicsFromAI); setActiveTab('matrix');
        } catch (error: unknown) { handleGenerationError(error, setMatrixError); } finally { setIsGeneratingMatrix(false); }
    };

    const handleGenerationError = (error: unknown, setErrorState: (message: string) => void) => {
        if (error instanceof ApiKeyRequiredError) onApiKeyError(error.message);
        else if (error instanceof RateLimitError) setErrorState(error.message);
        else setErrorState(error instanceof Error ? error.message : "Đã xảy ra lỗi.");
    };

    const handleGenerateSpec = async () => {
        if (!activeApiKey) { onApiKeyError("Vui lòng chọn một Khóa API."); return; }
        setIsGeneratingSpec(true); setSpecError(null);
        try {
            const keysToTry = [activeApiKey, ...apiKeys.filter(k => k !== activeApiKey)];
            const spec = await generateSpecification(keysToTry, onSetActiveKey, topics);
            setSpecification(spec);
        } catch (error: unknown) { handleGenerationError(error, setSpecError); } finally { setIsGeneratingSpec(false); }
    };
    
    const onTopicUpdate = (updatedTopic: Topic) => { setTopics(prev => prev.map(t => t.id === updatedTopic.id ? updatedTopic : t)); };

    const handleGenerateQuestions = async () => {
        if (!specification || !activeApiKey) return;
        setIsGeneratingQuestions(true); setQuestionsError(null);
        setTopics(prev => prev.map(t => ({ ...t, generationStatus: 'pending', generationError: undefined })));
        try {
            const keysToTry = [activeApiKey, ...apiKeys.filter(k => k !== activeApiKey)];
            const mode = generationOptions?.mode || 'generate';
            const imagesToPass = mode === 'extract' ? documentImages : [];
            await generateAllQuestionsForTopics(keysToTry, onSetActiveKey, topics, specification, onTopicUpdate, mode, imagesToPass);
        } catch (error: unknown) { handleGenerationError(error, setQuestionsError); } finally { setIsGeneratingQuestions(false); }
    };
    
    const handleRetryTopic = async (topicId: string) => {
        if (!specification || !activeApiKey) return;
        const topicToRetry = topics.find(t => t.id === topicId);
        const specForTopic = specification.find(s => s.id === topicId);
        if (!topicToRetry || !specForTopic) return;
        
        onTopicUpdate({ ...topicToRetry, generationStatus: 'pending', generationError: undefined });
        setIsGeneratingQuestions(true);
        try {
            const keysToTry = [activeApiKey, ...apiKeys.filter(k => k !== activeApiKey)];
            const mode = generationOptions?.mode || 'generate';
             const imagesToPass = mode === 'extract' ? documentImages : [];
            await generateAllQuestionsForTopics(keysToTry, onSetActiveKey, [topicToRetry], [specForTopic], onTopicUpdate, mode, imagesToPass);
        } catch (error: unknown) {
            handleGenerationError(error, (msg) => {
                const failedTopic = topics.find(t => t.id === topicId);
                if (failedTopic) onTopicUpdate({ ...failedTopic, generationStatus: 'failed', generationError: msg });
            });
        } finally { setIsGeneratingQuestions(false); }
    };

    // --- Editing Logic ---
    const startEditing = (question: Question) => {
        setEditingQuestionId(question.id);
        // Deep copy to avoid direct mutation
        setTempQuestion(JSON.parse(JSON.stringify(question)));
    };

    const cancelEditing = () => {
        setEditingQuestionId(null);
        setTempQuestion(null);
        activeTextareaRef.current = null;
    };

    const saveEditing = () => {
        if (!tempQuestion) return;
        
        // Find topic and update question
        setTopics(prevTopics => prevTopics.map(topic => {
            const qIndex = topic.questions.findIndex(q => q.id === tempQuestion.id);
            if (qIndex !== -1) {
                const newQuestions = [...topic.questions];
                newQuestions[qIndex] = tempQuestion;
                return { ...topic, questions: newQuestions };
            }
            return topic;
        }));
        
        setEditingQuestionId(null);
        setTempQuestion(null);
        activeTextareaRef.current = null;
    };

    const handleTempChange = (field: keyof Question, value: any) => {
        if (!tempQuestion) return;
        setTempQuestion({ ...tempQuestion, [field]: value });
    };

    const handleOptionChange = (idx: number, value: string) => {
        if (!tempQuestion || !tempQuestion.options) return;
        const newOptions = [...tempQuestion.options];
        newOptions[idx] = value;
        setTempQuestion({ ...tempQuestion, options: newOptions });
    };

    const insertAtCursor = (textToInsert: string) => {
        const input = activeTextareaRef.current;
        if (!input) return;

        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);
        
        const newValue = before + textToInsert + after;
        const newCursorPos = start + textToInsert.length;

        // Determine which field we are editing based on name or id, simpler to just update state via onChange logic equivalent
        // But since we need to update state, we need to know WHICH field is focused.
        // A simple hack is to use the `name` attribute of the input.
        const fieldName = input.name;
        
        if (fieldName === 'questionText') {
            handleTempChange('text', newValue);
        } else if (fieldName === 'answer') {
            handleTempChange('answer', newValue);
        } else if (fieldName.startsWith('option_')) {
            const idx = parseInt(fieldName.split('_')[1]);
            handleOptionChange(idx, newValue);
        }

        // Restore focus and cursor (requires timeout for React state update)
        setTimeout(() => {
            if(activeTextareaRef.current === input) {
                input.focus();
                input.setSelectionRange(newCursorPos, newCursorPos);
            }
        }, 0);
    };

    // Helper to clean option text (remove A., B., etc if present)
    const cleanOptionText = (text: string) => {
        if (!text) return '';
        return text.replace(/^([A-D]|[a-d])[\.\)\s]+\s*/, '');
    };

    // Helper function to format text for HTML/Word export
    const formatContentForExport = (text: string) => {
        if (!text) return '';
        let processed = text;
        
        // Handle Multiplication: * -> x (or similar visual)
        processed = processed.replace(/\*/g, ' × ');

        // Convert ^... to <sup>...</sup>
        processed = processed.replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>');
        processed = processed.replace(/\^([a-zA-Z0-9+\-(),.]+)/g, '<sup>$1</sup>');

        // Convert _... to <sub>...</sub>
        processed = processed.replace(/_\{([^}]+)\}/g, '<sub>$1</sub>');
        processed = processed.replace(/_([a-zA-Z0-9+\-(),.]+)/g, '<sub>$1</sub>');
        
        // Handle newlines
        processed = processed.replace(/\n/g, '<br/>');
        return processed;
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
        let mcAnswerCounter = 0;
        
        // --- PHẦN ĐỀ THI ---
        let htmlContent = `
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

        // ... Rendering Questions (Existing Logic) ...
        if ((mcQuestions.length + tfQuestions.length + saQuestions.length) > 0) {
            htmlContent += `<p style="font-weight: bold; text-align: center; text-transform: uppercase;">A. PHẦN TRẮC NGHIỆM KHÁCH QUAN (${tnkqPoints.toLocaleString('vi-VN')} điểm)</p>`;
            if (mcQuestions.length > 0) {
                htmlContent += `<p style="font-weight: bold;">I. Trắc nghiệm nhiều lựa chọn</p>`;
                mcQuestions.forEach(q => {
                    htmlContent += `<div style="margin-bottom: 1em;"><p style="margin-bottom: 0.25em;"><b>Câu ${++questionCounter}: </b>${formatContentForExport(q.text)}</p>`;
                    if (Array.isArray(q.options) && q.options.length === 4) {
                        htmlContent += `<div style="padding-left: 1em;">
                            <p style="margin-bottom: 0.25em;"><b>A. </b>${formatContentForExport(cleanOptionText(q.options[0]))}</p>
                            <p style="margin-bottom: 0.25em;"><b>B. </b>${formatContentForExport(cleanOptionText(q.options[1]))}</p>
                            <p style="margin-bottom: 0.25em;"><b>C. </b>${formatContentForExport(cleanOptionText(q.options[2]))}</p>
                            <p><b>D. </b>${formatContentForExport(cleanOptionText(q.options[3]))}</p></div>`;
                    }
                    htmlContent += `</div>`;
                });
            }
            if (tfQuestions.length > 0) {
                htmlContent += `<p style="font-weight: bold; margin-top: 1em;">II. Câu hỏi đúng sai</p>`;
                tfQuestions.forEach(q => {
                    htmlContent += `<div style="margin-bottom: 1em;"><p style="margin-bottom: 0.25em;"><b>Câu ${++questionCounter}: </b>${formatContentForExport(q.text)}</p>`;
                    if (Array.isArray(q.options)) {
                        htmlContent += `<div style="padding-left: 1em;">`;
                        q.options.forEach((opt, idx) => {
                             const label = ['a', 'b', 'c', 'd'][idx] || '-';
                             htmlContent += `<p style="margin-bottom: 0.25em;"><b>${label}) </b>${formatContentForExport(opt)}</p>`;
                        });
                        htmlContent += `</div>`;
                    }
                    htmlContent += `</div>`;
                });
            }
            if (saQuestions.length > 0) {
                htmlContent += `<p style="font-weight: bold; margin-top: 1em;">III. Trả lời ngắn</p>`;
                saQuestions.forEach(q => {
                    htmlContent += `<div style="margin-bottom: 1em;"><p><b>Câu ${++questionCounter}: </b>${formatContentForExport(q.text)}</p></div>`;
                });
            }
        }
        if (essayQuestions.length > 0) {
            htmlContent += `<p style="font-weight: bold; text-align: center; text-transform: uppercase; margin-top: 1.5em;">B. PHẦN TỰ LUẬN (${essayPoints.toLocaleString('vi-VN')} điểm)</p>`;
            essayQuestions.forEach(q => {
                htmlContent += `<div style="margin-bottom: 1em;"><p><b>Câu ${++questionCounter}: </b>${formatContentForExport(q.text)}</p></div>`;
            });
        }

        // --- PHẦN ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM ---
        htmlContent += `<br style="page-break-before: always;" />`;
        htmlContent += `<div style="text-align: center; font-weight: bold; font-size: 14pt; margin-bottom: 20px; margin-top: 20px; text-transform: uppercase;">ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM</div>`;
        
        // 1. Đáp án Trắc nghiệm nhiều lựa chọn (Dạng bảng)
        if (mcQuestions.length > 0) {
            htmlContent += `<div style="margin-bottom: 30px;">`;
            htmlContent += `<p style="font-weight: bold; margin-bottom: 10px; font-size: 13pt;">PHẦN I. TRẮC NGHIỆM NHIỀU LỰA CHỌN</p>`;
            htmlContent += `<table style="width: 100%; border-collapse: collapse; text-align: center; margin-bottom: 10px;">`;
            
            const columns = 10;
            const rows = Math.ceil(mcQuestions.length / columns);
            
            for(let r = 0; r < rows; r++) {
                 // Header Row (Question Numbers)
                 htmlContent += `<tr>`;
                 for (let c = 0; c < columns; c++) {
                     const qIdx = r * columns + c;
                     if (qIdx < mcQuestions.length) {
                         htmlContent += `<td style="border: 1px solid black; padding: 5px; font-weight: bold; background-color: #f0f0f0; width: ${100/columns}%;">${mcAnswerCounter + qIdx + 1}</td>`;
                     } else {
                         htmlContent += `<td style="border: 1px solid black; padding: 5px; width: ${100/columns}%;"></td>`;
                     }
                 }
                 htmlContent += `</tr>`;
                 
                 // Data Row (Answers)
                 htmlContent += `<tr>`;
                 for (let c = 0; c < columns; c++) {
                     const qIdx = r * columns + c;
                     if (qIdx < mcQuestions.length) {
                         const rawAns = mcQuestions[qIdx].answer ? mcQuestions[qIdx].answer.trim() : '';
                         // Strict extraction: Try to find a single letter [A-D] either at start or standalone
                         const match = rawAns.match(/([A-D])(\.|\s|$)/i) || rawAns.match(/^([A-D])/i);
                         const letter = match ? match[1].toUpperCase() : rawAns.charAt(0).toUpperCase().replace(/[^A-D]/g, '');
                         
                         htmlContent += `<td style="border: 1px solid black; padding: 5px;">${letter}</td>`;
                     } else {
                         htmlContent += `<td style="border: 1px solid black; padding: 5px;"></td>`;
                     }
                 }
                 htmlContent += `</tr>`;
            }
            htmlContent += `</table></div>`;
        }

        // 2. Đáp án Đúng/Sai (Dạng bảng 2 cột cho khoa học)
        if (tfQuestions.length > 0) {
            htmlContent += `<div style="margin-bottom: 30px;">`;
            htmlContent += `<p style="font-weight: bold; margin-bottom: 10px; font-size: 13pt;">PHẦN II. TRẮC NGHIỆM ĐÚNG SAI</p>`;
            htmlContent += `<table style="width: 100%; border-collapse: collapse;">`;
            htmlContent += `<tr style="background-color: #f0f0f0; text-align: center; font-weight: bold;"><td style="border: 1px solid black; padding: 5px; width: 100px;">Câu</td><td style="border: 1px solid black; padding: 5px;">Đáp án</td></tr>`;
            
            tfQuestions.forEach((q, idx) => {
                htmlContent += `<tr>
                    <td style="border: 1px solid black; padding: 5px; text-align: center; font-weight: bold;">Câu ${idx + 1}</td>
                    <td style="border: 1px solid black; padding: 5px;">${formatContentForExport(q.answer)}</td>
                </tr>`;
            });
            htmlContent += `</table></div>`;
        }

        // 3. Đáp án Trả lời ngắn (Dạng bảng 2 cột)
        if (saQuestions.length > 0) {
            htmlContent += `<div style="margin-bottom: 30px;">`;
            htmlContent += `<p style="font-weight: bold; margin-bottom: 10px; font-size: 13pt;">PHẦN III. TRẢ LỜI NGẮN</p>`;
            htmlContent += `<table style="width: 100%; border-collapse: collapse;">`;
             htmlContent += `<tr style="background-color: #f0f0f0; text-align: center; font-weight: bold;"><td style="border: 1px solid black; padding: 5px; width: 100px;">Câu</td><td style="border: 1px solid black; padding: 5px;">Đáp án</td></tr>`;

            saQuestions.forEach((q, idx) => {
                htmlContent += `<tr>
                    <td style="border: 1px solid black; padding: 5px; text-align: center; font-weight: bold;">Câu ${idx + 1}</td>
                    <td style="border: 1px solid black; padding: 5px;">${formatContentForExport(q.answer)}</td>
                </tr>`;
            });
            htmlContent += `</table></div>`;
        }

        // 4. Đáp án Tự luận
        if (essayQuestions.length > 0) {
            htmlContent += `<div style="margin-bottom: 30px;">`;
            htmlContent += `<p style="font-weight: bold; margin-bottom: 10px; font-size: 13pt;">PHẦN IV. TỰ LUẬN</p>`;
             essayQuestions.forEach((q, idx) => {
                htmlContent += `<div style="margin-bottom: 15px;">
                    <p style="font-weight: bold; margin-bottom: 5px;">Câu ${idx + 1}:</p>
                    <div style="margin-left: 20px; border-left: 3px solid #e5e7eb; padding-left: 10px;">${formatContentForExport(q.answer)}</div>
                </div>`;
            });
            htmlContent += `</div>`;
        }

        return htmlContent;
    };

    const renderMatrix = () => {
        // Use configured point values
        const SCORE_MC = examConfig.mcPointValue;
        const SCORE_TF = examConfig.tfPointValue;
        const SCORE_SA = examConfig.saPointValue;
        
        const groupedTopics = topics.reduce((acc, t) => { (acc[t.chapter] = acc[t.chapter] || []).push(t); return acc; }, {} as {[key: string]: Topic[]});
        
        // Calculate totals for footer
        const totals = questionKeys.reduce((acc, k) => ({ ...acc, [k]: 0 }), {} as TopicConfig);
        topics.forEach(t => questionKeys.forEach(k => { totals[k] += t[k] || 0; }));
        
        const totalEssayCount = totals.essay_knowledge + totals.essay_comprehension + totals.essay_application;
        const essayScorePerItem = totalEssayCount > 0 ? examConfig.essayPoints / totalEssayCount : 0;
        const totalTfQuestions = totals.tf_knowledge + totals.tf_comprehension + totals.tf_application;
        
        // Score Calculation Logic
        const pointsForMcSa = (totals.mc_knowledge + totals.mc_comprehension + totals.mc_application) * SCORE_MC + (totals.sa_knowledge + totals.sa_comprehension + totals.sa_application) * SCORE_SA;
        
        const formatPoints = (points: number) => Number.isInteger(points) ? points.toString() : points.toFixed(2).replace('.', ',');
        const renderCell = (c: number) => !c ? <td className="border border-slate-300 p-1"></td> : <td className="border border-slate-300 p-1 text-center font-medium">{c}</td>;
        
        let idx = 0;
        return (
            <div>
                <h2 className="text-xl font-bold text-center mb-1 uppercase">A. MA TRẬN ĐỀ KIỂM TRA</h2>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-400 text-sm">
                        <thead className="align-middle text-center font-bold bg-slate-50">
                             <tr>
                                <th rowSpan={4} className="border border-slate-300 p-1 w-[3%]">TT</th>
                                <th rowSpan={4} className="border border-slate-300 p-1 w-[10%]">Chủ đề</th>
                                <th rowSpan={4} className="border border-slate-300 p-1 w-[30%]">Nội dung/đơn vị kiến thức</th>
                                <th colSpan={12} className="border border-slate-300 p-1">Mức độ đánh giá</th>
                                <th colSpan={3} className="border border-slate-300 p-1">Tổng số câu</th>
                                <th rowSpan={4} className="border border-slate-300 p-1 w-[4%]">Tỉ lệ % điểm</th>
                            </tr>
                            <tr>
                                <th colSpan={9} className="border border-slate-300 p-1">TNKQ</th>
                                <th colSpan={3} rowSpan={2} className="border border-slate-300 p-1">Tự luận</th>
                                <th rowSpan={3} className="border border-slate-300 p-1 w-[2%]">Biết</th>
                                <th rowSpan={3} className="border border-slate-300 p-1 w-[2%]">Hiểu</th>
                                <th rowSpan={3} className="border border-slate-300 p-1 w-[2%]">Vận dụng</th>
                            </tr>
                            <tr>
                                <th colSpan={3} className="border border-slate-300 p-1">Nhiều lựa chọn</th>
                                <th colSpan={3} className="border border-slate-300 p-1">“Đúng – Sai”</th>
                                <th colSpan={3} className="border border-slate-300 p-1">Trả lời ngắn</th>
                            </tr>
                            <tr>
                                <th className="border border-slate-300 p-1 w-[2%]">Biết</th><th className="border border-slate-300 p-1 w-[2%]">Hiểu</th><th className="border border-slate-300 p-1 w-[2%]">Vận dụng</th>
                                <th className="border border-slate-300 p-1 w-[2%]">Biết</th><th className="border border-slate-300 p-1 w-[2%]">Hiểu</th><th className="border border-slate-300 p-1 w-[2%]">Vận dụng</th>
                                <th className="border border-slate-300 p-1 w-[2%]">Biết</th><th className="border border-slate-300 p-1 w-[2%]">Hiểu</th><th className="border border-slate-300 p-1 w-[2%]">Vận dụng</th>
                                <th className="border border-slate-300 p-1 w-[2%]">Biết</th><th className="border border-slate-300 p-1 w-[2%]">Hiểu</th><th className="border border-slate-300 p-1 w-[2%]">Vận dụng</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.keys(groupedTopics).map(chapter => {
                                const chapterTopics = groupedTopics[chapter];
                                return (
                                <React.Fragment key={chapter}>
                                    {chapterTopics.map((t, tIdx) => {
                                        const rowTotalKnow = (t.mc_knowledge || 0) + (t.tf_knowledge || 0) + (t.sa_knowledge || 0) + (t.essay_knowledge || 0);
                                        const rowTotalComp = (t.mc_comprehension || 0) + (t.tf_comprehension || 0) + (t.sa_comprehension || 0) + (t.essay_comprehension || 0);
                                        const rowTotalApp = (t.mc_application || 0) + (t.tf_application || 0) + (t.sa_application || 0) + (t.essay_application || 0);
                                        
                                        const score = (t.mc_knowledge + t.mc_comprehension + t.mc_application) * SCORE_MC + 
                                                      (t.tf_knowledge + t.tf_comprehension + t.tf_application) * SCORE_TF + 
                                                      (t.sa_knowledge + t.sa_comprehension + t.sa_application) * SCORE_SA + 
                                                      (t.essay_knowledge + t.essay_comprehension + t.essay_application) * essayScorePerItem;
                                        
                                        return (
                                        <tr key={t.id}>
                                            {tIdx === 0 && <td rowSpan={chapterTopics.length} className="border border-slate-300 p-1 text-center align-middle font-semibold">{++idx}</td>}
                                            {tIdx === 0 && <td rowSpan={chapterTopics.length} className="border border-slate-300 p-1 font-semibold align-middle">{chapter}</td>}
                                            <td className="border border-slate-300 p-1">{t.name}</td>
                                            {renderCell(t.mc_knowledge)} {renderCell(t.mc_comprehension)} {renderCell(t.mc_application)}
                                            {renderCell(t.tf_knowledge)} {renderCell(t.tf_comprehension)} {renderCell(t.tf_application)}
                                            {renderCell(t.sa_knowledge)} {renderCell(t.sa_comprehension)} {renderCell(t.sa_application)}
                                            {renderCell(t.essay_knowledge)} {renderCell(t.essay_comprehension)} {renderCell(t.essay_application)}
                                            {renderCell(rowTotalKnow)} {renderCell(rowTotalComp)} {renderCell(rowTotalApp)}
                                            <td className="border border-slate-300 p-1 text-center">{score > 0 ? formatPoints((score / (examConfig.tnkqPoints + examConfig.essayPoints)) * 100) : ''}</td>
                                        </tr>
                                        )
                                    })}
                                </React.Fragment>
                                );
                            })}
                            <tr className="font-bold bg-slate-50">
                                <td colSpan={3} className="border border-slate-300 p-2 text-right">Tổng số câu</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.mc_knowledge || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.mc_comprehension || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.mc_application || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.tf_knowledge || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.tf_comprehension || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.tf_application || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.sa_knowledge || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.sa_comprehension || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.sa_application || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.essay_knowledge || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.essay_comprehension || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.essay_application || ''}</td>
                                {/* Grand Totals B/H/VD */}
                                <td className="border border-slate-300 p-1 text-center">{totals.mc_knowledge + totals.tf_knowledge + totals.sa_knowledge + totals.essay_knowledge || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.mc_comprehension + totals.tf_comprehension + totals.sa_comprehension + totals.essay_comprehension || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.mc_application + totals.tf_application + totals.sa_application + totals.essay_application || ''}</td>
                                <td className="border border-slate-300 p-1 bg-slate-200"></td>
                            </tr>
                            <tr className="font-bold bg-slate-50">
                                <td colSpan={3} className="border border-slate-300 p-2 text-right">Tổng số điểm</td>
                                <td colSpan={3} className="border border-slate-300 p-1 text-center">{formatPoints((totals.mc_knowledge + totals.mc_comprehension + totals.mc_application) * SCORE_MC)}</td>
                                <td colSpan={3} className="border border-slate-300 p-1 text-center">{formatPoints((totals.tf_knowledge + totals.tf_comprehension + totals.tf_application) * SCORE_TF)}</td>
                                <td colSpan={3} className="border border-slate-300 p-1 text-center">{formatPoints((totals.sa_knowledge + totals.sa_comprehension + totals.sa_application) * SCORE_SA)}</td>
                                <td colSpan={3} className="border border-slate-300 p-1 text-center">{formatPoints((totals.essay_knowledge + totals.essay_comprehension + totals.essay_application) * essayScorePerItem)}</td>
                                <td colSpan={3} className="border border-slate-300 p-1 bg-slate-200"></td>
                                <td className="border border-slate-300 p-1 bg-slate-200"></td>
                            </tr>
                             <tr className="font-bold bg-slate-50">
                                <td colSpan={3} className="border border-slate-300 p-2 text-right">Tỉ lệ %</td>
                                <td colSpan={3} className="border border-slate-300 p-1 text-center">{formatPoints(((totals.mc_knowledge + totals.mc_comprehension + totals.mc_application) * SCORE_MC / 10) * 100)}</td>
                                <td colSpan={3} className="border border-slate-300 p-1 text-center">{formatPoints(((totals.tf_knowledge + totals.tf_comprehension + totals.tf_application) * SCORE_TF / 10) * 100)}</td>
                                <td colSpan={3} className="border border-slate-300 p-1 text-center">{formatPoints(((totals.sa_knowledge + totals.sa_comprehension + totals.sa_application) * SCORE_SA / 10) * 100)}</td>
                                <td colSpan={3} className="border border-slate-300 p-1 text-center">{formatPoints(((totals.essay_knowledge + totals.essay_comprehension + totals.essay_application) * essayScorePerItem / 10) * 100)}</td>
                                <td colSpan={3} className="border border-slate-300 p-1 bg-slate-200"></td>
                                <td className="border border-slate-300 p-1 text-center">100%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div className="mt-8 pt-6 border-t border-slate-200 flex justify-end gap-3 no-print">
                    <button onClick={onBack} className="px-6 py-2.5 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white">Quay lại</button>
                    <button onClick={() => { setActiveTab('spec'); if (!specification) handleGenerateSpec(); }} className="px-6 py-2.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700">Tiếp tục: Bản đặc tả</button>
                </div>
            </div>
        );
    };

    const renderSpecification = () => {
        if (!specification) return null;

        // Group by chapter
        const groupedSpec = specification.reduce((acc, t) => { 
            (acc[t.chapter] = acc[t.chapter] || []).push(t); 
            return acc; 
        }, {} as Record<string, SpecTopic[]>);

        // Define config values for footer calculation
        const SCORE_MC = examConfig.mcPointValue;
        const SCORE_TF = examConfig.tfPointValue;
        const SCORE_SA = examConfig.saPointValue;
        
        // Calculate totals for footer
        const totals = questionKeys.reduce((acc, k) => ({ ...acc, [k]: 0 }), {} as TopicConfig);
        specification.forEach(t => t.objectives.forEach(obj => questionKeys.forEach(k => { totals[k] += (obj.counts[k] || 0); })));
        
        const totalEssayCount = totals.essay_knowledge + totals.essay_comprehension + totals.essay_application;
        const essayScorePerItem = totalEssayCount > 0 ? examConfig.essayPoints / totalEssayCount : 0;
        
        const formatPoints = (points: number) => Number.isInteger(points) ? points.toString() : points.toFixed(2).replace('.', ',');
        const renderCell = (c: number | undefined) => !c ? <td className="border border-slate-300 p-1"></td> : <td className="border border-slate-300 p-1 text-center font-medium">{c}</td>;

        let tt = 0;

        return (
            <div>
                <h2 className="text-xl font-bold text-center mb-1 uppercase">B. BẢN ĐẶC TẢ ĐỀ KIỂM TRA</h2>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-400 text-sm">
                        <thead className="align-middle text-center font-bold bg-slate-50">
                            <tr>
                                <th rowSpan={4} className="border border-slate-300 p-1 w-[3%]">TT</th>
                                <th rowSpan={4} className="border border-slate-300 p-1 w-[10%]">Chủ đề/Chương</th>
                                <th rowSpan={4} className="border border-slate-300 p-1 w-[15%]">Nội dung/Đơn vị kiến thức</th>
                                <th rowSpan={4} className="border border-slate-300 p-1 w-[20%]">Yêu cầu cần đạt</th>
                                <th colSpan={12} className="border border-slate-300 p-1">Số câu hỏi ở các mức độ đánh giá</th>
                            </tr>
                            <tr>
                                <th colSpan={9} className="border border-slate-300 p-1">TNKQ</th>
                                <th colSpan={3} rowSpan={2} className="border border-slate-300 p-1">Tự luận</th>
                            </tr>
                            <tr>
                                <th colSpan={3} className="border border-slate-300 p-1">Nhiều lựa chọn</th>
                                <th colSpan={3} className="border border-slate-300 p-1">“Đúng – Sai”</th>
                                <th colSpan={3} className="border border-slate-300 p-1">Trả lời ngắn</th>
                            </tr>
                            <tr>
                                <th className="border border-slate-300 p-1 w-[3%]">Biết</th><th className="border border-slate-300 p-1 w-[3%]">Hiểu</th><th className="border border-slate-300 p-1 w-[3%]">Vận dụng</th>
                                <th className="border border-slate-300 p-1 w-[3%]">Biết</th><th className="border border-slate-300 p-1 w-[3%]">Hiểu</th><th className="border border-slate-300 p-1 w-[3%]">Vận dụng</th>
                                <th className="border border-slate-300 p-1 w-[3%]">Biết</th><th className="border border-slate-300 p-1 w-[3%]">Hiểu</th><th className="border border-slate-300 p-1 w-[3%]">Vận dụng</th>
                                <th className="border border-slate-300 p-1 w-[3%]">Biết</th><th className="border border-slate-300 p-1 w-[3%]">Hiểu</th><th className="border border-slate-300 p-1 w-[3%]">Vận dụng</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(groupedSpec).map(([chapter, topics]: [string, SpecTopic[]]) => {
                                const chapterRowSpan = topics.reduce((sum, t) => sum + Math.max(t.objectives.length, 1), 0);
                                tt++;
                                let isFirstRowOfChapter = true;

                                return topics.map((topic, tIdx) => {
                                    const objectives = topic.objectives && topic.objectives.length > 0 ? topic.objectives : [{ specificCompetency: '', counts: {} } as ObjectiveSpec];
                                    const topicRowSpan = objectives.length;

                                    return objectives.map((obj, oIdx) => {
                                        const row = (
                                            <tr key={`${topic.id}-${oIdx}`}>
                                                {isFirstRowOfChapter && <td rowSpan={chapterRowSpan} className="border border-slate-300 p-1 text-center align-middle font-semibold">{tt}</td>}
                                                {isFirstRowOfChapter && <td rowSpan={chapterRowSpan} className="border border-slate-300 p-1 align-middle font-semibold">{chapter}</td>}
                                                
                                                {oIdx === 0 && <td rowSpan={topicRowSpan} className="border border-slate-300 p-1 align-middle">{topic.name}</td>}
                                                
                                                <td className="border border-slate-300 p-2 text-left align-top whitespace-pre-wrap">{obj.specificCompetency}</td>
                                                
                                                {renderCell(obj.counts.mc_knowledge)}
                                                {renderCell(obj.counts.mc_comprehension)}
                                                {renderCell(obj.counts.mc_application)}
                                                
                                                {renderCell(obj.counts.tf_knowledge)}
                                                {renderCell(obj.counts.tf_comprehension)}
                                                {renderCell(obj.counts.tf_application)}
                                                
                                                {renderCell(obj.counts.sa_knowledge)}
                                                {renderCell(obj.counts.sa_comprehension)}
                                                {renderCell(obj.counts.sa_application)}
                                                
                                                {renderCell(obj.counts.essay_knowledge)}
                                                {renderCell(obj.counts.essay_comprehension)}
                                                {renderCell(obj.counts.essay_application)}
                                            </tr>
                                        );

                                        if (isFirstRowOfChapter) isFirstRowOfChapter = false;
                                        return row;
                                    });
                                });
                            })}
                            <tr className="font-bold bg-slate-50">
                                <td colSpan={4} className="border border-slate-300 p-2 text-right">Tổng số câu</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.mc_knowledge || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.mc_comprehension || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.mc_application || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.tf_knowledge || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.tf_comprehension || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.tf_application || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.sa_knowledge || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.sa_comprehension || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.sa_application || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.essay_knowledge || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.essay_comprehension || ''}</td>
                                <td className="border border-slate-300 p-1 text-center">{totals.essay_application || ''}</td>
                            </tr>
                            <tr className="font-bold bg-slate-50">
                                <td colSpan={4} className="border border-slate-300 p-2 text-right">Tổng số điểm</td>
                                <td colSpan={3} className="border border-slate-300 p-1 text-center">{formatPoints((totals.mc_knowledge + totals.mc_comprehension + totals.mc_application) * SCORE_MC)}</td>
                                <td colSpan={3} className="border border-slate-300 p-1 text-center">{formatPoints((totals.tf_knowledge + totals.tf_comprehension + totals.tf_application) * SCORE_TF)}</td>
                                <td colSpan={3} className="border border-slate-300 p-1 text-center">{formatPoints((totals.sa_knowledge + totals.sa_comprehension + totals.sa_application) * SCORE_SA)}</td>
                                <td colSpan={3} className="border border-slate-300 p-1 text-center">{formatPoints((totals.essay_knowledge + totals.essay_comprehension + totals.essay_application) * essayScorePerItem)}</td>
                            </tr>
                             <tr className="font-bold bg-slate-50">
                                <td colSpan={4} className="border border-slate-300 p-2 text-right">Tỉ lệ %</td>
                                <td colSpan={3} className="border border-slate-300 p-1 text-center">{formatPoints(((totals.mc_knowledge + totals.mc_comprehension + totals.mc_application) * SCORE_MC / 10) * 100)}</td>
                                <td colSpan={3} className="border border-slate-300 p-1 text-center">{formatPoints(((totals.tf_knowledge + totals.tf_comprehension + totals.tf_application) * SCORE_TF / 10) * 100)}</td>
                                <td colSpan={3} className="border border-slate-300 p-1 text-center">{formatPoints(((totals.sa_knowledge + totals.sa_comprehension + totals.sa_application) * SCORE_SA / 10) * 100)}</td>
                                <td colSpan={3} className="border border-slate-300 p-1 text-center">{formatPoints(((totals.essay_knowledge + totals.essay_comprehension + totals.essay_application) * essayScorePerItem / 10) * 100)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                 <div className="mt-8 pt-6 border-t border-slate-200 flex justify-end gap-3 no-print">
                    <button onClick={() => setActiveTab('matrix')} className="px-6 py-2.5 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white">Quay lại</button>
                    <button onClick={() => { setActiveTab('questions'); if (topics.some(t => t.generationStatus === 'pending')) handleGenerateQuestions(); }} className="px-6 py-2.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700">Tiếp tục: Tạo câu hỏi</button>
                </div>
            </div>
        );
    };

    const handleDownloadDocx = () => {
        setIsExporting(true);
        try {
            const htmlContent = `
                <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
                <head>
                    <meta charset='utf-8'>
                    <title>${examTitle}</title>
                    <style>
                        body { font-family: 'Times New Roman', serif; font-size: 13pt; }
                        table { border-collapse: collapse; width: 100%; }
                        td, th { border: none; padding: 5px; vertical-align: top; }
                    </style>
                </head>
                <body>
                    ${previewHtml}
                </body>
                </html>
            `;
            
            const blob = new Blob(['\ufeff', htmlContent], {
                type: 'application/msword'
            });
            
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${examTitle ? examTitle.replace(/\s+/g, '_') : 'De_thi'}.doc`;
            document.body.appendChild(link);
            link.click();
            
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error("Export error:", error);
            onStatusUpdate("Lỗi khi xuất file Word.");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10 no-print">
                <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
                    <Stepper activeTab={activeTab} matrixDone={topics.length > 0} specDone={!!specification} questionsDone={topics.every(t => t.generationStatus === 'completed') && topics.length > 0} onTabChange={setActiveTab} canAccessSpec={topics.length > 0} canAccessQuestions={!!specification} exportStepName={exportStepName} />
                </div>
            </div>

            <div className="flex-grow p-4 sm:p-6 lg:p-8 overflow-y-auto bg-slate-100">
                <div className="max-w-[1920px] mx-auto bg-white rounded-xl shadow-lg border border-slate-200 min-h-[600px] flex flex-col p-6">
                    {activeTab === 'matrix' && (
                        <div className="space-y-6">
                            {isGeneratingMatrix ? <GenerationPlaceholder isLoading={true} title="Đang tạo ma trận" description="AI đang xây dựng khung ma trận chuẩn công văn 7991..." /> 
                            : matrixError ? <GenerationPlaceholder error={matrixError} onRetry={handleGenerateMatrix} /> 
                            : (
                                <>
                                    {renderMatrix()}
                                    {/* Navigation buttons are now inside renderMatrix */}
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'spec' && (
                        <div className="space-y-6">
                            {isGeneratingSpec ? <GenerationPlaceholder isLoading={true} title="Đang tạo Bản đặc tả" description="AI đang tạo bản đặc tả..." /> 
                            : specError ? <GenerationPlaceholder error={specError} onRetry={handleGenerateSpec} /> 
                            : renderSpecification()}
                        </div>
                    )}

                    {activeTab === 'questions' && (
                         <div className="space-y-6">
                            {questionsError && !isGeneratingQuestions ? <GenerationPlaceholder error={questionsError} onRetry={handleGenerateQuestions} /> 
                            : topics.some(t => t.generationStatus === 'pending' || t.generationStatus === 'generating') || isGeneratingQuestions ? (
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
                                                    {topic.generationStatus === 'completed' ? <CheckIcon className="w-5 h-5 text-green-600"/> : topic.generationStatus === 'failed' ? <ExclamationTriangleIcon className="w-5 h-5 text-red-500"/> : <SmallSpinner />}
                                                </div>
                                                <div className="font-medium text-slate-800 text-sm line-clamp-2 h-10">{topic.name}</div>
                                            </div>
                                        ))}
                                     </div>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    <div className="flex justify-between items-center no-print">
                                        <h2 className="text-xl font-bold uppercase">C. ĐỀ KIỂM TRA & ĐÁP ÁN</h2>
                                        <button onClick={() => handleGenerateQuestions()} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md">Tạo lại tất cả</button>
                                    </div>
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
                                                        {topic.generationStatus === 'failed' && <button onClick={() => handleRetryTopic(topic.id)} className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full hover:bg-red-200">Thử lại</button>}
                                                    </div>
                                                    <div className="pl-4 space-y-6">
                                                        {topic.questions.map((q, qIdx) => (
                                                            <div key={q.id} className="group relative bg-slate-50 p-4 rounded-md border border-slate-100 hover:border-primary-300 transition-colors">
                                                                {editingQuestionId === q.id && tempQuestion ? (
                                                                    // --- EDIT MODE ---
                                                                    <div className="bg-white p-4 rounded border border-primary-500 shadow-sm">
                                                                        <div className="mb-2 flex justify-between items-center">
                                                                            <span className="text-sm font-bold text-primary-700">Chỉnh sửa câu hỏi</span>
                                                                            <span className="text-xs text-slate-500">Hỗ trợ LaTeX</span>
                                                                        </div>
                                                                        
                                                                        {/* ToolBar */}
                                                                        <MathKeyboard onInsert={insertAtCursor} />

                                                                        <div className="mb-4">
                                                                            <label className="block text-xs font-medium text-slate-500 mb-1">Nội dung câu hỏi</label>
                                                                            <textarea
                                                                                name="questionText"
                                                                                ref={activeTextareaRef}
                                                                                value={tempQuestion.text}
                                                                                onChange={(e) => handleTempChange('text', e.target.value)}
                                                                                className="w-full p-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                                                                                rows={3}
                                                                            />
                                                                            <div className="mt-1 text-xs text-slate-400">Xem trước: <MathRenderer content={tempQuestion.text} /></div>
                                                                        </div>

                                                                        {/* Options for MC */}
                                                                        {tempQuestion.type === QuestionType.MULTIPLE_CHOICE && tempQuestion.options && (
                                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                                                                                {tempQuestion.options.map((opt, oIdx) => (
                                                                                    <div key={oIdx}>
                                                                                        <label className="block text-xs font-medium text-slate-500 mb-1">Lựa chọn {['A','B','C','D'][oIdx]}</label>
                                                                                        <textarea // Changed to textarea for multi-line support
                                                                                            name={`option_${oIdx}`}
                                                                                            value={cleanOptionText(opt)}
                                                                                            onFocus={(e) => activeTextareaRef.current = e.target}
                                                                                            onChange={(e) => handleOptionChange(oIdx, e.target.value)}
                                                                                            className="w-full p-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                                                                                            rows={1}
                                                                                        />
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}

                                                                        {/* Options for True/False */}
                                                                        {tempQuestion.type === QuestionType.TRUE_FALSE && tempQuestion.options && (
                                                                             <div className="space-y-2 mb-4">
                                                                                {tempQuestion.options.map((opt, oIdx) => (
                                                                                    <div key={oIdx} className="flex gap-2 items-start">
                                                                                        <span className="mt-2 text-sm font-bold w-6">{['a','b','c','d'][oIdx]})</span>
                                                                                        <div className="flex-grow">
                                                                                            <textarea
                                                                                                name={`option_${oIdx}`}
                                                                                                value={opt}
                                                                                                onFocus={(e) => activeTextareaRef.current = e.target}
                                                                                                onChange={(e) => handleOptionChange(oIdx, e.target.value)}
                                                                                                className="w-full p-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                                                                                                rows={1}
                                                                                            />
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                             </div>
                                                                        )}

                                                                        <div className="mb-4">
                                                                            <label className="block text-xs font-medium text-slate-500 mb-1">Đáp án</label>
                                                                            <input
                                                                                name="answer"
                                                                                value={tempQuestion.answer}
                                                                                onFocus={(e) => activeTextareaRef.current = e.target}
                                                                                onChange={(e) => handleTempChange('answer', e.target.value)}
                                                                                className="w-full p-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                                                                            />
                                                                        </div>

                                                                        <div className="flex justify-end gap-2">
                                                                            <button onClick={cancelEditing} className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50">Hủy</button>
                                                                            <button onClick={saveEditing} className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700">Lưu thay đổi</button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    // --- DISPLAY MODE ---
                                                                    <>
                                                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                                                            <button 
                                                                                onClick={() => startEditing(q)}
                                                                                className="p-1.5 bg-white text-primary-600 border border-primary-200 rounded shadow-sm hover:bg-primary-50"
                                                                                title="Chỉnh sửa câu hỏi"
                                                                            >
                                                                                <PencilIcon className="w-4 h-4" />
                                                                            </button>
                                                                        </div>

                                                                        <div className="flex gap-2">
                                                                            <span className="font-bold text-slate-700 whitespace-nowrap">Câu {qIdx + 1}:</span>
                                                                            <div className="flex-grow">
                                                                                <div className="text-slate-800 mb-2"><MathRenderer content={q.text} /></div>
                                                                                {q.type === QuestionType.MULTIPLE_CHOICE && q.options && (
                                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 ml-2">
                                                                                        {q.options.map((opt, oIdx) => (
                                                                                            <div key={oIdx} className={`text-sm ${['A','B','C','D'][oIdx] === q.answer ? 'font-semibold text-green-700' : 'text-slate-600'}`}>
                                                                                                <span className="font-bold mr-1">{['A','B','C','D'][oIdx]}.</span><MathRenderer content={cleanOptionText(opt)} />
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                                {q.type === QuestionType.TRUE_FALSE && q.options && (
                                                                                    <div className="grid grid-cols-1 gap-2 ml-2 mt-2">
                                                                                        {q.options.map((opt, oIdx) => <div key={oIdx} className="text-sm flex gap-2"><span className="font-bold">{['a','b','c','d'][oIdx]})</span><MathRenderer content={opt} /></div>)}
                                                                                        <div className="mt-2 text-xs font-semibold text-green-700 bg-green-50 inline-block px-2 py-1 rounded">Đáp án: {q.answer}</div>
                                                                                    </div>
                                                                                )}
                                                                                {(q.type === QuestionType.SHORT_ANSWER || q.type === QuestionType.ESSAY) && <div className="mt-3 text-sm bg-blue-50 p-3 rounded text-blue-800 border border-blue-100"><span className="font-bold underline mr-1">Đáp án:</span><MathRenderer content={q.answer} /></div>}
                                                                            </div>
                                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-800 h-fit">{q.level === 'Biết' ? 'NB' : q.level === 'Hiểu' ? 'TH' : 'VD'}</span>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                         </div>
                                    </div>
                                    <div className="mt-8 pt-6 border-t border-slate-200 flex justify-end gap-3 no-print">
                                        <button onClick={() => setActiveTab('spec')} className="px-6 py-2.5 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white">Quay lại</button>
                                        <button onClick={() => { setActiveTab('export'); }} className="px-6 py-2.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700">Tiếp tục: {exportStepName}</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'export' && (
                        <div className="space-y-6">
                            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-primary-50 p-4 rounded-lg border border-primary-200">
                                <div><h3 className="text-lg font-bold text-primary-900">Xuất Đề thi & Đáp án</h3></div>
                                <div className="flex gap-3">
                                    <button onClick={handleDownloadDocx} disabled={isExporting} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:bg-slate-400">
                                        {isExporting ? <SmallSpinner className="text-white mr-2"/> : <DocumentArrowDownIcon className="w-5 h-5 mr-2"/>} Tải file Word (.doc)
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
