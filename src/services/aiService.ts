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

async function generateWithGemini(file: File, settings: any, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });
  const parts: any[] = [{ text: getPrompt(settings, file?.name || "unnamed_file") }];

  if (file && file.type.startsWith('image/')) {
    const base64Data = await fileToBase64(file);
    parts.push({
      inlineData: {
        data: base64Data.split(',')[1],
        mimeType: file.type
      }
    });
  }

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

  const result = JSON.parse(response.text || "{}");
  if (settings.optimizeKeywords) {
    result.keywords = optimizeKeywords(result.keywords, settings.maxKeywords || 50);
    result.keywordScore = calculateKeywordScore(result.keywords, settings.minKeywords || 20);
  }
  return result;
}

async function generateWithOpenAICompatible(file: File, settings: any, apiKey: string, provider: 'groq' | 'mistral') {
  const url = provider === 'groq' 
    ? "https://api.groq.com/openai/v1/chat/completions" 
    : "https://api.mistral.ai/v1/chat/completions";
  
  const model = provider === 'groq' ? "llama-3.3-70b-versatile" : "mistral-small-latest";

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

  const data = await response.json();
  const result = JSON.parse(data.choices[0].message.content);
  if (settings.optimizeKeywords) {
    result.keywords = optimizeKeywords(result.keywords, settings.maxKeywords || 50);
    result.keywordScore = calculateKeywordScore(result.keywords, settings.minKeywords || 20);
  }
  return result;
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

function getPrompt(settings: any, filename: string) {
  const { titleWords, descriptionLength, keywordCount, promptMode, customPrompt, metadataFor, titleChoice, minTitleWords, maxTitleWords, minDescriptionWords, maxDescriptionWords, minKeywords, maxKeywords } = settings;
  
  let basePrompt = `Analyze the ${metadataFor || 'file'} named "${filename}" and generate stock marketplace metadata.
  Return a JSON object with keys: "title", "description", "keywords", "category", "rating", "analysis".
  
  Analysis should include: theme, subject, objects (array), colors (array), concepts (array).
  
  Constraints:
  - Title: Generate ${titleChoice || 1} title options. Each title should be between ${minTitleWords || 5} and ${maxTitleWords || 15} words long. SEO optimized.
  - Description: Between ${minDescriptionWords || 15} and ${maxDescriptionWords || 30} words long, detailed and descriptive.
  - Keywords: Provide EXACTLY ${maxKeywords || 50} highly relevant keywords, comma separated. Do not provide fewer than ${maxKeywords || 50} keywords.
  - Category: Provide a single relevant category for stock marketplace (e.g., Nature, Technology, People, Business, etc.).
  - Rating: ALWAYS provide a rating of 5.
  
  IMPORTANT: 
  - DO NOT use irrelevant technical jargon like "UX", "UI", "Interface", "Web Design" unless the image specifically shows a user interface.
  - Focus on descriptive, visual, and conceptual keywords that describe the content of the image/video.
  - Ensure all words are spelled correctly and relevant to the visual content.
  `;

  if (promptMode === 'adobe') {
    basePrompt += "\nOptimize specifically for Adobe Stock guidelines (descriptive, no spam).";
  } else if (promptMode === 'shutterstock') {
    basePrompt += "\nOptimize specifically for Shutterstock guidelines (concise, high-relevance).";
  } else if (promptMode === 'custom') {
    basePrompt += `\nAdditional Instructions: ${customPrompt}`;
  }

  return basePrompt;
}
