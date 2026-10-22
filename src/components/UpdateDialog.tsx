import {
  AlertCircle,
  ArrowUpCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  Power,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type { UpdateState } from '../lib/desktop';
import { Modal } from './Modal';

interface UpdateDialogProps {
  open: boolean;
  state: UpdateState | null;
  autoCheck: boolean;
  onAutoCheckChange: (enabled: boolean) => void;
  onClose: () => void;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
  onOpenReleasePage: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusCopy(state: UpdateState | null): {
  title: string;
  detail: string;
  tone: 'neutral' | 'accent' | 'success' | 'error';
} {
  if (!state) {
    return { title: '正在读取更新状态', detail: '请稍候…', tone: 'neutral' };
  }
  switch (state.status) {
    case 'checking':
      return { title: '正在检查更新', detail: '正在连接 GitHub Releases…', tone: 'neutral' };
    case 'available':
      return {
        title: `发现新版本 v${state.availableVersion ?? ''}`,
        detail: '可以先下载，下载完成后再决定什么时候重启安装。',
        tone: 'accent',
      };
    case 'downloading':
      return {
        title: `正在下载 v${state.availableVersion ?? ''}`,
        detail:
          state.total > 0
            ? `${formatBytes(state.transferred)} / ${formatBytes(state.total)}`
            : state.message,
        tone: 'accent',
      };
    case 'downloaded':
      return {
        title: '更新已准备就绪',
        detail: '重启纸间后会自动完成安装。建议先保存正在编辑的文件。',
        tone: 'success',
      };
    case 'not-available':
      return {
        title: '已经是最新版本',
        detail: `当前版本 v${state.currentVersion}，没有发现更新的版本。`,
        tone: 'success',
      };
    case 'error':
      return { title: '检查更新失败', detail: state.message, tone: 'error' };
    case 'unsupported':
      return {
        title: '便携版不支持自动更新',
        detail:
          '请下载新版便携版 exe，替换旧文件即可。旁边的 ZhijianData 文件夹不会被覆盖。',
        tone: 'neutral',
      };
    case 'disabled':
      return {
        title: '开发模式不检查更新',
        detail: '安装版会从 GitHub Releases 检查更新；当前源码运行模式已禁用更新。',
        tone: 'neutral',
      };
    default:
      return {
        title: '保持纸间最新',
        detail: '安装版会自动检查更新，也可以现在手动检查一次。',
        tone: 'neutral',
      };
  }
}

export function UpdateDialog({
  open,
  state,
  autoCheck,
  onAutoCheckChange,
  onClose,
  onCheck,
  onDownload,
  onInstall,
  onOpenReleasePage,
}: UpdateDialogProps) {
  const copy = statusCopy(state);
  const busy = state?.status === 'checking' || state?.status === 'downloading';
  const isPortable = Boolean(state?.portable);
  const isDev = state?.status === 'disabled';
  const StatusIcon = !state
    ? Loader2
    : state.status === 'checking' || state.status === 'downloading'
      ? Loader2
      : state.status === 'available'
        ? ArrowUpCircle
        : state.status === 'downloaded' || state.status === 'not-available'
          ? CheckCircle2
          : state.status === 'error'
            ? AlertCircle
            : RefreshCw;

  return (
    <Modal
      open={open}
      title="软件更新"
      subtitle="从 GitHub Releases 获取新版本"
      onClose={onClose}
    >
      <section className={`update-hero ${copy.tone}`}>
        <span className="update-hero-icon" aria-hidden="true">
          <StatusIcon size={22} className={busy ? 'spin' : ''} />
        </span>
        <div className="update-hero-copy">
          <strong>{copy.title}</strong>
          <p>{copy.detail}</p>
          {state && (
            <span className="update-version-line">
              v{state.currentVersion}
              {state.availableVersion && state.availableVersion !== state.currentVersion
                ? ` → v${state.availableVersion}`
                : ''}
            </span>
          )}
        </div>
      </section>

      {state?.status === 'downloading' && (
        <div className="update-progress-block">
          <div className="update-progress-head">
            <span>下载进度</span>
            <strong>{state.progress}%</strong>
          </div>
          <div
            className="update-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={state.progress}
          >
            <span style={{ width: `${state.progress}%` }} />
          </div>
          {state.bytesPerSecond > 0 && (
            <span className="update-progress-meta">
              {formatBytes(state.bytesPerSecond)}/s · 下载在后台继续
            </span>
          )}
        </div>
      )}

      {state?.releaseNotes && (
        <section className="update-notes">
          <h3>
            <Sparkles size={14} />
            更新内容
          </h3>
          <p>{state.releaseNotes}</p>
        </section>
      )}

      <div className="update-actions">
        {!state || state.status === 'checking' ? (
          <button type="button" className="button" disabled>
            <Loader2 size={14} className="spin" />
            检查中…
          </button>
        ) : state.status === 'available' ? (
          <button type="button" className="button primary" onClick={onDownload}>
            <Download size={14} />
            下载更新
          </button>
        ) : state.status === 'downloading' ? (
          <button type="button" className="button" disabled>
            <Loader2 size={14} className="spin" />
            后台下载中 {state.progress}%
          </button>
        ) : state.status === 'downloaded' ? (
          <button type="button" className="button primary" onClick={onInstall}>
            <Power size={14} />
            重启并安装
          </button>
        ) : state.status === 'error' ? (
          <button type="button" className="button primary" onClick={onCheck}>
            <RefreshCw size={14} />
            重试
          </button>
        ) : state.status === 'not-available' ? (
          <button type="button" className="button" onClick={onCheck}>
            <RefreshCw size={14} />
            重新检查
          </button>
        ) : state.status === 'idle' ? (
          <button type="button" className="button primary" onClick={onCheck}>
            <RefreshCw size={14} />
            检查更新
          </button>
        ) : (
          <button type="button" className="button primary" onClick={onOpenReleasePage}>
            <ExternalLink size={14} />
            打开发布页
          </button>
        )}

        {state?.status === 'available' && (
          <button type="button" className="button ghost" onClick={onClose}>
            稍后提醒
          </button>
        )}
        {state?.status === 'downloaded' && (
          <button type="button" className="button ghost" onClick={onClose}>
            稍后重启
          </button>
        )}
        {state?.status === 'error' && (
          <button type="button" className="button ghost" onClick={onOpenReleasePage}>
            <ExternalLink size={14} />
            打开发布页
          </button>
        )}
      </div>

      <footer className="update-footer">
        <label className="update-toggle">
          <input
            type="checkbox"
            checked={autoCheck}
            disabled={isPortable || isDev}
            onChange={(event) => onAutoCheckChange(event.target.checked)}
          />
          <span>启动时自动检查更新</span>
        </label>
        <button type="button" className="update-release-link" onClick={onOpenReleasePage}>
          查看所有版本
          <ExternalLink size={12} />
        </button>
      </footer>
    </Modal>
  );
}
