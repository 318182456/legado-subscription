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
 * 核心渲染引擎 (V8.3 严防死守版)
 * 1. 物理坐标绝对取整：移除所有 +0.5，确保 100% 锐利度。
 * 2. 增强容差：给 Limit 增加 1px 物理冗余，彻底杜绝漏字。
 * 3. 布局微调：缩放系数 0.95 对齐真机密度。
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

    // 1. 初始化画布
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

    // 2. 参数对齐 (引入 0.95 修正系数)
    const density = 0.95 * pr; 
    const textColor = toRgba(cfg.textColor || '#ff3E3D3B');
    const tipColor = toRgba(cfg.tipColor || '#ff3E3D3B');
    const fontStack = `"${fontFamily}", sans-serif`;

    const textSize = (cfg.textSize ?? 22) * density;
    const letterSp = (cfg.letterSpacing ?? 0) * textSize;
    
    ctx.font = `${textSize}px ${fontStack}`;
    const m = ctx.measureText('测');
    const textHeight = (m.actualBoundingBoxAscent ?? textSize * 0.8) + (m.actualBoundingBoxDescent ?? textSize * 0.2);
    const baselineOff = m.actualBoundingBoxAscent ?? textSize * 0.8;
    
    const lineSpacingRatio = (cfg.lineSpacingExtra ?? 12) / 10;
    const lineH = textHeight * lineSpacingRatio;

    const pL = (cfg.paddingLeft ?? 16) * density;
    const pR = (cfg.paddingRight ?? 16) * density;
    const pT = (cfg.paddingTop ?? 12) * density;
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
            if (res > 0 && res < contentW * 0.3) { // 稍微扩大对齐阈值
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

    /**
     * V8.3 严防死守断行：杜绝所有逻辑溢出风险
     */
    const layoutLines = (text: string, maxW: number, indent: number): string[] => {
        const chars = Array.from(text);
        const lines: string[] = [];
        let i = 0;
        let first = true;

        while (i < chars.length) {
            const limit = first ? maxW - indent : maxW;
            let currentLine: string[] = [];
            let currentW = 0;

            // 1. 逐字填入
            while (i < chars.length) {
                const c = chars[i];
                const cw = getCharWidth(c);
                const sp = currentLine.length > 0 ? letterSp : 0;
                // 增加 1px 冗余度
                if (currentW + sp + cw > limit + 1.0) break;
                currentLine.push(c);
                currentW += sp + cw;
                i++;
            }

            // 2. 禁则回退 (数组操作更安全)
            if (i < chars.length && currentLine.length > 1) {
                const nextC = chars[i];
                if (POST_PANC.has(nextC)) {
                    i--;
                    currentLine.pop();
                } else if (PRE_PANC.has(currentLine[currentLine.length - 1])) {
                    i--;
                    currentLine.pop();
                }
            }

            if (currentLine.length === 0 && i < chars.length) {
                currentLine.push(chars[i++]);
            }
            lines.push(currentLine.join(''));
            first = false;
        }
        return lines;
    };

    // ─── 绘制 ─────────────────────────────────────────────────
    
    // 4. 状态栏
    if (!cfg.hideStatusBar) {
        ctx.fillStyle = tipColor;
        const sSize = 12 * pr;
        ctx.font = `600 ${sSize}px sans-serif`;
        const off = sSize * 0.8;
        drawLine('12:30', 16 * pr, 10 * pr, 'left', off);
        drawLine('69%', width - 16 * pr, 10 * pr, 'right', off);
    }

    // 5. 页眉
    let curY = (cfg.hideStatusBar ? 0 : 30 * pr);
    if (cfg.headerMode !== 2) {
        const hSize = 11 * density;
        ctx.font = `${hSize}px ${fontStack}`;
        const hm = ctx.measureText('中');
        const hOff = hm.actualBoundingBoxAscent ?? (hSize * 0.8);
        const hH = hOff + (hm.actualBoundingBoxDescent ?? (hSize * 0.2));
        
        curY += ((cfg.headerPaddingTop ?? 0) * density) + (cfg.hideStatusBar ? 10 * pr : 0);
        ctx.fillStyle = tipColor;
        drawLine(getTipText(cfg.tipHeaderLeft ?? 2), 16 * density, curY, 'left', hOff);
        drawLine(getTipText(cfg.tipHeaderMiddle ?? 0), width / 2, curY, 'center', hOff);
        drawLine(getTipText(cfg.tipHeaderRight ?? 3), width - 16 * density, curY, 'right', hOff);

        curY += hH + (4 * density);
        if (cfg.showHeaderLine) {
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.25;
            ctx.lineWidth = 0.5 * pr;
            ctx.beginPath();
            const ly = Math.floor(curY);
            ctx.moveTo(16 * density, ly);
            ctx.lineTo(width - 16 * density, ly);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
            curY += 8 * density;
        }
    }

    // 6. 正文
    curY += pT;
    if (cfg.titleMode !== 2) {
        const tSize = ((cfg.textSize ?? 22) + (cfg.titleSize ?? 0)) * density;
        ctx.font = `bold ${tSize}px ${fontStack}`;
        ctx.fillStyle = textColor;
        const tm = ctx.measureText('中');
        const tOff = tm.actualBoundingBoxAscent ?? (tSize * 0.8);
        const tH = (tOff + (tm.actualBoundingBoxDescent ?? (tSize * 0.2))) * lineSpacingRatio;
        
        curY += (cfg.titleTopSpacing ?? 0) * density;
        const tAlign = cfg.titleMode === 1 ? 'center' : 'left';
        const tLines = layoutLines(PREVIEW_TITLE, contentW, 0);
        for (const line of tLines) {
            drawLine(line, tAlign === 'center' ? width / 2 : pL, curY, tAlign, tOff);
            curY += tH;
        }
        curY += (cfg.titleBottomSpacing ?? 10) * density;
    }

    // 正文
    ctx.font = `${cfg.textBold === 1 ? 'bold ' : ''}${textSize}px ${fontStack}`;
    ctx.fillStyle = textColor;
    const indentPx = (cfg.paragraphIndent?.length ?? 0) > 0 ? getCharWidth('　') * (cfg.paragraphIndent.length) : 0;
    const maxY = height - ((cfg.paddingBottom ?? 15) * density) - (40 * density);
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
        const fSize = 11 * density;
        ctx.font = `${fSize}px ${fontStack}`;
        const fm = ctx.measureText('中');
        const fOff = fm.actualBoundingBoxAscent ?? (fSize * 0.8);
        const fH = fOff + (fm.actualBoundingBoxDescent ?? (fSize * 0.2));
        const fPB = ((cfg.footerPaddingBottom ?? 6) * density) + (cfg.hideNavigationBar ? 12 * pr : 8 * pr);
        const fY = height - fPB - fH;

        ctx.fillStyle = tipColor;
        if (cfg.showFooterLine) {
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.25;
            ctx.lineWidth = 0.5 * pr;
            ctx.beginPath();
            const ly = Math.floor(fY) - (4 * pr);
            ctx.moveTo(16 * density, ly);
            ctx.lineTo(width - 16 * density, ly);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
        drawLine(getTipText(cfg.tipFooterLeft ?? 1), 16 * density, fY, 'left', fOff);
        drawLine(getTipText(cfg.tipFooterMiddle ?? 0), width / 2, fY, 'center', fOff);
        drawLine(getTipText(cfg.tipFooterRight ?? 6), width - 16 * density, fY, 'right', fOff);
    }

    ctx.restore();
}
