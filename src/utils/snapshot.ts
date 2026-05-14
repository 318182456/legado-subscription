import { toPng } from 'html-to-image';
import { generatePreviewHTML } from './preview';
import { PREVIEW_TITLE, PREVIEW_PARAS } from './constants';
import { getTipText } from './preview';

/**
 * 高保真缩略图生成器
 * 使用 html-to-image 将真实的 HTML/CSS 渲染为图片。
 * 针对慢速网络和资源加载错误进行了深度优化。
 */
export async function generateHighFidelitySnapshot(
    config: any,
    options: {
        width?: number;
        height?: number;
        pixelRatio?: number;
        fontFamily?: string;
        fontBase64?: string;
        argbToCss: (argb: string) => string;
    }
): Promise<string> {
    const { 
        width = 360, 
        height = 780, 
        pixelRatio = 2, 
        fontFamily, 
        fontBase64,
        argbToCss 
    } = options;

    // 1. 创建离屏隐藏容器
    const container = document.createElement('div');
    container.id = 'snapshot-temp-container';
    Object.assign(container.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: `${width}px`,
        height: `${height}px`,
        opacity: '0',
        pointerEvents: 'none',
        zIndex: '-1000',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
    });
    
    // 2. 注入内容
    const content = document.createElement('div');
    Object.assign(content.style, {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: config.bgType === 0 ? argbToCss(config.bgStr || '#EEEEEE') : 'transparent'
    });
    
    if (config.bgType === 2 && config.bgStr && config.bgStr.length > 20) {
        content.style.backgroundImage = `url("${config.bgStr}")`;
        content.style.backgroundSize = 'cover';
        content.style.backgroundPosition = 'center';
    }

    content.innerHTML = generatePreviewHTML(
        config, 
        1, 
        getTipText, 
        argbToCss, 
        PREVIEW_TITLE, 
        PREVIEW_PARAS,
        fontFamily
    );
    
    container.appendChild(content);
    document.body.appendChild(container);

    // 3. 构建字体 CSS (直接注入，不依赖 html-to-image 的自动发现)
    let fontEmbedCSS = '';
    if (fontFamily && fontBase64 && fontBase64.startsWith('data:')) {
        fontEmbedCSS = `
            @font-face {
                font-family: "${fontFamily}";
                src: url("${fontBase64}") format("truetype");
            }
        `;
    }

    try {
        // 4. 等待字体就绪
        if ((document as any).fonts) {
            await (document as any).fonts.ready;
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        // 5. 截图 (带有一系列优化开关)
        const dataUrl = await toPng(container, {
            width,
            height,
            pixelRatio,
            fontEmbedCSS, // 手动注入 Base64 字体
            skipFonts: true, // 跳过扫描全局样式表，防止慢速网络阻塞
            cacheBust: true,
            filter: (node: any) => {
                // 仅允许截取容器内的节点，忽略外部干扰
                if (node.id === 'snapshot-temp-container') return true;
                if (container.contains(node)) return true;
                return false;
            }
        });

        return dataUrl;
    } catch (error) {
        console.error('[Snapshot] Failed to generate snapshot:', error);
        return '';
    } finally {
        if (container.parentNode) {
            document.body.removeChild(container);
        }
    }
}
