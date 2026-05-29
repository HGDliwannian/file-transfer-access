# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-29

### Added

- Electron desktop app (macOS arm64, Windows x64 build config) with system tray
- Built-in Express HTTP server on port `3847`, bound to `0.0.0.0`
- Unified responsive H5 UI for desktop and mobile browsers
- QR code and masked LAN URL for cross-device access on the same hotspot
- Real-time file list sync via Server-Sent Events (SSE)
- Upload, download, preview, delete single file, delete all files
- Pending upload queue with per-file remove and clear-all
- Image / PDF / text preview, native open/reveal/copy on macOS
- File thumbnails in shared file list
- Local update check for self-built `.app` on the same machine
- One-click enable scripts (`npm run enable`, `.command` files)
- Default save directory: `~/Downloads/快速互传`
- Optional launch-at-login (off by default)

### Security

- LAN-only design; no cloud account or public relay

[1.0.0]: https://github.com/HGDliwannian/file-transfer-access/releases/tag/v1.0.0
