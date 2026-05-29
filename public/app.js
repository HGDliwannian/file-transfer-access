(function () {
  const isNative = typeof window.snapdrop !== 'undefined';
  const baseUrl = window.location.origin;

  const serverUrlEl = document.getElementById('serverUrl');
  const qrcodeEl = document.getElementById('qrcode');
  const saveDirEl = document.getElementById('saveDir');
  const launchAtLoginEl = document.getElementById('launchAtLogin');
  const settingsCard = document.getElementById('settingsCard');
  const fileInput = document.getElementById('fileInput');
  const cameraInput = document.getElementById('cameraInput');
  const pendingPreview = document.getElementById('pendingPreview');
  const pendingWrap = document.getElementById('pendingWrap');
  const pendingCountEl = document.getElementById('pendingCount');
  const btnClearPending = document.getElementById('btnClearPending');
  const uploadBtn = document.getElementById('uploadBtn');
  const uploadStatus = document.getElementById('uploadStatus');
  const fileListEl = document.getElementById('fileList');
  const fileCountEl = document.getElementById('fileCount');
  const btnDeleteAll = document.getElementById('btnDeleteAll');
  const previewPane = document.getElementById('previewPane');
  const previewImg = document.getElementById('previewImg');
  const previewFrame = document.getElementById('previewFrame');
  const previewActions = document.getElementById('previewActions');
  const btnDownload = document.getElementById('btnDownload');
  const btnOpenNative = document.getElementById('btnOpenNative');
  const btnRevealNative = document.getElementById('btnRevealNative');
  const btnCopyFile = document.getElementById('btnCopyFile');
  const copyStatusEl = document.getElementById('copyStatus');
  const btnToggleUrl = document.getElementById('btnToggleUrl');

  let pendingFiles = [];
  let selectedFile = null;
  let eventSource = null;
  let realAccessUrl = '';
  let urlRevealed = false;
  let copyStatusTimer = null;
  let uploadStatusTimer = null;

  const confirmModal = document.getElementById('confirmModal');
  const confirmMessageEl = document.getElementById('confirmMessage');
  const confirmCancelBtn = document.getElementById('confirmCancel');
  const confirmOkBtn = document.getElementById('confirmOk');
  const infoModal = document.getElementById('infoModal');
  const infoMessageEl = document.getElementById('infoMessage');
  const infoOkBtn = document.getElementById('infoOk');

  const updateBar = document.getElementById('updateBar');
  const updateBarText = document.getElementById('updateBarText');
  const updateModal = document.getElementById('updateModal');
  const updateModalMessage = document.getElementById('updateModalMessage');
  const appVersionEl = document.getElementById('appVersion');
  let pendingUpdate = null;

  function showInfo(message) {
    return new Promise((resolve) => {
      infoMessageEl.textContent = message;
      infoModal.classList.remove('hidden');
      const cleanup = () => {
        infoModal.classList.add('hidden');
        infoOkBtn.removeEventListener('click', onOk);
        infoModal.querySelector('[data-info-dismiss]')?.removeEventListener('click', onOk);
        document.removeEventListener('keydown', onKey);
        resolve();
      };
      const onOk = () => cleanup();
      const onKey = (e) => {
        if (e.key === 'Escape' || e.key === 'Enter') onOk();
      };
      infoOkBtn.addEventListener('click', onOk);
      infoModal.querySelector('[data-info-dismiss]')?.addEventListener('click', onOk);
      document.addEventListener('keydown', onKey);
      infoOkBtn.focus();
    });
  }

  function showConfirm(message) {
    return new Promise((resolve) => {
      confirmMessageEl.textContent = message;
      confirmModal.classList.remove('hidden');

      const cleanup = (result) => {
        confirmModal.classList.add('hidden');
        confirmCancelBtn.removeEventListener('click', onCancel);
        confirmOkBtn.removeEventListener('click', onOk);
        confirmModal.querySelector('.mac-alert__backdrop')?.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };

      const onCancel = () => cleanup(false);
      const onOk = () => cleanup(true);
      const onKey = (e) => {
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Enter') onOk();
      };

      confirmCancelBtn.addEventListener('click', onCancel);
      confirmOkBtn.addEventListener('click', onOk);
      confirmModal.querySelector('.mac-alert__backdrop')?.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);
      confirmOkBtn.focus();
    });
  }

  if (isNative) {
    document.body.classList.add('is-electron');
    document.querySelectorAll('.native-only').forEach((el) => el.classList.remove('hidden'));
  }

  function setUploadStatus(text, type) {
    uploadStatus.textContent = text;
    uploadStatus.className = 'status' + (type ? ' ' + type : '');
    if (uploadStatusTimer) clearTimeout(uploadStatusTimer);
    if (type === 'ok' || type === 'err') {
      uploadStatusTimer = setTimeout(() => {
        uploadStatus.textContent = '';
        uploadStatus.className = 'status';
      }, 2000);
    }
  }

  function setCopyStatus(text, type) {
    if (!copyStatusEl) return;
    copyStatusEl.textContent = text;
    copyStatusEl.className = 'copy-status' + (type ? ' ' + type : '');
    if (copyStatusTimer) clearTimeout(copyStatusTimer);
    if (text) {
      copyStatusTimer = setTimeout(() => {
        copyStatusEl.textContent = '';
        copyStatusEl.className = 'copy-status';
      }, 3000);
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function formatTime(ms) {
    return new Date(ms).toLocaleString('zh-CN', { hour12: false });
  }

  function isImage(name) {
    return /\.(png|jpe?g|gif|webp|bmp|heic|svg)$/i.test(name);
  }

  function getFileExtLabel(name) {
    const m = name.match(/\.([^.]+)$/);
    return (m ? m[1] : 'file').toUpperCase().slice(0, 4);
  }

  function getFileKind(name) {
    if (isImage(name)) return 'image';
    if (/\.pdf$/i.test(name)) return 'pdf';
    if (/\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(name)) return 'video';
    if (/\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(name)) return 'audio';
    if (/\.(doc|docx)$/i.test(name)) return 'word';
    if (/\.(xls|xlsx|csv)$/i.test(name)) return 'excel';
    if (/\.(ppt|pptx)$/i.test(name)) return 'ppt';
    if (/\.(txt|md|json|xml|yaml|yml|log|html|css|js|ts|py|sh)$/i.test(name)) return 'text';
    if (/\.(zip|rar|7z|tar|gz|bz2)$/i.test(name)) return 'archive';
    return 'file';
  }

  function buildFileThumbHtml(file) {
    const url = fileUrl(file);
    const kind = getFileKind(file.name);
    if (kind === 'image') {
      return `<img class="thumb-img" src="${url}" alt="" loading="lazy" />`;
    }
    if (kind === 'video') {
      return `<video class="thumb-video" src="${url}" muted playsinline preload="metadata"></video>`;
    }
    if (kind === 'pdf') {
      return `<div class="thumb-badge thumb-pdf"><span>PDF</span></div>`;
    }
    const labels = {
      word: 'DOC',
      excel: 'XLS',
      ppt: 'PPT',
      audio: '♪',
      archive: 'ZIP',
      text: 'TXT',
      file: getFileExtLabel(file.name),
    };
    const label = labels[kind] || getFileExtLabel(file.name);
    return `<div class="thumb-badge thumb-${kind}" data-text-thumb="${kind === 'text' ? '1' : ''}"><span>${escapeHtml(label)}</span></div>`;
  }

  function setupListThumb(li, file) {
    const video = li.querySelector('.thumb-video');
    if (video) {
      video.addEventListener('loadeddata', () => {
        try { video.currentTime = 0.1; } catch { /* ignore */ }
      });
    }
    const textThumb = li.querySelector('[data-text-thumb="1"] span');
    if (textThumb) {
      fetch(fileUrl(file))
        .then((r) => r.text())
        .then((t) => {
          const preview = t.replace(/\s+/g, ' ').trim().slice(0, 60);
          if (preview) {
            textThumb.textContent = preview;
            textThumb.parentElement?.classList.add('thumb-text-preview');
          }
        })
        .catch(() => {});
    }
  }

  function fileUrl(file) {
    return baseUrl + file.url;
  }

  function maskUrl(url) {
    if (!url || url === '—') return '—';
    return '*'.repeat(Math.max(20, Math.min(url.length, 36)));
  }

  function renderAccessUrl() {
    if (!realAccessUrl) {
      serverUrlEl.textContent = '—';
      serverUrlEl.classList.add('is-masked');
      return;
    }
    serverUrlEl.textContent = urlRevealed ? realAccessUrl : maskUrl(realAccessUrl);
    serverUrlEl.classList.toggle('is-masked', !urlRevealed);
    if (btnToggleUrl) {
      btnToggleUrl.textContent = urlRevealed ? '隐藏' : '显示';
      btnToggleUrl.disabled = false;
    }
  }

  function setAccessUrl(url) {
    realAccessUrl = url || '';
    urlRevealed = false;
    renderAccessUrl();
  }

  async function copyFileToClipboard(file) {
    if (isNative) {
      return window.snapdrop.copyFile(file.name);
    }
    const url = fileUrl(file);
    try {
      if (isImage(file.name)) {
        const res = await fetch(url);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        return { ok: true, message: '图片已复制到剪贴板' };
      }
      if (/\.(txt|md|json|csv|log|xml|html|css|js|ts|py|sh|yaml|yml)$/i.test(file.name)) {
        const text = await (await fetch(url)).text();
        await navigator.clipboard.writeText(text);
        return { ok: true, message: '文本已复制到剪贴板' };
      }
      await navigator.clipboard.writeText(url);
      return { ok: true, message: '已复制文件链接' };
    } catch (err) {
      return { ok: false, message: err.message || '复制失败' };
    }
  }

  function showPreview(file) {
    selectedFile = file;
    const empty = previewPane.querySelector('.empty');
    previewImg.hidden = true;
    previewFrame.hidden = true;
    previewActions.classList.add('hidden');

    if (!file) {
      empty.hidden = false;
      empty.textContent = '选择文件预览或下载';
      return;
    }

    empty.hidden = true;
    const url = fileUrl(file);
    btnDownload.href = url;
    btnDownload.download = file.name;
    previewActions.classList.remove('hidden');
    setCopyStatus('');

    if (isNative) {
      btnOpenNative.classList.remove('hidden');
      btnRevealNative.classList.remove('hidden');
    }

    if (isImage(file.name)) {
      previewImg.src = url;
      previewImg.hidden = false;
    } else if (/\.pdf$/i.test(file.name)) {
      previewFrame.src = url;
      previewFrame.hidden = false;
    } else {
      empty.hidden = false;
      empty.textContent = isNative ? '此格式请点「本机打开」' : '此格式请点「下载」查看';
    }
  }

  async function loadAccessInfo() {
    if (isNative) {
      const status = await window.snapdrop.getStatus();
      setAccessUrl(status.mobileUrl || status.url);
      if (status.qrDataUrl) {
        qrcodeEl.innerHTML = `<img src="${status.qrDataUrl}" alt="扫码访问" />`;
      }
      saveDirEl.textContent = status.saveDir || '—';
      const settings = await window.snapdrop.getSettings();
      launchAtLoginEl.checked = settings.launchAtLogin;
      return;
    }

    const res = await fetch('/api/status');
    const data = await res.json();
    const accessUrl = data.url || baseUrl;
    setAccessUrl(accessUrl);
    qrcodeEl.innerHTML = `<p class="tip" style="padding:12px;text-align:center">在运行快传的电脑上查看二维码</p>`;
  }

  function removePendingAt(index) {
    pendingFiles.splice(index, 1);
    renderPending();
  }

  function clearPending() {
    pendingFiles = [];
    renderPending();
    setUploadStatus('');
  }

  function renderPending() {
    pendingPreview.innerHTML = '';
    if (!pendingFiles.length) {
      pendingWrap.classList.add('hidden');
      uploadBtn.classList.add('hidden');
      return;
    }
    pendingWrap.classList.remove('hidden');
    uploadBtn.classList.remove('hidden');
    if (pendingCountEl) {
      pendingCountEl.textContent = `已选 ${pendingFiles.length} 个`;
    }

    pendingFiles.forEach((f, index) => {
      const item = document.createElement('div');
      item.className = 'pending-item';

      if (f.type.startsWith('image/')) {
        const img = document.createElement('img');
        const objUrl = URL.createObjectURL(f);
        img.src = objUrl;
        img.alt = f.name;
        img.onload = () => URL.revokeObjectURL(objUrl);
        item.appendChild(img);
      } else {
        const tag = document.createElement('div');
        tag.className = 'file-tag';
        tag.textContent = f.name;
        tag.title = f.name;
        item.appendChild(tag);
      }

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'pending-remove';
      removeBtn.setAttribute('aria-label', `移除 ${f.name}`);
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removePendingAt(index);
      });
      item.appendChild(removeBtn);
      pendingPreview.appendChild(item);
    });
    setUploadStatus(`已选 ${pendingFiles.length} 个，点击上传`);
  }

  function addPending(fileList) {
    pendingFiles = pendingFiles.concat(Array.from(fileList));
    renderPending();
  }

  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) addPending(fileInput.files);
    fileInput.value = '';
  });
  cameraInput?.addEventListener('change', () => {
    if (cameraInput.files?.length) addPending(cameraInput.files);
    cameraInput.value = '';
  });

  btnClearPending?.addEventListener('click', clearPending);

  uploadBtn.addEventListener('click', async () => {
    if (!pendingFiles.length) return;
    uploadBtn.disabled = true;
    setUploadStatus('上传中…');
    const form = new FormData();
    pendingFiles.forEach((f) => form.append('files', f, f.name));
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');
      setUploadStatus(`已上传 ${data.files?.length || pendingFiles.length} 个`, 'ok');
      pendingFiles = [];
      renderPending();
      if (data.files?.[0]) await refreshFiles(data.files[0].name);
    } catch (err) {
      setUploadStatus(err.message || '上传失败', 'err');
    } finally {
      uploadBtn.disabled = false;
    }
  });

  async function refreshFiles(selectName) {
    const res = await fetch('/api/files');
    const { files } = await res.json();
    fileCountEl.textContent = String(files.length);
    fileListEl.innerHTML = '';
    if (btnDeleteAll) btnDeleteAll.disabled = !files.length;

    if (!files.length) {
      fileListEl.innerHTML = '<li class="empty-list">暂无文件，任一端上传后都会出现在这里</li>';
      showPreview(null);
      return;
    }

    files.forEach((file) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="file-row">
          <div class="file-body">
            <div class="name">${escapeHtml(file.name)}</div>
            <div class="meta">${formatSize(file.size)} · ${formatTime(file.mtime)}</div>
            <div class="ops">
              <a class="mac-btn mac-btn--small" href="${fileUrl(file)}" download="${escapeAttr(file.name)}">下载</a>
              <button type="button" class="mac-btn mac-btn--small" data-action="preview">预览</button>
              <button type="button" class="mac-btn mac-btn--small" data-action="delete">删除</button>
            </div>
          </div>
          <div class="file-thumb">${buildFileThumbHtml(file)}</div>
        </div>
      `;
      li.querySelector('[data-action="preview"]').addEventListener('click', (e) => {
        e.stopPropagation();
        selectItem(li, file);
      });
      li.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await showConfirm('确定删除该文件？所有端将同步移除');
        if (!ok) return;
        await fetch(`/api/files/${encodeURIComponent(file.name)}`, { method: 'DELETE' });
        await refreshFiles();
      });
      li.addEventListener('click', () => selectItem(li, file));
      setupListThumb(li, file);
      fileListEl.appendChild(li);
      if (selectName === file.name) selectItem(li, file);
    });
  }

  function selectItem(li, file) {
    document.querySelectorAll('.file-list li').forEach((el) => el.classList.remove('active'));
    li.classList.add('active');
    showPreview(file);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
  function escapeAttr(s) {
    return s.replace(/"/g, '&quot;');
  }

  function connectEvents() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource('/events');
    eventSource.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'upload') {
          refreshFiles(data.file?.name);
          if (!isNative && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('收到新文件', { body: data.file?.originalName || data.file?.name });
          }
        }
        if (data.type === 'delete') refreshFiles();
      } catch { /* ignore */ }
    };
    eventSource.onerror = () => {
      eventSource.close();
      setTimeout(connectEvents, 3000);
    };
  }

  document.getElementById('btnRefresh').addEventListener('click', async () => {
    await refreshFiles();
    await showInfo('刷新成功');
  });

  btnDeleteAll?.addEventListener('click', async () => {
    const ok = await showConfirm('确定删除全部文件？所有端将同步移除');
    if (!ok) return;
    btnDeleteAll.disabled = true;
    try {
      const res = await fetch('/api/files', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除失败');
      await refreshFiles();
    } catch (err) {
      await showInfo(err.message || '删除失败');
      await refreshFiles();
    }
  });

  btnToggleUrl?.addEventListener('click', () => {
    if (!realAccessUrl) return;
    urlRevealed = !urlRevealed;
    renderAccessUrl();
  });

  btnCopyFile?.addEventListener('click', async () => {
    if (!selectedFile) return;
    const res = await copyFileToClipboard(selectedFile);
    if (res?.ok) {
      setCopyStatus(res.message, 'ok');
    } else {
      await showInfo(res?.message || '复制失败');
    }
  });

  function formatBuildTime(ms) {
    if (!ms) return '';
    return new Date(ms).toLocaleString('zh-CN', { hour12: false });
  }

  function showUpdateUi(result) {
    if (!result?.available || !result.latest) {
      updateBar?.classList.add('hidden');
      pendingUpdate = null;
      return;
    }
    pendingUpdate = result;
    const label = `新版本 v${result.latest.version}（${formatBuildTime(result.latest.buildTime)}）`;
    if (updateBarText) updateBarText.textContent = `发现${label}，可升级`;
    updateBar?.classList.remove('hidden');
  }

  function showUpdateModal(result) {
    if (!result?.available) return;
    pendingUpdate = result;
    const label = `v${result.latest.version}`;
    updateModalMessage.textContent = `发现新版本 ${label}，是否立即升级？\n\n升级将退出当前应用并打开最新构建。`;
    updateModal.classList.remove('hidden');
  }

  function hideUpdateModal() {
    updateModal?.classList.add('hidden');
  }

  async function onUpgradeClick() {
    const res = await window.snapdrop.applyUpdate();
    if (res?.message && !res.ok) await showInfo(res.message);
  }

  async function onLaterClick() {
    if (pendingUpdate?.latest?.buildId) {
      await window.snapdrop.dismissUpdate(pendingUpdate.latest.buildId);
    }
    updateBar?.classList.add('hidden');
    hideUpdateModal();
  }

  async function refreshVersionInfo() {
    if (!isNative || !appVersionEl) return;
    const info = await window.snapdrop.getVersionInfo();
    const cur = info.current;
    appVersionEl.textContent = `v${cur.version}`;
    showUpdateUi(info.update);
    return info;
  }

  if (isNative) {
    document.getElementById('btnChooseDir').addEventListener('click', async () => {
      const dir = await window.snapdrop.chooseSaveDir();
      if (dir) {
        saveDirEl.textContent = dir;
        await refreshFiles();
      }
    });
    document.getElementById('btnOpenDir').addEventListener('click', () => window.snapdrop.openSaveDir());
    launchAtLoginEl.addEventListener('change', async () => {
      await window.snapdrop.setLaunchAtLogin(launchAtLoginEl.checked);
    });
    btnOpenNative.addEventListener('click', () => {
      if (selectedFile) window.snapdrop.openFile(selectedFile.name);
    });
    btnRevealNative.addEventListener('click', () => {
      if (selectedFile) window.snapdrop.revealFile(selectedFile.name);
    });
    window.snapdrop.onFileUploaded((file) => refreshFiles(file.name));

    document.getElementById('btnCheckUpdate')?.addEventListener('click', async () => {
      const info = await window.snapdrop.checkUpdate(false);
      if (info?.available) {
        showUpdateModal(info);
      } else {
        await showInfo('当前已是最新版本');
        await refreshVersionInfo();
      }
    });
    document.getElementById('updateBarUpgrade')?.addEventListener('click', onUpgradeClick);
    document.getElementById('updateModalUpgrade')?.addEventListener('click', onUpgradeClick);
    document.getElementById('updateBarLater')?.addEventListener('click', onLaterClick);
    document.getElementById('updateModalLater')?.addEventListener('click', onLaterClick);
    updateModal.querySelector('[data-update-dismiss]')?.addEventListener('click', onLaterClick);
    window.snapdrop.onUpdateAvailable((data) => {
      showUpdateUi(data);
      showUpdateModal(data);
    });
  } else if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  async function init() {
    await loadAccessInfo();
    await refreshFiles();
    connectEvents();
    if (isNative) await refreshVersionInfo();
  }

  init();
})();
