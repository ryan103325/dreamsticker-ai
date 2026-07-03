import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';
import { CloseIcon } from './Icons';

interface ApiKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose }) => {
    const { t } = useLanguage();
    const [activeStep, setActiveStep] = useState(1);

    if (!isOpen) return null;

    const steps = [
        { id: 1, title: t('guideStep1Title'), desc: t('guideStep1Desc') },
        { id: 2, title: t('guideStep2Title'), desc: t('guideStep2Desc') },
        { id: 3, title: t('guideStep3Title'), desc: t('guideStep3Desc') },
        { id: 4, title: t('guideStep4Title'), desc: t('guideStep4Desc') },
    ];

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div className="bg-[#1a1b26] rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col relative border border-white/10" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#1a1b26] sticky top-0 z-10">
                    <div>
                        <h2 className="text-2xl font-black text-white flex items-center gap-2">
                            🎓 {t('guideModalTitle')}
                        </h2>
                        <p className="text-sm text-indigo-300 font-medium">{t('guideModalSubtitle')}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white">
                        <CloseIcon />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar Steps */}
                    <div className="w-1/3 border-r border-white/10 bg-black/20 p-4 space-y-2 overflow-y-auto hidden md:block">
                        {steps.map((step) => (
                            <button
                                key={step.id}
                                onClick={() => setActiveStep(step.id)}
                                className={`w-full text-left p-4 rounded-xl transition-all border ${activeStep === step.id
                                    ? 'bg-indigo-600/20 border-indigo-500/50 text-white shadow-lg'
                                    : 'bg-transparent border-transparent text-white/50 hover:bg-white/5'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${activeStep === step.id ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white/50'
                                        }`}>
                                        {step.id}
                                    </div>
                                    <div className="font-bold">{step.title}</div>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1 p-8 overflow-y-auto bg-[#13141c]">
                        <div className="max-w-xl mx-auto space-y-8 animate-fade-in">

                            {/* Step Description */}
                            <div className="text-center">
                                <span className="inline-block px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold mb-4 border border-indigo-500/30">
                                    Step {activeStep}
                                </span>
                                <h3 className="text-2xl font-bold text-white mb-3">
                                    {steps[activeStep - 1].title}
                                </h3>
                                <p className="text-gray-400 leading-relaxed">
                                    {steps[activeStep - 1].desc}
                                </p>
                            </div>

                            {/* Visual Mockup */}
                            <div className="aspect-video bg-black/40 rounded-xl border border-white/10 p-4 shadow-2xl relative overflow-hidden group">
                                {/* Decor */}
                                <div className="absolute top-0 left-0 w-full h-8 bg-white/5 border-b border-white/5 flex items-center px-4 gap-2">
                                    <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                                    <div className="w-3 h-3 rounded-full bg-amber-500/50"></div>
                                    <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
                                </div>

                                {/* Step Specific Content (CSS Mockups) */}
                                <div className="mt-8 h-full flex items-center justify-center">
                                    {activeStep === 1 && (
                                        <div className="text-center space-y-4">
                                            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg shadow-lg text-white font-bold inline-flex items-center gap-2 transform hover:scale-105 transition-transform">
                                                <span>⚡ {t('aiStudioLink')}</span>
                                                <span className="text-xs opactiy-50">↗</span>
                                            </a>
                                            <div className="text-xs text-center text-gray-500 max-w-xs mx-auto">
                                                Click "Create API key" in AI Studio.<br />
                                                It will appear in the specific list.
                                            </div>
                                        </div>
                                    )}

                                    {activeStep === 2 && (
                                        <div className="w-full max-w-lg bg-[#1e1f20] p-4 rounded-xl border border-white/10 text-left font-sans text-xs">
                                            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                                                <span className="text-white font-bold text-sm">API Keys</span>
                                                <span className="bg-white/10 px-2 py-1 rounded text-white/50 text-[10px]">+ Create API key</span>
                                            </div>

                                            {/* Table Header */}
                                            <div className="grid grid-cols-4 gap-4 text-gray-500 mb-2 px-2">
                                                <div className="col-span-1">Key</div>
                                                <div className="col-span-1">Project</div>
                                                <div className="col-span-2">Quota tier</div>
                                            </div>

                                            {/* Table Row */}
                                            <div className="grid grid-cols-4 gap-4 items-center bg-white/5 p-2 rounded border border-white/5 relative">
                                                <div className="col-span-1 text-white truncate">...ABC1234</div>
                                                <div className="col-span-1 text-blue-400 truncate">My Project</div>
                                                <div className="col-span-2">
                                                    <div className="text-blue-400 font-bold underline animate-pulse">Set up billing</div>
                                                    <div className="text-gray-500 text-[10px]">Free tier</div>
                                                </div>

                                                {/* Cursor Pointer */}
                                                <div className="absolute right-4 bottom-2 text-2xl text-white drop-shadow-md animate-bounce">👆</div>
                                            </div>
                                        </div>
                                    )}

                                    {activeStep === 3 && (
                                        <div className="keep-light w-full max-w-sm bg-white p-4 rounded-lg border border-gray-200 shadow-lg text-black text-center">
                                            <div className="font-bold text-lg mb-2">Enable Billing</div>
                                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-3 text-sm text-blue-800">
                                                Link a billing account to upgrade from Free Tier to Pay-as-you-go.
                                            </div>
                                            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                                                <div className="h-full w-2/3 bg-blue-500"></div>
                                            </div>
                                            <span className="text-xs text-gray-400">Google Cloud Platform</span>
                                        </div>
                                    )}

                                    {activeStep === 4 && (
                                        <div className="text-center">
                                            <div className="text-5xl mb-4">🎉</div>
                                            <div className="text-white font-bold mb-2">Ready to Create!</div>
                                            <p className="text-xs text-gray-500 max-w-xs mx-auto">
                                                Your key is now upgraded.<br />
                                                Close this window and verify.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Nav */}
                <div className="p-6 border-t border-white/10 flex justify-between bg-[#1a1b26]">
                    <button
                        onClick={() => setActiveStep(p => Math.max(1, p - 1))}
                        disabled={activeStep === 1}
                        className="px-6 py-2 rounded-lg text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent font-bold transition-all"
                    >
                        ← Prev
                    </button>

                    {activeStep < 4 ? (
                        <button
                            onClick={() => setActiveStep(p => Math.min(4, p + 1))}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-900/20 transition-all"
                        >
                            Next →
                        </button>
                    ) : (
                        <a
                            href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer"
                            className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-lg font-bold shadow-lg shadow-amber-900/20 transition-all flex items-center gap-2"
                        >
                            {t('getBillingKey')} ↗
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
};
