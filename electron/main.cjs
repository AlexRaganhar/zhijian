const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const MARKDOWN_EXT = /\.(md|markdown|mdown|mkd|txt)$/i;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const DEBUG_LOG = process.env.ZHIJIAN_DEBUG_LOG;

function debugLog(...args) {
  if (!DEBUG_LOG) return;
  try {
    fs.appendFileSync(
      DEBUG_LOG,
      `${new Date().toISOString()} ${args
        .map((value) => (typeof value === 'string' ? value : JSON.stringify(value)))
        .join(' ')}\n`,
      'utf8',
    );
  } catch {
    // Logging must never break startup.
  }
}

process.on('uncaughtException', (error) => {
  debugLog('uncaughtException', error?.stack || String(error));
});
process.on('unhandledRejection', (error) => {
  debugLog('unhandledRejection', error?.stack || String(error));
});

const customUserData = process.env.ZHIJIAN_USER_DATA;
const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
try {
  if (customUserData) {
    app.setPath('userData', path.resolve(customUserData));
  } else if (portableDir) {
    const portableData = path.join(portableDir, 'ZhijianData');
    fs.mkdirSync(portableData, { recursive: true });
    fs.accessSync(portableData, fs.constants.W_OK);
    app.setPath('userData', portableData);
  }
} catch (error) {
  debugLog('user-data-override-failed', error?.stack || String(error));
}

debugLog('main-start', {
  argv: process.argv,
  isPackaged: app.isPackaged,
  version: app.getVersion(),
  resourcesPath: process.resourcesPath,
  execPath: process.execPath,
  userData: app.getPath('userData'),
  portableDir: portableDir || '',
});

let mainWindow = null;
let rendererReady = false;
let pendingPaths = [];

function parseMarkdownPaths(argv) {
  const result = [];
  for (let raw of argv || []) {
    if (!raw || raw.startsWith('--')) continue;
    if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
    if (!MARKDOWN_EXT.test(raw)) continue;
    try {
      const absolute = path.resolve(raw);
      const stat = fs.statSync(absolute);
      if (stat.isFile()) result.push(absolute);
    } catch {
      // Ignore arguments that are not readable files.
    }
  }
  return [...new Set(result)];
}

function queuePaths(paths) {
  if (!paths || paths.length === 0) return;
  const known = new Set(pendingPaths.map((item) => item.toLowerCase()));
  for (const filePath of paths) {
    if (!known.has(filePath.toLowerCase())) {
      pendingPaths.push(filePath);
      known.add(filePath.toLowerCase());
    }
  }
  if (rendererReady) {
    void flushPendingPaths();
  }
}

async function readMarkdown(filePath) {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile()) throw new Error('不是文件');
  if (stat.size > MAX_FILE_SIZE) throw new Error('文件超过 25 MB');
  const content = await fsp.readFile(filePath, 'utf8');
  return {
    path: filePath,
    name: path.basename(filePath),
    content,
    mtimeMs: stat.mtimeMs,
  };
}

async function readMany(paths) {
  const files = [];
  for (const filePath of paths) {
    try {
      files.push(await readMarkdown(filePath));
    } catch (error) {
      console.warn('无法读取文件', filePath, error);
    }
  }
  return files;
}

async function flushPendingPaths(notifyRenderer = true) {
  if (!rendererReady || pendingPaths.length === 0) return [];
  const paths = pendingPaths;
  pendingPaths = [];
  const files = await readMany(paths);
  if (notifyRenderer && files.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('file:open', files);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  return files;
}

function createWindow() {
  debugLog('create-window', { userData: app.getPath('userData') });
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 880,
    minHeight: 620,
    show: false,
    title: '纸间',
    backgroundColor: '#f2efe8',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    debugLog('ready-to-show');
    mainWindow.show();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    debugLog('did-finish-load');
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    debugLog('did-fail-load', { code, description, url });
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    debugLog('render-process-gone', details);
  });

  mainWindow.on('closed', () => {
    debugLog('window-closed');
    mainWindow = null;
    rendererReady = false;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    debugLog('load-url', process.env.VITE_DEV_SERVER_URL);
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    debugLog('load-file', indexPath);
    void mainWindow.loadFile(indexPath).catch((error) => {
      debugLog('load-file-error', error?.stack || String(error));
    });
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
debugLog('single-instance-lock', gotSingleInstanceLock);

if (!gotSingleInstanceLock) {
  debugLog('quitting-no-lock');
  app.quit();
} else {
  app.on('before-quit', () => debugLog('before-quit'));
  app.on('will-quit', () => debugLog('will-quit'));
  app.on('second-instance', (_event, argv) => {
    queuePaths(parseMarkdownPaths(argv));
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    queuePaths([filePath]);
  });

  app.whenReady().then(() => {
    debugLog('app-ready', { userData: app.getPath('userData') });
    app.setAppUserModelId('com.zhijian.markdown');
    Menu.setApplicationMenu(null);
    queuePaths(parseMarkdownPaths(process.argv));
    createWindow();

    ipcMain.handle('app:renderer-ready', async () => {
      rendererReady = true;
      const files = await flushPendingPaths(false);
      return {
        version: app.getVersion(),
        platform: process.platform,
        files,
      };
    });

    ipcMain.handle('file:open-dialog', async () => {
      if (!mainWindow) return [];
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '打开 Markdown 文件',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Markdown 文档', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });
      if (result.canceled) return [];
      return readMany(result.filePaths);
    });

    ipcMain.handle('file:read', async (_event, filePath) => {
      if (typeof filePath !== 'string' || !filePath) throw new Error('无效的文件路径');
      return readMarkdown(filePath);
    });

    ipcMain.handle('file:save', async (_event, payload) => {
      const filePath = typeof payload?.filePath === 'string' ? payload.filePath : '';
      const content = typeof payload?.content === 'string' ? payload.content : '';
      if (!filePath) throw new Error('无效的文件路径');
      await fsp.writeFile(filePath, content, 'utf8');
      const stat = await fsp.stat(filePath);
      return { path: filePath, name: path.basename(filePath), mtimeMs: stat.mtimeMs };
    });

    ipcMain.handle('file:save-as', async (_event, payload) => {
      if (!mainWindow) return null;
      const defaultName =
        typeof payload?.defaultName === 'string' && payload.defaultName
          ? payload.defaultName
          : '未命名文档.md';
      const content = typeof payload?.content === 'string' ? payload.content : '';
      const extension = path.extname(defaultName).slice(1).toLowerCase() || 'md';
      const isHtml = extension === 'html' || extension === 'htm';
      const result = await dialog.showSaveDialog(mainWindow, {
        title: isHtml ? '导出 HTML' : '保存 Markdown 文件',
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: isHtml
          ? [{ name: '网页 HTML', extensions: ['html'] }]
          : [
              { name: 'Markdown 文档', extensions: ['md', 'markdown'] },
              { name: '所有文件', extensions: ['*'] },
            ],
      });
      if (result.canceled || !result.filePath) return null;
      await fsp.writeFile(result.filePath, content, 'utf8');
      const stat = await fsp.stat(result.filePath);
      return { path: result.filePath, name: path.basename(result.filePath), mtimeMs: stat.mtimeMs };
    });

    ipcMain.handle('file:reveal', async (_event, filePath) => {
      if (typeof filePath === 'string' && filePath) shell.showItemInFolder(filePath);
    });

    ipcMain.handle('app:open-default-apps', async () => {
      await shell.openExternal('ms-settings:defaultapps');
    });

    ipcMain.on('file:save-sync', (event, payload) => {
      try {
        const filePath = typeof payload?.filePath === 'string' ? payload.filePath : '';
        const content = typeof payload?.content === 'string' ? payload.content : '';
        if (!filePath) throw new Error('无效的文件路径');
        fs.writeFileSync(filePath, content, 'utf8');
        event.returnValue = { ok: true };
      } catch (error) {
        event.returnValue = { ok: false, message: error.message };
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
