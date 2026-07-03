import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../LanguageContext';
import { loadApiKey, saveApiKey, clearApiKey } from '../services/storageUtils';
import { isGoogleLoginEnabled, renderGoogleButton, loadGoogleProfile, GoogleProfile } from '../services/googleAuth';
import { MagicWandIcon } from './Icons';

import { ApiKeyModal } from './ApiKeyModal';

interface LandingPageProps {
    onStart: (key: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
    const { language, setLanguage: setSysLang, t } = useLanguage();
    const [key, setKey] = useState("");
    const [remember, setRemember] = useState(false);
    const [showGuideModal, setShowGuideModal] = useState(false);
    const [profile, setProfile] = useState<GoogleProfile | null>(() => loadGoogleProfile());
    const googleBtnRef = useRef<HTMLDivElement>(null);

    const toggleLang = () => {
        setSysLang(language === 'zh' ? 'en' : 'zh');
    };

    useEffect(() => {
        const stored = loadApiKey();
        if (stored) {
            setKey(stored);
            setRemember(true);
        }
    }, []);

    useEffect(() => {
        if (isGoogleLoginEnabled() && googleBtnRef.current && !profile) {
            renderGoogleButton(googleBtnRef.current, setProfile).catch(e => console.warn(e));
        }
    }, [profile]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = key.trim();
        if (trimmed.length > 10) {
            if (remember) {
                saveApiKey(trimmed);
            } else {
                clearApiKey();
            }
            onStart(trimmed);
        } else {
            alert(t('invalidKey'));
        }
    };



    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 text-white p-6 relative overflow-hidden">
            <ApiKeyModal isOpen={showGuideModal} onClose={() => setShowGuideModal(false)} />

            {/* Language Toggle */}
            <button
                onClick={toggleLang}
                className="absolute top-6 right-6 z-50 bg-white/10 backdrop-blur border border-white/20 px-4 py-2 rounded-full font-bold hover:bg-white/20 transition-all text-sm flex items-center gap-2"
            >
                <span>🌐</span> {language === 'zh' ? 'English' : '繁體中文'}
            </button>

            {/* Background Decorations */}
            <div className="absolute top-20 left-20 w-72 h-72 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
            <div className="absolute top-20 right-20 w-72 h-72 bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
            <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-pink-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

            <div className="max-w-md w-full bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-8 shadow-2xl relative z-10">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-24 h-24 bg-white/10 rounded-3xl mb-4 shadow-lg transform rotate-3 hover:rotate-6 transition-transform overflow-hidden backdrop-blur-sm border border-white/20">
                        <img src="./logo.png" alt="DreamSticker AI" className="w-full h-full object-cover" />
                    </div>
                    <h1 className="text-4xl font-black mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-indigo-200">DreamSticker AI</h1>
                    <p className="text-indigo-200">{t('landingTitle')}</p>
                </div>

                {isGoogleLoginEnabled() && (
                    <div className="mb-6 flex flex-col items-center gap-3">
                        {profile ? (
                            <div className="flex items-center gap-3 bg-white/10 border border-white/20 rounded-full pl-1.5 pr-4 py-1.5">
                                <img src={profile.picture} alt={profile.name} referrerPolicy="no-referrer" className="w-8 h-8 rounded-full" />
                                <div className="text-left">
                                    <p className="text-xs font-bold text-white leading-tight">{profile.name}</p>
                                    <p className="text-[10px] text-indigo-300 leading-tight">{profile.email}</p>
                                </div>
                            </div>
                        ) : (
                            <div ref={googleBtnRef} className="flex justify-center min-h-[44px]" />
                        )}
                        <div className="w-full flex items-center gap-3 text-[10px] text-white/30">
                            <div className="flex-1 h-px bg-white/10"></div>
                            <span>API Key</span>
                            <div className="flex-1 h-px bg-white/10"></div>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-indigo-200 mb-2">{t('apiKeyLabel')}</label>
                        <input
                            type="password"
                            required
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            placeholder={t('apiKeyPlaceholder')}
                            className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
                        />
                    </div>

                    <label className="flex items-center gap-2 text-xs text-indigo-200 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={remember}
                            onChange={(e) => setRemember(e.target.checked)}
                            className="w-4 h-4 rounded accent-indigo-500"
                        />
                        {t('rememberKey')}
                    </label>

                    <button
                        type="submit"
                        className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg transform transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                    >
                        <span>{t('startBtn')}</span>
                        <MagicWandIcon />
                    </button>
                </form>

                <div className="mt-6 text-center text-xs text-indigo-300 flex flex-col items-center gap-2">
                    <p>{t('noKey')}</p>
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-amber-300 underline hover:text-amber-100 font-bold text-sm bg-black/30 px-4 py-2 rounded-full border border-amber-500/30 hover:border-amber-400 transition-all">
                        {t('getBillingKey')}
                    </a>

                    <button
                        onClick={() => setShowGuideModal(true)}
                        className="mt-2 text-white/50 hover:text-white underline text-[10px] transition-colors flex items-center gap-1"
                    >
                        {t('howToApply')} <span className="text-[8px]">▶</span>
                    </button>
                </div>
                <div className="mt-4 text-center text-[10px] text-white/40">
                    <p>{t('localSave')}</p>
                </div>
            </div>
        </div>
    );
};
