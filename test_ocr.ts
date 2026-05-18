import path from "path";
import fs from "fs-extra";
import { createWorker } from "tesseract.js";

async function test() {
  try {
    console.log("=== 开始本地 OCR 离线识别测试 ===");

    const imagePath = "C:\\Users\\admin\\.gemini\\antigravity\\brain\\ce217aa9-94e6-404a-ab59-9473b066df88\\ocr_test_screenshot_1779087151686.png";
    const tessdataPath = path.resolve("./assets/tessdata").replace(/\\/g, "/");
    await fs.ensureDir(tessdataPath);

    const chiSimPath = `${tessdataPath}/chi_sim.traineddata`;
    const engPath = `${tessdataPath}/eng.traineddata`;

    console.log("1. 检查并下载高精度模型...");
    if (!(await fs.pathExists(chiSimPath)) || (await fs.stat(chiSimPath)).size < 1000000) {
      console.log("- 正在从极速镜像下载 chi_sim.traineddata (fast 版本)...");
      const res = await fetch("https://ghproxy.net/https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/chi_sim.traineddata");
      if (!res.ok) throw new Error(`下载 chi_sim 失败: ${res.statusText}`);
      const buf = await res.arrayBuffer();
      await fs.writeFile(chiSimPath, Buffer.from(buf));
      console.log("- chi_sim.traineddata 下载并缓存成功！");
    } else {
      console.log("- chi_sim.traineddata 已存在且校验通过");
    }

    if (!(await fs.pathExists(engPath)) || (await fs.stat(engPath)).size < 1000000) {
      console.log("- 正在从极速镜像下载 eng.traineddata (fast 版本)...");
      const res = await fetch("https://ghproxy.net/https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata");
      if (!res.ok) throw new Error(`下载 eng 失败: ${res.statusText}`);
      const buf = await res.arrayBuffer();
      await fs.writeFile(engPath, Buffer.from(buf));
      console.log("- eng.traineddata 下载并缓存成功！");
    } else {
      console.log("- eng.traineddata 已存在且校验通过");
    }

    console.log("2. 初始化 Tesseract Worker...");
    const corePath = path.resolve("./assets/ocr_core").replace(/\\/g, "/");
    const worker = await createWorker("chi_sim+eng", 1, {
      langPath: tessdataPath,
      cachePath: tessdataPath,
      corePath: corePath,
      gzip: false,
    });

    console.log("3. 开始识别测试图片...", imagePath);
    const { data } = (await worker.recognize(imagePath)) as any;
    await worker.terminate();

    console.log("4. 识别完成！以下为识别出的文本内容：");
    console.log("-----------------------------------------");
    console.log(data.text);
    console.log("-----------------------------------------");

    console.log("5. 运行排版参数解析逻辑...");
    const lines = data.text.split("\n").map((t: string) => ({ text: t }));
    const newConfig: Record<string, any> = {};
    let currentSection = "main";

    lines.forEach((line: any) => {
      const text = line.text.replace(/\s+/g, "");
      console.log("DEBUG LINE TEXT:", JSON.stringify(line.text), "CLEANED:", JSON.stringify(text));
      if (text.includes("正文标题")) currentSection = "title";
      else if (text.includes("页眉")) currentSection = "header";
      else if (text.includes("页脚")) currentSection = "footer";
      else if (text.includes("正文") && !text.includes("标题")) currentSection = "main";

      const findValue = () => {
        const cleanText = text.replace(/[-+]/g, "");
        const matches = cleanText.match(/\d+(\.\d+)?/);
        return (matches && matches.length > 0) ? parseFloat(matches[0]) : null;
      };

      const val = findValue();
      if (val === null || isNaN(val)) return;

      const is = (key: string) => text.includes(key);

      if (currentSection === "main") {
        if (is("字号")) newConfig.textSize = val;
        else if (is("字距")) newConfig.letterSpacing = val;
        else if (is("行距") || is("行间")) newConfig.lineSpacingExtra = val;
        else if (is("段距") || is("段间") || is("段落")) newConfig.paragraphSpacing = val;
        else if (is("上边距")) newConfig.paddingTop = val;
        else if (is("下边距")) newConfig.paddingBottom = val;
        else if (is("左边距")) newConfig.paddingLeft = val;
        else if (is("右边距")) newConfig.paddingRight = val;
      } else if (currentSection === "title") {
        if (is("字号")) newConfig.titleSize = val;
        else if (is("上边距")) newConfig.titleTopSpacing = val;
        else if (is("下边距")) newConfig.titleBottomSpacing = val;
      } else if (currentSection === "header") {
        if (is("上边距")) newConfig.headerPaddingTop = val;
        else if (is("下边距")) newConfig.headerPaddingBottom = val;
        else if (is("左边距")) newConfig.headerPaddingLeft = val;
        else if (is("右边距")) newConfig.headerPaddingRight = val;
      } else if (currentSection === "footer") {
        if (is("上边距")) newConfig.footerPaddingTop = val;
        else if (is("下边距")) newConfig.footerPaddingBottom = val;
        else if (is("左边距")) newConfig.footerPaddingLeft = val;
        else if (is("右边距")) newConfig.footerPaddingRight = val;
      }
    });

    console.log("6. 成功提取出的排版参数：", JSON.stringify(newConfig, null, 2));
    console.log("=== 本地 OCR 测试圆满成功 ===");
  } catch (e) {
    console.error("!!! 测试失败 !!!", e);
  }
}

test();
