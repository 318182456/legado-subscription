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

const POST_PANC = new Set(`，。：？！、"'）》}】)>]」；;`.split(''));
const PRE_PANC  = new Set(`"（《【'(<[{「`.split(''));

/**
 * 核心渲染引擎 (V8.6)
 *
 * 关键修正：行高计算对齐 Android ChapterProvider.kt
 *   Android: lineH = paint.textSize * (1 + lineSpacingExtra / 10)
 *   Web 之前的错误：用 actualBoundingBoxAscent + Descent 作为 textHeight，
 *   Web 字体的 Descent 比 Android 大约 20%，导致行高被额外放大。
 *   修正方案：lineH = textSize * (1 + extra/10)，仅用测量值作 baseline 偏移。
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
        PREVIEW_PARAS,
    } = options;

    const W = logicalW * pr;
    const H = logicalH * pr;

    if ((document as any).fonts) await (document as any).fonts.ready;

    const cache = new Map<string, number>();

    // ── 工具函数 ──────────────────────────────────────────────

    /** #AARRGGBB → rgba() */
    const toRgba = (hex: string): string => {
        if (!hex?.startsWith('#')) return hex ?? 'rgba(0,0,0,1)';
        if (hex.length === 9) {
            const a = parseInt(hex.slice(1, 3), 16) / 255;
            const r = parseInt(hex.slice(3, 5), 16);
            const g = parseInt(hex.slice(5, 7), 16);
            const b = parseInt(hex.slice(7, 9), 16);
            return `rgba(${r},${g},${b},${a.toFixed(4)})`;
        }
        return hex;
    };

    const measure = (char: string): number => {
        if (cache.has(ctx.font + char)) return cache.get(ctx.font + char)!;
        const w = ctx.measureText(char).width;
        cache.set(ctx.font + char, w);
        return w;
    };

    // ── 初始化 ────────────────────────────────────────────────

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // 背景
    if (cfg.bgType === 2 && bgImage) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = (cfg.bgAlpha ?? 100) / 100;
        const s  = Math.max(W / bgImage.width, H / bgImage.height);
        const bW = bgImage.width * s, bH = bgImage.height * s;
        ctx.drawImage(bgImage, (W - bW) / 2, (H - bH) / 2, bW, bH);
        ctx.globalAlpha = 1;
    } else {
        ctx.fillStyle = toRgba(cfg.bgStr || '#FFFFFF');
        ctx.fillRect(0, 0, W, H);
    }

    // ── 排版参数 (全部物理像素) ───────────────────────────────

    const d          = pr;                                       // dp → px
    const textColor  = toRgba(cfg.textColor  ?? '#ff43050a');
    const tipColor   = toRgba(cfg.tipColor   ?? '#ff4d3838');
    const fontStack  = `"${fontFamily}", sans-serif`;

    // 正文字号 (物理像素)
    const fontSize   = (cfg.textSize ?? 22) * d;
    // 字间距：Android letterSpacing 是字号的倍率（em 单位）
    const letterSp   = (cfg.letterSpacing ?? 0) * fontSize;

    // 设置正文字体，测量 baseline 偏移（仅用于绘图定位）
    ctx.font = `${cfg.textBold === 1 ? 'bold ' : ''}${fontSize}px ${fontStack}`;
    const mm         = ctx.measureText('国');
    const ascent     = mm.actualBoundingBoxAscent  ?? fontSize * 0.8;
    const descent    = mm.actualBoundingBoxDescent ?? fontSize * 0.2;
    const measuredH  = ascent + descent;   // 仅用于 baseline 定位

    /**
     * 【核心修正】行高对齐 Android ChapterProvider
     *   Android: durY += paint.textSize * lineSpacingExtra
     *   lineSpacingExtra = cfg.lineSpacingExtra / 10
     *   所以 lineH = textSize * (1 + cfg.lineSpacingExtra / 10)
     */
    const lineH = fontSize * (1 + (cfg.lineSpacingExtra ?? 12) / 10);

    // 边距 (dp → px)
    const pL       = (cfg.paddingLeft  ?? 23) * d;
    const pR       = (cfg.paddingRight ?? 23) * d;
    const pT       = (cfg.paddingTop   ?? 15) * d;
    const pB       = (cfg.paddingBottom ?? 15) * d;
    const contentW = W - pL - pR;

    // 段落间距：Android = textSize * paragraphSpacing / 10
    const paraSpacing = fontSize * (cfg.paragraphSpacing ?? 5) / 10;

    // 首行缩进
    const indentW = (cfg.paragraphIndent?.length ?? 0) > 0
        ? measure('　') * cfg.paragraphIndent.length
        : 0;

    // ── 断行引擎 ─────────────────────────────────────────────

    const layoutLines = (text: string, maxW: number, firstIndent: number): string[] => {
        const chars = Array.from(text);
        const lines: string[] = [];
        let i = 0, isFirst = true;

        while (i < chars.length) {
            const limit = isFirst ? maxW - firstIndent : maxW;
            const line: string[] = [];
            let w = 0;

            while (i < chars.length) {
                const c  = chars[i];
                const cw = measure(c);
                const sp = line.length > 0 ? letterSp : 0;
                if (w + sp + cw > limit + 0.5) {
                    // 行首禁入：将上一个字推到下一行
                    if (POST_PANC.has(c) && line.length > 1) { i--; line.pop(); }
                    // 行末禁出：将末字推到下一行
                    else if (line.length > 1 && PRE_PANC.has(line[line.length - 1])) { i--; line.pop(); }
                    break;
                }
                line.push(c);
                w += sp + cw;
                i++;
            }

            if (line.length === 0 && i < chars.length) line.push(chars[i++]);
            lines.push(line.join(''));
            isFirst = false;
        }
        return lines;
    };

    // ── 绘制函数 ─────────────────────────────────────────────

    /**
     * 绘制一行文字
     * @param text    文字内容
     * @param x       起点 x（left/justify）或中心 x（center）或末点 x（right）
     * @param y       行顶部 y（baseline = y + ascent）
     * @param align   对齐方式
     * @param asc     baseline 偏移（不同字号传入对应值）
     */
    const drawLine = (
        text: string,
        x: number, y: number,
        align: 'left' | 'center' | 'right' | 'justify' = 'left',
        asc: number = ascent,
    ) => {
        const chars = Array.from(text);
        if (!chars.length) return;

        const ws    = chars.map(c => measure(c));
        const totalW = ws.reduce((a, b) => a + b, 0);
        const totalSp = letterSp * (chars.length - 1);

        let extraSp = 0;
        if (align === 'justify' && chars.length > 1) {
            const gap = contentW - totalW - totalSp;
            if (gap > 0 && gap < contentW * 0.35)
                extraSp = gap / (chars.length - 1);
        }

        const lineW = totalW + totalSp + extraSp * (chars.length - 1);
        let sx = align === 'center' ? Math.floor(x - lineW / 2)
               : align === 'right'  ? Math.floor(x - lineW)
               : Math.floor(x);
        const dy = Math.floor(y + asc);

        for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i], sx, dy);
            sx += ws[i] + letterSp + extraSp;
        }
    };

    // ── 绘制流 ────────────────────────────────────────────────

    // 1. 状态栏 (24 dp 预留)
    if (!cfg.hideStatusBar) {
        const sFont = `600 ${Math.round(12 * d)}px sans-serif`;
        ctx.font = sFont;
        ctx.fillStyle = tipColor;
        const sm = ctx.measureText('0');
        const sAsc = sm.actualBoundingBoxAscent ?? 12 * d * 0.8;
        drawLine('12:30', 16 * d, 6 * d, 'left',  sAsc);
        drawLine('69%',   W - 16 * d, 6 * d, 'right', sAsc);
    }

    // 2. 页眉
    let curY = 24 * d;  // 状态栏预留
    if (cfg.headerMode !== 2) {
        const hFontSize = 11 * d;
        ctx.font = `${hFontSize}px ${fontStack}`;
        ctx.fillStyle = tipColor;
        const hm   = ctx.measureText('国');
        const hAsc = hm.actualBoundingBoxAscent  ?? hFontSize * 0.8;
        const hH   = hAsc + (hm.actualBoundingBoxDescent ?? hFontSize * 0.2);

        curY += (cfg.headerPaddingTop ?? 20) * d;

        drawLine(getTipText(cfg.tipHeaderLeft   ?? 1), (cfg.headerPaddingLeft  ?? 22) * d, curY, 'left',   hAsc);
        drawLine(getTipText(cfg.tipHeaderMiddle ?? 0),  W / 2,                             curY, 'center', hAsc);
        drawLine(getTipText(cfg.tipHeaderRight  ?? 7),  W - (cfg.headerPaddingRight ?? 22) * d, curY, 'right', hAsc);

        curY += hH + (cfg.headerPaddingBottom ?? 1) * d;

        if (cfg.showHeaderLine) {
            ctx.save();
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth   = 0.5 * d;
            ctx.beginPath();
            ctx.moveTo(16 * d, Math.floor(curY));
            ctx.lineTo(W - 16 * d, Math.floor(curY));
            ctx.stroke();
            ctx.restore();
        }
    }

    // 3. 正文区起点
    curY += pT;

    // 4. 标题
    if (cfg.titleMode !== 2) {
        const tFontSize = ((cfg.textSize ?? 22) + (cfg.titleSize ?? 3)) * d;
        ctx.font = `bold ${tFontSize}px ${fontStack}`;
        ctx.fillStyle = textColor;
        const tm   = ctx.measureText('国');
        const tAsc = tm.actualBoundingBoxAscent  ?? tFontSize * 0.8;
        // 标题行高同样对齐 Android 公式
        const tLineH = tFontSize * (1 + (cfg.lineSpacingExtra ?? 12) / 10);

        curY += (cfg.titleTopSpacing ?? 8) * d;

        const tAlign = cfg.titleMode === 1 ? 'center' : 'left';
        const tLines = layoutLines(PREVIEW_TITLE, contentW, 0);
        for (const line of tLines) {
            drawLine(line, tAlign === 'center' ? W / 2 : pL, curY, tAlign, tAsc);
            curY += tLineH;
        }
        curY += (cfg.titleBottomSpacing ?? 10) * d;
    }

    // 5. 正文段落
    ctx.font = `${cfg.textBold === 1 ? 'bold ' : ''}${fontSize}px ${fontStack}`;
    ctx.fillStyle = textColor;
    const maxY = H - pB - 30 * d; // 留出页脚

    outer: for (const para of PREVIEW_PARAS) {
        if (curY >= maxY) break;
        const lines = layoutLines(para, contentW, indentW);
        for (let li = 0; li < lines.length; li++) {
            if (curY + measuredH > maxY) break outer;
            const isLast = li === lines.length - 1;
            drawLine(lines[li], pL + (li === 0 ? indentW : 0), curY, isLast ? 'left' : 'justify');
            curY += lineH;
        }
        curY += paraSpacing;
    }

    // 6. 页脚
    if (cfg.footerMode !== 1) {
        const fFontSize = 11 * d;
        ctx.font = `${fFontSize}px ${fontStack}`;
        ctx.fillStyle = tipColor;
        const fm   = ctx.measureText('国');
        const fAsc = fm.actualBoundingBoxAscent  ?? fFontSize * 0.8;
        const fH   = fAsc + (fm.actualBoundingBoxDescent ?? fFontSize * 0.2);

        const navH = cfg.hideNavigationBar ? 0 : 10 * d;
        const fY   = H - navH - (cfg.footerPaddingBottom ?? 9) * d - fH;

        if (cfg.showFooterLine) {
            ctx.save();
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth   = 0.5 * d;
            ctx.beginPath();
            ctx.moveTo(16 * d, Math.floor(fY - 4 * d));
            ctx.lineTo(W - 16 * d, Math.floor(fY - 4 * d));
            ctx.stroke();
            ctx.restore();
        }

        drawLine(getTipText(cfg.tipFooterLeft   ?? 6), (cfg.footerPaddingLeft  ?? 20) * d, fY, 'left',   fAsc);
        drawLine(getTipText(cfg.tipFooterMiddle ?? 0),  W / 2,                             fY, 'center', fAsc);
        drawLine(getTipText(cfg.tipFooterRight  ?? 9),  W - (cfg.footerPaddingRight ?? 19) * d, fY, 'right', fAsc);
    }

    ctx.restore();
}
