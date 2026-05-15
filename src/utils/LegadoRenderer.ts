import { drawTheme, RenderOptions } from './canvas-renderer';
import { getTipText, PREVIEW_TITLE, PREVIEW_PARAS } from './constants';

export class LegadoRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private scale: number = 3;

    constructor(canvasElement: HTMLCanvasElement) {
        this.canvas = canvasElement;
        const context = this.canvas.getContext('2d');
        if (!context) throw new Error("Could not get canvas context");
        this.ctx = context;
    }

    /**
     * 解析 Android 格式的颜色 (#AARRGGBB)
     */
    parseAndroidColor(colorStr: string | number, defaultAlpha: number = 1): string {
        if (typeof colorStr === 'number') return `rgba(0,0,0,${defaultAlpha})`;
        if (!colorStr || !colorStr.startsWith('#')) return colorStr as string;
        if (colorStr.length === 9) {
            const a = parseInt(colorStr.slice(1, 3), 16) / 255;
            const r = parseInt(colorStr.slice(3, 5), 16);
            const g = parseInt(colorStr.slice(5, 7), 16);
            const b = parseInt(colorStr.slice(7, 9), 16);
            return `rgba(${r},${g},${b},${a.toFixed(4)})`;
        }
        return colorStr;
    }

    /**
     * 渲染主题
     */
    async renderTheme(theme: any, options: Partial<RenderOptions> = {}) {
        if (!theme) return;

        // 设置 Canvas 尺寸
        const width = options.width || 360;
        const height = options.height || 800;
        const pixelRatio = options.pixelRatio || this.scale;

        this.canvas.width = width * pixelRatio;
        this.canvas.height = height * pixelRatio;

        await drawTheme(this.ctx, theme, {
            width,
            height,
            pixelRatio,
            fontFamily: options.fontFamily || 'sans-serif',
            bgImage: options.bgImage || null,
            getTipText: options.getTipText || getTipText,
            PREVIEW_TITLE: options.PREVIEW_TITLE || PREVIEW_TITLE,
            PREVIEW_PARAS: options.PREVIEW_PARAS || PREVIEW_PARAS
        });
    }

    /**
     * 提取高质量缩略图
     */
    getThumbnail(quality: number = 0.8): string {
        return this.canvas.toDataURL("image/jpeg", quality);
    }
}
