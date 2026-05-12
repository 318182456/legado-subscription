import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, ChevronRight, Folder, Package, Type, Search 
} from 'lucide-react';
import { FontPreview } from './FontPreview';

export function AssetPicker({ type, fileTree, onSelect, onClose }: { type: string; fileTree: any; onSelect: (r: any) => void; onClose: () => void }) {
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [searchInNameOnly, setSearchInNameOnly] = useState(true);
  
  useEffect(() => {
    // 默认进入对应文件夹
    if (type === 'font') setCurrentPath(['fonts']);
    if (type === 'layout') setCurrentPath(['layouts']);
    if (type === 'bg') setCurrentPath(['themes']);
  }, [type]);

  const currentContent = useMemo(() => {
    if (!fileTree) return [];
    
    // 如果有搜索词，执行全量平铺搜索
    if (query) {
      const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
      const results: any[] = [];
      
      // 确定搜索起点
      let startNode = fileTree;
      // 在 AssetPicker 中，搜索通常限制在当前 type 对应的目录下
      const baseDir = type === 'font' ? 'fonts' : type === 'layout' ? 'layouts' : 'themes';
      if (startNode.children && startNode.children[baseDir]) {
        startNode = startNode.children[baseDir];
      }

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
      traverse(startNode);
      return results;
    }

    // 无搜索词，按路径浏览
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
  }, [fileTree, currentPath, query, searchInNameOnly, type]);

  const title = type === 'font' ? '选择字体' : type === 'bg' ? '选择背景图' : '选择排版方案';

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between bg-surface-bright">
        <h4 className="font-bold flex items-center gap-2">{title}</h4>
        <button onClick={onClose} className="p-2 hover:bg-surface-container rounded-full transition-colors"><X size={20} /></button>
      </div>

      {/* 搜索栏 */}
      <div className="px-4 py-3 bg-surface-container/20 border-b border-outline-variant/30 flex flex-col gap-2">
        <div className="relative flex items-center bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <Search className="ml-3 text-secondary shrink-0" size={14} />
          <input 
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchInNameOnly ? "输入关键字过滤文件名..." : "输入关键字过滤路径..."}
            className="w-full bg-transparent pl-2 pr-2 py-2 text-xs outline-none"
          />
          <button 
            onClick={() => setSearchInNameOnly(!searchInNameOnly)}
            className={`px-2 py-1 mx-1 text-[8px] font-bold rounded transition-colors shrink-0 ${searchInNameOnly ? 'bg-primary/10 text-primary' : 'bg-surface-container text-secondary'}`}
          >
            {searchInNameOnly ? '文件名' : '路径'}
          </button>
          {query && (
            <button onClick={() => setQuery('')} className="p-2 text-outline hover:text-primary transition-colors">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 路径导航 (仅在非搜索模式显示) */}
      {!query && (
        <div className="px-4 py-2 bg-surface-container/10 flex items-center gap-1 text-[10px] text-secondary overflow-x-auto whitespace-nowrap scrollbar-none border-b border-outline-variant/10">
          <button onClick={() => setCurrentPath([])} className="hover:text-primary p-1">根目录</button>
          {currentPath.map((p, i) => (
            <React.Fragment key={i}>
              <ChevronRight size={10} className="opacity-30" />
              <button onClick={() => setCurrentPath(currentPath.slice(0, i + 1))} className="hover:text-primary p-1">{p}</button>
            </React.Fragment>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {currentContent.length === 0 ? (
          <div className="py-20 text-center text-outline">
            <Search size={32} className="mx-auto mb-2 opacity-20" />
            <p className="text-[10px]">未找到匹配项</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {currentContent.map((item: any, idx: number) => {
              const isFolder = item.type === 'folder';
              return (
                <div 
                  key={idx}
                  onClick={() => isFolder ? setCurrentPath([...currentPath, item.name]) : onSelect(item)}
                  className="group flex flex-col bg-surface-container-lowest border border-outline-variant rounded-xl p-2 cursor-pointer hover:border-primary/50 transition-all shadow-sm hover:shadow-md"
                >
                  <div className="aspect-video rounded-lg bg-surface-container mb-2 overflow-hidden flex items-center justify-center">
                    {isFolder ? (
                      <Folder size={24} className="text-primary/40 group-hover:scale-110 transition-transform" />
                    ) : type === 'bg' ? (
                      <img src={`${window.location.origin}/repo/${item.path}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : type === 'layout' ? (
                      <Package size={24} className="text-primary/30" />
                    ) : type === 'font' ? (
                      <FontPreview path={item.path} name={item.name} />
                    ) : <Type size={24} className="text-primary/30" />}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold truncate group-hover:text-primary transition-colors">{item.name}</span>
                    {query && !searchInNameOnly && <span className="text-[8px] text-outline truncate opacity-60 italic">{item.path}</span>}
                    {isFolder && <span className="text-[8px] text-outline">文件夹</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
