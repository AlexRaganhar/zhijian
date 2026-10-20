import {
  AlertCircle,
  Check,
  CheckCircle2,
  Code2,
  FileCheck2,
  Focus,
  FolderOpen,
  Info,
  Loader2,
  Minimize2,
  PanelLeftOpen,
  PanelRightOpen,
  PenLine,
  Upload,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { ExportMenu } from './components/ExportMenu';
import { HelpDialog } from './components/HelpDialog';
import { Modal } from './components/Modal';
import { Outline } from './components/Outline';
import { SettingsDialog } from './components/SettingsDialog';
import { Sidebar } from './components/Sidebar';
import { SourceWorkspace } from './components/SourceWorkspace';
import { WysiwygEditor, type WysiwygHandle } from './components/WysiwygEditor';
import {
  basename,
  desktopApi,
  fileTitle,
  normalizePath,
  type DesktopFile,
} from './lib/desktop';
import {
  buildExportHtml,
  extractTitle,
  getOutline,
  getTextStats,
  makeSnippet,
  maybeUpdateTitle,
  safeFilename,
} from './lib/markdown';
import {
  DEFAULT_SETTINGS,
  createEmptyDoc,
  formatClock,
  loadSettings,
  loadWorkspace,
  persistActive,
  persistSettings,
  persistWorkspace,
} from './lib/storage';
import type { Doc, SaveState, Settings, ThemeName, ToastItem, ToastTone } from './types';

type EditorMode = 'wysiwyg' | 'source';

const NEXT_THEME: Record<ThemeName, ThemeName> = {
  paper: 'sepia',
  sepia: 'night',
  night: 'paper',
};

const SAVE_LABEL: Record<SaveState, string> = {
  saved: '已保存',
  saving: '保存中',
  error: '保存失败',
};

const MARKDOWN_FILE = /\.(md|markdown|mdown|mkd|txt)$/i;

function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function printDocument(html: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.style.opacity = '0';
  frame.style.pointerEvents = 'none';
  document.body.appendChild(frame);
  frame.onload = () => {
    window.setTimeout(() => {
      const target = frame.contentWindow;
      if (!target) return;
      target.focus();
      target.print();
    }, 320);
  };
  frame.srcdoc = html;
  window.setTimeout(() => frame.remove(), 60_000);
}

function isFilesDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

function desktopFileToDoc(file: DesktopFile): Doc {
  const now = Date.now();
  return {
    id: createEmptyDoc().id,
    title: extractTitle(file.content) || fileTitle(file.name) || '未命名文档',
    content: file.content,
    createdAt: now,
    updatedAt: now,
    filePath: file.path,
  };
}

export function App() {
  const [{ docs: initialDocs, activeId: initialActiveId }] = useState(loadWorkspace);
  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const [activeId, setActiveId] = useState(initialActiveId);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [mode, setMode] = useState<EditorMode>('wysiwyg');
  const [focusMode, setFocusMode] = useState(false);
  const [search, setSearch] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doc | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const editorRef = useRef<WysiwygHandle>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const toastIdRef = useRef(0);
  const quotaNotifiedRef = useRef(false);
  const autoTitleRef = useRef(true);
  const copiedTimerRef = useRef<number | null>(null);
  const docsRef = useRef(docs);
  const pendingFileWritesRef = useRef<Map<string, string>>(new Map());
  const fileWriteTimersRef = useRef<Map<string, number>>(new Map());
  docsRef.current = docs;

  const activeDoc = docs.find((doc) => doc.id === activeId) ?? docs[0];

  const notify = useCallback((message: string, tone: ToastTone = 'default') => {
    const id = ++toastIdRef.current;
    setToasts((previous) => [...previous.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const closeDelete = useCallback(() => setDeleteTarget(null), []);

  const saveFileToDisk = useCallback(
    async (filePath: string, content: string, announce = false) => {
      if (!desktopApi) return false;
      setSaveState('saving');
      try {
        await desktopApi.saveFile(filePath, content);
        setSaveState('saved');
        if (announce) notify(`已保存到 ${basename(filePath)}`, 'success');
        return true;
      } catch (error) {
        console.error('写入文件失败', filePath, error);
        setSaveState('error');
        notify(`无法写入 ${basename(filePath)}，请检查文件权限。`, 'error');
        return false;
      }
    },
    [notify],
  );

  const flushFileWrites = useCallback(() => {
    if (!desktopApi) return;
    for (const [filePath, content] of pendingFileWritesRef.current) {
      const result = desktopApi.saveFileSync(filePath, content);
      if (!result.ok) console.warn('退出前写入文件失败', filePath, result.message);
    }
    pendingFileWritesRef.current.clear();
    for (const timer of fileWriteTimersRef.current.values()) window.clearTimeout(timer);
    fileWriteTimersRef.current.clear();
  }, []);

  const openDesktopFiles = useCallback(
    (files: DesktopFile[]) => {
      if (!files.length) return;
      const currentDocs = docsRef.current;
      const updates = new Map<string, string>();
      const additions: Doc[] = [];
      let targetId: string | null = null;

      for (const file of files) {
        const existing = currentDocs.find(
          (doc) =>
            doc.filePath && normalizePath(doc.filePath) === normalizePath(file.path),
        );
        if (existing) {
          updates.set(existing.id, file.content);
          targetId ??= existing.id;
        } else {
          const doc = desktopFileToDoc(file);
          additions.push(doc);
          targetId ??= doc.id;
        }
      }

      setDocs((previous) => {
        const next = previous.map((doc) => {
          const content = updates.get(doc.id);
          if (content === undefined) return doc;
          return { ...doc, content, updatedAt: Date.now() };
        });
        return [...additions, ...next];
      });

      if (targetId) {
        autoTitleRef.current = false;
        setActiveId(targetId);
        setMode('wysiwyg');
        setSearch('');
        setFocusMode(false);
        if (window.innerWidth <= 900) {
          setSettings((previous) => ({ ...previous, sidebarOpen: false }));
        }
      }

      const target =
        additions.find((doc) => doc.id === targetId) ??
        docsRef.current.find((doc) => doc.id === targetId);
      notify(
        files.length === 1
          ? `已打开《${target?.title || fileTitle(files[0].name)}》`
          : `已打开 ${files.length} 个文件`,
        'success',
      );
    },
    [notify],
  );

  useEffect(() => {
    if (!desktopApi) return;
    const dispose = desktopApi.onOpenFiles((files) => openDesktopFiles(files));
    void desktopApi
      .ready()
      .then((info) => {
        if (info.files?.length) openDesktopFiles(info.files);
      })
      .catch((error) => console.warn('初始化桌面文件通道失败', error));
    return dispose;
  }, [openDesktopFiles]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.font = settings.font;
  }, [settings.theme, settings.font]);

  useEffect(() => {
    if (window.innerWidth <= 900) {
      setSettings((previous) =>
        previous.sidebarOpen ? { ...previous, sidebarOpen: false } : previous,
      );
    }
  }, []);

  useEffect(() => {
    document.title = `${activeDoc?.title || '纸间'} · 纸间`;
  }, [activeDoc?.title]);

  useEffect(() => {
    try {
      persistSettings(settings);
    } catch {
      // Non-critical; the current session still uses the setting.
    }
  }, [settings]);

  useEffect(() => {
    try {
      persistActive(activeId);
    } catch {
      // No-op; the workspace save below reports errors.
    }
  }, [activeId]);

  useEffect(() => {
    setSaveState('saving');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      try {
        persistWorkspace(docs, activeId);
        setSaveState('saved');
        quotaNotifiedRef.current = false;
      } catch (error) {
        console.error('保存失败', error);
        setSaveState('error');
        if (!quotaNotifiedRef.current) {
          quotaNotifiedRef.current = true;
          notify('本地存储空间不足。请导出备份，或删除含大图的文档。', 'error');
        }
      }
    }, 550);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [docs, activeId, notify]);

  useEffect(() => {
    const flush = () => {
      try {
        persistWorkspace(docs, activeId);
      } catch {
        // Best effort on unload.
      }
      flushFileWrites();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [docs, activeId, flushFileWrites]);

  useEffect(() => {
    if (!docs.some((doc) => doc.id === activeId) && docs[0]) {
      setActiveId(docs[0].id);
    }
  }, [docs, activeId]);

  const stats = useMemo(() => getTextStats(activeDoc?.content ?? ''), [activeDoc?.content]);
  const outline = useMemo(
    () => (mode === 'wysiwyg' ? getOutline(activeDoc?.content ?? '') : []),
    [activeDoc?.content, mode],
  );
  const storageBytes = useMemo(
    () =>
      (JSON.stringify(docs).length + JSON.stringify(settings).length) *
      (typeof TextEncoder === 'undefined' ? 1 : 2),
    [docs, settings],
  );

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
  }, []);

  const updateActiveContent = useCallback(
    (markdown: string) => {
      setDocs((previous) =>
        previous.map((doc) => {
          if (doc.id !== activeId) return doc;
          const nextTitle = autoTitleRef.current
            ? maybeUpdateTitle(doc.title, markdown)
            : doc.title;
          return {
            ...doc,
            content: markdown,
            title: nextTitle,
            updatedAt: Date.now(),
          };
        }),
      );

      const filePath = activeDoc?.filePath;
      if (desktopApi && filePath) {
        pendingFileWritesRef.current.set(filePath, markdown);
        const existing = fileWriteTimersRef.current.get(filePath);
        if (existing) window.clearTimeout(existing);
        const timer = window.setTimeout(() => {
          fileWriteTimersRef.current.delete(filePath);
          pendingFileWritesRef.current.delete(filePath);
          void saveFileToDisk(filePath, markdown);
        }, 650);
        fileWriteTimersRef.current.set(filePath, timer);
      }
    },
    [activeDoc?.filePath, activeId, saveFileToDisk],
  );

  const updateActiveTitle = useCallback(
    (title: string) => {
      autoTitleRef.current = false;
      setDocs((previous) =>
        previous.map((doc) =>
          doc.id === activeId ? { ...doc, title, updatedAt: Date.now() } : doc,
        ),
      );
    },
    [activeId],
  );

  const createDocument = useCallback(() => {
    const doc = createEmptyDoc();
    autoTitleRef.current = true;
    setDocs((previous) => [doc, ...previous]);
    setActiveId(doc.id);
    setMode('wysiwyg');
    setSearch('');
    setFocusMode(false);
    if (window.innerWidth <= 900) {
      setSettings((previous) => ({ ...previous, sidebarOpen: false }));
    }
    window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 80);
    notify('已新建空白文档');
  }, [notify]);

  const switchDocument = useCallback(
    (id: string) => {
      if (!id || id === activeId) return;
      const target = docs.find((doc) => doc.id === id);
      autoTitleRef.current = !target || target.title === '未命名文档';
      setActiveId(id);
      setSearch('');
      setMode('wysiwyg');
      if (window.innerWidth <= 900) {
        setSettings((previous) => ({ ...previous, sidebarOpen: false }));
      }
    },
    [activeId, docs],
  );

  const requestDelete = useCallback((doc: Doc) => {
    setDeleteTarget(doc);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    const index = docs.findIndex((doc) => doc.id === deleteTarget.id);
    const remaining = docs.filter((doc) => doc.id !== deleteTarget.id);

    if (remaining.length === 0) {
      const blank = createEmptyDoc();
      autoTitleRef.current = true;
      setDocs([blank]);
      setActiveId(blank.id);
    } else {
      setDocs(remaining);
      if (deleteTarget.id === activeId) {
        const next = remaining[Math.min(Math.max(index, 0), remaining.length - 1)];
        autoTitleRef.current = next.title === '未命名文档';
        setActiveId(next.id);
      }
    }
    setDeleteTarget(null);
    setMode('wysiwyg');
    notify('文档已删除');
  }, [activeId, deleteTarget, docs, notify]);

  const importFiles = useCallback(
    async (files: File[]) => {
      if (desktopApi) {
        const api = desktopApi;
        const paths = files
          .map((file) => api.getPathForFile(file))
          .filter((filePath): filePath is string => Boolean(filePath));
        if (paths.length === files.length && paths.length > 0) {
          setImporting(true);
          try {
            const results = await Promise.allSettled(
              paths.map((filePath) => api.readFile(filePath)),
            );
            const opened = results
              .filter(
                (result): result is PromiseFulfilledResult<DesktopFile> =>
                  result.status === 'fulfilled',
              )
              .map((result) => result.value);
            if (opened.length > 0) openDesktopFiles(opened);
            const failedCount = results.length - opened.length;
            if (failedCount > 0) notify(`有 ${failedCount} 个文件无法打开`, 'error');
          } finally {
            setImporting(false);
          }
          return;
        }
      }

      const candidates = files.filter(
        (file) => MARKDOWN_FILE.test(file.name) || file.type === 'text/markdown',
      );
      if (candidates.length === 0) {
        notify('请选择 .md、.markdown 或 .txt 文件', 'error');
        return;
      }

      setImporting(true);
      const created: Doc[] = [];
      let failed = 0;
      try {
        for (const file of candidates) {
          if (file.size > 12 * 1024 * 1024) {
            failed += 1;
            continue;
          }
          try {
            const text = await file.text();
            if (!text.trim()) {
              failed += 1;
              continue;
            }
            const now = Date.now() + created.length;
            const filenameTitle = file.name.replace(MARKDOWN_FILE, '').trim();
            created.push({
              id: createEmptyDoc().id,
              title: extractTitle(text) || filenameTitle || '导入的文档',
              content: text,
              createdAt: now,
              updatedAt: now,
            });
          } catch {
            failed += 1;
          }
        }

        if (created.length > 0) {
          setDocs((previous) => [...created, ...previous]);
          setActiveId(created[0].id);
          autoTitleRef.current = false;
          setMode('wysiwyg');
          setSearch('');
          setFocusMode(false);
          if (window.innerWidth <= 900) {
            setSettings((previous) => ({ ...previous, sidebarOpen: false }));
          }
          notify(
            created.length === 1 ? `已导入《${created[0].title}》` : `已导入 ${created.length} 篇文档`,
            'success',
          );
        }
        if (failed > 0) {
          notify(`有 ${failed} 个文件未能导入`, 'error');
        }
      } finally {
        setImporting(false);
      }
    },
    [notify, openDesktopFiles],
  );

  const openFilePicker = useCallback(() => {
    if (desktopApi) {
      void desktopApi
        .openFiles()
        .then((files) => {
          if (files.length > 0) openDesktopFiles(files);
        })
        .catch((error) => {
          console.error(error);
          notify('打开文件失败，请检查文件权限。', 'error');
        });
      return;
    }
    fileInputRef.current?.click();
  }, [notify, openDesktopFiles]);

  const saveNow = useCallback(async () => {
    let localSaved = true;
    try {
      persistWorkspace(docs, activeId);
      setSaveState('saved');
      quotaNotifiedRef.current = false;
    } catch (error) {
      console.error(error);
      setSaveState('error');
      localSaved = false;
      notify('本地存储空间不足，正在尝试写入文件…', 'error');
    }

    if (!desktopApi) {
      if (localSaved) notify('已保存到本地', 'success');
      return;
    }

    if (activeDoc?.filePath) {
      await saveFileToDisk(activeDoc.filePath, activeDoc.content, true);
      return;
    }

    const saved = await desktopApi.saveFileAs(
      `${safeFilename(activeDoc?.title || '未命名文档')}.md`,
      activeDoc?.content ?? '',
    );
    if (!saved) return;
    setDocs((previous) =>
      previous.map((doc) =>
        doc.id === activeId
          ? { ...doc, filePath: saved.path, updatedAt: Date.now() }
          : doc,
      ),
    );
    setSaveState('saved');
    notify(`已保存到 ${saved.name}`, 'success');
  }, [activeDoc, activeId, docs, notify, saveFileToDisk]);

  const exportMarkdown = useCallback(async () => {
    if (!activeDoc) return;
    if (desktopApi) {
      const saved = await desktopApi.saveFileAs(
        `${safeFilename(activeDoc.title)}.md`,
        activeDoc.content,
      );
      if (saved) notify(`Markdown 已保存到 ${saved.name}`, 'success');
      return;
    }
    downloadText(
      activeDoc.content,
      `${safeFilename(activeDoc.title)}.md`,
      'text/markdown;charset=utf-8',
    );
    notify('Markdown 文件已导出', 'success');
  }, [activeDoc, notify]);

  const exportHtml = useCallback(async () => {
    if (!activeDoc) return;
    const html = buildExportHtml(activeDoc.content, activeDoc.title);
    if (desktopApi) {
      const saved = await desktopApi.saveFileAs(
        `${safeFilename(activeDoc.title)}.html`,
        html,
      );
      if (saved) notify(`HTML 已保存到 ${saved.name}`, 'success');
      return;
    }
    downloadText(html, `${safeFilename(activeDoc.title)}.html`, 'text/html;charset=utf-8');
    notify('HTML 文件已导出', 'success');
  }, [activeDoc, notify]);

  const printActive = useCallback(() => {
    if (!activeDoc) return;
    printDocument(buildExportHtml(activeDoc.content, activeDoc.title));
    notify('已打开打印对话框');
  }, [activeDoc, notify]);

  const copyMarkdown = useCallback(async () => {
    if (!activeDoc) return;
    const text = activeDoc.content;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setCopied(true);
    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
    notify('Markdown 已复制到剪贴板', 'success');
  }, [activeDoc, notify]);

  const toggleMode = useCallback(() => {
    setMode((previous) => (previous === 'wysiwyg' ? 'source' : 'wysiwyg'));
  }, []);

  const toggleSidebar = useCallback(() => {
    setSettings((previous) => ({ ...previous, sidebarOpen: !previous.sidebarOpen }));
  }, []);

  const toggleOutline = useCallback(() => {
    if (mode === 'source') {
      setMode('wysiwyg');
      setSettings((previous) => ({ ...previous, outlineOpen: true }));
      return;
    }
    setSettings((previous) => ({ ...previous, outlineOpen: !previous.outlineOpen }));
  }, [mode]);

  const cycleTheme = useCallback(() => {
    setSettings((previous) => ({ ...previous, theme: NEXT_THEME[previous.theme] }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings((previous) => ({
      ...DEFAULT_SETTINGS,
      sidebarOpen: previous.sidebarOpen,
      outlineOpen: previous.outlineOpen,
    }));
    notify('已恢复默认排版');
  }, [notify]);

  const jumpToHeading = useCallback((index: number) => {
    const root = document.querySelector('.paper .ProseMirror');
    const headings = root?.querySelectorAll('h1, h2, h3, h4');
    const target = headings?.[index] as HTMLElement | undefined;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    let counter = 0;
    const onDragEnter = (event: DragEvent) => {
      if (!isFilesDrag(event)) return;
      event.preventDefault();
      counter += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!isFilesDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (event: DragEvent) => {
      if (!isFilesDrag(event)) return;
      counter = Math.max(0, counter - 1);
      if (counter === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!isFilesDrag(event)) return;
      event.preventDefault();
      counter = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) void importFiles(files);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [importFiles]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (event.key === 'Escape' && focusMode) {
        const modalOpen = settingsOpen || helpOpen || Boolean(deleteTarget);
        if (!modalOpen) {
          setFocusMode(false);
          event.preventDefault();
        }
        return;
      }

      if (!mod) return;

      if (key === 'n' && !event.shiftKey) {
        event.preventDefault();
        createDocument();
        return;
      }
      if (key === 's' && !event.shiftKey) {
        event.preventDefault();
        saveNow();
        return;
      }
      if (key === 'o') {
        event.preventDefault();
        openFilePicker();
        return;
      }
      if (key === 'k') {
        event.preventDefault();
        if (!settings.sidebarOpen) {
          setSettings((previous) => ({ ...previous, sidebarOpen: true }));
        }
        window.setTimeout(() => searchInputRef.current?.focus(), 40);
        return;
      }
      if (event.shiftKey && key === 'm') {
        event.preventDefault();
        toggleMode();
        return;
      }
      if (event.shiftKey && key === 'e') {
        event.preventDefault();
        exportHtml();
        return;
      }
      if (event.shiftKey && key === 'f') {
        event.preventDefault();
        setFocusMode((value) => !value);
        return;
      }
      if (event.key === '\\') {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    createDocument,
    deleteTarget,
    exportHtml,
    focusMode,
    helpOpen,
    openFilePicker,
    saveNow,
    settings.sidebarOpen,
    settingsOpen,
    toggleMode,
    toggleSidebar,
  ]);

  if (!activeDoc) return null;

  const appStyle = {
    '--editor-font-size': `${settings.fontSize}px`,
    '--editor-line-height': String(settings.lineHeight),
    '--paper-width': `${settings.paperWidth}px`,
  } as CSSProperties;

  const sidebarVisible = settings.sidebarOpen && !focusMode;
  const outlineVisible = settings.outlineOpen && mode === 'wysiwyg' && !focusMode;

  return (
    <div
      className="app"
      data-theme={settings.theme}
      data-font={settings.font}
      data-sidebar={sidebarVisible ? 'open' : 'closed'}
      data-outline={outlineVisible ? 'open' : 'closed'}
      data-focus={focusMode ? 'true' : 'false'}
      data-mode={mode}
      style={appStyle}
    >
      {sidebarVisible && (
        <Sidebar
          docs={docs}
          activeId={activeDoc.id}
          search={search}
          theme={settings.theme}
          searchInputRef={searchInputRef}
          onSearchChange={setSearch}
          onSelect={switchDocument}
          onCreate={createDocument}
          onImport={openFilePicker}
          onDelete={requestDelete}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          onCycleTheme={cycleTheme}
          onCollapse={toggleSidebar}
        />
      )}

      {sidebarVisible && (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="关闭侧栏"
          onClick={() => setSettings((previous) => ({ ...previous, sidebarOpen: false }))}
        />
      )}

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            {!sidebarVisible && (
              <button
                type="button"
                className="icon-button menu-button"
                onClick={toggleSidebar}
                title="打开侧栏 (Ctrl+\\)"
                aria-label="打开侧栏"
              >
                <PanelLeftOpen size={17} />
              </button>
            )}
            <div className="doc-heading">
              <input
                ref={titleInputRef}
                className="doc-title-input"
                value={activeDoc.title}
                placeholder="未命名文档"
                maxLength={120}
                aria-label="文档标题"
                onChange={(event) => updateActiveTitle(event.target.value)}
                onBlur={() => {
                  if (!activeDoc.title.trim()) updateActiveTitle('未命名文档');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              />
              <div className="doc-meta">
                <span className={`save-indicator ${saveState}`}>
                  {saveState === 'saving' ? (
                    <Loader2 size={11} className="spin" />
                  ) : saveState === 'error' ? (
                    <AlertCircle size={11} />
                  ) : (
                    <Check size={11} />
                  )}
                  {SAVE_LABEL[saveState]}
                </span>
                {activeDoc.filePath && desktopApi && (
                  <>
                    <span className="meta-sep" />
                    <button
                      type="button"
                      className="file-chip"
                      onClick={() => void desktopApi?.reveal(activeDoc.filePath!)}
                      title={`在文件夹中显示：${activeDoc.filePath}`}
                    >
                      <FileCheck2 size={11} />
                      <span>{basename(activeDoc.filePath)}</span>
                    </button>
                  </>
                )}
                <span className="meta-sep" />
                <span>最后编辑 {formatClock(activeDoc.updatedAt)}</span>
                {activeDoc.content.trim() && (
                  <>
                    <span className="meta-sep" />
                    <span className="meta-snippet">{makeSnippet(activeDoc.content)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="topbar-actions">
            {desktopApi && (
              <button
                type="button"
                className="icon-button topbar-icon"
                onClick={openFilePicker}
                title="打开 Markdown 文件 (Ctrl+O)"
                aria-label="打开 Markdown 文件"
              >
                <FolderOpen size={17} />
              </button>
            )}
            <div className="segmented mode-toggle" role="group" aria-label="编辑模式">
              <button
                type="button"
                className={mode === 'wysiwyg' ? 'is-active' : ''}
                onClick={() => setMode('wysiwyg')}
                title="所见即所得"
              >
                <PenLine size={14} />
                <span>编辑</span>
              </button>
              <button
                type="button"
                className={mode === 'source' ? 'is-active' : ''}
                onClick={() => setMode('source')}
                title="Markdown 源码 (Ctrl+Shift+M)"
              >
                <Code2 size={14} />
                <span>源码</span>
              </button>
            </div>

            <button
              type="button"
              className={`icon-button topbar-icon ${outlineVisible ? 'is-active' : ''}`}
              onClick={toggleOutline}
              title="目录"
              aria-label="切换目录"
              aria-pressed={outlineVisible}
            >
              <PanelRightOpen size={17} />
            </button>
            <button
              type="button"
              className="icon-button topbar-icon focus-button"
              onClick={() => setFocusMode(true)}
              title="专注模式 (Ctrl+Shift+F)"
              aria-label="进入专注模式"
            >
              <Focus size={17} />
            </button>
            <ExportMenu
              onExportMarkdown={exportMarkdown}
              onExportHtml={exportHtml}
              onPrint={printActive}
              onCopyMarkdown={() => void copyMarkdown()}
              copied={copied}
            />
          </div>
        </header>

        <div className="workspace">
          {mode === 'wysiwyg' ? (
            <section className="editor-shell" aria-label="编辑器">
              <div className="paper">
                <WysiwygEditor
                  key={activeDoc.id}
                  ref={editorRef}
                  docId={activeDoc.id}
                  initialValue={activeDoc.content}
                  onChange={updateActiveContent}
                  onNotify={notify}
                />
              </div>
            </section>
          ) : (
            <SourceWorkspace
              key={`${activeDoc.id}-${settings.theme}`}
              docId={activeDoc.id}
              value={activeDoc.content}
              theme={settings.theme}
              onChange={updateActiveContent}
            />
          )}

          {outlineVisible && (
            <Outline
              items={outline}
              onSelect={jumpToHeading}
              onClose={() => setSettings((previous) => ({ ...previous, outlineOpen: false }))}
            />
          )}
        </div>

        <footer className="statusbar">
          <div className="status-left">
            <span className={`status-save ${saveState}`}>
              <span className="status-dot" />
              {SAVE_LABEL[saveState]}
            </span>
            <span className="status-sep" />
            <span className="status-mode">
              {mode === 'wysiwyg' ? '所见即所得' : 'Markdown 源码'}
            </span>
            {activeDoc.filePath && (
              <>
                <span className="status-sep" />
                <span className="status-file" title={activeDoc.filePath}>
                  {basename(activeDoc.filePath)}
                </span>
              </>
            )}
          </div>
          <div className="status-tip">
            {mode === 'wysiwyg' ? (
              <>
                按 <kbd>/</kbd> 插入 · 选中文字排版
              </>
            ) : (
              'UTF-8 · GFM · 自动保存'
            )}
          </div>
          <div className="status-right">
            <span>{stats.words.toLocaleString()} 字</span>
            <span className="status-sep" />
            <span>{stats.chars.toLocaleString()} 字符</span>
            <span className="status-sep" />
            <span>约 {stats.readingMinutes} 分钟</span>
          </div>
        </footer>
      </main>

      {focusMode && (
        <button type="button" className="focus-exit" onClick={() => setFocusMode(false)}>
          <Minimize2 size={14} />
          退出专注
          <kbd>Esc</kbd>
        </button>
      )}

      {dragging && (
        <div className="drag-overlay">
          <div className="drag-card">
            {importing ? <Loader2 size={28} className="spin" /> : <Upload size={28} />}
            <strong>{importing ? '正在导入…' : desktopApi ? '松开以打开 Markdown' : '松开以导入 Markdown'}</strong>
            <span>支持 .md / .markdown / .txt</span>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="visually-hidden"
        accept=".md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain"
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length > 0) void importFiles(files);
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        storageBytes={storageBytes}
        isDesktop={Boolean(desktopApi)}
        onOpenDefaultApps={() => void desktopApi?.openDefaultApps()}
        onClose={closeSettings}
        onChange={updateSettings}
        onReset={resetSettings}
      />
      <HelpDialog open={helpOpen} onClose={closeHelp} />

      <Modal
        open={Boolean(deleteTarget)}
        title="删除这篇文档？"
        subtitle="删除后无法撤销，建议先导出备份。"
        onClose={closeDelete}
      >
        <div className="confirm-document">
          <span className="confirm-file-icon">MD</span>
          <div>
            <strong>{deleteTarget?.title || '未命名文档'}</strong>
            <span>
              {getTextStats(deleteTarget?.content ?? '').words.toLocaleString()} 字 · 仅保存在本机
            </span>
          </div>
        </div>
        <div className="confirm-actions">
          <button type="button" className="button ghost" onClick={closeDelete}>
            取消
          </button>
          <button type="button" className="button danger" onClick={confirmDelete}>
            删除文档
          </button>
        </div>
      </Modal>

      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`} role="status">
            {toast.tone === 'success' ? (
              <CheckCircle2 size={15} />
            ) : toast.tone === 'error' ? (
              <AlertCircle size={15} />
            ) : (
              <Info size={15} />
            )}
            <span>{toast.message}</span>
            <button
              type="button"
              aria-label="关闭提示"
              onClick={() =>
                setToasts((previous) => previous.filter((item) => item.id !== toast.id))
              }
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
