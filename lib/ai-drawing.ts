import { getActiveConfig, chatWithAI } from "./ai";
import { aiProviders } from "./types";
import { uploadImage, generateFileName } from "./supabase-storage";
import { drawFunctionGraph, drawGeometry } from "./drawing-utils";

/**
 * AI 草图识别：上传手绘草图，AI 识别后生成标准图形
 * @param imageBase64 草图的 base64（不含前缀）
 * @returns 标准图形的图片 URL
 */
export async function sketchToImage(imageBase64: string): Promise<string> {
  const config = getActiveConfig();
  if (!config) throw new Error("请先配置 AI API");

  const prompt = `请分析这张手绘草图，识别其中的数学图形（如函数图像、几何图形、坐标系等），并以JSON格式返回绘图指令：

{
  "type": "function" | "geometry" | "coordinate",
  "description": "图形描述",
  "params": {}
}

如果是函数图像，params 格式：
{ "formula": "y = x^2", "xMin": -5, "xMax": 5, "yMin": -2, "yMax": 10 }

如果是几何图形，params 格式：
{ "shapes": [{ "type": "triangle" | "circle" | "rectangle", "points": [[x,y],...], "label": "ABC" }] }

如果是坐标系，params 格式：
{ "xLabel": "x", "yLabel": "y", "xRange": [-5, 5], "yRange": [-5, 5] }`;

  let result: any;

  // Qwen VL
  if (config.provider === "qwen") {
    const provider = aiProviders.find(p => p.value === "qwen");
    const baseUrl = config.baseUrl || provider?.defaultUrl || "";
    
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model?.includes("vl") ? config.model : "qwen-vl-plus",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
          ]
        }],
        max_tokens: 2048,
      }),
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "API 错误");
    result = data.choices[0].message.content;
  }
  // Gemini
  else if (config.provider === "gemini") {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(config.apiKey);
    const model = genAI.getGenerativeModel({ model: config.model || "gemini-2.0-flash" });

    const res = await model.generateContent([
      prompt,
      { inlineData: { data: imageBase64, mimeType: "image/jpeg" } },
    ]);
    result = (await res.response).text();
  }
  // DeepSeek
  else if (config.provider === "deepseek") {
    const provider = aiProviders.find(p => p.value === "deepseek");
    const baseUrl = config.baseUrl || provider?.defaultUrl || "";
    
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{
          role: "user",
          content: `${prompt}\n\n![image](data:image/jpeg;base64,${imageBase64})`
        }],
        max_tokens: 2048,
      }),
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "API 错误");
    result = data.choices[0].message.content;
  }
  else {
    throw new Error("当前 AI 厂商不支持草图识别，请使用 Qwen VL、Gemini 或 DeepSeek");
  }

  // 解析 AI 返回的 JSON
  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI 返回格式错误");
  
  const drawingData = JSON.parse(jsonMatch[0]);
  
  // 根据类型绘制图形
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 400;
  
  if (drawingData.type === "function" && drawingData.params?.formula) {
    drawFunctionGraph(canvas, drawingData.params);
  } else if (drawingData.type === "geometry" && drawingData.params?.shapes) {
    drawGeometry(canvas, drawingData.params);
  } else {
    // 默认绘制坐标系
    drawFunctionGraph(canvas, { formula: "y = 0", xMin: -5, xMax: 5, yMin: -5, yMax: 5 });
  }

  // 转为图片上传
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), "image/png");
  });
  
  const file = new File([blob], "sketch.png", { type: "image/png" });
  const path = generateFileName("sketch", "png");
  return uploadImage(file, path);
}

/**
 * AI 题干配图：根据题目描述生成配图
 * @param description 题目描述
 * @returns 配图 URL
 */
export async function generateProblemImage(description: string): Promise<string> {
  const config = getActiveConfig();
  if (!config) throw new Error("请先配置 AI API");

  const prompt = `你是一位数学图形专家。请根据以下数学题目描述，分析其中涉及的图形（函数图像、几何图形、坐标系等），并返回绘图指令：

题目描述：
${description}

请以JSON格式返回：
{
  "type": "function" | "geometry" | "coordinate",
  "description": "图形描述",
  "params": {}
}

如果是函数图像，params 格式：
{ "formula": "y = x^2", "xMin": -5, "xMax": 5, "yMin": -2, "yMax": 10, "showGrid": true }

如果是几何图形，params 格式：
{ "shapes": [{ "type": "triangle" | "circle" | "rectangle", "points": [[x,y],...], "label": "ABC" }] }

只返回JSON，不要其他内容。`;

  const result = await chatWithAI(prompt);
  
  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI 返回格式错误");
  
  const drawingData = JSON.parse(jsonMatch[0]);
  
  // 绘制图形
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 400;
  
  if (drawingData.type === "function" && drawingData.params?.formula) {
    drawFunctionGraph(canvas, drawingData.params);
  } else if (drawingData.type === "geometry" && drawingData.params?.shapes) {
    drawGeometry(canvas, drawingData.params);
  } else {
    drawFunctionGraph(canvas, { formula: "y = 0", xMin: -5, xMax: 5, yMin: -5, yMax: 5 });
  }

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), "image/png");
  });
  
  const file = new File([blob], "problem-figure.png", { type: "image/png" });
  const path = generateFileName("problem", "png");
  return uploadImage(file, path);
}
