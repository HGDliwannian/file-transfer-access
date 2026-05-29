# 快传 (KuaiChuan / file-transfer-access)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-35-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

**English:** A lightweight **personal LAN file transfer** tool for phone ↔ Mac/Windows over a **mobile hotspot**. No cloud, no account, no public relay — original files, real-time sync.

**中文：** 基于手机热点的 **个人局域网快传** 工具，打通手机与个人电脑（Mac/Windows）之间的原图/文件互传，替代「拍照 → 微信 → 电脑」的低效流程。

---

## 目录

- [为什么做这个项目](#为什么做这个项目)
- [功能特性](#功能特性)
- [适用场景与限制](#适用场景与限制)
- [快速开始](#快速开始)
- [使用指南](#使用指南)
- [架构说明](#架构说明)
- [开发与构建](#开发与构建)
- [项目结构](#项目结构)
- [安全说明](#安全说明)
- [参与贡献](#参与贡献)
- [开源协议](#开源协议)
- [致谢](#致谢)

---

## 为什么做这个项目

许多开发者采用「公司内网电脑 + 个人电脑/手机（热点组网）」的工作方式：内网机无法直连个人设备，只能用手机拍照、经微信传到个人电脑，再交给 AI 分析。这条链路步骤多、图片被压缩、效率低。

**快传** 的目标很单纯：在 **同一手机热点** 下，让个人电脑与手机 **秒传原文件**，电脑端实时收到通知、预览、保存，可直接用于后续分析。

更完整的产品背景见 [docs/BACKGROUND.md](docs/BACKGROUND.md)。

---

## 功能特性

| 能力 | 说明 |
|------|------|
| 多端统一界面 | 电脑端 Electron 与手机浏览器共用一套自适应 H5 |
| 扫码 / 地址访问 | 局域网 IP + 二维码，手机连同一热点即可访问 |
| 原文件上传 | 图片、PDF、Office、文本等，不经微信压缩 |
| 实时同步 | SSE 推送，任一端上传，各端列表即时更新 |
| 预览与操作 | 图片/PDF 预览；下载、删除、全部删除 |
| 待上传队列 | 选错文件可单个移除或「全部清掉」 |
| 本机集成 (macOS) | 打开文件、在 Finder 中显示、一键复制到剪贴板 |
| 托盘常驻 | 关闭窗口缩到菜单栏托盘，后台继续服务 |
| 本地自更新 | 本机重新打包后，旧版应用可提示升级（非应用商店分发） |
| 零默认自启 | 默认不开机启动，需用户手动打开或勾选 |

---

## 适用场景与限制

### 适合

- 个人手机热点下的手机 ↔ 个人 Mac/Windows 传图、传文档
- 内网开发场景：手机拍屏幕/文档，个人电脑原图接收
- 临时在同一 WiFi/热点下的多设备文件共享

### 不适合 / 请注意

- **不同热点 / 不同局域网** 的设备无法互访（设计如此，非 Bug）
- **公司内网、公共 WiFi** 请勿运行（服务监听 `0.0.0.0`，无鉴权）
- **非 macOS 签名的 .app** 首次打开需在「系统设置 → 隐私与安全性」中允许，或右键 → 打开
- Windows 安装包需在 Windows 环境执行 `npm run build:win` 构建
- 拷贝给他人的 `.app` **不会**自动收到你本机的升级提示

---

## 快速开始

### 方式一：自行构建（推荐开发者）

```bash
git clone https://github.com/HGDliwannian/file-transfer-access.git
cd file-transfer-access
npm install
npm run build:mac:app    # macOS arm64，产出 dist/mac-arm64/快传.app
# 或
npm run build:win        # Windows（需在 Windows 上执行）
```

打开 `dist/mac-arm64/快传.app`（macOS）或安装 Windows 安装包。

### 方式二：开发模式

```bash
npm install
npm start
```

浏览器访问终端提示的地址，或 Electron 窗口内操作。

### 日常使用

1. **双击打开「快传」**（不打开 = 不运行、不占端口）
2. 电脑与手机连接 **同一手机热点**
3. 手机 **扫码** 或输入窗口内地址
4. 上传文件，默认保存到 **`~/Downloads/快速互传`**

---

## 使用指南

### 电脑端

- **关闭窗口**：缩到菜单栏托盘，服务继续运行
- **彻底退出**：托盘图标 →「退出」
- **开机自启**：侧栏勾选「登录时自动启动」（默认关闭）
- **保存路径**：可修改「保存文件夹」
- **共享文件**：列表支持预览、下载、删除；底部「全部删除」
- **检查更新**：右上角按钮（仅对本机最新构建有效）

### 手机端

- 浏览器打开电脑显示的地址或扫码
- 「拍照」或「选择文件」→「上传到共享区」
- 与电脑端列表实时同步

### 一键脚本（macOS）

| 操作 | 命令 / 文件 |
|------|-------------|
| 完整启用（停旧进程→打包→启动） | `npm run enable` 或双击 `scripts/快传-启用.command` |
| 仅启动已有 .app | `npm run enable:launch` |
| 停止 | `npm run stop` 或双击 `scripts/快传-停止.command` |

---

## 架构说明

```
┌─────────────────┐     同一热点局域网      ┌─────────────────┐
│  手机浏览器 H5   │ ◄──── HTTP :3847 ───► │ Electron 电脑端  │
│  (public/)      │      SSE 实时同步       │  + Express 服务  │
└─────────────────┘                        └─────────────────┘
         │                                           │
         └──────────── 上传/下载/预览 ────────────────┘
                              │
                    ~/Downloads/快速互传
```

| 组件 | 技术 | 路径 |
|------|------|------|
| 桌面壳 | Electron 35 | `electron/` |
| HTTP 服务 | Express + Multer | `server/` |
| 前端 | 原生 HTML/CSS/JS | `public/` |
| 默认端口 | `3847` | `server/index.js` |

详细设计见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 开发与构建

### 环境要求

- **Node.js** ≥ 18
- **npm** ≥ 9
- macOS 打包：在 Apple Silicon Mac 上执行 `build:mac:app`（当前配置为 arm64）
- Windows 打包：在 Windows 上执行 `build:win`

### 常用命令

```bash
npm start              # 开发调试（Electron + 热加载静态资源）
npm run dev            # 同上，带 --dev 标志
npm run build:mac      # macOS DMG
npm run build:mac:app  # macOS .app 目录
npm run build:win      # Windows NSIS 安装包
npm run enable         # 停止 → 打包 → 登记版本 → 启动（见 AGENTS.md）
npm run stop           # 停止运行中的实例
```

### AI / Agent 协作

若使用 Cursor 等 Agent 改码，可参考 [AGENTS.md](AGENTS.md)：改码后执行 `npm run enable` 完成打包与启动。

---

## 项目结构

```
file-transfer-access/
├── electron/           # Electron 主进程、预加载、更新逻辑
├── server/             # Express 文件服务、SSE、API
├── public/             # 统一 H5 界面（index.html, app.js, app.css）
├── scripts/            # 构建、启用、停止脚本
├── docs/               # 背景与设计文档
├── LICENSE             # MIT
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CHANGELOG.md
└── package.json
```

---

## 安全说明

- 服务绑定 **`0.0.0.0:3847`**，同一局域网内任何设备均可访问（无密码）
- 数据 **不经过公网**，不上传第三方服务器
- **仅供个人热点等可信网络**；请勿在公司内网或公共网络部署
- 详见 [SECURITY.md](SECURITY.md)

---

## 参与贡献

欢迎提交 Issue 和 Pull Request！

- [贡献指南](CONTRIBUTING.md)
- [行为准则](CODE_OF_CONDUCT.md)
- [安全报告](SECURITY.md)
- [更新日志](CHANGELOG.md)

---

## 开源协议

本项目采用 [MIT License](LICENSE) 开源。

---

## 致谢

- 灵感来源于局域网快传类产品（如 Snapdrop）的极简思路，本项目为 **个人场景定制、完全本地部署** 的独立实现
- 使用 [Electron](https://www.electronjs.org/)、[Express](https://expressjs.com/)、[Multer](https://github.com/expressjs/multer)、[QRCode](https://github.com/soldair/node-qrcode) 等开源库

---

<p align="center">
  <sub>如果这个项目对你有帮助，欢迎 Star ⭐</sub>
</p>
