import { ListTree, PanelRightClose } from 'lucide-react';
import type { OutlineItem } from '../types';

interface OutlineProps {
  items: OutlineItem[];
  onSelect: (index: number) => void;
  onClose: () => void;
}

export function Outline({ items, onSelect, onClose }: OutlineProps) {
  return (
    <aside className="outline" aria-label="文档目录">
      <div className="outline-head">
        <div className="outline-title">
          <ListTree size={15} />
          <span>目录</span>
          <span className="outline-count">{items.length}</span>
        </div>
        <button
          type="button"
          className="icon-button small"
          onClick={onClose}
          title="收起目录"
          aria-label="收起目录"
        >
          <PanelRightClose size={15} />
        </button>
      </div>

      {items.length > 0 ? (
        <nav className="outline-list">
          {items.map((item) => (
            <button
              key={`${item.index}-${item.text}`}
              type="button"
              className={`outline-item level-${item.level}`}
              onClick={() => onSelect(item.index)}
              title={item.text}
            >
              <span className="outline-dot" aria-hidden="true" />
              <span>{item.text}</span>
            </button>
          ))}
        </nav>
      ) : (
        <div className="outline-empty">
          <span className="outline-empty-mark">H1</span>
          <p>写下一个标题，这里会自动生成目录。</p>
        </div>
      )}

      <div className="outline-foot">
        <span className="outline-line" />
        <span>点击标题跳转</span>
      </div>
    </aside>
  );
}
