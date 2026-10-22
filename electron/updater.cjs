const { app, BrowserWindow, shell } = require('electron');
const { autoUpdater } = require('electron-updater');

const RELEASES_URL = 'https://github.com/AlexRaganhar/zhijian/releases/latest';
const AUTO_CHECK_DELAY = 5000;
const AUTO_CHECK_INTERVAL = 6 * 60 * 60 * 1000;

function cleanReleaseNotes(value) {
  if (!value) return '';
  let text = '';
  if (Array.isArray(value)) {
    text = value
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const version = item.version ? `v${item.version}\n` : '';
        return `${version}${item.note || ''}`;
      })
      .filter(Boolean)
      .join('\n\n');
  } else {
    text = String(value);
  }

  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 6000);
}

function friendlyError(error) {
  const message = String(error?.message || error || '未知错误');
  if (/ENOTFOUND|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|ETIMEDOUT|ECONNREFUSED/i.test(message)) {
    return '无法连接更新服务器，请检查网络后重试。';
  }
  if (/404|latest\.yml|app-update\.yml|Cannot find/i.test(message)) {
    return '当前版本还没有可用的更新清单，请稍后再试。';
  }
  if (/code signature|signature|publisher/i.test(message)) {
    return '更新包的签名校验未通过，已停止安装。';
  }
  return message.replace(/\s+/g, ' ').slice(0, 240);
}

function createUpdateService({ debugLog = () => {} } = {}) {
  const portable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
  const packaged = app.isPackaged;
  let autoCheckEnabled = false;
  let autoCheckTimer = null;
  let autoCheckInterval = null;
  let initialized = false;

  const state = {
    status: portable ? 'unsupported' : packaged ? 'idle' : 'disabled',
    currentVersion: app.getVersion(),
    availableVersion: null,
    releaseName: null,
    releaseNotes: '',
    releaseDate: null,
    progress: 0,
    bytesPerSecond: 0,
    transferred: 0,
    total: 0,
    message: portable
      ? '便携版不支持自动更新，请下载新版本。'
      : packaged
        ? '检查是否有新版本。'
        : '开发模式不检查更新。',
    portable,
    canCheck: packaged && !portable,
    canDownload: false,
    canInstall: false,
    manualDownloadUrl: RELEASES_URL,
    checkedAt: null,
  };

  function broadcast() {
    const payload = { ...state };
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send('updates:state', payload);
      }
    }
  }

  function setState(patch) {
    Object.assign(state, patch);
    broadcast();
  }

  function beginChecking() {
    setState({
      status: 'checking',
      message: '正在检查更新…',
      progress: 0,
      availableVersion: null,
      releaseName: null,
      releaseNotes: '',
      releaseDate: null,
      canCheck: false,
      canDownload: false,
      canInstall: false,
      checkedAt: Date.now(),
    });
  }

  async function check({ manual = false } = {}) {
    debugLog('update-check', { manual, portable, packaged, status: state.status });
    if (portable) {
      setState({
        status: 'unsupported',
        message: '便携版不支持自动更新，请下载新版本。',
        canCheck: false,
        canDownload: false,
        canInstall: false,
      });
      return { ...state };
    }
    if (!packaged) {
      setState({
        status: 'disabled',
        message: '开发模式不检查更新。',
        canCheck: false,
        canDownload: false,
        canInstall: false,
      });
      return { ...state };
    }
    if (state.status === 'checking' || state.status === 'downloading') {
      return { ...state };
    }

    beginChecking();
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      debugLog('update-check-error', error?.stack || String(error));
      setState({
        status: 'error',
        message: friendlyError(error),
        canCheck: true,
        canDownload: false,
        canInstall: false,
        checkedAt: Date.now(),
      });
    }
    return { ...state };
  }

  async function download() {
    if (portable || !packaged || state.status !== 'available') {
      return { ...state };
    }
    setState({
      status: 'downloading',
      message: '正在下载更新…',
      progress: 0,
      canCheck: false,
      canDownload: false,
      canInstall: false,
    });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      debugLog('update-download-error', error?.stack || String(error));
      setState({
        status: 'error',
        message: friendlyError(error),
        canCheck: true,
        canDownload: false,
        canInstall: false,
      });
    }
    return { ...state };
  }

  function install() {
    if (state.status !== 'downloaded') {
      return { ok: false, message: '更新还没有下载完成。' };
    }
    debugLog('update-install', { version: state.availableVersion });
    // The renderer flushes open files before invoking this. Give the flush one
    // tick to finish before the installer closes the application.
    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(true, true);
      } catch (error) {
        debugLog('update-install-error', error?.stack || String(error));
        setState({
          status: 'error',
          message: friendlyError(error),
          canCheck: true,
          canInstall: true,
        });
      }
    }, 350);
    return { ok: true };
  }

  function setAutoCheck(enabled) {
    autoCheckEnabled = Boolean(enabled);
    if (autoCheckTimer) {
      clearTimeout(autoCheckTimer);
      autoCheckTimer = null;
    }
    if (autoCheckInterval) {
      clearInterval(autoCheckInterval);
      autoCheckInterval = null;
    }
    if (!autoCheckEnabled || !packaged || portable) return { ...state };

    autoCheckTimer = setTimeout(() => {
      autoCheckTimer = null;
      void check({ manual: false });
    }, AUTO_CHECK_DELAY);
    autoCheckInterval = setInterval(() => {
      void check({ manual: false });
    }, AUTO_CHECK_INTERVAL);
    return { ...state };
  }

  function init() {
    if (initialized || !packaged || portable) {
      initialized = true;
      return;
    }
    initialized = true;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = {
      info: (...args) => debugLog('updater-info', ...args),
      warn: (...args) => debugLog('updater-warn', ...args),
      error: (...args) => debugLog('updater-error', ...args),
      debug: (...args) => debugLog('updater-debug', ...args),
    };

    autoUpdater.on('checking-for-update', () => {
      setState({
        status: 'checking',
        message: '正在检查更新…',
        canCheck: false,
        canDownload: false,
        canInstall: false,
      });
    });

    autoUpdater.on('update-available', (info) => {
      debugLog('update-available', info?.version);
      setState({
        status: 'available',
        availableVersion: info?.version || null,
        releaseName: info?.releaseName || null,
        releaseNotes: cleanReleaseNotes(info?.releaseNotes),
        releaseDate: info?.releaseDate || null,
        message: info?.version ? `发现新版本 v${info.version}。` : '发现新版本。',
        canCheck: true,
        canDownload: true,
        canInstall: false,
        checkedAt: Date.now(),
      });
    });

    autoUpdater.on('update-not-available', () => {
      setState({
        status: 'not-available',
        availableVersion: null,
        releaseName: null,
        releaseNotes: '',
        releaseDate: null,
        message: '已经是最新版本。',
        canCheck: true,
        canDownload: false,
        canInstall: false,
        checkedAt: Date.now(),
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.max(0, Math.min(100, Math.round(Number(progress?.percent) || 0)));
      if (state.status === 'downloading' && percent === state.progress) return;
      setState({
        status: 'downloading',
        progress: percent,
        bytesPerSecond: Number(progress?.bytesPerSecond) || 0,
        transferred: Number(progress?.transferred) || 0,
        total: Number(progress?.total) || 0,
        message: `正在下载更新 ${percent}%`,
        canCheck: false,
        canDownload: false,
        canInstall: false,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      debugLog('update-downloaded', info?.version);
      setState({
        status: 'downloaded',
        availableVersion: info?.version || state.availableVersion,
        releaseNotes: cleanReleaseNotes(info?.releaseNotes) || state.releaseNotes,
        progress: 100,
        message: '更新已下载，重启纸间即可安装。',
        canCheck: true,
        canDownload: false,
        canInstall: true,
        checkedAt: Date.now(),
      });
    });

    autoUpdater.on('error', (error) => {
      debugLog('updater-event-error', error?.stack || String(error));
      if (state.status === 'checking' || state.status === 'downloading') {
        setState({
          status: 'error',
          message: friendlyError(error),
          canCheck: true,
          canDownload: false,
          canInstall: false,
          checkedAt: Date.now(),
        });
      }
    });
  }

  function getState() {
    return { ...state };
  }

  function openReleasePage() {
    void shell.openExternal(RELEASES_URL);
  }

  function dispose() {
    if (autoCheckTimer) clearTimeout(autoCheckTimer);
    if (autoCheckInterval) clearInterval(autoCheckInterval);
    autoCheckTimer = null;
    autoCheckInterval = null;
  }

  return {
    init,
    getState,
    check,
    download,
    install,
    setAutoCheck,
    openReleasePage,
    dispose,
    isAutoCheckEnabled: () => autoCheckEnabled,
  };
}

module.exports = { createUpdateService, RELEASES_URL };
