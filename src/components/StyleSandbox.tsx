import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Zap, AlignLeft, ImageIcon, Type as FontIcon, Palette, 
  Layout, Type, Settings2, RefreshCw, Share2 
} from 'lucide-react';
import * as api from '../api';
import { Slider } from './Slider';
import { AssetPicker } from './AssetPicker';
import { argbToCss, cssToArgb, getHex6 } from '../utils/color';

// 外部库引用
declare const fflate: any;
declare const Tesseract: any;

export function StyleSandbox({ initialBase, initialType, onClose, onSaved, fileTree }: { initialBase: any; initialType: 'theme' | 'font' | 'zip' | 'saved'; onClose: () => void; onSaved: () => void; fileTree: any }) {
  const [config, setConfig] = useState<any>({
    name: initialBase.name + ' 定制',
    bgStr: '#EEEEEE',
    bgType: 0,
    textColor: '#3E3D3B',
    textSize: 20,
    lineSpacingExtra: 12,
    paragraphSpacing: 2,
    paragraphIndent: '　　',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 6,
    paddingBottom: 6,
    titleMode: 0,
    titleSize: 0,
    titleTopSpacing: 0,
    titleBottomSpacing: 0,
    headerMode: 1,
    headerPaddingTop: 0,
    headerPaddingBottom: 0,
    headerPaddingLeft: 16,
    headerPaddingRight: 16,
    footerMode: 1,
    footerPaddingTop: 6,
    footerPaddingBottom: 6,
    footerPaddingLeft: 16,
    footerPaddingRight: 16,
    showHeaderLine: false,
    showFooterLine: true,
    tipColor: '#803E3D3B', // 默认文字颜色的半透明
    textFont: '',
    bgAlpha: 100,
    letterSpacing: 0.1,
    textBold: 0,
    darkStatusIcon: true
  });

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedFontName, setSelectedFontName] = useState('');
  const [showPicker, setShowPicker] = useState<'font' | 'bg' | 'layout' | null>(null);
  const [resources, setResources] = useState<any>(null);
  const [manualAssets, setManualAssets] = useState({ bg: false, font: false });

  useEffect(() => {
    api.getResources().then(setResources);
    loadBaseConfig(initialType, initialBase);
  }, [initialBase]);

  const loadBaseConfig = async (type: string, base: any) => {
    if (type === 'saved') {
      const data = typeof base.config === 'string' ? JSON.parse(base.config) : base.config;
      setConfig({ ...data, id: base.id }); // 保留 ID 用于可能的更新操作，虽然目前后端 save 可能是插入
      if (data.textFont) {
        loadFont(data.textFont, data.textFont.split('/').pop() || 'CustomFont');
      }
      return;
    }
    if (type === 'image') {
      const url = `${window.location.origin}/repo/${base.path}`;
      recognizeLayoutFromImage(url);
      return;
    }
    if (type === 'theme') {
      setLoading(true);
      fetch(`${window.location.origin}/repo/${base.path}`)
        .then(res => res.json())
        .then(data => {
          setConfig(prev => {
            const next = { ...prev, ...data };
            if (manualAssets.bg) {
              next.bgStr = prev.bgStr;
              next.bgType = prev.bgType;
            }
            if (manualAssets.font) {
              next.textFont = prev.textFont;
            }
            return next;
          });
        })
        .finally(() => setLoading(false));
    } else if (type === 'font') {
      loadFont(base.path, base.name);
    } else if (type === 'zip') {
      setLoading(true);
      fetch(`${window.location.origin}/repo/${base.path}`)
        .then(res => res.arrayBuffer())
        .then(async buf => {
          let f = (window as any).fflate;
          if (!f) {
             const mod = await import('https://cdn.skypack.dev/fflate');
             f = mod;
             (window as any).fflate = f;
          }
          if (f) {
            const unzipped = f.unzipSync(new Uint8Array(buf));
            const configFile = Object.keys(unzipped).find(k => k.endsWith('readConfig.json'));
            if (configFile) {
              const str = new TextDecoder().decode(unzipped[configFile]);
              const data = JSON.parse(str);
              
              setConfig(prev => {
                const next = { ...prev, ...data };
                if (manualAssets.bg) {
                  next.bgStr = prev.bgStr;
                  next.bgType = prev.bgType;
                }
                if (manualAssets.font) {
                  next.textFont = prev.textFont;
                }
                return next;
              });
              
              if (data.textFont && !manualAssets.font) {
                const fontFile = Object.keys(unzipped).find(k => k.includes(data.textFont) || data.textFont.includes(k));
                if (fontFile) {
                  const fontBlob = new Blob([unzipped[fontFile]]);
                  const fontUrl = URL.createObjectURL(fontBlob);
                  const fontName = 'ZipFont_' + Math.random().toString(36).substring(7);
                  const fontFace = new FontFace(fontName, `url(${fontUrl})`);
                  fontFace.load().then(f => {
                    (document.fonts as any).add(f);
                    setSelectedFontName(fontName);
                  });
                }
              }
            }
          }
        })
        .finally(() => setLoading(false));
    }
  };

  const loadFont = async (path: string, name: string) => {
    const fontUrl = `${window.location.origin}/repo/${path}`;
    const fontName = 'PreviewFont_' + Math.random().toString(36).substring(7);
    const fontFace = new FontFace(fontName, `url(${fontUrl})`);
    try {
      const loaded = await fontFace.load();
      (document.fonts as any).add(loaded);
      setSelectedFontName(fontName);
      setConfig(prev => ({ ...prev, textFont: path }));
    } catch (e) {
      console.error('Font load failed', e);
    }
  };

  const recognizeLayoutFromImage = async (url: string) => {
    let t = (window as any).Tesseract;
    if (!t) {
       const mod = await import('https://cdn.skypack.dev/tesseract.js');
       t = mod.default;
       (window as any).Tesseract = t;
    }
    if (!t) return alert('OCR 引擎加载失败');
    setLoading(true);
    try {
      const result = await t.recognize(url, 'chi_sim+eng');
      const lines = result.data.lines;
      const newConfig: any = {};
      let currentSection: 'main' | 'title' | 'header' | 'footer' = 'main';

      lines.forEach((line: any) => {
        const text = line.text.replace(/\s+/g, '');
        if (text.includes('正文标题')) currentSection = 'title';
        else if (text.includes('页眉')) currentSection = 'header';
        else if (text.includes('页脚')) currentSection = 'footer';
        else if (text.includes('正文') && !text.includes('标题')) currentSection = 'main';

        const findValue = () => {
          const matches = text.match(/[\d.]+/g);
          return (matches && matches.length > 0) ? parseFloat(matches[matches.length - 1]) : null;
        };

        const val = findValue();
        if (val === null || isNaN(val)) return;

        if (currentSection === 'main') {
          if (text.includes('字号')) newConfig.textSize = val;
          else if (text.includes('字距')) newConfig.letterSpacing = val;
          else if (text.includes('行距')) newConfig.lineSpacingExtra = val;
          else if (text.includes('段距')) newConfig.paragraphSpacing = val;
          else if (text.includes('上边距')) newConfig.paddingTop = val;
          else if (text.includes('下边距')) newConfig.paddingBottom = val;
          else if (text.includes('左边距')) newConfig.paddingLeft = val;
          else if (text.includes('右边距')) newConfig.paddingRight = val;
        } else if (currentSection === 'title') {
          if (text.includes('字号')) newConfig.titleSize = val;
          else if (text.includes('上边距')) newConfig.titleTopSpacing = val;
          else if (text.includes('下边距')) newConfig.titleBottomSpacing = val;
        } else if (currentSection === 'header') {
          if (text.includes('上边距')) newConfig.headerPaddingTop = val;
          else if (text.includes('下边距')) newConfig.headerPaddingBottom = val;
          else if (text.includes('左边距')) newConfig.headerPaddingLeft = val;
          else if (text.includes('右边距')) newConfig.headerPaddingRight = val;
        } else if (currentSection === 'footer') {
          if (text.includes('上边距')) newConfig.footerPaddingTop = val;
          else if (text.includes('下边距')) newConfig.footerPaddingBottom = val;
          else if (text.includes('左边距')) newConfig.headerPaddingLeft = val;
          else if (text.includes('右边距')) newConfig.headerPaddingRight = val;
        }
      });

      if (Object.keys(newConfig).length > 0) {
        setConfig(prev => ({ ...prev, ...newConfig }));
        alert(`识别成功！提取了 ${Object.keys(newConfig).length} 项参数`);
      } else {
        alert('未能从图片中提取到有效参数。');
      }
    } catch (e) {
      alert('识别失败: ' + String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.name) return alert('请输入名称');
    setSaving(true);
    try {
      await api.saveCustomTheme({ name: config.name, config: JSON.stringify(config) });
      alert('已保存到云端精选');
      onSaved();
    } catch (e) {
      alert('保存失败: ' + String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="bg-surface-container-highest border border-outline-variant w-full max-w-6xl rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[85vh] relative"
    >
      {/* 左侧预览 */}
      <div className="flex-1 bg-surface-container-lowest p-6 flex flex-col items-center justify-center min-h-0 relative">
        <div className="absolute top-6 left-6 flex items-center gap-3"><Zap className="text-primary" size={20} /><h3 className="font-bold text-lg text-primary">样式实验室</h3></div>
        
        <div className="absolute top-6 right-6 flex items-center gap-3 z-[110]">
          <button onClick={onClose} className="px-5 py-2 bg-surface-container text-secondary rounded-full text-xs font-bold hover:bg-surface-container-high transition-all border border-outline-variant/30 shadow-sm">取消</button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-primary text-on-primary rounded-full text-xs font-bold shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
            {saving ? <RefreshCw className="animate-spin" size={14} /> : <Share2 size={14} />} 保存并同步
          </button>
        </div>

        <div className="absolute bottom-6 right-6 bg-surface-container px-3 py-1 rounded-full text-[10px] font-bold text-secondary uppercase tracking-widest flex items-center gap-2 z-10 border border-outline-variant/30">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
          一加 Ace 6T 模拟 (20:9)
        </div>
        
        <div className="relative w-[360px] h-[800px] bg-[#0c0c0c] rounded-[56px] p-1.5 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_30px_60px_rgba(0,0,0,0.5)] border-[6px] border-[#222222] overflow-hidden flex flex-col scale-[0.7] lg:scale-[0.75] xl:scale-[0.8] transition-transform origin-center">
          {/* 旗舰级极窄边框挖孔 */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-black rounded-full z-20 shadow-inner border border-white/5"></div>
          
          <div 
            className="flex-1 rounded-[48px] relative bg-white flex flex-col overflow-hidden"
            style={{ 
              backgroundColor: config.bgType === 0 ? argbToCss(config.bgStr) : 'white', 
              color: argbToCss(config.textColor), fontFamily: selectedFontName || 'inherit',
              backgroundImage: config.bgType === 2 ? `url(${window.location.origin}/repo/${config.bgStr})` : 'none',
              backgroundSize: 'cover', backgroundPosition: 'center',
              letterSpacing: `${config.letterSpacing}em`, fontWeight: config.textBold ? 'bold' : 'normal'
            }}
          >
            {/* 逻辑缩放补偿系数 (320px / 393dp ≈ 0.82) */}
            {(() => {
              const COMP = 0.82;
              return (
                <>
                  {config.headerMode !== 2 && (
                    <div className={`flex items-center justify-between text-[8px] shrink-0 ${config.showHeaderLine ? 'border-b border-black/10' : ''}`} style={{ paddingLeft: `${config.headerPaddingLeft * COMP}px`, paddingRight: `${config.headerPaddingRight * COMP}px`, paddingTop: `${(config.headerPaddingTop + 24) * COMP}px`, paddingBottom: `${(config.headerPaddingBottom + 4) * COMP}px`, color: argbToCss(config.tipColor || '#803E3D3B') }}>
                      <span>17:36</span><span>75%</span>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto scrollbar-none" style={{ paddingLeft: `${config.paddingLeft * COMP}px`, paddingRight: `${config.paddingRight * COMP}px`, paddingTop: `${config.paddingTop * COMP}px`, paddingBottom: `${config.paddingBottom * COMP}px` }}>
                    {loading ? <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-sm"><RefreshCw className="animate-spin text-primary" /></div> : (
                      <>
                        {config.titleMode !== 2 && (
                          <h1 className={`font-bold ${config.titleMode === 1 ? 'text-center' : 'text-left'}`} style={{ 
                            fontSize: `${config.textSize * (1.05 + (config.titleSize || 0) * 0.1) * COMP}px`, 
                            marginTop: `${config.titleTopSpacing * COMP}px`, 
                            marginBottom: `${config.titleBottomSpacing * COMP}px` 
                          }}>
                            第一章 极简主义的排版
                          </h1>
                        )}
                        <div className="space-y-6">
                          {[1, 2, 3, 4, 5].map(i => (
                            <p key={i} style={{ 
                              fontSize: `${config.textSize * COMP}px`, 
                              lineHeight: (config.textSize + config.lineSpacingExtra) / config.textSize, 
                              marginBottom: `${config.paragraphSpacing * COMP}px`, 
                              textIndent: `${config.paragraphIndent?.length || 0}em` 
                            }}>
                              这是模拟手机端的排版预览。Legado 支持极细致的参数调节。
                            </p>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {config.footerMode !== 2 && (
                    <div className={`flex items-center justify-between text-[8px] shrink-0 ${config.showFooterLine ? 'border-t border-black/10' : ''}`} style={{ paddingLeft: `${config.footerPaddingLeft * COMP}px`, paddingRight: `${config.footerPaddingRight * COMP}px`, paddingTop: `${(config.footerPaddingTop + 4) * COMP}px`, paddingBottom: `${(config.footerPaddingBottom + 16) * COMP}px`, color: argbToCss(config.tipColor || '#803E3D3B') }}>
                      <span>第一章 极简主义的排版</span><span>1 / 18</span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* 右侧控制面板 */}
      <div className="w-full md:w-96 bg-surface-container-high border-l border-outline-variant p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6 shrink-0 relative pt-20">
        <div className="space-y-4">
          <label className="text-xs font-bold text-secondary uppercase">主题设置</label>
          <div className="space-y-4 pt-2">
            <label className="text-xs font-bold text-secondary uppercase">主题名称</label>
            <input type="text" value={config.name} onChange={(e) => setConfig({...config, name: e.target.value})} className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => setShowPicker('layout')} className="flex flex-col items-center py-3 bg-surface-container rounded-xl text-[10px] font-bold"><AlignLeft size={16} /> 选排版</button>
          <button onClick={() => setShowPicker('bg')} className="flex flex-col items-center py-3 bg-surface-container rounded-xl text-[10px] font-bold"><ImageIcon size={16} /> 选背景</button>
          <button onClick={() => setShowPicker('font')} className="flex flex-col items-center py-3 bg-surface-container rounded-xl text-[10px] font-bold"><FontIcon size={16} /> 选字体</button>
        </div>

        <div className="space-y-8">
          <div className="space-y-4">
             <label className="text-xs font-bold text-secondary uppercase flex items-center gap-2"><Palette size={14} /> 基础属性</label>
             <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><span className="text-[10px] text-outline">背景色</span><input type="color" value={getHex6(config.bgStr)} onChange={(e) => { setConfig({...config, bgStr: cssToArgb(e.target.value), bgType: 0}); setManualAssets(p => ({ ...p, bg: true })); }} className="w-full h-8 rounded-lg cursor-pointer" /></div>
                <div className="space-y-1.5"><span className="text-[10px] text-outline">文字色</span><input type="color" value={getHex6(config.textColor)} onChange={(e) => setConfig({...config, textColor: cssToArgb(e.target.value)})} className="w-full h-8 rounded-lg cursor-pointer" /></div>
             </div>
             <Slider label="字号" value={config.textSize} min={12} max={40} unit="px" onChange={v => setConfig({...config, textSize: v})} />
             <Slider label="行距" value={config.lineSpacingExtra} min={0} max={30} unit="px" onChange={v => setConfig({...config, lineSpacingExtra: v})} />
             <Slider label="字间距" value={config.letterSpacing} min={0} max={1} step={0.01} onChange={v => setConfig({...config, letterSpacing: v})} />
             <Slider label="段间距" value={config.paragraphSpacing} min={0} max={40} unit="px" onChange={v => setConfig({...config, paragraphSpacing: v})} />
             <div className="flex items-center justify-between p-3 bg-surface-container rounded-xl">
                <span className="text-xs font-bold text-secondary">文本加粗</span>
                <button onClick={() => setConfig({...config, textBold: config.textBold ? 0 : 1})} className={`w-10 h-5 rounded-full transition-all relative ${config.textBold ? 'bg-primary' : 'bg-outline-variant'}`}><div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${config.textBold ? 'left-6' : 'left-1'}`}></div></button>
             </div>
          </div>

          <div className="space-y-4">
             <label className="text-xs font-bold text-secondary uppercase flex items-center gap-2"><Layout size={14} /> 页面布局</label>
             <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Slider label="左边距" value={config.paddingLeft} min={0} max={100} onChange={v => setConfig({...config, paddingLeft: v})} />
                <Slider label="右边距" value={config.paddingRight} min={0} max={100} onChange={v => setConfig({...config, paddingRight: v})} />
                <Slider label="上边距" value={config.paddingTop} min={0} max={100} onChange={v => setConfig({...config, paddingTop: v})} />
                <Slider label="下边距" value={config.paddingBottom} min={0} max={100} onChange={v => setConfig({...config, paddingBottom: v})} />
             </div>
             <div className="space-y-2">
                <span className="text-[10px] text-outline font-bold">首行缩进</span>
                <select value={config.paragraphIndent} onChange={e => setConfig({...config, paragraphIndent: e.target.value})} className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-3 py-2 text-xs">
                  <option value="">无缩进</option><option value="　">1字符</option><option value="　　">2字符</option><option value="　　　　">4字符</option>
                </select>
             </div>
          </div>

          <div className="space-y-4">
             <label className="text-xs font-bold text-secondary uppercase flex items-center gap-2"><Type size={14} /> 标题样式</label>
             <div className="flex bg-surface-container p-1 rounded-xl gap-1">
                {['居左', '居中', '隐藏'].map((l, i) => <button key={i} onClick={() => setConfig({...config, titleMode: i})} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${config.titleMode === i ? 'bg-primary text-white shadow-sm' : 'text-secondary'}`}>{l}</button>)}
             </div>
             {config.titleMode !== 2 && (
               <div className="space-y-4">
                 <Slider label="标题缩放" value={config.titleSize} min={0} max={10} onChange={v => setConfig({...config, titleSize: v})} />
                 <div className="grid grid-cols-2 gap-3">
                   <Slider label="标题上间距" value={config.titleTopSpacing} min={0} max={100} unit="px" onChange={v => setConfig({...config, titleTopSpacing: v})} />
                   <Slider label="标题下间距" value={config.titleBottomSpacing} min={0} max={100} unit="px" onChange={v => setConfig({...config, titleBottomSpacing: v})} />
                 </div>
               </div>
             )}
          </div>

          <div className="space-y-4">
             <label className="text-xs font-bold text-secondary uppercase flex items-center gap-2"><Settings2 size={14} /> 页眉与页脚</label>
             <div className="p-3 bg-surface-container rounded-xl space-y-4">
               <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-secondary uppercase">页眉状态</span><div className="flex bg-surface-container-lowest p-1 rounded-lg gap-1">{['显示', '隐藏'].map((l, i) => <button key={i} onClick={() => setConfig({...config, headerMode: i === 0 ? 1 : 2})} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${config.headerMode === (i === 0 ? 1 : 2) ? 'bg-primary text-white' : 'text-secondary'}`}>{l}</button>)}</div></div>
               <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-secondary uppercase">页脚状态</span><div className="flex bg-surface-container-lowest p-1 rounded-lg gap-1">{['显示', '隐藏'].map((l, i) => <button key={i} onClick={() => setConfig({...config, footerMode: i === 0 ? 1 : 2})} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${config.footerMode === (i === 0 ? 1 : 2) ? 'bg-primary text-white' : 'text-secondary'}`}>{l}</button>)}</div></div>
               <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-secondary">提示文字颜色</span><input type="color" value={getHex6(config.tipColor || '#80000000')} onChange={(e) => setConfig({...config, tipColor: cssToArgb(e.target.value)})} className="w-12 h-6 rounded cursor-pointer" /></div>
               <div className="space-y-3"><span className="text-[10px] text-outline font-bold">页眉间距</span><div className="grid grid-cols-2 gap-x-3 gap-y-1"><Slider label="上" value={config.headerPaddingTop} min={0} max={100} onChange={v => setConfig({...config, headerPaddingTop: v})} /><Slider label="下" value={config.headerPaddingBottom} min={0} max={100} onChange={v => setConfig({...config, headerPaddingBottom: v})} /></div></div>
               <div className="space-y-3"><span className="text-[10px] text-outline font-bold">页脚间距</span><div className="grid grid-cols-2 gap-x-3 gap-y-1"><Slider label="上" value={config.footerPaddingTop} min={0} max={100} onChange={v => setConfig({...config, footerPaddingTop: v})} /><Slider label="下" value={config.footerPaddingBottom} min={0} max={100} onChange={v => setConfig({...config, footerPaddingBottom: v})} /></div></div>
               <div className="flex items-center justify-between pt-2 border-t border-outline-variant/30">
                 <span className="text-[10px] font-bold text-secondary uppercase">页眉分割线</span>
                 <button onClick={() => setConfig({...config, showHeaderLine: !config.showHeaderLine})} className={`w-8 h-4 rounded-full transition-all relative ${config.showHeaderLine ? 'bg-primary' : 'bg-outline-variant'}`}>
                   <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${config.showHeaderLine ? 'left-4.5' : 'left-0.5'}`}></div>
                 </button>
               </div>
               <div className="flex items-center justify-between">
                 <span className="text-[10px] font-bold text-secondary uppercase">页脚分割线</span>
                 <button onClick={() => setConfig({...config, showFooterLine: !config.showFooterLine})} className={`w-8 h-4 rounded-full transition-all relative ${config.showFooterLine ? 'bg-primary' : 'bg-outline-variant'}`}>
                   <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${config.showFooterLine ? 'left-4.5' : 'left-0.5'}`}></div>
                 </button>
               </div>
             </div>
          </div>
        </div>

      </div>

      {showPicker && (
        <div className="absolute inset-0 z-[100] bg-on-background/20 backdrop-blur-sm flex items-center justify-end">
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="w-full md:w-[500px] h-full bg-surface shadow-2xl border-l border-outline-variant flex flex-col">
            <AssetPicker type={showPicker} fileTree={fileTree} onSelect={(r: any) => {
                if (showPicker === 'font') { loadFont(r.path, r.name); setManualAssets(p => ({ ...p, font: true })); }
                else if (showPicker === 'bg') { setConfig({...config, bgStr: r.path, bgType: 2}); setManualAssets(p => ({ ...p, bg: true })); }
                else if (showPicker === 'layout') { loadBaseConfig(r.path.endsWith('.zip') ? 'zip' : 'theme', r); }
                setShowPicker(null);
            }} onClose={() => setShowPicker(null)} />
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
