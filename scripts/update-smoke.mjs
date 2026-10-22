import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const CDP_URL = `http://127.0.0.1:${process.env.CDP_PORT || 9444}/json/list`;
const root = path.resolve(import.meta.dirname, '..');
const artifact = path.join(root, 'artifacts');

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

async function waitFor(expression, timeout = 12000) {
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

async function waitForStatus(status, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const state = await evaluate(`window.zhijian.updates.getState()`, true);
    if (state?.status === status) return state;
    if (state?.status === 'error') throw new Error(state.message || 'update failed');
    await sleep(500);
  }
  throw new Error(`Timed out waiting for update status: ${status}`);
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
  version: window.zhijian?.updates ? undefined : 'NO_UPDATES_API',
  statusChip: document.querySelector('.status-update')?.innerText || '',
  hasUpdateApi: Boolean(window.zhijian?.updates)
}))()`);

const before = await evaluate(`window.zhijian.updates.getState()`, true);
const checked = await evaluate(
  `Promise.race([
    window.zhijian.updates.check(),
    new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 20000))
  ])`,
  true,
);

await evaluate(`document.querySelector('.status-update')?.click()`);
await waitFor(`Boolean(document.querySelector('.modal-card'))`, 5000);
await sleep(500);

const dialog = await evaluate(`(() => ({
  title: document.querySelector('.modal-head h2')?.innerText || '',
  hero: document.querySelector('.update-hero')?.innerText || '',
  versionLine: document.querySelector('.update-version-line')?.innerText || '',
  actions: document.querySelector('.update-actions')?.innerText || '',
  footer: document.querySelector('.update-footer')?.innerText || ''
}))()`);

await screenshot('13-update.png');

let download = null;
if (process.env.DOWNLOAD === '1') {
  await evaluate(`document.querySelector('.update-actions .button.primary')?.click()`);
  const state = await waitForStatus('downloaded', 120000);
  await sleep(600);
  const downloadedDialog = await evaluate(`(() => ({
    hero: document.querySelector('.update-hero')?.innerText || '',
    versionLine: document.querySelector('.update-version-line')?.innerText || '',
    actions: document.querySelector('.update-actions')?.innerText || ''
  }))()`);
  await screenshot('14-update-downloaded.png');
  download = { state, dialog: downloadedDialog };
}

await evaluate(`document.querySelector('.modal-close')?.click()`);
await sleep(300);

console.log(
  JSON.stringify(
    {
      initial,
      before,
      checked,
      dialog,
      download,
      consoleErrors,
      exceptions,
    },
    null,
    2,
  ),
);
socket.close();
