

import React, { useState } from 'react';
import { ExamConfig } from '../types';
import { BalDigitechLogo } from './icons';

interface ConfigurationScreenProps {
    onConfigSubmit: (config: ExamConfig) => void;
}

const initialConfig: ExamConfig = {
    schoolName: 'TRƯỜNG THPT SỐ 3 BẢO THẮNG',
    departmentName: 'TỔ SỬ- ĐỊA- GDCD- TD-QP',
    subject: 'LỊCH SỬ 10',
    schoolYear: `NĂM HỌC ${new Date().getFullYear() - 1} - ${new Date().getFullYear()}`,
    examCode: '301',
    examTime: 'KIỂM TRA CUỐI HỌC KỲ II',
    duration: '45 phút',
    mcPoints: 5.0,
    essayPoints: 5.0,
    knowledgePct: 40,
    comprehensionPct: 30,
    applicationPct: 30,
};

// Helper to convert the typed config object to an object of strings
const stringifyConfig = (config: ExamConfig): { [key in keyof ExamConfig]: string } => {
    const stringified: { [key: string]: string } = {};
    for (const key in config) {
        stringified[key] = String(config[key as keyof ExamConfig]);
    }
    return stringified as { [key in keyof ExamConfig]: string };
};

// --- Helper Components ---
const InfoCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 h-full">
        <h3 className="font-semibold text-slate-700 mb-3">{title}</h3>
        <div className="space-y-3">{children}</div>
    </div>
);

const LabeledInput: React.FC<{ label: string; name: string; value: string; type?: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }> = ({ label, name, value, type = 'text', onChange }) => (
    <div>
        <label htmlFor={name} className="block text-sm font-medium text-slate-600">{label}</label>
        <input
            id={name}
            name={name}
            type={type}
            value={value}
            onChange={onChange}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
        />
    </div>
);
// --- End Helper Components ---

const ConfigurationScreen: React.FC<ConfigurationScreenProps> = ({ onConfigSubmit }) => {
    const [formValues, setFormValues] = useState(stringifyConfig(initialConfig));

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormValues(prev => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Parse string values back to numbers where needed
        const finalConfig: ExamConfig = {
            schoolName: formValues.schoolName,
            departmentName: formValues.departmentName,
            subject: formValues.subject,
            schoolYear: formValues.schoolYear,
            examCode: formValues.examCode,
            examTime: formValues.examTime,
            duration: formValues.duration,
            mcPoints: parseFloat(formValues.mcPoints) || 0,
            essayPoints: parseFloat(formValues.essayPoints) || 0,
            knowledgePct: parseInt(formValues.knowledgePct, 10) || 0,
            comprehensionPct: parseInt(formValues.comprehensionPct, 10) || 0,
            applicationPct: parseInt(formValues.applicationPct, 10) || 0,
        };
        onConfigSubmit(finalConfig);
    };


    return (
        <div className="flex flex-col items-center justify-center p-4 flex-grow">
             <div className="w-full max-w-6xl">
                <header className="text-center mb-8">
                    <div className="flex justify-center items-center gap-3">
                         <BalDigitechLogo className="h-10 w-10 text-primary-600" />
                         <h1 className="text-3xl font-bold text-slate-800">Cấu hình Khung Ma trận Đề thi</h1>
                    </div>
                    <p className="text-slate-500 mt-2">Thiết lập các thông số cơ bản cho đề thi của bạn theo đúng quy định.</p>
                </header>

                <main className="bg-white p-8 rounded-xl shadow-lg border border-slate-200">
                    <form onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <InfoCard title="Thông tin Trường học">
                                <LabeledInput label="Tên trường" name="schoolName" value={formValues.schoolName} onChange={handleChange} />
                                <LabeledInput label="Tổ chuyên môn" name="departmentName" value={formValues.departmentName} onChange={handleChange} />
                            </InfoCard>

                            <InfoCard title="Thông tin chung">
                                <LabeledInput label="Tên kỳ thi" name="examTime" value={formValues.examTime} onChange={handleChange} />
                                <LabeledInput label="Môn học" name="subject" value={formValues.subject} onChange={handleChange} />
                                <LabeledInput label="Năm học" name="schoolYear" value={formValues.schoolYear} onChange={handleChange} />
                                <LabeledInput label="Thời gian làm bài" name="duration" value={formValues.duration} onChange={handleChange} />
                                <LabeledInput label="Mã đề (tùy chọn)" name="examCode" value={formValues.examCode} onChange={handleChange} />
                            </InfoCard>

                            <InfoCard title="Cấu trúc Điểm & Tỉ lệ">
                                <div className='grid grid-cols-2 gap-3'>
                                    <LabeledInput label="Tổng điểm Trắc nghiệm" name="mcPoints" type="number" value={formValues.mcPoints} onChange={handleChange} />
                                    <LabeledInput label="Tổng điểm Tự luận" name="essayPoints" type="number" value={formValues.essayPoints} onChange={handleChange} />
                                </div>
                                <div className="grid grid-cols-3 gap-3 pt-2">
                                    <LabeledInput label="Tỉ lệ Biết (%)" name="knowledgePct" type="number" value={formValues.knowledgePct} onChange={handleChange} />
                                    <LabeledInput label="Tỉ lệ Hiểu (%)" name="comprehensionPct" type="number" value={formValues.comprehensionPct} onChange={handleChange} />
                                    <LabeledInput label="Tỉ lệ Vận dụng (%)" name="applicationPct" type="number" value={formValues.applicationPct} onChange={handleChange} />
                                </div>
                            </InfoCard>
                        </div>

                        <div className="mt-10 pt-6 border-t border-slate-200 text-center">
                            <button type="submit" className="w-full sm:w-auto inline-flex items-center justify-center px-10 py-3 border border-transparent text-base font-medium rounded-full shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                                Xác nhận và Tải lên tài liệu
                            </button>
                        </div>
                    </form>
                </main>
            </div>
        </div>
    );
};

export default ConfigurationScreen;