import React from 'react';
import { SavedWork } from '../services/persistence';
import { CloseIcon, TrashIcon, ImageIcon } from './Icons';

interface WorksGalleryProps {
    works: SavedWork[];
    isDark: boolean;
    t: (key: string) => string;
    onRestore: (work: SavedWork) => void;
    onDelete: (id: string) => void;
    onClearAll: () => void;
    onClose: () => void;
}

/**
 * Local works gallery modal: every finished sticker set kept in IndexedDB,
 * newest first. Click a card to reopen it (jumps to the results/packaging
 * step); each card can be deleted individually, or the whole gallery cleared.
 */
export const WorksGallery: React.FC<WorksGalleryProps> = ({ works, isDark, t, onRestore, onDelete, onClearAll, onClose }) => {
    // Escape closes the modal (escape-routes / modal-escape); focus the panel on
    // open so keyboard users land inside the dialog.
    const panelRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        panelRef.current?.focus();
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={t('galleryTitle')}
                tabIndex={-1}
                className={`w-full max-w-3xl max-h-[85vh] rounded-3xl shadow-2xl border flex flex-col outline-none ${isDark ? 'bg-slate-900 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-white/10' : 'border-slate-100'}`}>
                    <h2 className="text-lg font-black flex items-center gap-2">
                        <ImageIcon className="h-5 w-5" /> {t('galleryTitle')}
                        <span className={`text-xs font-bold ${isDark ? 'text-indigo-300' : 'text-slate-400'}`}>{works.length} {t('worksCountUnit')}</span>
                    </h2>
                    <div className="flex items-center gap-2">
                        {works.length > 0 && (
                            <button
                                onClick={() => { if (confirm(t('galleryClearConfirm'))) onClearAll(); }}
                                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${isDark ? 'text-red-300 hover:bg-red-500/20' : 'text-red-500 hover:bg-red-50'}`}
                            >
                                {t('galleryClearAll')}
                            </button>
                        )}
                        <button onClick={onClose} aria-label={t('close')} title={t('close')} className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}><CloseIcon /></button>
                    </div>
                </div>

                <div className="overflow-y-auto p-6">
                    {works.length === 0 ? (
                        <div className={`text-center py-16 ${isDark ? 'text-indigo-200/70' : 'text-slate-400'}`}>
                            <div className="text-5xl mb-3">🗂️</div>
                            <p className="font-bold">{t('galleryEmpty')}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {works.map((w) => (
                                <div key={w.id} className={`rounded-2xl border p-3 transition-all ${isDark ? 'bg-white/5 border-white/10 hover:border-indigo-400/50' : 'bg-slate-50 border-slate-200 hover:border-indigo-300 hover:shadow-md'}`}>
                                    <div className="flex -space-x-2 mb-3">
                                        {w.finalStickers.slice(0, 5).map((s) => (
                                            <img key={s.id} src={s.url} alt="" loading="lazy" decoding="async" className="keep-light w-12 h-12 rounded-xl bg-white border-2 border-white shadow object-contain" />
                                        ))}
                                        {w.finalStickers.length > 5 && (
                                            <div className="w-12 h-12 rounded-xl bg-indigo-500 text-white text-xs font-bold flex items-center justify-center border-2 border-white shadow">+{w.finalStickers.length - 5}</div>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold truncate">{w.zipFileName || 'MyStickers'}</p>
                                            <p className={`text-[11px] ${isDark ? 'text-indigo-200/70' : 'text-slate-400'}`}>{w.finalStickers.length} {t('worksStickerUnit')} · {new Date(w.savedAt).toLocaleString()}</p>
                                        </div>
                                        <div className="flex gap-1.5 shrink-0">
                                            <button onClick={() => onRestore(w)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow transition-colors">{t('galleryOpen')}</button>
                                            <button
                                                onClick={() => onDelete(w.id)}
                                                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-red-300 hover:bg-red-500/20' : 'text-red-400 hover:bg-red-50'}`}
                                                title={t('galleryDelete')}
                                                aria-label={t('galleryDelete')}
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
