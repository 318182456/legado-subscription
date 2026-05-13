import { PREVIEW_TITLE, PREVIEW_PARAS } from "./constants";

export function getTipText(value: number): string {
    if (value === 0) return "";
    if (value === 1) return "第1353章 1369章会面...";
    if (value === 2) return "11:00";
    if (value === 3) return "■";
    if (value === 4) return "1";
    if (value === 5) return "60.5%";
    if (value === 6) return "1/13 60.5%";
    if (value === 7) return "影视世界当神探";
    if (value === 8) return "11:00 ■";
    if (value === 9) return "11:00 69%";
    if (value === 10) return "69%";
    if (value === 11) return "1/13";
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
            6 * comp +
            "px " +
            16 * comp +
            "px " +
            2 * comp +
            "px; font-size:" +
            11 * comp +
            "px; color:" +
            tipColor +
            '; flex-shrink: 0; font-family: sans-serif; position: relative; z-index: 50; letter-spacing: -0.2px;">' +
            '<span style="font-weight: 600;">12:30</span>' +
            '<div style="display:flex; align-items:center; gap:' +
            5 * comp +
            'px;">' +
            // Signal
            '<svg width="' + 14 * comp + '" height="' + 10 * comp + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 20V4"/></svg>' +
            // WiFi
            '<svg width="' + 14 * comp + '" height="' + 10 * comp + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1"/></svg>' +
            // Battery
            '<div style="width:' +
            18 * comp +
            "px; height:" +
            9 * comp +
            "px; border:1.5px solid currentColor; border-radius:" +
            2.5 * comp +
            'px; position:relative; opacity: 0.9; margin-left: ' + 2 * comp + 'px;">' +
            '<div style="position:absolute; top:1.5px; bottom:1.5px; left:1.5px; width: 70%; background:currentColor; border-radius:' +
            1 * comp +
            'px;"></div>' +
            '<div style="position:absolute; top:50%; right:-' +
            2.5 * comp +
            "px; transform:translateY(-50%); width:" +
            1.5 * comp +
            "px; height:" +
            3 * comp +
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
            ((config.headerPaddingTop || 0) + (config.hideStatusBar ? 24 : 2)) * comp +
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
            ((config.footerPaddingBottom || 0) + (config.hideNavigationBar ? 24 : 2)) * comp +
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

    // Navigation Bar (Modern Gesture Bar)
    if (!config.hideNavigationBar) {
        html +=
            '<div style="display:flex; justify-content:center; align-items:center; padding:' +
            10 * comp +
            "px 0 " +
            8 * comp +
            'px 0; flex-shrink: 0; position: relative; z-index: 50;">' +
            '<div style="width:' +
            40 * comp +
            "px; height:" +
            4 * comp +
            "px; background:" +
            tipColor +
            '; border-radius:' +
            2 * comp +
            'px; opacity: 0.5;"></div>' +
            "</div>";
    }


    return html;
}
