import React, { useEffect, useState } from 'react';

interface LoaderProps {
  message?: string;
  /** Optional stage labels (e.g. 分析 → 構圖 → 上色 → 切割). The active stage
   * advances on a timer — the underlying API call gives no real progress,
   * but staged feedback beats a bare spinner for 30-60s waits. */
  stages?: string[];
}

export const Loader: React.FC<LoaderProps> = ({ message = "正在為您夢幻製作貼圖...", stages }) => {
  const [stageIdx, setStageIdx] = useState(0);
  const stageKey = stages?.join('|') ?? '';

  useEffect(() => {
    if (!stages || stages.length === 0) return;
    setStageIdx(0);
    // Advance every 8s; the last stage stays active until the flow finishes.
    const id = setInterval(() => setStageIdx(i => Math.min(i + 1, stages.length - 1)), 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageKey]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white px-6">
      <div className="relative w-24 h-24 mb-4">
        <div className="absolute top-0 left-0 w-full h-full border-4 border-white/20 rounded-full"></div>
        <div className="absolute top-0 left-0 w-full h-full border-4 border-purple-400 rounded-full animate-spin border-t-transparent"></div>
        <div className="absolute inset-0 flex items-center justify-center animate-pulse">
          <span className="text-2xl">✨</span>
        </div>
      </div>
      <p className="text-xl font-semibold animate-pulse text-center">{message}</p>

      {stages && stages.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 max-w-lg">
          {stages.map((label, i) => (
            <React.Fragment key={label}>
              {i > 0 && <span className={`text-xs ${i <= stageIdx ? 'text-purple-300' : 'text-white/25'}`}>→</span>}
              <span
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-500 flex items-center gap-1.5
                  ${i < stageIdx ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                    : i === stageIdx ? 'bg-purple-500/30 text-white border border-purple-300/50 animate-pulse'
                      : 'bg-white/5 text-white/40 border border-white/10'}`}
              >
                {i < stageIdx ? '✓' : i === stageIdx ? '●' : '○'} {label}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};
