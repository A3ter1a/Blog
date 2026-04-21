import { GoogleGenerativeAI } from "@google/generative-ai";
import { APIConfig, aiProviders } from "@/lib/types";

export function getActiveConfig(): APIConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem("apiConfigs");
    if (!saved) return null;
    const configs: APIConfig[] = JSON.parse(saved);
    return configs.find(c => c.isActive) || configs[0] || null;
  } catch {
    return null;
  }
}

// AI Chat - supports multiple providers
export async function chatWithAI(
  message: string,
  context?: string
): Promise<string> {
  const config = getActiveConfig();
  
  // System prompt to ensure AI generates proper Markdown headings for TOC
  const systemPrompt = `你是一个专业的学术助手。在生成内容时，请遵循以下格式要求：

1. 使用标准的 Markdown 标题格式：
   - 一级标题：# 标题（用于主要章节）
   - 二级标题：## 标题（用于子章节）
   - 三级标题：### 标题（用于小节）
   
2. 标题应该简洁明了，便于生成目录导航

3. 数学公式使用 $$ 包裹的 LaTeX 语法

4. 内容结构清晰，层次分明`;

  // Fallback to env variable if no config
  if (!config) {
    const envApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (envApiKey) {
      const genAI = new GoogleGenerativeAI(envApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const prompt = context
        ? `${systemPrompt}\n\n以下是当前笔记内容：\n${context}\n\n用户问题：${message}`
        : `${systemPrompt}\n\n${message}`;
      const result = await model.generateContent(prompt);
      return result.response.text();
    }
    throw new Error("请先在设置中配置 AI API");
  }

  const prompt = context
    ? `${systemPrompt}\n\n以下是当前笔记内容：\n${context}\n\n用户问题：${message}`
    : `${systemPrompt}\n\n${message}`;

  if (config.provider === "gemini") {
    const genAI = new GoogleGenerativeAI(config.apiKey);
    const model = genAI.getGenerativeModel({ 
      model: config.model || "gemini-2.0-flash" 
    });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  if (config.provider === "claude") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model || "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2048,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Claude API 错误");
    return data.content[0].text;
  }

  // OpenAI-compatible APIs (OpenAI, DeepSeek, Qwen)
  const provider = aiProviders.find(p => p.value === config.provider);
  const baseUrl = config.baseUrl || provider?.defaultUrl || "";
  
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || provider?.defaultModel,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
    }),
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "API 错误");
  return data.choices[0].message.content;
}

// OCR - Extract structured problem data from image (supports Gemini, DeepSeek, Qwen)
export async function extractFromImage(
  imageBase64: string
): Promise<{
  question: string;
  explanation: string;
  answer: string;
  tags: string[];
  difficulty: "easy" | "medium" | "hard";
  type: "choice" | "fill" | "calculation" | "proof" | "proofEssay";
}> {
  const config = getActiveConfig();
  
  const ocrPrompt = `请分析这道数学题目的图片，严格按照以下JSON格式返回结果：

{
  "question": "纯题干内容，只包含题目描述，使用LaTeX公式语法",
  "explanation": "详细的解析步骤，包含推导过程，使用LaTeX公式语法",
  "answer": "最终答案（选择题填选项如A，填空题填具体数值，计算/证明题填最终结果）",
  "tags": ["知识点1", "知识点2", "知识点3"],
  "difficulty": "easy 或 medium 或 hard（根据题目复杂度判断）",
  "type": "choice 或 fill 或 calculation 或 proof 或 proofEssay（选择题/填空题/计算题/证明题/论述题）"
}

要求：
1. question 字段只包含题干，不要包含解析
2. 数学公式统一使用 $$ 包裹的 LaTeX 语法，如 $$f(x)$$
3. 如果有选项，在 question 中按 A. xxx B. xxx 格式列出
4. tags 从以下范围选择：微积分、导数、中值定理、极限、积分、级数、微分方程、线性代数、概率论、选择题、填空题、计算题、证明题
5. difficulty 根据解题步骤数量判断：1-2步=easy，3-5步=medium，5步以上=hard`;

  // DeepSeek support
  if (config?.provider === "deepseek") {
    const provider = aiProviders.find(p => p.value === "deepseek");
    const baseUrl = config.baseUrl || provider?.defaultUrl || "";
    
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || "deepseek-chat",
        messages: [{
          role: "user",
          content: `${ocrPrompt}\n\n![image](data:image/jpeg;base64,${imageBase64})`
        }],
        max_tokens: 4096,
      }),
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "API 错误");
    const text = data.choices[0].message.content;
    
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      throw new Error("Failed to parse JSON");
    } catch {
      return {
        question: text,
        explanation: "",
        answer: "",
        tags: ["OCR识别"],
        difficulty: "medium",
        type: "calculation",
      };
    }
  }

  // Qwen VL support
  if (config?.provider === "qwen") {
    const provider = aiProviders.find(p => p.value === "qwen");
    const baseUrl = config.baseUrl || provider?.defaultUrl || "";
    
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || "qwen-vl-plus",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: ocrPrompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            }
          ]
        }],
        max_tokens: 4096,
      }),
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "API 错误");
    const text = data.choices[0].message.content;
    
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      throw new Error("Failed to parse JSON");
    } catch {
      return {
        question: text,
        explanation: "",
        answer: "",
        tags: ["OCR识别"],
        difficulty: "medium",
        type: "calculation",
      };
    }
  }

  // Gemini (default)
  if (config?.provider === "gemini") {
    const genAI = new GoogleGenerativeAI(config.apiKey);
    const model = genAI.getGenerativeModel({ model: config.model || "gemini-2.0-flash" });

    const result = await model.generateContent([
      ocrPrompt,
      {
        inlineData: {
          data: imageBase64,
          mimeType: "image/jpeg",
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();
    
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      throw new Error("Failed to parse JSON");
    } catch {
      return {
        question: text,
        explanation: "",
        answer: "",
        tags: ["OCR识别"],
        difficulty: "medium",
        type: "calculation",
      };
    }
  }

  // Fallback to env variable (Gemini)
  const envApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (envApiKey) {
    const genAI = new GoogleGenerativeAI(envApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent([
      ocrPrompt,
      {
        inlineData: {
          data: imageBase64,
          mimeType: "image/jpeg",
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();
    
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      throw new Error("Failed to parse JSON");
    } catch {
      return {
        question: text,
        explanation: "",
        answer: "",
        tags: ["OCR识别"],
        difficulty: "medium",
        type: "calculation",
      };
    }
  }

  throw new Error("OCR 功能需要配置 Google Gemini API、DeepSeek API 或 Qwen VL API");
}
