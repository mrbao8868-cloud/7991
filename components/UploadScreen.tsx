

import React, { useRef, useState, useEffect } from 'react';
import Spinner from './Spinner';
import { DocumentArrowUpIcon, CheckIcon, SparkleIcon, ExclamationTriangleIcon, ArrowTopRightOnSquareIcon } from './icons';
import { InitialAnalysisResult, RateLimitError, ApiKeyRequiredError, GenerationOptions } from '../types';
import { processPdfToImages } from '../utils/pdfProcessor';
import { analyzeDocumentCover } from '../services/geminiService';

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
    
    const [startPage, setStartPage] = useState<string>('');
    const [endPage, setEndPage] = useState<string>('');
    const [scopeHint, setScopeHint] = useState<string>('');
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStatus, setProcessingStatus] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [rateLimitError, setRateLimitError] = useState<string | null>(null);

    useEffect(() => {
        if (isProcessing && processingStatus) {
            onStatusUpdate(processingStatus);
        }
    }, [processingStatus, isProcessing, onStatusUpdate]);

    const handleStartAnalysis = async () => {
        if (!selectedFile || !activeApiKey) return;
        
        setIsProcessing(true);
        setError(null);
        setRateLimitError(null);
        
        try {
            setProcessingStatus('Đang xử lý PDF...');
            const startPageNum = startPage ? parseInt(startPage, 10) : undefined;
            const endPageNum = endPage ? parseInt(endPage, 10) : undefined;
            const images = await processPdfToImages(selectedFile, startPageNum, endPageNum);

            setProcessingStatus('AI đang phân tích bìa...');
            const keysToTry = [activeApiKey, ...apiKeys.filter(k => k !== activeApiKey)];
            const analysisResult = await analyzeDocumentCover(keysToTry, onSetActiveKey, images[0]);
            
            const generationOptions: GenerationOptions = {
                startPage: startPageNum,
                endPage: endPageNum,
                scopeHint: scopeHint.trim() || undefined
            };
            
            onAnalysisComplete(analysisResult, images, generationOptions);

        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            onStatusUpdate(`Đã xảy ra lỗi: ${errorMessage}`);
            if (e instanceof RateLimitError) {
                setRateLimitError(errorMessage);
            } else if (e instanceof ApiKeyRequiredError) {
                onApiKeyError(e.message);
            }
            else {
                setError(errorMessage);
            }
        } finally {
            setIsProcessing(false);
            setProcessingStatus('');
        }
    };

    const handleFileChange = (files: FileList | null) => {
        if (files && files.length > 0) {
            if (files[0].type === 'application/pdf') {
                setSelectedFile(files[0]);
                setError(null);
                setRateLimitError(null);
            } else {
                setError('Vui lòng chỉ tải lên tệp PDF.');
                setSelectedFile(null);
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
    
    const processingSteps = [
        { name: 'Đang xử lý PDF...', title: 'Phân tích tài liệu PDF' },
        { name: 'AI đang phân tích bìa...', title: 'AI nhận diện thông tin trang bìa' },
    ];
    
    const currentStepIndex = processingSteps.findIndex(s => s.name === processingStatus);

    const renderContent = () => {
        if (isProcessing) {
            return (
                <div>
                    <h3 className="text-xl font-semibold text-slate-800">AI đang phân tích...</h3>
                    <p className="text-slate-500 mt-2">Vui lòng đợi trong giây lát, AI đang đọc tài liệu của bạn.</p>
                    <div className="mt-8 flex justify-center">
                        <div className="inline-flex flex-col items-start space-y-4">
                           {processingSteps.map((step, index) => (
                               <ProcessingStep 
                                   key={step.title}
                                   title={step.title}
                                   isCurrent={index === currentStepIndex}
                                   isCompleted={index < currentStepIndex}
                               />
                           ))}
                        </div>
                    </div>
                </div>
            );
        }
        if (rateLimitError) {
            return (
                 <RateLimitErrorState 
                    message={rateLimitError}
                    onRetry={handleStartAnalysis}
                />
            );
        }

        return (
            <>
                <p className="text-slate-600 mb-6">Hãy tải lên tệp PDF chứa nội dung ôn tập hoặc bản đặc tả chi tiết.</p>
                
                {!selectedFile ? (
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
                ) : (
                    <div className="text-left bg-slate-50 border border-slate-200 p-6 rounded-lg">
                        <div className="flex justify-between items-center">
                            <p className="font-medium text-slate-800">Đã chọn tệp: <span className="font-bold">{selectedFile.name}</span></p>
                            <button onClick={() => setSelectedFile(null)} className="text-sm font-medium text-primary-600 hover:text-primary-800">Chọn tệp khác</button>
                        </div>
                        
                        <div className="mt-6 pt-6 border-t border-slate-200">
                            <h4 className="text-base font-semibold text-slate-800 text-left mb-4">Giới hạn Phạm vi (Tùy chọn)</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                                <div>
                                    <label htmlFor="startPage" className="block text-sm font-medium text-slate-600">Từ trang</label>
                                    <input type="number" name="startPage" id="startPage" value={startPage} onChange={e => setStartPage(e.target.value)} placeholder="Bỏ trống để bắt đầu từ đầu" className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="endPage" className="block text-sm font-medium text-slate-600">Đến trang</label>
                                    <input type="number" name="endPage" id="endPage" value={endPage} onChange={e => setEndPage(e.target.value)} placeholder="Bỏ trống để tới trang cuối" className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm" />
                                </div>
                            </div>
                            <div className="mt-4 text-left">
                                <label htmlFor="scopeHint" className="block text-sm font-medium text-slate-600">Gợi ý nội dung (tùy chọn)</label>
                                <input type="text" name="scopeHint" id="scopeHint" value={scopeHint} onChange={e => setScopeHint(e.target.value)} placeholder="VD: Chương 3, Thời nhà Lý, Sóng điện từ..." className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm" />
                                <p className="mt-1 text-xs text-slate-500">Cung cấp gợi ý để AI tập trung vào nội dung cụ thể.</p>
                            </div>
                        </div>

                         <div className="mt-6 pt-6 border-t border-slate-200 text-center">
                            <button onClick={handleStartAnalysis} className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-full shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500" >
                                <SparkleIcon className="w-5 h-5 mr-2" />
                                Bắt đầu Phân tích
                            </button>
                        </div>
                    </div>
                )}
                
                {error && <div className="mt-4 text-sm text-red-600 bg-red-100 p-3 rounded-md text-left">{error}</div>}
            </>
        )
    }

    return (
        <div className="max-w-3xl mx-auto text-center">
             {renderContent()}
        </div>
    );
};

export default UploadScreen;
