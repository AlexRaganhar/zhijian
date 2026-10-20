import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  FileDown,
  Printer,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface ExportMenuProps {
  onExportMarkdown: () => void;
  onExportHtml: () => void;
  onPrint: () => void;
  onCopyMarkdown: () => void;
  copied?: boolean;
}

export function ExportMenu({
  onExportMarkdown,
  onExportHtml,
  onPrint,
  onCopyMarkdown,
  copied = false,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className="export-menu" ref={wrapperRef}>
      <button
        type="button"
        className={`export-button ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <FileDown size={15} />
        <span>导出</span>
        <ChevronDown size={13} className="export-chevron" />
      </button>

      {open && (
        <div className="export-popover" role="menu" aria-label="导出选项">
          <div className="export-popover-head">
            <span>导出当前文档</span>
            <span className="export-format">MARKDOWN</span>
          </div>
          <button type="button" role="menuitem" onClick={() => run(onExportMarkdown)}>
            <span className="export-item-icon">
              <FileDown size={15} />
            </span>
            <span className="export-item-copy">
              <strong>Markdown 文件</strong>
              <small>.md · 原始内容</small>
            </span>
          </button>
          <button type="button" role="menuitem" onClick={() => run(onExportHtml)}>
            <span className="export-item-icon">
              <Code2 size={15} />
            </span>
            <span className="export-item-copy">
              <strong>网页 HTML</strong>
              <small>带排版与代码高亮</small>
            </span>
            <kbd>Ctrl ⇧ E</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => run(onPrint)}>
            <span className="export-item-icon">
              <Printer size={15} />
            </span>
            <span className="export-item-copy">
              <strong>打印 / PDF</strong>
              <small>只输出文章正文</small>
            </span>
          </button>
          <div className="export-separator" />
          <button type="button" role="menuitem" onClick={() => run(onCopyMarkdown)}>
            <span className="export-item-icon">
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </span>
            <span className="export-item-copy">
              <strong>{copied ? '已复制' : '复制 Markdown'}</strong>
              <small>粘贴到其他编辑器</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
