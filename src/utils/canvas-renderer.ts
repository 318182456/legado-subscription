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
 * 核心 Canvas 渲染引擎 (优化版)
 * 解决了透明度残留、标题不换行及渲染模糊问题
 */
export function drawTheme(
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

    // 初始化画布状态
    ctx.save();
    ctx.clearRect(0, 0, width * pixelRatio, height * pixelRatio);
    ctx.scale(pixelRatio, pixelRatio);
    ctx.textBaseline = 'top'; // 使用 top 基准线，计算坐标更直观
    ctx.globalAlpha = 1.0;

    // 1. 绘制背景
    if (cfg.bgType === 2 && bgImage) {
        const scale = Math.max(width / bgImage.width, height / bgImage.height);
        const drawW = bgImage.width * scale;
        const drawH = bgImage.height * scale;
        ctx.drawImage(bgImage, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
    } else {
        ctx.fillStyle = cfg.bgType === 0 ? argbToCss(cfg.bgStr || '#EEEEEE') : '#EEEEEE';
        ctx.fillRect(0, 0, width, height);
    }

    // 基础配置解析
    const textColor = argbToCss(cfg.textColor || '#3E3D3B');
    const tipColor = argbToCss(cfg.tipColor || '#803E3D3B');
    const fontStack = `"${fontFamily}", sans-serif`;
    const textSize = cfg.textSize || 22;
    const letterSp = (cfg.letterSpacing || 0) * 10; // 适当放大倍数以匹配视觉
    const lineH = textSize + (cfg.lineSpacingExtra || 8);
    const pL = cfg.paddingLeft ?? 16;
    const pR = cfg.paddingRight ?? 16;
    const contentW = width - pL - pR;

    /**
     * 增强版文字绘制 (支持字间距、居中、清晰度优化)
     */
    const drawText = (text: string, x: number, y: number, align: 'left'|'center'|'right' = 'left') => {
        let totalW = 0;
        for (let i = 0; i < text.length; i++) {
            totalW += ctx.measureText(text[i]).width + (i < text.length - 1 ? letterSp : 0);
        }

        let curX = Math.floor(x);
        if (align === 'center') curX = Math.floor(x - totalW / 2);
        else if (align === 'right') curX = Math.floor(x - totalW);

        for (const char of text) {
            ctx.fillText(char, curX, Math.floor(y));
            curX += ctx.measureText(char).width + letterSp;
        }
        return totalW;
    };

    /**
     * 文字换行算法 (精确匹配 letter-spacing)
     */
    const wrapText = (text: string, maxW: number, indent: number) => {
        const lines: string[] = [];
        let curLine = '';
        let isFirst = true;

        for (const char of text) {
            const testLine = curLine + char;
            let testW = 0;
            for (let i = 0; i < testLine.length; i++) {
                testW += ctx.measureText(testLine[i]).width + (i < testLine.length - 1 ? letterSp : 0);
            }

            const currentMaxW = isFirst ? maxW - indent : maxW;
            if (testW > currentMaxW && curLine !== '') {
                lines.push(curLine);
                curLine = char;
                isFirst = false;
            } else {
                curLine = testLine;
            }
        }
        if (curLine) lines.push(curLine);
        return lines;
    };

    let curY = 0;

    // 2. 状态栏
    if (!cfg.hideStatusBar) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = tipColor;
        ctx.font = `600 12px sans-serif`;
        drawText('12:30', 16, 12);
        drawText('69%', width - 16, 12, 'right');
        ctx.globalAlpha = 1.0;
        curY = 32;
    }

    // 3. 页眉
    if (cfg.headerMode !== 2) {
        const hPT = (cfg.headerPaddingTop || 0) + (cfg.hideStatusBar ? 20 : 4);
        curY += hPT;
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = tipColor;
        ctx.font = `11px ${fontStack}`;
        
        drawText(getTipText(cfg.tipHeaderLeft ?? 2), cfg.headerPaddingLeft || 16, curY);
        drawText(getTipText(cfg.tipHeaderMiddle ?? 0), width / 2, curY, 'center');
        drawText(getTipText(cfg.tipHeaderRight ?? 3), width - (cfg.headerPaddingRight || 16), curY, 'right');
        
        curY += 15 + (cfg.headerPaddingBottom || 4);
        
        if (cfg.showHeaderLine) {
            ctx.strokeStyle = tipColor;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(cfg.headerPaddingLeft || 16, curY);
            ctx.lineTo(width - (cfg.headerPaddingRight || 16), curY);
            ctx.stroke();
            curY += 4;
        }
        ctx.globalAlpha = 1.0; // 必须重置，防止正文变灰
    }

    // 4. 正文
    curY += cfg.paddingTop ?? 10;
    
    // 标题 (支持换行)
    if (cfg.titleMode !== 2) {
        const tSize = Math.floor(textSize * (1.1 + (cfg.titleSize || 0) * 0.1));
        ctx.font = `bold ${tSize}px ${fontStack}`;
        ctx.fillStyle = textColor;
        curY += cfg.titleTopSpacing || 0;
        
        const align = cfg.titleMode === 1 ? 'center' : 'left';
        const titleLines = wrapText(PREVIEW_TITLE, contentW, 0);
        for (const line of titleLines) {
            drawText(line, align === 'center' ? width / 2 : pL, curY, align);
            curY += tSize * 1.4;
        }
        
        curY += (cfg.titleBottomSpacing || 10);
    }

    // 正文内容
    ctx.font = `${cfg.textBold ? 'bold ' : ''}${textSize}px ${fontStack}`;
    ctx.fillStyle = textColor;
    const indentPx = (cfg.paragraphIndent?.length || 0) * textSize;
    const maxY = height - (cfg.footerMode === 1 ? 20 : 60);

    outer: for (const para of PREVIEW_PARAS) {
        if (curY >= maxY) break;
        const lines = wrapText(para, contentW, indentPx);
        for (let i = 0; i < lines.length; i++) {
            if (curY + textSize > maxY) break outer;
            drawText(lines[i], pL + (i === 0 ? indentPx : 0), curY);
            curY += lineH;
        }
        curY += cfg.paragraphSpacing || 0;
    }

    // 5. 页脚
    if (cfg.footerMode !== 1) {
        const fPB = (cfg.footerPaddingBottom || 0) + (cfg.hideNavigationBar ? 10 : 6);
        const fY = height - fPB - 20;
        
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = tipColor;
        ctx.font = `11px ${fontStack}`;

        if (cfg.showFooterLine) {
            ctx.strokeStyle = tipColor;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(cfg.footerPaddingLeft || 16, fY - 4);
            ctx.lineTo(width - (cfg.footerPaddingRight || 16), fY - 4);
            ctx.stroke();
        }

        drawText(getTipText(cfg.tipFooterLeft ?? 1), cfg.footerPaddingLeft || 16, fY);
        drawText(getTipText(getTipText(cfg.tipFooterMiddle ?? 0) === '' ? '' : getTipText(cfg.tipFooterMiddle ?? 0)), width / 2, fY, 'center');
        drawText(getTipText(cfg.tipFooterRight ?? 6), width - (cfg.footerPaddingRight || 16), fY, 'right');
        ctx.globalAlpha = 1.0;
    }

    ctx.restore();
}
