(function () {
  const isNative = typeof window.snapdrop !== 'undefined';
  const baseUrl = window.location.origin;

  const serverUrlEl = document.getElementById('serverUrl');
  const qrcodeEl = document.getElementById('qrcode');
  const saveDirEl = document.getElementById('saveDir');
  const settingsCard = document.getElementById('settingsCard');
  const fileInput = document.getElementById('fileInput');
  const uploadStatus = document.getElementById('uploadStatus');
  const fileListEl = document.getElementById('fileList');
  const filesDropArea = document.getElementById('filesDropArea');
  const filesAppendZone = document.getElementById('filesAppendZone');
  const fileCountEl = document.getElementById('fileCount');
  const btnDeleteAll = document.getElementById('btnDeleteAll');
  const btnCopySelected = document.getElementById('btnCopySelected');
  const selectionCountEl = document.getElementById('selectionCount');
  const previewPane = document.getElementById('previewPane');
  const previewHeader = document.getElementById('previewHeader');
  const previewFileName = document.getElementById('previewFileName');
  const previewFileMeta = document.getElementById('previewFileMeta');
  const previewStage = previewPane?.querySelector('.preview-stage');
  const previewEmpty = previewStage?.querySelector('.empty');
  const previewImg = document.getElementById('previewImg');
  const previewFrame = document.getElementById('previewFrame');
  const previewIcon = document.getElementById('previewIcon');
  const previewIconHint = document.getElementById('previewIconHint');
  const previewActions = document.getElementById('previewActions');
  const filesListPanel = document.getElementById('filesListPanel');
  const btnDownload = document.getElementById('btnDownload');
  const btnOpenNative = document.getElementById('btnOpenNative');
  const btnRevealNative = document.getElementById('btnRevealNative');
  const btnCopyFile = document.getElementById('btnCopyFile');
  const copyStatusEl = document.getElementById('copyStatus');
  const btnToggleUrl = document.getElementById('btnToggleUrl');

  let uploadChain = Promise.resolve();
  let selectedFile = null;
  let selectedNames = new Set();
  let allFiles = [];
  let lastSelectIndex = -1;
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
  const appToast = document.getElementById('appToast');
  const appToastMessage = document.getElementById('appToastMessage');

  const updateBar = document.getElementById('updateBar');
  const updateBarText = document.getElementById('updateBarText');
  const updateModal = document.getElementById('updateModal');
  const updateModalMessage = document.getElementById('updateModalMessage');
  const appVersionEl = document.getElementById('appVersion');
  let pendingUpdate = null;
  let appToastTimer = null;

  function showInfoToast(message, ms = 500, variant = 'ok') {
    return new Promise((resolve) => {
      if (appToastTimer) clearTimeout(appToastTimer);
      if (!appToast || !appToastMessage) {
        resolve();
        return;
      }
      appToastMessage.textContent = message;
      appToast.classList.toggle('app-toast--error', variant === 'error');
      appToast.classList.remove('hidden');
      appToastTimer = setTimeout(() => {
        appToast.classList.add('hidden');
        appToast.classList.remove('app-toast--error');
        appToastTimer = null;
        resolve();
      }, ms);
    });
  }

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

  const COPY_OK_TOAST = '已复制到剪贴板';

  function setCopyStatus(text) {
    if (!copyStatusEl) return;
    copyStatusEl.textContent = text;
    copyStatusEl.className = 'copy-status';
    if (copyStatusTimer) clearTimeout(copyStatusTimer);
    copyStatusTimer = null;
  }

  function hideAppToast() {
    if (appToastTimer) {
      clearTimeout(appToastTimer);
      appToastTimer = null;
    }
    appToast?.classList.add('hidden');
  }

  async function runCopyWithFastToast(copyFn) {
    const res = await copyFn();
    if (res?.ok) {
      await showInfoToast(COPY_OK_TOAST, 500);
    } else {
      await showInfoToast(res?.message || '复制失败', 500, 'error');
    }
    return res;
  }

  async function verifyWebClipboardImage() {
    if (!navigator.clipboard?.read) return true;
    try {
      const items = await navigator.clipboard.read();
      return items.some((item) => item.types.some((t) => t.startsWith('image/')));
    } catch {
      return false;
    }
  }

  async function verifyWebClipboardText(expected) {
    if (!navigator.clipboard?.readText) return true;
    try {
      return (await navigator.clipboard.readText()) === expected;
    } catch {
      return false;
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
        const type = blob.type || 'image/png';
        await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
        const ok = await verifyWebClipboardImage();
        return ok ? { ok: true } : { ok: false, message: '复制失败' };
      }
      if (/\.(txt|md|json|csv|log|xml|html|css|js|ts|py|sh|yaml|yml)$/i.test(file.name)) {
        const text = await (await fetch(url)).text();
        await navigator.clipboard.writeText(text);
        const ok = await verifyWebClipboardText(text);
        return ok ? { ok: true } : { ok: false, message: '复制失败' };
      }
      await navigator.clipboard.writeText(url);
      const ok = await verifyWebClipboardText(url);
      return ok ? { ok: true } : { ok: false, message: '复制失败' };
    } catch (err) {
      return { ok: false, message: err.message || '复制失败' };
    }
  }

  function getSelectedFiles() {
    return allFiles.filter((f) => selectedNames.has(f.name));
  }

  async function copyFilesToClipboard(files) {
    if (!files.length) return { ok: false, message: '请先选择文件' };
    if (files.length === 1) return copyFileToClipboard(files[0]);

    if (isNative) {
      return window.snapdrop.copyFiles(files.map((f) => f.name));
    }

    try {
      const lines = files.map((f) => fileUrl(f));
      const text = lines.join('\n');
      await navigator.clipboard.writeText(text);
      const ok = await verifyWebClipboardText(text);
      return ok ? { ok: true } : { ok: false, message: '批量复制失败' };
    } catch (err) {
      return { ok: false, message: err.message || '批量复制失败' };
    }
  }

  function updateSelectionUi() {
    const count = selectedNames.size;
    if (selectionCountEl) {
      selectionCountEl.textContent = `已选 ${count}`;
      selectionCountEl.classList.toggle('has-selection', count > 0);
      selectionCountEl.classList.toggle('hidden', count === 0);
    }
    if (btnCopySelected) btnCopySelected.disabled = count === 0;
    if (btnDeleteAll) btnDeleteAll.disabled = count === 0;

    document.querySelectorAll('.file-list li[data-name]').forEach((li) => {
      const name = li.dataset.name;
      li.classList.toggle('checked', selectedNames.has(name));
    });
  }

  function toggleFileSelection(name, checked) {
    if (checked) selectedNames.add(name);
    else selectedNames.delete(name);
    updateSelectionUi();
  }

  function selectRange(fromIndex, toIndex) {
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    selectedNames.clear();
    for (let i = start; i <= end; i += 1) {
      if (allFiles[i]) selectedNames.add(allFiles[i].name);
    }
    updateSelectionUi();
  }

  async function copySelectedFiles() {
    const files = getSelectedFiles();
    return runCopyWithFastToast(() => copyFilesToClipboard(files));
  }

  function setPreviewStageLayout(layout) {
    previewStage?.classList.toggle('preview-stage--centered', layout === 'centered');
    previewStage?.classList.toggle('preview-stage--pdf', layout === 'pdf');
  }

  function showPreview(file) {
    selectedFile = file;
    previewImg.hidden = true;
    previewFrame.hidden = true;
    previewIcon.hidden = true;
    previewIcon.innerHTML = '';
    previewIconHint?.classList.add('hidden');
    previewActions.classList.add('hidden');
    previewHeader?.classList.add('hidden');
    setPreviewStageLayout(null);

    if (!file) {
      previewPane?.classList.remove('has-preview');
      if (previewEmpty) {
        previewEmpty.hidden = false;
        previewEmpty.querySelector('.empty-text').textContent = '点击文件进行预览';
      }
      setPreviewStageLayout('centered');
      return;
    }

    previewPane?.classList.add('has-preview');

    const canInlinePreview = isImage(file.name) || /\.pdf$/i.test(file.name);
    if (!canInlinePreview) {
      previewHeader?.classList.remove('hidden');
      if (previewFileName) previewFileName.textContent = file.name;
      if (previewFileMeta) {
        previewFileMeta.textContent = `${formatSize(file.size)} · ${formatTime(file.mtime)}`;
      }
    }

    if (previewEmpty) previewEmpty.hidden = true;
    const url = fileUrl(file);
    btnDownload.href = url;
    btnDownload.download = file.name;
    previewActions.classList.remove('hidden');
    setCopyStatus('');
    if (btnCopyFile) btnCopyFile.disabled = false;

    if (isNative) {
      btnOpenNative.classList.remove('hidden');
      btnRevealNative.classList.remove('hidden');
    } else {
      btnOpenNative.classList.add('hidden');
      btnRevealNative.classList.add('hidden');
    }

    if (isImage(file.name)) {
      previewImg.src = url;
      previewImg.hidden = false;
      setPreviewStageLayout('centered');
    } else if (/\.pdf$/i.test(file.name)) {
      previewFrame.src = url;
      previewFrame.hidden = false;
      setPreviewStageLayout('pdf');
    } else {
      previewIcon.innerHTML = buildFileThumbHtml(file);
      previewIcon.hidden = false;
      setPreviewStageLayout('centered');
      if (previewIconHint) {
        previewIconHint.textContent = isNative ? '此格式请点「本机打开」' : '此格式请点「下载」查看';
        previewIconHint.classList.remove('hidden');
      }
      const video = previewIcon.querySelector('.thumb-video');
      if (video) {
        video.addEventListener('loadeddata', () => {
          try { video.currentTime = 0.1; } catch { /* ignore */ }
        });
      }
    }
  }

  async function loadAccessInfo() {
    const applyStatus = (status) => {
      setAccessUrl(status.mobileUrl || status.url);
      if (status.qrDataUrl) {
        qrcodeEl.innerHTML = `<img src="${status.qrDataUrl}" alt="扫码访问" />`;
      }
      if (saveDirEl) saveDirEl.textContent = status.saveDir || '—';
    };

    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      applyStatus({
        mobileUrl: data.mobileUrl || (data.url ? `${data.url}/` : baseUrl),
        url: data.url,
        qrDataUrl: data.qrDataUrl,
        saveDir: data.saveDir,
      });
    } catch {
      /* ignore */
    }

    if (isNative && window.snapdrop?.getStatus) {
      window.snapdrop.getStatus()
        .then((status) => applyStatus(status))
        .catch(() => {});
    }
  }

  async function doUpload(files) {
    if (!files.length) return;
    setUploadStatus('上传中…');
    const form = new FormData();
    files.forEach((f) => form.append('files', f, f.name));
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');
      setUploadStatus(`已上传 ${data.files?.length || files.length} 个`, 'ok');
      if (data.files?.[0]) await refreshFiles(data.files[0].name);
      else await refreshFiles();
    } catch (err) {
      setUploadStatus(err.message || '上传失败', 'err');
    }
  }

  function uploadFiles(fileList) {
    const files = Array.from(fileList);
    if (!files.length) return uploadChain;
    uploadChain = uploadChain.then(() => doUpload(files));
    return uploadChain;
  }

  function buildEmptyListHtml() {
    return `<li class="files-dropzone-hint">
      <span class="files-dropzone__icon" aria-hidden="true">↑</span>
      拖放或点击上传<br>
      <span class="files-dropzone__sub">图片、文档等 · 上传后各端实时同步</span>
    </li>`;
  }

  function setEmptyDropzone(active) {
    filesDropArea?.classList.toggle('files-drop-area--empty', active);
    filesDropArea?.toggleAttribute('role', active ? 'button' : false);
    filesDropArea?.toggleAttribute('tabindex', active ? '0' : false);
    fileListEl.classList.toggle('file-list--empty', active);
    filesAppendZone?.classList.toggle('hidden', active);
  }

  function bindUploadZones() {
    if (!filesDropArea || filesDropArea.dataset.bound) return;
    filesDropArea.dataset.bound = '1';
    filesDropArea.addEventListener('click', (e) => {
      if (filesDropArea.classList.contains('files-drop-area--empty')) fileInput.click();
    });
    filesDropArea.addEventListener('keydown', (e) => {
      if (!filesDropArea.classList.contains('files-drop-area--empty')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });
    filesAppendZone?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
    filesAppendZone?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });
  }

  function addFiles(fileList) {
    uploadFiles(fileList);
  }

  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) addFiles(fileInput.files);
    fileInput.value = '';
  });

  async function deleteFileByName(name) {
    const res = await fetch(`/api/files/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '删除失败');
  }

  async function deleteSelectedFiles() {
    const names = [...selectedNames];
    if (!names.length) return;
    btnDeleteAll.disabled = true;
    try {
      for (const name of names) {
        await deleteFileByName(name);
        selectedNames.delete(name);
      }
      await refreshFiles();
    } catch (err) {
      await showInfo(err.message || '删除失败');
      await refreshFiles();
    }
  }

  async function refreshFiles(selectName) {
    const res = await fetch('/api/files');
    const { files } = await res.json();
    allFiles = files;
    const prevSelected = new Set(selectedNames);
    selectedNames = new Set(files.filter((f) => prevSelected.has(f.name)).map((f) => f.name));

    fileCountEl.textContent = String(files.length);
    fileListEl.innerHTML = '';

    if (!files.length) {
      setEmptyDropzone(true);
      fileListEl.innerHTML = buildEmptyListHtml();
      selectedNames.clear();
      lastSelectIndex = -1;
      updateSelectionUi();
      showPreview(null);
      return;
    }

    setEmptyDropzone(false);

    files.forEach((file, index) => {
      const li = document.createElement('li');
      li.dataset.name = file.name;
      li.innerHTML = `
        <div class="file-row">
          <div class="file-content">
            <button type="button" class="file-hit" aria-label="预览 ${escapeAttr(file.name)}">
              <div class="file-info">
                <div class="name">${escapeHtml(file.name)}</div>
                <div class="meta">${formatSize(file.size)} · ${formatTime(file.mtime)}</div>
              </div>
              <div class="file-thumb">${buildFileThumbHtml(file)}</div>
            </button>
            <div class="file-remove-zone">
              <button type="button" class="file-remove" data-action="delete" aria-label="删除 ${escapeAttr(file.name)}" title="删除">×</button>
            </div>
          </div>
        </div>
      `;

      li.querySelector('.file-hit')?.addEventListener('click', (e) => {
        const modKey = e.metaKey || e.ctrlKey;
        if (e.shiftKey && lastSelectIndex >= 0) {
          selectRange(lastSelectIndex, index);
          selectItem(li, file);
          lastSelectIndex = index;
          return;
        }
        if (modKey) {
          toggleFileSelection(file.name, !selectedNames.has(file.name));
          selectItem(li, file);
          lastSelectIndex = index;
          return;
        }
        selectedNames.clear();
        selectedNames.add(file.name);
        updateSelectionUi();
        selectItem(li, file);
        lastSelectIndex = index;
      });

      li.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await deleteFileByName(file.name);
          selectedNames.delete(file.name);
          await refreshFiles();
        } catch (err) {
          await showInfo(err.message || '删除失败');
          await refreshFiles();
        }
      });

      setupListThumb(li, file);
      fileListEl.appendChild(li);
      if (selectName === file.name) selectItem(li, file);
    });

    updateSelectionUi();
  }

  function selectItem(li, file) {
    document.querySelectorAll('.file-list li').forEach((el) => el.classList.remove('active'));
    li.classList.add('active');
    showPreview(file);
    li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function setupDropzone() {
    if (!filesListPanel) return;
    const prevent = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((ev) => {
      filesListPanel.addEventListener(ev, prevent);
    });
    filesListPanel.addEventListener('dragenter', () => filesListPanel.classList.add('is-dragover'));
    filesListPanel.addEventListener('dragleave', (e) => {
      if (!filesListPanel.contains(e.relatedTarget)) filesListPanel.classList.remove('is-dragover');
    });
    filesListPanel.addEventListener('drop', (e) => {
      filesListPanel.classList.remove('is-dragover');
      const files = e.dataTransfer?.files;
      if (files?.length) addFiles(files);
    });
  }
  setupDropzone();

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
    await showInfoToast('刷新成功');
  });

  async function onCheckUpdateClick() {
    if (!isNative) return;
    try {
      const info = await window.snapdrop.checkUpdate(false);
      if (info?.available) {
        showUpdateModal(info);
      } else {
        await showInfoToast('当前已是最新版本');
        await refreshVersionInfo();
      }
    } catch {
      await showInfoToast('检查更新失败');
    }
  }

  if (isNative) {
    document.getElementById('btnCheckUpdate')?.addEventListener('click', onCheckUpdateClick);
  }

  btnDeleteAll?.addEventListener('click', deleteSelectedFiles);

  btnCopySelected?.addEventListener('click', copySelectedFiles);

  btnToggleUrl?.addEventListener('click', () => {
    if (!realAccessUrl) return;
    urlRevealed = !urlRevealed;
    renderAccessUrl();
  });

  btnCopyFile?.addEventListener('click', async () => {
    if (!selectedFile) return;
    await runCopyWithFastToast(() => copyFileToClipboard(selectedFile));
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
    document.getElementById('btnOpenDir').addEventListener('click', () => window.snapdrop.openSaveDir());
    btnOpenNative.addEventListener('click', () => {
      if (selectedFile) window.snapdrop.openFile(selectedFile.name);
    });
    btnRevealNative.addEventListener('click', () => {
      if (selectedFile) window.snapdrop.revealFile(selectedFile.name);
    });
    window.snapdrop.onFileUploaded((file) => refreshFiles(file.name));

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
    bindUploadZones();
    await Promise.all([
      loadAccessInfo().catch(() => {}),
      refreshFiles().catch(() => {}),
    ]);
    connectEvents();
    if (isNative) await refreshVersionInfo().catch(() => {});
  }

  init().catch(() => {
    refreshFiles().catch(() => {});
  });
})();
