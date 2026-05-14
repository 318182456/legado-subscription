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

// 行首禁用字符（不能出现在行首）
const POST_PANC = new Set(`，。：？！、"'）》}】)>]」；;`.split(''));
// 行末禁用字符（不能出现在行末）
const PRE_PANC  = new Set(`"（《【'(<[{「`.split(''));
// 所有标点（两端对齐时不参与额外空间分配）
const ALL_PANC  = new Set([...POST_PANC, ...PRE_PANC, '　', ' ']);

/**
 * 核心渲染引擎 (V8.7)
 *
 * 修正列表（对应用户诊断报告）：
 * 1. 背景图：Math.max → FitXY (ctx.drawImage(bgImage, 0, 0, W, H))
 * 2. Y轴布局：header 绝对定位于屏幕顶部；正文 curY 从状态栏+header高度和 paddingTop 中取最大值
 * 3. 字体：正确 await document.fonts.load() 确保字体测量准确
 * 4. Justify：extraSp 只分配给非标点字符间隙
 * 5. 行高：lineH = fontSize * (1 + extra/10) 对齐 Android ChapterProvider
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
    const d = pr;

    const fontStack = fontFamily && fontFamily !== 'sans-serif'
        ? `"${fontFamily}", "PingFang SC", sans-serif`
        : '"PingFang SC", sans-serif';

    // ── 等待字体加载 ──────────────────────────────────────────
    try {
        if (fontFamily && fontFamily !== 'sans-serif') {
            await (document as any).fonts.load(`${(cfg.textSize ?? 22) * d}px "${fontFamily}"`);
        }
        await (document as any).fonts.ready;
    } catch (_) { /* 字体加载失败时继续渲染 */ }

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
        const k = ctx.font + char;
        if (cache.has(k)) return cache.get(k)!;
        const w = ctx.measureText(char).width;
        cache.set(k, w);
        return w;
    };

    // ── 初始化 ────────────────────────────────────────────────

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // ▌修正1：背景图改为 FitXY（强制铺满，对应 Android ImageView.ScaleType.FIT_XY）
    if (cfg.bgType === 2 && bgImage) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = (cfg.bgAlpha ?? 100) / 100;
        ctx.drawImage(bgImage, 0, 0, W, H);  // FitXY：不保持比例，直接铺满
        ctx.globalAlpha = 1;
    } else {
        ctx.fillStyle = toRgba(cfg.bgStr || '#FFFFFF');
        ctx.fillRect(0, 0, W, H);
    }

    // ── 排版参数 ─────────────────────────────────────────────

    const textColor = toRgba(cfg.textColor  ?? '#ff43050a');
    const tipColor  = toRgba(cfg.tipColor   ?? '#ff4d3838');

    const fontSize  = (cfg.textSize ?? 22) * d;
    const letterSp  = (cfg.letterSpacing ?? 0) * fontSize;

    ctx.font = `${cfg.textBold === 1 ? 'bold ' : ''}${fontSize}px ${fontStack}`;
    const mm = ctx.measureText('国');
    const ascent  = mm.actualBoundingBoxAscent  ?? fontSize * 0.8;
    const descent = mm.actualBoundingBoxDescent ?? fontSize * 0.2;
    const measuredH = ascent + descent;

    // ▌修正5：行高对齐 Android ChapterProvider：lineH = fontSize * (1 + extra/10)
    const lineH = fontSize * (1 + (cfg.lineSpacingExtra ?? 12) / 10);

    const pL = (cfg.paddingLeft  ?? 23) * d;
    const pR = (cfg.paddingRight ?? 23) * d;
    const contentW = W - pL - pR;

    // 段落间距同样使用 fontSize：paraSpacing = fontSize * extra/10
    const paraSpacing = fontSize * (cfg.paragraphSpacing ?? 5) / 10;

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
                    if (POST_PANC.has(c) && line.length > 1) { i--; line.pop(); }
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
     * ▌修正4：两端对齐时，extraSp 只分配给非标点字符之间的间隙
     * 标点字符（，。！""等）不参与空白补偿，避免标点周围产生大空隙
     */
    const drawLine = (
        text: string,
        x: number, y: number,
        align: 'left' | 'center' | 'right' | 'justify' = 'left',
        asc: number = ascent,
    ) => {
        const chars = Array.from(text);
        if (!chars.length) return;

        const ws = chars.map(c => measure(c));
        const totalW  = ws.reduce((a, b) => a + b, 0);
        const totalSp = letterSp * (chars.length - 1);

        let extraSp = 0;
        if (align === 'justify' && chars.length > 1) {
            const gap = contentW - totalW - totalSp;
            if (gap > 0 && gap < contentW * 0.35) {
                // 只统计非标点的间隙数量
                const distributableGaps = chars.slice(0, -1)
                    .filter(c => !ALL_PANC.has(c)).length;
                if (distributableGaps > 0) extraSp = gap / distributableGaps;
            }
        }

        const lineW = totalW + totalSp + chars.slice(0, -1)
            .reduce((acc, c) => acc + (!ALL_PANC.has(c) ? extraSp : 0), 0);

        let sx = align === 'center' ? Math.floor(x - lineW / 2)
               : align === 'right'  ? Math.floor(x - lineW)
               : Math.floor(x);
        const dy = Math.floor(y + asc);

        for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i], sx, dy);
            const gapSp = (i < chars.length - 1 && !ALL_PANC.has(chars[i])) ? extraSp : 0;
            sx += ws[i] + letterSp + gapSp;
        }
    };

    // ── 绘制流 ────────────────────────────────────────────────

    // ▌修正2：Y轴布局重构
    // 原则：header 绝对定位于屏幕顶部附近；正文起点 = max(header区域底部, paddingTop)

    // ─ 1. 状态栏（绝对顶部）
    const statusBarH = cfg.hideStatusBar ? 0 : 24 * d;
    if (!cfg.hideStatusBar) {
        const sFontSize = Math.round(12 * d);
        ctx.font = `600 ${sFontSize}px sans-serif`;
        ctx.fillStyle = tipColor;
        const sm  = ctx.measureText('0');
        const sAsc = sm.actualBoundingBoxAscent ?? sFontSize * 0.8;
        // 状态栏文字垂直居中于 24dp 区域
        const sY  = (statusBarH - (sAsc + (sm.actualBoundingBoxDescent ?? sFontSize * 0.2))) / 2;
        drawLine('12:30', 16 * d, sY, 'left',  sAsc);
        drawLine('69%',   W - 16 * d, sY, 'right', sAsc);
    }

    // ─ 2. 页眉（headerPaddingTop 相对状态栏底部）
    let headerBottom = statusBarH;
    if (cfg.headerMode !== 2) {
        const hFontSize = 11 * d;
        ctx.font = `${hFontSize}px ${fontStack}`;
        ctx.fillStyle = tipColor;
        const hm   = ctx.measureText('国');
        const hAsc = hm.actualBoundingBoxAscent  ?? hFontSize * 0.8;
        const hH   = hAsc + (hm.actualBoundingBoxDescent ?? hFontSize * 0.2);

        const hY = statusBarH + (cfg.headerPaddingTop ?? 20) * d;
        drawLine(getTipText(cfg.tipHeaderLeft   ?? 1), (cfg.headerPaddingLeft  ?? 22) * d, hY, 'left',   hAsc);
        drawLine(getTipText(cfg.tipHeaderMiddle ?? 0),  W / 2,                             hY, 'center', hAsc);
        drawLine(getTipText(cfg.tipHeaderRight  ?? 7),  W - (cfg.headerPaddingRight ?? 22) * d, hY, 'right', hAsc);

        headerBottom = hY + hH + (cfg.headerPaddingBottom ?? 1) * d;

        if (cfg.showHeaderLine) {
            ctx.save();
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth   = 0.5 * d;
            ctx.beginPath();
            ctx.moveTo(16 * d, Math.floor(headerBottom));
            ctx.lineTo(W - 16 * d, Math.floor(headerBottom));
            ctx.stroke();
            ctx.restore();
        }
    }

    // ─ 3. 正文起点
    // ▌修正2核心：取 header 底部 和 paddingTop 中的最大值，避免双重累加
    const pT = (cfg.paddingTop ?? 15) * d;
    let curY = Math.max(headerBottom, pT) + pT;

    // ─ 4. 标题
    if (cfg.titleMode !== 2) {
        const tFontSize = ((cfg.textSize ?? 22) + (cfg.titleSize ?? 3)) * d;
        ctx.font = `bold ${tFontSize}px ${fontStack}`;
        ctx.fillStyle = textColor;
        const tm   = ctx.measureText('国');
        const tAsc = tm.actualBoundingBoxAscent  ?? tFontSize * 0.8;
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

    // ─ 5. 正文段落
    ctx.font = `${cfg.textBold === 1 ? 'bold ' : ''}${fontSize}px ${fontStack}`;
    ctx.fillStyle = textColor;
    const maxY = H - (cfg.paddingBottom ?? 15) * d - 30 * d;

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

    // ─ 6. 页脚
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
