import { toPng } from 'html-to-image';
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
        pixelRatio = 2, 
        fontFamily, 
        fontBase64,
        argbToCss 
    } = options;

    // 1. 创建离屏隐藏容器
    const container = document.createElement('div');
    Object.assign(container.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: `${width}px`,
        height: `${height}px`,
        opacity: '0',
        pointerEvents: 'none',
        zIndex: '-1',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
    });
    
    // 2. 如果有自定义字体，注入 @font-face
    if (fontFamily && fontBase64 && fontBase64.startsWith('data:')) {
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
    Object.assign(content.style, {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: config.bgType === 0 ? argbToCss(config.bgStr || '#EEEEEE') : 'transparent'
    });
    
    // 背景图样式
    if (config.bgType === 2 && config.bgStr && config.bgStr.length > 10) {
        content.style.backgroundImage = `url("${config.bgStr}")`;
        content.style.backgroundSize = 'cover';
        content.style.backgroundPosition = 'center';
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
        // 5. 等待字体和渲染
        if ((document as any).fonts) {
            await (document as any).fonts.ready;
        }
        await new Promise(resolve => setTimeout(resolve, 150));

        // 6. 截图 (使用 PNG 以获得更高兼容性)
        const dataUrl = await toPng(container, {
            width,
            height,
            pixelRatio,
            skipAutoScale: true,
            cacheBust: true,
        });

        return dataUrl;
    } catch (error) {
        console.error('[Snapshot] Failed to generate snapshot:', error);
        // 如果截图彻底失败，返回空字符串而不是抛出异常，防止阻塞保存流程
        return '';
    } finally {
        // 7. 清理容器
        if (container.parentNode) {
            document.body.removeChild(container);
        }
    }
}
