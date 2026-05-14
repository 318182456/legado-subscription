import { argbToCss } from './color';

export interface RenderOptions {
    width: number;
    height: number;
    pixelRatio: number;
    fontFamily?: string;
    bgImage?: HTMLImageElement | null;
    getTipText: (type: number) => string;
    PREVIEW_TITLE: string;
    PREVIEW_PARAS: string[];
}

/**
 * 专业级字形宽度缓存
 */
const glyphWidthCache = new Map<string, number>();

/**
 * 核心渲染引擎 (V4.2 最终修正版)
 */
export async function drawTheme(
    ctx: CanvasRenderingContext2D,
    cfg: any,
    options: RenderOptions
) {
    const { 
        width, height, pixelRatio, 
        fontFamily = 'sans-serif', 
        bgImage, 
        getTipText,
        PREVIEW_TITLE,
        PREVIEW_PARAS
    } = options;

    // 0. 字体同步屏障
    if ((document as any).fonts) {
        await (document as any).fonts.ready;
    }

    // 1. 初始化画布 (强制白底)
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width * pixelRatio, height * pixelRatio);
    ctx.scale(pixelRatio, pixelRatio);
    ctx.textBaseline = 'top';
    
    // 2. 背景绘制
    if (cfg.bgType === 2 && bgImage) {
        ctx.globalAlpha = 1.0;
        const scale = Math.max(width / bgImage.width, height / bgImage.height);
        const dW = bgImage.width * scale;
        const dH = bgImage.height * scale;
        ctx.drawImage(bgImage, (width - dW) / 2, (height - dH) / 2, dW, dH);
    } else {
        ctx.fillStyle = cfg.bgType === 0 ? argbToCss(cfg.bgStr || '#EEEEEE') : '#EEEEEE';
        ctx.fillRect(0, 0, width, height);
    }

    // 3. 排版参数 (修正 letterSp 单位)
    const textColor = argbToCss(cfg.textColor || '#3E3D3B');
    const tipColor = argbToCss(cfg.tipColor || '#803E3D3B');
    const fontStack = `"${fontFamily}", sans-serif`;
    
    const textSize = cfg.textSize || 22;
    // 兼容性处理：如果值很小则视为 em，较大则视为像素(Legado 默认)
    const rawSp = cfg.letterSpacing || 0;
    const letterSp = rawSp > 1 ? rawSp : (textSize * rawSp); 
    
    const lineH = textSize + (cfg.lineSpacingExtra || 8);
    const pL = cfg.paddingLeft ?? 18;
    const pR = cfg.paddingRight ?? 18;
    const contentW = width - pL - pR;

    /**
     * 获取精确字宽 (Key 包含字体和字号)
     */
    const getCharWidth = (char: string) => {
        const key = `${ctx.font}-${char}`;
        if (glyphWidthCache.has(key)) return glyphWidthCache.get(key)!;
        const w = ctx.measureText(char).width;
        glyphWidthCache.set(key, w);
        return w;
    };

    /**
     * 文字绘制核心
     */
    const drawLine = (text: string, x: number, y: number, align: 'left'|'center'|'right' = 'left') => {
        const chars = Array.from(text);
        let totalW = 0;
        const charWList = chars.map((c, i) => {
            const w = getCharWidth(c);
            totalW += w + (i < chars.length - 1 ? letterSp : 0);
            return w;
        });

        let curX = Math.round(x);
        if (align === 'center') curX = Math.round(x - totalW / 2);
        else if (align === 'right') curX = Math.round(x - totalW);

        for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i], curX, Math.round(y));
            curX += charWList[i] + letterSp;
        }
        return totalW;
    };

    /**
     * 断行算法
     */
    const layoutLines = (text: string, maxW: number, indent: number) => {
        const chars = Array.from(text);
        const lines: string[] = [];
        let curLine = '';
        let isFirst = true;
        let curLineW = 0;

        for (const char of chars) {
            const charW = getCharWidth(char);
            const currentMaxW = isFirst ? maxW - indent : maxW;
            const spacing = curLine.length > 0 ? letterSp : 0;

            if (curLineW + spacing + charW > currentMaxW && curLine !== '') {
                lines.push(curLine);
                curLine = char;
                curLineW = charW;
                isFirst = false;
            } else {
                curLine += char;
                curLineW += spacing + charW;
            }
        }
        if (curLine) lines.push(curLine);
        return lines;
    };

    let curY = 0;

    // 4. 状态栏
    if (!cfg.hideStatusBar) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = tipColor;
        ctx.font = `600 12px sans-serif`;
        drawLine('12:30', 16, 12);
        drawLine('69%', width - 16, 12, 'right');
        curY = 36;
    }

    // 5. 页眉
    if (cfg.headerMode !== 2) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = tipColor;
        ctx.font = `11px ${fontStack}`;
        const hPT = (cfg.headerPaddingTop || 0) + (cfg.hideStatusBar ? 20 : 0);
        curY += hPT;
        
        drawLine(getTipText(cfg.tipHeaderLeft ?? 2), cfg.headerPaddingLeft || 16, curY);
        drawLine(getTipText(cfg.tipHeaderMiddle ?? 0), width / 2, curY, 'center');
        drawLine(getTipText(cfg.tipHeaderRight ?? 3), width - (cfg.headerPaddingRight || 16), curY, 'right');
        
        curY += 16 + (cfg.headerPaddingBottom || 4);
        if (cfg.showHeaderLine) {
            ctx.strokeStyle = tipColor;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(cfg.headerPaddingLeft || 16, Math.round(curY) + 0.5);
            ctx.lineTo(width - (cfg.headerPaddingRight || 16), Math.round(curY) + 0.5);
            ctx.stroke();
            curY += 8;
        }
    }

    // 6. 正文
    ctx.globalAlpha = 1.0;
    curY += cfg.paddingTop ?? 12;
    
    // 标题
    if (cfg.titleMode !== 2) {
        const tSize = Math.floor(textSize * (1.15 + (cfg.titleSize || 0) * 0.1));
        ctx.font = `bold ${tSize}px ${fontStack}`;
        ctx.fillStyle = textColor;
        curY += (cfg.titleTopSpacing || 0);
        
        const align = cfg.titleMode === 1 ? 'center' : 'left';
        const titleLines = layoutLines(PREVIEW_TITLE, contentW, 0);
        for (const line of titleLines) {
            drawLine(line, align === 'center' ? width / 2 : pL, curY, align);
            curY += tSize * 1.5;
        }
        curY += (cfg.titleBottomSpacing || 12);
    }

    // 段落
    ctx.font = `${cfg.textBold ? 'bold ' : ''}${textSize}px ${fontStack}`;
    ctx.fillStyle = textColor;
    const indentPx = (cfg.paragraphIndent?.length || 0) * textSize;
    const maxY = height - (cfg.footerMode === 1 ? 24 : 64);

    outer: for (const para of PREVIEW_PARAS) {
        if (curY >= maxY) break;
        const lines = layoutLines(para, contentW, indentPx);
        for (let i = 0; i < lines.length; i++) {
            if (curY + textSize > maxY) break outer;
            drawLine(lines[i], pL + (i === 0 ? indentPx : 0), curY);
            curY += lineH;
        }
        curY += (cfg.paragraphSpacing || 0);
    }

    // 7. 页脚
    if (cfg.footerMode !== 1) {
        const fPB = (cfg.footerPaddingBottom || 0) + (cfg.hideNavigationBar ? 12 : 8);
        const fY = height - fPB - 18;
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = tipColor;
        ctx.font = `11px ${fontStack}`;

        if (cfg.showFooterLine) {
            ctx.strokeStyle = tipColor;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(cfg.footerPaddingLeft || 16, Math.round(fY) - 4.5);
            ctx.lineTo(width - (cfg.footerPaddingRight || 16), Math.round(fY) - 4.5);
            ctx.stroke();
        }
        drawLine(getTipText(cfg.tipFooterLeft ?? 1), cfg.footerPaddingLeft || 16, fY);
        drawLine(getTipText(cfg.tipFooterMiddle ?? 0), width / 2, fY, 'center');
        drawLine(getTipText(cfg.tipFooterRight ?? 6), width - (cfg.footerPaddingRight || 16), fY, 'right');
    }

    ctx.restore();
}
