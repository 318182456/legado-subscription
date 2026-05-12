import React, { useState, useEffect, useRef } from 'react';

export function FontPreview({ path, name }: { path: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  const fontId = useRef(`font_${Math.random().toString(36).substring(7)}`);

  useEffect(() => {
    const fontUrl = `${window.location.origin}/repo/${path}`;
    const fontFace = new (window as any).FontFace(fontId.current, `url('${fontUrl}')`);
    fontFace.load().then((f: any) => {
      (document.fonts as any).add(f);
      setLoaded(true);
    }).catch((e: any) => {
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
