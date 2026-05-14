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

// 避头尾规则字符
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

    // ── 1. 强制等待字体并更新 Canvas 状态 ────────────────────
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

    // ── 2. 文本彻底净化 (解决缩进和半角标点问题) ───────────────
    const cleanParas = PREVIEW_PARAS.map(p =>
        p
            .trim() // ⚠️ 强制去掉源文本的空格，完全交由排版引擎计算缩进
            .replace(/!/g, "！")
            .replace(/\?/g, "？")
            .replace(/,/g, "，")
            .replace(/"(.*?)"/g, "“$1”")
            .replace(/-/g, "－")
    );

    // ── 3. 核心测量器 ─────────────────────────────────────────
    const measure = (char: string, currentFontSize: number = fontSize): number => {
        return ctx.measureText(char).width;
    };

    const toRgba = (hex: string): string => {
        if (!hex?.startsWith("#")) return hex ?? "rgba(0,0,0,1)";
        if (hex.length === 9) {
            const a = parseInt(hex.slice(1, 3), 16) / 255;
            const r = parseInt(hex.slice(3, 5), 16);
            const g = parseInt(hex.slice(5, 7), 16);
            const b = parseInt(hex.slice(7, 9), 16);
            return `rgba(${r},${g},${b},${a.toFixed(4)})`;
        }
        return hex;
    };

    ctx.save();

    // ── 4. 背景层绘制 ─────────────────────────────────────────
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

    // ── 5. 布局参数设定 ───────────────────────────────────────
    const textColor = toRgba(cfg.textColor ?? "#ff43050a");
    const tipColor = toRgba(cfg.tipColor ?? "#ff4d3838");
    const letterSp = (cfg.letterSpacing ?? 0) * fontSize;
    const ascent = fontSize * 0.84;

    // ⚠️ 修正行高倍率：Android 原生字体高度约为 1.2 倍字号
    const lineH = fontSize * 1.2 + (cfg.lineSpacingExtra ?? 12) * d;
    const paraSpacing = (fontSize * (cfg.paragraphSpacing ?? 5)) / 10;

    const pL = (cfg.paddingLeft ?? 23) * d;
    const pR = (cfg.paddingRight ?? 23) * d;
    const contentW = W - pL - pR;

    // ⚠️ 强制缩进宽度：读取配置字符长度 * 字号
    const indentW = (cfg.paragraphIndent?.length ?? 0) * fontSize;

    // ── 6. 纯粹的断行引擎 ─────────────────────────────────────
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

            // 首行可用宽度需减去缩进量
            const limit = isFirstLine ? maxW - firstIndent : maxW;

            if (currentW + sp + cw > limit + 0.5) {
                // 避头尾规则处理
                if (POST_PANC.has(c) && line.length > 1) {
                    const prevC = line.pop()!;
                    lines.push(line.join(""));
                    line = [prevC, c];
                    currentW = measure(prevC, curFontSize) + letterSp + cw;
                } else if (line.length > 0 && PRE_PANC.has(line[line.length - 1])) {
                    const prevC = line.pop()!;
                    lines.push(line.join(""));
                    line = [prevC, c];
                    currentW = measure(prevC, curFontSize) + letterSp + cw;
                } else {
                    lines.push(line.join(""));
                    line = [c];
                    currentW = cw;
                }
                isFirstLine = false; // 换行后重置标记
            } else {
                line.push(c);
                currentW += sp + cw;
            }
        }
        if (line.length > 0) lines.push(line.join(""));
        return lines;
    };

    // ── 7. 单行绘制引擎 ───────────────────────────────────────
    const drawLine = (
        text: string,
        x: number,
        y: number,
        align: "left" | "center" | "right" | "justify" = "left",
        targetWidth: number, // ⚠️ 传入该行实际可用宽度用于排版计算
        curAscent: number = ascent,
        curFontSize: number = fontSize
    ) => {
        const chars = Array.from(text);
        if (!chars.length) return;

        const ws = chars.map(c => measure(c, curFontSize));
        const totalCharW = ws.reduce((a, b) => a + b, 0);
        const totalBaseSp = letterSp * (chars.length - 1);

        let extraSp = 0;
        if (align === "justify" && chars.length > 1) {
            const gap = targetWidth - totalCharW - totalBaseSp;
            // 限制最大拉伸宽度，如果缺口太大宁可留白也不扯裂字间距
            if (gap > 0 && gap < curFontSize * 2.5) {
                extraSp = gap / (chars.length - 1);
            }
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

    // ── 8. 全局渲染流 ─────────────────────────────────────────
    let currentY = 0;

    // [层级 1] 状态栏
    const statusBarH = cfg.hideStatusBar ? 0 : 24 * d;
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

    // [层级 2] 页眉 Header
    if (cfg.headerMode !== 2) {
        const hFontSize = 11 * d;
        ctx.font = `${hFontSize}px ${fontString}`;
        ctx.fillStyle = tipColor;

        const hY = currentY + (cfg.headerPaddingTop ?? 20) * d;
        const hBaseY = hY + hFontSize * 0.84;

        ctx.fillText(getTipText(cfg.tipHeaderLeft ?? 1), pL, hBaseY);
        const midText = getTipText(cfg.tipHeaderMiddle ?? 0);
        ctx.fillText(midText, (W - ctx.measureText(midText).width) / 2, hBaseY);
        const rightText = getTipText(cfg.tipHeaderRight ?? 7);
        ctx.fillText(rightText, W - pR - ctx.measureText(rightText).width, hBaseY);

        currentY = hY + hFontSize + (cfg.headerPaddingBottom ?? 1) * d;

        if (cfg.showHeaderLine) {
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.2;
            ctx.lineWidth = 0.5 * d;
            ctx.beginPath();
            ctx.moveTo(16 * d, currentY);
            ctx.lineTo(W - 16 * d, currentY);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    // [层级 3] 页面内边距与标题
    currentY += (cfg.paddingTop ?? 15) * d;

    if (cfg.titleMode !== 2) {
        const tFontSize = fontSize + (cfg.titleSize ?? 3) * d;
        ctx.font = `bold ${tFontSize}px "${fontName}", "PingFang SC", sans-serif`;
        ctx.fillStyle = textColor;
        const tLineH = tFontSize * 1.2 + (cfg.lineSpacingExtra ?? 12) * d;

        currentY += (cfg.titleTopSpacing ?? 8) * d;
        const tAlign = cfg.titleMode === 1 ? "center" : "left";

        const tLines = layoutLines(PREVIEW_TITLE, contentW, 0, tFontSize);
        for (const line of tLines) {
            drawLine(line, pL, currentY, tAlign, contentW, tFontSize * 0.84, tFontSize);
            currentY += tLineH;
        }
        currentY += (cfg.titleBottomSpacing ?? 10) * d;
    }

    // [层级 4] 正文渲染
    ctx.font = fontString;
    ctx.fillStyle = textColor;

    const navH = cfg.hideNavigationBar ? 0 : 10 * d;
    const fFontSize = 11 * d;
    const footerSafeH =
        cfg.footerMode !== 1
            ? (cfg.footerPaddingBottom ?? 9) * d +
              fFontSize * 2 +
              navH +
              (cfg.paddingBottom ?? 15) * d
            : 0;
    const maxY = H - footerSafeH;

    outer: for (const para of cleanParas) {
        if (currentY >= maxY) break;

        // 传入计算好的首行缩进宽度
        const lines = layoutLines(para, contentW, indentW, fontSize);

        for (let li = 0; li < lines.length; li++) {
            if (currentY + fontSize > maxY) break outer;

            const isFirstLine = li === 0;
            const isLastLine = li === lines.length - 1;

            // 第一行起点加上缩进偏移，且可用宽度减少
            const currentX = pL + (isFirstLine ? indentW : 0);
            const targetW = isFirstLine ? contentW - indentW : contentW;
            const justifyMode = isLastLine ? "left" : "justify";

            drawLine(lines[li], currentX, currentY, justifyMode, targetW, ascent, fontSize);
            currentY += lineH;
        }
        currentY += paraSpacing;
    }

    // [层级 5] 页脚 Footer
    if (cfg.footerMode !== 1) {
        ctx.font = `${fFontSize}px ${fontString}`;
        ctx.fillStyle = tipColor;

        const fY = H - navH - (cfg.footerPaddingBottom ?? 9) * d - fFontSize;
        const fBaseY = fY + fFontSize * 0.84;

        if (cfg.showFooterLine) {
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.2;
            ctx.lineWidth = 0.5 * d;
            ctx.beginPath();
            ctx.moveTo(16 * d, Math.floor(fY - 8 * d));
            ctx.lineTo(W - 16 * d, Math.floor(fY - 8 * d));
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        ctx.fillText(getTipText(cfg.tipFooterLeft ?? 6), (cfg.footerPaddingLeft ?? 20) * d, fBaseY);
        const midFText = getTipText(cfg.tipFooterMiddle ?? 0);
        ctx.fillText(midFText, (W - ctx.measureText(midFText).width) / 2, fBaseY);
        const rightFText = getTipText(cfg.tipFooterRight ?? 9);
        ctx.fillText(
            rightFText,
            W - (cfg.footerPaddingRight ?? 19) * d - ctx.measureText(rightFText).width,
            fBaseY
        );
    }

    ctx.restore();
}
