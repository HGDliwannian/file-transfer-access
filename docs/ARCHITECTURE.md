# 架构文档

## 总览

快传采用 **单进程 Electron 应用 + 内嵌 Express HTTP 服务** 的架构。所有设备（电脑本机、手机浏览器）访问同一套静态页面与 REST/SSE API。

```
┌──────────────────────────────────────────────────────────┐
│                    Electron Main Process                  │
│  electron/main.js                                         │
│  · BrowserWindow + Tray                                   │
│  · IPC: 设置、打开文件夹、复制文件、检查更新               │
│  · 启动 createServer()                                    │
└─────────────────────────┬────────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────┐
│              Express Server (server/index.js)               │
│  · GET  /              → public/index.html                │
│  · GET  /api/status    → IP、端口、URL                     │
│  · GET  /api/files     → 文件列表                          │
│  · POST /api/upload    → 多文件上传 (multer)               │
│  · DELETE /api/files   → 全部删除                          │
│  · DELETE /api/files/:name → 单文件删除                    │
│  · GET  /files/:name   → 静态文件下载                      │
│  · GET  /events        → SSE 实时事件 (upload/delete)      │
└─────────────────────────┬────────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────┐
│                   Renderer (public/)                        │
│  · is-electron 检测 → 显示本机设置、版本、更新 UI          │
│  · EventSource 订阅 /events                                │
│  · 上传 FormData、列表渲染、预览、确认弹窗                  │
└──────────────────────────────────────────────────────────┘
```

## 数据流

### 上传

1. 客户端 `POST /api/upload`，字段名 `files`（多文件）
2. Multer 写入 `saveDir`，文件名格式：`原名_时间戳.扩展名`
3. 中文文件名经 `latin1 → utf8` 修正
4. `EventEmitter` 触发 `upload`，SSE 广播给所有连接端
5. Electron 主进程 `onUpload` 回调可发系统通知

### 删除

- 单删：`DELETE /api/files/:name`
- 全删：`DELETE /api/files`
- SSE 事件 `delete` 触发各端 `refreshFiles()`

### 访问地址

- 本机：`http://127.0.0.1:3847/`
- 局域网：`http://<LAN_IP>:3847/`（`getLanIp()` 优选非虚拟网卡 IPv4）
- 二维码内容指向局域网 URL，供手机扫码

## 配置与持久化

| 项 | 存储位置 |
|----|----------|
| 保存目录、开机自启、忽略的版本 | `~/Library/Application Support/snapdrop-personal/config.json` (macOS) |
| 最新构建信息（自更新） | `~/Library/Application Support/snapdrop-personal/latest-release.json` |
| 构建元数据 | `public/build-info.json`（构建时生成，gitignore） |

默认保存目录：`~/Downloads/快速互传`

## 打包

- **electron-builder** 打包 `electron/`、`server/`、`public/` 进 asar
- macOS 产物：`dist/mac-arm64/快传.app`
- `scripts/finalize-build.js` 清理多余的 `Electron.app`
- `scripts/publish-release.js` 写入 `latest-release.json` 供运行中旧版检测

## 端口

默认 **3847**，可在 `config.json` 中扩展（当前 UI 未暴露端口设置，代码支持 `cfg.port`）。

## 扩展建议

- 添加 HTTPS / 访问令牌（若需半公开网络）
- Windows 托盘与关闭行为对齐 macOS
- 应用图标：`assets/tray.png`（可选，缺失时使用内嵌占位图）
- CI：GitHub Actions 构建 macOS / Windows 产物并发布 Release
