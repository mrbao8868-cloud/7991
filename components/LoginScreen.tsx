
import React, { useState, useEffect } from 'react';
import { BalDigitechLogo, LockClosedIcon, UserIcon, ExclamationTriangleIcon } from './icons';
import Spinner from './Spinner';

interface LoginScreenProps {
    onLoginSuccess: () => void;
}

const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQNS3-25sKdmP3r4lzVhuRzon9f8q-gbqgsclgQ8sajtTcrgHtDoHgLxNIKVXz4DaKbjmqy5EK6y3I2/pub?gid=0&single=true&output=csv';

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [userIp, setUserIp] = useState<string>('Đang lấy...');

    useEffect(() => {
        // Fetch public IP address
        fetch('https://api.ipify.org?format=json')
            .then(res => res.json())
            .then(data => setUserIp(data.ip))
            .catch(() => setUserIp('Không xác định'));
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        if (!username.trim() || !password.trim()) {
             setError('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
             setIsLoading(false);
             return;
        }

        try {
            const response = await fetch(GOOGLE_SHEET_CSV_URL);
            if (!response.ok) {
                throw new Error('Không thể kết nối đến máy chủ xác thực.');
            }
            const text = await response.text();
            
            const rows = text.split(/\r?\n/).map(row => row.split(','));
            
            const userFound = rows.slice(1).some(row => {
                if (row.length < 2) return false;
                const u = row[0].trim();
                const p = row[1].trim();
                return u === username.trim() && p === password.trim();
            });

            if (userFound) {
                onLoginSuccess();
            } else {
                setError('Tên đăng nhập hoặc mật khẩu không đúng.');
            }

        } catch (err) {
            setError('Đã xảy ra lỗi khi kết nối. Vui lòng kiểm tra kết nối mạng và thử lại.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center">
                    <BalDigitechLogo className="h-20 w-20 text-primary-600" />
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
                    Đăng nhập
                </h2>
                <p className="mt-2 text-center text-sm text-slate-600">
                    Ứng dụng tạo đề thi theo công văn 7991
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-200">
                    <form className="space-y-6" onSubmit={handleLogin}>
                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-slate-700">
                                Tên đăng nhập
                            </label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <UserIcon className="h-5 w-5 text-slate-400" />
                                </div>
                                <input
                                    id="username"
                                    name="username"
                                    type="text"
                                    autoComplete="username"
                                    required
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="focus:ring-primary-500 focus:border-primary-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 px-3 border"
                                    placeholder="Nhập tên đăng nhập"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                                Mật khẩu
                            </label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <LockClosedIcon className="h-5 w-5 text-slate-400" />
                                </div>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="focus:ring-primary-500 focus:border-primary-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 px-3 border"
                                    placeholder="Nhập mật khẩu"
                                />
                            </div>
                        </div>

                        <div className="p-3 bg-amber-50 rounded-md border border-amber-200">
                            <div className="flex items-center gap-2 text-amber-800 text-sm font-semibold">
                                <ExclamationTriangleIcon className="w-4 h-4 text-amber-600" />
                                Địa chỉ IP của bạn: <span className="font-mono bg-amber-100 px-1.5 rounded">{userIp}</span>
                            </div>
                            <p className="mt-2 text-[11px] text-red-600 font-bold uppercase leading-tight">
                                Cảnh báo: Nếu chia sẻ cho máy tính khác sẽ xóa tài khoản
                            </p>
                        </div>

                        {error && (
                            <div className="rounded-md bg-red-50 p-4">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-red-800">
                                            Đăng nhập thất bại
                                        </h3>
                                        <div className="mt-2 text-sm text-red-700">
                                            <p>{error}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-primary-300 disabled:cursor-not-allowed transition-all"
                            >
                                {isLoading ? (
                                    <>
                                        <Spinner />
                                        <span className="ml-2">Đang xử lý...</span>
                                    </>
                                ) : (
                                    'Đăng nhập'
                                )}
                            </button>
                        </div>
                    </form>

                    <div className="mt-6">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-slate-300" />
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-white text-slate-500">
                                    Trung tâm Tin học ứng dụng Bal Digitech
                                </span>
                            </div>
                        </div>

                        <div className="mt-6 text-center text-xs text-slate-400">
                           <p>Liên hệ: 0972.300.864 - Thầy Giới</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
