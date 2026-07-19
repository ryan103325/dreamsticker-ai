import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../LanguageContext';
import { loadApiKey, saveApiKey, clearApiKey } from '../services/storageUtils';
import { getOpenAIApiKey, saveOpenAIApiKey, clearOpenAIApiKey } from '../services/openaiImageService';
import { getHFToken, saveHFToken, clearHFToken } from '../services/hfImageService';
import { isGoogleLoginEnabled, renderGoogleButton, loadGoogleProfile, GoogleProfile } from '../services/googleAuth';
import { MagicWandIcon } from './Icons';

import { ApiKeyModal } from './ApiKeyModal';
import { useToast } from './Toast';

interface LandingPageProps {
    onStart: (key: string, openaiKey?: string, hfToken?: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
    const { language, setLanguage: setSysLang, t } = useLanguage();
    const toast = useToast();
    const [key, setKey] = useState("");
    const [openaiKey, setOpenaiKey] = useState("");
    const [hfToken, setHfToken] = useState("");
    const [showAdvanced, setShowAdvanced] = useState(false);
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
        const storedOpenai = getOpenAIApiKey();
        if (storedOpenai) {
            setOpenaiKey(storedOpenai);
            setShowAdvanced(true);
        }
        const storedHf = getHFToken();
        if (storedHf) {
            setHfToken(storedHf);
            setShowAdvanced(true);
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
        const trimmedOpenai = openaiKey.trim();
        const trimmedHf = hfToken.trim();
        if (trimmed.length > 10) {
            if (remember) {
                saveApiKey(trimmed);
                if (trimmedOpenai) saveOpenAIApiKey(trimmedOpenai);
                else clearOpenAIApiKey();
                if (trimmedHf) saveHFToken(trimmedHf);
                else clearHFToken();
            } else {
                clearApiKey();
                clearOpenAIApiKey();
                clearHFToken();
            }
            onStart(trimmed, trimmedOpenai || undefined, trimmedHf || undefined);
        } else {
            toast(t('invalidKey'), 'error');
        }
    };



    return (
        // Direction "modern-cute but restrained": one warm surface, a single
        // coral accent, solid cards/buttons — no gradient blobs, no
        // glassmorphism, no decorative gradients (the old "AI look").
        <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#FBF7F4] text-slate-900 p-6 relative">
            <ApiKeyModal isOpen={showGuideModal} onClose={() => setShowGuideModal(false)} />

            {/* Language Toggle */}
            <button
                onClick={toggleLang}
                className="absolute top-6 right-6 z-50 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-full font-bold hover:bg-slate-50 transition-colors text-sm shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E9502D]"
            >
                {language === 'zh' ? 'English' : '繁體中文'}
            </button>

            <div className="max-w-md w-full">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-sm overflow-hidden border border-slate-200 bg-white">
                        <img src="./logo.png" alt="DreamSticker AI" className="w-full h-full object-cover" />
                    </div>
                    <h1 className="text-4xl font-black mb-2 tracking-tight text-slate-900">DreamSticker <span className="text-[#E9502D]">AI</span></h1>
                    <p className="text-slate-500">{t('landingTitle')}</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.12)]">
                    {isGoogleLoginEnabled() && (
                        <div className="mb-6 flex flex-col items-center gap-3">
                            {profile ? (
                                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-full pl-1.5 pr-4 py-1.5">
                                    <img src={profile.picture} alt={profile.name} referrerPolicy="no-referrer" className="w-8 h-8 rounded-full" />
                                    <div className="text-left">
                                        <p className="text-xs font-bold text-slate-800 leading-tight">{profile.name}</p>
                                        <p className="text-[10px] text-slate-400 leading-tight">{profile.email}</p>
                                    </div>
                                </div>
                            ) : (
                                <div ref={googleBtnRef} className="flex justify-center min-h-[44px]" />
                            )}
                            <div className="w-full flex items-center gap-3 text-[10px] text-slate-300">
                                <div className="flex-1 h-px bg-slate-200"></div>
                                <span className="text-slate-400 font-medium">API Key</span>
                                <div className="flex-1 h-px bg-slate-200"></div>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="api-key" className="block text-sm font-bold text-slate-700 mb-2">{t('apiKeyLabel')}</label>
                            <input
                                id="api-key"
                                type="password"
                                required
                                value={key}
                                onChange={(e) => setKey(e.target.value)}
                                placeholder={t('apiKeyPlaceholder')}
                                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E9502D] focus:border-[#E9502D] transition-all"
                            />
                        </div>

                        <div>
                            <button
                                type="button"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="text-[11px] text-slate-400 hover:text-slate-600 font-bold flex items-center gap-1 transition-colors"
                            >
                                <span>{showAdvanced ? '▾' : '▸'}</span> {t('advancedOptions')}
                            </button>
                            {showAdvanced && (
                                <div className="mt-3 space-y-2 animate-fade-in">
                                    <label htmlFor="openai-key" className="block text-xs font-bold text-slate-600">{t('openaiKeyLabel')}</label>
                                    <input
                                        id="openai-key"
                                        type="password"
                                        value={openaiKey}
                                        onChange={(e) => setOpenaiKey(e.target.value)}
                                        placeholder={t('openaiKeyPlaceholder')}
                                        className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E9502D] focus:border-[#E9502D] transition-all"
                                    />
                                    <p className="text-[10px] text-slate-400 leading-relaxed">{t('openaiKeyNote')}</p>

                                    <label htmlFor="hf-key" className="block text-xs font-bold text-slate-600 pt-2">{t('hfKeyLabel')}</label>
                                    <input
                                        id="hf-key"
                                        type="password"
                                        value={hfToken}
                                        onChange={(e) => setHfToken(e.target.value)}
                                        placeholder={t('hfKeyPlaceholder')}
                                        className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E9502D] focus:border-[#E9502D] transition-all"
                                    />
                                    <p className="text-[10px] text-slate-400 leading-relaxed">{t('hfKeyNote')}</p>
                                </div>
                            )}
                        </div>

                        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={remember}
                                onChange={(e) => setRemember(e.target.checked)}
                                className="w-4 h-4 rounded accent-[#E9502D]"
                            />
                            {t('rememberKey')}
                        </label>

                        <button
                            type="submit"
                            className="w-full py-3.5 bg-[#E9502D] hover:bg-[#C33F20] text-white font-bold rounded-xl shadow-sm transition-colors active:scale-[0.99] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#E9502D]"
                        >
                            <span>{t('startBtn')}</span>
                            <MagicWandIcon />
                        </button>
                    </form>

                    <div className="mt-6 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                        <p>{t('noKey')}</p>
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[#C33F20] hover:text-[#9D341D] font-bold text-sm bg-[#FFF1EC] px-4 py-2 rounded-full border border-[#FFCDBC] hover:border-[#FFAA8F] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E9502D]">
                            {t('getBillingKey')}
                        </a>

                        <button
                            onClick={() => setShowGuideModal(true)}
                            className="mt-2 text-slate-400 hover:text-slate-600 underline text-[10px] transition-colors"
                        >
                            {t('howToApply')} ▶
                        </button>
                    </div>
                </div>

                <p className="mt-4 text-center text-[10px] text-slate-400">{t('localSave')}</p>
            </div>
        </div>
    );
};
