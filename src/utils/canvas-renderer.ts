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

// 行首禁用字符（不能出现在行首）
const POST_PANC = new Set(`，。：？！、"'）》}】)>]」；;”’`.split(""));
// 行末禁用字符（不能出现在行末）
const PRE_PANC = new Set(`"（《【'(<[{「“‘`.split(""));
// 所有标点（两端对齐时不参与额外空间分配）
const ALL_PANC = new Set([...POST_PANC, ...PRE_PANC, "　", " ", "-"]);

/**
 * 核心渲染引擎 (V8.8)
 * 修正：
 * 1. 缩进严格按 fontSize 计算，解决缩进过宽问题。
 * 2. Justify 增加防过度拉伸阈值 (max 0.3em)。
 * 3. 行高和段距公式调整，更贴近 Android 行高倍率视觉。
 * 4. Y轴起始点逻辑重构，解决标题贴顶问题。
 * 5. 模拟 Legado 内置的正文标点净化排版。
 */
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

    const fontStack =
        fontFamily && fontFamily !== "sans-serif"
            ? `"${fontFamily}", "PingFang SC", sans-serif`
            : '"PingFang SC", sans-serif';

    // ── 文本净化 (模拟 Legado 阅读排版) ───────────────────────
    // 将半角标点转为全角，去除多余前导空格
    const cleanParas = PREVIEW_PARAS.map(
        p =>
            p
                .trim()
                .replace(/!/g, "！")
                .replace(/\?/g, "？")
                .replace(/"(.*?[^\\])"/g, "“$1”") // 简单引号转换
    );

    // ── 等待字体加载 ──────────────────────────────────────────
    try {
        if (fontFamily && fontFamily !== "sans-serif") {
            await (document as any).fonts.load(`${(cfg.textSize ?? 22) * d}px "${fontFamily}"`);
        }
        await (document as any).fonts.ready;
    } catch (_) {}

    const cache = new Map<string, number>();

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

    const measure = (char: string): number => {
        const k = ctx.font + char;
        if (cache.has(k)) return cache.get(k)!;
        const w = ctx.measureText(char).width;
        cache.set(k, w);
        return w;
    };

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // 背景绘制 (FIT_XY)
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

    // ── 排版参数 ─────────────────────────────────────────────
    const textColor = toRgba(cfg.textColor ?? "#ff43050a");
    const tipColor = toRgba(cfg.tipColor ?? "#ff4d3838");
    const fontSize = (cfg.textSize ?? 22) * d;
    const letterSp = (cfg.letterSpacing ?? 0) * fontSize;

    ctx.font = `${cfg.textBold === 1 ? "bold " : ""}${fontSize}px ${fontStack}`;
    const mm = ctx.measureText("国");
    const ascent = mm.actualBoundingBoxAscent ?? fontSize * 0.8;
    const descent = mm.actualBoundingBoxDescent ?? fontSize * 0.2;
    const measuredH = ascent + descent;

    // 视觉行高公式：Legado 的 extra 在 web 上约等于 0.6x 的 dp 累加效果
    const lineH = fontSize * 1.05 + (cfg.lineSpacingExtra ?? 12) * d * 0.6;
    const paraSpacing = (fontSize * (cfg.paragraphSpacing ?? 5)) / 10;

    const pL = (cfg.paddingLeft ?? 23) * d;
    const pR = (cfg.paddingRight ?? 23) * d;
    const contentW = W - pL - pR;

    // ⚠️修正1：首行缩进严格使用字号倍数（保证无论字体如何，空格都是正方形）
    const indentW =
        (cfg.paragraphIndent?.length ?? 0) > 0 ? fontSize * cfg.paragraphIndent.length : 0;

    // ── 断行引擎 ─────────────────────────────────────────────
    const layoutLines = (text: string, maxW: number, firstIndent: number): string[] => {
        const chars = Array.from(text);
        const lines: string[] = [];
        let i = 0,
            isFirst = true;

        while (i < chars.length) {
            const limit = isFirst ? maxW - firstIndent : maxW;
            const line: string[] = [];
            let w = 0;

            while (i < chars.length) {
                const c = chars[i];
                const cw = c === "　" ? fontSize : measure(c); // 全角空格强制等宽
                const sp = line.length > 0 ? letterSp : 0;
                if (w + sp + cw > limit + 0.5) {
                    if (POST_PANC.has(c) && line.length > 1) {
                        i--;
                        line.pop();
                    } else if (line.length > 1 && PRE_PANC.has(line[line.length - 1])) {
                        i--;
                        line.pop();
                    }
                    break;
                }
                line.push(c);
                w += sp + cw;
                i++;
            }
            if (line.length === 0 && i < chars.length) line.push(chars[i++]);
            lines.push(line.join(""));
            isFirst = false;
        }
        return lines;
    };

    // ── 绘制函数 ─────────────────────────────────────────────
    const drawLine = (
        text: string,
        x: number,
        y: number,
        align: "left" | "center" | "right" | "justify" = "left",
        asc: number = ascent
    ) => {
        const chars = Array.from(text);
        if (!chars.length) return;

        const ws = chars.map(c => (c === "　" ? fontSize : measure(c)));
        const totalW = ws.reduce((a, b) => a + b, 0);
        const totalSp = letterSp * (chars.length - 1);

        let extraSp = 0;
        if (align === "justify" && chars.length > 1) {
            const gap = contentW - totalW - totalSp;
            if (gap > 0) {
                const distributableGaps = chars.slice(0, -1).filter(c => !ALL_PANC.has(c)).length;
                if (distributableGaps > 0) {
                    extraSp = gap / distributableGaps;
                    // ⚠️修正2：限制最大拉伸宽度 (不得超过字号的 30%)，防止字间距被扯裂
                    extraSp = Math.min(extraSp, fontSize * 0.3);
                }
            }
        }

        const lineW =
            totalW +
            totalSp +
            chars.slice(0, -1).reduce((acc, c) => acc + (!ALL_PANC.has(c) ? extraSp : 0), 0);

        let sx =
            align === "center"
                ? Math.floor(x - lineW / 2)
                : align === "right"
                  ? Math.floor(x - lineW)
                  : Math.floor(x);
        const dy = Math.floor(y + asc);

        for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i], sx, dy);
            const gapSp = i < chars.length - 1 && !ALL_PANC.has(chars[i]) ? extraSp : 0;
            sx += ws[i] + letterSp + gapSp;
        }
    };

    // ── 绘制流 ────────────────────────────────────────────────

    const statusBarH = cfg.hideStatusBar ? 0 : 24 * d;

    // 1. 状态栏
    if (!cfg.hideStatusBar) {
        const sFontSize = Math.round(12 * d);
        ctx.font = `600 ${sFontSize}px sans-serif`;
        ctx.fillStyle = tipColor;
        const sAsc = ctx.measureText("0").actualBoundingBoxAscent ?? sFontSize * 0.8;
        const sY = (statusBarH - sAsc) / 2 + 4 * d;
        drawLine("12:30", 16 * d, sY, "left", sAsc);
        drawLine("69%", W - 16 * d, sY, "right", sAsc);
    }

    // 2. 页眉 (绝对定位)
    let headerBottomY = statusBarH;
    if (cfg.headerMode !== 2) {
        const hFontSize = 11 * d;
        ctx.font = `${hFontSize}px ${fontStack}`;
        ctx.fillStyle = tipColor;
        const hm = ctx.measureText("国");
        const hAsc = hm.actualBoundingBoxAscent ?? hFontSize * 0.8;
        const hH = hAsc + (hm.actualBoundingBoxDescent ?? hFontSize * 0.2);

        // HeaderY 绝对定位
        const hY = (cfg.headerPaddingTop ?? 20) * d;
        drawLine(
            getTipText(cfg.tipHeaderLeft ?? 1),
            (cfg.headerPaddingLeft ?? 22) * d,
            hY,
            "left",
            hAsc
        );
        drawLine(getTipText(cfg.tipHeaderMiddle ?? 0), W / 2, hY, "center", hAsc);
        drawLine(
            getTipText(cfg.tipHeaderRight ?? 7),
            W - (cfg.headerPaddingRight ?? 22) * d,
            hY,
            "right",
            hAsc
        );

        headerBottomY = hY + hH + (cfg.headerPaddingBottom ?? 1) * d;

        if (cfg.showHeaderLine) {
            ctx.save();
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 0.5 * d;
            ctx.beginPath();
            ctx.moveTo(16 * d, Math.floor(headerBottomY));
            ctx.lineTo(W - 16 * d, Math.floor(headerBottomY));
            ctx.stroke();
            ctx.restore();
        }
    }

    // ⚠️修正4：正文区起始Y坐标逻辑
    // 以 paddingTop 作为基线，如果 paddingTop 过小导致和 header 重叠，才强制下移
    const pT = (cfg.paddingTop ?? 15) * d;
    let curY = Math.max(headerBottomY + 10 * d, pT);

    // 3. 标题
    if (cfg.titleMode !== 2) {
        const tFontSize = ((cfg.textSize ?? 22) + (cfg.titleSize ?? 3)) * d;
        ctx.font = `bold ${tFontSize}px ${fontStack}`;
        ctx.fillStyle = textColor;
        const tm = ctx.measureText("国");
        const tAsc = tm.actualBoundingBoxAscent ?? tFontSize * 0.8;
        const tLineH = tFontSize * 1.1 + (cfg.lineSpacingExtra ?? 12) * d * 0.6;

        curY += (cfg.titleTopSpacing ?? 8) * d;
        const tAlign = cfg.titleMode === 1 ? "center" : "left";
        const tLines = layoutLines(PREVIEW_TITLE, contentW, 0);
        for (const line of tLines) {
            drawLine(line, tAlign === "center" ? W / 2 : pL, curY, tAlign, tAsc);
            curY += tLineH;
        }
        curY += (cfg.titleBottomSpacing ?? 10) * d;
    }

    // 4. 正文段落
    ctx.font = `${cfg.textBold === 1 ? "bold " : ""}${fontSize}px ${fontStack}`;
    ctx.fillStyle = textColor;
    const maxY = H - (cfg.footerPaddingBottom ?? 9) * d - 30 * d;

    // 使用净化后的段落 cleanParas
    outer: for (const para of cleanParas) {
        if (curY >= maxY) break;
        const lines = layoutLines(para, contentW, indentW);
        for (let li = 0; li < lines.length; li++) {
            if (curY + measuredH > maxY) break outer;
            const isLast = li === lines.length - 1;
            drawLine(lines[li], pL + (li === 0 ? indentW : 0), curY, isLast ? "left" : "justify");
            curY += lineH;
        }
        curY += paraSpacing;
    }

    // 5. 页脚
    if (cfg.footerMode !== 1) {
        const fFontSize = 11 * d;
        ctx.font = `${fFontSize}px ${fontStack}`;
        ctx.fillStyle = tipColor;
        const fAsc = ctx.measureText("国").actualBoundingBoxAscent ?? fFontSize * 0.8;

        const navH = cfg.hideNavigationBar ? 0 : 10 * d;
        const fY = H - navH - (cfg.footerPaddingBottom ?? 9) * d - fFontSize;

        if (cfg.showFooterLine) {
            ctx.save();
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 0.5 * d;
            ctx.beginPath();
            ctx.moveTo(16 * d, Math.floor(fY - 4 * d));
            ctx.lineTo(W - 16 * d, Math.floor(fY - 4 * d));
            ctx.stroke();
            ctx.restore();
        }

        drawLine(
            getTipText(cfg.tipFooterLeft ?? 6),
            (cfg.footerPaddingLeft ?? 20) * d,
            fY,
            "left",
            fAsc
        );
        drawLine(getTipText(cfg.tipFooterMiddle ?? 0), W / 2, fY, "center", fAsc);
        drawLine(
            getTipText(cfg.tipFooterRight ?? 9),
            W - (cfg.footerPaddingRight ?? 19) * d,
            fY,
            "right",
            fAsc
        );
    }

    ctx.restore();
}
