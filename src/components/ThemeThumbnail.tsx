import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { argbToCss } from '../utils/color';
import { PREVIEW_TITLE, PREVIEW_PARAS } from '../utils/constants';
import { generatePreviewHTML, getTipText } from '../utils/preview';

function TipView({ value }: { value: number }) {
  if (value === 0) return <span></span>;
  const labelMap: Record<number, string> = {
    7: '影视世界当神探',
    1: '第1353章 1369章会面...',
    2: '11:00',
    3: '■',
    10: '69%',
    4: '1',
    5: '60.5%',
    11: '1/13',
    6: '1/13 60.5%',
    8: '11:00 ■',
    9: '11:00 69%'
  };
  return <span>{labelMap[value] || ''}</span>;
}

export function ThemeThumbnail({ path, name, config: initialConfig, previewUrl: initialPreviewUrl }: { path?: string; name: string; config?: any; previewUrl?: string }) {
  const [config, setConfig] = useState<any>(initialConfig);
  const [loading, setLoading] = useState(!initialConfig);
  const [error, setError] = useState(false);
  const [inView, setInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fontFamily, setFontFamily] = useState<string>('inherit');
  const [scale, setScale] = useState(0.45);
  const [resources, setResources] = useState<any>(null);

  useEffect(() => {
    import('../api').then(api => {
      api.getResources().then(setResources);
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        // contentRect.width already excludes the parent's p-[2px] (total 4px)
        setScale(entry.contentRect.width / 320);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
      setLoading(false);
    }
  }, [initialConfig]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '50px' }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [path]);

  useEffect(() => {
    if (!inView || config || !path) return;
    setLoading(true);
    fetch(`${window.location.origin}/repo/${path}`)
      .then(res => res.json())
      .then(data => {
        setConfig(data);
        setLoading(false);
      })
      .catch(e => {
        console.error('Failed to load theme config', e);
        setError(true);
        setLoading(false);
      });
  }, [inView, path]);

  useEffect(() => {
    if (!config?.textFont) return;
    
    const decodedFont = decodeURIComponent(config.textFont).split('/').pop() || '';
    
    // 尝试在资源中找这个字体
    const tryLoad = (path: string, name: string) => {
      const fontUrl = path.startsWith('blob:') ? path : `${window.location.origin}/repo/${path}`;
      const fontFace = new (window as any).FontFace(name, `url(${fontUrl})`);
      fontFace.load().then((loadedFace: any) => {
        (document.fonts as any).add(loadedFace);
        setFontFamily(name);
      }).catch((e: any) => console.error('Theme font load failed', e));
    };

    if (config.textFont.startsWith('blob:')) {
      tryLoad(config.textFont, 'BlobFont_' + Math.random().toString(36).substring(7));
    } else if (!config.textFont.startsWith('content://')) {
      const fontName = decodedFont.split('.')[0] || 'ThemeFont';
      tryLoad(config.textFont, fontName);
    } else if (resources) {
      const foundFont = resources.fonts?.find((f: any) => {
        const fDecoded = decodeURIComponent(f.path).split('/').pop();
        return fDecoded === decodedFont || f.path === config.textFont;
      });
      if (foundFont) tryLoad(foundFont.path, foundFont.name);
    }
  }, [config?.textFont, resources]);

  if (!inView) return <div ref={containerRef} className="w-full aspect-[9/19] bg-surface-container animate-pulse rounded-xl" />;

  if (loading) return (
    <div ref={containerRef} className="w-full aspect-[9/19] bg-surface-container rounded-xl flex flex-col items-center justify-center gap-2">
      <Loader2 className="animate-spin text-primary/30" size={24} />
      <span className="text-[10px] text-secondary opacity-50">加载主题...</span>
    </div>
  );

  if (error || !config) return (
    <div ref={containerRef} className="w-full aspect-[9/19] bg-surface-container rounded-xl flex flex-col items-center justify-center text-error/40">
      <AlertCircle size={24} />
      <span className="text-[10px]">加载失败</span>
    </div>
  );

  const style: React.CSSProperties = {
    backgroundColor: config.bgType === 0 ? argbToCss(config.bgStr || '#EEEEEE') : 'transparent',
    color: argbToCss(config.textColor || '#3E3D3B'),
    fontFamily: fontFamily,
    backgroundImage: (config.bgType === 2 && config.bgStr && !config.bgStr.startsWith('content://')) ? 
      `url("${config.bgStr.startsWith('blob:') ? config.bgStr : `${window.location.origin}/repo/${config.bgStr}`}")` : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    fontWeight: config.textBold ? 'bold' : 'normal',
    letterSpacing: `${(config.letterSpacing || 0.1)}em`,
  };

  const COMP = 0.82; // Matches StyleSandbox scale

  return (
    <div 
      ref={containerRef} 
      className="w-full aspect-[9/19.5] rounded-[36px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] group-hover:ring-2 ring-primary/30 transition-all relative bg-[#0a0a0a] p-[6px] border border-white/10"
    >
      {/* 顶部中置挖孔镜头 */}
      <div className="absolute top-[12px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-black rounded-full z-20 border border-white/5 shadow-inner"></div>
      
      {/* 底部手势条 */}
      <div className="absolute bottom-[10px] left-1/2 -translate-x-1/2 w-[25%] h-[3px] bg-white/20 rounded-full z-20"></div>

      {/* 屏幕内容 */}
      <div className={`w-full h-full rounded-[30px] overflow-hidden relative bg-black ${(initialPreviewUrl || config.preview_url) ? 'bg-surface-container-low' : ''}`}>
        {(initialPreviewUrl || config.preview_url) ? (
          <img 
            src={initialPreviewUrl || config.preview_url} 
            alt={name} 
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div 
            className="absolute top-1/2 left-1/2 flex flex-col overflow-hidden origin-center" 
            style={{ 
              ...style, 
              width: '320px', 
              height: '693.33px', // Adjust height for 9/19.5
              transform: `translate(-50%, -50%) scale(${scale})`,
              borderRadius: `${14 / scale}px` 
            }}
          >
            <div className="h-4 w-full flex items-center justify-center shrink-0 z-10">
              <div className="w-6 h-1 bg-black/20 rounded-full"></div>
            </div>

            <div dangerouslySetInnerHTML={{ __html: generatePreviewHTML(config, COMP, getTipText, argbToCss, PREVIEW_TITLE, PREVIEW_PARAS) }} className="w-full h-full flex flex-col" />
          </div>
        )}
      </div>
    </div>
  );
}
