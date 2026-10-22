import type { Doc, Settings } from '../types';
import { WELCOME_MARKDOWN } from './sample';

const DOCS_KEY = 'zhijian.docs.v1';
const ACTIVE_KEY = 'zhijian.active.v1';
const SETTINGS_KEY = 'zhijian.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'paper',
  font: 'serif',
  fontSize: 17,
  lineHeight: 1.9,
  paperWidth: 780,
  sidebarOpen: true,
  outlineOpen: true,
  autoCheckUpdates: true,
};

export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createWelcomeDoc(): Doc {
  const now = Date.now();
  return {
    id: makeId(),
    title: '欢迎来到纸间',
    content: WELCOME_MARKDOWN,
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyDoc(): Doc {
  const now = Date.now();
  return {
    id: makeId(),
    title: '未命名文档',
    content: '',
    createdAt: now,
    updatedAt: now,
  };
}

function isValidDoc(value: unknown): value is Doc {
  if (!value || typeof value !== 'object') return false;
  const doc = value as Partial<Doc>;
  return (
    typeof doc.id === 'string' &&
    typeof doc.title === 'string' &&
    typeof doc.content === 'string' &&
    typeof doc.createdAt === 'number' &&
    typeof doc.updatedAt === 'number'
  );
}

export interface LoadedWorkspace {
  docs: Doc[];
  activeId: string;
}

export function loadWorkspace(): LoadedWorkspace {
  try {
    const raw = localStorage.getItem(DOCS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const docs = parsed.filter(isValidDoc).map((doc) => ({
          ...doc,
          title: doc.title.trim() || '未命名文档',
          filePath:
            typeof doc.filePath === 'string' && doc.filePath.trim()
              ? doc.filePath
              : undefined,
        }));
        if (docs.length > 0) {
          const storedActive = localStorage.getItem(ACTIVE_KEY);
          const activeId = docs.some((doc) => doc.id === storedActive)
            ? (storedActive as string)
            : docs[0].id;
          return { docs, activeId };
        }
      }
    }
  } catch (error) {
    console.warn('无法读取本地文档，已创建新的工作区。', error);
  }

  const welcome = createWelcomeDoc();
  return { docs: [welcome], activeId: welcome.id };
}

export function persistWorkspace(docs: Doc[], activeId: string): void {
  localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
  localStorage.setItem(ACTIVE_KEY, activeId);
}

export function persistActive(activeId: string): void {
  localStorage.setItem(ACTIVE_KEY, activeId);
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const theme =
      parsed.theme === 'sepia' || parsed.theme === 'night' || parsed.theme === 'paper'
        ? parsed.theme
        : DEFAULT_SETTINGS.theme;
    const font =
      parsed.font === 'sans' || parsed.font === 'serif' ? parsed.font : DEFAULT_SETTINGS.font;
    const clamp = (value: unknown, min: number, max: number, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value)
        ? Math.min(max, Math.max(min, value))
        : fallback;

    return {
      theme,
      font,
      fontSize: clamp(parsed.fontSize, 14, 22, DEFAULT_SETTINGS.fontSize),
      lineHeight: clamp(parsed.lineHeight, 1.5, 2.3, DEFAULT_SETTINGS.lineHeight),
      paperWidth: clamp(parsed.paperWidth, 620, 940, DEFAULT_SETTINGS.paperWidth),
      sidebarOpen: parsed.sidebarOpen !== false,
      outlineOpen: parsed.outlineOpen !== false,
      autoCheckUpdates: parsed.autoCheckUpdates !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function persistSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings are non-critical; keep the editor usable even if storage is full.
  }
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < day * 2) return '昨天';

  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return sameYear
    ? `${date.getMonth() + 1} 月 ${date.getDate()} 日`
    : `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
