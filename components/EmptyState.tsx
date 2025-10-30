import React from 'react';
import { DocumentTextIcon } from './icons';

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    message: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, message }) => {
    return (
        <div className="text-center p-8 sm:p-12 bg-slate-50 rounded-lg shadow-inner min-h-[400px] flex flex-col justify-center items-center">
            <div className="flex items-center justify-center w-16 h-16 bg-slate-200 rounded-full">
                {icon || <DocumentTextIcon className="w-8 h-8 text-slate-500" />}
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mt-4">{title}</h3>
            <p className="text-slate-500 mt-2 max-w-md">{message}</p>
        </div>
    );
};

export default EmptyState;