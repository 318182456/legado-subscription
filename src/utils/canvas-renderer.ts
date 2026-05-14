import { dpToPx } from './constants';

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

const POST_PANC = new Set(`，。：？！、”’）》}】)>]」；;`.split(''));
const PRE_PANC = new Set(`“（《【‘(<[{「`.split(''));

/**
 * 核心渲染引擎 (V8.5 数值对齐版)
 * 1. 严格映射用户 JSON 属性，取消一切比例猜测。
 * 2. 对齐 Legado 3.0+ 垂直布局链。
 * 3. 修正行间距：lineH = textHeight * (1 + extra/10)。
 */
export async function drawTheme(
    ctx: CanvasRenderingContext2D,
    cfg: any,
    options: RenderOptions
) {
    const {
        width: logicalW, height: logicalH, pixelRatio: pr,
        fontFamily = 'sans-serif',
        bgImage,
        getTipText,
        PREVIEW_TITLE,
        PREVIEW_PARAS
    } = options;

    const width = logicalW * pr;
    const height = logicalH * pr;

    if ((document as any).fonts) {
        await (document as any).fonts.ready;
    }

    const localCache = new Map<string, number>();

    // 1. 初始化
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    
    const toRgba = (hex: string, alphaMul = 1): string => {
        if (!hex || !hex.startsWith('#')) return hex || 'rgba(0,0,0,1)';
        if (hex.length === 9) {
            const a = (parseInt(hex.slice(1, 3), 16) / 255) * alphaMul;
            const r = parseInt(hex.slice(3, 5), 16);
            const g = parseInt(hex.slice(5, 7), 16);
            const b = parseInt(hex.slice(7, 9), 16);
            return `rgba(${r}, ${g}, ${b}, ${a})`;
        }
        return hex;
    };

    // 背景
    const bgHex = cfg.bgStr || '#FFFFFF';
    if (cfg.bgType === 2 && bgImage) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = (cfg.bgAlpha ?? 100) / 100;
        const scale = Math.max(width / bgImage.width, height / bgImage.height);
        const dW = bgImage.width * scale;
        const dH = bgImage.height * scale;
        ctx.drawImage(bgImage, (width - dW) / 2, (height - dH) / 2, dW, dH);
        ctx.globalAlpha = 1.0;
    } else {
        ctx.fillStyle = toRgba(bgHex);
        ctx.fillRect(0, 0, width, height);
    }

    // 2. 物理参数转换
    const d = pr; // 所有的 dp 换算直接乘以物理像素比
    const textColor = toRgba(cfg.textColor || '#ff43050a');
    const tipColor = toRgba(cfg.tipColor || '#ff4d3838');
    const fontStack = `"${fontFamily}", sans-serif`;

    const textSize = (cfg.textSize ?? 22) * d;
    const letterSp = (cfg.letterSpacing ?? 0.04) * textSize;
    
    ctx.font = `${textSize}px ${fontStack}`;
    const m = ctx.measureText('测');
    const textHeight = (m.actualBoundingBoxAscent ?? textSize * 0.8) + (m.actualBoundingBoxDescent ?? textSize * 0.2);
    const baselineOff = m.actualBoundingBoxAscent ?? textSize * 0.8;
    
    // 行间距公式对齐：lineH = textHeight * (1 + lineSpacingExtra / 10)
    const lineH = textHeight * (1 + (cfg.lineSpacingExtra ?? 12) / 10);

    const pL = (cfg.paddingLeft ?? 23) * d;
    const pR = (cfg.paddingRight ?? 23) * d;
    const contentW = width - pL - pR;

    const getCharWidth = (char: string): number => {
        const key = `${ctx.font}|${char}`;
        if (localCache.has(key)) return localCache.get(key)!;
        const w = ctx.measureText(char).width;
        localCache.set(key, w);
        return w;
    };

    const drawLine = (text: string, x: number, y: number, align: 'left' | 'center' | 'right' | 'justify' = 'left', bOff = baselineOff): number => {
        const chars = Array.from(text);
        if (chars.length === 0) return 0;
        let totalW = 0;
        const wList = chars.map(c => {
            const w = getCharWidth(c);
            totalW += w;
            return w;
        });
        const totalSp = letterSp * (chars.length - 1);
        let exSpaceW = 0;
        let exCharSp = 0;
        if (align === 'justify' && chars.length > 1) {
            const res = contentW - (totalW + totalSp);
            if (res > 0 && res < contentW * 0.3) {
                const spaces = chars.filter(c => c === ' ').length;
                if (spaces > 0) exSpaceW = res / spaces;
                else exCharSp = res / (chars.length - 1);
            }
        }
        const lineW = totalW + totalSp + (exCharSp * (chars.length - 1)) + (exSpaceW * chars.filter(c => c === ' ').length);
        let startX = x;
        if (align === 'center') startX = x - lineW / 2;
        else if (align === 'right') startX = x - lineW;
        startX = Math.floor(startX);
        const drawY = Math.floor(y + bOff);
        for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i], startX, drawY);
            let sp = letterSp + exCharSp;
            if (chars[i] === ' ') sp += exSpaceW;
            startX += wList[i] + sp;
        }
        return lineW;
    };

    const layoutLines = (text: string, maxW: number, indent: number): string[] => {
        const chars = Array.from(text);
        const lines: string[] = [];
        let i = 0;
        let first = true;
        while (i < chars.length) {
            const limit = first ? maxW - indent : maxW;
            let currentLine: string[] = [];
            let currentW = 0;
            while (i < chars.length) {
                const c = chars[i];
                const cw = getCharWidth(c);
                const sp = currentLine.length > 0 ? letterSp : 0;
                if (currentW + sp + cw > limit + 1.0) {
                    if (POST_PANC.has(c) && currentLine.length > 1) { i--; currentLine.pop(); }
                    else if (currentLine.length > 1 && PRE_PANC.has(currentLine[currentLine.length - 1])) { i--; currentLine.pop(); }
                    break;
                }
                currentLine.push(c);
                currentW += sp + cw;
                i++;
            }
            if (currentLine.length === 0 && i < chars.length) currentLine.push(chars[i++]);
            lines.push(currentLine.join(''));
            first = false;
        }
        return lines;
    };

    // ─── 绘制流 ───────────────────────────────────────────────
    
    // 1. 状态栏 (预留 24dp)
    if (!cfg.hideStatusBar) {
        ctx.fillStyle = tipColor;
        ctx.font = `600 ${12 * d}px sans-serif`;
        const off = (12 * d) * 0.8;
        drawLine('12:30', 16 * d, 10 * d, 'left', off);
        drawLine('69%', width - 16 * d, 10 * d, 'right', off);
    }

    // 2. 页眉 (StatusBar + headerPaddingTop)
    let curY = 24 * d; 
    if (cfg.headerMode !== 2) {
        const hSize = 11 * d;
        ctx.font = `${hSize}px ${fontStack}`;
        const hm = ctx.measureText('中');
        const hOff = hm.actualBoundingBoxAscent ?? (hSize * 0.8);
        const hH = hOff + (hm.actualBoundingBoxDescent ?? (hSize * 0.2));
        
        curY += (cfg.headerPaddingTop ?? 20) * d;
        ctx.fillStyle = tipColor;
        drawLine(getTipText(cfg.tipHeaderLeft ?? 1), (cfg.headerPaddingLeft ?? 22) * d, curY, 'left', hOff);
        drawLine(getTipText(cfg.tipHeaderMiddle ?? 0), width / 2, curY, 'center', hOff);
        drawLine(getTipText(cfg.tipHeaderRight ?? 7), width - (cfg.headerPaddingRight ?? 22) * d, curY, 'right', hOff);

        curY += hH + (cfg.headerPaddingBottom ?? 1) * d;
        if (cfg.showHeaderLine) {
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.25;
            ctx.lineWidth = 0.5 * d;
            ctx.beginPath();
            ctx.moveTo(16 * d, Math.floor(curY));
            ctx.lineTo(width - 16 * d, Math.floor(curY));
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
    }

    // 3. 正文起点 (HeaderLine + paddingTop + titleTopSpacing)
    curY += (cfg.paddingTop ?? 15) * d;
    
    // 标题
    if (cfg.titleMode !== 2) {
        const tSize = ((cfg.textSize ?? 22) + (cfg.titleSize ?? 3)) * d;
        ctx.font = `bold ${tSize}px ${fontStack}`;
        ctx.fillStyle = textColor;
        const tm = ctx.measureText('中');
        const tOff = tm.actualBoundingBoxAscent ?? (tSize * 0.8);
        const tLineH = (tOff + (tm.actualBoundingBoxDescent ?? (tSize * 0.2))) * (1 + (cfg.lineSpacingExtra ?? 12) / 10);
        
        curY += (cfg.titleTopSpacing ?? 8) * d;
        const tAlign = cfg.titleMode === 1 ? 'center' : 'left';
        const tLines = layoutLines(PREVIEW_TITLE, contentW, 0);
        for (const line of tLines) {
            drawLine(line, tAlign === 'center' ? width / 2 : pL, curY, tAlign, tOff);
            curY += tLineH;
        }
        curY += (cfg.titleBottomSpacing ?? 10) * d;
    }

    // 正文
    ctx.font = `${cfg.textBold === 1 ? 'bold ' : ''}${textSize}px ${fontStack}`;
    ctx.fillStyle = textColor;
    const indentPx = (cfg.paragraphIndent?.length ?? 0) > 0 ? getCharWidth('　') * (cfg.paragraphIndent.length) : 0;
    const paraSpacing = textHeight * (cfg.paragraphSpacing ?? 5) / 10;
    const maxY = height - ((cfg.paddingBottom ?? 15) * d) - (40 * d);

    outer: for (const para of PREVIEW_PARAS) {
        if (curY >= maxY) break;
        const lines = layoutLines(para, contentW, indentPx);
        for (let li = 0; li < lines.length; li++) {
            if (curY + textHeight > maxY) break outer;
            const align = li === lines.length - 1 ? 'left' : 'justify';
            drawLine(lines[li], pL + (li === 0 ? indentPx : 0), curY, align);
            curY += lineH;
        }
        curY += paraSpacing;
    }

    // 4. 页脚
    if (cfg.footerMode !== 1) {
        const fSize = 11 * d;
        ctx.font = `${fSize}px ${fontStack}`;
        const fm = ctx.measureText('中');
        const fOff = fm.actualBoundingBoxAscent ?? (fSize * 0.8);
        const fH = fOff + (fm.actualBoundingBoxDescent ?? (fSize * 0.2));
        const fY = height - ((cfg.footerPaddingBottom ?? 9) * d) - fH - (cfg.hideNavigationBar ? 4 * d : 12 * d);

        ctx.fillStyle = tipColor;
        if (cfg.showFooterLine) {
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.25;
            ctx.lineWidth = 0.5 * d;
            ctx.beginPath();
            ctx.moveTo(16 * d, Math.floor(fY - 4 * d));
            ctx.lineTo(width - 16 * d, Math.floor(fY - 4 * d));
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
        drawLine(getTipText(cfg.tipFooterLeft ?? 6), (cfg.footerPaddingLeft ?? 20) * d, fY, 'left', fOff);
        drawLine(getTipText(cfg.tipFooterMiddle ?? 0), width / 2, fY, 'center', fOff);
        drawLine(getTipText(cfg.tipFooterRight ?? 9), width - (cfg.footerPaddingRight ?? 19) * d, fY, 'right', fOff);
    }

    ctx.restore();
}
