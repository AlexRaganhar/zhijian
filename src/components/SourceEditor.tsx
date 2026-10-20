import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'react';

interface SourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  theme: 'paper' | 'sepia' | 'night';
}

const sourceTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'transparent',
      color: 'var(--ink)',
      fontSize: '14px',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-scroller': {
      fontFamily: 'var(--mono-font)',
      lineHeight: '1.85',
      overflow: 'auto',
    },
    '.cm-content': {
      padding: '30px 28px 140px',
      caretColor: 'var(--accent)',
    },
    '.cm-line': {
      padding: '0 4px',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--faint)',
      border: 'none',
      padding: '30px 0 0 18px',
      fontFamily: 'var(--mono-font)',
      fontSize: '12px',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      minWidth: '26px',
      padding: '0 8px 0 0',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: 'var(--accent)',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--editor-active-line)',
      borderRadius: '4px',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--selection) !important',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--accent)',
      borderLeftWidth: '1.5px',
    },
    '.cm-placeholder': {
      color: 'var(--faint)',
      fontStyle: 'italic',
    },
    '.cm-panels': {
      backgroundColor: 'var(--paper)',
      color: 'var(--ink)',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--paper)',
      border: '1px solid var(--line)',
      color: 'var(--ink)',
    },
  },
);

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, color: 'var(--hl-heading)', fontWeight: '700' },
  { tag: tags.heading2, color: 'var(--hl-heading)', fontWeight: '700' },
  { tag: tags.heading3, color: 'var(--hl-heading)', fontWeight: '650' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], color: 'var(--hl-heading)' },
  { tag: tags.strong, color: 'var(--hl-strong)', fontWeight: '700' },
  { tag: tags.emphasis, color: 'var(--hl-emphasis)', fontStyle: 'italic' },
  { tag: tags.strikethrough, color: 'var(--md-muted)', textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--hl-link)', textDecoration: 'underline' },
  { tag: tags.monospace, color: 'var(--hl-code)' },
  { tag: tags.meta, color: 'var(--hl-meta)' },
  { tag: tags.quote, color: 'var(--hl-quote)', fontStyle: 'italic' },
  { tag: [tags.list, tags.contentSeparator], color: 'var(--hl-list)' },
  { tag: tags.keyword, color: 'var(--hl-keyword)' },
  { tag: tags.string, color: 'var(--hl-string)' },
  { tag: tags.number, color: 'var(--hl-number)' },
  { tag: tags.comment, color: 'var(--hl-comment)', fontStyle: 'italic' },
]);

export function SourceEditor({ value, onChange, theme }: SourceEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        indentOnInput(),
        syntaxHighlighting(markdownHighlight),
        markdown(),
        EditorState.tabSize.of(2),
        EditorView.contentAttributes.of({ 'aria-label': 'Markdown 源码编辑器' }),
        placeholder('在这里写 Markdown…'),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        sourceTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    const timer = window.setTimeout(() => view.focus(), 80);

    return () => {
      window.clearTimeout(timer);
      view.destroy();
      host.innerHTML = '';
    };
    // The document and palette switch remount this component via key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  return <div ref={hostRef} className="source-codemirror" />;
}
