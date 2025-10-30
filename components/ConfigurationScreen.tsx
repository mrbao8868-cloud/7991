import React, { useState, useEffect } from 'react';
import { ExamConfig, InitialAnalysisResult, ExamDifficulty } from '../types';
import { BalDigitechLogo, ExclamationTriangleIcon } from './icons';

interface ConfigurationScreenProps {
    analysisResult: InitialAnalysisResult;
    onConfigSubmit: (config: ExamConfig) => void;
    onBack: () => void;
}

const defaultInitialConfig: Omit<ExamConfig, 'schoolName' | 'departmentName' | 'subjectsSummary' | 'examTime' | 'isMultiSubject'> = {
    schoolYear: `NĂM HỌC ${new Date().getFullYear()} - ${new Date().getFullYear() + 1}`,
    examCode: '301',
    duration: '45 phút',
    tnkqPoints: 7,
    essayPoints: 3,
    mcCount: 20,
    tfCount: 4,
    saCount: 4,
    essayCount: 1,
    knowledgePct: 40,
    comprehensionPct: 30,
    applicationPct: 30,
    difficulty: ExamDifficulty.MEDIUM,
};

const stringifyConfig = (config: Partial<ExamConfig>): { [key: string]: string } => {
    const stringified: { [key: string]: string } = {};
    for (const key in config) {
        stringified[key] = String(config[key as keyof ExamConfig] ?? '');
    }
    return stringified;
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

const ConfigurationScreen: React.FC<ConfigurationScreenProps> = ({ analysisResult, onConfigSubmit, onBack }) => {
    const [formValues, setFormValues] = useState(() => {
        const isMulti = analysisResult.subjects.length > 1;
        const subjectsText = analysisResult.subjects.join(' - ');

        const initialConfig: ExamConfig = {
            schoolName: analysisResult.schoolName || 'TRƯỜNG THPT SỐ 3 BẢO THẮNG',
            departmentName: analysisResult.departmentName || 'TỔ CHUYÊN MÔN',
            subjectsSummary: subjectsText,
            examTime: analysisResult.examTitle || 'KIỂM TRA CUỐI HỌC KỲ II',
            isMultiSubject: isMulti,
            ...defaultInitialConfig,
        };
        return stringifyConfig(initialConfig);
    });

    const [allocations, setAllocations] = useState<{ subjectName: string; percentage: string }[]>(
      () => analysisResult.subjects.map(s => ({ subjectName: s, percentage: '' }))
    );
    const [allocationError, setAllocationError] = useState<string | null>(null);

    const isMultiSubject = analysisResult.subjects.length > 1;

     useEffect(() => {
        if (!isMultiSubject) {
            setAllocationError(null);
            return;
        }
        const totalPct = allocations.reduce((sum, alloc) => sum + (Number(alloc.percentage) || 0), 0);
        if (totalPct !== 100) {
            setAllocationError(`Tổng tỉ lệ phải bằng 100%. Hiện tại là ${totalPct}%.`);
        } else {
            setAllocationError(null);
        }
    }, [allocations, isMultiSubject]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormValues(prev => ({ ...prev, [name]: value }));
    };

    const handleAllocationChange = (index: number, value: string) => {
        const newAllocations = [...allocations];
        newAllocations[index].percentage = value;
        setAllocations(newAllocations);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (allocationError) return;

        const finalConfig: ExamConfig = {
            schoolName: formValues.schoolName,
            departmentName: formValues.departmentName,
            subjectsSummary: formValues.subjectsSummary,
            schoolYear: formValues.schoolYear,
            examCode: formValues.examCode,
            examTime: formValues.examTime,
            duration: formValues.duration,
            isMultiSubject: isMultiSubject,
            subjectAllocations: isMultiSubject ? allocations.map(a => ({...a, percentage: Number(a.percentage) || 0})) : undefined,
            tnkqPoints: parseInt(formValues.tnkqPoints, 10) || 0,
            essayPoints: parseInt(formValues.essayPoints, 10) || 0,
            mcCount: parseInt(formValues.mcCount, 10) || 0,
            tfCount: parseInt(formValues.tfCount, 10) || 0,
            saCount: parseInt(formValues.saCount, 10) || 0,
            essayCount: parseInt(formValues.essayCount, 10) || 0,
            knowledgePct: parseInt(formValues.knowledgePct, 10) || 0,
            comprehensionPct: parseInt(formValues.comprehensionPct, 10) || 0,
            applicationPct: parseInt(formValues.applicationPct, 10) || 0,
            difficulty: formValues.difficulty as ExamDifficulty,
        };
        onConfigSubmit(finalConfig);
    };


    return (
        <div className="flex flex-col items-center justify-center p-4 flex-grow">
             <div className="w-full max-w-7xl">
                <header className="text-center mb-8">
                    <div className="flex justify-center items-center gap-3">
                         <BalDigitechLogo className="h-10 w-10 text-primary-600" />
                         <h1 className="text-3xl font-bold text-slate-800">Cấu hình Khung Ma trận Đề thi</h1>
                    </div>
                    <p className="text-slate-500 mt-2">AI đã phân tích tài liệu của bạn. Vui lòng kiểm tra và xác nhận các thông số dưới đây.</p>
                </header>

                <main className="bg-white p-8 rounded-xl shadow-lg border border-slate-200">
                    <form onSubmit={handleSubmit}>
                        <div className={`grid grid-cols-1 ${isMultiSubject ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-6`}>
                            <InfoCard title="Thông tin Trường học">
                                <LabeledInput label="Tên trường" name="schoolName" value={formValues.schoolName} onChange={handleChange} />
                                <LabeledInput label="Tổ chuyên môn" name="departmentName" value={formValues.departmentName} onChange={handleChange} />
                            </InfoCard>

                             {isMultiSubject && (
                                <InfoCard title="Phân bổ Môn học">
                                    <p className="text-sm text-slate-500 -mt-1 mb-3">Tài liệu của bạn là tài liệu liên môn. Vui lòng nhập tỉ lệ % ra đề cho mỗi môn.</p>
                                    {allocations.map((alloc, index) => (
                                         <LabeledInput 
                                            key={alloc.subjectName}
                                            label={`${alloc.subjectName} (%)`} 
                                            name={`alloc_${index}`}
                                            type="number" 
                                            value={alloc.percentage} 
                                            onChange={(e) => handleAllocationChange(index, e.target.value)}
                                        />
                                    ))}
                                    {allocationError && (
                                        <div className="flex items-start text-xs text-red-700 bg-red-50 p-2 rounded-md">
                                             <ExclamationTriangleIcon className="h-4 w-4 mr-1.5 mt-0.5 flex-shrink-0" />
                                             {allocationError}
                                        </div>
                                    )}
                                </InfoCard>
                            )}


                            <InfoCard title="Thông tin chung">
                                <LabeledInput label="Tên kỳ thi" name="examTime" value={formValues.examTime} onChange={handleChange} />
                                <LabeledInput label="Môn học" name="subjectsSummary" value={formValues.subjectsSummary} onChange={handleChange} />
                                <LabeledInput label="Năm học" name="schoolYear" value={formValues.schoolYear} onChange={handleChange} />
                                <LabeledInput label="Thời gian làm bài" name="duration" value={formValues.duration} onChange={handleChange} />
                                <LabeledInput label="Mã đề (tùy chọn)" name="examCode" value={formValues.examCode} onChange={handleChange} />
                            </InfoCard>

                            <InfoCard title="Cấu trúc Đề thi & Tỉ lệ">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600">Độ khó đề thi</label>
                                    <div className="mt-2 grid grid-cols-3 gap-2">
                                        {Object.values(ExamDifficulty).map((level) => (
                                            <div key={level}>
                                                <label
                                                    htmlFor={`difficulty-${level}`}
                                                    className={`block w-full text-center cursor-pointer rounded-md border p-2 text-sm font-medium ${
                                                        formValues.difficulty === level
                                                            ? 'border-primary-500 bg-primary-50 text-primary-900 ring-2 ring-primary-500'
                                                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    {level}
                                                </label>
                                                <input
                                                    id={`difficulty-${level}`}
                                                    name="difficulty"
                                                    type="radio"
                                                    value={level}
                                                    checked={formValues.difficulty === level}
                                                    onChange={handleChange}
                                                    className="sr-only"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 mt-4">
                                     <LabeledInput label="Điểm TNKQ" name="tnkqPoints" type="number" value={formValues.tnkqPoints} onChange={handleChange} />
                                     <LabeledInput label="Điểm Tự luận" name="essayPoints" type="number" value={formValues.essayPoints} onChange={handleChange} />
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 mt-4">
                                    <LabeledInput label="Nhiều lựa chọn" name="mcCount" type="number" value={formValues.mcCount} onChange={handleChange} />
                                    <LabeledInput label="Đúng/Sai" name="tfCount" type="number" value={formValues.tfCount} onChange={handleChange} />
                                    <LabeledInput label="Trả lời ngắn" name="saCount" type="number" value={formValues.saCount} onChange={handleChange} />
                                    <LabeledInput label="Tự luận" name="essayCount" type="number" value={formValues.essayCount} onChange={handleChange} />
                                </div>
                                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-200 mt-4">
                                    <LabeledInput label="Biết (%)" name="knowledgePct" type="number" value={formValues.knowledgePct} onChange={handleChange} />
                                    <LabeledInput label="Hiểu (%)" name="comprehensionPct" type="number" value={formValues.comprehensionPct} onChange={handleChange} />
                                    <LabeledInput label="Vận dụng (%)" name="applicationPct" type="number" value={formValues.applicationPct} onChange={handleChange} />
                                </div>
                            </InfoCard>
                        </div>

                        <div className="mt-10 pt-6 border-t border-slate-200 flex flex-col sm:flex-row justify-center items-center gap-4">
                            <button type="button" onClick={onBack} className="w-full sm:w-auto px-10 py-3 border border-slate-300 text-base font-medium rounded-full shadow-sm text-slate-700 bg-white hover:bg-slate-50">
                                Quay lại
                            </button>
                            <button type="submit" disabled={!!allocationError} className="w-full sm:w-auto inline-flex items-center justify-center px-10 py-3 border border-transparent text-base font-medium rounded-full shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-slate-400 disabled:cursor-not-allowed">
                                Tạo Ma trận chi tiết
                            </button>
                        </div>
                    </form>
                </main>
            </div>
        </div>
    );
};

export default ConfigurationScreen;
