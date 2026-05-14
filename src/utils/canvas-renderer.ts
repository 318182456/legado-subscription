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
 * 核心渲染引擎 (V8.2 像素级对齐版)
 * 1. 废弃 ctx.scale：全量使用物理像素运算，解决“灰蒙蒙”模糊问题
 * 2. 增强型排版：彻底解决漏字，对齐真机单行标题容量
 * 3. 颜色系统：直接提取 ARGB 分量，无损渲染
 */
export async function drawTheme(
    ctx: CanvasRenderingContext2D,
    cfg: any,
    options: RenderOptions
) {
    const {
        width: logicalW, height: logicalH, pixelRatio,
        fontFamily = 'sans-serif',
        bgImage,
        getTipText,
        PREVIEW_TITLE,
        PREVIEW_PARAS
    } = options;

    const pr = pixelRatio;
    const width = logicalW * pr;
    const height = logicalH * pr;

    if ((document as any).fonts) {
        await (document as any).fonts.ready;
    }

    const localCache = new Map<string, number>();

    // 1. 初始化画布 (物理像素层)
    ctx.save();
    ctx.imageSmoothingEnabled = false; // 禁用平滑以获得锐利文字
    
    // 背景处理
    const bgHex = cfg.bgStr || '#FFFFFF';
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

    // 绘制背景
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

    // 2. 排版参数 (全部乘以 pr)
    const textColor = toRgba(cfg.textColor || '#ff3E3D3B');
    const tipColor = toRgba(cfg.tipColor || '#ff3E3D3B');
    const fontStack = `"${fontFamily}", sans-serif`;

    const textSize = (cfg.textSize ?? 22) * pr;
    const letterSp = (cfg.letterSpacing ?? 0) * textSize;
    
    ctx.font = `${textSize}px ${fontStack}`;
    const m = ctx.measureText('测');
    const textHeight = (m.actualBoundingBoxAscent ?? textSize * 0.8) + (m.actualBoundingBoxDescent ?? textSize * 0.2);
    const baselineOff = m.actualBoundingBoxAscent ?? textSize * 0.8;
    
    const lineSpacingRatio = (cfg.lineSpacingExtra ?? 12) / 10;
    const lineH = textHeight * lineSpacingRatio;

    const pL = dpToPx(cfg.paddingLeft ?? 16) * pr;
    const pR = dpToPx(cfg.paddingRight ?? 16) * pr;
    const pT = dpToPx(cfg.paddingTop ?? 12) * pr;
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
            if (res > 0 && res < contentW * 0.25) {
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
            let currentLine = "";
            let currentW = 0;

            while (i < chars.length) {
                const c = chars[i];
                const cw = getCharWidth(c);
                const sp = currentLine.length > 0 ? letterSp : 0;
                // 增加 0.5px 的容差，防止浮点数精度导致的不必要断行
                if (currentW + sp + cw > limit + 0.5) break;
                currentLine += c;
                currentW += sp + cw;
                i++;
            }

            // 禁则回退
            if (i < chars.length && currentLine.length > 1) {
                const nextC = chars[i];
                if (POST_PANC.has(nextC)) {
                    i--;
                    currentLine = currentLine.slice(0, -1);
                } else if (PRE_PANC.has(currentLine[currentLine.length - 1])) {
                    i--;
                    currentLine = currentLine.slice(0, -1);
                }
            }

            if (currentLine.length === 0 && i < chars.length) {
                currentLine = chars[i++];
            }
            lines.push(currentLine);
            first = false;
        }
        return lines;
    };

    // ─── 绘制 ─────────────────────────────────────────────────
    
    // 4. 状态栏 (对齐物理像素)
    if (!cfg.hideStatusBar) {
        ctx.fillStyle = tipColor;
        ctx.font = `600 ${12 * pr}px sans-serif`;
        const off = (12 * pr) * 0.85;
        drawLine('12:30', 16 * pr, 8 * pr, 'left', off);
        drawLine('69%', width - 16 * pr, 8 * pr, 'right', off);
    }

    // 5. 页眉
    let curY = (cfg.hideStatusBar ? 0 : 28 * pr);
    if (cfg.headerMode !== 2) {
        ctx.font = `${11 * pr}px ${fontStack}`;
        const hm = ctx.measureText('中');
        const hOff = hm.actualBoundingBoxAscent ?? (11 * pr * 0.8);
        const hH = hOff + (hm.actualBoundingBoxDescent ?? (11 * pr * 0.2));
        
        curY += (dpToPx(cfg.headerPaddingTop ?? 0) * pr) + (cfg.hideStatusBar ? 10 * pr : 0);
        ctx.fillStyle = tipColor;
        drawLine(getTipText(cfg.tipHeaderLeft ?? 2), 16 * pr, curY, 'left', hOff);
        drawLine(getTipText(cfg.tipHeaderMiddle ?? 0), width / 2, curY, 'center', hOff);
        drawLine(getTipText(cfg.tipHeaderRight ?? 3), width - 16 * pr, curY, 'right', hOff);

        curY += hH + (4 * pr);
        if (cfg.showHeaderLine) {
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 0.5 * pr;
            ctx.beginPath();
            const ly = Math.floor(curY) + 0.5;
            ctx.moveTo(16 * pr, ly);
            ctx.lineTo(width - 16 * pr, ly);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
            curY += 8 * pr;
        }
    }

    // 6. 正文
    curY += pT;
    if (cfg.titleMode !== 2) {
        const tSize = (cfg.textSize ?? 22) + (cfg.titleSize ?? 0);
        ctx.font = `bold ${tSize * pr}px ${fontStack}`;
        ctx.fillStyle = textColor;
        const tm = ctx.measureText('中');
        const tOff = tm.actualBoundingBoxAscent ?? (tSize * pr * 0.8);
        const tH = (tOff + (tm.actualBoundingBoxDescent ?? (tSize * pr * 0.2))) * lineSpacingRatio;
        
        curY += dpToPx(cfg.titleTopSpacing ?? 0) * pr;
        const tAlign = cfg.titleMode === 1 ? 'center' : 'left';
        const tLines = layoutLines(PREVIEW_TITLE, contentW, 0);
        for (const line of tLines) {
            drawLine(line, tAlign === 'center' ? width / 2 : pL, curY, tAlign, tOff);
            curY += tH;
        }
        curY += dpToPx(cfg.titleBottomSpacing ?? 10) * pr;
    }

    // 正文内容
    ctx.font = `${cfg.textBold === 1 ? 'bold ' : ''}${textSize}px ${fontStack}`;
    ctx.fillStyle = textColor;
    const indentPx = (cfg.paragraphIndent?.length ?? 0) > 0 ? getCharWidth('　') * (cfg.paragraphIndent.length) : 0;
    const maxY = height - (dpToPx(cfg.paddingBottom ?? 15) * pr) - (40 * pr);
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
        ctx.font = `${11 * pr}px ${fontStack}`;
        const fm = ctx.measureText('中');
        const fOff = fm.actualBoundingBoxAscent ?? (11 * pr * 0.8);
        const fH = fOff + (fm.actualBoundingBoxDescent ?? (11 * pr * 0.2));
        const fPB = (dpToPx(cfg.footerPaddingBottom ?? 6) * pr) + (cfg.hideNavigationBar ? 12 * pr : 8 * pr);
        const fY = height - fPB - fH;

        ctx.fillStyle = tipColor;
        if (cfg.showFooterLine) {
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 0.5 * pr;
            ctx.beginPath();
            const ly = Math.floor(fY) - (4 * pr);
            ctx.moveTo(16 * pr, ly);
            ctx.lineTo(width - 16 * pr, ly);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
        drawLine(getTipText(cfg.tipFooterLeft ?? 1), 16 * pr, fY, 'left', fOff);
        drawLine(getTipText(cfg.tipFooterMiddle ?? 0), width / 2, fY, 'center', fOff);
        drawLine(getTipText(cfg.tipFooterRight ?? 6), width - 16 * pr, fY, 'right', fOff);
    }

    ctx.restore();
}
