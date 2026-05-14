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

// 避头尾禁则库
const POST_PANC = new Set(`，。：？！、”’）》】)\]」}；;·…~～!?,.`.split(""));
const PRE_PANC = new Set(`“‘（《【(\[「{`.split(""));

// 👑 核心引擎：模拟 Android 固定的字体度量比例 (Ascent / Descent)
const getAndroidFontMetrics = (fontSize: number) => {
    const ascent = fontSize * 0.86;
    const descent = fontSize * 0.28;
    return { ascent, descent, textHeight: ascent + descent };
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

    // ── 1. 字体与画布初始化 ──────────────────────────────────
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
    // ⚠️ 极其关键：必须使用 alphabetic 对齐，才能模拟 Android 基线
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

    // ── 2. 提取排版参数 (绝对 DP 像素) ───────────────────────
    const { ascent, descent, textHeight } = getAndroidFontMetrics(fontSize);

    const letterSp = (cfg.letterSpacing ?? 0.04) * fontSize;
    const lineSpacing = (cfg.lineSpacingExtra ?? 12) * d;
    const paraSpacing = (cfg.paragraphSpacing ?? 5) * d;

    const textColor = toRgba(cfg.textColor ?? "#ff43050a");
    const tipColor = toRgba(cfg.tipColor ?? "#ff4d3838");

    const pL = (cfg.paddingLeft ?? 23) * d;
    const pR = (cfg.paddingRight ?? 23) * d;
    const contentW = W - pL - pR;
    const indentW = ctx.measureText(cfg.paragraphIndent ?? "　　").width;

    // ── 3. 分词与断行 ────────────────────────────────────────
    const segmenter =
        typeof Intl !== "undefined" && Intl.Segmenter
            ? new Intl.Segmenter("zh-CN", { granularity: "word" })
            : null;
    const measure = (str: string, currentFontSize: number = fontSize): number =>
        ctx.measureText(str).width;

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

    // ── 4. 基于基线 (Baseline) 的绘制函数 ─────────────────────
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
            const remainingW = targetWidth - totalCharW - totalBaseSp;
            if (remainingW > 0) {
                const spaceCount = tokens.filter(t => t.trim() === "").length;
                if (spaceCount > 0) extraSpacePerSpaceChar = remainingW / spaceCount;
                else extraSpacePerGap = remainingW / (tokens.length - 1);
            }
        }

        let sx = x;
        // ⚠️ 取整防止抗锯齿模糊，直接绘制在基线上
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

    // ── 6. 坐标系堆叠 (👑 全新重写：100% 对齐 Android StaticLayout) ──
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

    // 👑 正文与标题布局起点
    currentY = headerBottom + (cfg.paddingTop ?? 15) * d;

    // [标题区域]
    if (cfg.titleMode !== 2) {
        const tFontSize = fontSize + (cfg.titleSize ?? 4) * d;
        ctx.font = `bold ${tFontSize}px "${fontName}", "PingFang SC", sans-serif`;
        ctx.fillStyle = textColor;

        const {
            ascent: tAscent,
            descent: tDescent,
            textHeight: tTextHeight
        } = getAndroidFontMetrics(tFontSize);

        currentY += (cfg.titleTopSpacing ?? 8) * d;

        // 锚定标题的第一行 Baseline
        let titleBaseline = currentY + tAscent;
        const tLines = layoutLines(cleanTitle, contentW, 0, tFontSize);

        for (let i = 0; i < tLines.length; i++) {
            drawLineBaseline(tLines[i], pL, titleBaseline, "left", contentW, tFontSize);
            if (i < tLines.length - 1) {
                // 标题内部多行，紧凑排列，无需 lineSpacingExtra
                titleBaseline += tTextHeight;
            }
        }

        // Android 真实逻辑：位移到标题的最底端（Descent边界），再加上 TitleBottomSpacing
        currentY = titleBaseline + tDescent;
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

    // 最大可用高度计算
    const maxY = H - footerSafeH - (cfg.paddingBottom ?? 15) * d;

    // 锚定正文的第一行 Baseline
    let bodyBaseline = currentY + ascent;

    outer: for (let pi = 0; pi < cleanParas.length; pi++) {
        const para = cleanParas[pi];
        const lines = layoutLines(para, contentW, indentW, fontSize);

        for (let li = 0; li < lines.length; li++) {
            // Android 真实越界判断：当前基线 + 底部溢出高度(descent) 是否盖住 paddingBottom
            if (bodyBaseline + descent > maxY) break outer;

            const isFirstLine = li === 0;
            const currentX = pL + (isFirstLine ? indentW : 0);
            const targetW = isFirstLine ? contentW - indentW : contentW;
            const justifyMode = li === lines.length - 1 ? "left" : "justify";

            drawLineBaseline(lines[li], currentX, bodyBaseline, justifyMode, targetW, fontSize);

            if (li < lines.length - 1) {
                // 物理文字高度 + 设置中增加的附加行距
                bodyBaseline += textHeight + lineSpacing;
            }
        }
        // 段落结束，不仅加上正常行距，再叠加上段距 (paraSpacing)
        if (pi < cleanParas.length - 1) {
            bodyBaseline += textHeight + lineSpacing + paraSpacing;
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
