import { GoogleGenAI, Type } from "@google/genai";

export async function testApiConnection(provider: 'gemini' | 'groq' | 'mistral', apiKey: string): Promise<{ success: boolean; message?: string }> {
  try {
    // Basic prefix validation to prevent mixing keys
    if (provider === 'gemini' && !apiKey.startsWith('AIza')) {
      return { success: false, message: "Invalid Gemini API key format (should start with AIza)" };
    }
    if (provider === 'groq' && !apiKey.startsWith('gsk_')) {
      return { success: false, message: "Invalid Groq API key format (should start with gsk_)" };
    }

    if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey });
      await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "test"
      });
      return { success: true };
    } else if (provider === 'groq') {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: "test" }],
          max_tokens: 5
        })
      });
      if (response.ok) return { success: true };
      const data = await response.json();
      return { success: false, message: data.error?.message || "Connection failed" };
    } else if (provider === 'mistral') {
      const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "mistral-tiny",
          messages: [{ role: "user", content: "test" }],
          max_tokens: 5
        })
      });
      if (response.ok) return { success: true };
      const data = await response.json();
      return { success: false, message: data.error?.message || "Connection failed" };
    }
    return { success: false, message: "Unknown provider" };
  } catch (error: any) {
    console.error(`Connection test failed for ${provider}:`, error);
    return { success: false, message: error.message || "Network error" };
  }
}

export async function generateMetadata(
  file: File, 
  settings: any, 
  apiConfig: any
) {
  const providers = [
    { name: 'gemini', key: apiConfig.gemini || process.env.GEMINI_API_KEY },
    { name: 'groq', key: apiConfig.groq },
    { name: 'mistral', key: apiConfig.mistral }
  ].filter(p => p.key);

  if (providers.length === 0) {
    throw new Error("No API Keys configured.");
  }

  // Prioritize Gemini for images due to multimodal support
  const provider = (file && file.type.startsWith('image/')) 
    ? (providers.find(p => p.name === 'gemini') || providers[0])
    : providers[0];

  try {
    if (provider.name === 'gemini') {
      return await generateWithGemini(file, settings, provider.key);
    } else {
      return await generateWithOpenAICompatible(file, settings, provider.key, provider.name as any);
    }
  } catch (error) {
    console.error(`Error with ${provider.name}:`, error);
    throw error;
  }
}

const SUPPORTED_GEMINI_MIMES = [
  'image/png', 
  'image/jpeg', 
  'image/webp', 
  'image/heic', 
  'image/heif',
  'application/pdf'
];

async function extractEpsMetadata(file: File): Promise<string> {
  try {
    const buffer = await file.slice(0, 8192).arrayBuffer();
    const text = new TextDecoder().decode(buffer);
    const titleMatch = text.match(/%%Title:\s*(.*)/i);
    const creatorMatch = text.match(/%%Creator:\s*(.*)/i);
    const keywordsMatch = text.match(/%%Keywords:\s*(.*)/i);
    const subjectMatch = text.match(/%%Subject:\s*(.*)/i);
    
    let info = "";
    if (titleMatch) info += `Title Hint: ${titleMatch[1].trim()}\n`;
    if (creatorMatch) info += `Creator Hint: ${creatorMatch[1].trim()}\n`;
    if (subjectMatch) info += `Subject Hint: ${subjectMatch[1].trim()}\n`;
    if (keywordsMatch) info += `Keywords Hint: ${keywordsMatch[1].trim()}\n`;
    return info;
  } catch (e) {
    return "";
  }
}

async function generateWithGemini(file: File, settings: any, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });
  const parts: any[] = [{ text: getPrompt(settings, file?.name || "unnamed_file") }];

  const isSupportedImage = file && SUPPORTED_GEMINI_MIMES.includes(file.type);
  const isEps = file && (file.name.toLowerCase().endsWith('.eps') || file.type === 'application/postscript' || file.type === 'image/x-eps');

  if (isSupportedImage) {
    try {
      const resizedBase64 = await resizeImage(file, 1024, 1024); // Increased resolution for better analysis
      parts.push({
        inlineData: {
          data: resizedBase64.split(',')[1],
          mimeType: 'image/jpeg'
        }
      });
    } catch (e) {
      console.error("Error resizing image:", e);
      try {
        const base64Data = await fileToBase64(file);
        parts.push({
          inlineData: {
            data: base64Data.split(',')[1],
            mimeType: file.type
          }
        });
      } catch (err) {
        console.error("Error converting file to base64:", err);
      }
    }
  } else if (isEps) {
    const epsInfo = await extractEpsMetadata(file);
    parts[0].text += `\n\n[FILE CONTEXT]\nType: EPS Vector Illustration\n${epsInfo}\nNote: Visual preview unavailable for this EPS file. Use the filename and metadata hints to generate accurate stock metadata.`;
  } else {
    parts[0].text += `\n\n[FILE CONTEXT]\nType: ${file.type || 'Unknown'}\nNote: Visual preview unavailable. Generate metadata based on filename: "${file.name}".`;
  }

  console.log("Starting Gemini generation for:", file?.name);
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            keywords: { type: Type.STRING },
            category: { type: Type.STRING },
            rating: { type: Type.NUMBER },
            analysis: {
              type: Type.OBJECT,
              properties: {
                theme: { type: Type.STRING },
                subject: { type: Type.STRING },
                objects: { type: Type.ARRAY, items: { type: Type.STRING } },
                colors: { type: Type.ARRAY, items: { type: Type.STRING } },
                concepts: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            }
          },
          required: ["title", "description", "keywords", "category", "rating", "analysis"]
        }
      }
    });

    console.log("Gemini response received:", response);
    let result: any = {};
    try {
      const text = response.text || "{}";
      result = JSON.parse(repairJson(text));
    } catch (e) {
      console.error("Failed to parse Gemini JSON response:", e, response.text);
      throw new Error("Invalid JSON response from AI. Please retry.");
    }
    
    if (settings.optimizeKeywords) {
      result.keywords = optimizeKeywords(result.keywords, settings.maxKeywords || 50);
      result.keywordScore = calculateKeywordScore(result.keywords, settings.minKeywords || 20);
    }
    return result;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const msg = error.message || "Unknown Gemini Error";
    if (msg.includes("429")) throw new Error("Rate limit exceeded (429). Please wait a moment.");
    if (msg.includes("401")) throw new Error("Invalid API Key (401).");
    if (msg.includes("SAFETY")) throw new Error("Content blocked by safety filters.");
    throw new Error(msg);
  }
}

function repairJson(text: string): string {
  try {
    // Try to find the first { and last }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      return text.substring(firstBrace, lastBrace + 1);
    }
    return text;
  } catch (e) {
    return text;
  }
}

async function generateWithOpenAICompatible(file: File, settings: any, apiKey: string, provider: 'groq' | 'mistral') {
  const url = provider === 'groq' 
    ? "https://api.groq.com/openai/v1/chat/completions" 
    : "https://api.mistral.ai/v1/chat/completions";
  
  const model = provider === 'groq' ? "llama-3.3-70b-versatile" : "mistral-small-latest";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a stock metadata expert. Return ONLY valid JSON." },
          { role: "user", content: getPrompt(settings, file?.name || "unnamed_file") }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = errorData.error?.message || `API Error (${response.status})`;
      if (response.status === 429) throw new Error("Rate limit exceeded (429). Please wait.");
      if (response.status === 401) throw new Error("Invalid API Key (401).");
      throw new Error(msg);
    }

    const data = await response.json();
    if (!data.choices?.[0]?.message?.content) {
      throw new Error("Empty response from AI provider.");
    }

    const result = JSON.parse(repairJson(data.choices[0].message.content));
    
    if (settings.optimizeKeywords) {
      result.keywords = optimizeKeywords(result.keywords, settings.maxKeywords || 50);
      result.keywordScore = calculateKeywordScore(result.keywords, settings.minKeywords || 20);
    }
    return result;
  } catch (error: any) {
    console.error(`${provider} API Error:`, error);
    throw error;
  }
}

function optimizeKeywords(keywords: string, max: number): string {
  const list = keywords.split(',')
    .map(k => k.trim().toLowerCase())
    .filter((k, i, self) => k && self.indexOf(k) === i) // Unique
    .slice(0, max);
  
  return list.join(', ');
}

function calculateKeywordScore(keywords: string, min: number): number {
  const list = keywords.split(',').map(k => k.trim());
  const count = list.length;
  if (count < min / 2) return 30;
  if (count < min) return 60;
  if (count < (min + 10)) return 85;
  return 100;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}

async function resizeImage(file: File, maxWidth: number, maxHeight: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

function getPrompt(settings: any, filename: string) {
  const { 
    metadataFor, 
    titleChoice, 
    minTitleWords, 
    maxTitleWords, 
    minDescriptionWords, 
    maxDescriptionWords, 
    maxKeywords,
    singleWordKeywords,
    silhouette,
    transparentBackground,
    prohibitedWords,
    customPromptEnabled,
    customPrompt,
    savedKeywords
  } = settings;
  
  return `Act as a World-Class Stock Photography SEO Expert. 
  
  CRITICAL: You are provided with an image/file. 
  - If visual content is provided, you MUST prioritize it over the filename. 
  - If visual content is NOT provided (e.g., EPS/Vector files), you MUST use the filename and any provided metadata hints to generate the most professional and relevant stock metadata.
  - The filename "${filename}" is a key reference.

  Your goal is to generate 100% ACCURATE and SEO-OPTIMIZED metadata for this ${metadataFor || 'asset'}.

  OUTPUT JSON FORMAT:
  {
    "title": "Primary SEO Title",
    "description": "Detailed descriptive sentence",
    "keywords": "keyword1, keyword2, ...",
    "category": "Marketplace Category",
    "rating": 5,
    "analysis": {
      "theme": "Overall theme",
      "subject": "Main subject",
      "objects": ["object1", "object2"],
      "colors": ["color1", "color2"],
      "concepts": ["concept1", "concept2"]
    }
  }

  STRICT SEO & ACCURACY GUIDELINES:
  1. VISUAL ANALYSIS (If available):
     - Look closely at the image. Identify the main subject, background, lighting, and mood.
     - If the filename contradicts the image, IGNORE the filename and describe the image.
  
  2. TITLE: 
     - Must be a clear, literal description of what is VISUALLY PRESENT (or implied by filename). 
     - Place the most important keywords at the START.
     - Length: ${minTitleWords}-${maxTitleWords} words.
     - NO keyword stuffing. Use natural, searchable phrases.
  
  3. DESCRIPTION:
     - Write a complete, professional sentence describing the visual scene or concept.
     - Describe the subject, action, and environment in detail.
     - Length: ${minDescriptionWords}-${maxDescriptionWords} words.

  4. KEYWORDS:
     - Provide EXACTLY ${maxKeywords || 50} keywords.
     - ORDER BY RELEVANCE: Most critical visual/conceptual elements MUST come first.
     - Be specific (e.g., use "Golden Retriever" instead of just "dog").
     - Include conceptual keywords derived from the visual mood (e.g., "freedom", "success", "growth").
     ${singleWordKeywords ? "- Use ONLY single-word keywords." : "- Use a mix of specific single words and highly relevant 2-3 word phrases."}

  5. ACCURACY:
     - DO NOT hallucinate. Only describe what is actually VISIBLE or strongly implied.
     - If it's a photo, describe it as a photo. If it's an illustration, say so.
     ${silhouette ? "- This is a SILHOUETTE. Focus on shape, outline, and contrast." : ""}
     ${transparentBackground ? "- This is an ISOLATED asset on a TRANSPARENT/WHITE background. Include keywords like 'isolated', 'cut out', 'transparent'." : ""}
     ${prohibitedWords ? "- FORBIDDEN WORDS: AI, Generated, Fake, Mockup, Template, Stock, Download, High Quality." : ""}
  
  6. CONTEXT:
     ${savedKeywords?.length ? `- MANDATORY KEYWORDS TO INTEGRATE: ${savedKeywords.join(', ')}` : ""}
     ${customPromptEnabled && customPrompt ? `- USER SPECIFIC INSTRUCTIONS: ${customPrompt}` : ""}

  Marketplace Optimization: Ensure the metadata follows Adobe Stock and Shutterstock best practices for maximum discoverability.`;
}
