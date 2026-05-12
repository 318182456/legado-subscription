import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, RefreshCw, Package, Book, Sparkles, BookOpen, 
  ShieldCheck, Info, Globe, Copy, X, Zap, Folder, 
  ChevronRight, Home, ArrowLeft, MoreVertical, Trash2,
  Image as ImageIcon, Type, FileText, Download, Share2,
  Settings2, Maximize2, Palette, AlignLeft
} from 'lucide-react';
import * as api from '../api';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  category?: string;
  item?: any;
  extension?: string;
}

export default function AssetsView() {
  const [data, setData] = useState<any>(null);
  const [customThemes, setCustomThemes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [sandboxConfig, setSandboxConfig] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'explorer' | 'featured'>('explorer');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [res, themes] = await Promise.all([
        api.getResources(),
        api.getCustomThemes()
      ]);
      setData(res);
      setCustomThemes(themes);
    } catch (e) {
      console.error('获取资源列表失败', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // 构建文件夹树
  const fileTree = useMemo(() => {
    if (!data) return null;
    const root: any = { name: 'root', children: {}, type: 'folder', path: '' };
    
    Object.entries(data).forEach(([category, items]: [string, any]) => {
      items.forEach((item: any) => {
        const parts = item.path.split('/');
        let current = root;
        parts.forEach((part: string, index: number) => {
          if (index === parts.length - 1) {
            current.children[part] = { 
              ...item, 
              type: 'file', 
              category,
              extension: part.split('.').pop()?.toLowerCase()
            };
          } else {
            if (!current.children[part]) {
              current.children[part] = { 
                name: part, 
                type: 'folder', 
                path: parts.slice(0, index + 1).join('/'),
                children: {} 
              };
            }
            current = current.children[part];
          }
        });
      });
    });
    return root;
  }, [data]);

  // 获取当前路径下的内容
  const currentContent = useMemo(() => {
    if (!fileTree) return [];
    if (query) {
      // 搜索模式：平铺展示
      const results: any[] = [];
      const traverse = (node: any) => {
        if (node.type === 'file') {
          if (node.name.toLowerCase().includes(query.toLowerCase()) || node.path.toLowerCase().includes(query.toLowerCase())) {
            results.push(node);
          }
        } else if (node.children) {
          Object.values(node.children).forEach(traverse);
        }
      };
      Object.values(fileTree.children).forEach(traverse);
      return results;
    }

    let current = fileTree;
    for (const part of currentPath) {
      if (current.children && current.children[part]) {
        current = current.children[part];
      } else {
        return [];
      }
    }
    return Object.values(current.children || {}).sort((a: any, b: any) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [fileTree, currentPath, query]);

  const navigateTo = (path: string[]) => {
    setCurrentPath(path);
    setQuery('');
  };

  const getIcon = (item: any) => {
    if (item.type === 'folder') return <Folder className="text-primary" size={20} />;
    const ext = item.extension;
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return <ImageIcon className="text-tertiary" size={20} />;
    if (['ttf', 'otf', 'woff', 'woff2'].includes(ext)) return <Type className="text-secondary" size={20} />;
    if (['txt', 'json', 'js', 'css'].includes(ext)) return <FileText className="text-outline" size={20} />;
    return <Book className="text-outline" size={20} />;
  };

  const deleteTheme = async (id: number) => {
    if (!confirm('确定删除该精选主题吗？')) return;
    try {
      await api.deleteCustomTheme(id);
      fetchAll();
    } catch (e) {
      alert('删除失败');
    }
  };

  return (
    <div className="space-y-6 pb-20 relative h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/30 pb-6 shrink-0">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-on-surface">资源管理 (R2)</h2>
          <p className="text-sm text-secondary mt-1">
            {viewMode === 'explorer' ? '通过文件夹结构浏览所有云端资源。' : '查看已保存到云端的精选定制主题。'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-surface-container p-1 rounded-xl flex gap-1">
            <button 
              onClick={() => setViewMode('explorer')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'explorer' ? 'bg-surface-bright shadow-sm text-primary' : 'text-secondary hover:bg-surface-bright/50'}`}
            >
              资源浏览器
            </button>
            <button 
              onClick={() => setViewMode('featured')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'featured' ? 'bg-surface-bright shadow-sm text-primary' : 'text-secondary hover:bg-surface-bright/50'}`}
            >
              精选主题 ({customThemes.length})
            </button>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={16} />
            <input 
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索资源..."
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
            />
          </div>
          <button 
            onClick={fetchAll}
            className="p-2.5 bg-surface-container-lowest border border-outline-variant text-primary rounded-xl hover:bg-surface-container-low transition-colors shadow-sm"
            title="刷新数据"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {viewMode === 'explorer' ? (
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {/* 面包屑导航 */}
          {!query && (
            <div className="flex items-center gap-1 text-sm text-secondary overflow-x-auto whitespace-nowrap py-1 scrollbar-none shrink-0">
              <button 
                onClick={() => navigateTo([])}
                className="p-1.5 hover:bg-surface-container rounded-lg transition-colors flex items-center gap-1.5 hover:text-primary"
              >
                <Home size={16} />
                <span className="font-bold">根目录</span>
              </button>
              {currentPath.map((part, i) => (
                <React.Fragment key={i}>
                  <ChevronRight size={14} className="opacity-30" />
                  <button 
                    onClick={() => navigateTo(currentPath.slice(0, i + 1))}
                    className="px-2 py-1.5 hover:bg-surface-container rounded-lg transition-colors font-medium hover:text-primary"
                  >
                    {part}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
            {loading ? (
              <div className="py-20 text-center text-secondary">
                <RefreshCw size={32} className="animate-spin mx-auto mb-4 opacity-20" />
                <p>正在同步资源结构...</p>
              </div>
            ) : currentContent.length === 0 ? (
              <div className="py-20 text-center text-secondary border border-dashed border-outline-variant rounded-2xl">
                <Package size={48} className="mx-auto mb-4 opacity-10" />
                <p>{query ? '未找到相关资源' : '该文件夹为空'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {currentContent.map((item: any, idx: number) => {
                  const isFolder = item.type === 'folder';
                  const url = `${window.location.origin}/repo/${item.path}`;
                  const isImg = !isFolder && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(item.extension);
                  
                  return (
                    <div 
                      key={idx} 
                      onClick={() => isFolder && navigateTo([...currentPath, item.name])}
                      className={`group flex flex-col bg-surface-container-lowest border border-outline-variant rounded-2xl p-3 transition-all hover:shadow-lg hover:border-primary/30 cursor-pointer ${isFolder ? '' : ''}`}
                    >
                      <div className="relative aspect-video rounded-xl bg-surface-container overflow-hidden flex items-center justify-center mb-3">
                        {isFolder ? (
                          <Folder size={48} className="text-primary/40 group-hover:scale-110 transition-transform" />
                        ) : isImg ? (
                          <img src={url} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        ) : (
                          <div className="text-primary/30 font-bold text-lg uppercase">{item.extension || 'FILE'}</div>
                        )}
                        {!isFolder && (
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                             <button 
                               onClick={(e) => { e.stopPropagation(); setPreviewItem({ ...item, url }); }}
                               className="p-2 bg-white text-on-surface rounded-full hover:bg-primary hover:text-white transition-all shadow-lg"
                             >
                               <Maximize2 size={18} />
                             </button>
                             <button 
                               onClick={(e) => { e.stopPropagation(); setSandboxConfig({ base: item, type: item.category === 'fonts' ? 'font' : 'theme' }); }}
                               className="p-2 bg-white text-on-surface rounded-full hover:bg-primary hover:text-white transition-all shadow-lg"
                             >
                               <Palette size={18} />
                             </button>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold truncate group-hover:text-primary transition-colors" title={item.name}>{item.name}</span>
                        <span className="text-[10px] text-secondary truncate font-mono">{isFolder ? `${Object.keys(item.children || {}).length} 个项目` : item.path}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
          {customThemes.length === 0 ? (
            <div className="py-20 text-center text-secondary border border-dashed border-outline-variant rounded-2xl">
              <Sparkles size={48} className="mx-auto mb-4 opacity-10" />
              <p>暂无精选主题。在“浏览器”中选择素材开始定制并保存吧！</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {customThemes.map((item) => {
                const config = JSON.parse(item.config);
                const b64 = btoa(unescape(encodeURIComponent(item.config)));
                const importUrl = 'legado://import/theme?src=' + b64;
                
                return (
                  <div key={item.id} className="bg-surface-container-lowest border border-outline-variant rounded-2xl overflow-hidden group hover:shadow-xl transition-all">
                    <div className="aspect-[4/3] relative bg-surface-container flex items-center justify-center">
                       {item.preview_url ? (
                         <img src={item.preview_url} className="w-full h-full object-cover" />
                       ) : (
                         <div className="w-full h-full p-4 flex flex-col" style={{ background: config.backgroundColor || '#fff', color: config.textColor || '#000' }}>
                           <div className="text-xs font-bold border-b border-current pb-2 mb-2">《预览样式》</div>
                           <p className="text-[10px] leading-relaxed opacity-80">这是生成的自定义主题效果预览，包含字体、背景和排版参数。</p>
                         </div>
                       )}
                       <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                           onClick={() => deleteTheme(item.id)}
                           className="p-1.5 bg-red-500 text-white rounded-lg shadow-lg hover:scale-105 transition-transform"
                         >
                           <Trash2 size={14} />
                         </button>
                       </div>
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-sm mb-1">{item.name}</h3>
                      <p className="text-[10px] text-secondary mb-4">创建于 {new Date(item.created_at).toLocaleString()}</p>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(importUrl);
                            alert('导入链接已复制');
                          }}
                          className="flex-1 py-2 bg-surface-container text-primary rounded-xl text-[10px] font-bold hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1"
                        >
                          <Copy size={12} /> 复制链接
                        </button>
                        <a 
                          href={importUrl}
                          className="flex-1 py-2 bg-primary text-on-primary rounded-xl text-[10px] font-bold hover:opacity-90 transition-all flex items-center justify-center gap-1"
                        >
                          <Download size={12} /> 一键导入
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 定制沙盒 */}
      <AnimatePresence>
        {sandboxConfig && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-on-background/60 backdrop-blur-md">
            <StyleSandbox 
              initialBase={sandboxConfig.base}
              initialType={sandboxConfig.type}
              onClose={() => setSandboxConfig(null)}
              onSaved={() => { setSandboxConfig(null); fetchAll(); }}
            />
          </div>
        )}
      </AnimatePresence>

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
    const textExts = ['txt', 'json', 'js', 'css', 'md', 'html'];
    if (textExts.includes(item.extension)) {
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-on-background/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between bg-surface-bright">
          <div className="flex flex-col">
            <h3 className="font-bold text-lg">{item.name}</h3>
            <span className="text-[10px] text-secondary font-mono">{item.path}</span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                navigator.clipboard.writeText(item.url);
                alert('链接已复制');
              }}
              className="p-2 text-secondary hover:bg-surface-container rounded-lg transition-colors flex items-center gap-2 text-xs font-bold"
            >
              <Copy size={16} /> 复制 URL
            </button>
            <button onClick={onClose} className="p-2 text-secondary hover:bg-surface-container rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-surface custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <RefreshCw className="animate-spin text-primary" size={32} />
              <p className="text-sm text-secondary">正在加载资源内容...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center">
              {['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(item.extension) ? (
                <img src={item.url} alt={item.name} className="max-w-full rounded-lg shadow-md" />
              ) : content ? (
                <pre className="w-full text-xs font-mono p-6 bg-surface-container-lowest border border-outline-variant rounded-xl overflow-x-auto whitespace-pre-wrap">
                  {content}
                </pre>
              ) : (
                <div className="py-20 text-center text-secondary">
                   <Package size={64} className="mx-auto mb-4 opacity-10" />
                   <p>该格式不支持直接预览，您可以复制链接或下载查看。</p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function StyleSandbox({ initialBase, initialType, onClose, onSaved }: { initialBase: any; initialType: 'theme' | 'font'; onClose: () => void; onSaved: () => void }) {
  const [config, setConfig] = useState<any>({
    name: initialBase.name + ' 定制',
    backgroundColor: '#ffffff',
    textColor: '#000000',
    fontSize: 20,
    lineHeight: 1.5,
    paragraphSpacing: 10,
    bgImage: '',
    fontPath: ''
  });

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedFontName, setSelectedFontName] = useState('');

  useEffect(() => {
    if (initialType === 'theme') {
      setLoading(true);
      fetch(`${window.location.origin}/repo/${initialBase.path}`)
        .then(res => res.json())
        .then(data => {
          setConfig(prev => ({
            ...prev,
            backgroundColor: data.backgroundColor || '#ffffff',
            textColor: data.textColor || '#000000',
            bgImage: data.bgImage || '',
            fontSize: data.fontSize || 20,
            lineHeight: data.lineHeight || 1.5
          }));
        })
        .catch(e => console.error('Load theme failed', e))
        .finally(() => setLoading(false));
    } else {
      loadFont(initialBase.path, initialBase.name);
    }
  }, [initialBase]);

  const loadFont = async (path: string, name: string) => {
    const fontUrl = `${window.location.origin}/repo/${path}`;
    const fontName = 'PreviewFont_' + Math.random().toString(36).substring(7);
    const fontFace = new FontFace(fontName, `url(${fontUrl})`);
    try {
      const loaded = await fontFace.load();
      (document.fonts as any).add(loaded);
      setSelectedFontName(fontName);
      setConfig(prev => ({ ...prev, fontPath: path }));
    } catch (e) {
      console.error('Font load failed', e);
    }
  };

  const handleSave = async () => {
    if (!config.name) return alert('请输入名称');
    setSaving(true);
    try {
      const exportConfig = {
        ...config,
        // 如果有背景图，确保是全路径
        bgImage: config.bgImage && !config.bgImage.startsWith('http') ? `${window.location.origin}/repo/${config.bgImage}` : config.bgImage
      };
      await api.saveCustomTheme({
        name: config.name,
        config: JSON.stringify(exportConfig)
      });
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
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="bg-surface-container-highest border border-outline-variant w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[70vh]"
    >
      {/* 左侧预览 */}
      <div className="flex-1 bg-surface p-8 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-6 shrink-0">
           <h3 className="font-bold text-lg flex items-center gap-2">
             <Zap className="text-primary" size={20} /> 样式实验室
           </h3>
           <div className="bg-surface-container px-3 py-1 rounded-full text-[10px] font-bold text-secondary uppercase tracking-widest">Live Preview</div>
        </div>
        
        <div 
          className="flex-1 rounded-2xl border border-outline-variant shadow-inner p-8 overflow-y-auto transition-all duration-500 custom-scrollbar relative"
          style={{ 
            backgroundColor: config.backgroundColor, 
            color: config.textColor, 
            fontFamily: selectedFontName || 'inherit',
            backgroundImage: config.bgImage ? `url(${window.location.origin}/repo/${config.bgImage})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-surface/50 backdrop-blur-sm">
              <RefreshCw className="animate-spin text-primary" />
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold mb-6" style={{ fontSize: `${config.fontSize * 1.2}px` }}>第一章 极简主义的排版</h1>
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <p 
                    key={i} 
                    style={{ 
                      fontSize: `${config.fontSize}px`, 
                      lineHeight: config.lineHeight,
                      marginBottom: `${config.paragraphSpacing}px`
                    }}
                  >
                    这是一段用于测试实时排版效果的样例文本。你可以通过右侧的面板随意调整字号、行距以及段落间距。
                    背景颜色和文字颜色的对比度也会直接影响阅读体验。
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 右侧控制面板 */}
      <div className="w-full md:w-80 bg-surface-container-high border-l border-outline-variant p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6 shrink-0">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-secondary uppercase">主题名称</label>
            <Settings2 size={14} className="text-outline" />
          </div>
          <input 
            type="text" 
            value={config.name}
            onChange={(e) => setConfig({...config, name: e.target.value})}
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="space-y-4">
          <label className="text-xs font-bold text-secondary uppercase flex items-center gap-2">
            <Palette size={14} /> 色彩与背景
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <span className="text-[10px] text-outline">背景色</span>
              <input 
                type="color" 
                value={config.backgroundColor}
                onChange={(e) => setConfig({...config, backgroundColor: e.target.value})}
                className="w-full h-8 rounded-lg cursor-pointer"
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-[10px] text-outline">文字色</span>
              <input 
                type="color" 
                value={config.textColor}
                onChange={(e) => setConfig({...config, textColor: e.target.value})}
                className="w-full h-8 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-xs font-bold text-secondary uppercase flex items-center gap-2">
            <AlignLeft size={14} /> 文本排版
          </label>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] text-outline font-bold">
                <span>字号</span>
                <span>{config.fontSize}px</span>
              </div>
              <input 
                type="range" min="12" max="40" step="1"
                value={config.fontSize}
                onChange={(e) => setConfig({...config, fontSize: Number(e.target.value)})}
                className="w-full accent-primary"
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] text-outline font-bold">
                <span>行高</span>
                <span>{config.lineHeight}x</span>
              </div>
              <input 
                type="range" min="1.0" max="2.5" step="0.1"
                value={config.lineHeight}
                onChange={(e) => setConfig({...config, lineHeight: Number(e.target.value)})}
                className="w-full accent-primary"
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] text-outline font-bold">
                <span>段距</span>
                <span>{config.paragraphSpacing}px</span>
              </div>
              <input 
                type="range" min="0" max="50" step="1"
                value={config.paragraphSpacing}
                onChange={(e) => setConfig({...config, paragraphSpacing: Number(e.target.value)})}
                className="w-full accent-primary"
              />
            </div>
          </div>
        </div>

        <div className="mt-auto pt-6 space-y-3">
          <button 
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-primary text-on-primary rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {saving ? <RefreshCw className="animate-spin" size={16} /> : <Share2 size={16} />}
            保存至云端精选
          </button>
          <button 
            onClick={onClose}
            className="w-full py-3 bg-surface-container text-secondary rounded-2xl text-sm font-bold hover:bg-surface-container-high transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </motion.div>
  );
}
