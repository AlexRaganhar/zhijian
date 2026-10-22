import {
  Check,
  Coffee,
  FileCheck2,
  HardDrive,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Type,
} from 'lucide-react';
import type { UpdateState } from '../lib/desktop';
import type { Settings, ThemeName } from '../types';
import { Modal } from './Modal';

interface SettingsDialogProps {
  open: boolean;
  settings: Settings;
  storageBytes: number;
  isDesktop?: boolean;
  appVersion?: string;
  updateState?: UpdateState | null;
  onOpenDefaultApps?: () => void;
  onOpenUpdates?: () => void;
  onClose: () => void;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
}

const THEMES: {
  id: ThemeName;
  name: string;
  description: string;
  icon: typeof Sun;
  colors: [string, string, string];
}[] = [
  {
    id: 'paper',
    name: '纸白',
    description: '干净、明亮',
    icon: Sun,
    colors: ['#fffdf8', '#f1ede4', '#b25531'],
  },
  {
    id: 'sepia',
    name: '暖褐',
    description: '像旧书页',
    icon: Coffee,
    colors: ['#fbf1da', '#ecdfc4', '#9a682f'],
  },
  {
    id: 'night',
    name: '夜间',
    description: '低光环境',
    icon: Moon,
    colors: ['#202225', '#151719', '#e08b5f'],
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SettingsDialog({
  open,
  settings,
  storageBytes,
  isDesktop = false,
  appVersion = '',
  updateState = null,
  onOpenDefaultApps,
  onOpenUpdates,
  onClose,
  onChange,
  onReset,
}: SettingsDialogProps) {
  return (
    <Modal
      open={open}
      title="外观与排版"
      subtitle="所有偏好只保存在这台设备上"
      wide
      onClose={onClose}
    >
      <section className="settings-section">
        <div className="settings-label">
          <Palette size={15} />
          <span>主题</span>
        </div>
        <div className="theme-grid">
          {THEMES.map((theme) => {
            const Icon = theme.icon;
            return (
              <button
                key={theme.id}
                type="button"
                className={`theme-card ${settings.theme === theme.id ? 'is-active' : ''}`}
                onClick={() => onChange({ theme: theme.id })}
                aria-pressed={settings.theme === theme.id}
              >
                <span className="theme-swatches" aria-hidden="true">
                  {theme.colors.map((color) => (
                    <span key={color} style={{ background: color }} />
                  ))}
                </span>
                <span className="theme-card-text">
                  <span className="theme-card-name">
                    <Icon size={14} />
                    {theme.name}
                  </span>
                  <span className="theme-card-desc">{theme.description}</span>
                </span>
                {settings.theme === theme.id && <Check size={16} className="theme-check" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-label">
          <Type size={15} />
          <span>正文</span>
        </div>
        <div className="setting-row">
          <div className="setting-copy">
            <strong>字体</strong>
            <span>衬线适合长文阅读，无衬线更现代</span>
          </div>
          <div className="segmented small">
            <button
              type="button"
              className={settings.font === 'serif' ? 'is-active' : ''}
              onClick={() => onChange({ font: 'serif' })}
            >
              衬线
            </button>
            <button
              type="button"
              className={settings.font === 'sans' ? 'is-active' : ''}
              onClick={() => onChange({ font: 'sans' })}
            >
              无衬线
            </button>
          </div>
        </div>

        <label className="range-row">
          <span className="range-copy">
            <strong>字号</strong>
            <span>{settings.fontSize}px</span>
          </span>
          <input
            type="range"
            min={14}
            max={22}
            step={1}
            value={settings.fontSize}
            onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
          />
        </label>

        <label className="range-row">
          <span className="range-copy">
            <strong>行距</strong>
            <span>{settings.lineHeight.toFixed(1)}</span>
          </span>
          <input
            type="range"
            min={1.5}
            max={2.3}
            step={0.1}
            value={settings.lineHeight}
            onChange={(event) => onChange({ lineHeight: Number(event.target.value) })}
          />
        </label>

        <label className="range-row">
          <span className="range-copy">
            <strong>版心宽度</strong>
            <span>{settings.paperWidth}px</span>
          </span>
          <input
            type="range"
            min={640}
            max={920}
            step={20}
            value={settings.paperWidth}
            onChange={(event) => onChange({ paperWidth: Number(event.target.value) })}
          />
        </label>
      </section>

      <section className="settings-section storage-section">
        <div className="settings-label">
          <HardDrive size={15} />
          <span>本地存储</span>
        </div>
        <p className="storage-copy">
          文档保存在浏览器的 localStorage 中，不会上传到任何服务器。
          当前约占用 <strong>{formatBytes(storageBytes)}</strong>。建议定期导出 Markdown 作为备份。
        </p>
      </section>

      {isDesktop && (
        <section className="settings-section storage-section">
          <div className="settings-label">
            <FileCheck2 size={15} />
            <span>文件关联</span>
          </div>
          <p className="storage-copy">
            安装版会自动注册 .md / .markdown 关联。如果双击文件仍由其他编辑器打开，
            请在 Windows「默认应用」中选择纸间。
          </p>
          <button
            type="button"
            className="button ghost settings-inline-button"
            onClick={onOpenDefaultApps}
          >
            <FileCheck2 size={14} />
            打开 Windows 默认应用设置
          </button>
        </section>
      )}

      {isDesktop && (
        <section className="settings-section storage-section">
          <div className="settings-label">
            <RefreshCw size={15} />
            <span>软件更新</span>
          </div>
          <p className="storage-copy">
            当前版本 <strong>v{appVersion || updateState?.currentVersion || '—'}</strong>。
            {updateState?.portable
              ? ' 便携版请手动下载新版本。'
              : updateState?.status === 'available'
                ? ` 发现新版本 v${updateState.availableVersion ?? ''}。`
                : updateState?.status === 'downloaded'
                  ? ' 更新已下载，重启即可安装。'
                  : ' 安装版会从 GitHub Releases 获取更新。'}
          </p>
          <button
            type="button"
            className="button ghost settings-inline-button"
            onClick={onOpenUpdates}
          >
            <RefreshCw size={14} />
            检查更新
          </button>
        </section>
      )}

      <footer className="settings-footer">
        <button type="button" className="button ghost" onClick={onReset}>
          <RotateCcw size={14} />
          恢复默认
        </button>
        <span className="settings-hint">
          <SlidersHorizontal size={13} />
          修改会即时生效
        </span>
      </footer>
    </Modal>
  );
}
