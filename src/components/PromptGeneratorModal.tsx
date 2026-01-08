import React, { useState, useEffect } from 'react';
import { useLanguage } from '../LanguageContext';
import { MagicWandIcon, CloseIcon } from './Icons';
import { generateStickerText } from '../services/geminiService';

interface PromptGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (text: string) => void;
    initialCharacter: string;
    stickerType: 'STICKER' | 'EMOJI'; // To distinguish contexts
}

export const PromptGeneratorModal: React.FC<PromptGeneratorModalProps> = ({
    isOpen,
    onClose,
    onApply,
    initialCharacter,
    stickerType
}) => {
    const { t } = useLanguage();
    const [quantity, setQuantity] = useState(8);
    const [selectedTheme, setSelectedTheme] = useState<string>('mixed');
    const [customCharacter, setCustomCharacter] = useState(initialCharacter || '');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedResult, setGeneratedResult] = useState('');

    useEffect(() => {
        setCustomCharacter(initialCharacter);
    }, [initialCharacter]);

    if (!isOpen) return null;

    const themes = [
        { id: 'mixed', label: t('themeMixed') }, // 綜合
        { id: 'work', label: t('themeWork') }, // 職場生存
        { id: 'invest', label: t('themeInvest') }, // 投資韭菜
        { id: 'love', label: t('themeLove') }, // 親密關係
        { id: 'foodie', label: t('themeFoodie') }, // 吃貨日常
        { id: 'meme', label: t('themeMeme') }, // 迷因嘴砲
        { id: 'lazy', label: t('themeLazy') }, // 厭世躺平
    ];

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            // Get the label for the selected theme
            const themeLabel = themes.find(th => th.id === selectedTheme)?.label || selectedTheme;

            const result = await generateStickerText({
                quantity,
                theme: themeLabel,
                character: customCharacter,
                type: stickerType
            });
            setGeneratedResult(result);
        } catch (error) {
            console.error("Generation failed:", error);
            // Optionally handle error
        } finally {
            setIsGenerating(false);
        }
    };

    const handleApply = () => {
        onApply(generatedResult);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col relative" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-white">
                    <div>
                        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            ✨ {t('promptGenTitle')} <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-1 rounded-full border border-indigo-200">{stickerType === 'EMOJI' ? t('typeEmoji') : t('typeSticker')}</span>
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">{t('promptGenSubtitle')}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                        <CloseIcon />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 overflow-y-auto space-y-6">

                    {/* Controls Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Quantity */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('genQuantity')}</label>
                            <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-xl border border-slate-200">
                                <input
                                    type="range"
                                    min="4" max="40" step="4"
                                    value={quantity}
                                    onChange={(e) => setQuantity(Number(e.target.value))}
                                    className="flex-1 accent-indigo-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                />
                                <span className="text-indigo-600 font-black text-xl w-10 text-center">{quantity}</span>
                            </div>
                        </div>

                        {/* Theme */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('genTheme')}</label>
                            <select
                                value={selectedTheme}
                                onChange={(e) => setSelectedTheme(e.target.value)}
                                className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200"
                            >
                                {themes.map(theme => (
                                    <option key={theme.id} value={theme.id}>{theme.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Character */}
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('genCharacter')}</label>
                            <input
                                type="text"
                                value={customCharacter}
                                onChange={(e) => setCustomCharacter(e.target.value)}
                                placeholder={t('genCharacterPlaceholder')}
                                className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                        </div>
                    </div>

                    {/* Action Button */}
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating || !customCharacter.trim()}
                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-black text-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isGenerating ? (
                            <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> {t('generating')}</>
                        ) : (
                            <><MagicWandIcon /> {t('startGenerate')}</>
                        )}
                    </button>

                    {/* Result Area */}
                    {generatedResult && (
                        <div className="space-y-2 animate-fade-in-up">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('genResult')}</label>
                            <textarea
                                value={generatedResult}
                                onChange={(e) => setGeneratedResult(e.target.value)}
                                className="w-full h-48 p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-sm focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
                            />
                        </div>
                    )}

                </div>

                {/* Footer */}
                {generatedResult && (
                    <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                        <button onClick={onClose} className="px-6 py-2 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors">
                            {t('cancel')}
                        </button>
                        <button onClick={handleApply} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-colors">
                            {t('applyToEditor')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
