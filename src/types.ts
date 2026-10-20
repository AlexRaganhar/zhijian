export type ThemeName = 'paper' | 'sepia' | 'night';
export type FontChoice = 'serif' | 'sans';

export interface Doc {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  filePath?: string;
}

export interface Settings {
  theme: ThemeName;
  font: FontChoice;
  fontSize: number;
  lineHeight: number;
  paperWidth: number;
  sidebarOpen: boolean;
  outlineOpen: boolean;
}

export interface OutlineItem {
  level: number;
  text: string;
  index: number;
}

export interface TextStats {
  chars: number;
  words: number;
  readingMinutes: number;
}

export type SaveState = 'saved' | 'saving' | 'error';

export type ToastTone = 'default' | 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}
