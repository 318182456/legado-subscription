import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, RefreshCw, Package, Book, Sparkles, Copy, X, Folder, 
  ChevronRight, Home, Trash2, Image as ImageIcon, Type, 
  FileText, Download, Maximize2, Palette, LayoutGrid, List,
  ArrowUpDown, Filter
} from 'lucide-react';
import * as api from '../api';

import { PreviewModal } from '../components/PreviewModal';
import { FontPreview } from '../components/FontPreview';
import { StyleSandbox } from '../components/StyleSandbox';
import { argbToCss } from '../utils/color';

function TipView({ value }: { value: number }) {
  if (value === 0) return <span></span>;
  const labelMap: Record<number, string> = {
    7: '书名',
    1: '章节名',
    2: '17:36',
    3: '75%',
    10: '75%',
    4: '1',
    5: '5.2%',
    11: '5.2%',
    6: '1 / 18',
    8: '17:36 75%',
    9: '17:36 75%'
  };
  return <span>{labelMap[value] || ''}</span>;
}

function ThemePreview({ config }: { config: any }) {
  const [fontFamily, setFontFamily] = useState<string>('inherit');
  const [selectedFontName, setSelectedFontName] = useState<string>('');

  useEffect(() => {
    if (config.textFont && !config.textFont.startsWith('content://')) {
      const fontName = config.textFont.split('/').pop()?.split('.')[0] || 'CustomFont';
      const fontUrl = `${window.location.origin}/repo/${config.textFont}`;
      const fontFace = new FontFace(fontName, `url(${fontUrl})`);
      fontFace.load().then((loadedFace) => {
        (document.fonts as any).add(loadedFace);
        setFontFamily(fontName);
        setSelectedFontName(fontName);
      }).catch(e => console.error('Font load failed', e));
    } else {
      setFontFamily('inherit');
      setSelectedFontName('');
    }
  }, [config.textFont]);

  const style: React.CSSProperties = {
    backgroundColor: config.bgType === 0 ? argbToCss(config.bgStr || '#EEEEEE') : 'white',
    color: argbToCss(config.textColor || '#3E3D3B'),
    fontFamily: fontFamily,
    backgroundImage: config.bgType === 2 ? `url(${window.location.origin}/repo/${config.bgStr})` : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    fontWeight: config.textBold ? 'bold' : 'normal',
    letterSpacing: `${(config.letterSpacing || 0.1)}em`,
  };

  const tipStyle = { color: argbToCss(config.tipColor || '#803E3D3B'), fontSize: '8px', opacity: 0.8 };
  
  // 逻辑缩放补偿系数
  const COMP = 0.82;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden" style={style}>
      {/* 模拟页眉 */}
      {config.headerMode !== 2 && (
        <div className={`flex items-center justify-between px-4 pt-4 pb-1 shrink-0 ${config.showHeaderLine ? 'border-b border-current/10' : ''}`} style={{ ...tipStyle, paddingLeft: `${16 * COMP}px`, paddingRight: `${16 * COMP}px` }}>
          <TipView value={config.tipHeaderLeft ?? 2} />
          <TipView value={config.tipHeaderMiddle ?? 0} />
          <TipView value={config.tipHeaderRight ?? 3} />
        </div>
      )}

      {/* 主体内容 */}
      <div className="flex-1 overflow-hidden" style={{ paddingLeft: `${config.paddingLeft * COMP}px`, paddingRight: `${config.paddingRight * COMP}px`, paddingTop: `${config.paddingTop * COMP}px`, paddingBottom: `${config.paddingBottom * COMP}px` }}>
        {config.titleMode !== 2 && (
          <div className={`font-bold mb-2 ${config.titleMode === 1 ? 'text-center' : 'text-left'}`} style={{ fontSize: `${config.textSize * 0.6 * COMP}px` }}>
            预览章节标题
          </div>
        )}
        <div className="space-y-2 opacity-90">
          {[1, 2, 3].map(i => (
            <p key={i} style={{ 
              fontSize: `${config.textSize * 0.45 * COMP}px`, 
              lineHeight: 1.5, 
              marginBottom: `${config.paragraphSpacing * COMP}px`,
              textIndent: `${config.paragraphIndent?.length || 0}em` 
            }}>
              这是生成的自定义主题效果预览。
            </p>
          ))}
        </div>
      </div>

      {/* 模拟页脚 */}
      {config.footerMode !== 2 && (
        <div className={`flex items-center justify-between px-4 pt-1 pb-4 shrink-0 ${config.showFooterLine ? 'border-t border-current/10' : ''}`} style={{ ...tipStyle, paddingLeft: `${16 * COMP}px`, paddingRight: `${16 * COMP}px` }}>
          <TipView value={config.tipFooterLeft ?? 1} />
          <TipView value={config.tipFooterMiddle ?? 0} />
          <TipView value={config.tipFooterRight ?? 6} />
        </div>
      )}
    </div>
  );
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

  // 新增功能状态
  const [layoutType, setLayoutType] = useState<'grid' | 'list'>('grid');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'image' | 'font' | 'theme' | 'zip'>('all');
  const [sortOrder, setSortOrder] = useState<'name' | 'type'>('type');
  const [searchInNameOnly, setSearchInNameOnly] = useState(false);

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

  // 获取当前路径下的内容并进行过滤/排序
  const currentContent = useMemo(() => {
    if (!fileTree) return [];
    
    let baseContent: any[] = [];
    if (query) {
      // 搜索模式：平铺展示，支持多关键字（空格分隔）
      const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
      const results: any[] = [];
      const traverse = (node: any) => {
        if (node.type === 'file') {
          const target = searchInNameOnly ? node.name.toLowerCase() : node.path.toLowerCase();
          if (keywords.every(kw => target.includes(kw))) {
            results.push(node);
          }
        } else if (node.children) {
          Object.values(node.children).forEach(traverse);
        }
      };
      Object.values(fileTree.children).forEach(traverse);
      baseContent = results;
    } else {
      let current = fileTree;
      for (const part of currentPath) {
        if (current.children && current.children[part]) {
          current = current.children[part];
        } else {
          return [];
        }
      }
      baseContent = Object.values(current.children || {});
    }

    // 类型过滤
    let filtered = baseContent;
    if (categoryFilter !== 'all') {
      filtered = baseContent.filter(item => {
        if (item.type === 'folder') return true; // 文件夹始终显示
        if (categoryFilter === 'image') return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(item.extension);
        if (categoryFilter === 'font') return ['ttf', 'otf', 'woff', 'woff2'].includes(item.extension);
        if (categoryFilter === 'theme') return item.extension === 'json' || item.category === 'themes';
        if (categoryFilter === 'zip') return item.extension === 'zip';
        return true;
      });
    }

    // 排序
    return filtered.sort((a: any, b: any) => {
      if (sortOrder === 'type') {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.extension?.localeCompare(b.extension || '') || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
  }, [fileTree, currentPath, query, categoryFilter, sortOrder]);

  const navigateTo = (path: string[]) => {
    setCurrentPath(path);
    setQuery('');
  };

  const getIcon = (item: any, size = 20) => {
    if (item.type === 'folder') return <Folder className="text-primary" size={size} />;
    const ext = item.extension;
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return <ImageIcon className="text-tertiary" size={size} />;
    if (['ttf', 'otf', 'woff', 'woff2'].includes(ext)) return <Type className="text-secondary" size={size} />;
    if (['txt', 'json', 'js', 'css'].includes(ext)) return <FileText className="text-outline" size={size} />;
    return <Book className="text-outline" size={size} />;
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

  const categories = [
    { id: 'all', label: '全部', icon: <Filter size={14} /> },
    { id: 'image', label: '图片', icon: <ImageIcon size={14} /> },
    { id: 'font', label: '字体', icon: <Type size={14} /> },
    { id: 'theme', label: '主题', icon: <Palette size={14} /> },
    { id: 'zip', label: '压缩包', icon: <Package size={14} /> },
  ];

  const quickTags = [
    '护眼', '黑色', '精选', '封面', '简约', '高仿'
  ];

  const handleTagClick = (tag: string) => {
    setQuery(prev => prev.includes(tag) ? prev : (prev + ' ' + tag).trim());
  };

  const editTheme = (item: any) => {
    setSandboxConfig({ 
      base: item, 
      type: 'saved' 
    });
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
          <div className="relative w-72 flex items-center bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all overflow-hidden">
            <Search className="ml-3 text-secondary shrink-0" size={16} />
            <input 
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchInNameOnly ? "按文件名搜索..." : "按路径/名称搜索..."}
              className="w-full bg-transparent pl-2 pr-4 py-2 text-sm outline-none"
            />
            <button 
              onClick={() => setSearchInNameOnly(!searchInNameOnly)}
              className={`px-2 py-1 mx-1 text-[10px] font-bold rounded-md transition-colors shrink-0 ${searchInNameOnly ? 'bg-primary/10 text-primary' : 'bg-surface-container text-secondary'}`}
              title={searchInNameOnly ? "切换为全路径搜索" : "切换为仅文件名搜索"}
            >
              {searchInNameOnly ? '文件名' : '全路径'}
            </button>
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
          {/* 工具栏: 面包屑 + 布局切换 + 排序 */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            {!query && (
              <div className="flex items-center gap-1 text-sm text-secondary overflow-x-auto whitespace-nowrap py-1 scrollbar-none">
                <button onClick={() => navigateTo([])} className="p-1.5 hover:bg-surface-container rounded-lg transition-colors flex items-center gap-1.5 hover:text-primary"><Home size={16} /><span className="font-bold">根目录</span></button>
                {currentPath.map((part, i) => (
                  <React.Fragment key={i}>
                    <ChevronRight size={14} className="opacity-30" /><button onClick={() => navigateTo(currentPath.slice(0, i + 1))} className="px-2 py-1.5 hover:bg-surface-container rounded-lg transition-colors font-medium hover:text-primary">{part}</button>
                  </React.Fragment>
                ))}
              </div>
            )}
            
            <div className="flex items-center gap-3 ml-auto">
              {/* 常用关键字标签 */}
              <div className="hidden lg:flex items-center gap-2 mr-4">
                 <span className="text-[10px] text-outline font-bold uppercase">常用标签:</span>
                 {quickTags.map(tag => (
                   <button 
                     key={tag} 
                     onClick={() => handleTagClick(tag)}
                     className="px-2 py-0.5 bg-surface-container hover:bg-primary/10 hover:text-primary text-[10px] rounded transition-colors text-secondary font-medium"
                   >
                     {tag}
                   </button>
                 ))}
              </div>

              {/* 类型过滤标签 */}
              <div className="flex bg-surface-container p-1 rounded-xl">
                {categories.map(cat => (
                  <button 
                    key={cat.id} 
                    onClick={() => setCategoryFilter(cat.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${categoryFilter === cat.id ? 'bg-surface-bright shadow-sm text-primary' : 'text-secondary hover:text-on-surface'}`}
                  >
                    {cat.icon} {cat.label}
                  </button>
                ))}
              </div>

              {/* 排序与布局切换 */}
              <div className="h-8 w-[1px] bg-outline-variant/30 mx-1"></div>
              
              <button 
                onClick={() => setSortOrder(sortOrder === 'name' ? 'type' : 'name')}
                className="p-2 text-secondary hover:bg-surface-container rounded-lg transition-colors flex items-center gap-2 text-xs font-bold"
                title={sortOrder === 'name' ? '按类型排序' : '按名称排序'}
              >
                <ArrowUpDown size={16} /> {sortOrder === 'name' ? '名称' : '类型'}
              </button>

              <div className="bg-surface-container p-1 rounded-xl flex gap-1">
                <button onClick={() => setLayoutType('grid')} className={`p-1.5 rounded-lg transition-all ${layoutType === 'grid' ? 'bg-surface-bright text-primary shadow-sm' : 'text-secondary'}`}><LayoutGrid size={16} /></button>
                <button onClick={() => setLayoutType('list')} className={`p-1.5 rounded-lg transition-all ${layoutType === 'list' ? 'bg-surface-bright text-primary shadow-sm' : 'text-secondary'}`}><List size={16} /></button>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
            {loading ? (
              <div className="py-20 text-center text-secondary"><RefreshCw size={32} className="animate-spin mx-auto mb-4 opacity-20" /><p>正在同步资源结构...</p></div>
            ) : currentContent.length === 0 ? (
              <div className="py-20 text-center text-secondary border border-dashed border-outline-variant rounded-2xl"><Package size={48} className="mx-auto mb-4 opacity-10" /><p>{query ? '未找到相关资源' : '该文件夹为空'}</p></div>
            ) : layoutType === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {currentContent.map((item: any, idx: number) => {
                  const isFolder = item.type === 'folder';
                  const url = `${window.location.origin}/repo/${item.path}`;
                  const isImg = !isFolder && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(item.extension);
                  
                  return (
                    <div key={idx} onClick={() => isFolder && navigateTo([...currentPath, item.name])} className="group flex flex-col bg-surface-container-lowest border border-outline-variant rounded-2xl p-3 transition-all hover:shadow-lg hover:border-primary/30 cursor-pointer">
                      <div className="relative aspect-video rounded-xl bg-surface-container overflow-hidden flex items-center justify-center mb-3">
                        {isFolder ? <Folder size={48} className="text-primary/40 group-hover:scale-110 transition-transform" /> : isImg ? <img src={url} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" /> : ['ttf', 'otf', 'woff', 'woff2'].includes(item.extension) ? <FontPreview path={item.path} name={item.name} /> : <div className="text-primary/30 font-bold text-lg uppercase">{item.extension || 'FILE'}</div>}
                        {!isFolder && (
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                             <button onClick={(e) => { e.stopPropagation(); setPreviewItem({ ...item, url }); }} className="p-2 bg-white text-on-surface rounded-full hover:bg-primary hover:text-white transition-all shadow-lg"><Maximize2 size={18} /></button>
                             <button onClick={(e) => { e.stopPropagation(); setSandboxConfig({ base: item, type: item.extension === 'zip' ? 'zip' : (item.category === 'fonts' ? 'font' : 'theme') }); }} className="p-2 bg-white text-on-surface rounded-full hover:bg-primary hover:text-white transition-all shadow-lg"><Palette size={18} /></button>
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
            ) : (
              /* 列表模式 */
              <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container/50 text-[10px] font-bold text-secondary uppercase tracking-wider border-b border-outline-variant/30">
                      <th className="px-6 py-3">名称</th>
                      <th className="px-6 py-3">路径</th>
                      <th className="px-6 py-3">类型</th>
                      <th className="px-6 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {currentContent.map((item: any, idx: number) => {
                      const isFolder = item.type === 'folder';
                      const url = `${window.location.origin}/repo/${item.path}`;
                      return (
                        <tr key={idx} onClick={() => isFolder && navigateTo([...currentPath, item.name])} className="hover:bg-primary/5 transition-colors cursor-pointer group text-sm">
                          <td className="px-6 py-4 flex items-center gap-3">
                            {getIcon(item, 18)}
                            <span className="font-bold truncate max-w-[200px]">{item.name}</span>
                          </td>
                          <td className="px-6 py-4 text-xs text-secondary font-mono truncate max-w-[300px]">{item.path}</td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-0.5 bg-surface-container text-[10px] font-bold rounded-full text-secondary uppercase">
                              {isFolder ? 'Folder' : (item.extension || 'File')}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {!isFolder && (
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={(e) => { e.stopPropagation(); setPreviewItem({ ...item, url }); }} className="p-1.5 hover:bg-primary/10 text-primary rounded-lg transition-colors"><Maximize2 size={16} /></button>
                                <button onClick={(e) => { e.stopPropagation(); setSandboxConfig({ base: item, type: item.extension === 'zip' ? 'zip' : (item.category === 'fonts' ? 'font' : 'theme') }); }} className="p-1.5 hover:bg-primary/10 text-primary rounded-lg transition-colors"><Palette size={16} /></button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 精选主题视图 */
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
          {customThemes.length === 0 ? (
            <div className="py-20 text-center text-secondary border border-dashed border-outline-variant rounded-2xl"><Sparkles size={48} className="mx-auto mb-4 opacity-10" /><p>暂无精选主题。</p></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {customThemes.map((item) => {
                const config = JSON.parse(item.config);
                const exportUrl = `${window.location.origin}/api/custom-themes/${item.id}/export`;
                const importUrl = 'legado://import/readConfig?src=' + encodeURIComponent(exportUrl);
                return (
                  <div key={item.id} onClick={() => editTheme(item)} className="bg-surface-container-lowest border border-outline-variant rounded-2xl overflow-hidden group hover:shadow-xl transition-all cursor-pointer">
                    <div className="aspect-[4/3] relative bg-surface-container flex items-center justify-center">
                       {item.preview_url ? <img src={item.preview_url} className="w-full h-full object-cover" /> : <ThemePreview config={config} />}
                       <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); deleteTheme(item.id); }} className="p-1.5 bg-red-500 text-white rounded-lg shadow-lg hover:scale-105 transition-transform"><Trash2 size={14} /></button></div>
                    </div>
                    <div className="p-4" onClick={(e) => e.stopPropagation()}>
                      <h3 className="font-bold text-sm mb-1">{item.name}</h3>
                      <p className="text-[10px] text-secondary mb-4">创建于 {new Date(item.created_at).toLocaleString()}</p>
                      <div className="flex gap-2">
                        <button onClick={() => { navigator.clipboard.writeText(importUrl); alert('导入链接已复制'); }} className="flex-1 py-2 bg-surface-container text-primary rounded-xl text-[10px] font-bold flex items-center justify-center gap-1"><Copy size={12} /> 复制</button>
                        <a href={importUrl} className="flex-1 py-2 bg-primary text-on-primary rounded-xl text-[10px] font-bold flex items-center justify-center gap-1"><Download size={12} /> 导入</a>
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
            <StyleSandbox initialBase={sandboxConfig.base} initialType={sandboxConfig.type} fileTree={fileTree} onClose={() => setSandboxConfig(null)} onSaved={() => { setSandboxConfig(null); fetchAll(); }} />
          </div>
        )}
      </AnimatePresence>

      {/* 预览弹窗 */}
      <AnimatePresence>{previewItem && <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />}</AnimatePresence>
    </div>
  );
}
