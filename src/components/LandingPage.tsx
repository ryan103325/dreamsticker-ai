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
        // Direction "dark, sleek, kinetic" (refs: 21st.dev shadcn look +
        // kinetic typography): near-black base, hairline white borders, ONE
        // coral accent, a subtle radial glow + fine grid instead of gradient
        // blobs, an animated wordmark, and staggered entrance motion (all
        // disabled under prefers-reduced-motion).
        <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#09090B] text-zinc-100 p-6 relative overflow-hidden">
            <ApiKeyModal isOpen={showGuideModal} onClose={() => setShowGuideModal(false)} />

            {/* Ambient background: one soft coral glow + a faint grid. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: 'radial-gradient(60% 50% at 50% 0%, rgba(249,106,71,0.14) 0%, rgba(249,106,71,0) 70%)' }}
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.6]"
                style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                    backgroundSize: '44px 44px',
                    maskImage: 'radial-gradient(70% 60% at 50% 40%, black 40%, transparent 100%)',
                    WebkitMaskImage: 'radial-gradient(70% 60% at 50% 40%, black 40%, transparent 100%)',
                }}
            />

            {/* Language Toggle */}
            <button
                onClick={toggleLang}
                className="absolute top-6 right-6 z-50 bg-white/5 border border-white/10 text-zinc-300 px-4 py-2 rounded-full font-bold hover:bg-white/10 hover:text-white transition-colors text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F96A47]"
            >
                {language === 'zh' ? 'English' : '繁體中文'}
            </button>

            <div className="max-w-md w-full relative z-10">
                <div className="text-center mb-8">
                    <div className="reveal reveal-1 inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 overflow-hidden border border-white/10 bg-white/5 shadow-[0_0_40px_-8px_rgba(249,106,71,0.4)]">
                        <img src="./logo.png" alt="DreamSticker AI" className="w-full h-full object-cover" />
                    </div>
                    <h1 className="reveal reveal-2 text-5xl font-black mb-3 tracking-tighter leading-none">
                        <span className="text-white">DreamSticker</span>
                        <span className="text-[#F96A47]"> AI</span>
                    </h1>
                    <p className="reveal reveal-3 text-zinc-400 text-sm">{t('landingTitle')}</p>
                </div>

                <div className="reveal reveal-3 bg-zinc-900/70 border border-white/10 rounded-2xl p-8 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)]">
                    {isGoogleLoginEnabled() && (
                        <div className="mb-6 flex flex-col items-center gap-3">
                            {profile ? (
                                <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full pl-1.5 pr-4 py-1.5">
                                    <img src={profile.picture} alt={profile.name} referrerPolicy="no-referrer" className="w-8 h-8 rounded-full" />
                                    <div className="text-left">
                                        <p className="text-xs font-bold text-white leading-tight">{profile.name}</p>
                                        <p className="text-[10px] text-zinc-400 leading-tight">{profile.email}</p>
                                    </div>
                                </div>
                            ) : (
                                <div ref={googleBtnRef} className="flex justify-center min-h-[44px]" />
                            )}
                            <div className="w-full flex items-center gap-3 text-[10px]">
                                <div className="flex-1 h-px bg-white/10"></div>
                                <span className="text-zinc-500 font-medium">API Key</span>
                                <div className="flex-1 h-px bg-white/10"></div>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="api-key" className="block text-sm font-bold text-zinc-300 mb-2">{t('apiKeyLabel')}</label>
                            <input
                                id="api-key"
                                type="password"
                                required
                                value={key}
                                onChange={(e) => setKey(e.target.value)}
                                placeholder={t('apiKeyPlaceholder')}
                                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F96A47] focus:border-[#F96A47] transition-all"
                            />
                        </div>

                        <div>
                            <button
                                type="button"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="text-[11px] text-zinc-500 hover:text-zinc-300 font-bold flex items-center gap-1 transition-colors"
                            >
                                <span>{showAdvanced ? '▾' : '▸'}</span> {t('advancedOptions')}
                            </button>
                            {showAdvanced && (
                                <div className="mt-3 space-y-2 animate-fade-in">
                                    <label htmlFor="openai-key" className="block text-xs font-bold text-zinc-400">{t('openaiKeyLabel')}</label>
                                    <input
                                        id="openai-key"
                                        type="password"
                                        value={openaiKey}
                                        onChange={(e) => setOpenaiKey(e.target.value)}
                                        placeholder={t('openaiKeyPlaceholder')}
                                        className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F96A47] focus:border-[#F96A47] transition-all"
                                    />
                                    <p className="text-[10px] text-zinc-500 leading-relaxed">{t('openaiKeyNote')}</p>

                                    <label htmlFor="hf-key" className="block text-xs font-bold text-zinc-400 pt-2">{t('hfKeyLabel')}</label>
                                    <input
                                        id="hf-key"
                                        type="password"
                                        value={hfToken}
                                        onChange={(e) => setHfToken(e.target.value)}
                                        placeholder={t('hfKeyPlaceholder')}
                                        className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F96A47] focus:border-[#F96A47] transition-all"
                                    />
                                    <p className="text-[10px] text-zinc-500 leading-relaxed">{t('hfKeyNote')}</p>
                                </div>
                            )}
                        </div>

                        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={remember}
                                onChange={(e) => setRemember(e.target.checked)}
                                className="w-4 h-4 rounded accent-[#F96A47]"
                            />
                            {t('rememberKey')}
                        </label>

                        <button
                            type="submit"
                            className="group w-full py-3.5 bg-[#F96A47] hover:bg-[#FF8261] text-zinc-950 font-bold rounded-xl shadow-[0_8px_30px_-8px_rgba(249,106,71,0.6)] transition-all active:scale-[0.99] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:ring-[#F96A47]"
                        >
                            <span>{t('startBtn')}</span>
                            <span className="transition-transform group-hover:translate-x-0.5"><MagicWandIcon /></span>
                        </button>
                    </form>

                    <div className="mt-6 text-center text-xs text-zinc-500 flex flex-col items-center gap-2">
                        <p>{t('noKey')}</p>
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[#FF8261] hover:text-[#FFAA8F] font-bold text-sm bg-[#F96A47]/10 px-4 py-2 rounded-full border border-[#F96A47]/25 hover:border-[#F96A47]/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F96A47]">
                            {t('getBillingKey')}
                        </a>

                        <button
                            onClick={() => setShowGuideModal(true)}
                            className="mt-2 text-zinc-500 hover:text-zinc-300 underline text-[10px] transition-colors"
                        >
                            {t('howToApply')} ▶
                        </button>
                    </div>
                </div>

                <p className="mt-4 text-center text-[10px] text-zinc-600">{t('localSave')}</p>
            </div>
        </div>
    );
};
