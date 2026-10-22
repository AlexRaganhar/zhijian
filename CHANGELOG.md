# 更新日志

## 1.1.0 — 2026-10-22

### 新增

- 桌面版软件更新模块：从 GitHub Releases 检查、下载并安装新版本。
- 启动后自动检查，之后每 6 小时检查一次；可在更新弹窗中关闭。
- 状态栏版本入口、设置中的「软件更新」入口、下载进度与重启安装。
- 更新弹窗展示版本变化、更新说明、下载速度和发布页链接。
- 便携版识别：提示手动下载新版本，不尝试自动替换 exe。

### 构建

- 使用 `electron-updater` 与 GitHub provider。
- 发布 Release 时同时上传 `latest.yml` 和 `Zhijian-<version>-setup.exe.blockmap`，用于自动更新与差量下载。
