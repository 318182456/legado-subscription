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

// 对标 ZhLayout.kt 的禁则字符集
const POST_PANC = new Set("，。：？！、”’）》}】)>]」；;".split(''));
const PRE_PANC = new Set("“（《【‘(<[{「".split(''));

/**
 * 核心渲染引擎 (V7.0 深度对齐版 - 基于 Legado 渲染 Skill)
 * 1. 引入 ZhLayout 避头尾禁则
 * 2. 实现空格优先的两端对齐
 * 3. 修正隐藏状态栏后的页眉偏移
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
        ctx.globalAlpha = (cfg.bgAlpha ?? 100) / 100;
        const scale = Math.max(width / bgImage.width, height / bgImage.height);
        const dW = bgImage.width * scale;
        const dH = bgImage.height * scale;
        ctx.drawImage(bgImage, (width - dW) / 2, (height - dH) / 2, dW, dH);
        ctx.globalAlpha = 1.0;
    } else {
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = cfg.bgType === 0 ? argbToCss(cfg.bgStr || '#FFFFFF') : '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
    }

    // 3. 排版参数对齐 (参考 legado_render_skill.md)
    const textColor = argbToCss(cfg.textColor || '#3E3D3B');
    const tipColor = argbToCss(cfg.tipColor || '#803E3D3B');
    const fontStack = `"${fontFamily}", sans-serif`;
    
    const textSize = cfg.textSize || 22;
    const letterSp = (cfg.letterSpacing || 0) * textSize;
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
     * 绘制一行文字，实现“空格优先”两端对齐
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

        const totalSpW = letterSp * (chars.length - 1);
        let extraCharSp = 0;
        let extraSpaceW = 0;

        if (align === 'justify' && chars.length > 1) {
            const residual = contentW - (totalCharW + totalSpW);
            // 阈值限制：如果剩余空间太大（超过20%），则放弃两端对齐，避免缝隙过大
            if (residual > 0 && residual < contentW * 0.2) {
                const spaceIndices = chars.reduce((acc, c, i) => (c === ' ' ? [...acc, i] : acc), [] as number[]);
                if (spaceIndices.length > 0) {
                    extraSpaceW = residual / spaceIndices.length;
                } else {
                    extraCharSp = residual / (chars.length - 1);
                }
            }
        }

        let curX = x;
        const totalLineW = totalCharW + totalSpW + (extraCharSp * (chars.length - 1)) + (extraSpaceW * chars.filter(c => c === ' ').length);

        if (align === 'center') curX = x - totalLineW / 2;
        else if (align === 'right') curX = x - totalLineW;
        
        curX = Math.round(curX);
        const drawY = Math.round(y);

        for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i], curX, drawY);
            let nextSp = letterSp + extraCharSp;
            if (chars[i] === ' ') nextSp += extraSpaceW;
            curX += charWList[i] + nextSp;
        }
        return totalLineW;
    };

    /**
     * 断行逻辑 (V7.1 稳健版 - 解决漏字问题)
     */
    const layoutLines = (text: string, maxW: number, indent: number) => {
        const chars = Array.from(text);
        const lines: string[] = [];
        let i = 0;
        let isFirstLine = true;

        while (i < chars.length) {
            let lineChars: string[] = [];
            let lineW = 0;
            const limit = isFirstLine ? maxW - indent : maxW;

            // 填充本行
            while (i < chars.length) {
                const char = chars[i];
                const charW = getCharWidth(char);
                const sp = lineChars.length > 0 ? letterSp : 0;
                
                if (lineW + sp + charW > limit + 0.1) {
                    break; // 溢出
                }
                lineChars.push(char);
                lineW += sp + charW;
                i++;
            }

            // 处理避头尾禁则
            if (i < chars.length && lineChars.length > 0) {
                const nextChar = chars[i];
                // 1. 行首禁入: 如果下一个字符是后置标点，需将本行末尾一个字拉下
                if (POST_PANC.has(nextChar) && lineChars.length > 1) {
                    i--;
                    lineChars.pop();
                }
                // 2. 行尾禁入: 如果本行末尾是前置标点，需将其拉下
                else if (PRE_PANC.has(lineChars[lineChars.length - 1]) && lineChars.length > 1) {
                    i--;
                    lineChars.pop();
                }
            }

            if (lineChars.length === 0 && i < chars.length) {
                // 兜底：防止单个字符过大导致的死循环
                lineChars.push(chars[i]);
                i++;
            }

            lines.push(lineChars.join(''));
            isFirstLine = false;
        }
        return lines;
    };

    let curY = 0;

    // 4. 状态栏
    if (!cfg.hideStatusBar) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = tipColor;
        ctx.font = `600 12px sans-serif`;
        drawLine('12:30', 16, 12);
        drawLine('69%', width - 16, 12, 'right');
        curY = 36;
    }

    // 5. 页眉
    if (cfg.headerMode !== 2) {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = tipColor;
        ctx.font = `11px ${fontStack}`;
        const hPT = dpToPx(cfg.headerPaddingTop || 0) + (cfg.hideStatusBar ? 12 : 20);
        curY = (cfg.hideStatusBar ? 0 : 36) + hPT;
        
        drawLine(getTipText(cfg.tipHeaderLeft ?? 2), dpToPx(cfg.headerPaddingLeft || 16), curY);
        drawLine(getTipText(cfg.tipHeaderMiddle ?? 0), width / 2, curY, 'center');
        drawLine(getTipText(cfg.tipHeaderRight ?? 3), width - dpToPx(cfg.headerPaddingRight || 16), curY, 'right');
        
        curY += 16 + dpToPx(cfg.headerPaddingBottom || 4);
        if (cfg.showHeaderLine) {
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.3; // 线条减淡
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            const lineY = Math.round(curY) + 0.5;
            ctx.moveTo(dpToPx(cfg.headerPaddingLeft || 16), lineY);
            ctx.lineTo(width - dpToPx(cfg.headerPaddingRight || 16), lineY);
            ctx.stroke();
            ctx.globalAlpha = 0.8;
            curY += 8;
        }
    }

    // 6. 正文
    ctx.globalAlpha = 1.0;
    curY += pT;
    
    // 标题
    if (cfg.titleMode !== 2) {
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
    const paraSpacing = textSize * (cfg.paragraphSpacing || 0) / 10;

    outer: for (const para of PREVIEW_PARAS) {
        if (curY >= maxY) break;
        const lines = layoutLines(para, contentW, indentPx);
        for (let i = 0; i < lines.length; i++) {
            if (curY + textSize > maxY) break outer;
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
