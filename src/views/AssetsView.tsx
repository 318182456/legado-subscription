import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, RefreshCw, Package, Book, Sparkles, BookOpen, 
  ShieldCheck, Info, Globe, Copy, X, Zap, Folder, 
  ChevronRight, Home, ArrowLeft, MoreVertical, Trash2,
  Image as ImageIcon, Type, FileText, Download, Share2,
  Settings2, Maximize2, Palette, AlignLeft, Layout,
  ArrowUpLeft, ArrowDownRight, Indent, Type as FontIcon,
  MousePointer2
} from 'lucide-react';
import * as api from '../api';

// 动态加载库
let fflate: any;
import('https://cdn.skypack.dev/fflate').then(mod => fflate = mod);
let Tesseract: any;
import('https://cdn.skypack.dev/tesseract.js').then(mod => Tesseract = mod.default);

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
                        ) : ['ttf', 'otf', 'woff', 'woff2'].includes(item.extension) ? (
                          <FontPreview path={item.path} name={item.name} />
                        ) : (
                          <div className="text-primary/30 font-bold text-lg uppercase">{item.extension || 'FILE'}</div>
                        )}
                        {!isFolder && (
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                             <button 
                               onClick={(e) => { e.stopPropagation(); setPreviewItem({ ...item, url }); }}
                               className="p-2 bg-white text-on-surface rounded-full hover:bg-primary hover:text-white transition-all shadow-lg"
                               title="查看详情"
                             >
                               <Maximize2 size={18} />
                             </button>
                             <button 
                               onClick={(e) => { 
                                 e.stopPropagation(); 
                                 setSandboxConfig({ 
                                   base: item, 
                                   type: item.extension === 'zip' ? 'zip' : (item.category === 'fonts' ? 'font' : 'theme') 
                                 }); 
                               }}
                               className="p-2 bg-white text-on-surface rounded-full hover:bg-primary hover:text-white transition-all shadow-lg"
                               title="进入定制"
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
              fileTree={fileTree}
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
  const [zipFiles, setZipFiles] = useState<string[]>([]);
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
    } else if (item.extension === 'zip') {
      setLoading(true);
      fetch(item.url)
        .then(res => res.arrayBuffer())
        .then(buf => {
          if (!fflate) return;
          const unzipped = fflate.unzipSync(new Uint8Array(buf));
          setZipFiles(Object.keys(unzipped));
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

        <div className={`flex-1 p-6 bg-surface ${['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(item.extension) ? 'overflow-hidden' : 'overflow-y-auto custom-scrollbar'}`}>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <RefreshCw className="animate-spin text-primary" size={32} />
              <p className="text-sm text-secondary">正在分析资源...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              {['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(item.extension) ? (
                <img src={item.url} alt={item.name} className="max-w-full max-h-full object-contain rounded-lg shadow-md" />
              ) : item.extension === 'zip' ? (
                <div className="w-full">
                  <div className="flex items-center gap-2 mb-4 text-primary">
                    <Package size={20} />
                    <span className="font-bold">压缩包内容列表</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {zipFiles.map(f => (
                      <div key={f} className="flex items-center gap-2 p-2 bg-surface-container rounded-lg text-xs font-mono">
                        <FileText size={14} className="text-secondary" />
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              ) : content ? (
                <pre className="w-full text-xs font-mono p-6 bg-surface-container-lowest border border-outline-variant rounded-xl overflow-x-auto whitespace-pre-wrap">
                  {content}
                </pre>
              ) : (
                <div className="py-20 text-center text-secondary">
                   <Package size={64} className="mx-auto mb-4 opacity-10" />
                   <p>该格式暂无可视化预览，您可以复制链接或下载查看。</p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// 字体预览组件
function FontPreview({ path, name }: { path: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  const fontId = useRef(`font_${Math.random().toString(36).substring(7)}`);

  useEffect(() => {
    const fontUrl = `${window.location.origin}/repo/${path}`;
    // 使用引号包裹 URL 以处理特殊字符，防止空格、括号等引起解析错误
    const fontFace = new FontFace(fontId.current, `url('${fontUrl}')`);
    fontFace.load().then(f => {
      (document.fonts as any).add(f);
      setLoaded(true);
    }).catch(e => {
      console.warn(`Font preview failed for ${name}:`, e);
    });
  }, [path, name]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center" style={{ fontFamily: loaded ? fontId.current : 'inherit' }}>
      <span className="text-2xl mb-1">阅读</span>
      <span className="text-[10px] opacity-50 truncate w-full">{name}</span>
    </div>
  );
}

// 转换 Legado 的 ARGB (#AARRGGBB) 为 CSS 的 RGBA (#RRGGBBAA)
function argbToCss(color: string) {
  if (!color || !color.startsWith('#')) return color;
  if (color.length === 9) {
    const a = color.substring(1, 3);
    const r = color.substring(3, 5);
    const g = color.substring(5, 7);
    const b = color.substring(7, 9);
    return `#${r}${g}${b}${a}`;
  }
  return color;
}

// 转换 CSS 颜色回 Legado ARGB (主要用于保存)
function cssToArgb(color: string) {
  if (!color || !color.startsWith('#')) return color;
  if (color.length === 7) return `#ff${color.substring(1)}`; // #RRGGBB -> #ffRRGGBB
  if (color.length === 9) {
    const r = color.substring(1, 3);
    const g = color.substring(3, 5);
    const b = color.substring(5, 7);
    const a = color.substring(7, 9);
    return `#${a}${r}${g}${b}`;
  }
  return color;
}

// 获取不带 Alpha 的 6 位 Hex (用于 input[type=color])
function getHex6(color: string) {
  if (!color || !color.startsWith('#')) return '#000000';
  if (color.length === 9) return `#${color.substring(3, 9)}`; // ARGB -> #RRGGBB
  return color;
}

function StyleSandbox({ initialBase, initialType, onClose, onSaved, fileTree }: { initialBase: any; initialType: 'theme' | 'font' | 'zip'; onClose: () => void; onSaved: () => void; fileTree: any }) {
  const [config, setConfig] = useState<any>({
    name: initialBase.name + ' 定制',
    bgStr: '#ffffff',
    bgType: 0,
    textColor: '#000000',
    textSize: 20,
    lineSpacingExtra: 12,
    paragraphSpacing: 2,
    paragraphIndent: '　　',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 10,
    paddingBottom: 10,
    titleMode: 0,
    titleSize: 1,
    titleTopSpacing: 0,
    titleBottomSpacing: 0,
    headerMode: 1,
    headerPaddingTop: 0,
    headerPaddingBottom: 0,
    headerPaddingLeft: 0,
    headerPaddingRight: 0,
    footerMode: 1,
    footerPaddingTop: 0,
    footerPaddingBottom: 0,
    footerPaddingLeft: 0,
    footerPaddingRight: 0,
    tipColor: '#80000000', // 默认半透明黑
    textFont: '',
    bgAlpha: 100,
    letterSpacing: 0,
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
    if (type === 'image') {
      // 触发图片识别
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
        .then(buf => {
          if (!fflate) return;
          const unzipped = fflate.unzipSync(new Uint8Array(buf));
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
            
            // 尝试加载同包内的字体 (仅当用户没手动选字体时)
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
    if (!Tesseract) return alert('OCR 引擎尚未加载完成，请稍后');
    setLoading(true);
    try {
      // 执行识别
      const result = await Tesseract.recognize(url, 'chi_sim+eng');
      const lines = result.data.lines;
      
      const newConfig: any = {};
      let currentSection: 'main' | 'title' | 'header' | 'footer' = 'main';

      lines.forEach((line: any) => {
        const text = line.text.replace(/\s+/g, '');
        
        // 识别章节切换
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
          else if (text.includes('左边距')) newConfig.headerPaddingLeft = val; // 注意：这里通常共用逻辑或拼写
          else if (text.includes('右边距')) newConfig.headerPaddingRight = val;
        }
      });

      if (Object.keys(newConfig).length > 0) {
        setConfig(prev => ({ ...prev, ...newConfig }));
        alert(`识别成功！提取了 ${Object.keys(newConfig).length} 项参数（包含页眉/页脚/标题）`);
      } else {
        alert('未能从图片中提取到有效参数，请确保图片包含设置面板。');
      }
    } catch (e) {
      console.error('OCR Error:', e);
      alert('识别失败: ' + String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.name) return alert('请输入名称');
    setSaving(true);
    try {
      await api.saveCustomTheme({
        name: config.name,
        config: JSON.stringify(config)
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
      className="bg-surface-container-highest border border-outline-variant w-full max-w-6xl rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[85vh] relative"
    >
      {/* 左侧预览 */}
      <div className="flex-1 bg-surface-container-lowest p-6 flex flex-col items-center justify-center min-h-0 relative">
        <div className="absolute top-6 left-6 flex items-center gap-3">
          <Zap className="text-primary" size={20} />
          <h3 className="font-bold text-lg">样式实验室</h3>
        </div>
        <div className="absolute top-6 right-6 bg-surface-container px-3 py-1 rounded-full text-[10px] font-bold text-secondary uppercase tracking-widest">Mobile Preview</div>
        
        {/* 手机外壳容器 */}
        <div className="relative w-[320px] h-[580px] bg-[#1a1a1a] rounded-[48px] p-2.5 shadow-[0_0_0_2px_rgba(255,255,255,0.1),0_20px_50px_rgba(0,0,0,0.4)] border-4 border-[#2a2a2a] overflow-hidden flex flex-col scale-[0.9] lg:scale-100 transition-transform">
          {/* 刘海/灵动岛区域 */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-b-[20px] z-20 flex items-center justify-center">
             <div className={`w-10 h-1 rounded-full ${config.darkStatusIcon ? 'bg-white/10' : 'bg-white/20'}`}></div>
          </div>

          <div 
            className="flex-1 rounded-[38px] overflow-y-auto scrollbar-none relative bg-white flex flex-col"
            style={{ 
              backgroundColor: config.bgType === 0 ? argbToCss(config.bgStr) : 'white', 
              color: argbToCss(config.textColor), 
              fontFamily: selectedFontName || 'inherit',
              backgroundImage: config.bgType === 2 ? `url(${window.location.origin}/repo/${config.bgStr})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              letterSpacing: `${config.letterSpacing * 10}px`,
              fontWeight: config.textBold ? 'bold' : 'normal'
            }}
          >
            {/* 模拟页眉 */}
            {config.headerMode !== 2 && (
              <div 
                className="flex items-center justify-between text-[8px] border-b border-black/5"
                style={{
                  paddingLeft: `${config.headerPaddingLeft}px`,
                  paddingRight: `${config.headerPaddingRight}px`,
                  paddingTop: `${config.headerPaddingTop + 20}px`,
                  paddingBottom: `${config.headerPaddingBottom}px`,
                  color: argbToCss(config.tipColor || '#80000000')
                }}
              >
                <span>书籍名称</span>
                <span>章节名称</span>
              </div>
            )}

            <div className="flex-1" style={{
              paddingLeft: `${config.paddingLeft}px`,
              paddingRight: `${config.paddingRight}px`,
              paddingTop: `${config.paddingTop}px`,
              paddingBottom: `${config.paddingBottom}px`,
            }}>
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-sm">
                  <RefreshCw className="animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {config.titleMode !== 2 && (
                    <h1 
                      className={`font-bold ${config.titleMode === 1 ? 'text-center' : 'text-left'}`} 
                      style={{ 
                        fontSize: `${config.textSize * (1.05 + (config.titleSize || 0) * 0.1)}px`,
                        marginTop: `${config.titleTopSpacing}px`,
                        marginBottom: `${config.titleBottomSpacing}px`,
                      }}
                    >
                      第一章 极简主义的排版
                    </h1>
                  )}
                  <div className="space-y-6">
                    {[1, 2, 3, 4, 5].map(i => (
                      <p 
                        key={i} 
                        style={{ 
                          fontSize: `${config.textSize}px`, 
                          lineHeight: (config.textSize + config.lineSpacingExtra) / config.textSize,
                          marginBottom: `${config.paragraphSpacing}px`,
                          textIndent: `${config.paragraphIndent?.length || 0}em`
                        }}
                      >
                        这是模拟手机端的排版预览。Legado 支持极细致的参数调节，包含页眉、页脚以及标题的独立间距设置。
                      </p>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 模拟页脚 */}
            {config.footerMode !== 2 && (
              <div 
                className="flex items-center justify-between text-[8px] border-t border-black/5"
                style={{
                  paddingLeft: `${config.footerPaddingLeft}px`,
                  paddingRight: `${config.footerPaddingRight}px`,
                  paddingTop: `${config.footerPaddingTop}px`,
                  paddingBottom: `${config.footerPaddingBottom + 10}px`,
                  color: argbToCss(config.tipColor || '#80000000')
                }}
              >
                <span>21:08</span>
                <span>75%</span>
                <span>1 / 12</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 右侧控制面板 */}
      <div className="w-full md:w-96 bg-surface-container-high border-l border-outline-variant p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6 shrink-0">
        <div className="space-y-4">
          <label className="text-xs font-bold text-secondary uppercase">主题名称</label>
          <input 
            type="text" 
            value={config.name}
            onChange={(e) => setConfig({...config, name: e.target.value})}
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* 资源选择器 */}
        <div className="grid grid-cols-3 gap-2">
          <button 
            onClick={() => setShowPicker('layout')}
            className="flex flex-col items-center justify-center gap-1.5 py-3 bg-surface-container rounded-xl text-[10px] font-bold hover:bg-primary/10 hover:text-primary transition-all border border-transparent hover:border-primary/20"
          >
            <AlignLeft size={16} /> 选排版
          </button>
          <button 
            onClick={() => setShowPicker('bg')}
            className="flex flex-col items-center justify-center gap-1.5 py-3 bg-surface-container rounded-xl text-[10px] font-bold hover:bg-primary/10 hover:text-primary transition-all border border-transparent hover:border-primary/20"
          >
            <ImageIcon size={16} /> 选背景
          </button>
          <button 
            onClick={() => setShowPicker('font')}
            className="flex flex-col items-center justify-center gap-1.5 py-3 bg-surface-container rounded-xl text-[10px] font-bold hover:bg-primary/10 hover:text-primary transition-all border border-transparent hover:border-primary/20"
          >
            <FontIcon size={16} /> 选字体
          </button>
        </div>

        <div className="space-y-8">
          {/* 基础属性 */}
          <div className="space-y-4">
             <label className="text-xs font-bold text-secondary uppercase flex items-center gap-2"><Palette size={14} /> 基础属性</label>
             <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-[10px] text-outline">背景色</span>
                  <input 
                    type="color" 
                    value={getHex6(config.bgStr)} 
                    onChange={(e) => {
                      setConfig({...config, bgStr: cssToArgb(e.target.value), bgType: 0});
                      setManualAssets(p => ({ ...p, bg: true }));
                    }} 
                    className="w-full h-8 rounded-lg cursor-pointer" 
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-[10px] text-outline">文字色</span>
                  <input 
                    type="color" 
                    value={getHex6(config.textColor)} 
                    onChange={(e) => setConfig({...config, textColor: cssToArgb(e.target.value)})} 
                    className="w-full h-8 rounded-lg cursor-pointer" 
                  />
                </div>
             </div>
             <Slider label="字号" value={config.textSize} min={12} max={40} unit="px" onChange={v => setConfig({...config, textSize: v})} />
             <Slider label="行距 (额外)" value={config.lineSpacingExtra} min={0} max={30} unit="px" onChange={v => setConfig({...config, lineSpacingExtra: v})} />
             <Slider label="字间距" value={config.letterSpacing} min={0} max={1} step={0.01} onChange={v => setConfig({...config, letterSpacing: v})} />
             <Slider label="段间距" value={config.paragraphSpacing} min={0} max={40} unit="px" onChange={v => setConfig({...config, paragraphSpacing: v})} />
             
             <div className="flex items-center justify-between p-3 bg-surface-container rounded-xl">
                <span className="text-xs font-bold text-secondary">文本加粗</span>
                <button 
                  onClick={() => setConfig({...config, textBold: config.textBold ? 0 : 1})}
                  className={`w-10 h-5 rounded-full transition-all relative ${config.textBold ? 'bg-primary' : 'bg-outline-variant'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${config.textBold ? 'left-6' : 'left-1'}`}></div>
                </button>
             </div>
          </div>

          {/* 页面布局 */}
          <div className="space-y-4">
             <label className="text-xs font-bold text-secondary uppercase flex items-center gap-2"><Layout size={14} /> 页面布局</label>
             <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Slider label="左边距" value={config.paddingLeft} min={0} max={100} onChange={v => setConfig({...config, paddingLeft: v})} />
                <Slider label="右边距" value={config.paddingRight} min={0} max={100} onChange={v => setConfig({...config, paddingRight: v})} />
                <Slider label="上边距" value={config.paddingTop} min={0} max={100} onChange={v => setConfig({...config, paddingTop: v})} />
                <Slider label="下边距" value={config.paddingBottom} min={0} max={100} onChange={v => setConfig({...config, paddingBottom: v})} />
             </div>
             <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-outline font-bold"><span>首行缩进</span></div>
                <select 
                  value={config.paragraphIndent} 
                  onChange={e => setConfig({...config, paragraphIndent: e.target.value})}
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-3 py-2 text-xs"
                >
                  <option value="">无缩进</option>
                  <option value="　">1字符</option>
                  <option value="　　">2字符</option>
                  <option value="　　　　">4字符</option>
                </select>
             </div>
          </div>

          {/* 标题样式 */}
          <div className="space-y-4">
             <label className="text-xs font-bold text-secondary uppercase flex items-center gap-2"><Type size={14} /> 标题样式</label>
             <div className="flex bg-surface-container p-1 rounded-xl gap-1">
                {['居左', '居中', '隐藏'].map((l, i) => (
                  <button key={i} onClick={() => setConfig({...config, titleMode: i})} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${config.titleMode === i ? 'bg-primary text-white shadow-sm' : 'text-secondary'}`}>{l}</button>
                ))}
             </div>
             {config.titleMode !== 2 && (
               <div className="space-y-4">
                 <Slider label="标题大小缩放" value={config.titleSize} min={0} max={10} onChange={v => setConfig({...config, titleSize: v})} />
                 <div className="grid grid-cols-2 gap-3">
                   <Slider label="标题上间距" value={config.titleTopSpacing} min={0} max={100} unit="px" onChange={v => setConfig({...config, titleTopSpacing: v})} />
                   <Slider label="标题下间距" value={config.titleBottomSpacing} min={0} max={100} unit="px" onChange={v => setConfig({...config, titleBottomSpacing: v})} />
                 </div>
               </div>
             )}
          </div>

          {/* 页眉页脚 */}
          <div className="space-y-4">
             <label className="text-xs font-bold text-secondary uppercase flex items-center gap-2"><Settings2 size={14} /> 页眉与页脚</label>
             <div className="p-3 bg-surface-container rounded-xl space-y-4">
               <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-secondary">文字颜色 (TipColor)</span>
                  <input 
                    type="color" 
                    value={getHex6(config.tipColor || '#80000000')} 
                    onChange={(e) => setConfig({...config, tipColor: cssToArgb(e.target.value)})} 
                    className="w-12 h-6 rounded cursor-pointer" 
                  />
               </div>
               
               <div className="space-y-3">
                 <span className="text-[10px] text-outline font-bold">页眉间距</span>
                 <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <Slider label="上" value={config.headerPaddingTop} min={0} max={100} onChange={v => setConfig({...config, headerPaddingTop: v})} />
                    <Slider label="下" value={config.headerPaddingBottom} min={0} max={100} onChange={v => setConfig({...config, headerPaddingBottom: v})} />
                    <Slider label="左" value={config.headerPaddingLeft} min={0} max={100} onChange={v => setConfig({...config, headerPaddingLeft: v})} />
                    <Slider label="右" value={config.headerPaddingRight} min={0} max={100} onChange={v => setConfig({...config, headerPaddingRight: v})} />
                 </div>
               </div>

               <div className="space-y-3">
                 <span className="text-[10px] text-outline font-bold">页脚间距</span>
                 <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <Slider label="上" value={config.footerPaddingTop} min={0} max={100} onChange={v => setConfig({...config, footerPaddingTop: v})} />
                    <Slider label="下" value={config.footerPaddingBottom} min={0} max={100} onChange={v => setConfig({...config, footerPaddingBottom: v})} />
                    <Slider label="左" value={config.footerPaddingLeft} min={0} max={100} onChange={v => setConfig({...config, footerPaddingLeft: v})} />
                    <Slider label="右" value={config.footerPaddingRight} min={0} max={100} onChange={v => setConfig({...config, footerPaddingRight: v})} />
                 </div>
               </div>
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

      {/* 资源选择浮层 */}
      <AnimatePresence>
        {showPicker && (
          <div className="absolute inset-0 z-[100] bg-on-background/20 backdrop-blur-sm flex items-center justify-end">
            <motion.div 
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              className="w-full md:w-[500px] h-full bg-surface shadow-2xl border-l border-outline-variant flex flex-col"
            >
              <AssetPicker 
                type={showPicker}
                fileTree={fileTree} // 从父组件传递过来的
                onSelect={(r: any) => {
                  if (showPicker === 'font') {
                    loadFont(r.path, r.name);
                    setManualAssets(p => ({ ...p, font: true }));
                  } else if (showPicker === 'bg') {
                    setConfig({...config, bgStr: r.path, bgType: 2});
                    setManualAssets(p => ({ ...p, bg: true }));
                  } else if (showPicker === 'layout') {
                    const isImg = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(r.extension);
                    loadBaseConfig(isImg ? 'image' : (r.path.endsWith('.zip') ? 'zip' : 'theme'), r);
                  }
                  setShowPicker(null);
                }}
                onClose={() => setShowPicker(null)}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AssetPicker({ type, fileTree, onSelect, onClose }: { type: string; fileTree: any; onSelect: (r: any) => void; onClose: () => void }) {
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  
  useEffect(() => {
    // 默认进入对应文件夹
    if (type === 'font') setCurrentPath(['fonts']);
    if (type === 'layout') setCurrentPath(['layouts']);
    if (type === 'bg') setCurrentPath(['themes']);
  }, [type]);

  const currentContent = useMemo(() => {
    if (!fileTree) return [];
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
  }, [fileTree, currentPath]);

  const title = type === 'font' ? '选择字体' : type === 'bg' ? '选择背景图' : '选择排版方案';

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-outline-variant flex items-center justify-between bg-surface-bright">
        <h4 className="font-bold flex items-center gap-2">{title}</h4>
        <button onClick={onClose} className="p-2 hover:bg-surface-container rounded-full transition-colors"><X size={20} /></button>
      </div>

      {/* 路径导航 */}
      <div className="px-4 py-2 bg-surface-container/30 flex items-center gap-1 text-[10px] text-secondary overflow-x-auto whitespace-nowrap scrollbar-none">
        <button onClick={() => setCurrentPath([])} className="hover:text-primary p-1">根目录</button>
        {currentPath.map((p, i) => (
          <React.Fragment key={i}>
            <ChevronRight size={10} className="opacity-30" />
            <button onClick={() => setCurrentPath(currentPath.slice(0, i + 1))} className="hover:text-primary p-1">{p}</button>
          </React.Fragment>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="grid grid-cols-2 gap-3">
          {currentContent.map((item: any, idx: number) => {
            const isFolder = item.type === 'folder';
            return (
              <div 
                key={idx}
                onClick={() => isFolder ? setCurrentPath([...currentPath, item.name]) : onSelect(item)}
                className="group flex flex-col bg-surface-container-lowest border border-outline-variant rounded-xl p-2 cursor-pointer hover:border-primary/50 transition-all"
              >
                <div className="aspect-video rounded-lg bg-surface-container mb-2 overflow-hidden flex items-center justify-center">
                   {isFolder ? (
                     <Folder size={24} className="text-primary/40" />
                   ) : type === 'bg' ? (
                     <img src={`${window.location.origin}/repo/${item.path}`} className="w-full h-full object-cover" />
                   ) : type === 'layout' ? (
                     <Package size={24} className="text-primary/30" />
                   ) : type === 'font' ? (
                     <FontPreview path={item.path} name={item.name} />
                   ) : <Type size={24} className="text-primary/30" />}
                </div>
                <span className="text-[10px] font-bold truncate group-hover:text-primary">{item.name}</span>
                {isFolder && <span className="text-[8px] text-outline">文件夹</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, unit = '', onChange }: { label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] text-outline font-bold">
        <span>{label}</span>
        <span>{value}{unit}</span>
      </div>
      <input 
        type="range" min={min} max={max} step={min < 5 && max < 10 ? 0.1 : 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary h-1 bg-surface-container-highest rounded-lg appearance-none cursor-pointer"
      />
    </div>
  );
}
