import { Code2, Eye, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { renderMarkdown } from '../lib/markdown';
import type { ThemeName } from '../types';
import { SourceEditor } from './SourceEditor';

interface SourceWorkspaceProps {
  docId: string;
  value: string;
  theme: ThemeName;
  onChange: (value: string) => void;
}

export function SourceWorkspace({ docId, value, theme, onChange }: SourceWorkspaceProps) {
  const deferredValue = useDeferredValue(value);
  const previewHtml = useMemo(() => renderMarkdown(deferredValue), [deferredValue]);
  const [previewOpen, setPreviewOpen] = useState(true);

  return (
    <div className={`source-workspace ${previewOpen ? '' : 'preview-collapsed'}`}>
      <section className="source-pane">
        <div className="pane-head">
          <div className="pane-title">
            <Code2 size={14} />
            <span>Markdown 源码</span>
          </div>
          <div className="pane-head-actions">
            <span className="pane-note">UTF-8 · GFM</span>
            <button
              type="button"
              className="pane-icon-button source-preview-toggle"
              onClick={() => setPreviewOpen((open) => !open)}
              title={previewOpen ? '收起预览' : '展开预览'}
              aria-label={previewOpen ? '收起预览' : '展开预览'}
            >
              {previewOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            </button>
          </div>
        </div>
        <div className="source-body">
          <SourceEditor
            key={`${docId}-${theme}`}
            value={value}
            theme={theme}
            onChange={onChange}
          />
        </div>
      </section>

      {previewOpen && (
        <section className="preview-pane">
          <div className="pane-head">
            <div className="pane-title">
              <Eye size={14} />
              <span>实时预览</span>
            </div>
            <span className="pane-note">只读</span>
          </div>
          <div className="preview-scroll">
            {deferredValue.trim() ? (
              <article
                className="markdown-body preview-body"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <div className="preview-empty">
                <span className="preview-empty-mark">¶</span>
                <p>在左侧写下第一句话，这里会同步出现排版效果。</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
