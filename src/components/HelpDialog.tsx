import { ArrowRight, CircleHelp, Command, Keyboard, Sparkles } from 'lucide-react';
import { Modal } from './Modal';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: [string, string][] = [
  ['新建文档', 'Ctrl + N'],
  ['立即保存', 'Ctrl + S'],
  ['导入 Markdown', 'Ctrl + O'],
  ['切换源码模式', 'Ctrl + Shift + M'],
  ['导出 HTML', 'Ctrl + Shift + E'],
  ['搜索文档', 'Ctrl + K'],
  ['显示 / 隐藏侧栏', 'Ctrl + \\'],
  ['专注模式', 'Ctrl + Shift + F'],
  ['加粗 / 斜体', 'Ctrl + B / Ctrl + I'],
  ['行内代码', 'Ctrl + E'],
  ['关闭弹窗 / 退出专注', 'Esc'],
];

const CHEATSHEET: { syntax: string; result: string }[] = [
  { syntax: '# 标题', result: '一级标题' },
  { syntax: '**加粗**', result: '加粗文字' },
  { syntax: '*斜体*', result: '斜体文字' },
  { syntax: '> 引用', result: '引用段落' },
  { syntax: '- [ ] 待办', result: '任务清单' },
  { syntax: '`代码`', result: '行内代码' },
  { syntax: '```js', result: '代码块' },
  { syntax: '| 表头 |', result: '表格' },
];

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  return (
    <Modal
      open={open}
      title="使用指南"
      subtitle="不用背语法，也能写出干净的 Markdown"
      wide
      onClose={onClose}
    >
      <section className="help-highlight">
        <span className="help-highlight-icon">
          <Sparkles size={18} />
        </span>
        <div>
          <strong>最快的上手方式：在空行输入一个斜杠</strong>
          <p>
            输入 <kbd>/</kbd> 会打开插入菜单，标题、列表、表格、代码块、图片都可以直接选。
            选中一段文字，还会浮出格式工具条。
          </p>
        </div>
      </section>

      <div className="help-columns">
        <section className="help-section">
          <h3>
            <Keyboard size={15} />
            快捷键
          </h3>
          <div className="shortcut-list">
            {SHORTCUTS.map(([label, keys]) => (
              <div key={label} className="shortcut-row">
                <span>{label}</span>
                <kbd>{keys}</kbd>
              </div>
            ))}
          </div>
        </section>

        <section className="help-section">
          <h3>
            <Command size={15} />
            Markdown 速查
          </h3>
          <div className="cheatsheet">
            {CHEATSHEET.map((item) => (
              <div key={item.syntax} className="cheat-row">
                <code>{item.syntax}</code>
                <ArrowRight size={13} />
                <span>{item.result}</span>
              </div>
            ))}
          </div>
          <p className="help-note">
            当然，你完全不需要记住它们。纸间默认就是所见即所得，源码模式只是给需要时准备的。
          </p>
        </section>
      </div>

      <footer className="help-footer">
        <CircleHelp size={14} />
        <span>所有文档都只保存在本机浏览器。记得偶尔导出备份。</span>
      </footer>
    </Modal>
  );
}
