import { dpToPx } from "./constants";

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

// 避头尾规则字符 (标点不可在行首)
const POST_PANC = new Set(`，。：？！、"'）》}】)>]」；;”’`.split(""));
const PRE_PANC = new Set(`"（《【'(<[{「“‘`.split(""));

export async function drawTheme(ctx: CanvasRenderingContext2D, cfg: any, options: RenderOptions) {
    const {
        width: logicalW,
        height: logicalH,
        pixelRatio: pr,
        fontFamily = "sans-serif",
        bgImage,
        getTipText,
        PREVIEW_TITLE,
        PREVIEW_PARAS
    } = options;

    const W = logicalW * pr;
    const H = logicalH * pr;
    const d = pr;

    // ── 1. 字体配置与加载 ─────────────────────────────────────
    const fontSize = (cfg.textSize ?? 22) * d;
    const isBold = cfg.textBold === 1 ? "bold " : "";
    const fontName = fontFamily && fontFamily !== "sans-serif" ? fontFamily : "PingFang SC";
    const fontString = `${isBold}${fontSize}px "${fontName}", "PingFang SC", sans-serif`;

    try {
        if (fontFamily && fontFamily !== "sans-serif") {
            await (document as any).fonts.load(`${fontSize}px "${fontName}"`);
        }
        await (document as any).fonts.ready;
    } catch (e) {}

    ctx.font = fontString;
    ctx.imageSmoothingEnabled = true;

    // ── 2. 核心文本净化 (100% 对齐 Legado 引擎) ────────────────
    const cleanParas = PREVIEW_PARAS.map(p =>
        p
            .trim()
            .replace(/ /g, "") // ⚠️ 极其关键：清除所有原文空格，释放宽度，修复提前换行
            .replace(/!/g, "！") // 半角转全角
            .replace(/\?/g, "？")
            .replace(/,/g, "，")
            .replace(/"(.*?)"/g, "“$1”")
    );

    const cleanTitle = PREVIEW_TITLE.trim().replace(/ /g, " "); // 标题保留必要空格

    // ── 3. 基础参数计算 ───────────────────────────────────────
    const toRgba = (hex: any): string => {
        // 非字符串类型（数字/undefined/null）直接返回默认色
        if (typeof hex !== "string") return "rgba(0,0,0,1)";
        if (!hex.startsWith("#")) return hex;
        if (hex.length === 9) {
            const a = parseInt(hex.slice(1, 3), 16) / 255;
            const r = parseInt(hex.slice(3, 5), 16);
            const g = parseInt(hex.slice(5, 7), 16);
            const b = parseInt(hex.slice(7, 9), 16);
            return `rgba(${r},${g},${b},${a.toFixed(4)})`;
        }
        return hex;
    };

    const measure = (char: string, currentFontSize: number = fontSize): number => {
        return ctx.measureText(char).width;
    };

    ctx.save();

    // 背景绘制
    if (cfg.bgType === 2 && bgImage) {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = (cfg.bgAlpha ?? 100) / 100;
        ctx.drawImage(bgImage, 0, 0, W, H);
        ctx.globalAlpha = 1;
    } else {
        ctx.fillStyle = toRgba(cfg.bgStr || "#FFFFFF");
        ctx.fillRect(0, 0, W, H);
    }

    // ── 4. 提取 JSON 排版参数 (精准转换为物理像素) ──────────────
    const textColor = toRgba(cfg.textColor ?? "#ff43050a");
    const tipColor = toRgba(cfg.tipColor ?? "#ff4d3838");

    // textHeight 近似 Android fontMetrics.descent - fontMetrics.ascent
    // 经计算对齐真机需高密度排版，对应比率 1.15
    const textHeight = fontSize * 1.15;
    const ascent = fontSize * 0.86;

    // 字间距：Android letterSpacing 为字号的倍率（em 单位）
    const letterSp = (cfg.letterSpacing ?? 0) * fontSize;

    /**
     * 行高公式对齐真机 (Multiplier 模式):
     * lineH = textHeight * (lineSpacingExtra / 10)
     * 例：lineSpacingExtra=12 (0.2) → lineH = textHeight * 1.2
     */
    const lineH = textHeight * ((cfg.lineSpacingExtra ?? 12) / 10);

    /**
     * 段落间距同理为倍率值
     * 例：paragraphSpacing=5 (0.5) → paraSpacing = fontSize * 0.5
     */
    const paraSpacing = fontSize * ((cfg.paragraphSpacing ?? 5) / 10);

    const pL = (cfg.paddingLeft ?? 23) * d;
    const pR = (cfg.paddingRight ?? 23) * d;
    const contentW = W - pL - pR;

    // 首行缩进：实测全角空格宽度（不同字体下 　 宽度不等于 fontSize）
    const emW = ctx.measureText("　").width; // 全角空格实际宽度
    const indentW = (cfg.paragraphIndent?.length ?? 0) * emW;

    // ── 5. 断行与排版引擎 ─────────────────────────────────────
    const layoutLines = (
        text: string,
        maxW: number,
        firstIndent: number,
        curFontSize: number = fontSize
    ): string[] => {
        const chars = Array.from(text);
        const lines: string[] = [];
        let line: string[] = [];
        let currentW = 0;
        let isFirstLine = true;

        for (let i = 0; i < chars.length; i++) {
            const c = chars[i];
            const cw = measure(c, curFontSize);
            const sp = line.length > 0 ? letterSp : 0;
            const limit = isFirstLine ? maxW - firstIndent : maxW;

            if (currentW + sp + cw > limit + 0.1) {
                // 避头尾处理
                if (POST_PANC.has(c) && line.length > 1) {
                    const prevC = line.pop()!;
                    lines.push(line.join(""));
                    line = [prevC, c];
                    currentW = measure(prevC, curFontSize) + letterSp + cw;
                } else {
                    lines.push(line.join(""));
                    line = [c];
                    currentW = cw;
                }
                isFirstLine = false;
            } else {
                line.push(c);
                currentW += sp + cw;
            }
        }
        if (line.length > 0) lines.push(line.join(""));
        return lines;
    };

    // 绘制单行并执行两端对齐 (Justify)
    const drawLine = (
        text: string,
        x: number,
        y: number,
        align: "left" | "center" | "right" | "justify" = "left",
        targetWidth: number,
        curAscent: number = ascent,
        curFontSize: number = fontSize
    ) => {
        const chars = Array.from(text);
        if (!chars.length) return;

        const ws = chars.map(c => measure(c, curFontSize));
        const totalCharW = ws.reduce((a, b) => a + b, 0);
        const totalBaseSp = letterSp * (chars.length - 1);

        let extraSp = 0;
        // 如果是 Justify 且字符数 > 1，则将剩余空间均匀分摊到每个字符间隙
        if (align === "justify" && chars.length > 1) {
            const gap = targetWidth - totalCharW - totalBaseSp;
            if (gap > 0) extraSp = gap / (chars.length - 1);
        }

        const lineW = totalCharW + totalBaseSp + extraSp * (chars.length - 1);
        let sx =
            align === "center"
                ? x + (targetWidth - lineW) / 2
                : align === "right"
                  ? x + (targetWidth - lineW)
                  : x;
        const dy = y + curAscent;

        for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i], sx, dy);
            sx += ws[i] + letterSp + extraSp;
        }
    };

    // ── 6. 坐标系绝对堆叠 (核心对齐机制) ───────────────────────
    let currentY = 0;

    // [顶层] 状态栏 (通知栏)
    const statusBarH = cfg.hideStatusBar ? 0 : 32 * d;
    if (!cfg.hideStatusBar) {
        const sFontSize = Math.round(12 * d);
        ctx.font = `600 ${sFontSize}px sans-serif`;
        ctx.fillStyle = tipColor;
        const sY = statusBarH / 2 - sFontSize / 2;

        ctx.fillText("12:30", 16 * d, sY + sFontSize * 0.84);
        const batteryText = "69%";
        ctx.fillText(
            batteryText,
            W - 16 * d - ctx.measureText(batteryText).width,
            sY + sFontSize * 0.84
        );
    }
    currentY += statusBarH;

    // [顶层] 页眉 Header
    let headerBottom = currentY;
    if (cfg.headerMode !== 2) {
        const hFontSize = 11 * d;
        // 页眉字体字符串：独立构建，不能用 fontString（它已包含 fontSize）
        ctx.font = `${hFontSize}px "${fontName}", "PingFang SC", sans-serif`;
        ctx.fillStyle = tipColor;

        const hY = currentY + (cfg.headerPaddingTop ?? 6) * d;
        const hBaseY = hY + hFontSize * 0.86;

        ctx.fillText(getTipText(cfg.tipHeaderLeft ?? 1), (cfg.headerPaddingLeft ?? 24) * d, hBaseY);
        const midText = getTipText(cfg.tipHeaderMiddle ?? 0);
        ctx.fillText(midText, (W - ctx.measureText(midText).width) / 2, hBaseY);
        const rightText = getTipText(cfg.tipHeaderRight ?? 7);
        ctx.fillText(rightText, W - (cfg.headerPaddingRight ?? 24) * d - ctx.measureText(rightText).width, hBaseY);

        headerBottom = hY + hFontSize + (cfg.headerPaddingBottom ?? 1) * d;

        if (cfg.showHeaderLine) {
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.2;
            ctx.lineWidth = 0.5 * d;
            ctx.beginPath();
            ctx.moveTo(16 * d, headerBottom);
            ctx.lineTo(W - 16 * d, headerBottom);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    // ⚠️ 极其关键：正文安全区的绝对起点 = 页眉底部 + paddingTop
    currentY = headerBottom + (cfg.paddingTop ?? 15) * d;

    // [内容层] 标题
    if (cfg.titleMode !== 2) {
        const tFontSize = fontSize + (cfg.titleSize ?? 3) * d;
        ctx.font = `bold ${tFontSize}px "${fontName}", "PingFang SC", sans-serif`;
        ctx.fillStyle = textColor;
        // 标题行高：使用 1.15 基准高度 * 倍率
        const tLineH = (tFontSize * 1.15) * ((cfg.lineSpacingExtra ?? 12) / 10);

        // 加上 titleTopSpacing
        currentY += (cfg.titleTopSpacing ?? 8) * d;
        const tAlign = cfg.titleMode === 1 ? "center" : "left";

        const tLines = layoutLines(cleanTitle, contentW, 0, tFontSize);
        for (const line of tLines) {
            drawLine(line, pL, currentY, tAlign, contentW, tFontSize * 0.86, tFontSize);
            currentY += tLineH;
        }
        currentY += (cfg.titleBottomSpacing ?? 10) * d;
    }

    // [内容层] 正文渲染
    ctx.font = fontString;
    ctx.fillStyle = textColor;

    const navH = cfg.hideNavigationBar ? 0 : 24 * d;
    const fFontSize = 11 * d;
    const footerSafeH =
        cfg.footerMode !== 1
            ? (cfg.footerPaddingBottom ?? 9) * d +
              fFontSize +
              (cfg.footerPaddingTop ?? 6) * d +
              navH +
              (cfg.paddingBottom ?? 15) * d
            : navH;
    const maxY = H - footerSafeH;

    outer: for (const para of cleanParas) {
        if (currentY >= maxY) break;

        const lines = layoutLines(para, contentW, indentW, fontSize);

        for (let li = 0; li < lines.length; li++) {
            if (currentY + fontSize > maxY) break outer;

            const isFirstLine = li === 0;
            const isLastLine = li === lines.length - 1;

            const currentX = pL + (isFirstLine ? indentW : 0);
            const targetW = isFirstLine ? contentW - indentW : contentW;
            const justifyMode = isLastLine ? "left" : "justify";

            drawLine(lines[li], currentX, currentY, justifyMode, targetW, ascent, fontSize);
            currentY += lineH;
        }
        currentY += paraSpacing;
    }

    // [底层] 页脚 Footer
    if (cfg.footerMode !== 1) {
        // 页脚字体字符串：独立构建，不能用 fontString
        ctx.font = `${fFontSize}px "${fontName}", "PingFang SC", sans-serif`;
        ctx.fillStyle = tipColor;

        const fY = H - navH - (cfg.footerPaddingBottom ?? 9) * d - fFontSize;
        const fBaseY = fY + fFontSize * 0.86;

        // 页脚线位置：考虑 footerPaddingTop
        const lineY = Math.floor(fY - (cfg.footerPaddingTop ?? 6) * d);

        if (cfg.showFooterLine) {
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.2;
            ctx.lineWidth = 0.5 * d;
            ctx.beginPath();
            ctx.moveTo(16 * d, lineY);
            ctx.lineTo(W - 16 * d, lineY);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        ctx.fillText(getTipText(cfg.tipFooterLeft ?? 6), (cfg.footerPaddingLeft ?? 24) * d, fBaseY);
        const midFText = getTipText(cfg.tipFooterMiddle ?? 0);
        ctx.fillText(midFText, (W - ctx.measureText(midFText).width) / 2, fBaseY);
        const rightFText = getTipText(cfg.tipFooterRight ?? 9);
        ctx.fillText(
            rightFText,
            W - (cfg.footerPaddingRight ?? 24) * d - ctx.measureText(rightFText).width,
            fBaseY
        );
    }

    ctx.restore();
}
