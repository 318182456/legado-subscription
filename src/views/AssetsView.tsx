import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, RefreshCw, Package, Book, Sparkles, BookOpen, ShieldCheck, Info, Globe, Copy, X, Zap } from 'lucide-react';
import * as api from '../api';

export default function AssetsView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [selectedTheme, setSelectedTheme] = useState<any>(null);
  const [selectedFont, setSelectedFont] = useState<any>(null);

  const fetchResources = async () => {
    setLoading(true);
    try {
      const res = await api.getResources();
      setData(res);
    } catch (e) {
      console.error('获取资源列表失败', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

  const filterItems = (items: any[]) => {
    if (!items) return [];
    if (!query) return items;
    return items.filter(item => 
      item.name.toLowerCase().includes(query.toLowerCase()) || 
      item.path.toLowerCase().includes(query.toLowerCase())
    );
  };

  const renderCategory = (title: string, items: any[], icon: React.ReactNode, type: 'theme' | 'font' | 'layout' | 'rule' | 'rss') => {
    const filtered = filterItems(items);
    if (!filtered || filtered.length === 0) return null;
    
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-on-surface font-bold">
          <div className="p-1.5 bg-surface-container rounded-lg text-primary">{icon}</div>
          <h3>{title} ({filtered.length})</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filtered.map((item, idx) => {
            const url = `${window.location.origin}/repo/${item.path}`;
            const isImage = item.path.match(/\.(png|jpg|jpeg|webp)$/i);
            const isSelected = (type === 'theme' && selectedTheme?.path === item.path) || 
                               (type === 'font' && selectedFont?.path === item.path);
            
            return (
              <div key={idx} className={`bg-surface-container-lowest border rounded-xl p-4 flex flex-col gap-3 group hover:shadow-md transition-all ${isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-outline-variant'}`}>
                {isImage ? (
                  <div className="w-full h-32 rounded-lg overflow-hidden bg-surface-container">
                    <img src={url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  </div>
                ) : (
                  <div className="w-full h-32 rounded-lg bg-surface-container flex items-center justify-center text-secondary">
                    {type === 'font' ? <span className="text-2xl font-bold">Aa</span> : <Book size={32} opacity={0.3} />}
                  </div>
                )}
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-sm font-bold truncate" title={item.name}>{item.name}</span>
                  <span className="text-[10px] text-secondary truncate font-mono">{item.path}</span>
                </div>
                <div className="flex gap-2 mt-auto">
                  <button 
                    onClick={() => setPreviewItem({ ...item, type, url })}
                    className="flex-1 text-center py-1.5 bg-surface-container-high text-primary rounded-lg text-xs font-bold hover:bg-surface-container-highest transition-colors"
                  >
                    预览
                  </button>
                  {(type === 'theme' || type === 'font') && (
                    <button 
                      onClick={() => {
                        if (type === 'theme') setSelectedTheme(isSelected ? null : item);
                        else setSelectedFont(isSelected ? null : item);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container text-secondary hover:bg-surface-container-high'
                      }`}
                    >
                      {isSelected ? '取消' : '应用'}
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(url);
                      alert('链接已复制');
                    }}
                    className="p-1.5 text-secondary hover:text-primary transition-colors"
                    title="复制链接"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-8 pb-20 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/30 pb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-on-surface">资源管理 (R2)</h2>
          <p className="text-sm text-secondary mt-1">同步到云端 R2 存储的主题、字体、排版等素材。</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={18} />
            <input 
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="通过关键字筛选资源..."
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
            />
          </div>
          <button 
            onClick={fetchResources}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-container-lowest border border-outline-variant text-primary rounded-xl text-sm font-bold hover:bg-surface-container-low transition-colors shadow-sm"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            刷新索引
          </button>
        </div>
      </div>

      {!data || Object.values(data).every((v: any) => !v?.length) ? (
        <div className="flex flex-col items-center justify-center py-20 text-secondary gap-4 bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant">
          <Package size={48} opacity={0.2} />
          <p>暂无资源索引，请先运行本地同步脚本</p>
          <div className="bg-surface p-4 rounded-lg text-xs font-mono text-secondary max-w-md">
            # 同步命令示例<br/>
            node scripts/sync-assets.mjs YOUR_TOKEN
          </div>
        </div>
      ) : (
        <div className="space-y-12">
          {renderCategory('精美主题', data.themes, <Sparkles size={18} />, 'theme')}
          {renderCategory('排版方案', data.layouts, <BookOpen size={18} />, 'layout')}
          {renderCategory('净化规则', data.rules, <ShieldCheck size={18} />, 'rule')}
          {renderCategory('发现源', data.rss, <Globe size={18} />, 'rss')}
          {renderCategory('优选字体', data.fonts, <Info size={18} />, 'font')}
        </div>
      )}

      {/* 组合预览沙盒 */}
      {(selectedTheme || selectedFont) && (
        <div className="fixed bottom-6 right-6 left-[264px] z-30 animate-in slide-in-from-bottom duration-300">
          <StyleSandbox 
            theme={selectedTheme} 
            font={selectedFont} 
            onClose={() => { setSelectedTheme(null); setSelectedFont(null); }} 
          />
        </div>
      )}

      {/* 预览弹窗 */}
      <AnimatePresence>
        {previewItem && (
          <PreviewModal 
            item={previewItem} 
            onClose={() => setPreviewItem(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PreviewModal({ item, onClose }: { item: any; onClose: () => void }) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (['theme', 'layout', 'rule', 'rss'].includes(item.type)) {
      setLoading(true);
      fetch(item.url)
        .then(res => res.text())
        .then(text => {
          try {
            setContent(JSON.stringify(JSON.parse(text), null, 2));
          } catch {
            setContent(text);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [item]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-on-background/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between bg-surface-bright">
          <div className="flex flex-col">
            <h3 className="font-bold text-lg">{item.name}</h3>
            <span className="text-[10px] text-secondary font-mono">{item.path}</span>
          </div>
          <button onClick={onClose} className="p-2 text-secondary hover:bg-surface-container rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-surface">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <RefreshCw className="animate-spin text-primary" size={32} />
              <p className="text-sm text-secondary">正在加载资源内容...</p>
            </div>
          ) : (
            <>
              {item.type === 'font' ? (
                <div className="space-y-8">
                  <div className="p-8 border border-outline-variant rounded-xl bg-surface-container-lowest text-center">
                    <p className="text-4xl mb-4">字体预览</p>
                    <p className="text-sm text-secondary">加载字体后，您可以在组合预览中查看效果。</p>
                  </div>
                  <div className="space-y-4">
                    <p className="text-lg">床前明月光，疑是地上霜。</p>
                    <p className="text-lg">举头望明月，低头思故乡。</p>
                    <p className="text-2xl font-bold">The quick brown fox jumps over the lazy dog.</p>
                  </div>
                </div>
              ) : item.path.match(/\.(png|jpg|jpeg|webp)$/i) ? (
                <div className="flex items-center justify-center">
                  <img src={item.url} alt={item.name} className="max-w-full rounded-lg shadow-md" />
                </div>
              ) : (
                <pre className="text-xs font-mono p-4 bg-surface-container-lowest border border-outline-variant rounded-lg overflow-x-auto whitespace-pre-wrap">
                  {content}
                </pre>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function StyleSandbox({ theme, font, onClose }: { theme: any; font: any; onClose: () => void }) {
  const [themeData, setThemeData] = useState<any>(null);
  const [fontLoading, setFontLoading] = useState(false);
  
  useEffect(() => {
    if (theme) {
      fetch(`${window.location.origin}/repo/${theme.path}`)
        .then(res => res.json())
        .then(data => setThemeData(data))
        .catch(e => console.error('Load theme failed', e));
    }
  }, [theme]);

  useEffect(() => {
    if (font) {
      setFontLoading(true);
      const fontUrl = `${window.location.origin}/repo/${font.path}`;
      const fontName = 'PreviewFont_' + Math.random().toString(36).substring(7);
      const fontFace = new FontFace(fontName, `url(${fontUrl})`);
      fontFace.load().then(loaded => {
        (document.fonts as any).add(loaded);
        setSelectedFontName(fontName);
      }).finally(() => setFontLoading(false));
    } else {
      setSelectedFontName('');
    }
  }, [font]);

  const [selectedFontName, setSelectedFontName] = useState('');

  const bg = themeData?.backgroundColor || '#ffffff';
  const text = themeData?.textColor || '#000000';

  return (
    <div className="bg-surface-container-highest/90 backdrop-blur-md border border-outline-variant p-1 rounded-2xl shadow-2xl flex flex-col">
      <div className="p-3 border-b border-outline-variant/30 flex justify-between items-center bg-surface-bright rounded-t-[14px]">
        <span className="text-xs font-bold flex items-center gap-2">
          <Zap size={14} className="text-primary" /> 样式沙盒
        </span>
        <button onClick={onClose} className="p-1 hover:bg-surface-container rounded-full"><X size={14} /></button>
      </div>
      <div className="p-4 flex gap-4">
        <div 
          className="flex-1 min-h-[120px] rounded-xl border border-outline-variant shadow-inner p-4 transition-all duration-500 overflow-hidden"
          style={{ backgroundColor: bg, color: text, fontFamily: selectedFontName || 'inherit' }}
        >
          <div className="text-sm font-bold mb-2">《示例书籍标题》</div>
          <p className="text-xs leading-relaxed opacity-90">
            这是一段预览文本，用于测试主题和字体的实际排版效果。背景色、文字颜色和字体样式都会实时更新。床前明月光，疑是地上霜。
          </p>
        </div>
        <div className="w-48 space-y-3 shrink-0">
          <div className="bg-surface-container-low p-2 rounded-lg border border-outline-variant/50">
            <div className="text-[10px] text-secondary font-bold mb-1 uppercase tracking-wider">当前应用</div>
            <div className="flex flex-col gap-1.5">
              <div className="text-xs flex items-center gap-1.5 font-bold truncate">
                <div className="w-2 h-2 rounded-full bg-primary" /> {theme?.name || '默认主题'}
              </div>
              <div className="text-xs flex items-center gap-1.5 font-bold truncate">
                <div className="w-2 h-2 rounded-full bg-tertiary" /> {fontLoading ? '加载字体中...' : (font?.name || '默认字体')}
              </div>
            </div>
          </div>
          <button 
             onClick={() => alert('此功能仅作演示，实际导入请在阅读 App 内完成')}
             className="w-full py-2 bg-primary text-on-primary rounded-lg text-xs font-bold shadow-md hover:scale-105 transition-transform"
          >
            全量导入阅读
          </button>
        </div>
      </div>
    </div>
  );
}
