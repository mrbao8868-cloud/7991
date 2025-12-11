
import React, { useState, useRef, useEffect } from 'react';
import { ChatBubbleLeftRightIcon, PaperAirplaneIcon, SparkleIcon } from './icons';
import { sendChatMessage } from '../services/geminiService';

interface ChatbotProps {
    activeApiKey: string | null;
}

const Chatbot: React.FC<ChatbotProps> = ({ activeApiKey }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [messages, setMessages] = useState<any[]>([
        { 
            id: 'welcome', 
            role: 'model', 
            text: 'Xin chào! Tôi là trợ lý ảo hướng dẫn sử dụng phần mềm. Tôi chỉ hỗ trợ giải đáp các thắc mắc về cách sử dụng ứng dụng (Tải file, cấu hình, tạo đề). Tôi không giải đáp các câu hỏi kiến thức khác.' 
        }
    ]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!input.trim()) return;

        // Check if API key is available from the main app
        if (!activeApiKey) {
            setMessages(prev => [...prev, { 
                id: crypto.randomUUID(), 
                role: 'model', 
                text: 'Vui lòng nhập và kích hoạt API Key trong ứng dụng chính trước khi sử dụng Chatbot.' 
            }]);
            return;
        }

        const userMessage = { id: crypto.randomUUID(), role: 'user', text: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            // Prepare history for Gemini
            // We map 'model' role, the API expects 'model' or 'user'
            const history = messages.map(m => ({
                role: m.role as 'user' | 'model',
                parts: [{ text: m.text }]
            }));

            // Use the user's active API key
            const responseText = await sendChatMessage(activeApiKey, history, userMessage.text);
            
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: responseText }]);

        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: 'Đã xảy ra lỗi kết nối với AI (API Key có thể bị lỗi hoặc hết hạn ngạch). Vui lòng kiểm tra lại Key.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
            {/* Custom Scrollbar Styles - Updated for better cross-browser support */}
            <style>{`
                .scrollbar-custom {
                    scrollbar-width: thin;
                    scrollbar-color: #cbd5e1 #f8fafc;
                }
                .scrollbar-custom::-webkit-scrollbar {
                    width: 8px;
                }
                .scrollbar-custom::-webkit-scrollbar-track {
                    background: #f8fafc;
                    border-radius: 4px;
                }
                .scrollbar-custom::-webkit-scrollbar-thumb {
                    background-color: #cbd5e1;
                    border-radius: 4px;
                    border: 2px solid #f8fafc;
                }
                .scrollbar-custom::-webkit-scrollbar-thumb:hover {
                    background-color: #94a3b8;
                }
            `}</style>

            {/* Chat Window */}
            {isOpen && (
                <div className="mb-4 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col pointer-events-auto transition-all duration-200 origin-bottom-right">
                    {/* Header */}
                    <div className="bg-primary-600 p-4 flex justify-between items-center text-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <SparkleIcon className="w-5 h-5" />
                            <h3 className="font-semibold">Hướng dẫn sử dụng</h3>
                        </div>
                        <button 
                            onClick={() => setIsOpen(false)}
                            className="text-white/80 hover:text-white hover:bg-white/10 rounded-full p-1"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                            </svg>
                        </button>
                    </div>

                    {/* Messages Area - Fixed height and scrollable */}
                    <div className="h-[400px] overflow-y-auto p-4 bg-slate-50 scrollbar-custom space-y-4">
                        {messages.map((msg) => (
                            <div 
                                key={msg.id} 
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm break-words whitespace-pre-wrap ${
                                    msg.role === 'user' 
                                        ? 'bg-primary-600 text-white rounded-br-none' 
                                        : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'
                                }`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none px-4 py-2 shadow-sm">
                                    <div className="flex space-x-1">
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-3 bg-white border-t border-slate-200 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Hỏi về cách dùng phần mềm..."
                                disabled={isLoading}
                                className="flex-1 px-4 py-2 bg-slate-100 border-0 rounded-full text-sm focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all outline-none"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isLoading}
                                className="p-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <PaperAirplaneIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Launcher Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="bg-primary-600 hover:bg-primary-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200 pointer-events-auto flex items-center justify-center group"
            >
                {isOpen ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                ) : (
                    <>
                        <ChatBubbleLeftRightIcon className="w-7 h-7 group-hover:scale-110 transition-transform" />
                        <span className="absolute right-1 top-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                        </span>
                    </>
                )}
            </button>
        </div>
    );
};

export default Chatbot;
