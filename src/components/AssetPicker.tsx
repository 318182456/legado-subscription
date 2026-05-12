import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, ChevronRight, Folder, Package, Type 
} from 'lucide-react';
import { FontPreview } from './FontPreview';

export function AssetPicker({ type, fileTree, onSelect, onClose }: { type: string; fileTree: any; onSelect: (r: any) => void; onClose: () => void }) {
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
