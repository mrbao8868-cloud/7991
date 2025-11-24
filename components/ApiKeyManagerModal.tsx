import React, { useState } from 'react';
import { KeyIcon, ExclamationTriangleIcon, TrashIcon } from './icons';

interface ApiKeyManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    keys: string[];
    activeKey: string | null;
    onAddKey: (key: string) => void;
    onDeleteKey: (key: string) => void;
    onSetActiveKey: (key: string) => void;
    errorMessage?: string | null;
    isClosable?: boolean;
}

const ApiKeyManagerModal: React.FC<ApiKeyManagerModalProps> = ({ 
    isOpen, 
    onClose, 
    keys, 
    activeKey, 
    onAddKey, 
    onDeleteKey, 
    onSetActiveKey, 
    errorMessage,
    isClosable = true 
}) => {
    const [newKey, setNewKey] = useState('');

    if (!isOpen) {
        return null;
    }

    const handleAddClick = () => {
        const keysToAdd = newKey
            .split(/[,\n\s]+/)
            .map(k => k.trim())
            .filter(k => k.length > 0);
    
        if (keysToAdd.length > 0) {
            keysToAdd.forEach(onAddKey);
            setNewKey('');
        }
    };

    const maskKey = (key: string) => {
        if (key.length < 12) return key;
        return `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
    };

    const remainingKeys = Math.max(0, 4 - keys.length);

    return (
        <div 
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" 
            aria-labelledby="modal-title" 
            role="dialog" 
            aria-modal="true"
            onClick={isClosable ? onClose : undefined}
        >
            <div 
                className="bg-white rounded-lg shadow-2xl max-w-lg w-full transform transition-all"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6">
                    <div className="flex items-start">
                        <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-primary-100 sm:mx-0">
                            <KeyIcon className="h-6 w-6 text-primary-600" />
                        </div>
                        <div className="ml-4 text-left flex-grow">
                            <h3 className="text-lg leading-6 font-bold text-slate-900" id="modal-title">
                                Quản lý Khóa API
                            </h3>
                            <div className="mt-1 text-sm text-slate-500">
                                <p>Thêm và chọn Khóa API của Google AI Studio.</p>
                                <p className="text-red-600 font-bold mt-1">
                                    {remainingKeys > 0 
                                        ? `Bắt buộc thêm ${remainingKeys} khóa nữa để bắt đầu (Tối thiểu 4).`
                                        : 'Đã đủ số lượng khóa yêu cầu.'}
                                </p>
                            </div>
                        </div>
                         {isClosable && (
                            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
                         )}
                    </div>
                     {errorMessage && (
                        <div className="mt-4 bg-red-50 border-l-4 border-red-400 p-4">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
                                </div>
                                <div className="ml-3">
                                    <p className="text-sm text-red-700">{errorMessage}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mt-6">
                        <h4 className="font-semibold text-slate-700 mb-2">Thêm Khóa API mới</h4>
                        <div className="flex items-start space-x-2">
                            <textarea
                                value={newKey}
                                onChange={(e) => setNewKey(e.target.value)}
                                placeholder="Dán các Khóa API vào đây, phân cách bằng dấu phẩy, dấu cách hoặc xuống dòng."
                                className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                                rows={3}
                            />
                            <button
                                onClick={handleAddClick}
                                disabled={!newKey.trim()}
                                className="flex-shrink-0 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 disabled:bg-slate-400"
                            >
                                Thêm
                            </button>
                        </div>
                    </div>
                    
                    <div className="mt-6">
                        <div className="flex justify-between items-end mb-2">
                            <h4 className="font-semibold text-slate-700">Các khóa đã lưu</h4>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${keys.length >= 4 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {keys.length}/4 Khóa ({remainingKeys > 0 ? `Thiếu ${remainingKeys}` : 'Đủ'})
                            </span>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                            {keys.length > 0 ? keys.map(key => (
                                <div key={key} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                                    <div className="flex items-center">
                                        <span className="font-mono text-sm text-slate-700">{maskKey(key)}</span>
                                        {key === activeKey && (
                                            <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                Đang hoạt động
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        {key !== activeKey && (
                                            <button onClick={() => onSetActiveKey(key)} className="text-sm font-medium text-primary-600 hover:text-primary-800">
                                                Kích hoạt
                                            </button>
                                        )}
                                        <button onClick={() => onDeleteKey(key)} className="text-slate-400 hover:text-red-600 p-1">
                                            <TrashIcon className="w-4 h-4"/>
                                        </button>
                                    </div>
                                </div>
                            )) : (
                                <p className="text-center text-sm text-slate-500 py-4">Chưa có Khóa API nào được lưu.</p>
                            )}
                        </div>
                    </div>
                </div>
                <div className="bg-slate-50 px-6 py-4 flex justify-between items-center rounded-b-lg">
                    <a 
                        href="https://drive.google.com/file/d/1dz8gHGlcnd_gpVf9f2zAK4CrqZcPyLmP/view?usp=sharing" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-sm font-medium text-primary-700 hover:underline"
                    >
                        Video hướng dẫn lấy API
                    </a>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={!isClosable}
                        className="px-4 py-2 bg-white text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 rounded-md disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                    >
                        {isClosable ? 'Đóng & Bắt đầu' : `Thêm ${remainingKeys} khóa nữa để tiếp tục`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ApiKeyManagerModal;