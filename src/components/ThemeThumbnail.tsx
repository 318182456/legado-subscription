import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { argbToCss } from '../utils/color';
import { PREVIEW_TITLE, PREVIEW_PARAS } from '../utils/constants';

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

  const tipStyle = { color: argbToCss(config.tipColor || '#803E3D3B'), fontSize: '4px', opacity: 0.8 };
  const COMP = 0.45;

  return (
    <div ref={containerRef} className="w-full aspect-[9/19] bg-black rounded-2xl p-[2px] shadow-lg overflow-hidden group-hover:ring-2 ring-primary/30 transition-all">
      <div className="w-full h-full flex flex-col overflow-hidden rounded-[14px] relative" style={style}>
        <div className="h-4 w-full flex items-center justify-center shrink-0 z-10">
          <div className="w-6 h-1 bg-black/20 rounded-full"></div>
        </div>

        {config.headerMode !== 2 && (
          <div className={`flex items-center justify-between px-2 pt-0.5 pb-0.5 shrink-0 ${config.showHeaderLine ? 'border-b border-current/10' : ''}`} style={tipStyle}>
            <TipView value={config.tipHeaderLeft ?? 2} />
            <TipView value={config.tipHeaderMiddle ?? 0} />
            <TipView value={config.tipHeaderRight ?? 3} />
          </div>
        )}

        <div className="flex-1 overflow-hidden" style={{ paddingLeft: `${config.paddingLeft * COMP}px`, paddingRight: `${config.paddingRight * COMP}px`, paddingTop: `${config.paddingTop * COMP}px`, paddingBottom: `${config.paddingBottom * COMP}px` }}>
          {config.titleMode !== 2 && (
            <div className={`font-bold ${config.titleMode === 1 ? 'text-center' : 'text-left'}`} style={{ 
              fontSize: `${config.textSize * (1.05 + (config.titleSize || 0) * 0.1) * COMP}px`,
              marginTop: `${(config.titleTopSpacing || 0) * COMP}px`, 
              marginBottom: `${(config.titleBottomSpacing || 0) * COMP}px`
            }}>
              {PREVIEW_TITLE}
            </div>
          )}
          <div className="space-y-1 opacity-90">
            {PREVIEW_PARAS.map((para, i) => (

              <p key={i} style={{ 
                fontSize: `${config.textSize * COMP}px`, 
                lineHeight: (config.textSize + (config.lineSpacingExtra || 0)) / config.textSize, 
                marginBottom: `${(config.paragraphSpacing || 0) * COMP}px`,
                textIndent: `${config.paragraphIndent?.length || 0}em` 
              }}>
                {para}
              </p>
            ))}
          </div>
        </div>

        {config.footerMode !== 2 && (
          <div className={`flex items-center justify-between px-2 pt-0.5 pb-2 shrink-0 ${config.showFooterLine ? 'border-t border-current/10' : ''}`} style={tipStyle}>
            <TipView value={config.tipFooterLeft ?? 1} />
            <TipView value={config.tipFooterMiddle ?? 0} />
            <TipView value={config.tipFooterRight ?? 6} />
          </div>
        )}
      </div>
    </div>
  );
}
