import { toJpeg } from 'html-to-image';
import { generatePreviewHTML } from './preview';
import { PREVIEW_TITLE, PREVIEW_PARAS } from './constants';
import { getTipText } from './preview';

/**
 * 高保真缩略图生成器
 * 使用 html-to-image 将真实的 HTML/CSS 渲染为图片，确保与预览 100% 一致。
 */
export async function generateHighFidelitySnapshot(
    config: any,
    options: {
        width?: number;
        height?: number;
        quality?: number;
        pixelRatio?: number;
        fontFamily?: string;
        fontBase64?: string; // 如果有 Base64 字体，注入它
        argbToCss: (argb: string) => string;
    }
): Promise<string> {
    const { 
        width = 360, 
        height = 780, 
        quality = 0.9, 
        pixelRatio = 2, 
        fontFamily, 
        fontBase64,
        argbToCss 
    } = options;

    // 1. 创建离屏隐藏容器
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    container.style.overflow = 'hidden';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.backgroundColor = 'white'; // 默认背景
    
    // 2. 如果有自定义字体，注入 @font-face
    if (fontFamily && fontBase64) {
        const style = document.createElement('style');
        style.innerHTML = `
            @font-face {
                font-family: "${fontFamily}";
                src: url("${fontBase64}") format("truetype");
            }
        `;
        container.appendChild(style);
    }

    // 3. 注入内容容器
    const content = document.createElement('div');
    content.className = 'snapshot-content';
    content.style.width = '100%';
    content.style.height = '100%';
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    
    // 背景图/颜色样式
    if (config.bgType === 2 && config.bgStr) {
        content.style.backgroundImage = `url("${config.bgStr}")`;
        content.style.backgroundSize = 'cover';
        content.style.backgroundPosition = 'center';
    } else {
        content.style.backgroundColor = config.bgType === 0 ? argbToCss(config.bgStr || '#EEEEEE') : 'transparent';
    }

    // 4. 生成 HTML
    // 注意：在这里我们使用 comp=1，因为我们是在原始分辨率下截屏
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

    try {
        // 5. 等待一小会儿确保渲染和资源就绪（特别是图片和字体）
        await new Promise(resolve => setTimeout(resolve, 300));

        // 6. 截图
        const dataUrl = await toJpeg(container, {
            width,
            height,
            quality,
            pixelRatio,
            backgroundColor: '#ffffff'
        });

        return dataUrl;
    } catch (error) {
        console.error('[Snapshot] Failed to generate snapshot:', error);
        throw error;
    } finally {
        // 7. 清理容器
        if (container.parentNode) {
            document.body.removeChild(container);
        }
    }
}
