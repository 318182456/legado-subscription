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

// 避头尾禁则库 (对齐 Android ICU 规则)
const POST_PANC = new Set(`，。：？！、”’）》】)\]」}；;·…~～!?,.`.split(""));
const PRE_PANC = new Set(`“‘（《【(\[「{`.split(""));

// 👑 核心模拟：强制使用 Android 系统字体的固定比例度量 (解决行距缩水和底部多出一行的问题)
const getAndroidFontMetrics = (fontSize: number) => {
    // 在 Android CJK (中日韩) 标准字体中，ascent 和 descent 是固定的比例
    const ascent = fontSize * 0.88;
    const descent = fontSize * 0.26;
    const textHeight = ascent + descent; // 约为 1.14 倍字体大小
    return { ascent, descent, textHeight };
};

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
    const fontName = cfg.textFont
        ? cfg.textFont.split(".")[0]
        : fontFamily !== "sans-serif"
          ? fontFamily
          : "PingFang SC";
    const fontString = `${isBold}${fontSize}px "${fontName}", "PingFang SC", sans-serif`;

    try {
        await (document as any).fonts.load(`${fontSize}px "${fontName}"`);
        await (document as any).fonts.ready;
    } catch (e) {}

    ctx.font = fontString;
    ctx.imageSmoothingEnabled = true;
    ctx.textBaseline = "alphabetic"; // 对齐 Android Skia 基准线

    // ── 2. 文本清洗 (保留空格规则) ─────────────────────────
    const cleanParas = PREVIEW_PARAS.map(p =>
        p.trim().replace(/!/g, "！").replace(/\?/g, "？").replace(/,/g, "，")
    );
    const cleanTitle = PREVIEW_TITLE.trim();

    const toRgba = (hex: any): string => {
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

    // ── 3. 提取高度参数 (严格走 Android FontMetrics) ─────────
    const { ascent, textHeight } = getAndroidFontMetrics(fontSize);

    const letterSp = (cfg.letterSpacing ?? 0.04) * fontSize;
    const lineH = textHeight * ((cfg.lineSpacingExtra ?? 12) / 10);
    const paraSpacing = textHeight * ((cfg.paragraphSpacing ?? 5) / 10);

    const textColor = toRgba(cfg.textColor ?? "#ff43050a");
    const tipColor = toRgba(cfg.tipColor ?? "#ff4d3838");

    const pL = (cfg.paddingLeft ?? 23) * d;
    const pR = (cfg.paddingRight ?? 23) * d;
    const contentW = W - pL - pR;
    const indentW = ctx.measureText(cfg.paragraphIndent ?? "　　").width;

    // ── 4. 分词与断行引擎 (避头尾) ────────────────
    const segmenter =
        typeof Intl !== "undefined" && Intl.Segmenter
            ? new Intl.Segmenter("zh-CN", { granularity: "word" })
            : null;

    const measure = (str: string, currentFontSize: number = fontSize): number => {
        return ctx.measureText(str).width;
    };

    const layoutLines = (
        text: string,
        maxW: number,
        firstIndent: number,
        curFontSize: number = fontSize
    ): string[][] => {
        let tokens: string[] = [];
        if (segmenter) {
            const segments = Array.from(segmenter.segment(text)).map(s => s.segment);
            segments.forEach(t => {
                if (/^[\u4e00-\u9fa5]+$/.test(t)) tokens.push(...Array.from(t));
                else tokens.push(t);
            });
        } else {
            tokens = Array.from(text);
        }

        const lines: string[][] = [];
        let line: string[] = [];
        let currentW = 0;
        let isFirstLine = true;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const cw = measure(token, curFontSize);
            const limit = isFirstLine ? maxW - firstIndent : maxW;
            const expectedW = currentW + (line.length > 0 ? letterSp : 0) + cw;

            if (expectedW > limit + 0.1 && line.length > 0) {
                if (POST_PANC.has(token) && line.length > 1) {
                    const prevToken = line.pop()!;
                    lines.push([...line]);
                    line = [prevToken, token];
                    currentW = measure(prevToken, curFontSize) + letterSp + cw;
                } else if (PRE_PANC.has(line[line.length - 1]) && line.length > 1) {
                    const prevToken = line.pop()!;
                    lines.push([...line]);
                    line = [prevToken, token];
                    currentW = measure(prevToken, curFontSize) + letterSp + cw;
                } else {
                    lines.push([...line]);
                    line = [token];
                    currentW = cw;
                }
                isFirstLine = false;
            } else {
                line.push(token);
                currentW += (line.length > 1 ? letterSp : 0) + cw;
            }
        }
        if (line.length > 0) lines.push(line);
        return lines;
    };

    // ── 5. 两端对齐绘制 ─────────────────────────────
    const drawLine = (
        tokens: string[],
        x: number,
        y: number,
        align: "left" | "justify",
        targetWidth: number,
        curAscent: number,
        curFontSize: number
    ) => {
        if (!tokens.length) return;

        const ws = tokens.map(t => measure(t, curFontSize));
        const totalCharW = ws.reduce((a, b) => a + b, 0);
        const totalBaseSp = letterSp * (tokens.length - 1);

        let extraSpacePerGap = 0;
        let extraSpacePerSpaceChar = 0;

        if (align === "justify" && tokens.length > 1) {
            const remainingW = targetWidth - totalCharW - totalBaseSp;
            if (remainingW > 0) {
                const spaceCount = tokens.filter(t => t.trim() === "").length;
                if (spaceCount > 0) {
                    extraSpacePerSpaceChar = remainingW / spaceCount;
                } else {
                    extraSpacePerGap = remainingW / (tokens.length - 1);
                }
            }
        }

        let sx = x;
        const dy = Math.round(y + curAscent);

        for (let i = 0; i < tokens.length; i++) {
            ctx.fillText(tokens[i], sx, dy);
            const isSpace = tokens[i].trim() === "";
            sx += ws[i] + letterSp + extraSpacePerGap + (isSpace ? extraSpacePerSpaceChar : 0);
        }
    };

    ctx.save();

    // ── 6. 基础背景绘制 ───────────────────────────────────────────
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

    // ── 7. 坐标系绝对计算 ─────────────────────────────────────
    let currentY = 0;

    // [顶层] 状态栏
    const statusBarH = cfg.hideStatusBar ? 0 : 38 * d;
    if (!cfg.hideStatusBar) {
        const sFontSize = Math.round(12 * d);
        ctx.font = `600 ${sFontSize}px sans-serif`;
        ctx.fillStyle = tipColor;
        const sY = Math.round(statusBarH / 2 - sFontSize / 2);
        ctx.fillText("12:30", 16 * d, sY + sFontSize * 0.84);
        ctx.fillText("69%", W - 16 * d - ctx.measureText("69%").width, sY + sFontSize * 0.84);
    }
    currentY += statusBarH;

    // [顶层] 页眉
    let headerBottom = currentY;
    if (cfg.headerMode !== 2) {
        const hFontSize = 11 * d;
        ctx.font = `${hFontSize}px "${fontName}", "PingFang SC", sans-serif`;
        ctx.fillStyle = tipColor;

        const hY = currentY + (cfg.headerPaddingTop ?? 20) * d;
        const hBaseY = Math.round(hY + hFontSize * 0.86);

        ctx.fillText(getTipText(cfg.tipHeaderLeft ?? 1), (cfg.headerPaddingLeft ?? 22) * d, hBaseY);
        const midText = getTipText(cfg.tipHeaderMiddle ?? 0);
        ctx.fillText(midText, (W - ctx.measureText(midText).width) / 2, hBaseY);
        const rightText = getTipText(cfg.tipHeaderRight ?? 7);
        ctx.fillText(
            rightText,
            W - (cfg.headerPaddingRight ?? 22) * d - ctx.measureText(rightText).width,
            hBaseY
        );

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

    currentY = headerBottom + (cfg.paddingTop ?? 15) * d;

    // [内容层] 标题 (👑 修正了标题行距过大的问题)
    if (cfg.titleMode !== 2) {
        const tFontSize = fontSize + (cfg.titleSize ?? 4) * d;
        ctx.font = `bold ${tFontSize}px "${fontName}", "PingFang SC", sans-serif`;
        ctx.fillStyle = textColor;

        const { ascent: tAscent, textHeight: tTextHeight } = getAndroidFontMetrics(tFontSize);
        // Legado 中标题内部行距较为紧凑，不使用正文的 1.2 倍
        const tLineH = tTextHeight * 1.05;

        currentY += (cfg.titleTopSpacing ?? 8) * d;

        const tLines = layoutLines(cleanTitle, contentW, 0, tFontSize);
        for (const line of tLines) {
            drawLine(line, pL, currentY, "left", contentW, tAscent, tFontSize);
            currentY += tLineH;
        }
        // 关键：绝对增加标题底部空隙
        currentY += (cfg.titleBottomSpacing ?? 18) * d;
    }

    // [内容层] 正文
    ctx.font = fontString;
    ctx.fillStyle = textColor;

    const navH = cfg.hideNavigationBar ? 0 : 24 * d;
    const fFontSize = 11 * d;

    const footerSafeH =
        cfg.footerMode !== 1
            ? (cfg.footerPaddingBottom ?? 9) * d +
              fFontSize +
              (cfg.footerPaddingTop ?? 0) * d +
              navH
            : navH;

    // 👑 减去 paddingTop/Bottom，计算出精确的“正文可画高度区域”
    const maxY = H - footerSafeH - (cfg.paddingBottom ?? 15) * d;

    outer: for (const para of cleanParas) {
        if (currentY >= maxY) break;

        const lines = layoutLines(para, contentW, indentW, fontSize);

        for (let li = 0; li < lines.length; li++) {
            // 用真实 Android Box 高度判断是否超出屏幕
            if (currentY + textHeight > maxY) break outer;

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

    // [底层] 页脚
    if (cfg.footerMode !== 1) {
        ctx.font = `${fFontSize}px "${fontName}", "PingFang SC", sans-serif`;
        ctx.fillStyle = tipColor;

        const fY = H - navH - (cfg.footerPaddingBottom ?? 9) * d - fFontSize;
        const fBaseY = Math.round(fY + fFontSize * 0.86);
        const lineY = Math.floor(fY - (cfg.footerPaddingTop ?? 0) * d);

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
