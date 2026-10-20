import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CDP_URL = `http://127.0.0.1:${process.env.CDP_PORT || 9333}/json/list`;
const root = path.resolve(import.meta.dirname, '..');
const artifact = path.join(root, 'artifacts');
const fixture = path.join(artifact, 'desktop-test.md');

const targets = await fetch(CDP_URL).then((response) => response.json());
const page = targets.find((target) => target.type === 'page' && target.url.includes('index.html'));
if (!page) throw new Error('Electron page not found');

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

async function waitFor(expression, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await evaluate(expression)) return true;
    } catch {
      // Keep polling.
    }
    await sleep(120);
  }
  throw new Error(`Timed out: ${expression}`);
}

async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(path.join(artifact, name), Buffer.from(result.data, 'base64'));
}

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await waitFor(`Boolean(document.querySelector('.crepe-root .ProseMirror'))`, 15000);
await sleep(800);

const initial = await evaluate(`(() => ({
  desktop: Boolean(window.zhijian?.isDesktop),
  title: document.querySelector('.doc-title-input')?.value || '',
  titleFile: document.querySelector('.file-chip')?.innerText || '',
  docs: document.querySelectorAll('.doc-item').length,
  status: document.querySelector('.status-file')?.innerText || '',
  platform: window.zhijian?.platform || ''
}))()`);

await screenshot('12-electron.png');

await evaluate(`document.querySelector('button[title^="Markdown 源码"]')?.click()`);
await waitFor(`Boolean(document.querySelector('.cm-content'))`);
await sleep(400);
await evaluate(`document.querySelector('.cm-content')?.focus()`);
await send('Input.dispatchKeyEvent', {
  type: 'keyDown',
  modifiers: 2,
  key: 'End',
  code: 'End',
  windowsVirtualKeyCode: 35,
  nativeVirtualKeyCode: 35,
});
await send('Input.dispatchKeyEvent', {
  type: 'keyUp',
  modifiers: 2,
  key: 'End',
  code: 'End',
  windowsVirtualKeyCode: 35,
  nativeVirtualKeyCode: 35,
});
await send('Input.insertText', { text: '\n\n桌面端自动保存测试。\n' });
await sleep(1800);

const diskContent = await readFile(fixture, 'utf8');
const afterSave = await evaluate(`(() => ({
  saveState: document.querySelector('.save-indicator')?.innerText || '',
  status: document.querySelector('.statusbar')?.innerText || '',
  sourceLength: document.querySelector('.cm-content')?.innerText.length || 0
}))()`);

const report = {
  initial,
  autoSavedToDisk: diskContent.includes('桌面端自动保存测试。'),
  afterSave,
  consoleErrors,
  exceptions,
};
console.log(JSON.stringify(report, null, 2));
socket.close();
