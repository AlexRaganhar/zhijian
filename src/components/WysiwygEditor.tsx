import { Crepe } from '@milkdown/crepe';
import { toggleLinkCommand } from '@milkdown/kit/component/link-tooltip';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import {
  createCodeBlockCommand,
  insertHrCommand,
  insertImageCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark';
import {
  insertTableCommand,
  strikethroughSchema,
  toggleStrikethroughCommand,
} from '@milkdown/kit/preset/gfm';
import { redo, undo } from '@milkdown/kit/prose/history';
import {
  Bold,
  Braces,
  Code,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Undo2,
} from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { imageFileToDataUrl } from '../lib/image';

export interface WysiwygHandle {
  getMarkdown: () => string;
  focus: () => void;
}

interface WysiwygEditorProps {
  docId: string;
  initialValue: string;
  onChange: (markdown: string) => void;
  onNotify?: (message: string, tone?: 'default' | 'success' | 'error') => void;
}

interface ActiveState {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  link: boolean;
  h1: boolean;
  h2: boolean;
  bullet: boolean;
  ordered: boolean;
  quote: boolean;
  codeBlock: boolean;
}

const EMPTY_ACTIVE: ActiveState = {
  bold: false,
  italic: false,
  strike: false,
  code: false,
  link: false,
  h1: false,
  h2: false,
  bullet: false,
  ordered: false,
  quote: false,
  codeBlock: false,
};

function sameActive(a: ActiveState, b: ActiveState): boolean {
  return (Object.keys(a) as (keyof ActiveState)[]).every((key) => a[key] === b[key]);
}

function computeActive(ctx: Ctx): ActiveState {
  const view = ctx.get(editorViewCtx);
  const { selection } = view.state;
  const $from = selection.$from;
  const marks = selection.empty ? (view.state.storedMarks ?? $from.marks()) : $from.marks();
  const markNames = new Set(marks.map((mark) => mark.type.name));
  const ancestors = new Set<string>();
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    ancestors.add($from.node(depth).type.name);
  }
  const parent = $from.parent;

  return {
    bold: markNames.has('strong'),
    italic: markNames.has('emphasis'),
    strike: markNames.has(strikethroughSchema.type(ctx).name),
    code: markNames.has('inlineCode'),
    link: markNames.has('link'),
    h1: parent.type.name === 'heading' && parent.attrs.level === 1,
    h2: parent.type.name === 'heading' && parent.attrs.level === 2,
    bullet: ancestors.has('bullet_list'),
    ordered: ancestors.has('ordered_list'),
    quote: ancestors.has('blockquote'),
    codeBlock: parent.type.name === 'code_block',
  };
}

export const WysiwygEditor = forwardRef<WysiwygHandle, WysiwygEditorProps>(
  function WysiwygEditor({ docId, initialValue, onChange, onNotify }, ref) {
    const rootRef = useRef<HTMLDivElement>(null);
    const crepeRef = useRef<Crepe | null>(null);
    const onChangeRef = useRef(onChange);
    const [active, setActive] = useState<ActiveState>(EMPTY_ACTIVE);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    onChangeRef.current = onChange;

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown: () => crepeRef.current?.getMarkdown() ?? initialValue,
        focus: () => {
          try {
            crepeRef.current?.editor.action((ctx) => {
              ctx.get(editorViewCtx).focus();
            });
          } catch {
            // The editor may still be starting up.
          }
        },
      }),
      [initialValue],
    );

    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      let disposed = false;
      setReady(false);
      setError(null);

      const crepe = new Crepe({
        root,
        defaultValue: initialValue,
        features: {
          [Crepe.Feature.TopBar]: false,
          [Crepe.Feature.AI]: false,
          [Crepe.Feature.Latex]: true,
        },
        featureConfigs: {
          [Crepe.Feature.Placeholder]: {
            text: '输入 / 唤起命令，或直接开始写…',
          },
          [Crepe.Feature.Toolbar]: {
            boldLabel: '加粗',
            italicLabel: '斜体',
            strikethroughLabel: '删除线',
            codeLabel: '行内代码',
            linkLabel: '链接',
            latexLabel: '行内公式',
          },
          [Crepe.Feature.BlockEdit]: {
            textGroup: {
              label: '文本',
              text: { label: '正文' },
              h1: { label: '标题 1' },
              h2: { label: '标题 2' },
              h3: { label: '标题 3' },
              h4: { label: '标题 4' },
              h5: { label: '标题 5' },
              h6: { label: '标题 6' },
              quote: { label: '引用' },
              divider: { label: '分隔线' },
            },
            listGroup: {
              label: '列表',
              bulletList: { label: '无序列表' },
              orderedList: { label: '有序列表' },
              taskList: { label: '待办清单' },
            },
            advancedGroup: {
              label: '插入',
              image: { label: '图片' },
              codeBlock: { label: '代码块' },
              table: { label: '表格' },
              math: { label: '公式块' },
            },
          },
          [Crepe.Feature.ImageBlock]: {
            onUpload: imageFileToDataUrl,
            inlineUploadButton: '上传图片',
            inlineUploadPlaceholderText: '或粘贴图片链接',
            blockUploadButton: '上传图片',
            blockUploadPlaceholderText: '或粘贴图片链接',
            blockCaptionPlaceholderText: '图片说明',
            blockConfirmButton: '确认',
            inlineConfirmButton: '确认',
          },
          [Crepe.Feature.LinkTooltip]: {
            editButton: '编辑',
            removeButton: '移除',
            confirmButton: '确定',
            inputPlaceholder: '粘贴链接…',
          },
        },
      });

      crepeRef.current = crepe;

      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          onChangeRef.current(markdown);
        });
        listener.selectionUpdated((ctx) => {
          setActive((previous) => {
            const next = computeActive(ctx);
            return sameActive(previous, next) ? previous : next;
          });
        });
        listener.updated((ctx) => {
          setActive((previous) => {
            const next = computeActive(ctx);
            return sameActive(previous, next) ? previous : next;
          });
        });
      });

      void crepe
        .create()
        .then(() => {
          if (disposed) {
            void crepe.destroy();
            return;
          }
          crepeRef.current = crepe;
          setReady(true);
        })
        .catch((cause: unknown) => {
          console.error('编辑器初始化失败', cause);
          if (!disposed) {
            setError('编辑器加载失败。请刷新页面重试。');
          }
        });

      return () => {
        disposed = true;
        crepeRef.current = null;
        void crepe.destroy().catch(() => undefined);
        root.innerHTML = '';
      };
    }, [docId]);

    const run = useCallback((action: (ctx: Ctx) => void) => {
      const crepe = crepeRef.current;
      if (!crepe) return;
      try {
        crepe.editor.action(action);
      } catch (cause) {
        console.error('命令执行失败', cause);
      }
    }, []);

    const runAndFocus = useCallback(
      (action: (ctx: Ctx) => void) => {
        run((ctx) => {
          action(ctx);
          ctx.get(editorViewCtx).focus();
        });
      },
      [run],
    );

    const command = (key: unknown, payload?: unknown) => {
      runAndFocus((ctx) => {
        const commands = ctx.get(commandsCtx);
        if (payload === undefined) {
          commands.call(key as never);
        } else {
          commands.call(key as never, payload as never);
        }
      });
    };

    const handleImage = async (file: File) => {
      try {
        const src = await imageFileToDataUrl(file);
        runAndFocus((ctx) => {
          const commands = ctx.get(commandsCtx);
          commands.call(insertImageCommand.key, {
            src,
            alt: file.name.replace(/\.[^.]+$/, ''),
          });
        });
        onNotify?.('图片已插入', 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : '图片插入失败';
        onNotify?.(message, 'error');
      }
    };

    return (
      <div className="wysiwyg">
        <div className="formatbar" aria-label="格式工具栏">
          <div className="formatbar-group">
            <ToolButton
              label="撤销"
              shortcut="Ctrl Z"
              onClick={() =>
                runAndFocus((ctx) => {
                  const view = ctx.get(editorViewCtx);
                  undo(view.state, view.dispatch);
                })
              }
            >
              <Undo2 size={16} />
            </ToolButton>
            <ToolButton
              label="重做"
              shortcut="Ctrl Shift Z"
              onClick={() =>
                runAndFocus((ctx) => {
                  const view = ctx.get(editorViewCtx);
                  redo(view.state, view.dispatch);
                })
              }
            >
              <Redo2 size={16} />
            </ToolButton>
          </div>

          <span className="formatbar-divider" />

          <div className="formatbar-group">
            <ToolButton
              label="标题 1"
              shortcut="Ctrl Alt 1"
              active={active.h1}
              onClick={() => command(wrapInHeadingCommand.key, 1)}
            >
              <Heading1 size={17} />
            </ToolButton>
            <ToolButton
              label="标题 2"
              shortcut="Ctrl Alt 2"
              active={active.h2}
              onClick={() => command(wrapInHeadingCommand.key, 2)}
            >
              <Heading2 size={17} />
            </ToolButton>
            <ToolButton
              label="加粗"
              shortcut="Ctrl B"
              active={active.bold}
              onClick={() => command(toggleStrongCommand.key)}
            >
              <Bold size={16} />
            </ToolButton>
            <ToolButton
              label="斜体"
              shortcut="Ctrl I"
              active={active.italic}
              onClick={() => command(toggleEmphasisCommand.key)}
            >
              <Italic size={16} />
            </ToolButton>
            <ToolButton
              label="删除线"
              shortcut="Ctrl Shift S"
              active={active.strike}
              onClick={() => command(toggleStrikethroughCommand.key)}
            >
              <Strikethrough size={16} />
            </ToolButton>
            <ToolButton
              label="行内代码"
              shortcut="Ctrl E"
              active={active.code}
              onClick={() => command(toggleInlineCodeCommand.key)}
            >
              <Code size={16} />
            </ToolButton>
            <ToolButton
              label="链接"
              active={active.link}
              onClick={() => command(toggleLinkCommand.key)}
            >
              <Link2 size={16} />
            </ToolButton>
          </div>

          <span className="formatbar-divider" />

          <div className="formatbar-group">
            <ToolButton
              label="无序列表"
              active={active.bullet}
              onClick={() => command(wrapInBulletListCommand.key)}
            >
              <List size={16} />
            </ToolButton>
            <ToolButton
              label="有序列表"
              active={active.ordered}
              onClick={() => command(wrapInOrderedListCommand.key)}
            >
              <ListOrdered size={16} />
            </ToolButton>
            <ToolButton
              label="引用"
              active={active.quote}
              onClick={() => command(wrapInBlockquoteCommand.key)}
            >
              <Quote size={16} />
            </ToolButton>
            <ToolButton
              label="代码块"
              active={active.codeBlock}
              onClick={() => command(createCodeBlockCommand.key)}
            >
              <Braces size={16} />
            </ToolButton>
            <ToolButton
              label="表格"
              onClick={() => command(insertTableCommand.key, { row: 3, col: 3 })}
            >
              <Table2 size={16} />
            </ToolButton>
            <ToolButton label="分隔线" onClick={() => command(insertHrCommand.key)}>
              <Minus size={16} />
            </ToolButton>
            <ToolButton label="插入图片" onClick={() => fileInputRef.current?.click()}>
              <ImagePlus size={16} />
            </ToolButton>
          </div>

          <div className="formatbar-fade" aria-hidden="true" />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void handleImage(file);
          }}
        />

        <div className="editor-scroll">
          {!ready && !error && (
            <div className="editor-loading">
              <span className="loading-ink" />
              正在展开纸张…
            </div>
          )}
          {error && <div className="editor-error">{error}</div>}
          <div
            ref={rootRef}
            className={`crepe-root ${ready ? 'is-ready' : ''}`}
            data-doc-id={docId}
          />
        </div>
      </div>
    );
  },
);

interface ToolButtonProps {
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToolButton({ label, shortcut, active = false, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`tool-button ${active ? 'is-active' : ''}`}
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label}  ${shortcut}` : label}
      data-tooltip={shortcut ? `${label}  ${shortcut}` : label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
