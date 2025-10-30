
import React, { useState, useEffect } from 'react';
import { ExamConfig } from './types';
import { BalDigitechLogo, LockClosedIcon, SparkleIcon } from './components/icons';
import ApiKeyManagerModal from './components/ApiKeyManagerModal';
import ConfigurationScreen from './components/ConfigurationScreen';
import ApiKeyPromptScreen from './components/ApiKeyPromptScreen';
import ExamWorkspace from './components/ExamWorkspace';


function App() {
    // App readiness and flow state
    const [isAppReady, setIsAppReady] = useState(false);
    const [appState, setAppState] = useState<'configuring' | 'workspace'>('configuring');
    const [examConfig, setExamConfig] = useState<ExamConfig | null>(null);

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
                setIsAppReady(true); // Key found, app is ready
            } else if (keys.length > 0) {
                const newActive = keys[0];
                setActiveApiKey(newActive);
                localStorage.setItem('activeApiKey', newActive);
                setIsAppReady(true); // A key was found, app is ready
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
        } else if (appState === 'configuring') {
            setStatusMessage('Sẵn sàng cấu hình ma trận. Vui lòng nhập thông tin chi tiết.');
        } else { // appState === 'workspace'
            // Set a default message, child components will provide more specific updates
            setStatusMessage('Sẵn sàng tạo đề thi. Tải tài liệu lên để bắt đầu.');
        }
    }, [isAppReady, appState]);
    
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
        setIsAppReady(true); // Setting a key makes the app ready
    };

    const handleApiKeyError = (message?: string) => {
        const errorMsg = message || 'Khóa API đang hoạt động không hợp lệ. Vui lòng chọn một khóa khác hoặc thêm một khóa mới.';
        setApiKeyError(errorMsg);
        setStatusMessage(`Lỗi API Key: ${errorMsg}`); // Update status bar on API key error
        setIsApiModalOpen(true);
    };

    const handleConfigSubmit = (config: ExamConfig) => {
        setExamConfig(config);
        setAppState('workspace');
    };
    
    const resetState = () => {
        setExamConfig(null);
        setAppState('configuring');
    };

    const renderContent = () => {
        if (!isAppReady) {
            return <ApiKeyPromptScreen onOpenModal={() => setIsApiModalOpen(true)} />;
        }

        if (appState === 'configuring' || !examConfig) {
            return <ConfigurationScreen onConfigSubmit={handleConfigSubmit} />;
        }

        return (
            <ExamWorkspace
                examConfig={examConfig}
                apiKeys={apiKeys}
                activeApiKey={activeApiKey}
                onBack={resetState}
                onApiKeyError={handleApiKeyError}
                onSetActiveKey={handleSetActiveApiKey}
                onOpenApiModal={() => setIsApiModalOpen(true)}
                onStatusUpdate={setStatusMessage}
            />
        );
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
                <div className="bg-slate-800 text-white">
                    <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <BalDigitechLogo className="h-8 w-8 text-white" />
                            <h1 className="text-lg font-semibold">Ứng dụng tạo đề thi theo công văn 7991</h1>
                        </div>
                        <button onClick={() => setIsApiModalOpen(true)} title="Quản lý API Key" className="p-2 rounded-full hover:bg-slate-700 transition-colors">
                            <LockClosedIcon className="w-5 h-5 text-slate-300"/>
                        </button>
                    </div>
                </div>
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

            <footer className="bg-slate-800 text-slate-400 text-xs text-center p-3 no-print mt-auto">
                <p>Trung tâm Tin học ứng dụng Bal Digitech | ĐT: 0972.300.864 - Thầy Giới</p>
                <p className="mt-1">&copy; {new Date().getFullYear()} - Ứng dụng được phát triển bởi Thầy Giới.</p>
            </footer>
        </div>
    );
}

export default App;