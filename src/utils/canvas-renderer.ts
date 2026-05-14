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

// 避头尾规则 (对齐 Android ICU 规则)
// 行首不可出现的标点 (后置标点)
const POST_PANC = new Set(`，。：？！、”’）》】)\]」}；;·…~～!?,.`.split(""));
// 行尾不可出现的标点 (前置标点)
const PRE_PANC = new Set(`“‘（《【(\[「{`.split(""));

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
    ctx.textBaseline = "alphabetic"; // 对齐 Android Skia 基准线

    // ── 2. 文本净化 (100% 对齐 Legado) ─────────────────────────
    const cleanParas = PREVIEW_PARAS.map(p =>
        p
            .trim()
            .replace(/ /g, "") // 清除原文空格，释放宽度
            .replace(/!/g, "！") // 半角转全角
            .replace(/\?/g, "？")
            .replace(/,/g, "，")
            .replace(/"(.*?)"/g, "“$1”")
    );

    const cleanTitle = PREVIEW_TITLE.trim().replace(/ /g, " ");

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

    // ── 3. 动态获取真实 FontMetrics (对齐 Android Paint) ───────
    // 使用 HTML5 TextMetrics API 获取真实 ascent 和 descent
    const metrics = ctx.measureText("国");
    const actualAscent = metrics.fontBoundingBoxAscent || fontSize * 0.86;
    const actualDescent = metrics.fontBoundingBoxDescent || fontSize * 0.29;
    const textHeight = actualAscent + actualDescent;
    const ascent = actualAscent;

    const textColor = toRgba(cfg.textColor ?? "#ff43050a");
    const tipColor = toRgba(cfg.tipColor ?? "#ff4d3838");

    const letterSp = (cfg.letterSpacing ?? 0) * fontSize;
    const lineH = textHeight * ((cfg.lineSpacingExtra ?? 12) / 10);
    const paraSpacing = textHeight * ((cfg.paragraphSpacing ?? 5) / 10);

    const pL = (cfg.paddingLeft ?? 23) * d;
    const pR = (cfg.paddingRight ?? 23) * d;
    const contentW = W - pL - pR;
    const indentW = (cfg.paragraphIndent?.length ?? 0) * fontSize; // 全角缩进等同于 fontSize

    // ── 4. 分词与断行引擎 (核心重构：防截断 + 避头尾) ───────────
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

        // 1. 切分为 Token，防止英文/数字被截断
        if (segmenter) {
            tokens = Array.from(segmenter.segment(text)).map(s => s.segment);
        } else {
            tokens = text.match(/[a-zA-Z0-9\p{Punctuation}]+|[\s\S]/gu) || Array.from(text);
        }

        // 将纯中文字符串打散，保证中文可以单字换行
        let finalTokens: string[] = [];
        tokens.forEach(t => {
            if (/^[\u4e00-\u9fa5]+$/.test(t) && t.length > 1) {
                finalTokens.push(...Array.from(t));
            } else {
                finalTokens.push(t);
            }
        });

        const lines: string[][] = [];
        let line: string[] = [];
        let currentW = 0;
        let isFirstLine = true;

        for (let i = 0; i < finalTokens.length; i++) {
            const token = finalTokens[i];
            const cw = measure(token, curFontSize);
            const limit = isFirstLine ? maxW - firstIndent : maxW;
            const expectedW = currentW + (line.length > 0 ? letterSp : 0) + cw;

            if (expectedW > limit + 0.5 && line.length > 0) {
                // 触发换行，检查禁则 (避头尾)
                if (POST_PANC.has(token) && line.length > 1) {
                    // 后置标点不能在行首 -> 将上一行最后一个词拉下来
                    const prevToken = line.pop()!;
                    lines.push([...line]);
                    line = [prevToken, token];
                    currentW = measure(prevToken, curFontSize) + letterSp + cw;
                } else if (PRE_PANC.has(line[line.length - 1]) && line.length > 1) {
                    // 前置标点不能在行尾 -> 将上一行最后一个词拉下来
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

    // ── 5. 精准两端对齐绘制 ─────────────────────────────────────
    const drawLine = (
        tokens: string[],
        x: number,
        y: number,
        align: "left" | "center" | "right" | "justify",
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

        // 原生 Android 逻辑：如果存在英文空格，优先拉伸空格；否则拉伸字符间隙
        if (align === "justify" && tokens.length > 1) {
            const remainingW = targetWidth - totalCharW - totalBaseSp;
            if (remainingW > 0) {
                const spaceCount = tokens.filter(t => t === " ").length;
                if (spaceCount > 0) {
                    extraSpacePerSpaceChar = remainingW / spaceCount;
                } else {
                    extraSpacePerGap = remainingW / (tokens.length - 1);
                }
            }
        }

        const actualLineW =
            totalCharW +
            totalBaseSp +
            extraSpacePerGap * (tokens.length - 1) +
            extraSpacePerSpaceChar * tokens.filter(t => t === " ").length;

        let sx =
            align === "center"
                ? x + (targetWidth - actualLineW) / 2
                : align === "right"
                  ? x + (targetWidth - actualLineW)
                  : x;

        const dy = Math.round(y + curAscent); // 取整，防止 Canvas 文字抗锯齿模糊

        for (let i = 0; i < tokens.length; i++) {
            ctx.fillText(tokens[i], sx, dy);
            sx +=
                ws[i] +
                letterSp +
                extraSpacePerGap +
                (tokens[i] === " " ? extraSpacePerSpaceChar : 0);
        }
    };

    ctx.save();

    // ── 6. 基础背景 ───────────────────────────────────────────
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

    // ── 7. 坐标系绝对堆叠绘制 ─────────────────────────────────
    let currentY = 0;

    // [顶层] 状态栏
    const statusBarH = cfg.hideStatusBar ? 0 : 38 * d;
    if (!cfg.hideStatusBar) {
        const sFontSize = Math.round(12 * d);
        ctx.font = `600 ${sFontSize}px sans-serif`;
        ctx.fillStyle = tipColor;
        const sY = Math.round(statusBarH / 2 - sFontSize / 2);

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
        ctx.font = `${hFontSize}px "${fontName}", "PingFang SC", sans-serif`;
        ctx.fillStyle = tipColor;

        const hY = currentY + (cfg.headerPaddingTop ?? 4) * d;
        const hBaseY = Math.round(hY + hFontSize * 0.86);

        ctx.fillText(getTipText(cfg.tipHeaderLeft ?? 1), (cfg.headerPaddingLeft ?? 24) * d, hBaseY);
        const midText = getTipText(cfg.tipHeaderMiddle ?? 0);
        ctx.fillText(midText, (W - ctx.measureText(midText).width) / 2, hBaseY);
        const rightText = getTipText(cfg.tipHeaderRight ?? 7);
        ctx.fillText(
            rightText,
            W - (cfg.headerPaddingRight ?? 24) * d - ctx.measureText(rightText).width,
            hBaseY
        );

        headerBottom = hY + hFontSize + (cfg.headerPaddingBottom ?? 4) * d;

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

    // 正文安全区起点
    currentY = headerBottom + (cfg.paddingTop ?? 15) * d;

    // [内容层] 标题
    if (cfg.titleMode !== 2) {
        const tFontSize = fontSize + (cfg.titleSize ?? 3) * d;
        ctx.font = `bold ${tFontSize}px "${fontName}", "PingFang SC", sans-serif`;
        ctx.fillStyle = textColor;

        // 动态测算标题的 Metrics
        const tMetrics = ctx.measureText("国");
        const tAscent = tMetrics.fontBoundingBoxAscent || tFontSize * 0.86;
        const tTextHeight = tAscent + (tMetrics.fontBoundingBoxDescent || tFontSize * 0.29);
        const tLineH = tTextHeight * ((cfg.lineSpacingExtra ?? 12) / 10);

        currentY += (cfg.titleTopSpacing ?? 8) * d;
        const tAlign = cfg.titleMode === 1 ? "center" : "left";

        const tLines = layoutLines(cleanTitle, contentW, 0, tFontSize);
        for (const line of tLines) {
            drawLine(line, pL, currentY, tAlign, contentW, tAscent, tFontSize);
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
            // 使用 textHeight 判断是否越界，而不是 fontSize
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

    // [底层] 页脚 Footer
    if (cfg.footerMode !== 1) {
        ctx.font = `${fFontSize}px "${fontName}", "PingFang SC", sans-serif`;
        ctx.fillStyle = tipColor;

        const fY = H - navH - (cfg.footerPaddingBottom ?? 9) * d - fFontSize;
        const fBaseY = Math.round(fY + fFontSize * 0.86);
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
