
import React from 'react';
import { KeyIcon, LockClosedIcon } from './icons';

interface ApiKeyPromptScreenProps {
    onOpenModal: () => void;
}

const ApiKeyPromptScreen: React.FC<ApiKeyPromptScreenProps> = ({ onOpenModal }) => {
    return (
        <div className="flex-grow flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200 max-w-md w-full text-center">
                <LockClosedIcon className="mx-auto h-12 w-12 text-slate-400" />
                <h2 className="mt-6 text-2xl font-bold text-slate-900">
                    Cần có API Key
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                    Vui lòng thêm API Key của Google Gemini để sử dụng ứng dụng.
                </p>
                <div className="mt-8">
                    <button
                        onClick={onOpenModal}
                        className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                    >
                        <KeyIcon className="w-5 h-5 mr-2" />
                        Quản lý API Key
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ApiKeyPromptScreen;