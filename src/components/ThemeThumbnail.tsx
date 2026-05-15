import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, ImageIcon } from 'lucide-react';

export function ThemeThumbnail({ path, name, config: initialConfig, previewUrl: initialPreviewUrl }: { path?: string; name: string; config?: any; previewUrl?: string }) {
  const [config, setConfig] = useState<any>(initialConfig);
  const [loading, setLoading] = useState(!initialConfig);
  const [error, setError] = useState(false);
  const [inView, setInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [resources, setResources] = useState<any>(null);
  const [fontFamily, setFontFamily] = useState('sans-serif');

  useEffect(() => {
    import('../api').then(api => {
      api.getResources().then(setResources);
    });
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
      .then(res => res.text())
      .then(text => {
        try {
          const data = JSON.parse(text);
          setConfig(data);
          setLoading(false);
        } catch (e) {
          throw new Error('Invalid JSON');
        }
      })
      .catch(e => {
        // 静默处理或仅记录警告，因为这可能是个普通的说明文档而非主题配置
        console.warn(`[ThemeThumbnail] Skipping non-theme file: ${path}`);
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

  if (!inView) return <div ref={containerRef} className="w-full aspect-9/19 bg-surface-container animate-pulse rounded-lg" />;

  if (loading) return (
    <div ref={containerRef} className="w-full aspect-9/19 bg-surface-container rounded-lg flex flex-col items-center justify-center gap-2">
      <Loader2 className="animate-spin text-primary/30" size={24} />
      <span className="text-[10px] text-secondary opacity-50">加载主题...</span>
    </div>
  );

  if (error || !config) return (
    <div ref={containerRef} className="w-full aspect-9/19 bg-surface-container rounded-lg flex flex-col items-center justify-center text-error/40">
      <AlertCircle size={24} />
      <span className="text-[10px]">加载失败</span>
    </div>
  );



  return (
    <div 
      ref={containerRef} 
      className="w-full aspect-9/19.5 rounded-[16px] shadow-[0_12px_30px_-6px_rgba(0,0,0,0.3)] group-hover:ring-2 ring-primary/30 transition-all relative bg-[#0a0a0a] p-[3px] border border-white/10"
    >
      {/* 屏幕内容 */}
      <div className={`w-full h-full rounded-[13px] overflow-hidden relative bg-black ${(initialPreviewUrl || config.preview_url) ? 'bg-surface-container-low' : ''}`}>
        {(initialPreviewUrl || config?.preview_url) ? (
          <img 
            key={initialPreviewUrl || config?.preview_url}
            src={initialPreviewUrl || config?.preview_url} 
            alt={name} 
            className="w-full h-full object-cover animate-in fade-in duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-outline/30 bg-surface-container-lowest">
            <ImageIcon size={32} strokeWidth={1} />
            <span className="text-[10px] mt-2">暂无预览</span>
          </div>
        )}
      </div>
    </div>
  );
}
