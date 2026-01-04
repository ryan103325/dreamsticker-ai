
import React, { useState } from 'react';
import { CloseIcon, MagicWandIcon, DownloadIcon, BrushIcon, DiceIcon, FolderOpenIcon } from './Icons';

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<'START' | 'CONFIG' | 'EDIT' | 'EXPORT'>('START');

    if (!isOpen) return null;

    const TabButton = ({ id, icon, label }: { id: any, icon: string, label: string }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-all font-bold text-sm w-full md:w-auto
            ${activeTab === id
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
        >
            <span>{icon}</span>
            <span>{label}</span>
        </button>
    );

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col relative" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
                    <div>
                        <h2 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                            📚 DreamSticker AI 使用手冊
                        </h2>
                        <p className="text-sm text-gray-400 font-medium">從 0 到 1 打造您的專屬貼圖完整教學</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600">
                        <CloseIcon />
                    </button>
                </div>

                {/* Tabs */}
                <div className="px-6 py-2 bg-white border-b border-gray-100 flex gap-2 overflow-x-auto no-scrollbar">
                    <TabButton id="START" icon="🚀" label="1. 開始模式選擇" />
                    <TabButton id="CONFIG" icon="📝" label="2. 文案配置" />
                    <TabButton id="EDIT" icon="🎨" label="3. 修圖與切割" />
                    <TabButton id="EXPORT" icon="📦" label="4. 上架與下載" />
                </div>

                {/* Content */}
                <div className="p-8 overflow-y-auto bg-gray-50/50 leading-relaxed text-gray-600 space-y-8 h-full">

                    {activeTab === 'START' && (
                        <div className="space-y-8 animate-fade-in">
                            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6">
                                <h3 className="font-bold text-indigo-900 text-lg mb-2">✨ 四種創作模式，滿足不同需求</h3>
                                <p className="text-sm text-indigo-700">
                                    無論您是想從零開始設計，還是已經有現成的角色圖，甚至是已經畫好的拼圖底稿，我們都能支援。
                                </p>
                            </div>

                            {/* Product Types Explanation */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-gray-200 flex gap-3 items-center shadow-sm">
                                    <div className="text-2xl bg-indigo-50 p-2 rounded-lg">🖼️</div>
                                    <div>
                                        <h4 className="font-bold text-gray-800">一般貼圖 (Stickers)</h4>
                                        <p className="text-xs text-gray-500 mt-1">標準 W370 x H320，自動加白邊，適合獨立傳送。</p>
                                    </div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-pink-200 flex gap-3 items-center shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 right-0 bg-pink-500 text-white text-[10px] px-2 py-0.5 rounded-bl-lg font-bold">New</div>
                                    <div className="text-2xl bg-pink-50 p-2 rounded-lg">😊</div>
                                    <div>
                                        <h4 className="font-bold text-gray-800">LINE 表情貼 (Emojis)</h4>
                                        <p className="text-xs text-gray-500 mt-1">小尺寸 W180 x H180，無白邊(滿版)，可混在文字中。</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* 創造新角色 */}
                                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                                    <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-lg">
                                        <span className="bg-indigo-100 text-indigo-600 p-1.5 rounded-lg text-xl">✨</span> 創造新角色 (Creation)
                                    </h4>
                                    <ul className="space-y-4 text-sm text-gray-600">
                                        <li>
                                            <strong className="text-gray-900 block mb-1">📸 照片轉 IP (Photo to IP)</strong>
                                            適合將<strong>自拍照</strong>或<strong>寵物照</strong>轉成卡通貼圖。AI 會捕捉照片特徵並轉換為動漫/插畫風格。
                                        </li>
                                        <li>
                                            <strong className="text-gray-900 block mb-1">📝 文字生成 (Text to IP)</strong>
                                            無中生有！輸入詳細描述（如：「一隻戴著太空頭盔的橘貓」），AI 直接為您畫出角色。
                                        </li>
                                    </ul>
                                </div>

                                {/* 延伸舊角色 */}
                                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
                                    <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-lg">
                                        <span className="bg-purple-100 text-purple-600 p-1.5 rounded-lg text-xl">🖼️</span> 延伸現有 IP (Extension)
                                    </h4>
                                    <p className="text-sm text-gray-600 mb-3">
                                        <strong>適合對象：</strong> 手邊已經有設計好的角色圖 (例如公司吉祥物、自己畫的插圖)。
                                    </p>
                                    <ul className="list-disc list-inside text-sm text-gray-500 space-y-1">
                                        <li>上傳一張清晰的角色全身照。</li>
                                        <li>AI 會<strong>鎖定該角色的畫風與特徵</strong>。</li>
                                        <li>接著您可以輸入不同的表情動作指令，AI 會幫您畫出這個角色的「新貼圖」，而不會改變原本的長相。</li>
                                    </ul>
                                </div>
                            </div>

                            {/* 純工具模式 */}
                            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 relative overflow-hidden">
                                <div className="flex flex-col md:flex-row gap-6 items-start">
                                    <div className="bg-white p-3 rounded-xl shadow-sm text-3xl">📂</div>
                                    <div>
                                        <h4 className="font-bold text-amber-900 text-lg mb-2">已有拼圖底稿？使用「上傳底圖」模式 (Utility Mode)</h4>
                                        <p className="text-sm text-amber-800 mb-3">
                                            如果您已經在其他軟體 (如 Photoshop, Midjourney) 做好了整張綠幕拼圖 (Sprite Sheet)，只想使用我們的<strong>切割與打包功能</strong>：
                                        </p>
                                        <ol className="list-decimal list-inside text-sm text-amber-700 space-y-1 bg-white/50 p-3 rounded-lg">
                                            <li>選擇 <strong>📂 上傳底圖</strong> 模式。</li>
                                            <li>設定好您的網格規格 (例如 8張圖 = 4欄x2列)。</li>
                                            <li>上傳您的圖片 (建議背景為純綠色)。</li>
                                            <li>系統會跳過 AI 生成步驟，直接協助您進行 <strong>自動切割</strong> 與 <strong>上架打包</strong>。</li>
                                        </ol>
                                        <div className="mt-4 pt-4 border-t border-amber-200/50 text-amber-900 text-xs">
                                            <strong>🎉 最新支援畫風：</strong> 吉卜力風 (宮崎駿)、3D 盲盒公仔、日系賽璐珞、像素風...等 8 種風格自由切換！
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'CONFIG' && (
                        <div className="space-y-8 animate-fade-in">
                            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-6">
                                <h3 className="font-bold text-amber-900 text-lg mb-2">🧠 Smart Batch 批量智慧輸入 (強力推薦)</h3>
                                <p className="text-sm text-amber-800 mb-4">
                                    不用一格一格打字！只要把您腦海中的貼圖文案（甚至只是筆記）貼上去，AI 會自動幫您分析語意，並自動產生對應的英文動作指令 (Prompt)。
                                </p>
                                <div className="bg-white/80 p-4 rounded-xl border border-amber-200 text-xs font-mono text-gray-600">
                                    <strong>輸入範例：</strong><br />
                                    1. 早安 (想要有太陽)<br />
                                    2. 謝謝 (鞠躬)<br />
                                    3. OK (比手勢)<br />
                                    4. 哈哈哈 (大笑流淚)<br />
                                    5. 辛苦了 (遞茶)
                                </div>
                            </div>

                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-6">
                                <h3 className="font-bold text-indigo-900 text-lg mb-2">🎨 AI 提示詞生成器 (Prompt Generator) <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full ml-2">HOT</span></h3>
                                <p className="text-sm text-indigo-800 mb-4">
                                    想起用其他強大的 AI 繪圖工具 (如 Midjourney, Ideogram, DALL-E 3) 幫忙畫圖，但不知道怎麼下指令？
                                    我們內建了 **專業級提示詞生成器**，自動產生符合 LINE 規範的完美指令。
                                </p>
                                <div className="bg-white/80 p-4 rounded-xl border border-blue-200 text-sm text-gray-600 space-y-2">
                                    <div className="flex gap-2 items-start">
                                        <span className="text-indigo-500 font-bold">✨ 自動切換模板：</span>
                                        <div>依照您選擇的模式 (貼圖/表情貼)，自動切換為 **20格標準版** 或 **40格表情貼專用版**。</div>
                                    </div>
                                    <div className="flex gap-2 items-start">
                                        <span className="text-indigo-500 font-bold">🎚️ 數量滑桿：</span>
                                        <div>自由調整生成數量 (8/16/24/32/40 張)，系統會自動計算對應的解析度與網格佈局 (例如 20張 = 5x4 Grid)。</div>
                                    </div>
                                    <div className="flex gap-2 items-start">
                                        <span className="text-indigo-500 font-bold">🌈 語法高亮：</span>
                                        <div>關鍵參數 (如 <span className="text-amber-500 font-bold">解析度</span>, <span className="text-amber-500 font-bold">畫風</span>) 會以亮色標示，複製前這部分請務必再次確認。</div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="font-bold text-gray-800 text-lg">⚙️ 規格設定指南</h4>
                                <ul className="space-y-3 text-sm text-gray-600">
                                    <li className="flex gap-3">
                                        <span className="font-bold min-w-[80px]">貼圖類型：</span>
                                        <span>
                                            <strong>靜態</strong> (一般 PNG) 或 <strong>動態</strong> (APNG, 每秒5格)。<br />
                                            <span className="text-xs text-gray-400">注意：動態貼圖生成時間較長，且對動作連貫性要求較高。</span>
                                        </span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="font-bold min-w-[80px]">張數設定：</span>
                                        <span>建議從 <strong>8張</strong> 或 <strong>16張</strong> 開始嘗試。最多支援 40 張。</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {activeTab === 'EDIT' && (
                        <div className="space-y-8 animate-fade-in">
                            <div className="bg-purple-50 border border-purple-100 rounded-2xl p-6">
                                <h3 className="font-bold text-purple-900 text-lg mb-2 flex items-center gap-2"><MagicWandIcon /> Magic Editor 魔法修復教學</h3>
                                <p className="text-sm text-purple-800 mb-4">
                                    AI 生成的手指數量不對？眼睛歪了？別擔心，不需要重新生成整張圖。
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                    <div className="bg-white p-3 rounded-xl border border-purple-100">
                                        <strong className="block mb-1 text-purple-700">Step 1. 塗抹</strong>
                                        使用紅色筆刷塗滿「畫壞的地方」。
                                    </div>
                                    <div className="bg-white p-3 rounded-xl border border-purple-100">
                                        <strong className="block mb-1 text-purple-700">Step 2. 下指令</strong>
                                        輸入修改指令，例如：「把手改成比讚」、「把眼睛張開」。
                                    </div>
                                    <div className="bg-white p-3 rounded-xl border border-purple-100">
                                        <strong className="block mb-1 text-purple-700">Step 3. 生成</strong>
                                        AI 會局部重繪該區域，並自動融合背景。
                                    </div>
                                </div>
                            </div>

                            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6">
                                <h3 className="font-bold text-emerald-900 text-lg mb-2 flex items-center gap-2">🟢 自動綠幕切割 (Auto Slicing)</h3>
                                <p className="text-sm text-emerald-800">
                                    系統內建智慧影像處理引擎，能幫您自動去背與裁切。
                                </p>
                                <ul className="list-disc list-inside mt-3 text-sm text-emerald-700 space-y-1">
                                    <li>全自動偵測<strong>綠幕背景</strong>。</li>
                                    <li>自動識別每一個角色的範圍。</li>
                                    <li>自動裁切並轉為<strong>透明背景貼圖</strong>。</li>
                                    <li><strong>注意</strong>：若您的角色本身是綠色的，可能會被誤刪，請使用魔法修復將背景改色，或在 Prompt 中避開綠色。</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {activeTab === 'EXPORT' && (
                        <div className="space-y-8 animate-fade-in">
                            <div className="space-y-4">
                                <h4 className="font-bold text-gray-800 text-lg">📦 下載包內容物說明</h4>
                                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200">
                                            <tr>
                                                <th className="p-4">檔案/資料夾</th>
                                                <th className="p-4">用途</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            <tr>
                                                <td className="p-4 font-mono text-indigo-600">01.png ~ 40.png</td>
                                                <td className="p-4">
                                                    <div className="mb-1"><span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded font-bold mr-2">貼圖</span> W370 x H320 (含白邊)</div>
                                                    <div><span className="bg-pink-100 text-pink-700 text-xs px-2 py-0.5 rounded font-bold mr-2">表情貼</span> W180 x H180 (無白邊)</div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="p-4 font-mono text-indigo-600">main.png</td>
                                                <td className="p-4">商店主圖 (W240 x H240)</td>
                                            </tr>
                                            <tr>
                                                <td className="p-4 font-mono text-indigo-600">tab.png</td>
                                                <td className="p-4">聊天室標籤縮圖 (W96 x H74)</td>
                                            </tr>
                                            <tr>
                                                <td className="p-4 font-mono text-indigo-600">info.txt</td>
                                                <td className="p-4">AI 自動生成的<strong>多語言上架標題與說明</strong></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="bg-gray-100 rounded-2xl p-6">
                                <h4 className="font-bold text-gray-800 mb-2">❓ 常見疑難排解 (Troubleshooting)</h4>
                                <ul className="space-y-3 text-sm text-gray-600">
                                    <li>
                                        <strong>Q: 生成一直轉圈圈沒反應？</strong><br />
                                        A: 請檢查 API Key 是否正確設定。若遇到 429 Error 表示配額用盡，請稍後再試。
                                    </li>
                                    <li>
                                        <strong>Q: 切割出來是空的？</strong><br />
                                        A: 可能是影像處理引擎載入失敗，請重新整理網頁。或者背景綠色不夠純，請使用魔法修復將背景塗成純綠色。
                                    </li>
                                    <li>
                                        <strong>Q: Pro 模型生成失敗？</strong><br />
                                        A: 系統有自動降級機制。若 Pro (2K) 失敗，會自動切換用 Flash (1K) 重試，請耐心等候。
                                    </li>
                                </ul>
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 flex justify-end bg-white">
                    <button onClick={onClose} className="px-8 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all">
                        我看懂了，開始製作！
                    </button>
                </div>
            </div>
        </div>
    );
};
