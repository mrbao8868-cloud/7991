import React, { useRef, useState, useEffect } from 'react';
import { DocumentArrowUpIcon, CheckIcon, SparkleIcon, ExclamationTriangleIcon, ArrowTopRightOnSquareIcon, DocumentTextIcon } from './icons';
import { InitialAnalysisResult, RateLimitError, ApiKeyRequiredError, GenerationOptions, TocItem, GenerationMode } from '../types';
import { processPdfToImages } from '../utils/pdfProcessor';
import { analyzeDocumentCover, extractTableOfContents } from '../services/geminiService';

interface UploadScreenProps {
    apiKeys: string[];
    activeApiKey: string | null;
    onAnalysisComplete: (result: InitialAnalysisResult, images: string[], options: GenerationOptions) => void;
    onApiKeyError: (message?: string) => void;
    onSetActiveKey: (key: string) => void;
    onStatusUpdate: (message: string) => void;
}

const ProcessingStep: React.FC<{ title: string; isCurrent: boolean; isCompleted: boolean }> = ({ title, isCurrent, isCompleted }) => {
    return (
        <div className="flex items-center space-x-3">
            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${isCompleted ? 'bg-primary-600' : isCurrent ? 'bg-primary-100' : 'bg-slate-200'}`}>
                 {isCompleted ? <CheckIcon className="w-4 h-4 text-white" /> : <SparkleIcon className={`w-4 h-4 ${isCurrent ? 'text-primary-600 animate-pulse' : 'text-slate-500'}`} />}
            </div>
            <p className={`font-medium ${isCompleted ? 'text-slate-400 line-through' : isCurrent ? 'text-primary-700' : 'text-slate-500'}`}>{title}</p>
        </div>
    );
};

const RateLimitErrorState: React.FC<{ message: string; onRetry: () => void; }> = ({ message, onRetry }) => {
    return (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-r-lg">
            <div className="flex">
                <div className="flex-shrink-0">
                    <ExclamationTriangleIcon className="h-6 w-6 text-yellow-400" />
                </div>
                <div className="ml-4 text-left">
                    <h3 className="text-lg font-semibold text-yellow-800">Lỗi Hạn Mức API</h3>
                    <div className="mt-2 text-sm text-yellow-700 space-y-2">
                        <p>{message}</p>
                        <p>Lỗi này xảy ra khi API của bạn đã dùng hết hạn ngạch cho phép hoặc tài khoản Google Cloud liên kết chưa được thiết lập thanh toán. </p>
                    </div>
                    <div className="mt-4 space-y-2">
                         <a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-sm font-semibold text-primary-700 hover:text-primary-900">
                             Tìm hiểu về Hạn mức của Gemini
                             <ArrowTopRightOnSquareIcon className="ml-1.5 h-4 w-4" />
                         </a>
                         <br/>
                         <a href="https://console.cloud.google.com/billing" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-sm font-semibold text-primary-700 hover:text-primary-900">
                             Kiểm tra Thanh toán trên Google Cloud
                             <ArrowTopRightOnSquareIcon className="ml-1.5 h-4 w-4" />
                         </a>
                    </div>
                     <div className="mt-6 flex space-x-3">
                        <button onClick={onRetry} className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700">
                            Thử lại
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};


const UploadScreen: React.FC<UploadScreenProps> = ({ apiKeys, activeApiKey, onAnalysisComplete, onApiKeyError, onSetActiveKey, onStatusUpdate }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    
    // Workflow State
    type Step = 'upload' | 'mode_selection' | 'toc_input' | 'processing_toc' | 'selecting_topics' | 'finalizing';
    const [step, setStep] = useState<Step>('upload');
    const [generationMode, setGenerationMode] = useState<GenerationMode>('generate');
    
    // TOC Input State
    const [tocStartPage, setTocStartPage] = useState<string>('');
    const [tocEndPage, setTocEndPage] = useState<string>('');

    // Data State
    const [tocItems, setTocItems] = useState<TocItem[]>([]);
    const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());

    const [processingStatus, setProcessingStatus] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [rateLimitError, setRateLimitError] = useState<string | null>(null);


    useEffect(() => {
        if (processingStatus) {
            onStatusUpdate(processingStatus);
        }
    }, [processingStatus, onStatusUpdate]);

    const handleFileChange = (files: FileList | null) => {
        if (files && files.length > 0) {
            if (files[0].type === 'application/pdf') {
                setSelectedFile(files[0]);
                setError(null);
                setRateLimitError(null);
                setStep('mode_selection');
                // Reset inputs
                setTocStartPage('');
                setTocEndPage('');
                setProcessingStatus('Vui lòng chọn chế độ tạo đề.');
            } else {
                setError('Vui lòng chỉ tải lên tệp PDF.');
                setSelectedFile(null);
            }
        }
    };
    
    const handleModeSelect = (mode: GenerationMode) => {
        setGenerationMode(mode);
        if (mode === 'extract') {
            // For extraction, we skip TOC and go straight to processing everything
            handleProcessFullExtraction();
        } else {
            // For standard generation, ask for TOC
            setStep('toc_input');
            setProcessingStatus('Vui lòng nhập trang chứa Mục lục.');
        }
    };

    // Step: Process Full Document for Extraction (Skip TOC)
    const handleProcessFullExtraction = async () => {
        if (!selectedFile || !activeApiKey) return;
        setStep('finalizing');
        setProcessingStatus('Đang đọc toàn bộ đề cương...');
        
        try {
            // Process all pages
            const allImages = await processPdfToImages(selectedFile);
            
            setProcessingStatus('Đang lấy thông tin bìa...');
            const keysToTry = [activeApiKey, ...apiKeys.filter(k => k !== activeApiKey)];
            const coverResult = await analyzeDocumentCover(keysToTry, onSetActiveKey, allImages[0]);

            const generationOptions: GenerationOptions = {
                mode: 'extract',
                selectedTopics: [] // Empty means process everything
            };
            
            onAnalysisComplete(coverResult, allImages, generationOptions);
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : "Lỗi khi xử lý đề cương.";
             setError(errorMessage);
             setStep('mode_selection'); // Go back
             if (e instanceof RateLimitError) {
                setRateLimitError(errorMessage);
            } else if (e instanceof ApiKeyRequiredError) {
                onApiKeyError(e.message);
            }
        }
    };

    // Step 2: Analyze ONLY the TOC pages (Standard Mode)
    const handleAnalyzeToc = async () => {
        if (!selectedFile || !activeApiKey) return;
        
        const start = parseInt(tocStartPage);
        const end = parseInt(tocEndPage);

        if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
            setError('Vui lòng nhập số trang hợp lệ (Trang bắt đầu <= Trang kết thúc).');
            return;
        }

        setStep('processing_toc');
        setError(null);
        setRateLimitError(null);
        
        try {
            setProcessingStatus(`Đang đọc trang ${start} đến ${end}...`);
            const tocImages = await processPdfToImages(selectedFile, start, end);

            setProcessingStatus('AI đang phân tích cấu trúc Mục lục...');
            const keysToTry = [activeApiKey, ...apiKeys.filter(k => k !== activeApiKey)];
            
            const tocResult = await extractTableOfContents(keysToTry, onSetActiveKey, tocImages);

            setTocItems(tocResult);
            // Default select all
            setSelectedTopicIds(new Set(tocResult.map(t => t.id)));
            setStep('selecting_topics');
            setProcessingStatus('Vui lòng chọn các bài cần kiểm tra.');

        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            onStatusUpdate(`Đã xảy ra lỗi: ${errorMessage}`);
            setStep('toc_input'); // Revert to input on error
            if (e instanceof RateLimitError) {
                setRateLimitError(errorMessage);
            } else if (e instanceof ApiKeyRequiredError) {
                onApiKeyError(e.message);
            }
            else {
                setError(errorMessage);
            }
        }
    };

    const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
    const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        handleFileChange(e.dataTransfer.files);
    };
    
    const handleToggleTopic = (id: string) => {
        const newSelected = new Set(selectedTopicIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedTopicIds(newSelected);
    };

    const handleSelectAll = (select: boolean) => {
        if (select) {
            setSelectedTopicIds(new Set(tocItems.map(t => t.id)));
        } else {
            setSelectedTopicIds(new Set());
        }
    };

    // Step 3: Finalize - Process full document and cover (Standard Mode)
    const handleConfirmSelection = async () => {
        if (!selectedFile || !activeApiKey) return;
        
        const selectedTopics = tocItems.filter(t => selectedTopicIds.has(t.id));
        
        if (selectedTopics.length === 0) {
            setError("Vui lòng chọn ít nhất một nội dung để tiếp tục.");
            return;
        }

        setStep('finalizing');
        setProcessingStatus('Đang chuẩn bị dữ liệu nội dung...');

        try {
            // Process full document
            const allImages = await processPdfToImages(selectedFile);
            
            setProcessingStatus('Đang lấy thông tin bìa...');
            const keysToTry = [activeApiKey, ...apiKeys.filter(k => k !== activeApiKey)];
            const coverResult = await analyzeDocumentCover(keysToTry, onSetActiveKey, allImages[0]);

            const generationOptions: GenerationOptions = {
                mode: 'generate',
                selectedTopics: selectedTopics
            };
            
            onAnalysisComplete(coverResult, allImages, generationOptions);
        } catch (e: unknown) {
             const errorMessage = e instanceof Error ? e.message : "Lỗi khi xử lý tài liệu.";
             setError(errorMessage);
             setStep('selecting_topics');
             if (e instanceof RateLimitError) {
                setRateLimitError(errorMessage);
            } else if (e instanceof ApiKeyRequiredError) {
                onApiKeyError(e.message);
            }
        }
    };
    
    const groupedToc = tocItems.reduce((acc, item) => {
        (acc[item.chapter] = acc[item.chapter] || []).push(item);
        return acc;
    }, {} as Record<string, TocItem[]>);


    if (rateLimitError) {
        return (
             <RateLimitErrorState 
                message={rateLimitError}
                onRetry={() => {
                    setRateLimitError(null);
                    setStep('mode_selection');
                }}
            />
        );
    }

    // View: 1.5 Mode Selection
    if (step === 'mode_selection') {
         return (
            <div className="max-w-2xl mx-auto text-center">
                 <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-100">
                        <DocumentTextIcon className="h-6 w-6 text-primary-600" aria-hidden="true" />
                    </div>
                    <h3 className="mt-4 text-xl font-bold text-slate-900">Chọn chế độ tạo đề</h3>
                    <p className="mt-2 text-sm text-slate-500">
                        Bạn muốn tạo đề mới từ tài liệu tham khảo (SGK) hay trích xuất câu hỏi từ đề cương có sẵn?
                    </p>

                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                            onClick={() => handleModeSelect('generate')}
                            className="flex flex-col items-center justify-center p-6 border-2 border-slate-200 rounded-xl hover:border-primary-500 hover:bg-primary-50 transition-all group"
                        >
                            <SparkleIcon className="w-10 h-10 text-slate-400 group-hover:text-primary-600 mb-3" />
                            <span className="font-bold text-slate-800">Tạo đề từ SGK/Tài liệu</span>
                            <span className="text-xs text-slate-500 mt-2">AI sẽ đọc nội dung và tự sáng tạo câu hỏi mới theo ma trận.</span>
                        </button>

                        <button
                            onClick={() => handleModeSelect('extract')}
                            className="flex flex-col items-center justify-center p-6 border-2 border-slate-200 rounded-xl hover:border-primary-500 hover:bg-primary-50 transition-all group"
                        >
                            <DocumentArrowUpIcon className="w-10 h-10 text-slate-400 group-hover:text-primary-600 mb-3" />
                            <span className="font-bold text-slate-800">Trích xuất từ Đề cương</span>
                            <span className="text-xs text-slate-500 mt-2">AI sẽ quét và lấy toàn bộ câu hỏi có sẵn trong file đề cương.</span>
                        </button>
                    </div>

                    <div className="mt-8">
                        <button
                            onClick={() => {
                                setStep('upload');
                                setSelectedFile(null);
                            }}
                            className="text-sm text-slate-500 hover:text-slate-700 underline"
                        >
                            Chọn file khác
                        </button>
                    </div>
                 </div>
            </div>
         );
    }

    // View: 2. Input TOC Pages (Standard Mode Only)
    if (step === 'toc_input') {
         return (
            <div className="max-w-xl mx-auto text-center">
                 <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-100">
                        <DocumentTextIcon className="h-6 w-6 text-primary-600" aria-hidden="true" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">Xác định vị trí Mục lục</h3>
                    <p className="mt-2 text-sm text-slate-500">
                        Để tiết kiệm thời gian và hạn ngạch, vui lòng nhập số trang bắt đầu và kết thúc của phần <b>Mục lục</b> trong tài liệu.
                    </p>

                    <div className="mt-8 grid grid-cols-2 gap-4">
                        <div className="text-left">
                            <label htmlFor="startPage" className="block text-sm font-medium text-slate-700">Trang bắt đầu</label>
                            <input
                                type="number"
                                id="startPage"
                                min="1"
                                value={tocStartPage}
                                onChange={(e) => setTocStartPage(e.target.value)}
                                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
                                placeholder="VD: 2"
                            />
                        </div>
                        <div className="text-left">
                            <label htmlFor="endPage" className="block text-sm font-medium text-slate-700">Trang kết thúc</label>
                            <input
                                type="number"
                                id="endPage"
                                min="1"
                                value={tocEndPage}
                                onChange={(e) => setTocEndPage(e.target.value)}
                                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
                                placeholder="VD: 3"
                            />
                        </div>
                    </div>
                    
                    {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

                    <div className="mt-8 flex gap-3">
                        <button
                            onClick={() => {
                                setStep('mode_selection');
                            }}
                            className="flex-1 px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50"
                        >
                            Quay lại
                        </button>
                        <button
                            onClick={handleAnalyzeToc}
                            className="flex-1 px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                        >
                            Phân tích Mục lục
                        </button>
                    </div>
                 </div>
            </div>
         );
    }

    // View: 3. Processing TOC (Spinner)
    if (step === 'processing_toc') {
        return (
            <div className="max-w-3xl mx-auto text-center">
                <h3 className="text-xl font-semibold text-slate-800">AI đang quét Mục lục...</h3>
                <p className="text-slate-500 mt-2">Vui lòng đợi trong giây lát.</p>
                <div className="mt-8 flex justify-center">
                   <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                            <SparkleIcon className="w-5 h-5 text-primary-600 animate-pulse" />
                        </div>
                        <p className="font-medium text-primary-700">{processingStatus}</p>
                    </div>
                </div>
            </div>
        );
    }
    
    // View: 5. Finalizing (Spinner)
    if (step === 'finalizing') {
        return (
            <div className="max-w-3xl mx-auto text-center">
                <h3 className="text-xl font-semibold text-slate-800">Đang khởi tạo môi trường làm việc...</h3>
                <p className="text-slate-500 mt-2">Ứng dụng đang chuẩn bị dữ liệu nội dung.</p>
                <div className="mt-8 flex justify-center">
                    <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                            <SparkleIcon className="w-5 h-5 text-primary-600 animate-pulse" />
                        </div>
                        <p className="font-medium text-primary-700">{processingStatus}</p>
                    </div>
                </div>
            </div>
        );
    }

    // View: 4. Topic Selection (Standard Mode Only)
    if (step === 'selecting_topics') {
        return (
            <div className="max-w-4xl mx-auto text-center">
                 <div className="bg-white p-6 rounded-lg shadow border border-slate-200">
                    <div className="flex justify-between items-center mb-4">
                        <div className="text-left">
                            <h3 className="text-xl font-bold text-slate-800">Kết quả quét Mục lục</h3>
                            <p className="text-sm text-slate-500">Tích chọn các bài học bạn muốn đưa vào đề thi.</p>
                        </div>
                        <div className="space-x-2">
                             <button onClick={() => handleSelectAll(true)} className="text-sm text-primary-600 hover:text-primary-800 font-medium">Chọn tất cả</button>
                             <span className="text-slate-300">|</span>
                             <button onClick={() => handleSelectAll(false)} className="text-sm text-slate-500 hover:text-slate-700">Bỏ chọn</button>
                        </div>
                    </div>
                    
                    <div className="max-h-[60vh] overflow-y-auto border rounded-md text-left p-4 bg-slate-50 custom-scrollbar">
                        {Object.keys(groupedToc).length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                                Không tìm thấy mục lục nào. Vui lòng kiểm tra lại tài liệu hoặc số trang đã nhập.
                            </div>
                        ) : (
                            Object.entries(groupedToc).map(([chapter, items]: [string, TocItem[]]) => (
                                <div key={chapter} className="mb-6 last:mb-0">
                                    <h4 className="font-bold text-slate-700 mb-2 uppercase text-sm border-b pb-1">{chapter}</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {items.map(item => (
                                            <label key={item.id} className={`flex items-start p-3 rounded border cursor-pointer transition-colors ${selectedTopicIds.has(item.id) ? 'bg-primary-50 border-primary-200' : 'bg-white border-slate-200 hover:border-primary-300'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedTopicIds.has(item.id)}
                                                    onChange={() => handleToggleTopic(item.id)}
                                                    className="h-4 w-4 mt-0.5 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                                />
                                                <span className="ml-3 text-sm text-slate-700">{item.lessonName}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    
                    {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

                    <div className="mt-6 pt-4 border-t flex justify-between items-center">
                         <button 
                            onClick={() => {
                                setStep('toc_input');
                                setTocItems([]);
                            }}
                            className="text-slate-500 hover:text-slate-700 text-sm font-medium"
                        >
                            Quét lại trang khác
                        </button>
                        <button 
                            onClick={handleConfirmSelection}
                            className="inline-flex items-center justify-center px-8 py-2.5 border border-transparent text-base font-medium rounded-full shadow-sm text-white bg-primary-600 hover:bg-primary-700"
                        >
                            Tiếp tục ({selectedTopicIds.size})
                        </button>
                    </div>
                 </div>
            </div>
        );
    }

    // View: 1. Upload (Initial)
    return (
        <div className="max-w-3xl mx-auto text-center">
            <p className="text-slate-600 mb-6">Hãy tải lên tệp PDF. Sau đó bạn có thể chọn chế độ tạo đề.</p>
            
            <div
                onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-10 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isDragging ? 'border-primary-500 bg-primary-50' : 'border-slate-300 hover:border-primary-400'}`}
            >
                <input type="file" ref={fileInputRef} onChange={(e) => handleFileChange(e.target.files)} accept=".pdf" className="hidden" />
                <DocumentArrowUpIcon className="mx-auto h-12 w-12 text-slate-400" />
                <p className="mt-2 font-semibold text-slate-700">Kéo và thả tệp PDF vào đây</p>
                <p className="text-sm text-slate-500">hoặc bấm để chọn tệp</p>
            </div>
            
            {error && <div className="mt-4 text-sm text-red-600 bg-red-100 p-3 rounded-md text-left">{error}</div>}
        </div>
    );
};

export default UploadScreen;