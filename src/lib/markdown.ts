import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import type { OutlineItem, TextStats } from '../types';
import markdownCss from '../markdown.css?raw';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', cpp);
hljs.registerLanguage('css', css);
hljs.registerLanguage('go', go);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);

marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : null;
      if (language) {
        return hljs.highlight(code, { language }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  }),
);

marked.setOptions({
  gfm: true,
  breaks: false,
});

export function renderMarkdown(source: string): string {
  const raw = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
  });
}

const CJK_RE = /[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]/g;
const WORD_RE = /[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*/g;

export function stripMarkdown(source: string): string {
  return source
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/```[^\n]*\r?\n([\s\S]*?)```/g, '$1')
    .replace(/~~~[^\n]*\r?\n([\s\S]*?)~~~/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[`*_~]/g, '')
    .replace(/^\s*([-*_])\s*\1\s*\1[\s\S]*?$/gm, '')
    .trim();
}

export function getTextStats(source: string): TextStats {
  const plain = stripMarkdown(source);
  const cjkCount = plain.match(CJK_RE)?.length ?? 0;
  const words = plain.match(WORD_RE)?.length ?? 0;
  const chars = plain.replace(/\s/g, '').length;
  const readingMinutes = Math.max(1, Math.ceil(cjkCount / 420 + words / 220));
  return {
    chars,
    words: cjkCount + words,
    readingMinutes,
  };
}

export function getOutline(source: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let inFence = false;
  let fenceChar = '';
  let inFrontmatter = false;
  let index = 0;

  source.split(/\r?\n/).forEach((line, lineIndex) => {
    if (lineIndex === 0 && line.trim() === '---') {
      inFrontmatter = true;
      return;
    }
    if (inFrontmatter) {
      if (line.trim() === '---') inFrontmatter = false;
      return;
    }

    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceChar = fence[1][0];
      } else if (fence[1][0] === fenceChar) {
        inFence = false;
      }
      return;
    }
    if (inFence) return;

    const heading = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (!heading) return;

    const text = heading[2]
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[`*_~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return;

    items.push({ level: heading[1].length, text, index });
    index += 1;
  });

  return items;
}

export function extractTitle(source: string): string {
  let inFence = false;
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*(```+|~~~+)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = line.match(/^#\s+(.+?)\s*#*\s*$/);
    if (heading) {
      return cleanInline(heading[1]).slice(0, 80);
    }
  }
  const firstLine = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? cleanInline(firstLine).slice(0, 48) : '';
}

export function maybeUpdateTitle(currentTitle: string, source: string): string {
  const normalized = currentTitle.trim();
  if (normalized && normalized !== '未命名文档') return currentTitle;
  return extractTitle(source) || currentTitle;
}

export function makeSnippet(source: string): string {
  const plain = stripMarkdown(source)
    .replace(/\s+/g, ' ')
    .trim();
  return plain.slice(0, 72);
}

function cleanInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeFilename(title: string): string {
  const clean = title
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || '未命名文档';
}

export function buildExportHtml(source: string, title: string): string {
  const body = renderMarkdown(source);
  const safeTitle = escapeHtml(title || '未命名文档');
  const exportedAt = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${safeTitle}</title>
  <style>
${markdownCss}
${EXPORT_SHELL_CSS}
  </style>
</head>
<body>
  <main class="doc-wrap">
    <article class="doc-paper markdown-body">
      ${body || '<p class="empty-doc">这篇文档还没有内容。</p>'}
    </article>
    <footer class="doc-footer">由 <span class="doc-brand">纸间</span> 导出 · ${escapeHtml(exportedAt)}</footer>
  </main>
</body>
</html>`;
}

const EXPORT_SHELL_CSS = `
:root {
  --md-ink: #302b25;
  --md-muted: #8a8173;
  --md-accent: #b25531;
  --md-line: #e5ddd0;
  --md-surface: #fffdf8;
  --md-soft: #f6f0e6;
  --md-code-bg: #f2ece1;
  --md-font-body: 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', SimSun, Georgia, serif;
  --md-font-title: 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', SimSun, Georgia, serif;
  --md-font-mono: 'Cascadia Code', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  --md-font-size: 17px;
  --md-line-height: 1.9;
  --hl-keyword: #8a3f63;
  --hl-string: #39704f;
  --hl-number: #9c5a2d;
  --hl-comment: #918778;
  --hl-function: #3c628f;
  --hl-type: #7b5b24;
  --hl-attr: #476f73;
  color-scheme: light;
}
* { box-sizing: border-box; }
html { background: #f2efe8; }
body {
  margin: 0;
  padding: 48px 20px 72px;
  background:
    radial-gradient(1100px 520px at 50% -12%, rgba(255, 255, 255, 0.8), transparent 62%),
    #f2efe8;
  color: var(--md-ink);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.doc-wrap { width: 100%; max-width: 820px; margin: 0 auto; }
.doc-paper {
  background: var(--md-surface);
  border: 1px solid rgba(121, 104, 82, 0.12);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(64, 48, 29, 0.04), 0 26px 80px rgba(64, 48, 29, 0.09);
  padding: 70px 84px 84px;
  min-height: 60vh;
}
.doc-footer {
  text-align: center;
  color: #9b9284;
  font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 12px;
  letter-spacing: 0.06em;
  padding-top: 26px;
}
.doc-brand { color: var(--md-accent); font-weight: 600; }
.empty-doc { color: var(--md-muted); font-style: italic; }
@media (max-width: 680px) {
  body { padding: 0; background: var(--md-surface); }
  .doc-wrap { max-width: none; }
  .doc-paper { border: none; border-radius: 0; box-shadow: none; padding: 40px 24px 60px; }
  .doc-footer { padding: 22px 0 28px; }
}
@media print {
  @page { size: A4; margin: 20mm 19mm 22mm; }
  html, body { background: #fff !important; }
  body { padding: 0 !important; }
  .doc-wrap { max-width: none !important; }
  .doc-paper {
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    padding: 0 !important;
    min-height: 0;
  }
  .doc-footer { display: none !important; }
  .markdown-body a { color: inherit; text-decoration: underline; }
  .markdown-body pre, .markdown-body blockquote, .markdown-body table { break-inside: avoid; }
  .markdown-body h1, .markdown-body h2, .markdown-body h3 { break-after: avoid; }
}
`;
