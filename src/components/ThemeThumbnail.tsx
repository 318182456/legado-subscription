import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { argbToCss } from '../utils/color';
import { PREVIEW_TITLE, PREVIEW_PARAS } from '../utils/constants';
import { generatePreviewHTML, getTipText } from '../utils/preview';

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
    6: '1/18',
    8: '17:36 75%',
    9: '17:36 75%'
  };
  return <span>{labelMap[value] || ''}</span>;
}

export function ThemeThumbnail({ path, name, config: initialConfig }: { path?: string; name: string; config?: any }) {
  const [config, setConfig] = useState<any>(initialConfig);
  const [loading, setLoading] = useState(!initialConfig);
  const [error, setError] = useState(false);
  const [inView, setInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fontFamily, setFontFamily] = useState<string>('inherit');
  const [lastInitialConfig, setLastInitialConfig] = useState(initialConfig);
  const [scale, setScale] = useState(0.45);

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
    if (initialConfig && initialConfig !== lastInitialConfig) {
      setConfig(initialConfig);
      setLastInitialConfig(initialConfig);
    }
  }, [initialConfig, lastInitialConfig]);

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
    if (config?.textFont && !config.textFont.startsWith('content://')) {
      const fontName = config.textFont.split('/').pop()?.split('.')[0] || 'ThemeFont';
      const fontUrl = `${window.location.origin}/repo/${config.textFont}`;
      const fontFace = new (window as any).FontFace(fontName, `url(${fontUrl})`);
      fontFace.load().then((loadedFace: any) => {
        (document.fonts as any).add(loadedFace);
        setFontFamily(fontName);
      }).catch((e: any) => console.error('Theme font load failed', e));
    }
  }, [config?.textFont]);

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
    backgroundColor: config.bgType === 0 ? argbToCss(config.bgStr || '#EEEEEE') : 'white',
    color: argbToCss(config.textColor || '#3E3D3B'),
    fontFamily: fontFamily,
    backgroundImage: config.bgType === 2 ? `url(${window.location.origin}/repo/${config.bgStr})` : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    fontWeight: config.textBold ? 'bold' : 'normal',
    letterSpacing: `${(config.letterSpacing || 0.1)}em`,
  };

  const COMP = 0.82; // Matches StyleSandbox scale

  return (
    <div ref={containerRef} className="w-full aspect-[9/19] bg-black rounded-2xl p-[2px] shadow-lg overflow-hidden group-hover:ring-2 ring-primary/30 transition-all relative">
      <div 
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <div 
          className="flex flex-col overflow-hidden rounded-[14px] origin-center" 
          style={{ ...style, width: '320px', height: '675.56px', transform: `scale(${scale})` }}
        >
          <div className="h-4 w-full flex items-center justify-center shrink-0 z-10">
            <div className="w-6 h-1 bg-black/20 rounded-full"></div>
          </div>

          <div dangerouslySetInnerHTML={{ __html: generatePreviewHTML(config, COMP, getTipText, argbToCss, PREVIEW_TITLE, PREVIEW_PARAS) }} className="w-full h-full flex flex-col" />
        </div>
      </div>
    </div>
  );
}
