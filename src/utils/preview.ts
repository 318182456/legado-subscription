import { PREVIEW_TITLE, PREVIEW_PARAS } from "./constants";

export function getTipText(value: number): string {
    if (value === 1) return "书名";
    if (value === 2) return "12:30";
    if (value === 3) return "100%";
    if (value === 4) return "章节名";
    if (value === 5) return "75%";
    if (value === 6) return "1/18";
    return "";
}

export function generatePreviewHTML(
    config: any,
    comp: number,
    getTipTextFn: (v: number) => string,
    argbToCssFn: (argb: string) => string,
    title: string,
    paras: string[]
): string {
    const bgColor = config.bgType === 0 ? argbToCssFn(config.bgStr || "#EEEEEE") : "transparent";
    const textColor = argbToCssFn(config.textColor || "#3E3D3B");
    const tipColor = argbToCssFn(config.tipColor || "#803E3D3B");

    let html = "";

    // Status Bar
    if (!config.hideStatusBar) {
        html +=
            '<div style="display:flex; justify-content:space-between; align-items:center; padding: ' +
            4 * comp +
            "px " +
            8 * comp +
            "px; font-size:" +
            10 * comp +
            "px; opacity:0.8; color:" +
            tipColor +
            '; flex-shrink: 0; font-weight: bold; position: relative; z-index: 50;">' +
            "<span>12:30</span>" +
            '<div style="display:flex; align-items:center; gap:' +
            4 * comp +
            'px;">' +
            "<span>5G</span>" +
            '<div style="width:' +
            14 * comp +
            "px; height:" +
            8 * comp +
            "px; border:1px solid currentColor; border-radius:" +
            2 * comp +
            'px; position:relative;">' +
            '<div style="position:absolute; top:1px; bottom:1px; left:1px; right:3px; background:currentColor; border-radius:' +
            1 * comp +
            'px;"></div>' +
            '<div style="position:absolute; top:50%; right:-' +
            2 * comp +
            "px; transform:translateY(-50%); width:" +
            2 * comp +
            "px; height:" +
            4 * comp +
            "px; background:currentColor; border-radius:0 " +
            1 * comp +
            "px " +
            1 * comp +
            'px 0;"></div>' +
            "</div></div></div>";
    }

    // Header
    if (config.headerMode !== 2) {
        const borderStr = config.showHeaderLine ? "border-bottom: 1px solid " + tipColor + ";" : "";
        html +=
            '<div style="display:flex; align-items:center; justify-content:space-between; flex-shrink: 0; opacity:0.8; ' +
            borderStr +
            " padding-left:" +
            (config.headerPaddingLeft || 0) * comp +
            "px; " +
            " padding-right:" +
            (config.headerPaddingRight || 0) * comp +
            "px; " +
            " padding-top:" +
            ((config.headerPaddingTop || 0) + (config.hideStatusBar ? 24 : 4)) * comp +
            "px; " +
            " padding-bottom:" +
            ((config.headerPaddingBottom || 0) + 4) * comp +
            "px; " +
            " font-size:" +
            10 * comp +
            "px; color:" +
            tipColor +
            ';">' +
            "<span>" +
            getTipTextFn(config.tipHeaderLeft ?? 2) +
            "</span>" +
            "<span>" +
            getTipTextFn(config.tipHeaderMiddle ?? 0) +
            "</span>" +
            "<span>" +
            getTipTextFn(config.tipHeaderRight ?? 3) +
            "</span>" +
            "</div>";
    }

    // Main Content
    html +=
        '<div style="flex:1; overflow:hidden; ' +
        " padding-left:" +
        (config.paddingLeft || 0) * comp +
        "px; " +
        " padding-right:" +
        (config.paddingRight || 0) * comp +
        "px; " +
        " padding-top:" +
        (config.paddingTop || 0) * comp +
        "px; " +
        " padding-bottom:" +
        (config.paddingBottom || 0) * comp +
        'px;">';

    if (config.titleMode !== 2) {
        const align = config.titleMode === 1 ? "center" : "left";
        html +=
            '<div style="font-weight:bold; text-align:' +
            align +
            "; " +
            " font-size:" +
            config.textSize * (1.05 + (config.titleSize || 0) * 0.1) * comp +
            "px; " +
            " margin-top:" +
            (config.titleTopSpacing || 0) * comp +
            "px; " +
            " margin-bottom:" +
            (config.titleBottomSpacing || 0) * comp +
            'px;">' +
            title +
            "</div>";
    }

    const lineHeight = (config.textSize + (config.lineSpacingExtra || 0)) / config.textSize;

    html += '<div style="opacity:0.9;">';
    for (let i = 0; i < paras.length; i++) {
        html +=
            '<p style="font-size:' +
            config.textSize * comp +
            "px; " +
            " line-height:" +
            lineHeight +
            "; " +
            " margin-bottom:" +
            (config.paragraphSpacing || 0) * comp +
            "px; " +
            " margin-top: 0; " +
            " text-indent:" +
            (config.paragraphIndent?.length || 0) +
            'em;">' +
            paras[i] +
            "</p>";
    }
    html += "</div></div>";

    // Footer
    if (config.footerMode !== 2) {
        const borderStr = config.showFooterLine ? "border-top: 1px solid " + tipColor + ";" : "";
        html +=
            '<div style="display:flex; align-items:center; justify-content:space-between; flex-shrink: 0; opacity:0.8; ' +
            borderStr +
            " padding-left:" +
            (config.footerPaddingLeft || 0) * comp +
            "px; " +
            " padding-right:" +
            (config.footerPaddingRight || 0) * comp +
            "px; " +
            " padding-top:" +
            ((config.footerPaddingTop || 0) + 4) * comp +
            "px; " +
            " padding-bottom:" +
            ((config.footerPaddingBottom || 0) + (config.hideNavigationBar ? 24 : 4)) * comp +
            "px; " +
            " font-size:" +
            10 * comp +
            "px; color:" +
            tipColor +
            ';">' +
            "<span>" +
            getTipTextFn(config.tipFooterLeft ?? 5) +
            "</span>" +
            "<span>" +
            getTipTextFn(config.tipFooterMiddle ?? 0) +
            "</span>" +
            "<span>" +
            getTipTextFn(config.tipFooterRight ?? 6) +
            "</span>" +
            "</div>";
    }

    // Navigation Bar
    if (!config.hideNavigationBar) {
        html +=
            '<div style="display:flex; justify-content:space-around; align-items:center; padding:' +
            8 * comp +
            "px 0 " +
            4 * comp +
            "px 0; opacity:0.8; color:" +
            tipColor +
            '; flex-shrink: 0; position: relative; z-index: 50;">' +
            '<div style="width:0; height:0; border-top:' +
            4 * comp +
            "px solid transparent; border-bottom:" +
            4 * comp +
            "px solid transparent; border-right:" +
            6 * comp +
            'px solid currentColor;"></div>' +
            '<div style="width:' +
            10 * comp +
            "px; height:" +
            10 * comp +
            'px; border-radius:50%; background:currentColor;"></div>' +
            '<div style="width:' +
            10 * comp +
            "px; height:" +
            10 * comp +
            "px; border: " +
            1.5 * comp +
            "px solid currentColor; border-radius:" +
            2 * comp +
            'px;"></div>' +
            "</div>";
    }

    return html;
}
