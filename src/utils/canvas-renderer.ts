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

// 避头尾禁则库 (对齐原生)
const POST_PANC = new Set(`，。：？！、”’）》】)\]」}；;·…~～!?,.`.split(""));
const PRE_PANC = new Set(`“‘（《【(\[「{`.split(""));

// 👑 核心修正 1：获取真实的 FontMetrics，而不是魔法数字
const getRealFontMetrics = (ctx: CanvasRenderingContext2D, sample = "国Agy") => {
    const m = ctx.measureText(sample);
    // 优先使用 fontBoundingBox (最接近 Android Paint.FontMetrics)，回退到 actualBoundingBox
    const ascent = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || 0;
    const descent = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || 0;
    return {
        ascent,
        descent,
        textHeight: ascent + descent
    };
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

    // ── 1. 字体初始化 ──────────────────────────────────
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
    ctx.textBaseline = "alphabetic";

    const cleanParas = PREVIEW_PARAS.map(p =>
        p.trim().replace(/!/g, "！").replace(/\?/g, "？").replace(/,/g, "，")
    );
    const cleanTitle = PREVIEW_TITLE.trim();

    const toRgba = (hex: any): string => {
        if (typeof hex !== "string") return "rgba(0,0,0,1)";
        if (!hex.startsWith("#")) return hex;
        if (hex.length === 9) {
            const a = parseInt(hex.slice(1, 3), 16) / 255;
            return `rgba(${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${parseInt(hex.slice(7, 9), 16)},${a.toFixed(4)})`;
        }
        return hex;
    };

    // ── 2. 提取真实排版参数 ───────────────────────────────
    ctx.font = fontString;
    const { ascent, textHeight } = getRealFontMetrics(ctx);

    // 👑 核心修正 2：Android WebView/Canvas 对 setLetterSpacing() 的经验修正值 (0.85)
    const letterSpacingEm = cfg.letterSpacing ?? 0.04;
    const letterSp = letterSpacingEm * fontSize * 0.85;

    // 绝对物理像素追加
    const lineSpacing = (cfg.lineSpacingExtra ?? 12) * d;
    const paraSpacing = (cfg.paragraphSpacing ?? 5) * d;

    // 👑 核心修正 3：Android 实际的行高推算 (更接近 paint.getFontSpacing())
    const lineHeight = fontSize + lineSpacing + 2 * d;

    const textColor = toRgba(cfg.textColor ?? "#ff43050a");
    const tipColor = toRgba(cfg.tipColor ?? "#ff4d3838");

    const pL = (cfg.paddingLeft ?? 23) * d;
    const pR = (cfg.paddingRight ?? 23) * d;
    const contentW = W - pL - pR;
    const indentW = ctx.measureText(cfg.paragraphIndent ?? "　　").width;

    // ── 3. 分词与测量引擎 ────────────────────────────────
    const segmenter =
        typeof Intl !== "undefined" && Intl.Segmenter
            ? new Intl.Segmenter("zh-CN", { granularity: "word" })
            : null;

    // 👑 核心修正 4：修正测量函数，让宽度计算和绘制计算成为同一套
    const measure = (str: string, curFontSize: number = fontSize): number => {
        const width = ctx.measureText(str).width;
        if (str.length <= 1) return width;
        return width + (str.length - 1) * letterSp;
    };

    const layoutLines = (
        text: string,
        maxW: number,
        firstIndent: number,
        curFontSize: number = fontSize
    ): string[][] => {
        let tokens: string[] = [];
        if (segmenter) {
            Array.from(segmenter.segment(text)).forEach(s => {
                if (/^[\u4e00-\u9fa5]+$/.test(s.segment)) tokens.push(...Array.from(s.segment));
                else tokens.push(s.segment);
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

    // ── 4. 绘制函数 (附带像素级两端对齐) ─────────────────────
    const drawLineBaseline = (
        tokens: string[],
        x: number,
        yBaseline: number,
        align: "left" | "justify",
        targetWidth: number,
        curFontSize: number
    ) => {
        if (!tokens.length) return;
        const ws = tokens.map(t => measure(t, curFontSize));
        const totalCharW = ws.reduce((a, b) => a + b, 0);
        const totalBaseSp = letterSp * (tokens.length - 1);

        let extraSpacePerGap = 0;
        let extraSpacePerSpaceChar = 0;

        if (align === "justify" && tokens.length > 1) {
            // 👑 核心修正 5：防止负间距溢出
            const occupiedW = totalCharW + totalBaseSp;
            const remainingW = Math.max(0, targetWidth - occupiedW);

            if (remainingW > 0) {
                const spaceCount = tokens.filter(t => t.trim() === "").length;
                if (spaceCount > 0) {
                    extraSpacePerSpaceChar = Math.floor(remainingW / spaceCount);
                } else {
                    // 👑 核心修正 6：Math.floor 模拟 Android 像素对齐抛弃浮点
                    extraSpacePerGap = Math.floor(remainingW / (tokens.length - 1));
                }
            }
        }

        let sx = x;
        const dy = Math.round(yBaseline);
        for (let i = 0; i < tokens.length; i++) {
            ctx.fillText(tokens[i], sx, dy);
            sx +=
                ws[i] +
                letterSp +
                extraSpacePerGap +
                (tokens[i].trim() === "" ? extraSpacePerSpaceChar : 0);
        }
    };

    ctx.save();

    // ── 5. 背景绘制 ──────────────────────────────────────────
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

    // ── 6. 坐标系堆叠 ─────────────────────────────────────────
    let currentY = 0;

    // [状态栏]
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

    // [页眉]
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

    // 正文布局安全起点
    currentY = headerBottom + (cfg.paddingTop ?? 15) * d;

    // [标题区域]
    if (cfg.titleMode !== 2) {
        const tFontSize = fontSize + (cfg.titleSize ?? 4) * d;
        ctx.font = `bold ${tFontSize}px "${fontName}", "PingFang SC", sans-serif`;
        ctx.fillStyle = textColor;

        // 👑 标题单独测算 RealFontMetrics
        const { ascent: tAscent, textHeight: tTextHeight } = getRealFontMetrics(ctx);

        currentY += (cfg.titleTopSpacing ?? 8) * d;
        let titleBaseline = currentY + tAscent;

        const tLines = layoutLines(cleanTitle, contentW, 0, tFontSize);

        for (let i = 0; i < tLines.length; i++) {
            drawLineBaseline(tLines[i], pL, titleBaseline, "left", contentW, tFontSize);
            if (i < tLines.length - 1) {
                titleBaseline += tTextHeight;
            }
        }

        // 同步到底部边界
        currentY = titleBaseline + (tTextHeight - tAscent);
        currentY += (cfg.titleBottomSpacing ?? 18) * d;
    }

    // [正文区域]
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

    // 计算边界
    const maxY = H - footerSafeH - (cfg.paddingBottom ?? 15) * d;

    let bodyBaseline = currentY + ascent;

    outer: for (let pi = 0; pi < cleanParas.length; pi++) {
        const para = cleanParas[pi];
        const lines = layoutLines(para, contentW, indentW, fontSize);

        for (let li = 0; li < lines.length; li++) {
            // 用真实边界做越界判定
            if (bodyBaseline + (textHeight - ascent) > maxY) break outer;

            const isFirstLine = li === 0;
            const currentX = pL + (isFirstLine ? indentW : 0);
            const targetW = isFirstLine ? contentW - indentW : contentW;
            const justifyMode = li === lines.length - 1 ? "left" : "justify";

            drawLineBaseline(lines[li], currentX, bodyBaseline, justifyMode, targetW, fontSize);

            // 👑 核心修正 7：使用重建的 lineHeight
            if (li < lines.length - 1) {
                bodyBaseline += lineHeight;
            }
        }
        // 👑 核心修正 8：段落高度步进 = lineHeight + paraSpacing
        if (pi < cleanParas.length - 1) {
            bodyBaseline += lineHeight + paraSpacing;
        }
    }

    // [页脚区域]
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
