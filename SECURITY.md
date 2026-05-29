# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Threat model

**快传** is designed as a **personal LAN file transfer tool**. It intentionally:

- Binds HTTP to `0.0.0.0` on the host machine
- Has **no authentication** or encryption beyond what your local network provides
- Stores uploaded files on disk in a user-configurable folder

**Do not** run this on untrusted networks (e.g. office LAN, public Wi‑Fi). Use only on a **personal mobile hotspot** or another network you fully control.

## Reporting a vulnerability

If you discover a security issue, please **do not** open a public GitHub issue for sensitive reports.

Instead, open a [GitHub Security Advisory](https://github.com/HGDliwannian/file-transfer-access/security/advisories/new) or email the maintainer via GitHub profile contact.

Include:

- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

We aim to acknowledge reports within 7 days.

## Security best practices for users

1. Only use on your own hotspot / trusted LAN.
2. Stop the app when not needed (`托盘 → 退出` or `npm run stop`).
3. Do not expose port `3847` to the public internet via port forwarding.
4. Review files in the shared folder before opening unknown uploads.
