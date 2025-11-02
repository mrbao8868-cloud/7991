import React, { useState, useEffect } from 'react';
import { ExamConfig, InitialAnalysisResult, GenerationOptions } from './types';
import { BalDigitechLogo, LockClosedIcon, SparkleIcon } from './components/icons';
import ApiKeyManagerModal from './components/ApiKeyManagerModal';
import ConfigurationScreen from './components/ConfigurationScreen';
import ApiKeyPromptScreen from './components/ApiKeyPromptScreen';
import ExamWorkspace from './components/ExamWorkspace';
import UploadScreen from './components/UploadScreen';

type AppStage = 'upload' | 'configure' | 'workspace';

function App() {
    // App readiness and flow state
    const [isAppReady, setIsAppReady] = useState(false);
    const [appStage, setAppStage] = useState<AppStage>('upload');
    const [examConfig, setExamConfig] = useState<ExamConfig | null>(null);
    const [analysisResult, setAnalysisResult] = useState<InitialAnalysisResult | null>(null);
    const [documentImages, setDocumentImages] = useState<string[]>([]);
    const [generationOptions, setGenerationOptions] = useState<GenerationOptions | null>(null);


    // State for API Key Management
    const [apiKeys, setApiKeys] = useState<string[]>([]);
    const [activeApiKey, setActiveApiKey] = useState<string | null>(null);
    const [isApiModalOpen, setIsApiModalOpen] = useState(false);
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);
    
    // Centralized state for the status bar message
    const [statusMessage, setStatusMessage] = useState('');

    // Load API keys from localStorage on initial render
    useEffect(() => {
        try {
            const storedKeys = localStorage.getItem('apiKeys');
            const storedActiveKey = localStorage.getItem('activeApiKey');
            const keys = storedKeys ? JSON.parse(storedKeys) : [];
            setApiKeys(keys);
            
            if (storedActiveKey && keys.includes(storedActiveKey)) {
                setActiveApiKey(storedActiveKey);
                setIsAppReady(true);
            } else if (keys.length > 0) {
                const newActive = keys[0];
                setActiveApiKey(newActive);
                localStorage.setItem('activeApiKey', newActive);
                setIsAppReady(true);
            } else {
                setIsAppReady(false);
            }
        } catch (error) {
            console.error("Failed to parse API keys from localStorage", error);
            localStorage.removeItem('apiKeys');
            localStorage.removeItem('activeApiKey');
        }
    }, []);

    // Effect to manage the main status message based on app state
    useEffect(() => {
        if (!isAppReady) {
            setStatusMessage('Vui lòng thêm và chọn một API Key để bắt đầu.');
        } else {
            switch(appStage) {
                case 'upload':
                    setStatusMessage('Sẵn sàng phân tích tài liệu. Vui lòng tải lên tệp PDF.');
                    break;
                case 'configure':
                    setStatusMessage('AI đã phân tích tài liệu. Vui lòng kiểm tra và xác nhận cấu hình ma trận.');
                    break;
                case 'workspace':
                    // Workspace component will provide more specific updates
                    setStatusMessage('Đang tạo ma trận từ tài liệu và cấu hình...');
                    break;
            }
        }
    }, [isAppReady, appStage]);
    
    const handleAddApiKey = (key: string) => {
        if (key && !apiKeys.includes(key)) {
            const newKeys = [...apiKeys, key];
            setApiKeys(newKeys);
            localStorage.setItem('apiKeys', JSON.stringify(newKeys));
            if (!activeApiKey) {
                handleSetActiveApiKey(key, false); // Don't close modal on first key add
            }
        }
    };
    
    const handleDeleteApiKey = (keyToDelete: string) => {
        const newKeys = apiKeys.filter(k => k !== keyToDelete);
        setApiKeys(newKeys);
        localStorage.setItem('apiKeys', JSON.stringify(newKeys));
        
        if (activeApiKey === keyToDelete) {
            const newActiveKey = newKeys.length > 0 ? newKeys[0] : null;
            setActiveApiKey(newActiveKey);
            if(newActiveKey) {
                localStorage.setItem('activeApiKey', newActiveKey);
            } else {
                localStorage.removeItem('activeApiKey');
                setIsAppReady(false); // No keys left, app is not ready
            }
        }
    };

    const handleSetActiveApiKey = (key: string, closeModal = true) => {
        setActiveApiKey(key);
        localStorage.setItem('activeApiKey', key);
        setApiKeyError(null);
        if(closeModal) setIsApiModalOpen(false);
        setIsAppReady(true);
    };

    const handleApiKeyError = (message?: string) => {
        const errorMsg = message || 'Khóa API đang hoạt động không hợp lệ. Vui lòng chọn một khóa khác hoặc thêm một khóa mới.';
        setApiKeyError(errorMsg);
        setStatusMessage(`Lỗi API Key: ${errorMsg}`);
        setIsApiModalOpen(true);
    };
    
    const handleAnalysisComplete = (result: InitialAnalysisResult, images: string[], options: GenerationOptions) => {
        setAnalysisResult(result);
        setDocumentImages(images);
        setGenerationOptions(options);
        setAppStage('configure');
    };

    const handleConfigSubmit = (config: ExamConfig) => {
        setExamConfig(config);
        setAppStage('workspace');
    };
    
    const resetState = () => {
        setExamConfig(null);
        setAnalysisResult(null);
        setDocumentImages([]);
        setGenerationOptions(null);
        setAppStage('upload');
    };

    const renderContent = () => {
        if (!isAppReady) {
            return <ApiKeyPromptScreen onOpenModal={() => setIsApiModalOpen(true)} />;
        }

        switch (appStage) {
            case 'upload':
                return (
                     <div className="flex-grow flex items-center justify-center p-4">
                        <UploadScreen
                            apiKeys={apiKeys}
                            activeApiKey={activeApiKey}
                            onAnalysisComplete={handleAnalysisComplete}
                            onApiKeyError={handleApiKeyError}
                            onSetActiveKey={handleSetActiveApiKey}
                            onStatusUpdate={setStatusMessage}
                        />
                    </div>
                );
            case 'configure':
                if (!analysisResult) {
                    // Should not happen, but as a fallback
                    resetState();
                    return null;
                }
                return (
                    <ConfigurationScreen
                        analysisResult={analysisResult}
                        onConfigSubmit={handleConfigSubmit}
                        onBack={resetState}
                    />
                );
            case 'workspace':
                if (!examConfig || documentImages.length === 0) {
                     // Should not happen, but as a fallback
                    resetState();
                    return null;
                }
                return (
                    <ExamWorkspace
                        examConfig={examConfig}
                        documentImages={documentImages}
                        generationOptions={generationOptions}
                        apiKeys={apiKeys}
                        activeApiKey={activeApiKey}
                        onBack={resetState}
                        onApiKeyError={handleApiKeyError}
                        onSetActiveKey={handleSetActiveApiKey}
                        onOpenApiModal={() => setIsApiModalOpen(true)}
                        onStatusUpdate={setStatusMessage}
                    />
                );
        }
    };

    return (
        <div className="bg-slate-100 min-h-screen flex flex-col">
            <ApiKeyManagerModal
                isOpen={isApiModalOpen || !isAppReady}
                onClose={() => { if (apiKeys.length > 0) setIsApiModalOpen(false) }}
                keys={apiKeys}
                activeKey={activeApiKey}
                onAddKey={handleAddApiKey}
                onDeleteKey={handleDeleteApiKey}
                onSetActiveKey={handleSetActiveApiKey}
                errorMessage={apiKeyError}
                isClosable={apiKeys.length > 0}
            />

            <header className="no-print shadow-md bg-white">
                {/* Top bar with Logo, Title, and Banner Info */}
                <div className="bg-slate-800 text-white">
                    <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
                        {/* Left side: Logo and Title */}
                        <div className="flex items-center gap-3 py-3">
                            <BalDigitechLogo className="h-8 w-8 text-white" />
                            <h1 className="text-lg font-semibold">Ứng dụng tạo đề thi theo công văn 7991</h1>
                        </div>

                        {/* Right side: Banner Info */}
                        <div className="hidden lg:block text-right">
                            <h2 className="text-base font-bold tracking-wide text-white">Trung tâm Tin học ứng dụng Bal Digitech</h2>
                            <div className="text-xs mt-1 flex justify-end items-center gap-x-4 text-slate-300">
                                <span><strong>Cung cấp:</strong> Tài khoản Canva, ứng dụng hỗ trợ giáo viên.</span>
                                <span><strong>Đào tạo:</strong> AI, E-learning, ứng dụng AI trong giáo dục.</span>
                                <span><strong>Liên hệ:</strong> 0972.300.864 - Thầy Giới</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Status bar */}
                <div className="bg-primary-700 text-primary-50">
                    <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-10 flex items-center">
                        <SparkleIcon className="w-5 h-5 mr-2 flex-shrink-0"/>
                        <p className="text-sm font-medium truncate">{statusMessage}</p>
                    </div>
                </div>
            </header>

            <main className="flex-grow flex flex-col">
                {renderContent()}
            </main>

            <footer className="bg-slate-800 text-slate-400 text-xs p-3 no-print mt-auto">
                <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <div className="text-center sm:text-left">
                        <p>Trung tâm Tin học ứng dụng Bal Digitech | ĐT: 0972.300.864 - Thầy Giới</p>
                        <p className="mt-1">&copy; {new Date().getFullYear()} - Ứng dụng được phát triển bởi Thầy Giới.</p>
                    </div>
                    <button 
                        onClick={() => setIsApiModalOpen(true)} 
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-slate-700 transition-colors text-slate-300 hover:text-white"
                    >
                        <LockClosedIcon className="w-4 h-4"/>
                        <span className="font-medium">Quản lý API Key</span>
                    </button>
                </div>
            </footer>
        </div>
    );
}

export default App;