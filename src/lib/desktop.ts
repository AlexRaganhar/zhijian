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

export type UpdateStatus =
  | 'idle'
  | 'disabled'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported';

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  releaseName: string | null;
  releaseNotes: string;
  releaseDate: string | null;
  progress: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
  message: string;
  portable: boolean;
  canCheck: boolean;
  canDownload: boolean;
  canInstall: boolean;
  manualDownloadUrl: string;
  checkedAt: number | null;
}

export interface DesktopUpdatesApi {
  getState: () => Promise<UpdateState>;
  check: () => Promise<UpdateState>;
  download: () => Promise<UpdateState>;
  install: () => Promise<{ ok: boolean; message?: string }>;
  openReleasePage: () => Promise<void>;
  setAutoCheck: (enabled: boolean) => Promise<UpdateState>;
  onState: (callback: (state: UpdateState) => void) => () => void;
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
  updates: DesktopUpdatesApi;
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
