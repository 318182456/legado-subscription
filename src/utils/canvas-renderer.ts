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

// 避头尾禁则库 (100% 对齐 Android ICU 规则)
const POST_PANC = new Set(`，。：？！、”’）》】)\]」}；;·…~～!?,.`.split(""));
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
    // 优先使用 JSON 中指定的字体，如果没有则回退
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

    // ── 2. 文本清洗 (修复英文空格丢失问题) ──────────────────────
    const cleanParas = PREVIEW_PARAS.map(p =>
        p
            .trim()
            // ⚠️ 注意：绝不能全局 replace 空格，否则英文单词和 "W! T! H!" 会粘连。
            // 只处理半角转全角符号
            .replace(/!/g, "！")
            .replace(/\?/g, "？")
            .replace(/,/g, "，")
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

    // ── 3. 解析 JSON 核心排版参数 (严格对齐 Legado 公式) ─────────
    // Android Paint FontMetrics 的经验值：textHeight ≈ textSize * 1.15
    const ascent = fontSize * 0.86;
    const textHeight = fontSize * 1.15;

    // JSON "letterSpacing": 0.04 -> Android 内部换算为 em (0.04 * textSize)
    const letterSp = (cfg.letterSpacing ?? 0.04) * fontSize;

    // JSON "lineSpacingExtra": 12 -> 对应倍率 1.2
    const lineH = textHeight * ((cfg.lineSpacingExtra ?? 12) / 10);
    // JSON "paragraphSpacing": 5 -> 对应倍率 0.5
    const paraSpacing = textHeight * ((cfg.paragraphSpacing ?? 5) / 10);

    const textColor = toRgba(cfg.textColor ?? "#ff43050a");
    const tipColor = toRgba(cfg.tipColor ?? "#ff4d3838");

    const pL = (cfg.paddingLeft ?? 23) * d;
    const pR = (cfg.paddingRight ?? 23) * d;
    const contentW = W - pL - pR;

    // JSON "paragraphIndent": "　　" -> 动态测量实际字体下的首行缩进宽度
    const indentW = ctx.measureText(cfg.paragraphIndent ?? "　　").width;

    // ── 4. 分词与断行引擎 (保留空格 + 避头尾禁则) ────────────────
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
            // 切割出完整的单词、符号、空格
            const segments = Array.from(segmenter.segment(text)).map(s => s.segment);
            segments.forEach(t => {
                // 中文字符串单独打散，保证单字换行；其他保留原样（保护英文/空格）
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
                // 触发换行，执行避头尾
                if (POST_PANC.has(token) && line.length > 1) {
                    // 后置标点（如逗号）不放行首，把上一行最后一个词拉到下一行
                    const prevToken = line.pop()!;
                    lines.push([...line]);
                    line = [prevToken, token];
                    currentW = measure(prevToken, curFontSize) + letterSp + cw;
                } else if (PRE_PANC.has(line[line.length - 1]) && line.length > 1) {
                    // 前置标点（如左括号）不放行尾，跟下一个词一起放到下一行
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

    // ── 5. 精准两端对齐 (优先拉伸空格，模拟 Android) ─────────────
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
                // Legado: 优先利用英文空格吸收多余宽度
                const spaceCount = tokens.filter(t => t.trim() === "").length;
                if (spaceCount > 0) {
                    extraSpacePerSpaceChar = remainingW / spaceCount;
                } else {
                    extraSpacePerGap = remainingW / (tokens.length - 1);
                }
            }
        }

        let sx = x;
        const dy = Math.round(y + curAscent); // 取整消除字体模糊

        for (let i = 0; i < tokens.length; i++) {
            ctx.fillText(tokens[i], sx, dy);
            const isSpace = tokens[i].trim() === "";
            sx += ws[i] + letterSp + extraSpacePerGap + (isSpace ? extraSpacePerSpaceChar : 0);
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

    // [顶层] 页眉 Header
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

    // 正文安全区起点：线底部 + paddingTop
    currentY = headerBottom + (cfg.paddingTop ?? 15) * d;

    // [内容层] 标题
    if (cfg.titleMode !== 2) {
        const tFontSize = fontSize + (cfg.titleSize ?? 4) * d;
        ctx.font = `bold ${tFontSize}px "${fontName}", "PingFang SC", sans-serif`;
        ctx.fillStyle = textColor;

        const tAscent = tFontSize * 0.86;
        const tTextHeight = tFontSize * 1.15;
        const tLineH = tTextHeight * ((cfg.lineSpacingExtra ?? 12) / 10);

        // 累加上方距 (titleTopSpacing: 8)
        currentY += (cfg.titleTopSpacing ?? 8) * d;

        const tLines = layoutLines(cleanTitle, contentW, 0, tFontSize);
        for (const line of tLines) {
            // 标题不执行两端对齐
            drawLine(line, pL, currentY, "left", contentW, tAscent, tFontSize);
            currentY += tLineH;
        }
        // 累加下方距 (titleBottomSpacing: 18)
        currentY += (cfg.titleBottomSpacing ?? 18) * d;
    }

    // [内容层] 正文渲染
    ctx.font = fontString;
    ctx.fillStyle = textColor;

    const navH = cfg.hideNavigationBar ? 0 : 24 * d;
    const fFontSize = 11 * d;

    // 页脚边界计算 (基于 JSON 数据)
    const footerSafeH =
        cfg.footerMode !== 1
            ? (cfg.footerPaddingBottom ?? 9) * d +
              fFontSize +
              (cfg.footerPaddingTop ?? 0) * d +
              navH
            : navH;
    const maxY = H - footerSafeH - (cfg.paddingBottom ?? 15) * d;

    outer: for (const para of cleanParas) {
        if (currentY >= maxY) break;

        const lines = layoutLines(para, contentW, indentW, fontSize);

        for (let li = 0; li < lines.length; li++) {
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
