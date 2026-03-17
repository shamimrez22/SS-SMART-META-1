export interface StockMetadata {
  id: string;
  filename: string;
  title: string;
  description: string;
  keywords: string;
  rating: number;
  status: 'pending' | 'generating' | 'completed' | 'error' | 'saving' | 'saved';
  fileType: string;
  previewUrl?: string;
  handle?: any; // FileSystemFileHandle
  analysis?: {
    theme: string;
    subject: string;
    objects: string[];
    colors: string[];
    concepts: string[];
  };
  category?: string;
  kwCount?: number;
  keywordScore?: number;
}

export interface ApiConfig {
  gemini: string[];
  groq: string[];
  mistral: string[];
}

export type ApiConnectionStatus = 'idle' | 'testing' | 'connected' | 'failed';

export interface ApiStatus {
  [key: string]: ApiConnectionStatus;
}

export interface GeneratorSettings {
  titleLength: [number, number];
  descriptionLength: [number, number];
  keywordsCount: number;
  autoDownload: boolean;
  promptMode: 'default' | 'adobe' | 'shutterstock' | 'custom';
  customPrompt: string;
  optimizeKeywords: boolean;
  minTitleWords: number;
  maxTitleWords: number;
  minDescriptionWords: number;
  maxDescriptionWords: number;
  minKeywords: number;
  maxKeywords: number;
  titleChoice: number;
  metadataFor: 'image' | 'video' | 'eps' | 'png' | 'all';
  concurrency: number;
  singleWordKeywords: boolean;
  silhouette: boolean;
  transparentBackground: boolean;
  prohibitedWords: boolean;
  customPromptEnabled: boolean;
  savedKeywords: string[];
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  files: StockMetadata[];
}
