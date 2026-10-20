import { writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const APP_URL = 'http://127.0.0.1:5173/';
const CDP_URL = 'http://127.0.0.1:9222/json/list';
const root = path.resolve(import.meta.dirname, '..');
const artifacts = path.join(root, 'artifacts');
const downloads = path.join(artifacts, `downloads-${Date.now()}`);
const importFile = path.join(artifacts, 'import-test.md');

await mkdir(downloads, { recursive: true });

const targets = await fetch(CDP_URL).then((response) => response.json());
const page = targets.find((target) => target.type === 'page' && target.url.startsWith('http://127.0.0.1:5173'));
if (!page) throw new Error('No app page found in Chrome');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});

let nextId = 0;
const pending = new Map();
const consoleErrors = [];
const exceptions = [];

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    exceptions.push(message.params.exceptionDetails?.text || 'unknown exception');
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(
      message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '),
    );
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    consoleErrors.push(message.params.entry.text);
  }
};

function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluate(expression, awaitPromise = false) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(expression, timeout = 8000, interval = 120) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(expression)) return true;
    } catch {
      // Keep polling while React mounts.
    }
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function screenshot(name) {
  const result = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path.join(artifacts, name), Buffer.from(result.data, 'base64'));
}

async function setInput(selector, value) {
  return evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
}

async function click(selector) {
  return evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.click();
    return true;
  })()`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('DOM.enable');
await send('Emulation.clearDeviceMetricsOverride');
try {
  await send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloads,
    eventsEnabled: true,
  });
} catch {
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
}

await waitFor(`Boolean(document.querySelector('.crepe-root .ProseMirror'))`, 15000);
await sleep(900);

// Start from a clean localStorage without letting beforeunload flush the old workspace.
await evaluate(`(() => {
  localStorage.clear();
  Storage.prototype.setItem = function () { throw new Error('reset'); };
  location.reload();
  return true;
})()`);
await waitFor(`Boolean(document.querySelector('.crepe-root .ProseMirror'))`, 15000);
await sleep(900);
await screenshot('01-paper.png');

const initial = await evaluate(`(() => ({
  title: document.title,
  editor: Boolean(document.querySelector('.crepe-root .ProseMirror')),
  heading: document.querySelector('.crepe-root .ProseMirror h1')?.innerText || '',
  sidebarDocs: document.querySelectorAll('.doc-item').length,
  outlineItems: document.querySelectorAll('.outline-item').length,
  theme: document.documentElement.dataset.theme,
  words: document.querySelector('.status-right')?.innerText || ''
}))()`);

// New document + title + source-mode input
await click('.new-doc-button');
await sleep(650);
await setInput('.doc-title-input', '深夜测试');
await sleep(250);
await click('button[title^="Markdown 源码"]');
await waitFor(`Boolean(document.querySelector('.cm-content'))`);
await evaluate(`document.querySelector('.cm-content').focus()`);
await send('Input.insertText', {
  text: '# 深夜测试\n\n这是通过源码模式写入的内容。\n\n- 第一项\n- 第二项\n\n> 写下来，再慢慢改好。\n',
});
await sleep(700);
const sourceText = await evaluate(
  `document.querySelector('.cm-content')?.innerText || ''`,
);
await screenshot('02-source.png');

await click('button[title="所见即所得"]');
await waitFor(`Boolean(document.querySelector('.crepe-root .ProseMirror h1'))`);
await sleep(600);
const afterModeSwitch = await evaluate(`(() => ({
  heading: document.querySelector('.crepe-root .ProseMirror h1')?.innerText || '',
  title: document.querySelector('.doc-title-input')?.value || '',
  docs: document.querySelectorAll('.doc-item').length
}))()`);

// Select all and apply bold through the toolbar, then undo.
await evaluate(`document.querySelector('.crepe-root .ProseMirror').focus()`);
await send('Input.dispatchKeyEvent', {
  type: 'keyDown',
  modifiers: 2,
  key: 'a',
  code: 'KeyA',
  windowsVirtualKeyCode: 65,
  nativeVirtualKeyCode: 65,
});
await send('Input.dispatchKeyEvent', {
  type: 'keyUp',
  modifiers: 2,
  key: 'a',
  code: 'KeyA',
  windowsVirtualKeyCode: 65,
  nativeVirtualKeyCode: 65,
});
await sleep(200);
await click('.tool-button[aria-label="加粗"]');
await sleep(450);
const boldApplied = await evaluate(
  `Boolean(document.querySelector('.crepe-root .ProseMirror strong'))`,
);
await send('Input.dispatchKeyEvent', {
  type: 'keyDown',
  modifiers: 2,
  key: 'z',
  code: 'KeyZ',
  windowsVirtualKeyCode: 90,
  nativeVirtualKeyCode: 90,
});
await send('Input.dispatchKeyEvent', {
  type: 'keyUp',
  modifiers: 2,
  key: 'z',
  code: 'KeyZ',
  windowsVirtualKeyCode: 90,
  nativeVirtualKeyCode: 90,
});
await sleep(350);

// Focus mode
await click('button[aria-label="进入专注模式"]');
await sleep(500);
const focusMode = await evaluate(`(() => ({
  topbarHidden: getComputedStyle(document.querySelector('.topbar')).display === 'none',
  exitVisible: Boolean(document.querySelector('.focus-exit'))
}))()`);
await screenshot('08-focus.png');
await click('.focus-exit');
await sleep(350);

await sleep(1200);
const persisted = await evaluate(`(() => {
  const docs = JSON.parse(localStorage.getItem('zhijian.docs.v1') || '[]');
  return docs.map((doc) => ({ title: doc.title, hasContent: doc.content.includes('源码模式写入') }));
})()`);

// Reload and confirm persistence
await send('Page.reload', { ignoreCache: true });
await waitFor(`Boolean(document.querySelector('.crepe-root .ProseMirror'))`, 15000);
await sleep(900);
const afterReload = await evaluate(`(() => ({
  title: document.querySelector('.doc-title-input')?.value || '',
  heading: document.querySelector('.crepe-root .ProseMirror h1')?.innerText || '',
  docs: document.querySelectorAll('.doc-item').length,
  activeDocs: [...document.querySelectorAll('.doc-item.is-active .doc-title')].map((element) => element.innerText)
}))()`);

// Theme cycle + screenshot
await click('button[aria-label="切换主题"]');
await sleep(500);
const afterTheme = await evaluate(`document.documentElement.dataset.theme`);
await screenshot('03-sepia.png');

// Settings modal + night theme
await click('button[aria-label="打开设置"]');
await waitFor(`Boolean(document.querySelector('.theme-card'))`);
await click('.theme-card:nth-child(3)');
await sleep(500);
await screenshot('04-night-settings.png');
const night = await evaluate(`document.documentElement.dataset.theme`);
await click('.modal-close');
await sleep(350);
await screenshot('05-night.png');

// Export downloads
await click('.export-button');
await sleep(250);
const exportMarkdownClicked = await evaluate(`(() => {
  const button = [...document.querySelectorAll('.export-popover button')].find((item) => item.innerText.includes('Markdown 文件'));
  if (!button) return false;
  button.click();
  return true;
})()`);
await sleep(900);
await click('.export-button');
await sleep(250);
const exportHtmlClicked = await evaluate(`(() => {
  const button = [...document.querySelectorAll('.export-popover button')].find((item) => item.innerText.includes('网页 HTML'));
  if (!button) return false;
  button.click();
  return true;
})()`);
await sleep(1400);
const downloaded = existsSync(downloads) ? await readdir(downloads) : [];

// Import via CDP file input
const documentNode = await send('DOM.getDocument', { depth: -1, pierce: true });
const inputNode = await send('DOM.querySelector', {
  nodeId: documentNode.root.nodeId,
  selector: 'input[accept*=".md"]',
});
await send('DOM.setFileInputFiles', {
  nodeId: inputNode.nodeId,
  files: [importFile],
});
await sleep(1500);
const imported = await evaluate(`(() => ({
  docs: document.querySelectorAll('.doc-item').length,
  titles: [...document.querySelectorAll('.doc-title')].map((element) => element.innerText),
  activeTitle: document.querySelector('.doc-title-input')?.value || ''
}))()`);
await screenshot('06-imported.png');

// Delete the imported document
await evaluate(`(() => {
  const card = [...document.querySelectorAll('.doc-item')].find((item) => item.innerText.includes('导入测试'));
  if (!card) return false;
  card.querySelector('.doc-delete').click();
  return true;
})()`);
await sleep(350);
const confirmOpen = await evaluate(`Boolean(document.querySelector('.modal-card'))`);
await click('.button.danger');
await sleep(600);
const afterDelete = await evaluate(`(() => ({
  docs: document.querySelectorAll('.doc-item').length,
  titles: [...document.querySelectorAll('.doc-title')].map((element) => element.innerText)
}))()`);

// Mobile layout
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await send('Page.reload', { ignoreCache: true });
await waitFor(`Boolean(document.querySelector('.crepe-root .ProseMirror'))`, 15000);
await sleep(900);
const mobile = await evaluate(`(() => ({
  width: innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  sidebarExists: Boolean(document.querySelector('.sidebar')),
  sidebarDisplay: document.querySelector('.sidebar') ? getComputedStyle(document.querySelector('.sidebar')).display : null,
  topbar: Boolean(document.querySelector('.topbar'))
}))()`);
await screenshot('07-mobile.png');

const report = {
  initial,
  sourceText: sourceText.slice(0, 180),
  afterModeSwitch,
  boldApplied,
  focusMode,
  persisted,
  afterReload,
  afterTheme,
  night,
  exportMarkdownClicked,
  exportHtmlClicked,
  downloaded,
  imported,
  confirmOpen,
  afterDelete,
  mobile,
  consoleErrors,
  exceptions,
};
console.log(JSON.stringify(report, null, 2));
socket.close();
