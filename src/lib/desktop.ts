export interface DesktopFile {
  path: string;
  name: string;
  content: string;
  mtimeMs: number;
}

export interface DesktopReadyInfo {
  version: string;
  platform: string;
  files: DesktopFile[];
}

export interface DesktopSaveResult {
  path: string;
  name: string;
  mtimeMs: number;
}

export interface DesktopApi {
  isDesktop: true;
  platform: string;
  ready: () => Promise<DesktopReadyInfo>;
  openFiles: () => Promise<DesktopFile[]>;
  readFile: (filePath: string) => Promise<DesktopFile>;
  saveFile: (filePath: string, content: string) => Promise<DesktopSaveResult>;
  saveFileAs: (defaultName: string, content: string) => Promise<DesktopSaveResult | null>;
  reveal: (filePath: string) => Promise<void>;
  openDefaultApps: () => Promise<void>;
  saveFileSync: (filePath: string, content: string) => { ok: boolean; message?: string };
  getPathForFile: (file: File) => string;
  onOpenFiles: (callback: (files: DesktopFile[]) => void) => () => void;
}

declare global {
  interface Window {
    zhijian?: DesktopApi;
  }
}

export const desktopApi: DesktopApi | undefined =
  typeof window !== 'undefined' ? window.zhijian : undefined;

export function basename(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

export function normalizePath(filePath: string): string {
  return filePath.replace(/\//g, '\\').toLowerCase();
}

export function fileTitle(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim();
}
