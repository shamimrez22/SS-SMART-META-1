import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FixedSizeList } from 'react-window';
import { 
  Play, 
  Pause, 
  Trash2, 
  Download, 
  History as HistoryIcon, 
  Zap,
  LayoutDashboard,
  Plus,
  CheckCircle2,
  AlertCircle,
  Upload,
  Settings,
  X,
  FileText,
  Video,
  Layers,
  FileImage,
  Clock,
  Database,
  Copy,
  Check,
  Loader2,
  Eye,
  Share2,
  MoreVertical,
  ChevronRight,
  ChevronLeft,
  ArrowUp,
  Info,
  FolderPlus,
  Square,
  FileSpreadsheet,
  FileJson,
  Key,
  Star,
  Tag,
  Sparkles,
  RefreshCw,
  RefreshCcw
} from 'lucide-react';
import Papa from 'papaparse';
import * as piexif from "piexifjs";
import { StockMetadata, ApiConfig, GeneratorSettings, ApiStatus, HistoryItem } from './types';
import { generateMetadata, testApiConnection } from './services/aiService';
import { cn } from './lib/utils';

const STORAGE_KEY = 'ai-metadata-pro-config';
const HISTORY_KEY = 'ai-metadata-pro-history';

export default function App() {
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    gemini: ['', '', '', '', ''],
    groq: ['', '', '', '', ''],
    mistral: ['', '', '', '', '']
  });

  const [activeKey, setActiveKey] = useState<{provider: keyof ApiConfig, index: number}>({
    provider: 'gemini',
    index: 0
  });

  const [settings, setSettings] = useState<GeneratorSettings>({
    titleLength: [30, 70],
    descriptionLength: [100, 200],
    keywordsCount: 30,
    autoDownload: false,
    promptMode: 'default',
    customPrompt: '',
    optimizeKeywords: true,
    minTitleWords: 5,
    maxTitleWords: 15,
    minDescriptionWords: 15,
    maxDescriptionWords: 30,
    minKeywords: 10,
    maxKeywords: 50,
    titleChoice: 1,
    metadataFor: 'all',
    concurrency: 10,
    singleWordKeywords: false,
    silhouette: false,
    transparentBackground: false,
    prohibitedWords: false,
    customPromptEnabled: false,
    autoGenerateOnAdd: true,
    savedKeywords: []
  });

  const [files, setFiles] = useState<StockMetadata[]>([]);
  const [fileObjects, setFileObjects] = useState<Record<string, File>>({});
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const stopRef = React.useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<'image' | 'vector' | 'video' | 'prompt'>('vector');
  const [theme, setTheme] = useState<'dark' | 'light' | 'blue'>('dark');
  const [genOptions, setGenOptions] = useState({
    description: true,
    filenameHint: true,
    autoEmbed: false,
    autoRetry: true,
    pngIsolated: true,
    refinePngBg: false,
    autoSave: false,
    autoExport: false,
    aiEnhance: false
  });

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [notification, setNotification] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

  // Optimized Copyable Cell Component
  const CopyableCell = useCallback(({ value, onChange, placeholder, colorClass, isGenerating, onCopy }: any) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
      if (!value) return;
      navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (onCopy) onCopy();
    };

    return (
      <div className="w-full h-full relative group/cell">
        <textarea 
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full h-full bg-secondary border border-border rounded p-2 text-[10px] resize-none focus:ring-1 focus:ring-blue-500 outline-none custom-scrollbar leading-tight placeholder:text-muted-foreground/30 uppercase font-bold transition-all",
            colorClass,
            isGenerating && "opacity-50 blur-[1px]"
          )}
          placeholder={placeholder}
        />
        {isGenerating && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <RefreshCw size={16} className="animate-spin text-blue-500 opacity-80" />
          </div>
        )}
        <button 
          onClick={handleCopy}
          className={cn(
            "absolute top-2 right-4 p-1 bg-muted border border-border rounded opacity-0 group-hover/cell:opacity-100 transition-all hover:bg-accent shadow-lg",
            copied && "opacity-100 bg-emerald-500/20 border-emerald-500/50"
          )}
          title="COPY"
        >
          {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} className="text-muted-foreground" />}
        </button>
      </div>
    );
  }, []);

  // Optimized Row Component for Virtualization
  const FileRow = ({ index, style, data }: any) => {
    const file = data[index];
    if (!file) return null;

    return (
      <div 
        style={style}
        className={cn(
          "flex flex-row w-full hover:bg-blue-500/5 transition-colors group items-center border-b border-border",
          file.status === 'generating' && "bg-blue-500/10"
        )}
      >
        <div className="w-[12%] px-3 py-1.5 border-r border-border flex items-center gap-2 overflow-hidden shrink-0 h-full">
          <div className="w-8 h-8 bg-muted rounded border border-border flex-shrink-0 overflow-hidden relative shadow-sm">
            {file.previewUrl ? (
              <img src={file.previewUrl} alt="" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <FileText size={14} />
              </div>
            )}
            {file.status === 'completed' && (
              <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 size={14} className="text-emerald-500" />
              </div>
            )}
            {file.status === 'generating' && (
              <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center">
                <RefreshCw size={14} className="animate-spin text-blue-500" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold text-muted-foreground truncate leading-none uppercase">{file.filename}</div>
            <div className="flex items-center gap-1 mt-1">
              <span className={cn(
                "text-[7px] font-black px-1 py-0.5 rounded uppercase tracking-widest border",
                file.status === 'completed' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                file.status === 'generating' ? "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse" :
                file.status === 'error' ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-muted text-muted-foreground border-border"
              )}>
                {file.status}
              </span>
              {(file.status === 'error' || file.status === 'completed') && (
                <button 
                  onClick={(e) => { e.stopPropagation(); regenerateSingleFile(file.id); }}
                  className={cn(
                    "text-[7px] font-black px-1 py-0.5 rounded uppercase tracking-widest transition-colors flex items-center gap-1 shadow-sm active:scale-95",
                    file.status === 'error' ? "bg-red-500 text-white hover:bg-red-400" : "bg-blue-500 text-white hover:bg-blue-400"
                  )}
                  title="RE-GENERATE METADATA"
                >
                  <RefreshCw size={8} />
                  {file.status === 'completed' ? 'RE-RUN' : 'RE-GENERATE'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="w-[15%] px-3 py-1.5 border-r border-border h-full shrink-0">
          <CopyableCell 
            value={file.title}
            onChange={(val: string) => updateFile(file.id, { title: val })}
            placeholder="TITLE..."
            colorClass="text-blue-400"
            isGenerating={file.status === 'generating'}
          />
        </div>

        <div className="w-[25%] px-3 py-1.5 border-r border-border h-full shrink-0 relative">
          <CopyableCell 
            value={file.keywords}
            onChange={(val: string) => updateFile(file.id, { keywords: val })}
            placeholder="KEYWORDS..."
            colorClass="text-orange-400"
            isGenerating={file.status === 'generating'}
          />
          {file.keywordScore && (
            <div className="absolute bottom-1 right-4 text-[6px] font-black text-blue-400 bg-blue-500/10 px-1 py-0.25 rounded border border-blue-500/20 z-10">
              {file.keywordScore}%
            </div>
          )}
        </div>

        <div className="w-[20%] px-3 py-1.5 border-r border-border h-full shrink-0">
          <CopyableCell 
            value={file.description}
            onChange={(val: string) => updateFile(file.id, { description: val })}
            placeholder="DESCRIPTION..."
            colorClass="text-emerald-400"
            isGenerating={file.status === 'generating'}
          />
        </div>

        <div className="w-[10%] px-3 py-1.5 border-r border-border h-full shrink-0">
          <CopyableCell 
            value={file.category}
            onChange={(val: string) => updateFile(file.id, { category: val })}
            placeholder="CATEGORY..."
            colorClass="text-purple-400"
            isGenerating={file.status === 'generating'}
          />
        </div>

        <div className="w-[8%] px-3 py-1.5 border-r border-border h-full shrink-0 flex items-center justify-center">
          <div className="text-[10px] font-black text-muted-foreground bg-muted px-2 py-1 rounded border border-border">
            {file.keywords ? file.keywords.split(',').length : 0}
          </div>
        </div>

        <div className="w-[10%] px-3 py-1.5 h-full shrink-0 flex items-center justify-center gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star 
              key={star} 
              size={10} 
              className={cn(
                "transition-all",
                star <= (file.rating || 0) ? "text-amber-400 fill-amber-400" : "text-muted-foreground/20"
              )} 
            />
          ))}
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setNotification({ message, type });
  };
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedExportSite, setSelectedExportSite] = useState('adobe');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [directoryHandle, setDirectoryHandle] = useState<any>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({});
  useEffect(() => {
    const savedConfig = localStorage.getItem(STORAGE_KEY);
    if (savedConfig) {
      const { apiConfig: savedApi, settings: savedSettings, activeKey: savedActiveKey } = JSON.parse(savedConfig);
      if (savedApi) setApiConfig(savedApi);
      if (savedSettings) setSettings(savedSettings);
      if (savedActiveKey) setActiveKey(savedActiveKey);
    }

    const savedHistory = localStorage.getItem(HISTORY_KEY);
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  // Save config to local storage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiConfig, settings, activeKey }));
  }, [apiConfig, settings, activeKey]);

  // Save history to local storage
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  // Handle Theme Switching
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark', 'blue');
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'blue') {
      root.classList.add('blue');
    }
  }, [theme]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleDirectorySelect = async () => {
    if (!('showDirectoryPicker' in window)) {
      showNotification("Your browser doesn't support folder selection. Please use Chrome or Edge.", 'error');
      return;
    }
    try {
      // @ts-ignore
      const handle = await window.showDirectoryPicker();
      setDirectoryHandle(handle);
      const newItems: StockMetadata[] = [];
      
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          const ext = file.name.split('.').pop()?.toLowerCase() || '';
          if (['png', 'eps', 'mp4', 'mov'].includes(ext)) {
            const id = Math.random().toString(36).substr(2, 9);
            setFileObjects(prev => ({ ...prev, [id]: file }));
            newItems.push({
              id,
              filename: file.name,
              title: '',
              description: '',
              keywords: '',
              rating: 5,
              status: 'pending',
              fileType: ext,
              previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
              handle: entry
            });
          }
        }
      }
      setFiles(prev => [...newItems, ...prev]);
    } catch (err) {
      console.error("Directory access denied or failed:", err);
    }
  };

  const handleFileSelectDirect = async () => {
    if (!('showOpenFilePicker' in window)) {
      showNotification("Your browser doesn't support direct file editing. Please use Chrome or Edge.", 'error');
      return;
    }
    try {
      // @ts-ignore
      const fileHandles = await window.showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: 'Stock Assets',
            accept: {
              'image/jpeg': ['.jpg', '.jpeg'],
              'image/png': ['.png'],
              'video/mp4': ['.mp4'],
              'video/quicktime': ['.mov'],
              'application/postscript': ['.eps']
            }
          }
        ]
      });

      const newItems: StockMetadata[] = [];
      for (const handle of fileHandles) {
        const file = await handle.getFile();
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const id = Math.random().toString(36).substr(2, 9);
        
        setFileObjects(prev => ({ ...prev, [id]: file }));
        newItems.push({
          id,
          filename: file.name,
          title: '',
          description: '',
          keywords: '',
          rating: 5,
          status: 'pending',
          fileType: ext,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
          handle: handle
        });
      }
      setFiles(prev => [...newItems, ...prev]);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error("File selection failed:", err);
      }
    }
  };

  const handleBulkEmbed = async () => {
    if (!('showDirectoryPicker' in window)) {
      showNotification("Your browser doesn't support folder access. Please use Chrome or Edge.", 'error');
      return;
    }

    try {
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker();
      setDirectoryHandle(dirHandle);
      
      const newItems: StockMetadata[] = [];
      const newFileObjects: Record<string, File> = {};

      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          const ext = file.name.split('.').pop()?.toLowerCase() || '';
          if (['png', 'eps', 'mp4', 'mov'].includes(ext)) {
            const id = Math.random().toString(36).substr(2, 9);
            newFileObjects[id] = file;
            newItems.push({
              id,
              filename: file.name,
              title: '',
              description: '',
              keywords: '',
              rating: 5,
              status: 'pending',
              fileType: ext,
              previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
              handle: entry
            });
          }
        }
      }

      if (newItems.length === 0) {
        showNotification("No supported images or EPS files found in this folder.", 'info');
        return;
      }

      setFileObjects(prev => ({ ...prev, ...newFileObjects }));
      setFiles(prev => [...newItems, ...prev]);
      
      // Auto-start generation
      setTimeout(() => {
        startGeneration();
      }, 500);

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error("Bulk embed failed:", err);
      }
    }
  };

  const handleEmbedAll = async () => {
    const completedFiles = files.filter(f => f.status === 'completed' && f.handle);
    if (completedFiles.length === 0) {
      showNotification("No completed files found to embed.", 'info');
      return;
    }

    // Skipping confirmation for now to avoid window.confirm
    setIsGenerating(true); // Reuse generating state to show loading
    let successCount = 0;
    let failCount = 0;

    for (const file of completedFiles) {
      try {
        await saveMetadataToLocalFile(file.id, file);
        successCount++;
      } catch (err) {
        console.error(`Failed to embed ${file.filename}:`, err);
        failCount++;
      }
    }

    setIsGenerating(false);
    showNotification(`Embedding complete! Success: ${successCount}, Failed: ${failCount}`, 'success');
  };

  const saveMetadataToLocalFile = async (id: string, metadata: Partial<StockMetadata>) => {
    const fileMetadata = files.find(f => f.id === id);
    if (!fileMetadata || !fileMetadata.handle) return;

    try {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'saving' } : f));
      const handle = fileMetadata.handle;
      const file = await handle.getFile();

      if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
        const reader = new FileReader();
        const promise = new Promise<void>((resolve, reject) => {
          reader.onload = async (e) => {
            try {
              const base64 = e.target?.result as string;
              const zeroth: any = {};
              zeroth[piexif.ImageIFD.ImageDescription] = metadata.description || fileMetadata.description;
              zeroth[piexif.ImageIFD.XPSubject] = metadata.title || fileMetadata.title;
              zeroth[piexif.ImageIFD.XPKeywords] = metadata.keywords || fileMetadata.keywords;
              zeroth[piexif.ImageIFD.Rating] = metadata.rating || fileMetadata.rating;
              
              const exifObj = { "0th": zeroth, "Exif": {}, "GPS": {} };
              const exifBytes = piexif.dump(exifObj);
              const newBase64 = piexif.insert(exifBytes, base64);
              
              // Convert base64 back to blob
              const res = await fetch(newBase64);
              const blob = await res.blob();
              
              const writable = await handle.createWritable();
              await writable.write(blob);
              await writable.close();
              resolve();
            } catch (err) { reject(err); }
          };
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        await promise;
      } else {
        // For EPS/Video, try to create XMP sidecar in the same directory if possible
        // Note: Browsers usually don't allow creating new files in the same folder 
        // unless a directory handle was selected. 
        // If we only have a file handle, we'll download the XMP as a fallback.
        
        const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${metadata.title || fileMetadata.title}</rdf:li></rdf:Alt></dc:title>
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${metadata.description || fileMetadata.description}</rdf:li></rdf:Alt></dc:description>
   <dc:subject><rdf:Bag>${(metadata.keywords || fileMetadata.keywords).split(',').map(k => `<rdf:li>${k.trim()}</rdf:li>`).join('')}</rdf:Bag></dc:subject>
   <xmp:Rating>${metadata.rating || fileMetadata.rating}</xmp:Rating>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

        if (directoryHandle) {
          const xmpHandle = await directoryHandle.getFileHandle(`${fileMetadata.filename}.xmp`, { create: true });
          const writable = await xmpHandle.createWritable();
          await writable.write(xmp);
          await writable.close();
        } else {
          // Fallback: Download XMP
          const xmpBlob = new Blob([xmp], { type: 'application/xml' });
          const xmpLink = document.createElement('a');
          xmpLink.href = URL.createObjectURL(xmpBlob);
          xmpLink.download = `${fileMetadata.filename}.xmp`;
          xmpLink.click();
        }
      }
      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'saved' } : f));
    } catch (err) {
      console.error("Failed to save to local file:", err);
      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error' } : f));
    }
  };

  const regenerateSingleFile = async (id: string) => {
    const fileMetadata = files.find(f => f.id === id);
    if (!fileMetadata || fileMetadata.status === 'generating') return;

    const currentKey = apiConfig[activeKey.provider][activeKey.index];
    if (!currentKey) {
      showNotification("Selected API Key is empty. Please configure it in settings.", 'error');
      return;
    }

    const actualFile = fileObjects[id];
    if (!actualFile) {
      showNotification("Original file data not found. Please re-upload.", 'error');
      return;
    }

    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'generating' } : f));

    try {
      const result = await generateMetadata(actualFile, settings, { [activeKey.provider]: currentKey });
      setFiles(prev => prev.map(f => {
        if (f.id === id) {
          const extension = f.filename.split('.').pop() || f.fileType;
          return { 
            ...f, 
            ...result, 
            filename: `${formatFilename(result.title)}.${extension}`,
            status: 'completed' 
          };
        }
        return f;
      }));
      showNotification(`Regenerated ${fileMetadata.filename}`, 'success');
    } catch (error) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error' } : f));
      showNotification(`Failed to regenerate ${fileMetadata.filename}`, 'error');
    }
  };

  const startGeneration = async () => {
    if (isGenerating) return;
    
    let pendingFiles = files.filter(f => f.status === 'pending');
    
    // If no pending files, but user clicked Generate, re-run everything
    if (pendingFiles.length === 0 && files.length > 0) {
      setFiles(prev => prev.map(f => ({ ...f, status: 'pending' })));
      // Wait for state update
      setTimeout(startGeneration, 100);
      return;
    }

    if (pendingFiles.length === 0) return;

    const currentKey = apiConfig[activeKey.provider][activeKey.index];
    if (!currentKey) {
      showNotification("Selected API Key is empty. Please configure it in settings.", 'error');
      return;
    }

    setIsGenerating(true);
    stopRef.current = false;
    setProgress({ current: 0, total: pendingFiles.length });

    // Parallel generation for maximum speed (concurrency from settings)
    const concurrency = settings.concurrency || 10; // Increased default concurrency
    const pending = [...pendingFiles];
    const active = new Set();
    
    const processNext = async () => {
      if (stopRef.current || pending.length === 0) return;
      
      const fileMetadata = pending.shift()!;
      active.add(fileMetadata.id);
      
      const actualFile = fileObjects[fileMetadata.id];
      setFiles(prev => prev.map(f => f.id === fileMetadata.id ? { ...f, status: 'generating' } : f));

      try {
        const result = await generateMetadata(actualFile, settings, { [activeKey.provider]: currentKey });
        
        setFiles(prev => prev.map(f => {
          if (f.id === fileMetadata.id) {
            const extension = f.filename.split('.').pop() || f.fileType;
            return { 
              ...f, 
              ...result, 
              filename: `${formatFilename(result.title)}.${extension}`,
              status: 'completed' 
            };
          }
          return f;
        }));

        setProgress(prev => ({ ...prev, current: prev.current + 1 }));
      } catch (error) {
        setFiles(prev => prev.map(f => f.id === fileMetadata.id ? { ...f, status: 'error' } : f));
      } finally {
        active.delete(fileMetadata.id);
        await processNext();
      }
    };

    // Start initial batch
    const initialBatch = Array.from({ length: Math.min(concurrency, pending.length) }, () => processNext());
    await Promise.all(initialBatch);

    // Save to history
    const newHistoryItem: HistoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      files: [...files]
    };
    setHistory(prev => [newHistoryItem, ...prev].slice(0, 50));

    setIsGenerating(false);
  };

  const handleTestConnection = async (provider: keyof ApiConfig, index: number) => {
    const key = apiConfig[provider][index];
    if (!key) return;
    
    setApiStatus(prev => ({ ...prev, [`${provider}-${index}`]: 'testing' }));
    const result = await testApiConnection(provider, key);
    
    if (result.success) {
      setApiStatus(prev => ({ ...prev, [`${provider}-${index}`]: 'connected' }));
      showNotification(`${provider.toUpperCase()} Connection Successful!`, 'success');
    } else {
      setApiStatus(prev => ({ ...prev, [`${provider}-${index}`]: 'failed' }));
      showNotification(result.message || `${provider.toUpperCase()} Connection Failed`, 'error');
    }
  };

  const handleExport = (format: string) => {
    const completedFiles = files.filter(f => f.status === 'completed');
    if (completedFiles.length === 0) return;

    let content = '';
    let mimeType = 'text/csv;charset=utf-8;';
    let extension = 'csv';
    let filenamePrefix = 'metadata_export';

    if (format === 'json') {
      content = JSON.stringify(completedFiles, null, 2);
      mimeType = 'application/json;charset=utf-8;';
      extension = 'json';
    } else if (format === 'txt') {
      content = completedFiles.map(f => 
        `FILE: ${f.filename}\nTITLE: ${f.title}\nDESC: ${f.description}\nKEYWORDS: ${f.keywords}\n\n`
      ).join('---\n');
      mimeType = 'text/plain;charset=utf-8;';
      extension = 'txt';
    } else {
      // CSV Formats
      let data: any[] = [];
      filenamePrefix = format;

      switch (format) {
        case 'adobe':
          data = completedFiles.map(f => ({
            Filename: f.filename,
            Title: f.title,
            Description: f.description,
            Keywords: f.keywords,
            Category: f.category || ''
          }));
          break;
        case 'shutterstock':
          data = completedFiles.map(f => ({
            Filename: f.filename,
            Title: f.title,
            Description: f.description,
            Keywords: f.keywords
          }));
          break;
        case 'getty':
        case 'alamy':
        case 'pond5':
        case 'dreamstime':
        case 'freepik':
        case 'vecteezy':
        case 'csv':
        default:
          data = completedFiles.map(f => ({
            Filename: f.filename,
            Title: f.title,
            Description: f.description,
            Keywords: f.keywords,
            Category: f.category || '',
            Rating: f.rating || 0
          }));
          break;
      }
      content = Papa.unparse(data);
    }

    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filenamePrefix}_${Date.now()}.${extension}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleEmbed = async (type: 'image' | 'video' | 'eps') => {
    const completedFiles = files.filter(f => {
      const ext = f.fileType.toLowerCase();
      if (type === 'image') return ['jpg', 'jpeg', 'png'].includes(ext);
      if (type === 'video') return ['mp4', 'mov', 'avi'].includes(ext);
      if (type === 'eps') return ['eps', 'ai', 'svg'].includes(ext);
      return false;
    }).filter(f => f.status === 'completed');

    if (completedFiles.length === 0) {
      showNotification(`No completed ${type.toUpperCase()} files to embed.`, 'info');
      return;
    }

    showNotification(`Embedding metadata for ${completedFiles.length} ${type.toUpperCase()} files...`, 'info');

    for (const file of completedFiles) {
      try {
        await saveMetadataToLocalFile(file.id, file);
        
        // Special logic for EPS: Save a preview image if possible
        if (type === 'eps' && directoryHandle) {
          try {
            // Simulate saving a preview image (just a placeholder for now as we can't convert EPS in browser easily)
            const previewHandle = await directoryHandle.getFileHandle(`${file.filename}_preview.jpg`, { create: true });
            const response = await fetch('https://picsum.photos/seed/eps_preview/800/600');
            const blob = await response.blob();
            const writable = await previewHandle.createWritable();
            await writable.write(blob);
            await writable.close();
          } catch (e) {
            console.error("Failed to save EPS preview:", e);
          }
        }
      } catch (err) {
        console.error(`Failed to embed ${type}:`, err);
      }
    }

    // Attempt to "open" the application via protocol (this is hit-or-miss but requested)
    if (type === 'eps') {
      window.location.href = 'illustrator://';
    } else if (type === 'image') {
      window.location.href = 'photoshop://';
    }

    showNotification(`${type.toUpperCase()} Embedding Complete!`, 'success');
  };

  const filteredFiles = useMemo(() => {
    if (settings.metadataFor === 'all') return files;
    return files.filter(f => {
      const ext = f.fileType.toLowerCase();
      if (settings.metadataFor === 'image') return ['jpg', 'jpeg', 'png'].includes(ext);
      if (settings.metadataFor === 'video') return ['mp4', 'mov'].includes(ext);
      if (settings.metadataFor === 'eps') return ['eps'].includes(ext);
      return true;
    });
  }, [files, settings.metadataFor]);

  const clearAll = () => {
    setFiles(prev => prev.filter(f => !filteredFiles.find(ff => ff.id === f.id)));
  };

  const exportCsv = () => {
    const data = files.map(f => ({
      Filename: f.filename,
      Title: f.title,
      Description: f.description,
      Keywords: f.keywords,
      Category: f.category || '',
      Rating: f.rating || 0
    }));
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `metadata_export_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatFilename = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special chars
      .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
      .replace(/^-+|-+$/g, ''); // Trim hyphens
  };

  const updateFile = (id: string, updates: Partial<StockMetadata>) => {
    setFiles(prev => prev.map(f => {
      if (f.id === id) {
        const newMetadata = { ...f, ...updates };
        if (updates.title !== undefined) {
          const extension = f.filename.split('.').pop() || f.fileType;
          newMetadata.filename = `${formatFilename(updates.title)}.${extension}`;
        }
        return newMetadata;
      }
      return f;
    }));
  };

  const deleteFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const downloadWithMetadata = async (id: string) => {
    const fileMetadata = files.find(f => f.id === id);
    const actualFile = fileObjects[id];
    if (!fileMetadata || !actualFile) return;

    if (actualFile.type === 'image/jpeg' || actualFile.type === 'image/jpg') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        
        try {
          const zeroth: any = {};
          zeroth[piexif.ImageIFD.ImageDescription] = fileMetadata.description;
          zeroth[piexif.ImageIFD.XPSubject] = fileMetadata.title;
          zeroth[piexif.ImageIFD.XPKeywords] = fileMetadata.keywords;
          zeroth[piexif.ImageIFD.Rating] = fileMetadata.rating;
          
          const exifObj = { "0th": zeroth, "Exif": {}, "GPS": {} };
          const exifBytes = piexif.dump(exifObj);
          const newBase64 = piexif.insert(exifBytes, base64);
          
          const link = document.createElement('a');
          link.href = newBase64;
          link.download = fileMetadata.filename;
          link.click();
        } catch (err) {
          console.error("EXIF Error:", err);
          // Fallback to normal download
          const link = document.createElement('a');
          link.href = URL.createObjectURL(actualFile);
          link.download = fileMetadata.filename;
          link.click();
        }
      };
      reader.readAsDataURL(actualFile);
    } else {
      // For other formats, download original + XMP sidecar
      const link = document.createElement('a');
      link.href = URL.createObjectURL(actualFile);
      link.download = fileMetadata.filename;
      link.click();
      
      const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${fileMetadata.title}</rdf:li></rdf:Alt></dc:title>
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${fileMetadata.description}</rdf:li></rdf:Alt></dc:description>
   <dc:subject><rdf:Bag>${fileMetadata.keywords.split(',').map(k => `<rdf:li>${k.trim()}</rdf:li>`).join('')}</rdf:Bag></dc:subject>
   <xmp:Rating>${fileMetadata.rating}</xmp:Rating>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
      const xmpBlob = new Blob([xmp], { type: 'application/xml' });
      const xmpLink = document.createElement('a');
      xmpLink.href = URL.createObjectURL(xmpBlob);
      xmpLink.download = `${fileMetadata.filename}.xmp`;
      xmpLink.click();
    }
  };

  const handleFilesAdded = (fileList: FileList | File[]) => {
    const newItems: StockMetadata[] = [];
    const filesArray = Array.from(fileList);
    
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'eps', 'mp4', 'mov'];

    filesArray.forEach(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (allowedExtensions.includes(ext)) {
        const id = Math.random().toString(36).substr(2, 9);
        setFileObjects(prev => ({ ...prev, [id]: file }));
        
        // EPS files don't have browser-native previews, so we skip URL.createObjectURL for them
        const isImage = file.type.startsWith('image/') && ext !== 'eps';
        
        newItems.push({
          id,
          filename: file.name,
          title: '',
          description: '',
          keywords: '',
          rating: 5,
          status: 'pending',
          fileType: ext,
          previewUrl: isImage ? URL.createObjectURL(file) : undefined
        });
      }
    });

    if (newItems.length === 0 && filesArray.length > 0) {
      showNotification(`No valid ${settings.metadataFor} files found.`, 'error');
    } else {
      setFiles(prev => [...newItems, ...prev]);
      if (settings.autoGenerateOnAdd) {
        setTimeout(startGeneration, 500);
      }
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  return (
    <div 
      className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-blue-500/30 transition-colors duration-300 relative"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-[200] bg-blue-600/20 backdrop-blur-sm border-4 border-dashed border-blue-500 flex items-center justify-center pointer-events-none animate-in fade-in duration-200">
          <div className="bg-background/90 p-8 rounded-2xl shadow-2xl border border-blue-500/50 flex flex-col items-center gap-4 scale-110 transition-transform">
            <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Upload size={40} className="text-white animate-bounce" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-black uppercase tracking-tighter">Drop Files to Upload</h2>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Images, Videos, and EPS Vectors</p>
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className={cn(
          "fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-lg shadow-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300",
          notification.type === 'error' ? "bg-rose-900/90 border-rose-500 text-rose-100" :
          notification.type === 'success' ? "bg-emerald-900/90 border-emerald-500 text-emerald-100" :
          "bg-secondary/90 border-border text-foreground"
        )}>
          {notification.type === 'error' ? <AlertCircle size={18} /> : 
           notification.type === 'success' ? <CheckCircle2 size={18} /> : 
           <Info size={18} />}
          <span className="text-xs font-bold uppercase tracking-wider">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="ml-4 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Header */}
      <header className="bg-secondary border-b border-border z-40 shadow-xl relative text-foreground">
        {/* Top Branding Bar */}
        <div className="flex items-center px-4 py-1.5 bg-background border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Sparkles size={14} className="text-white" />
            </div>
            <h1 className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground">
              SS <span className="text-blue-500">Smart Meta</span>
            </h1>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest opacity-50 hidden sm:block">
              Professional Metadata Engine
            </div>
            <button 
              onClick={() => setIsHistoryOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1 hover:bg-white/10 rounded transition-all group border border-transparent hover:border-white/10"
              title="Open History"
            >
              <HistoryIcon size={14} className="text-muted-foreground group-hover:text-amber-400 transition-colors" />
              <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground uppercase tracking-tight">History</span>
            </button>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1 hover:bg-white/10 rounded transition-all group border border-transparent hover:border-white/10"
              title="Open Settings"
            >
              <Settings size={14} className="text-muted-foreground group-hover:text-blue-400 transition-colors" />
              <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground uppercase tracking-tight">Settings</span>
            </button>
          </div>
        </div>

        {/* Ribbon Actions (The Buttons Area) */}
        <div className="flex flex-col bg-muted">
          {/* Controls Bar */}
          <div className="flex items-center flex-wrap px-4 py-2 gap-y-4 gap-x-6 border-b border-border/30">
            {/* Active API Key Group */}
            <div className="flex flex-col gap-1.5 min-w-[150px]">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Active AI Provider</span>
              <select 
                value={activeKey.provider}
                onChange={(e) => {
                  const provider = e.target.value as keyof ApiConfig;
                  // Find first non-empty key index, or default to 0
                  const firstReadyIndex = apiConfig[provider].findIndex(key => key.trim() !== '');
                  setActiveKey({ provider, index: firstReadyIndex !== -1 ? firstReadyIndex : 0 });
                }}
                className="bg-secondary border border-border text-foreground text-[10px] px-2 py-1 rounded focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
              >
                <option value="gemini">GEMINI {apiConfig.gemini.some(k => k) ? '(READY)' : '(EMPTY)'}</option>
                <option value="groq">GROQ {apiConfig.groq.some(k => k) ? '(READY)' : '(EMPTY)'}</option>
                <option value="mistral">MISTRAL {apiConfig.mistral.some(k => k) ? '(READY)' : '(EMPTY)'}</option>
              </select>
            </div>

            {/* Theme Group */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Theme</span>
              <select 
                value={theme}
                onChange={(e) => setTheme(e.target.value as any)}
                className="bg-secondary border border-border text-foreground text-[10px] px-2 py-1 rounded focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="blue">Blue</option>
              </select>
            </div>

            {/* Gen Options Group */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Gen Options</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={genOptions.autoSave}
                    onChange={(e) => setGenOptions(prev => ({ ...prev, autoSave: e.target.checked }))}
                    className="w-3 h-3 rounded bg-muted border-border text-blue-600 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">Auto-Save</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={genOptions.autoExport}
                    onChange={(e) => setGenOptions(prev => ({ ...prev, autoExport: e.target.checked }))}
                    className="w-3 h-3 rounded bg-muted border-border text-blue-600 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">Auto-Export</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={genOptions.aiEnhance}
                    onChange={(e) => setGenOptions(prev => ({ ...prev, aiEnhance: e.target.checked }))}
                    className="w-3 h-3 rounded bg-muted border-border text-blue-600 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">AI-Enhance</span>
                </label>
              </div>
            </div>

            <div className="flex-1" />

            {/* Input Group */}
            <div className="flex items-center gap-2 pr-4 border-r border-border/50">
              <button 
                onClick={() => document.getElementById('file-upload')?.click()}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-white/10 rounded-md transition-all group cursor-pointer border border-transparent hover:border-white/5 shadow-sm"
              >
                <div className="p-1 text-blue-400 group-hover:scale-110 group-hover:text-blue-300 transition-all">
                  <Plus size={18} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-bold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-tighter">Add Files</span>
              </button>
              <button 
                onClick={() => document.getElementById('folder-upload')?.click()}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-white/10 rounded-md transition-all group cursor-pointer border border-transparent hover:border-white/5 shadow-sm"
              >
                <div className="p-1 text-amber-400 group-hover:scale-110 group-hover:text-amber-300 transition-all">
                  <FolderPlus size={18} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-bold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-tighter">Add Folder</span>
              </button>
            </div>

            {/* Processing Group */}
            <div className="flex items-center gap-2 px-2 border-r border-border/50">
              <button 
                onClick={startGeneration}
                disabled={isGenerating || files.length === 0}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-emerald-500/10 rounded-md transition-all group cursor-pointer disabled:opacity-30 border border-transparent hover:border-emerald-500/20 shadow-sm"
              >
                <div className="p-1 text-emerald-400 group-hover:scale-110 group-hover:text-emerald-300 transition-all">
                  {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} className="fill-current" />}
                </div>
                <span className="text-[9px] font-bold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-tighter">Generate</span>
              </button>
              <button 
                onClick={() => {
                  setFiles(prev => prev.map(f => ({ ...f, status: 'pending' })));
                  setTimeout(startGeneration, 100);
                }}
                disabled={isGenerating || files.length === 0}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-blue-500/10 rounded-md transition-all group cursor-pointer disabled:opacity-30 border border-transparent hover:border-blue-500/20 shadow-sm"
              >
                <div className="p-1 text-blue-400 group-hover:scale-110 group-hover:text-blue-300 transition-all">
                  <RefreshCcw size={18} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-bold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-tighter">Regen All</span>
              </button>
              <button 
                onClick={() => {
                  setFiles(prev => prev.map(f => f.status === 'error' ? { ...f, status: 'pending' } : f));
                  setTimeout(startGeneration, 100);
                }}
                disabled={isGenerating || !files.some(f => f.status === 'error')}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-amber-500/10 rounded-md transition-all group cursor-pointer disabled:opacity-30 border border-transparent hover:border-amber-500/20 shadow-sm"
              >
                <div className="p-1 text-amber-400 group-hover:scale-110 group-hover:text-amber-300 transition-all">
                  <RefreshCw size={18} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-bold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-tighter">Retry Errors</span>
              </button>
              <button 
                onClick={() => {
                  stopRef.current = true;
                  setIsGenerating(false);
                }}
                disabled={!isGenerating}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-rose-500/10 rounded-md transition-all group cursor-pointer disabled:opacity-30 border border-transparent hover:border-rose-500/20 shadow-sm"
              >
                <div className="p-1 text-rose-400 group-hover:scale-110 group-hover:text-rose-300 transition-all">
                  <Square size={16} className="fill-current" />
                </div>
                <span className="text-[9px] font-bold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-tighter">Stop</span>
              </button>
              <button 
                onClick={clearAll}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-rose-500/10 rounded-md transition-all group cursor-pointer border border-transparent hover:border-rose-500/20 shadow-sm"
              >
                <div className="p-1 text-rose-400 group-hover:scale-110 group-hover:text-rose-300 transition-all">
                  <Trash2 size={18} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-bold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-tighter">Clear</span>
              </button>
            </div>

            {/* Export Group */}
            <div className="flex items-center gap-2 px-2 border-r border-border">
              <button 
                onClick={() => handleExport('csv')}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-cyan-500/10 rounded-md transition-all group cursor-pointer border border-transparent hover:border-cyan-500/20 shadow-sm"
              >
                <div className="p-1 text-cyan-400 group-hover:scale-110 group-hover:text-cyan-300 transition-all">
                  <FileSpreadsheet size={18} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-bold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-tighter">Export CSV</span>
              </button>
            </div>

            {/* Embed Actions Group */}
            <div className="flex items-center gap-2 px-2 border-r border-border">
              <button 
                onClick={() => handleEmbed('image')}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-indigo-500/10 rounded-md transition-all group cursor-pointer border border-transparent hover:border-indigo-500/20 shadow-sm"
                title="Embed Metadata & Open Photoshop"
              >
                <div className="p-1 text-indigo-400 group-hover:scale-110 group-hover:text-indigo-300 transition-all">
                  <FileImage size={18} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-bold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-tighter">Img Embed</span>
              </button>
              <button 
                onClick={() => handleEmbed('eps')}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-orange-500/10 rounded-md transition-all group cursor-pointer border border-transparent hover:border-orange-500/20 shadow-sm"
                title="Embed Metadata & Open Illustrator"
              >
                <div className="p-1 text-orange-400 group-hover:scale-110 group-hover:text-orange-300 transition-all">
                  <Layers size={18} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-bold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-tighter">EPS Embed</span>
              </button>
              <button 
                onClick={() => handleEmbed('video')}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-emerald-500/10 rounded-md transition-all group cursor-pointer border border-transparent hover:border-emerald-500/20 shadow-sm"
                title="Auto Embed Video Metadata"
              >
                <div className="p-1 text-emerald-400 group-hover:scale-110 group-hover:text-emerald-300 transition-all">
                  <Video size={18} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-bold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-tighter">Vid Embed</span>
              </button>
            </div>

            {/* Utilities Group */}
            <div className="flex-1" />
          </div>

          {/* Secondary Controls Bar */}
          <div className="flex items-center flex-wrap px-4 py-1.5 gap-y-2 gap-x-4 bg-secondary border-b border-border/50">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Asset Type:</span>
              <div className="flex bg-muted rounded-sm overflow-hidden border border-border p-0.5">
                {[
                  { id: 'all', label: 'All', icon: Database },
                  { id: 'image', label: 'Image', icon: FileImage },
                  { id: 'video', label: 'Video', icon: Video },
                  { id: 'eps', label: 'EPS', icon: Layers }
                ].map(item => (
                  <button 
                    key={item.id}
                    onClick={() => setSettings(prev => ({ ...prev, metadataFor: item.id as any }))}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-sm transition-all",
                      settings.metadataFor === item.id ? "bg-blue-500 text-white shadow-md shadow-blue-500/20" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    )}
                  >
                    <item.icon size={10} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-px h-4 bg-border" />

            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Export Preset:</span>
              <select 
                value={selectedExportSite}
                onChange={(e) => setSelectedExportSite(e.target.value)}
                className="bg-secondary border border-border text-foreground text-[9px] px-2 py-0.5 rounded focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
              >
                <option value="adobe">Adobe Stock</option>
                <option value="shutterstock">Shutterstock</option>
                <option value="getty">Getty/iStock</option>
                <option value="alamy">Alamy</option>
                <option value="pond5">Pond5</option>
                <option value="dreamstime">Dreamstime</option>
                <option value="freepik">Freepik</option>
                <option value="vecteezy">Vecteezy</option>
                <option value="csv">General CSV</option>
              </select>
            </div>

            <button 
              onClick={() => handleExport(selectedExportSite)}
              className="px-3 py-1 rounded bg-blue-500 text-white border border-blue-400 text-[9px] font-black uppercase tracking-widest hover:bg-blue-400 hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 shadow-lg shadow-blue-500/20"
            >
              <Download size={10} strokeWidth={3} />
              Download CSV
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-4 text-[9px] font-bold text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
                <span className="uppercase tracking-widest">System Ready</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-border">|</span>
                <span className="uppercase tracking-widest">Assets: {files.length}</span>
              </div>
            </div>
          </div>
        </div>

        {isGenerating && (
          <div className="flex flex-col gap-1 px-4 py-2 bg-muted border-b border-border">
            <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              <div className="flex items-center gap-2">
                <Loader2 size={10} className="animate-spin text-blue-500" />
                <span>Processing Assets...</span>
              </div>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full h-1 bg-border rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-500 ease-out shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area - Windows Explorer Style Table */}
      <div className="flex-1 overflow-hidden flex flex-col bg-background">
        {/* Windows Style Table Header */}
        <div className="flex flex-row w-full border-b border-border bg-secondary text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          <div className="w-[12%] px-3 py-2 border-r border-border shrink-0 hover:bg-muted cursor-pointer flex items-center justify-between">
            FILENAME <ChevronRight size={10} className="rotate-90 opacity-50" />
          </div>
          <div className="w-[15%] px-3 py-2 border-r border-border shrink-0 hover:bg-muted cursor-pointer flex items-center justify-between">
            TITLE <ChevronRight size={10} className="rotate-90 opacity-50" />
          </div>
          <div className="w-[25%] px-3 py-2 border-r border-border shrink-0 hover:bg-muted cursor-pointer flex items-center justify-between">
            KEYWORDS <ChevronRight size={10} className="rotate-90 opacity-50" />
          </div>
          <div className="w-[20%] px-3 py-2 border-r border-border shrink-0 hover:bg-muted cursor-pointer flex items-center justify-between">
            DESCRIPTION <ChevronRight size={10} className="rotate-90 opacity-50" />
          </div>
          <div className="w-[10%] px-3 py-2 border-r border-border shrink-0 hover:bg-muted cursor-pointer flex items-center justify-between">
            CATEGORY <ChevronRight size={10} className="rotate-90 opacity-50" />
          </div>
          <div className="w-[8%] px-3 py-2 border-r border-border shrink-0 hover:bg-muted cursor-pointer flex items-center justify-between">
            KW COUNT <ChevronRight size={10} className="rotate-90 opacity-50" />
          </div>
          <div className="w-[10%] px-3 py-2 text-center shrink-0 hover:bg-muted cursor-pointer">
            RATING
          </div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-background">
          {filteredFiles.length === 0 ? (
            <div 
              className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-6 transition-all"
            >
              <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center border border-border">
                <Upload size={48} strokeWidth={1} className="opacity-10" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-muted-foreground uppercase">NO {settings.metadataFor.toUpperCase()} FILES LOADED</p>
              </div>
            </div>
          ) : (
            <div className="h-full w-full">
              <FixedSizeList
                height={800}
                itemCount={filteredFiles.length}
                itemSize={60}
                width="100%"
                itemData={filteredFiles}
                className="custom-scrollbar"
              >
                {FileRow}
              </FixedSizeList>
            </div>
          )}
        </div>
      </div>

      {/* Windows Style Footer */}
      <footer className="bg-secondary border-t border-border px-4 py-1 flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
            <span>System Ready</span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1.5">
            <Database size={10} />
            <span>API: Connected</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <span>Total Assets: {files.length}</span>
            <span className="text-border">|</span>
            <span>Showing: {filteredFiles.length}</span>
            <span className="text-border">|</span>
            <span>Completed: {filteredFiles.filter(f => f.status === 'completed').length}</span>
            <span className="text-border">|</span>
            <span>Errors: {filteredFiles.filter(f => f.status === 'error').length}</span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock size={10} />
            <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      </footer>

      {/* Settings Modal (Windows Style) */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-background border border-border rounded-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-3 border-b border-border flex items-center justify-between bg-muted">
              <div className="flex items-center gap-2">
                <Settings size={16} className="text-muted-foreground" />
                <h3 className="font-bold text-[11px] uppercase tracking-widest text-foreground">Application Settings</h3>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="p-1 hover:bg-red-500 hover:text-white rounded text-muted-foreground transition-all">
                <X size={16} />
              </button>
            </div>
            
            <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar bg-background">
              {/* API Keys Section */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-1">
                  <Database size={14} />
                  Service Configuration (5 Slots Per Provider)
                </h4>
                <div className="grid gap-6">
                  {(['gemini', 'groq', 'mistral'] as const).map(provider => (
                    <div key={provider} className="space-y-3 p-3 bg-muted/30 rounded-sm border border-border">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest">{provider} API KEYS</label>
                      </div>
                      <div className="space-y-2">
                        {apiConfig[provider].map((key, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <span className="text-[9px] font-bold text-muted-foreground w-4">{idx + 1}.</span>
                            <input 
                              type="password"
                              value={key}
                              onChange={(e) => {
                                const newKeys = [...apiConfig[provider]];
                                newKeys[idx] = e.target.value;
                                setApiConfig(prev => ({ ...prev, [provider]: newKeys }));
                              }}
                              placeholder={`ENTER ${provider.toUpperCase()} KEY ${idx + 1}...`}
                              className="flex-1 bg-secondary border border-border text-[11px] h-8 rounded-sm px-3 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all text-foreground uppercase placeholder:text-muted-foreground/30"
                            />
                            <button 
                              onClick={() => handleTestConnection(provider, idx)}
                              disabled={!key || apiStatus[`${provider}-${idx}`] === 'testing'}
                              className={cn(
                                "px-3 h-8 rounded-sm text-[9px] font-black uppercase tracking-widest transition-all shadow-sm",
                                apiStatus[`${provider}-${idx}`] === 'connected' ? "bg-emerald-500 text-white shadow-emerald-500/20" :
                                apiStatus[`${provider}-${idx}`] === 'failed' ? "bg-red-500 text-white shadow-red-500/20" :
                                "bg-white/10 hover:bg-white/20 text-foreground border border-white/10"
                              )}
                            >
                              {apiStatus[`${provider}-${idx}`] === 'testing' ? '...' : 
                               apiStatus[`${provider}-${idx}`] === 'connected' ? 'READY' : 
                               apiStatus[`${provider}-${idx}`] === 'failed' ? 'FAILED' : 'TEST'}
                            </button>
                            <button 
                              onClick={() => {
                                const newKeys = [...apiConfig[provider]];
                                newKeys[idx] = '';
                                setApiConfig(prev => ({ ...prev, [provider]: newKeys }));
                                setApiStatus(prev => {
                                  const newStatus = { ...prev };
                                  delete newStatus[`${provider}-${idx}`];
                                  return newStatus;
                                });
                              }}
                              className="p-2 h-8 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-sm border border-red-500/20 transition-all"
                              title="CLEAR KEY"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Imager Options */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-1">
                  <FileImage size={14} />
                  AI Imager Configuration
                </h4>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: 'singleWordKeywords', label: 'Single Word Keywords' },
                    { id: 'autoGenerateOnAdd', label: 'Auto-Generate on Add' },
                    { id: 'silhouette', label: 'Silhouette' },
                    { id: 'customPromptEnabled', label: 'Custom Prompt' },
                    { id: 'transparentBackground', label: 'Transparent Background' },
                    { id: 'prohibitedWords', label: 'Prohibited Words' }
                  ].map(option => (
                    <div key={option.id} className="flex items-center justify-between p-2 bg-muted/20 rounded-sm border border-border/50">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-foreground uppercase tracking-widest">{option.label}</span>
                        <Info size={10} className="text-muted-foreground/50" />
                      </div>
                      <button 
                        onClick={() => setSettings(prev => ({ ...prev, [option.id]: !prev[option.id as keyof GeneratorSettings] }))}
                        className={cn(
                          "w-8 h-4 rounded-full transition-all relative",
                          settings[option.id as keyof GeneratorSettings] ? "bg-blue-500" : "bg-muted"
                        )}
                      >
                        <div className={cn(
                          "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all shadow-sm",
                          settings[option.id as keyof GeneratorSettings] ? "left-[18px]" : "left-0.5"
                        )} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Saved Keywords Section */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-1">
                  <Tag size={14} />
                  Saved Keywords (Persistent)
                </h4>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newKeyword.trim()) {
                          setSettings(prev => ({ ...prev, savedKeywords: [...prev.savedKeywords, newKeyword.trim()] }));
                          setNewKeyword('');
                        }
                      }}
                      placeholder="ADD NEW KEYWORD..."
                      className="flex-1 bg-secondary border border-border text-[11px] h-8 rounded-sm px-3 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all text-foreground uppercase placeholder:text-muted-foreground/30"
                    />
                    <button 
                      onClick={() => {
                        if (newKeyword.trim()) {
                          setSettings(prev => ({ ...prev, savedKeywords: [...prev.savedKeywords, newKeyword.trim()] }));
                          setNewKeyword('');
                        }
                      }}
                      className="px-4 h-8 bg-blue-500 hover:bg-blue-400 text-white text-[9px] font-black uppercase tracking-widest rounded-sm transition-all shadow-lg shadow-blue-500/20"
                    >
                      ADD
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-muted/30 rounded-sm border border-border">
                    {settings.savedKeywords.length === 0 ? (
                      <span className="text-[9px] text-muted-foreground/50 uppercase italic">No saved keywords...</span>
                    ) : (
                      settings.savedKeywords.map((kw, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-sm group">
                          <span className="text-[10px] font-bold text-blue-400 uppercase">{kw}</span>
                          <button 
                            onClick={() => {
                              setSettings(prev => ({
                                ...prev,
                                savedKeywords: prev.savedKeywords.filter((_, i) => i !== idx)
                              }));
                            }}
                            className="text-muted-foreground hover:text-red-400 transition-colors"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Generation Parameters */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-1">
                  <Zap size={14} />
                  Metadata Parameters
                </h4>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">PLATFORM PRESET</label>
                    <div className="flex bg-muted rounded-sm overflow-hidden border border-border p-1">
                      {[
                        { id: 'default', label: 'STD' },
                        { id: 'adobe', label: 'ADOBE' },
                        { id: 'shutterstock', label: 'SHUTTER' }
                      ].map(mode => (
                        <button 
                          key={mode.id}
                          onClick={() => setSettings(prev => ({ ...prev, promptMode: mode.id as any }))}
                          className={cn(
                            "flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-sm transition-all", 
                            settings.promptMode === mode.id ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20" : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">TITLE WORD RANGE</label>
                      <span className="text-[10px] font-black text-blue-400 bg-blue-500/10 px-1.5 rounded uppercase border border-blue-500/20">{settings.minTitleWords} - {settings.maxTitleWords}</span>
                    </div>
                    <div className="space-y-4 px-1 py-2 bg-muted/20 rounded-md border border-border/30">
                      <div className="relative h-1 bg-muted rounded-full">
                        <div 
                          className="absolute h-full bg-blue-500/30 rounded-full"
                          style={{ 
                            left: `${(settings.minTitleWords / 50) * 100}%`, 
                            right: `${100 - (settings.maxTitleWords / 50) * 100}%` 
                          }}
                        />
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="text-[8px] font-bold text-muted-foreground w-6">MIN</span>
                          <input 
                            type="range" 
                            min="1" 
                            max="50" 
                            value={settings.minTitleWords}
                            onChange={(e) => setSettings(prev => ({ ...prev, minTitleWords: Math.min(parseInt(e.target.value), prev.maxTitleWords) }))}
                            className="modern-slider slider-blue"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[8px] font-bold text-muted-foreground w-6">MAX</span>
                          <input 
                            type="range" 
                            min="1" 
                            max="50" 
                            value={settings.maxTitleWords}
                            onChange={(e) => setSettings(prev => ({ ...prev, maxTitleWords: Math.max(parseInt(e.target.value), prev.minTitleWords) }))}
                            className="modern-slider slider-blue"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">DESCRIPTION WORD RANGE</label>
                      <span className="text-[10px] font-black text-cyan-400 bg-cyan-500/10 px-1.5 rounded uppercase border border-cyan-500/20">{settings.minDescriptionWords} - {settings.maxDescriptionWords}</span>
                    </div>
                    <div className="space-y-4 px-1 py-2 bg-muted/20 rounded-md border border-border/30">
                      <div className="relative h-1 bg-muted rounded-full">
                        <div 
                          className="absolute h-full bg-cyan-500/30 rounded-full"
                          style={{ 
                            left: `${(settings.minDescriptionWords / 100) * 100}%`, 
                            right: `${100 - (settings.maxDescriptionWords / 100) * 100}%` 
                          }}
                        />
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="text-[8px] font-bold text-muted-foreground w-6">MIN</span>
                          <input 
                            type="range" 
                            min="5" 
                            max="100" 
                            value={settings.minDescriptionWords}
                            onChange={(e) => setSettings(prev => ({ ...prev, minDescriptionWords: Math.min(parseInt(e.target.value), prev.maxDescriptionWords) }))}
                            className="modern-slider slider-cyan"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[8px] font-bold text-muted-foreground w-6">MAX</span>
                          <input 
                            type="range" 
                            min="5" 
                            max="100" 
                            value={settings.maxDescriptionWords}
                            onChange={(e) => setSettings(prev => ({ ...prev, maxDescriptionWords: Math.max(parseInt(e.target.value), prev.minDescriptionWords) }))}
                            className="modern-slider slider-cyan"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">KEYWORD RANGE</label>
                      <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-1.5 rounded uppercase border border-emerald-500/20">{settings.minKeywords} - {settings.maxKeywords}</span>
                    </div>
                    <div className="space-y-4 px-1 py-2 bg-muted/20 rounded-md border border-border/30">
                      <div className="relative h-1 bg-muted rounded-full">
                        <div 
                          className="absolute h-full bg-emerald-500/30 rounded-full"
                          style={{ 
                            left: `${(settings.minKeywords / 50) * 100}%`, 
                            right: `${100 - (settings.maxKeywords / 50) * 100}%` 
                          }}
                        />
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="text-[8px] font-bold text-muted-foreground w-6">MIN</span>
                          <input 
                            type="range" 
                            min="5" 
                            max="50" 
                            value={settings.minKeywords}
                            onChange={(e) => setSettings(prev => ({ ...prev, minKeywords: Math.min(parseInt(e.target.value), prev.maxKeywords) }))}
                            className="modern-slider slider-emerald"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[8px] font-bold text-muted-foreground w-6">MAX</span>
                          <input 
                            type="range" 
                            min="5" 
                            max="50" 
                            value={settings.maxKeywords}
                            onChange={(e) => setSettings(prev => ({ ...prev, maxKeywords: Math.max(parseInt(e.target.value), prev.minKeywords) }))}
                            className="modern-slider slider-emerald"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">BATCH CONCURRENCY</label>
                      <span className="text-[10px] font-black text-blue-400 bg-blue-500/10 px-1.5 rounded uppercase border border-blue-500/20">{settings.concurrency} FILES</span>
                    </div>
                    <div className="space-y-4 px-1 py-2 bg-muted/20 rounded-md border border-border/30">
                      <input 
                        type="range" 
                        min="1" 
                        max="30" 
                        step="1"
                        value={settings.concurrency}
                        onChange={(e) => setSettings(prev => ({ ...prev, concurrency: parseInt(e.target.value) }))}
                        className="modern-slider slider-blue"
                      />
                      <div className="flex justify-between text-[7px] font-black text-muted-foreground/40 uppercase tracking-tighter">
                        <span>1 FILE</span>
                        <span>10 FILES</span>
                        <span>20 FILES</span>
                        <span>30 FILES</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={cn("space-y-4 transition-all duration-300", !settings.customPromptEnabled && "opacity-30 pointer-events-none grayscale")}>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">CUSTOM GLOBAL INSTRUCTIONS</label>
                <textarea 
                  value={settings.customPrompt}
                  onChange={(e) => setSettings(prev => ({ ...prev, customPrompt: e.target.value }))}
                  placeholder="ADD EXTRA INSTRUCTIONS..."
                  className="w-full bg-secondary border border-border text-[11px] p-4 rounded-sm h-24 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all text-foreground uppercase placeholder:text-muted-foreground/30 resize-none"
                />
              </div>
            </div>

            <div className="p-4 bg-muted border-t border-border flex justify-end">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="bg-blue-500 hover:bg-blue-400 text-white text-[10px] font-black px-8 py-2 rounded-md transition-all shadow-xl shadow-blue-500/20 uppercase tracking-widest active:scale-95"
              >
                SAVE & CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal (Windows Style) */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-background border border-border rounded-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-3 border-b border-border flex items-center justify-between bg-muted">
              <div className="flex items-center gap-2">
                <HistoryIcon size={16} className="text-muted-foreground" />
                <h3 className="font-bold text-[11px] uppercase tracking-widest text-foreground">Batch History</h3>
              </div>
              <button onClick={() => setIsHistoryOpen(false)} className="p-1 hover:bg-red-500 hover:text-white rounded text-muted-foreground transition-all">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-3 bg-background">
              {history.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-muted-foreground/30 space-y-4">
                  <Clock size={48} strokeWidth={1} className="opacity-10" />
                  <p className="text-[10px] font-bold uppercase tracking-widest">NO HISTORY FOUND</p>
                </div>
              ) : (
                history.map(item => (
                  <div key={item.id} className="p-4 bg-muted border border-border rounded-sm flex items-center justify-between hover:bg-blue-500/5 hover:border-blue-500/20 transition-all group">
                    <div>
                      <div className="text-[10px] font-bold text-muted-foreground uppercase">{new Date(item.timestamp).toLocaleString()}</div>
                      <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-1">{item.files.length} ASSETS PROCESSED</div>
                    </div>
                    <button 
                      onClick={() => { setFiles(item.files); setIsHistoryOpen(false); }}
                      className="text-[10px] font-black bg-blue-500 hover:bg-blue-400 text-white px-4 py-2 rounded-md transition-all shadow-lg shadow-blue-500/20 uppercase tracking-widest active:scale-95"
                    >
                      RESTORE BATCH
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 bg-muted border-t border-border flex justify-end">
              <button 
                onClick={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY); }}
                className="text-[10px] font-black text-red-400 hover:text-red-300 uppercase tracking-widest"
              >
                CLEAR ALL HISTORY
              </button>
            </div>
          </div>
        </div>
      )}

      <input 
        type="file" 
        id="file-upload" 
        multiple 
        className="hidden" 
        onChange={(e) => {
          if (e.target.files) {
            handleFilesAdded(e.target.files);
            e.target.value = ''; // Reset to allow re-uploading same file
          }
        }}
        accept=".jpg,.jpeg,.png,.eps,.mp4,.mov"
      />
      <input 
        type="file" 
        id="folder-upload" 
        {...{ webkitdirectory: "", directory: "" }}
        multiple 
        className="hidden" 
        onChange={(e) => {
          if (e.target.files) {
            handleFilesAdded(e.target.files);
            e.target.value = ''; // Reset to allow re-uploading same file
          }
        }}
      />
    </div>
  );

}
