# Agent 协作说明

## 代码改动后的启用流程

完成与本项目相关的代码修改后，**应自动执行**：

```bash
cd /Users/liwannian/projects/file-transfer-access && npm run enable
```

该命令会：停止旧进程 → 打包 `dist/mac-arm64/快传.app` → 登记最新版本 → 启动应用。

若用户此前已打开旧版快传，旧窗口会自动提示有新版本可升级（左下角条 + 弹窗）。

若仅改了前端静态资源且确认已有 `.app`，可改用快速启动：

```bash
npm run enable:launch
```

## 用户手动操作

| 方式 | 说明 |
|------|------|
| 终端 `npm run enable` | 完整启用（打包+启动） |
| 终端 `npm run stop` | 停止应用 |
| 双击 `scripts/快传-启用.command` | 同上完整启用 |
| 双击 `scripts/快传-停止.command` | 停止 |
| 直接打开 `dist/mac-arm64/快传.app` | 仅启动，不重新打包 |

默认**不会**开机自启；只有用户打开应用或勾选设置后才会运行。
