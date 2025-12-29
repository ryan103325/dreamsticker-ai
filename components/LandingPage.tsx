import React, { useState, useEffect } from 'react';
import { StickerIcon, MagicWandIcon } from './Icons';

interface LandingPageProps {
    onStart: (key: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
    const [key, setKey] = useState("");

    useEffect(() => {
        const stored = localStorage.getItem('gemini_api_key');
        if (stored) setKey(stored);
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (key.trim().length > 10) {
            onStart(key.trim());
        } else {
            alert("請輸入有效的 API Key");
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 text-white p-6 relative overflow-hidden">
            {/* Background Decorations */}
            <div className="absolute top-20 left-20 w-72 h-72 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
            <div className="absolute top-20 right-20 w-72 h-72 bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
            <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-pink-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

            <div className="max-w-md w-full bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-8 shadow-2xl relative z-10">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-2xl mb-4 shadow-lg transform rotate-3 hover:rotate-6 transition-transform">
                        <StickerIcon />
                    </div>
                    <h1 className="text-4xl font-black mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-indigo-200">DreamSticker AI</h1>
                    <p className="text-indigo-200">打造您的專屬 Line 貼圖 IP</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-indigo-200 mb-2">Google Gemini API Key</label>
                        <input
                            type="password"
                            required
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            placeholder="AIzaSy..."
                            className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg transform transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                    >
                        <span>開始創作</span>
                        <MagicWandIcon />
                    </button>
                </form>

                <div className="mt-6 text-center text-xs text-indigo-300">
                    <p>沒有 API Key?</p>
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-white underline hover:text-indigo-200 mt-1 inline-block">
                        前往 Google AI Studio 免費獲取
                    </a>
                </div>
                <div className="mt-4 text-center text-[10px] text-white/40">
                    <p>您的 Key 僅儲存於本地瀏覽器，不會上傳至伺服器。</p>
                </div>
            </div>
        </div>
    );
};
