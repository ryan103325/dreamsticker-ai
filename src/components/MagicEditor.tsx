
import React, { useRef, useState, useEffect } from 'react';
import { MagicWandIcon, CloseIcon, TrashIcon, UndoIcon, BrushIcon, EraserIcon, CircleIcon } from './Icons';
import { useToast } from './Toast';

interface MagicEditorProps {
    imageUrl: string;
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (imageWithMask: string, prompt: string) => void;
    isProcessing: boolean;
    isAnimated?: boolean;
}

export const MagicEditor: React.FC<MagicEditorProps> = ({ 
    imageUrl, 
    isOpen, 
    onClose, 
    onGenerate,
    isProcessing,
    isAnimated = false
}) => {
    const toast = useToast();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    
    const [isDrawing, setIsDrawing] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [history, setHistory] = useState<ImageData[]>([]);
    const [tool, setTool] = useState<'brush' | 'circle' | 'eraser' | 'pan'>('brush');
    const [brushSize, setBrushSize] = useState(15);
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    
    // For shape drawing (Circle)
    const [startPos, setStartPos] = useState<{x:number, y:number} | null>(null);

    useEffect(() => {
        setPrompt("");
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        setTool('brush');
        setHistory([]);
    }, [imageUrl]);

    useEffect(() => {
        if (!isOpen) return;
        const img = imgRef.current;
        const canvas = canvasRef.current;
        if (!img || !canvas) return;

        const syncSize = () => {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                setHistory([ctx.getImageData(0, 0, canvas.width, canvas.height)]);
            }
        };

        if (img.complete) syncSize();
        else img.onload = syncSize;
    }, [isOpen, imageUrl]); // Removed isAnimated check to allow editor to load

    const saveHistory = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
            // Keep last 10 steps to manage memory
            setHistory(prev => [...prev.slice(-9), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
        }
    };

    const undo = () => {
        if (history.length <= 1) return; // Always keep empty state
        const newHistory = history.slice(0, -1);
        setHistory(newHistory);
        
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
            ctx.putImageData(newHistory[newHistory.length - 1], 0, 0);
        }
    };

    const getCanvasCoords = (e: React.PointerEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        
        // Calculate scaling factors to map screen coordinates to canvas internal resolution
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (isProcessing) return;
        if (tool === 'pan') {
            setIsPanning(true);
            return;
        }

        setIsDrawing(true);
        const coords = getCanvasCoords(e);

        if (tool === 'circle') {
            saveHistory(); // Save state before starting shape
            setStartPos(coords);
        } else {
            saveHistory(); // Save state before stroke
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (ctx) {
                ctx.beginPath();
                ctx.moveTo(coords.x, coords.y);
                draw(e);
            }
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isPanning) {
            setOffset(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
            return;
        }
        if (!isDrawing) return;

        if (tool === 'circle' && startPos) {
            // Preview shape: Restore last history then draw new circle
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (canvas && ctx && history.length > 0) {
                // Restore "before drag" state
                ctx.putImageData(history[history.length - 1], 0, 0);
                
                const curr = getCanvasCoords(e);
                const radius = Math.sqrt(Math.pow(curr.x - startPos.x, 2) + Math.pow(curr.y - startPos.y, 2));
                
                ctx.globalCompositeOperation = 'source-over';
                
                // Draw Preview (Semi-transparent Red with Border)
                ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'; 
                ctx.strokeStyle = '#FF0000';
                ctx.lineWidth = 2;
                
                ctx.beginPath();
                ctx.arc(startPos.x, startPos.y, radius, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
            }
        } else {
            draw(e);
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (tool === 'circle' && isDrawing && startPos) {
             const canvas = canvasRef.current;
             const ctx = canvas?.getContext('2d');
             if (canvas && ctx && history.length > 0) {
                 // Finalize circle with solid color
                 ctx.putImageData(history[history.length - 1], 0, 0);
                 const curr = getCanvasCoords(e);
                 const radius = Math.sqrt(Math.pow(curr.x - startPos.x, 2) + Math.pow(curr.y - startPos.y, 2));
                 
                 ctx.globalCompositeOperation = 'source-over';
                 ctx.fillStyle = '#FF0000'; // Solid red for mask
                 ctx.strokeStyle = '#FF0000';
                 ctx.lineWidth = 0; // No border needed for solid mask
                 
                 ctx.beginPath();
                 ctx.arc(startPos.x, startPos.y, radius, 0, 2 * Math.PI);
                 ctx.fill();
             }
        }
        
        setIsDrawing(false);
        setIsPanning(false);
        setStartPos(null);
        canvasRef.current?.getContext('2d')?.beginPath();
    };

    const draw = (e: React.PointerEvent) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const coords = getCanvasCoords(e);
        const rect = canvas.getBoundingClientRect();
        
        // Dynamic line width based on zoom to keep visual size consistent
        const scaledSize = brushSize * (canvas.width / rect.width) / zoom;
        
        ctx.lineWidth = scaledSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = '#FF0000';
        }
        
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
        
        // For smoother curves, update path start
        ctx.beginPath();
        ctx.moveTo(coords.x, coords.y);
    };

    const handleSubmit = () => {
        if (!prompt.trim()) return toast("請輸入修改指令！(例如：改成戴帽子)", 'error');
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (canvas && img) {
            const temp = document.createElement('canvas');
            temp.width = img.naturalWidth; temp.height = img.naturalHeight;
            const tCtx = temp.getContext('2d');
            if (tCtx) {
                // 1. Draw Original Image
                tCtx.drawImage(img, 0, 0);
                // 2. Draw Red Mask on top
                tCtx.drawImage(canvas, 0, 0);
                
                onGenerate(temp.toDataURL('image/png'), prompt);
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="w-full max-w-6xl bg-white rounded-3xl shadow-2xl border border-indigo-100 overflow-hidden flex flex-col md:flex-row h-[90vh]">
                
                {/* Viewport Area */}
                <div className="flex-1 bg-slate-900 relative overflow-hidden flex flex-col" ref={viewportRef}>
                    <div 
                        className={`flex-1 overflow-hidden flex items-center justify-center relative touch-none
                            ${tool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                    >
                        <div 
                            style={{ 
                                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                                transition: isPanning ? 'none' : 'transform 0.1s ease-out'
                            }}
                            className="relative origin-center"
                        >
                            <img 
                                ref={imgRef} 
                                src={imageUrl} 
                                alt="Edit" 
                                crossOrigin="anonymous" 
                                className="block max-w-[85vw] max-h-[70vh] object-contain select-none pointer-events-none" 
                            />
                            <canvas 
                                ref={canvasRef} 
                                className="absolute inset-0 w-full h-full pointer-events-none opacity-60 mix-blend-multiply" 
                                style={{ imageRendering: 'pixelated' }}
                            />
                        </div>
                    </div>

                    {/* Top Overlay Controls */}
                    <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full text-white text-[10px] font-black z-30 flex items-center gap-3 shadow-lg">
                        <span className={`px-2 py-0.5 rounded uppercase tracking-tighter ${
                            tool === 'pan' ? 'bg-amber-500' : 
                            tool === 'eraser' ? 'bg-pink-500' : 
                            tool === 'circle' ? 'bg-green-500' : 'bg-indigo-500'
                        }`}>
                            {tool === 'pan' ? '🖐️ 抓手模式' : 
                             tool === 'eraser' ? '🧽 橡皮擦' : 
                             tool === 'circle' ? '⭕ 畫圈模式' : '🖌️ 筆刷塗抹'}
                        </span>
                        <span className="opacity-60">{Math.round(zoom * 100)}%</span>
                    </div>

                    {/* Bottom Zoom Controls */}
                    <div className="absolute bottom-6 left-6 flex items-center gap-4 bg-black/60 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 z-20">
                        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.2))} className="text-white hover:text-indigo-400 font-bold text-lg">－</button>
                        <input 
                            type="range" min="0.5" max="4" step="0.1" 
                            value={zoom} onChange={e => setZoom(parseFloat(e.target.value))}
                            className="w-32 h-1.5 bg-white/20 rounded-full appearance-none accent-indigo-400"
                        />
                        <button onClick={() => setZoom(z => Math.min(4, z + 0.2))} className="text-white hover:text-indigo-400 font-bold text-lg">＋</button>
                        <div className="w-px h-4 bg-white/20 mx-1"></div>
                        <button onClick={() => { setZoom(1); setOffset({x:0, y:0}); }} className="text-white/60 hover:text-white text-[10px] font-black uppercase tracking-widest">RESET</button>
                    </div>
                </div>

                {/* Sidebar Controls */}
                <div className="w-full md:w-80 bg-white p-6 flex flex-col border-l border-indigo-50 shadow-xl z-40">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-black text-slate-800 flex items-center uppercase tracking-tight">
                            <span className="text-2xl mr-2">✨</span> 魔法修復
                        </h3>
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><CloseIcon /></button>
                    </div>

                    <div className="flex-1 space-y-6 overflow-y-auto pr-1">
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">選取工具</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => setTool('brush')} className={`py-4 rounded-2xl flex flex-col items-center gap-2 transition-all border-2 ${tool === 'brush' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-[1.02]' : 'bg-slate-50 text-slate-400 border-transparent hover:bg-slate-100'}`}>
                                    <BrushIcon /><span className="text-[10px] font-bold">筆刷</span>
                                </button>
                                <button onClick={() => setTool('circle')} className={`py-4 rounded-2xl flex flex-col items-center gap-2 transition-all border-2 ${tool === 'circle' ? 'bg-green-500 text-white border-green-500 shadow-md transform scale-[1.02]' : 'bg-slate-50 text-slate-400 border-transparent hover:bg-slate-100'}`}>
                                    <CircleIcon /><span className="text-[10px] font-bold">畫圈</span>
                                </button>
                                <button onClick={() => setTool('eraser')} className={`py-4 rounded-2xl flex flex-col items-center gap-2 transition-all border-2 ${tool === 'eraser' ? 'bg-pink-500 text-white border-pink-500 shadow-md transform scale-[1.02]' : 'bg-slate-50 text-slate-400 border-transparent hover:bg-slate-100'}`}>
                                    <EraserIcon /><span className="text-[10px] font-bold">擦除</span>
                                </button>
                                <button onClick={() => setTool('pan')} className={`py-4 rounded-2xl flex flex-col items-center gap-2 transition-all border-2 ${tool === 'pan' ? 'bg-amber-500 text-white border-amber-500 shadow-md transform scale-[1.02]' : 'bg-slate-50 text-slate-400 border-transparent hover:bg-slate-100'}`}>
                                    <span className="text-xl">🖐️</span><span className="text-[10px] font-bold">抓手</span>
                                </button>
                            </div>
                            
                            {tool !== 'pan' && (
                                <div className="space-y-2 p-1 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                                    <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase"><span>筆刷/框線粗細</span><span>{brushSize}px</span></div>
                                    <input type="range" min="5" max="50" value={brushSize} onChange={e => setBrushSize(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-600" />
                                </div>
                            )}
                            <button onClick={undo} disabled={history.length <= 1} className="w-full py-2.5 text-[11px] font-bold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-30 flex items-center justify-center gap-2 transition-colors">
                                <UndoIcon /> 復原上一步
                            </button>
                        </div>

                        <div className="space-y-3 pt-4 border-t border-slate-100">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">修改指令</label>
                            <textarea 
                                value={prompt} 
                                onChange={e => setPrompt(e.target.value)} 
                                placeholder="請具體描述紅色區域要改成什麼... (例如：換成藍色衣服、拿著愛心、改成閉眼睛)" 
                                className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-indigo-100 rounded-2xl h-36 text-sm focus:ring-0 outline-none resize-none font-medium text-slate-700 shadow-inner transition-all" 
                            />
                            <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                                <p className="text-[11px] text-indigo-700 leading-relaxed font-bold">
                                    💡 紅色區域是「修改遮罩」。<br/>
                                    AI 會根據您的文字，重新繪製紅色範圍內的內容。
                                </p>
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={handleSubmit} 
                        disabled={isProcessing} 
                        className={`w-full py-4 mt-6 rounded-2xl font-black text-sm uppercase tracking-wider shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3
                            ${isProcessing ? 'bg-slate-100 text-slate-400 cursor-wait' : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-indigo-200 hover:-translate-y-0.5'}`}
                    >
                        {isProcessing ? (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin"></div>
                                AI 運算中...
                            </div>
                        ) : (
                            <><MagicWandIcon /> 執行修復</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
