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

// 👑 修正 5：优先取 actualBoundingBox，加入安全 fallback 防止发布环境报 0
const getRealFontMetrics = (
    ctx: CanvasRenderingContext2D,
    fontSize: number,
    sample = "国Agy"
) => {
    const m = ctx.measureText(sample);

    const ascent =
        m.actualBoundingBoxAscent ||
        m.fontBoundingBoxAscent ||
        fontSize * 0.8;

    const descent =
        m.actualBoundingBoxDescent ||
        m.fontBoundingBoxDescent ||
        fontSize * 0.2;

    return {
        ascent,
        descent,

        // Android Paint.getFontSpacing() 更接近这个值
        fontSpacing: Math.max(
            ascent + descent,
            fontSize * 1.15
        )
    };
};

// 👑 修正 3：动态获取字间距（不同字号应有不同的物理间距）
const getLetterSpacing = (fontSize: number, em: number) => {
    return em * fontSize * 0.85; // 0.85 为 Web 模拟 Android 的经验补偿系数
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

    const fontSize = (cfg.textSize ?? 22) * d;
    const isBold = cfg.textBold === 1 ? "bold " : "";
    const fontName = cfg.textFont
        ? cfg.textFont.split(".")[0]
        : fontFamily !== "sans-serif"
          ? fontFamily
          : "PingFang SC";
    const fontString = `${isBold}${fontSize}px "${fontName}", "PingFang SC", sans-serif`;

    // 👑 修正 6：彻底解决开发正常、发布不对的“字体未加载完”幽灵 Bug
    try {
        const fontFaceSet = (document as any).fonts;

        await fontFaceSet.load(
            `${fontSize}px "${fontName}"`,
            "国Agy"
        );

        await fontFaceSet.ready;

        // 等待真正进入渲染管线
        await new Promise(resolve =>
            requestAnimationFrame(() =>
                requestAnimationFrame(resolve)
            )
        );

    } catch (e) {}

    ctx.font = fontString;
    ctx.imageSmoothingEnabled = true;
    ctx.textBaseline = "alphabetic";

    // 强制进行一次测算，打通浏览器渲染管线
    ctx.measureText("国");

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

    // ── 1. 提取核心排版参数 ─────────────────────────────────
    ctx.font = fontString;
    const { ascent, descent, fontSpacing } = getRealFontMetrics(ctx, fontSize);

    const letterSpacingEm = cfg.letterSpacing ?? 0.04;
    const lineSpacingExtra = (cfg.lineSpacingExtra ?? 12) * d;
    const paraSpacing = (cfg.paragraphSpacing ?? 5) * d;

    // 👑 修正 2：修复行高公式，摒弃魔法数字 2*d
    const lineHeight = fontSpacing + lineSpacingExtra;

    const textColor = toRgba(cfg.textColor ?? "#ff43050a");
    const tipColor = toRgba(cfg.tipColor ?? "#ff4d3838");

    const pL = (cfg.paddingLeft ?? 23) * d;
    const pR = (cfg.paddingRight ?? 23) * d;
    const contentW = W - pL - pR;
    const paragraphIndent =
        cfg.paragraphIndent ?? "　　";

    const indentW =
        measure(paragraphIndent) +
        (paragraphIndent.length - 1) *
        getLetterSpacing(
            fontSize,
            letterSpacingEm
        );

    // ── 2. 分词与测量引擎 ─────────────────────────────────
    const segmenter =
        typeof Intl !== "undefined" && Intl.Segmenter
            ? new Intl.Segmenter("zh-CN", { granularity: "word" })
            : null;

    // 👑 修正 1：剥离 measure 的字距，只测字宽，防止累加误差爆炸
    const measure = (
        str: string,
        font?: string
    ): number => {

        const old = ctx.font;

        if (font) {
            ctx.font = font;
        }

        const width = ctx.measureText(str).width;

        ctx.font = old;

        return width;
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
        const currentLetterSp = getLetterSpacing(curFontSize, letterSpacingEm);

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const currentFont = `${isBold}${curFontSize}px "${fontName}", "PingFang SC", sans-serif`;
            const cw = measure(token, currentFont);
            const limit = isFirstLine ? maxW - firstIndent : maxW;
            const expectedW = currentW + (line.length > 0 ? currentLetterSp : 0) + cw;

            if (expectedW > limit + 0.1 && line.length > 0) {
                if (POST_PANC.has(token) && line.length > 1) {
                    const prevToken = line.pop()!;
                    lines.push([...line]);
                    line = [prevToken, token];
                    currentW = measure(prevToken, currentFont) + currentLetterSp + measure(token, currentFont);
                } else if (PRE_PANC.has(line[line.length - 1]) && line.length > 1) {
                    const prevToken = line.pop()!;
                    lines.push([...line]);
                    line = [prevToken, token];
                    currentW = measure(prevToken, currentFont) + currentLetterSp + measure(token, currentFont);
                } else {
                    lines.push([...line]);
                    line = [token];
                    currentW = cw;
                }
                isFirstLine = false;
            } else {
                line.push(token);
                currentW += (line.length > 1 ? currentLetterSp : 0) + cw;
            }
        }
        if (line.length > 0) lines.push(line);
        return lines;
    };

    // ── 3. 绘制函数 (严格像素级对齐) ───────────────────────────
    const drawLineBaseline = (
        tokens: string[],
        x: number,
        yBaseline: number,
        align: "left" | "justify",
        targetWidth: number,
        curFontSize: number
    ) => {
        if (!tokens.length) return;
        const currentLetterSp = getLetterSpacing(curFontSize, letterSpacingEm);

        const ws = tokens.map(t => measure(t));
        const totalCharW = ws.reduce((a, b) => a + b, 0);
        const totalBaseSp = currentLetterSp * (tokens.length - 1);

        let extraSpacePerGap = 0;
        let remainGap = 0;
        let extraSpacePerSpaceChar = 0;

        if (align === "justify" && tokens.length > 1) {
            const occupiedW = totalCharW + totalBaseSp;
            const remainingW = Math.max(0, targetWidth - occupiedW);

            if (remainingW > 0) {
                const spaceCount = tokens.filter(t => t.trim() === "").length;
                if (spaceCount > 0) {
                    // Android 默认行为：向下取整
                    extraSpacePerSpaceChar = Math.floor(remainingW / spaceCount);
                } else {
                    extraSpacePerGap = Math.floor(remainingW / (tokens.length - 1));
                    remainGap = remainingW % (tokens.length - 1);
                }
            }
        }

        let sx = x;
        const dy = Math.round(yBaseline);
        for (let i = 0; i < tokens.length; i++) {
            ctx.fillText(tokens[i], sx, dy);
            // 👑 修正 1：末尾字符不再无脑累加间距
            const isLast = i === tokens.length - 1;
            sx +=
                ws[i] +
                (isLast ? 0 : currentLetterSp) +
                extraSpacePerGap +
                (i < remainGap ? 1 : 0) +
                (tokens[i].trim() === "" ? extraSpacePerSpaceChar : 0);
        }
    };

    ctx.save();

    // ── 4. 基础绘制与坐标系初始化 ──────────────────────────────
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

    currentY = headerBottom + (cfg.paddingTop ?? 15) * d;

    // [标题区域]
    if (cfg.titleMode !== 2) {
        const tFontSize = fontSize + (cfg.titleSize ?? 4) * d;
        ctx.font = `bold ${tFontSize}px "${fontName}", "PingFang SC", sans-serif`;
        ctx.fillStyle = textColor;

        // 独立测算标题的 Metrics
        const {
            ascent: tAscent,
            descent: tDescent,
            fontSpacing: tFontSpacing
        } = getRealFontMetrics(ctx, tFontSize);

        currentY += (cfg.titleTopSpacing ?? 8) * d;
        let titleBaseline = currentY + tAscent;

        ctx.font = `bold ${tFontSize}px "${fontName}", "PingFang SC", sans-serif`;
        const tLines = layoutLines(cleanTitle, contentW, 0, tFontSize);
        for (let i = 0; i < tLines.length; i++) {
            drawLineBaseline(tLines[i], pL, titleBaseline, "left", contentW, tFontSize);
            if (i < tLines.length - 1) {
                // 标题内部多行，只加本身字距，无需 lineSpacingExtra
                titleBaseline += tFontSpacing;
            }
        }

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

    const maxY = H - footerSafeH - (cfg.paddingBottom ?? 15) * d;
    let bodyBaseline = currentY + ascent;

    outer: for (let pi = 0; pi < cleanParas.length; pi++) {
        const para = cleanParas[pi];
        const lines = layoutLines(para, contentW, indentW, fontSize);

        for (let li = 0; li < lines.length; li++) {
            // 👑 修正 4：越界判定严格使用 descent 属性
            if (bodyBaseline + descent > maxY) break outer;

            const isFirstLine = li === 0;
            const currentX = pL + (isFirstLine ? indentW : 0);
            const targetW = isFirstLine ? contentW - indentW : contentW;
            const justifyMode = li === lines.length - 1 ? "left" : "justify";

            drawLineBaseline(lines[li], currentX, bodyBaseline, justifyMode, targetW, fontSize);

            if (li < lines.length - 1) {
                // 正常行间距步进
                bodyBaseline += lineHeight;
            }
        }
        // 段落间距步进
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
