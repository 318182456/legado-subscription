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
 * 核心 Canvas 渲染引擎
 * 将 Legado 主题配置 1:1 绘制到 Canvas 上
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

    // 清理画布
    ctx.clearRect(0, 0, width * pixelRatio, height * pixelRatio);
    
    // 设置缩放以匹配逻辑分辨率
    ctx.save();
    ctx.scale(pixelRatio, pixelRatio);

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

    const textColor = argbToCss(cfg.textColor || '#3E3D3B');
    const tipColor = argbToCss(cfg.tipColor || '#803E3D3B');
    const fontStack = `"${fontFamily}", sans-serif`;
    const textSize = cfg.textSize || 20;
    const letterSp = (cfg.letterSpacing || 0) * textSize;
    const lineH = textSize + (cfg.lineSpacingExtra || 0);
    const pL = cfg.paddingLeft ?? 16;
    const pR = cfg.paddingRight ?? 16;
    const contentW = width - pL - pR;

    /**
     * 内部绘制文字工具 (支持字间距)
     */
    const fillTextWithSpacing = (text: string, x: number, y: number, align: 'left'|'center'|'right' = 'left') => {
        ctx.textAlign = 'left'; // 始终使用 left，手动控制偏移
        
        // 计算总宽度
        let totalW = 0;
        for (let i = 0; i < text.length; i++) {
            totalW += ctx.measureText(text[i]).width + (i < text.length - 1 ? letterSp : 0);
        }

        let startX = x;
        if (align === 'center') startX = x - totalW / 2;
        else if (align === 'right') startX = x - totalW;

        let curX = startX;
        for (const char of text) {
            ctx.fillText(char, curX, y);
            curX += ctx.measureText(char).width + letterSp;
        }
        return totalW;
    };

    /**
     * 内部换行工具 (精确匹配 letter-spacing)
     */
    const wrapText = (text: string, maxW: number, firstIndent: number) => {
        const lines: string[] = [];
        let curLine = '';
        let isFirst = true;

        for (const char of text) {
            const testLine = curLine + char;
            // 计算 testLine 宽度
            let testW = 0;
            for (let i = 0; i < testLine.length; i++) {
                testW += ctx.measureText(testLine[i]).width + (i < testLine.length - 1 ? letterSp : 0);
            }

            const currentMaxW = isFirst ? maxW - firstIndent : maxW;
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

    // 2. 状态栏 (简单模拟)
    if (!cfg.hideStatusBar) {
        ctx.font = `600 12px sans-serif`;
        ctx.fillStyle = tipColor;
        ctx.globalAlpha = 0.6;
        fillTextWithSpacing('12:30', 16, 22);
        fillTextWithSpacing('69%', width - 16, 22, 'right');
        ctx.globalAlpha = 1.0;
        curY = 32;
    }

    // 3. 页眉
    if (cfg.headerMode !== 2) {
        const hPT = (cfg.headerPaddingTop || 0) + (cfg.hideStatusBar ? 24 : 4);
        curY += hPT;
        ctx.font = `11px ${fontStack}`;
        ctx.fillStyle = tipColor;
        ctx.globalAlpha = 0.8;
        
        const hY = curY + 10;
        fillTextWithSpacing(getTipText(cfg.tipHeaderLeft ?? 2), cfg.headerPaddingLeft || 16, hY);
        fillTextWithSpacing(getTipText(cfg.tipHeaderMiddle ?? 0), width / 2, hY, 'center');
        fillTextWithSpacing(getTipText(cfg.tipHeaderRight ?? 3), width - (cfg.headerPaddingRight || 16), hY, 'right');
        
        curY = hY + (cfg.headerPaddingBottom || 4);
        
        if (cfg.showHeaderLine) {
            ctx.strokeStyle = tipColor;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(cfg.headerPaddingLeft || 16, curY);
            ctx.lineTo(width - (cfg.headerPaddingRight || 16), curY);
            ctx.stroke();
        }
        curY += 4;
    }

    // 4. 正文内容
    curY += cfg.paddingTop ?? 10;
    
    // 标题
    if (cfg.titleMode !== 2) {
        const tSize = textSize * (1.1 + (cfg.titleSize || 0) * 0.1);
        ctx.font = `bold ${tSize}px ${fontStack}`;
        ctx.fillStyle = textColor;
        curY += cfg.titleTopSpacing || 0;
        
        const align = cfg.titleMode === 1 ? 'center' : 'left';
        fillTextWithSpacing(PREVIEW_TITLE, align === 'center' ? width / 2 : pL, curY + tSize, align);
        
        curY += tSize + (cfg.titleBottomSpacing || 10);
    }

    // 正文
    ctx.font = `${cfg.textBold ? 'bold ' : ''}${textSize}px ${fontStack}`;
    ctx.fillStyle = textColor;
    const indentPx = (cfg.paragraphIndent?.length || 0) * textSize;
    const maxY = height - (cfg.footerMode === 1 ? 20 : 60);

    outer: for (const para of PREVIEW_PARAS) {
        if (curY >= maxY) break;
        const lines = wrapText(para, contentW, indentPx);
        for (let i = 0; i < lines.length; i++) {
            const lineY = curY + textSize;
            if (lineY > maxY) break outer;
            
            fillTextWithSpacing(lines[i], pL + (i === 0 ? indentPx : 0), lineY);
            curY += lineH;
        }
        curY += cfg.paragraphSpacing || 0;
    }

    // 5. 页脚
    if (cfg.footerMode !== 1) {
        const fPB = (cfg.footerPaddingBottom || 0) + (cfg.hideNavigationBar ? 10 : 6);
        const fY = height - fPB - 12;
        
        ctx.font = `11px ${fontStack}`;
        ctx.fillStyle = tipColor;
        ctx.globalAlpha = 0.8;

        if (cfg.showFooterLine) {
            ctx.strokeStyle = tipColor;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(cfg.footerPaddingLeft || 16, fY - 6);
            ctx.lineTo(width - (cfg.footerPaddingRight || 16), fY - 6);
            ctx.stroke();
        }

        fillTextWithSpacing(getTipText(cfg.tipFooterLeft ?? 1), cfg.footerPaddingLeft || 16, fY + 10);
        fillTextWithSpacing(getTipText(cfg.tipFooterMiddle ?? 0), width / 2, fY + 10, 'center');
        fillTextWithSpacing(getTipText(cfg.tipFooterRight ?? 6), width - (cfg.footerPaddingRight || 16), fY + 10, 'right');
    }

    ctx.restore();
}
