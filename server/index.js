const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { EventEmitter } = require('events');

const DEFAULT_PORT = 3847;
const MAX_HISTORY = 100;

function ensureDir(dir) {
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
}

/** multipart 文件名在 multer 中常被按 latin1 解析，需转回 utf-8 */
function decodeFilename(name) {
  if (!name || typeof name !== 'string') return name || 'file';
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('\uFFFD') ? name : decoded;
  } catch {
    return name;
  }
}

function buildStoredName(originalName) {
  const safe = decodeFilename(originalName);
  const ext = path.extname(safe) || '';
  const base = path.basename(safe, ext).replace(/[/\\:*?"<>|]/g, '_').trim() || 'file';
  return `${base}_${Date.now()}${ext}`;
}

function createStorage(saveDir) {
  ensureDir(saveDir);
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, saveDir),
    filename: (_req, file, cb) => {
      file.originalname = decodeFilename(file.originalname);
      cb(null, buildStoredName(file.originalname));
    },
  });
}

function getLanIp() {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push({ name, address: iface.address });
      }
    }
  }
  const hotspot = candidates.find(
    (c) =>
      /hotspot|iphone|android|wlan|wi-?fi|en0|en1/i.test(c.name) ||
      c.address.startsWith('192.168.')
  );
  return (hotspot || candidates[0])?.address || '127.0.0.1';
}

function createServer(options = {}) {
  const {
    saveDir,
    publicDir,
    port = DEFAULT_PORT,
    onUpload,
    getUpdateCheck,
  } = options;

  const events = new EventEmitter();
  let currentSaveDir = saveDir;
  let upload = multer({ storage: createStorage(currentSaveDir), limits: { fileSize: 500 * 1024 * 1024 } });

  const app = express();
  app.use(express.json());

  function sendJson(res, body) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(body));
  }

  app.get('/api/status', async (_req, res) => {
    const ip = getLanIp();
    const mobileUrl = `http://${ip}:${port}/mobile.html`;
    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(mobileUrl, { width: 200, margin: 1 });
    } catch {
      /* ignore */
    }
    sendJson(res, {
      ok: true,
      ip,
      port,
      url: `http://${ip}:${port}`,
      mobileUrl,
      qrDataUrl,
      saveDir: currentSaveDir,
    });
  });

  function readBuildInfo() {
    try {
      const raw = fs.readFileSync(path.join(publicDir, 'build-info.json'), 'utf8');
      return JSON.parse(raw);
    } catch {
      return { version: '0', buildTime: 0, buildId: 'dev' };
    }
  }

  app.get('/api/update-check', (_req, res) => {
    try {
      if (typeof getUpdateCheck === 'function') {
        return sendJson(res, getUpdateCheck());
      }
      const current = readBuildInfo();
      sendJson(res, { available: false, current, latest: null, reason: 'web_only' });
    } catch (err) {
      sendJson(res, { ok: false, error: err.message || 'check failed' });
    }
  });

  app.get('/api/files', (_req, res) => {
    try {
      ensureDir(currentSaveDir);
      const files = fs
        .readdirSync(currentSaveDir)
        .map((name) => {
          const full = path.join(currentSaveDir, name);
          const stat = fs.statSync(full);
          if (!stat.isFile()) return null;
          return {
            name,
            size: stat.size,
            mtime: stat.mtimeMs,
            url: `/files/${encodeURIComponent(name)}`,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, MAX_HISTORY);
      sendJson(res, { files });
    } catch (err) {
      res.status(500);
      sendJson(res, { error: err.message });
    }
  });

  app.delete('/api/files', (_req, res) => {
    try {
      ensureDir(currentSaveDir);
      const base = path.resolve(currentSaveDir);
      const names = fs.readdirSync(currentSaveDir).filter((name) => {
        const full = path.resolve(currentSaveDir, name);
        return full.startsWith(base + path.sep) && fs.statSync(full).isFile();
      });
      names.forEach((name) => fs.unlinkSync(path.join(currentSaveDir, name)));
      if (names.length) events.emit('delete', { name: '*', all: true });
      sendJson(res, { ok: true, count: names.length });
    } catch (err) {
      res.status(500);
      sendJson(res, { error: err.message });
    }
  });

  app.delete('/api/files/:name', (req, res) => {
    const name = path.basename(req.params.name);
    const full = path.resolve(currentSaveDir, name);
    const base = path.resolve(currentSaveDir);
    if (!full.startsWith(base + path.sep) && full !== base) {
      res.status(400);
      return sendJson(res, { error: 'invalid path' });
    }
    try {
      fs.unlinkSync(full);
      events.emit('delete', { name });
      sendJson(res, { ok: true });
    } catch (err) {
      res.status(404);
      sendJson(res, { error: err.message });
    }
  });

  app.post('/api/upload', (req, res) => {
    upload.array('files', 20)(req, res, (err) => {
      if (err) {
        res.status(400);
        return sendJson(res, { error: err.message });
      }
      const uploaded = (req.files || []).map((f) => {
        const originalName = decodeFilename(f.originalname);
        return {
          name: f.filename,
          originalName,
          size: f.size,
          path: f.path,
          url: `/files/${encodeURIComponent(f.filename)}`,
        };
      });
      uploaded.forEach((file) => {
        events.emit('upload', file);
        if (onUpload) onUpload(file);
      });
      sendJson(res, { ok: true, files: uploaded });
    });
  });

  app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
    }, 25000);

    const push = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    const onUpload = (file) => push({ type: 'upload', file });
    const onDelete = (data) => push({ type: 'delete', ...data });
    events.on('upload', onUpload);
    events.on('delete', onDelete);

    req.on('close', () => {
      clearInterval(heartbeat);
      events.off('upload', onUpload);
      events.off('delete', onDelete);
    });
  });

  function isPhoneUserAgent(ua) {
    return /iPhone|iPod|Android.*Mobile|webOS|BlackBerry|Opera Mini/i.test(ua || '');
  }

  app.get('/', (req, res) => {
    const ua = req.headers['user-agent'] || '';
    if (isPhoneUserAgent(ua)) {
      return res.redirect(302, '/mobile.html');
    }
    res.sendFile(path.resolve(publicDir, 'index.html'));
  });

  app.get('/mobile.html', (_req, res) => {
    res.sendFile(path.resolve(publicDir, 'mobile.html'));
  });

  app.use('/files', (req, res, next) => {
    express.static(currentSaveDir, { fallthrough: false })(req, res, next);
  });
  app.use(express.static(publicDir));

  const server = {
    app,
    httpServer: null,
    port,
    events,
    setSaveDir(dir) {
      currentSaveDir = dir;
      ensureDir(dir);
      upload = multer({ storage: createStorage(currentSaveDir), limits: { fileSize: 500 * 1024 * 1024 } });
    },
    getSaveDir: () => currentSaveDir,
    getLanIp,
    start() {
      return new Promise((resolve, reject) => {
        this.httpServer = app.listen(port, '0.0.0.0', () => {
          resolve({ ip: getLanIp(), port, url: `http://${getLanIp()}:${port}` });
        });
        this.httpServer.on('error', reject);
      });
    },
    stop() {
      return new Promise((resolve) => {
        if (!this.httpServer) return resolve();
        this.httpServer.close(() => resolve());
      });
    },
  };

  return server;
}

module.exports = { createServer, getLanIp, DEFAULT_PORT };
