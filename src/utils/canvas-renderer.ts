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

    // 强制后备字体，尽量贴近 Android
    const fontStack =
        fontFamily && fontFamily !== "sans-serif"
            ? `"${fontFamily}", "PingFang SC", "Microsoft YaHei", sans-serif`
            : '"PingFang SC", "Microsoft YaHei", sans-serif';

    // ── 1. 文本净化：模拟 Legado 标点全角化 ──────────────────────
    const cleanParas = PREVIEW_PARAS.map(
        p =>
            p
                .trim()
                .replace(/!/g, "！")
                .replace(/\?/g, "？")
                .replace(/"(.*?)"/g, "“$1”")
                .replace(/-/g, "－") // 英文连字符转全角
    );

    // ── 2. 字体加载保障 ──────────────────────────────────────────
    try {
        if (fontFamily && fontFamily !== "sans-serif") {
            await (document as any).fonts.load(`${(cfg.textSize ?? 22) * d}px "${fontFamily}"`);
        }
        await (document as any).fonts.ready;
    } catch (_) {
        console.warn("字体加载失败，退回默认字体");
    }

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
    ctx.imageSmoothingEnabled = true; // 文字渲染建议开启平滑

    // ── 3. 背景层 ─────────────────────────────────────────────
    if (cfg.bgType === 2 && bgImage) {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = (cfg.bgAlpha ?? 100) / 100;
        ctx.drawImage(bgImage, 0, 0, W, H); // 强制拉伸铺满
        ctx.globalAlpha = 1;
    } else {
        ctx.fillStyle = toRgba(cfg.bgStr || "#FFFFFF");
        ctx.fillRect(0, 0, W, H);
    }

    // ── 4. 核心排版参数 (对齐 Legado 引擎) ────────────────────
    const textColor = toRgba(cfg.textColor ?? "#ff43050a");
    const tipColor = toRgba(cfg.tipColor ?? "#ff4d3838");
    const fontSize = (cfg.textSize ?? 22) * d;
    const letterSp = (cfg.letterSpacing ?? 0) * fontSize;

    ctx.font = `${cfg.textBold === 1 ? "bold " : ""}${fontSize}px ${fontStack}`;
    const ascent = fontSize * 0.84; // 统一基准线，丢弃不稳定的 measureText 基线

    // Legado 行高 = 字号 + 额外行距(dp)
    const lineH = fontSize + (cfg.lineSpacingExtra ?? 12) * d;
    const paraSpacing = (cfg.paragraphSpacing ?? 5) * d;

    const pL = (cfg.paddingLeft ?? 23) * d;
    const pR = (cfg.paddingRight ?? 23) * d;
    const contentW = W - pL - pR;

    // 严格锁定首行缩进宽度 (2倍字号)，不随全角空格实际宽度漂移
    const indentW =
        (cfg.paragraphIndent?.length ?? 0) > 0 ? cfg.paragraphIndent.length * fontSize : 0;

    // ── 5. 断行引擎 (完美模拟 Android 换行) ───────────────────
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
                // 忽略文字自带的全角缩进空格，统一由外部缩进接管
                if (isFirst && line.length === 0 && (c === "　" || c === " ")) {
                    i++;
                    continue;
                }

                const cw = measure(c);
                const sp = line.length > 0 ? letterSp : 0;

                if (w + sp + cw > limit + 0.5) {
                    // 0.5px 容差
                    // 避头尾规则
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

    // ── 6. 绘制单行引擎 (修复 Justify 撕裂) ───────────────────
    const drawLine = (
        text: string,
        x: number,
        y: number,
        align: "left" | "center" | "right" | "justify" = "left"
    ) => {
        const chars = Array.from(text);
        if (!chars.length) return;

        const ws = chars.map(c => measure(c));
        const totalCharW = ws.reduce((a, b) => a + b, 0);
        const totalBaseSp = letterSp * (chars.length - 1);

        let extraSp = 0;
        // 只有当需要两端对齐，且字符数>1，且不是最后一行时，才均匀拉伸
        if (align === "justify" && chars.length > 1) {
            const gap = contentW - totalCharW - totalBaseSp;
            // 限制最大拉伸阈值，防止字距夸张
            if (gap > 0 && gap < contentW * 0.4) {
                extraSp = gap / (chars.length - 1);
            }
        }

        const lineW = totalCharW + totalBaseSp + extraSp * (chars.length - 1);
        let sx =
            align === "center"
                ? Math.floor(x - lineW / 2)
                : align === "right"
                  ? Math.floor(x - lineW)
                  : Math.floor(x);
        const dy = Math.floor(y + ascent);

        for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i], sx, dy);
            sx += ws[i] + letterSp + extraSp;
        }
    };

    // ── 7. 全局坐标系布局 (严格按照 Legado 层级) ───────────────

    let currentY = 0;

    // [层级 1] 状态栏
    const statusBarH = cfg.hideStatusBar ? 0 : 24 * d;
    if (!cfg.hideStatusBar) {
        const sFontSize = Math.round(12 * d);
        ctx.font = `600 ${sFontSize}px sans-serif`;
        ctx.fillStyle = tipColor;
        const sY = statusBarH / 2 + sFontSize * 0.35; // 居中微调
        drawLine("12:30", 16 * d, statusBarH / 2 - sFontSize / 2, "left"); // Y传入顶部边界
        ctx.fillText("12:30", 16 * d, sY);
        ctx.fillText("69%", W - 16 * d - ctx.measureText("69%").width, sY);
    }
    currentY += statusBarH;

    // [层级 2] 页眉 Header
    if (cfg.headerMode !== 2) {
        const hFontSize = 11 * d;
        ctx.font = `${hFontSize}px ${fontStack}`;
        ctx.fillStyle = tipColor;

        // HeaderY 绝对定位
        const hY = currentY + (cfg.headerPaddingTop ?? 20) * d;

        ctx.fillText(getTipText(cfg.tipHeaderLeft ?? 1), pL, hY + hFontSize);
        const midText = getTipText(cfg.tipHeaderMiddle ?? 0);
        ctx.fillText(midText, (W - ctx.measureText(midText).width) / 2, hY + hFontSize);
        const rightText = getTipText(cfg.tipHeaderRight ?? 7);
        ctx.fillText(rightText, W - pR - ctx.measureText(rightText).width, hY + hFontSize);

        currentY = hY + hFontSize * 1.5 + (cfg.headerPaddingBottom ?? 1) * d;

        if (cfg.showHeaderLine) {
            ctx.save();
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.2;
            ctx.lineWidth = 0.5 * d;
            ctx.beginPath();
            ctx.moveTo(16 * d, currentY);
            ctx.lineTo(W - 16 * d, currentY);
            ctx.stroke();
            ctx.restore();
        }
    }

    // [层级 3] 页面内边距 (Padding Top) -> 正确解决标题贴顶
    currentY += (cfg.paddingTop ?? 15) * d;

    // [层级 4] 标题
    if (cfg.titleMode !== 2) {
        const tFontSize = fontSize + (cfg.titleSize ?? 3) * d;
        ctx.font = `bold ${tFontSize}px ${fontStack}`;
        ctx.fillStyle = textColor;
        const tLineH = tFontSize + (cfg.lineSpacingExtra ?? 12) * d;

        currentY += (cfg.titleTopSpacing ?? 8) * d;
        const tAlign = cfg.titleMode === 1 ? "center" : "left";

        // 此处需要复写 asc，因为标题字号变了
        const tAsc = tFontSize * 0.84;

        const tLines = layoutLines(PREVIEW_TITLE, contentW, 0);
        for (const line of tLines) {
            // 单独绘制标题
            const lW = ctx.measureText(line).width + letterSp * (line.length - 1);
            let sx = tAlign === "center" ? (W - lW) / 2 : pL;
            for (let i = 0; i < line.length; i++) {
                ctx.fillText(line[i], sx, Math.floor(currentY + tAsc));
                sx += ctx.measureText(line[i]).width + letterSp;
            }
            currentY += tLineH;
        }
        currentY += (cfg.titleBottomSpacing ?? 10) * d;
    }

    // [层级 5] 正文区域
    ctx.font = `${cfg.textBold === 1 ? "bold " : ""}${fontSize}px ${fontStack}`;
    ctx.fillStyle = textColor;

    // 页脚预留安全区
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

        const lines = layoutLines(para, contentW, indentW);

        for (let li = 0; li < lines.length; li++) {
            if (currentY + fontSize > maxY) break outer;

            const isLast = li === lines.length - 1;
            // 首行加上强制缩进量
            const lineX = pL + (li === 0 ? indentW : 0);

            drawLine(lines[li], lineX, currentY, isLast ? "left" : "justify");
            currentY += lineH;
        }
        // 段落间距附加值
        currentY += paraSpacing;
    }

    // [层级 6] 页脚 Footer (绝对定位于底部)
    if (cfg.footerMode !== 1) {
        ctx.font = `${fFontSize}px ${fontStack}`;
        ctx.fillStyle = tipColor;

        const fY = H - navH - (cfg.footerPaddingBottom ?? 9) * d - fFontSize;

        if (cfg.showFooterLine) {
            ctx.save();
            ctx.strokeStyle = tipColor;
            ctx.globalAlpha = 0.2;
            ctx.lineWidth = 0.5 * d;
            ctx.beginPath();
            ctx.moveTo(16 * d, Math.floor(fY - 8 * d));
            ctx.lineTo(W - 16 * d, Math.floor(fY - 8 * d));
            ctx.stroke();
            ctx.restore();
        }

        ctx.fillText(
            getTipText(cfg.tipFooterLeft ?? 6),
            (cfg.footerPaddingLeft ?? 20) * d,
            fY + fFontSize
        );
        const midFText = getTipText(cfg.tipFooterMiddle ?? 0);
        ctx.fillText(midFText, (W - ctx.measureText(midFText).width) / 2, fY + fFontSize);
        const rightFText = getTipText(cfg.tipFooterRight ?? 9);
        ctx.fillText(
            rightFText,
            W - (cfg.footerPaddingRight ?? 19) * d - ctx.measureText(rightFText).width,
            fY + fFontSize
        );
    }

    ctx.restore();
}
