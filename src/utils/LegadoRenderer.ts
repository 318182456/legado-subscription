const POST_PANC = new Set(`，。：？！、”’）》】)\]」}；;·…~～!?,.`.split(""));
const PRE_PANC = new Set(`“‘（《【(\[「{`.split(""));

export class LegadoRenderer {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    scale: number = 3;

    constructor(canvasElement: HTMLCanvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d')!;
    }

    /**
     * 严谨解析 Android 的颜色 #AARRGGBB，并可叠加独立的 Alpha 值 (0-100)
     */
    parseAndroidColor(colorStr: string | number, extraAlpha: number = 100): string {
        if (!colorStr) return `rgba(0, 0, 0, 0)`;

        let a = 1, r = 0, g = 0, b = 0;

        // 兼容十进制负数颜色 (Legado 源码中默认颜色有时是 -1)
        if (typeof colorStr === 'number' || !isNaN(Number(colorStr))) {
            let colorInt = Number(colorStr);
            if (colorInt === -1) {
                r = 255; g = 255; b = 255; a = 1;
            } else {
                // 处理 Android Int Color: (A << 24) | (R << 16) | (G << 8) | B
                // 转为无符号 32 位整数处理
                const uintColor = colorInt >>> 0;
                a = ((uintColor >> 24) & 0xFF) / 255;
                r = (uintColor >> 16) & 0xFF;
                g = (uintColor >> 8) & 0xFF;
                b = uintColor & 0xFF;
            }
        } else {
            let hex = (colorStr as string).replace('#', '');
            if (hex.length === 8) { // AARRGGBB
                a = parseInt(hex.substring(0, 2), 16) / 255;
                r = parseInt(hex.substring(2, 4), 16);
                g = parseInt(hex.substring(4, 6), 16);
                b = parseInt(hex.substring(6, 8), 16);
            } else if (hex.length === 6) { // RRGGBB
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
            } else if (hex.length === 3) { // RGB
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
            }
        }

        // 叠加额外透明度 (如 bgAlpha)
        a = a * (extraAlpha / 100);
        return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
    }

    /**
     * 核心排版：绘制两端对齐的文本 (复刻 Legado 的 Justify 特性)
     */
    drawJustifiedText(text: string, x: number, y: number, maxWidth: number, isLastLine: boolean, letterSpacing: number = 0) {
        const { ctx } = this;
        let words = text.split('');
        if (words.length === 0) return;

        // 如果是段落最后一行，或者是单个字符，采用左对齐
        if (isLastLine || words.length === 1) {
            ctx.fillText(text, x, y);
            return;
        }

        const metrics = ctx.measureText(text);
        const textWidth = metrics.width + (text.length - 1) * letterSpacing;
        
        // 计算需要补充的总空白宽度
        const extraSpace = maxWidth - textWidth;
        
        // 如果文字本来就超出了（理论上不应该），或者空白过大（比如只有两个字），放弃对齐直接左对齐
        if (extraSpace < 0 || extraSpace > maxWidth * 0.4) {
            ctx.fillText(text, x, y);
            return;
        }

        // 均摊到每个字元之间的间距
        const spacePerChar = extraSpace / (words.length - 1);
        
        let currentX = x;
        for (let i = 0; i < words.length; i++) {
            ctx.fillText(words[i], currentX, y);
            currentX += ctx.measureText(words[i]).width + letterSpacing + spacePerChar;
        }
    }

    drawStatusBar(theme: any) {
        const { ctx, canvas, scale } = this;
        if (theme.hideStatusBar) return;

        const h = 38 * scale;
        const fontSize = 12 * scale;
        ctx.font = `600 ${fontSize}px sans-serif`;
        
        const iconColor = theme.darkStatusIcon ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)';
        ctx.fillStyle = iconColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const padding = 16 * scale;
        const centerY = h / 2;

        // 时间
        ctx.fillText("16:10", padding, centerY);

        // 右侧图标 (模拟: Wifi, 信号, 电池)
        ctx.textAlign = 'right';
        const rightEdge = canvas.width - padding;
        
        // 模拟电池图标
        const batW = 18 * scale;
        const batH = 9 * scale;
        const batX = rightEdge - batW;
        const batY = centerY - batH / 2;
        ctx.lineWidth = 1 * scale;
        ctx.strokeStyle = iconColor;
        ctx.strokeRect(batX, batY, batW, batH);
        ctx.fillRect(batX + 2 * scale, batY + 2 * scale, (batW - 4 * scale) * 0.8, batH - 4 * scale);
        
        // 5G 文本
        ctx.font = `italic bold ${10 * scale}px sans-serif`;
        ctx.fillText("5G", batX - 6 * scale, centerY);

        // 信号 (4格)
        const sigX = batX - 22 * scale;
        for (let i = 1; i <= 4; i++) {
            const barH = i * 2 * scale;
            ctx.fillRect(sigX + (i-1) * 3 * scale, centerY + 4 * scale - barH, 2 * scale, barH);
        }
    }

    drawNavigationBar(theme: any) {
        const { ctx, canvas, scale } = this;
        if (theme.hideNavigationBar) return;

        const h = 24 * scale;
        const barW = 100 * scale;
        const barH = 4 * scale;
        const x = (canvas.width - barW) / 2;
        const y = canvas.height - (h / 2) - (barH / 2);

        ctx.fillStyle = theme.darkStatusIcon ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, barW, barH, 2 * scale);
        } else {
            ctx.rect(x, y, barW, barH);
        }
        ctx.fill();
    }

    async renderTheme(theme: any, options: { 
        bgImage?: HTMLImageElement | null, 
        getTipText: (type: number) => string,
        PREVIEW_TITLE: string,
        PREVIEW_PARAS: string[]
    }) {
        if (!theme) return;
        const { ctx, canvas } = this;
        const scale = this.scale;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // --- 1. 渲染背景 ---
        if (theme.bgType === 2 && options.bgImage) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = (theme.bgAlpha ?? 100) / 100;
            ctx.drawImage(options.bgImage, 0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1.0;
        } else {
            ctx.fillStyle = this.parseAndroidColor(theme.bgStr || '#FFFFFFFF', theme.bgAlpha ?? 100);
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // --- 绘制系统 UI ---
        this.drawStatusBar(theme);
        this.drawNavigationBar(theme);

        // --- 2. 映射排版属性 ---
        const pL = (theme.paddingLeft ?? 16) * scale;
        const pR = (theme.paddingRight ?? 16) * scale;
        const pT = (theme.paddingTop ?? 15) * scale;
        const pB = (theme.paddingBottom ?? 15) * scale;
        
        const textSize = (theme.textSize ?? 20) * scale;
        // 👑 修正：titleSize 是 textSize 的偏移量
        const titleSize = (theme.textSize + (theme.titleSize ?? 0)) * scale; 
        
        const lineSpacing = (theme.lineSpacingExtra ?? 12) * scale;
        const paragraphSpacing = (theme.paragraphSpacing ?? 2) * scale;
        const letterSpacing = (theme.letterSpacing ?? 0) * scale;

        const textColor = this.parseAndroidColor(theme.textColor ?? '#FF3E3D3B');
        const tipColor = this.parseAndroidColor(theme.tipColor ?? theme.textColor ?? '#803E3D3B', 60);

        const fontStack = theme.textFont ? `"${theme.textFont.split('/').pop().replace(/\.[^.]+$/, '')}", sans-serif` : 'sans-serif';
        const fontWeight = theme.textBold ? 'bold' : 'normal';

        // --- 3. 绘制 Header & Footer ---
        ctx.font = `normal ${11 * scale}px ${fontStack}`;
        ctx.fillStyle = tipColor;
        ctx.textBaseline = 'middle';
        
        const statusBarH = (theme.hideStatusBar ? 0 : 38) * scale;
        const navBarH = (theme.hideNavigationBar ? 0 : 24) * scale;

        // Header
        let headerBottom = statusBarH;
        if (theme.headerMode !== 2) {
            const hPaddingT = (theme.headerPaddingTop ?? 0) * scale;
            const hPaddingL = (theme.headerPaddingLeft ?? 24) * scale;
            const hPaddingR = (theme.headerPaddingRight ?? 24) * scale;
            const headerY = statusBarH + hPaddingT + 12 * scale;

            ctx.textAlign = 'left';
            ctx.fillText(options.getTipText(theme.tipHeaderLeft ?? 2), hPaddingL, headerY);
            ctx.textAlign = 'center';
            ctx.fillText(options.getTipText(theme.tipHeaderMiddle ?? 0), canvas.width / 2, headerY);
            ctx.textAlign = 'right';
            ctx.fillText(options.getTipText(theme.tipHeaderRight ?? 3), canvas.width - hPaddingR, headerY);
            
            headerBottom = headerY + 10 * scale;
            if (theme.showHeaderLine) {
                ctx.beginPath();
                ctx.moveTo(0, headerBottom); // 👑 修正：顶到头
                ctx.lineTo(canvas.width, headerBottom);
                ctx.strokeStyle = tipColor;
                ctx.lineWidth = 0.5 * scale;
                ctx.globalAlpha = 0.3;
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }
        }

        // Footer
        if (theme.footerMode !== 1) {
            const fPaddingB = (theme.footerPaddingBottom ?? 6) * scale;
            const fPaddingL = (theme.footerPaddingLeft ?? 24) * scale;
            const fPaddingR = (theme.footerPaddingRight ?? 24) * scale;
            const footerY = canvas.height - navBarH - fPaddingB - 12 * scale;

            ctx.textAlign = 'left';
            ctx.fillText(options.getTipText(theme.tipFooterLeft ?? 1), fPaddingL, footerY);
            ctx.textAlign = 'center';
            ctx.fillText(options.getTipText(theme.tipFooterMiddle ?? 0), canvas.width / 2, footerY);
            ctx.textAlign = 'right';
            ctx.fillText(options.getTipText(theme.tipFooterRight ?? 6), canvas.width - fPaddingR, footerY);

            if (theme.showFooterLine) {
                const lineY = footerY - 15 * scale;
                ctx.beginPath();
                ctx.moveTo(0, lineY); // 👑 修正：顶到头
                ctx.lineTo(canvas.width, lineY);
                ctx.strokeStyle = tipColor;
                ctx.lineWidth = 0.5 * scale;
                ctx.globalAlpha = 0.3;
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }
        }

        // --- 4. 绘制正文 ---
        const drawWidth = canvas.width - pL - pR;
        // 👑 修正起始 Y 坐标逻辑：Header 底部 + 正文上边距
        let currentY = headerBottom + pT;

        // > 绘制标题
        if (theme.titleMode !== 2) {
            currentY += (theme.titleTopSpacing ?? 8) * scale;
            ctx.font = `bold ${titleSize}px ${fontStack}`;
            ctx.fillStyle = textColor;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            
            const titleLines = this.layoutLines(options.PREVIEW_TITLE, drawWidth, 0, titleSize, fontStack, true, letterSpacing);
            titleLines.forEach(line => {
                ctx.fillText(line, pL, currentY);
                currentY += titleSize + lineSpacing; // 👑 修正：标题行高应包含 lineSpacing
            });
            
            // 👑 修正：titleBottomSpacing 应该在标题行高之后额外累加
            currentY += (theme.titleBottomSpacing ?? 10) * scale;
        }

        // > 绘制段落
        ctx.font = `${fontWeight} ${textSize}px ${fontStack}`;
        ctx.fillStyle = textColor;
        ctx.textBaseline = 'top';

        const indent = theme.paragraphIndent ?? "　　";
        const indentW = ctx.measureText(indent).width;

        options.PREVIEW_PARAS.forEach(paragraph => {
            const fullPara = indent + paragraph;
            const lines = this.layoutLines(fullPara, drawWidth, 0, textSize, fontStack, false, letterSpacing);
            
            lines.forEach((line, index) => {
                const isLastLine = index === lines.length - 1;
                this.drawJustifiedText(line, pL, currentY, drawWidth, isLastLine, letterSpacing);
                currentY += textSize + lineSpacing;
            });
            currentY += paragraphSpacing;
        });
    }

    /**
     * 增强版换行算法，集成避头尾规则
     */
    layoutLines(text: string, maxW: number, firstIndent: number, fontSize: number, fontStack: string, isBold: boolean, letterSpacing: number = 0): string[] {
        const { ctx } = this;
        ctx.font = `${isBold ? 'bold' : 'normal'} ${fontSize}px ${fontStack}`;
        
        const lines: string[] = [];
        let currentLine = '';
        
        const chars = Array.from(text);
        for (let i = 0; i < chars.length; i++) {
            const char = chars[i];
            const testLine = currentLine + char;
            const metrics = ctx.measureText(testLine);
            const testW = metrics.width + (testLine.length - 1) * letterSpacing;
            
            if (testW > maxW && currentLine.length > 0) {
                // 避头尾检查
                if (POST_PANC.has(char) && currentLine.length > 1) {
                    // 如果当前字是避头标点，把上一个字也带到下一行
                    const lastChar = currentLine.slice(-1);
                    currentLine = currentLine.slice(0, -1);
                    lines.push(currentLine);
                    currentLine = lastChar + char;
                } else if (PRE_PANC.has(currentLine.slice(-1)) && currentLine.length > 1) {
                    // 如果当前行最后一个字是避尾标点，把它带到下一行
                    const lastChar = currentLine.slice(-1);
                    currentLine = currentLine.slice(0, -1);
                    lines.push(currentLine);
                    currentLine = lastChar + char;
                } else {
                    lines.push(currentLine);
                    currentLine = char;
                }
            } else {
                currentLine = testLine;
            }
        }
        
        if (currentLine) lines.push(currentLine);
        return lines;
    }

    getThumbnail() {
        return this.canvas.toDataURL("image/jpeg", 0.9);
    }
}
