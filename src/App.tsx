import React, { useState, useEffect, useMemo } from 'react';
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
  Star
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
    metadataFor: 'image',
    concurrency: 3
  });

  const [files, setFiles] = useState<StockMetadata[]>([]);
  const [fileObjects, setFileObjects] = useState<Record<string, File>>({});
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const stopRef = React.useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<'image' | 'vector' | 'video' | 'prompt'>('vector');
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
  const [genOptions, setGenOptions] = useState({
    description: true,
    filenameHint: true,
    autoEmbed: false,
    autoRetry: true,
    pngIsolated: true,
    refinePngBg: false
  });

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

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
  const [apiStatus, setApiStatus] = useState<Record<string, ApiStatus>>({
    gemini: { status: 'idle' },
    groq: { status: 'idle' },
    mistral: { status: 'idle' }
  });
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
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.toggle('dark', systemTheme === 'dark');
    } else {
      root.classList.toggle('dark', theme === 'dark');
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

  const startGeneration = async () => {
    if (isGenerating) return;
    
    const pendingFiles = files.filter(f => f.status === 'pending');
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
    const concurrency = settings.concurrency || 3;
    const chunks = [];
    for (let i = 0; i < pendingFiles.length; i += concurrency) {
      chunks.push(pendingFiles.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      if (stopRef.current) break;
      
      await Promise.all(chunk.map(async (fileMetadata) => {
        if (stopRef.current) return;
        
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
        }
      }));
    }

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

  const filteredFiles = useMemo(() => {
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
    
    const allowedExtensions = settings.metadataFor === 'image' ? ['jpg', 'jpeg', 'png'] :
                             settings.metadataFor === 'video' ? ['mp4', 'mov'] :
                             settings.metadataFor === 'eps' ? ['eps'] :
                             ['jpg', 'jpeg', 'png', 'eps', 'mp4', 'mov'];

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
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-blue-500/30 transition-colors duration-300">
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
        {/* Ribbon Actions (The Buttons Area) */}
        <div className="flex flex-col bg-muted">
          {/* Controls Bar */}
          <div className="flex items-center px-4 py-2 gap-6 border-b border-border/30">
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
                <option value="system">System</option>
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
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-foreground/5 rounded transition-all group cursor-pointer"
              >
                <div className="p-1 text-blue-400 group-hover:scale-110 transition-transform">
                  <Plus size={18} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-medium text-muted-foreground">Add Files</span>
              </button>
              <button 
                onClick={() => document.getElementById('folder-upload')?.click()}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-foreground/5 rounded transition-all group cursor-pointer"
              >
                <div className="p-1 text-amber-400 group-hover:scale-110 transition-transform">
                  <FolderPlus size={18} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-medium text-muted-foreground">Add Folder</span>
              </button>
            </div>

            {/* Processing Group */}
            <div className="flex items-center gap-2 px-2 border-r border-border/50">
              <button 
                onClick={startGeneration}
                disabled={isGenerating || files.length === 0}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-foreground/5 rounded transition-all group cursor-pointer disabled:opacity-30"
              >
                <div className="p-1 text-emerald-400 group-hover:scale-110 transition-transform">
                  {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} className="fill-current" />}
                </div>
                <span className="text-[9px] font-medium text-muted-foreground">Generate</span>
              </button>
              <button 
                onClick={() => {
                  stopRef.current = true;
                  setIsGenerating(false);
                }}
                disabled={!isGenerating}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-foreground/5 rounded transition-all group cursor-pointer disabled:opacity-30"
              >
                <div className="p-1 text-rose-400 group-hover:scale-110 transition-transform">
                  <Square size={16} className="fill-current" />
                </div>
                <span className="text-[9px] font-medium text-muted-foreground">Stop</span>
              </button>
              <button 
                onClick={clearAll}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-foreground/5 rounded transition-all group cursor-pointer"
              >
                <div className="p-1 text-rose-400 group-hover:scale-110 transition-transform">
                  <Trash2 size={18} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-medium text-muted-foreground">Clear</span>
              </button>
            </div>

            {/* Export Group */}
            <div className="flex items-center gap-2 px-2 border-r border-border">
              <button 
                onClick={() => handleExport('csv')}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-foreground/5 rounded transition-all group cursor-pointer"
              >
                <div className="p-1 text-cyan-400 group-hover:scale-110 transition-transform">
                  <FileSpreadsheet size={18} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-medium text-muted-foreground">Export CSV</span>
              </button>
            </div>

            {/* Utilities Group */}
            <div className="flex items-center gap-2 px-2">
              <button 
                onClick={() => setIsHistoryOpen(true)}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-foreground/5 rounded transition-all group cursor-pointer"
              >
                <div className="p-1 text-muted-foreground group-hover:scale-110 transition-transform">
                  <HistoryIcon size={18} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-medium text-muted-foreground">History</span>
              </button>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="flex flex-col items-center justify-center min-w-[56px] h-12 hover:bg-foreground/5 rounded transition-all group cursor-pointer"
              >
                <div className="p-1 text-muted-foreground group-hover:scale-110 transition-transform">
                  <Settings size={18} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-medium text-muted-foreground">Settings</span>
              </button>
            </div>
          </div>

          {/* Secondary Controls Bar */}
          <div className="flex items-center px-4 py-1.5 gap-4 bg-secondary border-b border-border/50">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Asset Type:</span>
              <div className="flex bg-muted rounded-sm overflow-hidden border border-border p-0.5">
                {[
                  { id: 'image', label: 'Image', icon: FileImage },
                  { id: 'video', label: 'Video', icon: Video },
                  { id: 'eps', label: 'EPS', icon: Layers }
                ].map(item => (
                  <button 
                    key={item.id}
                    onClick={() => setSettings(prev => ({ ...prev, metadataFor: item.id as any }))}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1 text-[9px] font-bold uppercase tracking-widest rounded-sm transition-all",
                      settings.metadataFor === item.id ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted"
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
              className="px-3 py-1 rounded bg-blue-600/20 text-blue-400 border border-blue-500/30 text-[9px] font-bold uppercase tracking-wider hover:bg-blue-600/30 transition-all flex items-center gap-1.5"
            >
              <Download size={10} />
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
            <div className="divide-y divide-border">
              {filteredFiles.map(file => (
                <div 
                  key={file.id}
                  className={cn(
                    "flex flex-row w-full hover:bg-blue-500/5 transition-colors group min-h-[45px] items-center border-b border-border",
                    file.status === 'generating' && "bg-blue-500/10"
                  )}
                >
                  <div className="w-[12%] px-3 py-1.5 border-r border-border flex items-center gap-2 overflow-hidden shrink-0">
                    <div className="w-8 h-8 bg-muted rounded border border-border flex-shrink-0 overflow-hidden relative shadow-sm">
                      {file.previewUrl ? (
                        <img src={file.previewUrl} alt="" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
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
                      </div>
                    </div>
                  </div>

                  <div className="w-[15%] px-3 py-1.5 border-r border-border h-full shrink-0 relative group/cell">
                    <textarea 
                      value={file.title}
                      onChange={(e) => updateFile(file.id, { title: e.target.value })}
                      className="w-full h-full bg-secondary border border-border rounded p-2 text-[10px] text-blue-400 resize-none focus:ring-1 focus:ring-blue-500 outline-none custom-scrollbar leading-tight placeholder:text-muted-foreground/30 uppercase font-bold"
                      placeholder="TITLE..."
                    />
                    <button 
                      onClick={() => copyToClipboard(file.title)}
                      className="absolute top-2 right-4 p-1 bg-muted border border-border rounded opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-accent shadow-lg"
                      title="COPY TITLE"
                    >
                      <Copy size={10} className="text-muted-foreground" />
                    </button>
                  </div>

                  <div className="w-[25%] px-3 py-1.5 border-r border-border h-full relative shrink-0 group/cell">
                    <textarea 
                      value={file.keywords}
                      onChange={(e) => updateFile(file.id, { keywords: e.target.value })}
                      className="w-full h-full bg-secondary border border-border rounded p-2 text-[10px] text-orange-400 resize-none focus:ring-1 focus:ring-blue-500 outline-none custom-scrollbar leading-tight placeholder:text-muted-foreground/30 uppercase font-bold"
                      placeholder="KEYWORDS..."
                    />
                    <button 
                      onClick={() => copyToClipboard(file.keywords)}
                      className="absolute top-2 right-4 p-1 bg-muted border border-border rounded opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-accent shadow-lg"
                      title="COPY KEYWORDS"
                    >
                      <Copy size={10} className="text-muted-foreground" />
                    </button>
                    {file.keywordScore && (
                      <div className="absolute bottom-1 right-4 text-[6px] font-black text-blue-400 bg-blue-500/10 px-1 py-0.25 rounded border border-blue-500/20">
                        {file.keywordScore}%
                      </div>
                    )}
                  </div>

                  <div className="w-[20%] px-3 py-1.5 border-r border-border h-full shrink-0 relative group/cell">
                    <textarea 
                      value={file.description}
                      onChange={(e) => updateFile(file.id, { description: e.target.value })}
                      className="w-full h-full bg-secondary border border-border rounded p-2 text-[10px] text-emerald-400 resize-none focus:ring-1 focus:ring-blue-500 outline-none custom-scrollbar leading-tight placeholder:text-muted-foreground/30 uppercase font-bold"
                      placeholder="DESCRIPTION..."
                    />
                    <button 
                      onClick={() => copyToClipboard(file.description)}
                      className="absolute top-2 right-4 p-1 bg-muted border border-border rounded opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-accent shadow-lg"
                      title="COPY DESCRIPTION"
                    >
                      <Copy size={10} className="text-muted-foreground" />
                    </button>
                  </div>

                  <div className="w-[10%] px-3 py-1.5 border-r border-border h-full shrink-0 relative group/cell">
                    <input 
                      type="text"
                      value={file.category || ''}
                      onChange={(e) => updateFile(file.id, { category: e.target.value })}
                      className="w-full h-full bg-secondary border border-border rounded px-2 text-[10px] text-foreground focus:ring-1 focus:ring-blue-500 outline-none placeholder:text-muted-foreground/30 uppercase font-bold"
                      placeholder="CATEGORY..."
                    />
                  </div>

                  <div className="w-[8%] px-3 py-1.5 border-r border-border h-full shrink-0 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-muted-foreground">{file.keywords ? file.keywords.split(',').length : 0}</span>
                  </div>

                  <div className="w-[10%] px-3 py-1.5 h-full shrink-0 flex items-center justify-center">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button 
                          key={star}
                          onClick={() => updateFile(file.id, { rating: star })}
                          className={cn(
                            "transition-all hover:scale-125",
                            file.rating >= star ? "text-yellow-500" : "text-muted-foreground/30"
                          )}
                        >
                          <Star size={10} fill={file.rating >= star ? "currentColor" : "none"} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
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
                                "px-3 h-8 rounded-sm text-[9px] font-black uppercase tracking-widest transition-all",
                                apiStatus[`${provider}-${idx}`] === 'connected' ? "bg-emerald-500 text-white" :
                                apiStatus[`${provider}-${idx}`] === 'failed' ? "bg-red-500 text-white" :
                                "bg-muted hover:bg-muted/80 text-muted-foreground"
                              )}
                            >
                              {apiStatus[`${provider}-${idx}`] === 'testing' ? '...' : 
                               apiStatus[`${provider}-${idx}`] === 'connected' ? 'READY' : 
                               apiStatus[`${provider}-${idx}`] === 'failed' ? 'FAILED' : 'TEST'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
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
                            settings.promptMode === mode.id ? "bg-blue-600 text-white shadow-sm" : "hover:bg-muted text-muted-foreground"
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
                      <span className="text-[10px] font-black text-blue-400 bg-blue-500/10 px-1.5 rounded uppercase">{settings.minTitleWords} - {settings.maxTitleWords}</span>
                    </div>
                    <div className="space-y-2 px-1">
                      <input 
                        type="range" 
                        min="1" 
                        max="50" 
                        value={settings.minTitleWords}
                        onChange={(e) => setSettings(prev => ({ ...prev, minTitleWords: Math.min(parseInt(e.target.value), prev.maxTitleWords) }))}
                        className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <input 
                        type="range" 
                        min="1" 
                        max="50" 
                        value={settings.maxTitleWords}
                        onChange={(e) => setSettings(prev => ({ ...prev, maxTitleWords: Math.max(parseInt(e.target.value), prev.minTitleWords) }))}
                        className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">DESCRIPTION WORD RANGE</label>
                      <span className="text-[10px] font-black text-cyan-400 bg-cyan-500/10 px-1.5 rounded uppercase">{settings.minDescriptionWords} - {settings.maxDescriptionWords}</span>
                    </div>
                    <div className="space-y-2 px-1">
                      <input 
                        type="range" 
                        min="5" 
                        max="100" 
                        value={settings.minDescriptionWords}
                        onChange={(e) => setSettings(prev => ({ ...prev, minDescriptionWords: Math.min(parseInt(e.target.value), prev.maxDescriptionWords) }))}
                        className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-cyan-600"
                      />
                      <input 
                        type="range" 
                        min="5" 
                        max="100" 
                        value={settings.maxDescriptionWords}
                        onChange={(e) => setSettings(prev => ({ ...prev, maxDescriptionWords: Math.max(parseInt(e.target.value), prev.minDescriptionWords) }))}
                        className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-cyan-600"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">KEYWORD RANGE</label>
                      <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-1.5 rounded uppercase">{settings.minKeywords} - {settings.maxKeywords}</span>
                    </div>
                    <div className="space-y-2 px-1">
                      <input 
                        type="range" 
                        min="5" 
                        max="50" 
                        value={settings.minKeywords}
                        onChange={(e) => setSettings(prev => ({ ...prev, minKeywords: Math.min(parseInt(e.target.value), prev.maxKeywords) }))}
                        className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-emerald-600"
                      />
                      <input 
                        type="range" 
                        min="5" 
                        max="50" 
                        value={settings.maxKeywords}
                        onChange={(e) => setSettings(prev => ({ ...prev, maxKeywords: Math.max(parseInt(e.target.value), prev.minKeywords) }))}
                        className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-emerald-600"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">BATCH CONCURRENCY</label>
                      <span className="text-[10px] font-black text-blue-400 bg-blue-500/10 px-1.5 rounded uppercase">{settings.concurrency} FILES</span>
                    </div>
                    <div className="space-y-2 px-1">
                      <input 
                        type="range" 
                        min="1" 
                        max="10" 
                        step="1"
                        value={settings.concurrency}
                        onChange={(e) => setSettings(prev => ({ ...prev, concurrency: parseInt(e.target.value) }))}
                        className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex justify-between text-[8px] font-bold text-muted-foreground/50">
                        <span>1</span>
                        <span>3</span>
                        <span>5</span>
                        <span>10</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
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
                className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black px-8 py-2 rounded-sm transition-all shadow-lg uppercase tracking-widest"
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
                      className="text-[10px] font-black bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-sm transition-all shadow-lg uppercase tracking-widest"
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
        onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
        accept={
          settings.metadataFor === 'image' ? ".jpg,.jpeg,.png" :
          settings.metadataFor === 'video' ? ".mp4,.mov" :
          settings.metadataFor === 'eps' ? ".eps" :
          ".jpg,.jpeg,.png,.eps,.mp4,.mov"
        }
      />
      <input 
        type="file" 
        id="folder-upload" 
        {...{ webkitdirectory: "", directory: "" }}
        multiple 
        className="hidden" 
        onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
      />
    </div>
  );

}
