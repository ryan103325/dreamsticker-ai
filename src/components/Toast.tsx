import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/**
 * Lightweight toast notifications replacing the browser-native alert() calls.
 */

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
    id: number;
    type: ToastType;
    message: string;
}

interface ToastContextType {
    toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

let nextId = 1;

const TYPE_STYLES: Record<ToastType, { bar: string; icon: string }> = {
    success: { bar: 'bg-green-500', icon: '✓' },
    error: { bar: 'bg-red-500', icon: '✕' },
    info: { bar: 'bg-indigo-500', icon: 'ℹ' },
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const toast = useCallback((message: string, type: ToastType = 'info') => {
        const id = nextId++;
        setToasts(prev => [...prev.slice(-3), { id, type, message }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none px-4 w-full max-w-md">
                {toasts.map(t => (
                    <div
                        key={t.id}
                        className="keep-light pointer-events-auto w-full bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/60 overflow-hidden flex items-center animate-fade-in"
                        role="status"
                    >
                        <div className={`self-stretch w-1.5 ${TYPE_STYLES[t.type].bar}`}></div>
                        <div className={`ml-3 mr-1 w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-black ${TYPE_STYLES[t.type].bar}`}>
                            {TYPE_STYLES[t.type].icon}
                        </div>
                        <p className="flex-1 px-2 py-3 text-sm font-bold text-slate-700 leading-snug">{t.message}</p>
                        <button
                            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                            className="px-3 self-stretch text-slate-300 hover:text-slate-500 transition-colors"
                            aria-label="Dismiss"
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within a ToastProvider');
    return context.toast;
};
