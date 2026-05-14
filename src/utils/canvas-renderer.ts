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

// 禁则字符集
const POST_PANC = new Set(`，。：？！、”’）》}】)>]」；;`.split(''));
const PRE_PANC = new Set(`“（《【‘(<[{「`.split(''));

/**
 * 核心渲染引擎 (V8.1)
 * 1. 彻底解决漏字：采用显式索引回退
 * 2. 颜色增强：rgba 转换逻辑加固，解决灰蒙蒙问题
 * 3. 布局对齐：标题边距、行间距精确化
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

    if ((document as any).fonts) {
        await (document as any).fonts.ready;
    }

    const localCache = new Map<string, number>();

    // 1. 初始化画布
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // 背景处理
    if (cfg.bgType === 2 && bgImage) {
        // 先画一层纯白底，防止背景图有透明空洞
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width * pixelRatio, height * pixelRatio);
        
        ctx.globalAlpha = (cfg.bgAlpha ?? 100) / 100;
        const scale = Math.max((width * pixelRatio) / bgImage.width, (height * pixelRatio) / bgImage.height);
        const dW = bgImage.width * scale;
        const dH = bgImage.height * scale;
        ctx.drawImage(bgImage, (width * pixelRatio - dW) / 2, (height * pixelRatio - dH) / 2, dW, dH);
    } else {
        const bgHex = cfg.bgStr || '#FFFFFF';
        // ARGB -> RGBA 转换
        let finalBg = '#FFFFFF';
        if (bgHex.startsWith('#')) {
            if (bgHex.length === 9) {
                const a = bgHex.slice(1, 3);
                const r = bgHex.slice(3, 5);
                const g = bgHex.slice(5, 7);
                const b = bgHex.slice(7, 9);
                finalBg = `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${parseInt(a, 16) / 255})`;
            } else {
                finalBg = bgHex;
            }
        }
        ctx.fillStyle = finalBg;
        ctx.fillRect(0, 0, width * pixelRatio, height * pixelRatio);
    }

    ctx.scale(pixelRatio, pixelRatio);
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1.0;

    // 颜色转换工具
    const toRgba = (hex: string): string => {
        if (!hex || !hex.startsWith('#')) return hex || '#000000';
        if (hex.length === 9) {
            const a = parseInt(hex.slice(1, 3), 16) / 255;
            const r = parseInt(hex.slice(3, 5), 16);
            const g = parseInt(hex.slice(5, 7), 16);
            const b = parseInt(hex.slice(7, 9), 16);
            return `rgba(${r}, ${g}, ${b}, ${a})`;
        }
        return hex;
    };

    const textColor = toRgba(cfg.textColor || '#ff3E3D3B');
    const tipColor = toRgba(cfg.tipColor || '#ff3E3D3B');
    const fontStack = `"${fontFamily}", sans-serif`;

    const textSize = cfg.textSize ?? 22;
    const letterSp = (cfg.letterSpacing ?? 0) * textSize;

    // 测量基准高度
    ctx.font = `${textSize}px ${fontStack}`;
    const m = ctx.measureText('测');
    const textHeight = (m.actualBoundingBoxAscent ?? textSize * 0.8) + (m.actualBoundingBoxDescent ?? textSize * 0.2);
    const baselineOff = m.actualBoundingBoxAscent ?? textSize * 0.8;
    
    // Legado 行距计算对齐
    const lineSpacingRatio = (cfg.lineSpacingExtra ?? 12) / 10;
    const lineH = textHeight * lineSpacingRatio;

    const pL = dpToPx(cfg.paddingLeft ?? 16);
    const pR = dpToPx(cfg.paddingRight ?? 16);
    const pT = dpToPx(cfg.paddingTop ?? 12);
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
        let exCharSp = 0;
        let exSpaceW = 0;

        if (align === 'justify' && chars.length > 1) {
            const res = contentW - (totalW + totalSp);
            if (res > 0 && res < contentW * 0.2) {
                const spaces = chars.filter(c => c === ' ').length;
                if (spaces > 0) exSpaceW = res / spaces;
                else exCharSp = res / (chars.length - 1);
            }
        }

        const lineW = totalW + totalSp + (exCharSp * (chars.length - 1)) + (exSpaceW * chars.filter(c => c === ' ').length);
        let startX = x;
        if (align === 'center') startX = x - lineW / 2;
        else if (align === 'right') startX = x - lineW;
        
        startX = Math.round(startX);
        const drawY = Math.round(y + bOff);

        for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i], startX, drawY);
            let sp = letterSp + exCharSp;
            if (chars[i] === ' ') sp += exSpaceW;
            startX += wList[i] + sp;
        }
        return lineW;
    };

    /**
     * V8.1 稳健断行逻辑：显式索引控制，绝不漏字
     */
    const layoutLines = (text: string, maxW: number, indent: number): string[] => {
        const chars = Array.from(text);
        const lines: string[] = [];
        let i = 0;
        let firstLine = true;

        while (i < chars.length) {
            let lineStr = "";
            let lineW = 0;
            const limit = firstLine ? maxW - indent : maxW;

            // 1. 尽可能填满一行
            while (i < chars.length) {
                const c = chars[i];
                const cw = getCharWidth(c);
                const sp = lineStr.length > 0 ? letterSp : 0;
                if (lineW + sp + cw > limit + 0.1) break;
                lineStr += c;
                lineW += sp + cw;
                i++;
            }

            // 2. 禁则回退逻辑
            if (i < chars.length && lineStr.length > 1) {
                const nextC = chars[i];
                // 行首禁入 -> 回退一个字
                if (POST_PANC.has(nextC)) {
                    i--;
                    lineStr = lineStr.slice(0, -1);
                }
                // 行尾禁入 -> 最后一个字回退
                else if (PRE_PANC.has(lineStr[lineStr.length - 1])) {
                    i--;
                    lineStr = lineStr.slice(0, -1);
                }
            }

            // 3. 兜底逻辑：防止超宽字符导致死循环
            if (lineStr.length === 0 && i < chars.length) {
                lineStr = chars[i];
                i++;
            }

            lines.push(lineStr);
            firstLine = false;
        }
        return lines;
    };

    let curY = 0;

    // 4. 状态栏 (对标 Legado Status)
    if (!cfg.hideStatusBar) {
        ctx.fillStyle = tipColor;
        ctx.font = `600 12px sans-serif`;
        const metrics = ctx.measureText('0');
        const off = metrics.actualBoundingBoxAscent ?? 10;
        drawLine('12:30', 16, 8, 'left', off);
        drawLine('69%', width - 16, 8, 'right', off);
        curY = 32;
    }

    // 5. 页眉 (对标 Legado Header)
    if (cfg.headerMode !== 2) {
        ctx.font = `11px ${fontStack}`;
        const metrics = ctx.measureText('中');
        const off = metrics.actualBoundingBoxAscent ?? 10;
        const textH = (metrics.actualBoundingBoxAscent ?? 10) + (metrics.actualBoundingBoxDescent ?? 2);

        const hPT = dpToPx(cfg.headerPaddingTop ?? 0) + (cfg.hideStatusBar ? 8 : 0);
        curY = (cfg.hideStatusBar ? 0 : 32) + hPT;

        ctx.fillStyle = tipColor;
        drawLine(getTipText(cfg.tipHeaderLeft ?? 2), dpToPx(cfg.headerPaddingLeft ?? 16), curY, 'left', off);
        drawLine(getTipText(cfg.tipHeaderMiddle ?? 0), width / 2, curY, 'center', off);
        drawLine(getTipText(cfg.tipHeaderRight ?? 3), width - dpToPx(cfg.headerPaddingRight ?? 16), curY, 'right', off);

        curY += textH + dpToPx(cfg.headerPaddingBottom ?? 0) + 4;
        if (cfg.showHeaderLine) {
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            const ly = Math.round(curY) + 0.5;
            ctx.moveTo(dpToPx(cfg.headerPaddingLeft ?? 16), ly);
            ctx.lineTo(width - dpToPx(cfg.headerPaddingRight ?? 16), ly);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
            curY += 8;
        }
    }

    // 6. 正文
    curY += pT;

    // 6a. 标题 (深度对齐)
    if (cfg.titleMode !== 2) {
        const tSize = textSize + (cfg.titleSize ?? 0);
        ctx.font = `bold ${tSize}px ${fontStack}`;
        ctx.fillStyle = textColor;

        const tm = ctx.measureText('中');
        const tOff = tm.actualBoundingBoxAscent ?? tSize * 0.8;
        const tLineH = ((tm.actualBoundingBoxAscent ?? tSize * 0.8) + (tm.actualBoundingBoxDescent ?? tSize * 0.2)) * lineSpacingRatio;

        curY += dpToPx(cfg.titleTopSpacing ?? 0);
        const titleAlign = cfg.titleMode === 1 ? 'center' : 'left';
        const titleLines = layoutLines(PREVIEW_TITLE, contentW, 0);
        for (const line of titleLines) {
            drawLine(line, titleAlign === 'center' ? width / 2 : pL, curY, titleAlign, tOff);
            curY += tLineH;
        }
        // 重要：标题下边距直接累加
        curY += dpToPx(cfg.titleBottomSpacing ?? 10);
    }

    // 6b. 正文段落
    ctx.font = `${cfg.textBold === 1 ? 'bold ' : cfg.textBold === 2 ? '300 ' : ''}${textSize}px ${fontStack}`;
    ctx.fillStyle = textColor;

    const indentCharCount = cfg.paragraphIndent?.length ?? 0;
    const indentPx = indentCharCount > 0 ? getCharWidth('　') * indentCharCount : 0;
    const maxY = height - dpToPx(cfg.paddingBottom ?? 15) - 40;
    const paraSpacing = textHeight * (cfg.paragraphSpacing ?? 0) / 10;

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

    // 7. 页脚
    if (cfg.footerMode !== 1) {
        ctx.font = `11px ${fontStack}`;
        const fm = ctx.measureText('中');
        const fOff = fm.actualBoundingBoxAscent ?? 10;
        const fTextH = (fm.actualBoundingBoxAscent ?? 10) + (fm.actualBoundingBoxDescent ?? 2);

        const fPB = dpToPx(cfg.footerPaddingBottom ?? 6) + (cfg.hideNavigationBar ? 12 : 8);
        const fY = height - fPB - fTextH;

        ctx.fillStyle = tipColor;
        if (cfg.showFooterLine) {
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            const ly = Math.round(fY) - 4.5;
            ctx.moveTo(dpToPx(cfg.footerPaddingLeft ?? 16), ly);
            ctx.lineTo(width - dpToPx(cfg.footerPaddingRight ?? 16), ly);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
        drawLine(getTipText(cfg.tipFooterLeft ?? 1), dpToPx(cfg.footerPaddingLeft ?? 16), fY, 'left', fOff);
        drawLine(getTipText(cfg.tipFooterMiddle ?? 0), width / 2, fY, 'center', fOff);
        drawLine(getTipText(cfg.tipFooterRight ?? 6), width - dpToPx(cfg.footerPaddingRight ?? 16), fY, 'right', fOff);
    }

    ctx.restore();
}
