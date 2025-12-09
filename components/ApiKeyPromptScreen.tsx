import React from 'react';
import { KeyIcon, LockClosedIcon, ExclamationTriangleIcon } from './icons';

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
                
                <div className="mt-4 bg-amber-50 border-l-4 border-amber-400 p-4 text-left">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <ExclamationTriangleIcon className="h-5 w-5 text-amber-400" />
                        </div>
                        <div className="ml-3">
                            <p className="text-sm text-amber-800 font-medium">
                                Yêu cầu bắt buộc
                            </p>
                            <p className="text-sm text-amber-700 mt-1">
                                Để ứng dụng hoạt động ổn định và tránh lỗi giới hạn tốc độ (Rate Limit) từ Google, bạn <b>bắt buộc phải nhập ít nhất 2 API Key</b>.
                            </p>
                        </div>
                    </div>
                </div>

                <p className="mt-4 text-sm text-slate-600">
                    Vui lòng thêm đủ 2 API Key của Google Gemini để bắt đầu sử dụng ứng dụng.
                </p>
                <div className="mt-8">
                    <button
                        onClick={onOpenModal}
                        className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                    >
                        <KeyIcon className="w-5 h-5 mr-2" />
                        Nhập API Key
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ApiKeyPromptScreen;