import { argbToCss } from './color';
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

/**
 * 核心渲染引擎 (V6.0 深度对齐版)
 * 1. Padding/Spacing 全量切换为 dpToPx
 * 2. 间距换算对齐 Legado (1/10 倍率)
 * 3. 实现两端对齐 (Full Justification)
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
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width * pixelRatio, height * pixelRatio);
    ctx.scale(pixelRatio, pixelRatio);
    ctx.textBaseline = 'top';
    
    // 2. 背景绘制
    if (cfg.bgType === 2 && bgImage) {
        // 支持 bgAlpha
        ctx.globalAlpha = (cfg.bgAlpha ?? 100) / 100;
        const scale = Math.max(width / bgImage.width, height / bgImage.height);
        const dW = bgImage.width * scale;
        const dH = bgImage.height * scale;
        ctx.drawImage(bgImage, (width - dW) / 2, (height - dH) / 2, dW, dH);
        ctx.globalAlpha = 1.0;
    } else {
        ctx.fillStyle = cfg.bgType === 0 ? argbToCss(cfg.bgStr || '#EEEEEE') : '#EEEEEE';
        ctx.fillRect(0, 0, width, height);
    }

    // 3. 排版参数对齐
    const textColor = argbToCss(cfg.textColor || '#3E3D3B');
    const tipColor = argbToCss(cfg.tipColor || '#803E3D3B');
    const fontStack = `"${fontFamily}", sans-serif`;
    
    const textSize = cfg.textSize || 22;
    // Legado: letterSpacing 是 em 单位
    const letterSp = (cfg.letterSpacing || 0) * textSize;
    // Legado: lineSpacingExtra 是 1/10 倍率
    const lineSpacingRatio = (cfg.lineSpacingExtra ?? 12) / 10;
    const lineH = textSize * (1 + lineSpacingRatio);
    
    const pL = dpToPx(cfg.paddingLeft ?? 16);
    const pR = dpToPx(cfg.paddingRight ?? 16);
    const pT = dpToPx(cfg.paddingTop ?? 12);
    const contentW = width - pL - pR;

    const getCharWidth = (char: string) => {
        const key = `${ctx.font}-${char}`;
        if (localCache.has(key)) return localCache.get(key)!;
        const w = ctx.measureText(char).width;
        localCache.set(key, w);
        return w;
    };

    /**
     * 绘制一行文字，支持两端对齐
     */
    const drawLine = (text: string, x: number, y: number, align: 'left'|'center'|'right'|'justify' = 'left') => {
        const chars = Array.from(text);
        if (chars.length === 0) return 0;

        let totalCharW = 0;
        const charWList = chars.map(c => {
            const w = getCharWidth(c);
            totalCharW += w;
            return w;
        });

        // 基础间距总和
        let totalSpW = letterSp * (chars.length - 1);
        let extraSp = 0;

        // 两端对齐逻辑
        if (align === 'justify' && chars.length > 1) {
            const residual = contentW - (totalCharW + totalSpW);
            if (residual > 0 && residual < contentW * 0.2) { // 只有间隙不是特别夸张时才对齐
                extraSp = residual / (chars.length - 1);
            }
        }

        let curX = x;
        const totalLineW = totalCharW + totalSpW + (extraSp * (chars.length - 1));

        if (align === 'center') curX = x - totalLineW / 2;
        else if (align === 'right') curX = x - totalLineW;
        
        curX = Math.round(curX);
        const drawY = Math.round(y);

        for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i], curX, drawY);
            curX += charWList[i] + letterSp + extraSp;
        }
        return totalLineW;
    };

    /**
     * 断行逻辑对齐
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

            if (curLineW + spacing + charW > currentMaxW + 0.1 && curLine !== '') {
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
        const hPT = dpToPx(cfg.headerPaddingTop || 0) + (cfg.hideStatusBar ? 20 : 0);
        curY += hPT;
        
        drawLine(getTipText(cfg.tipHeaderLeft ?? 2), dpToPx(cfg.headerPaddingLeft || 16), curY);
        drawLine(getTipText(cfg.tipHeaderMiddle ?? 0), width / 2, curY, 'center');
        drawLine(getTipText(cfg.tipHeaderRight ?? 3), width - dpToPx(cfg.headerPaddingRight || 16), curY, 'right');
        
        curY += 16 + dpToPx(cfg.headerPaddingBottom || 4);
        if (cfg.showHeaderLine) {
            ctx.strokeStyle = tipColor;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            const lineY = Math.round(curY) + 0.5;
            ctx.moveTo(dpToPx(cfg.headerPaddingLeft || 16), lineY);
            ctx.lineTo(width - dpToPx(cfg.headerPaddingRight || 16), lineY);
            ctx.stroke();
            curY += 8;
        }
    }

    // 6. 正文
    ctx.globalAlpha = 1.0;
    curY += pT;
    
    // 标题
    if (cfg.titleMode !== 2) {
        // Legado: 标题大小 = textSize + titleSize
        const tSize = textSize + (cfg.titleSize || 0);
        ctx.font = `bold ${tSize}px ${fontStack}`;
        ctx.fillStyle = textColor;
        curY += dpToPx(cfg.titleTopSpacing || 0);
        
        const align = cfg.titleMode === 1 ? 'center' : 'left';
        const titleLines = layoutLines(PREVIEW_TITLE, contentW, 0);
        for (const line of titleLines) {
            drawLine(line, align === 'center' ? width / 2 : pL, curY, align);
            curY += tSize * 1.5;
        }
        curY += dpToPx(cfg.titleBottomSpacing || 10);
    }

    // 段落
    ctx.font = `${cfg.textBold === 1 ? 'bold ' : ''}${textSize}px ${fontStack}`;
    if (cfg.textBold === 2) ctx.font = `300 ${textSize}px ${fontStack}`;
    
    ctx.fillStyle = textColor;
    const indentPx = (cfg.paragraphIndent?.length || 0) * textSize;
    const maxY = height - dpToPx(cfg.paddingBottom || 15) - 40;

    // Legado: paragraphSpacing 是 1/10 倍率
    const paraSpacing = textSize * (cfg.paragraphSpacing || 0) / 10;

    outer: for (const para of PREVIEW_PARAS) {
        if (curY >= maxY) break;
        const lines = layoutLines(para, contentW, indentPx);
        for (let i = 0; i < lines.length; i++) {
            if (curY + textSize > maxY) break outer;
            // 开启两端对齐
            const align = i === lines.length - 1 ? 'left' : 'justify';
            drawLine(lines[i], pL + (i === 0 ? indentPx : 0), curY, align);
            curY += lineH;
        }
        curY += paraSpacing;
    }

    // 7. 页脚
    if (cfg.footerMode !== 1) {
        const fPB = dpToPx(cfg.footerPaddingBottom || 0) + (cfg.hideNavigationBar ? 12 : 8);
        const fY = height - fPB - 18;
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = tipColor;
        ctx.font = `11px ${fontStack}`;

        if (cfg.showFooterLine) {
            ctx.strokeStyle = tipColor;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            const lineY = Math.round(fY) - 4.5;
            ctx.moveTo(dpToPx(cfg.footerPaddingLeft || 16), lineY);
            ctx.lineTo(width - dpToPx(cfg.footerPaddingRight || 16), lineY);
            ctx.stroke();
        }
        drawLine(getTipText(cfg.tipFooterLeft ?? 1), dpToPx(cfg.footerPaddingLeft || 16), fY);
        drawLine(getTipText(cfg.tipFooterMiddle ?? 0), width / 2, fY, 'center');
        drawLine(getTipText(cfg.tipFooterRight ?? 6), width - dpToPx(cfg.footerPaddingRight || 16), fY, 'right');
    }

    ctx.restore();
}
