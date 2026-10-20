import {
  Coffee,
  FileText,
  FolderOpen,
  HardDrive,
  HelpCircle,
  Moon,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, type RefObject } from 'react';
import { makeSnippet } from '../lib/markdown';
import { formatRelativeTime } from '../lib/storage';
import type { Doc, ThemeName } from '../types';

interface SidebarProps {
  docs: Doc[];
  activeId: string;
  search: string;
  theme: ThemeName;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onImport: () => void;
  onDelete: (doc: Doc) => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onCycleTheme: () => void;
  onCollapse: () => void;
}

const THEME_LABEL: Record<ThemeName, string> = {
  paper: '纸白',
  sepia: '暖褐',
  night: '夜间',
};

export function Sidebar({
  docs,
  activeId,
  search,
  theme,
  searchInputRef,
  onSearchChange,
  onSelect,
  onCreate,
  onImport,
  onDelete,
  onOpenSettings,
  onOpenHelp,
  onCycleTheme,
  onCollapse,
}: SidebarProps) {
  const visibleDocs = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return docs;
    return docs.filter(
      (doc) =>
        doc.title.toLowerCase().includes(keyword) ||
        doc.content.toLowerCase().includes(keyword),
    );
  }, [docs, search]);

  const ThemeIcon = theme === 'night' ? Moon : theme === 'sepia' ? Coffee : Sun;

  return (
    <aside className="sidebar" aria-label="文档列表">
      <div className="brand-row">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            纸
          </span>
          <span className="brand-text">
            <span className="brand-name">纸间</span>
            <span className="brand-sub">ZHIJIAN · MARKDOWN</span>
          </span>
        </div>
        <button
          type="button"
          className="icon-button sidebar-collapse"
          onClick={onCollapse}
          title="收起侧栏 (Ctrl+\\)"
          aria-label="收起侧栏"
        >
          <PanelLeftClose size={17} />
        </button>
      </div>

      <div className="new-doc-row">
        <button type="button" className="new-doc-button" onClick={onCreate}>
          <span className="new-doc-plus">
            <Plus size={16} />
          </span>
          <span>新建文档</span>
          <kbd>Ctrl N</kbd>
        </button>
        <button
          type="button"
          className="import-button"
          onClick={onImport}
          title="打开 Markdown (Ctrl+O)"
          aria-label="打开 Markdown"
        >
          <FolderOpen size={16} />
        </button>
      </div>

      <label className="search-field">
        <Search size={15} aria-hidden="true" />
        <input
          ref={searchInputRef}
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索文档…"
          aria-label="搜索文档"
        />
        {search && (
          <button
            type="button"
            className="search-clear"
            onClick={() => onSearchChange('')}
            aria-label="清除搜索"
          >
            <X size={13} />
          </button>
        )}
      </label>

      <div className="doc-list-head">
        <span>我的文档</span>
        <span className="doc-count">{docs.length}</span>
      </div>

      <div className="doc-list">
        {visibleDocs.map((doc, index) => {
          const active = doc.id === activeId;
          const snippet = makeSnippet(doc.content);
          return (
            <div
              key={doc.id}
              className={`doc-item ${active ? 'is-active' : ''}`}
              style={{ animationDelay: `${Math.min(index, 8) * 22}ms` }}
            >
              <button
                type="button"
                className="doc-open"
                onClick={() => onSelect(doc.id)}
                aria-current={active ? 'page' : undefined}
              >
                <span className="doc-icon">
                  <FileText size={15} />
                </span>
                <span className="doc-copy">
                  <span className="doc-title">{doc.title || '未命名文档'}</span>
                  <span className="doc-snippet">
                    {snippet || (doc.content.trim() ? '空白文档' : '还没有内容')}
                  </span>
                  <span className="doc-time">
                    {formatRelativeTime(doc.updatedAt)}
                    {doc.filePath ? ' · 已关联文件' : ''}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="doc-delete"
                onClick={() => onDelete(doc)}
                title="删除文档"
                aria-label={`删除《${doc.title || '未命名文档'}》`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}

        {visibleDocs.length === 0 && (
          <div className="doc-empty">
            <Search size={19} />
            <p>没有找到“{search.trim()}”</p>
            <button type="button" onClick={() => onSearchChange('')}>
              清除搜索
            </button>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-tools">
          <button
            type="button"
            className="icon-button"
            onClick={onCycleTheme}
            title={`切换主题（当前：${THEME_LABEL[theme]}）`}
            aria-label="切换主题"
          >
            <ThemeIcon size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onOpenSettings}
            title="外观与排版"
            aria-label="打开设置"
          >
            <Settings size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onOpenHelp}
            title="使用指南"
            aria-label="打开使用指南"
          >
            <HelpCircle size={16} />
          </button>
        </div>
        <div className="storage-note">
          <HardDrive size={12} />
          <span>仅保存在本机 · 不上传</span>
        </div>
      </div>
    </aside>
  );
}
