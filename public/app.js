(function () {
  const isNative = typeof window.snapdrop !== 'undefined';
  const baseUrl = window.location.origin;

  const serverUrlEl = document.getElementById('serverUrl');
  const qrcodeEl = document.getElementById('qrcode');
  const saveDirEl = document.getElementById('saveDir');
  const saveDirTextEl = document.getElementById('saveDirText');
  const settingsCard = document.getElementById('settingsCard');
  const fileInput = document.getElementById('fileInput');
  const fileListEl = document.getElementById('fileList');
  const filesAppendZone = document.getElementById('filesAppendZone');
  const fileCountEl = document.getElementById('fileCount');
  const btnDeleteAll = document.getElementById('btnDeleteAll');
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
  const filesListPanel = document.getElementById('filesListPanel');
  const btnCopyFile = document.getElementById('btnCopyFile');
  const btnToggleUrl = document.getElementById('btnToggleUrl');

  let uploadChain = Promise.resolve();
  let refreshQueue = Promise.resolve();
  let pendingUploadSelect = [];
  let uploadSelectFlushTimer = null;
  let selectedFile = null;
  let selectedNames = new Set();
  let allFiles = [];
  let lastSelectIndex = -1;
  let eventSource = null;
  let realAccessUrl = '';
  let urlRevealed = false;

  const confirmModal = document.getElementById('confirmModal');
  const confirmMessageEl = document.getElementById('confirmMessage');
  const confirmCancelBtn = document.getElementById('confirmCancel');
  const confirmOkBtn = document.getElementById('confirmOk');
  const infoModal = document.getElementById('infoModal');
  const infoMessageEl = document.getElementById('infoMessage');
  const infoOkBtn = document.getElementById('infoOk');
  const appToast = document.getElementById('appToast');
  const appToastMessage = document.getElementById('appToastMessage');

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

  const COPY_OK_TOAST = '已拷贝到剪贴板';

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
      showInfoToast(COPY_OK_TOAST, 500);
    } else {
      showInfoToast(res?.message || '拷贝失败', 500, 'error');
    }
    return res;
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
    const revealed = urlRevealed && !!realAccessUrl;
    if (!realAccessUrl) {
      serverUrlEl.textContent = '—';
      serverUrlEl.classList.add('is-masked');
      qrcodeEl?.classList.add('is-masked');
      if (btnToggleUrl) {
        btnToggleUrl.textContent = '显示';
        btnToggleUrl.disabled = true;
      }
      return;
    }
    serverUrlEl.textContent = revealed ? realAccessUrl : maskUrl(realAccessUrl);
    serverUrlEl.classList.toggle('is-masked', !revealed);
    qrcodeEl?.classList.toggle('is-masked', !revealed);
    if (btnToggleUrl) {
      btnToggleUrl.textContent = revealed ? '隐藏' : '显示';
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
        return { ok: true };
      }
      await navigator.clipboard.writeText(url);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.message || '拷贝失败' };
    }
  }

  function updateSelectionUi() {
    const count = selectedNames.size;
    if (selectionCountEl) {
      selectionCountEl.textContent = `已选 ${count}`;
      selectionCountEl.classList.toggle('has-selection', count > 0);
      selectionCountEl.classList.toggle('hidden', count === 0);
    }
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

  const previewDock = previewPane?.querySelector('.preview-dock');

  function setPreviewStageLayout(layout) {
    previewStage?.classList.toggle('preview-stage--pdf', layout === 'pdf');
    previewStage?.classList.toggle('preview-stage--inline', layout === 'inline');
    const useDock = layout !== 'inline' && layout !== 'pdf';
    previewPane?.classList.toggle('preview-pane--dock', useDock);
    previewDock?.classList.toggle('hidden', !useDock);
  }

  function showPreview(file) {
    selectedFile = file;
    previewImg.hidden = true;
    previewFrame.hidden = true;
    previewIcon.hidden = true;
    previewIcon.innerHTML = '';
    previewIconHint?.classList.add('hidden');
    previewHeader?.classList.add('hidden');
    setPreviewStageLayout(null);

    if (!file) {
      previewPane?.classList.remove('has-preview');
      if (previewEmpty) {
        previewEmpty.hidden = false;
        previewEmpty.querySelector('.empty-text').textContent = '点击文件进行预览';
      }
      if (btnCopyFile) btnCopyFile.disabled = true;
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
    if (btnCopyFile) btnCopyFile.disabled = false;

    if (isImage(file.name)) {
      previewImg.src = url;
      previewImg.hidden = false;
      setPreviewStageLayout('inline');
    } else if (/\.pdf$/i.test(file.name)) {
      previewFrame.src = url;
      previewFrame.hidden = false;
      setPreviewStageLayout('pdf');
    } else {
      previewIcon.innerHTML = buildFileThumbHtml(file);
      previewIcon.hidden = false;
      if (previewIconHint) {
        previewIconHint.textContent = '此格式暂不支持内嵌预览';
        previewIconHint.classList.remove('hidden');
      }
      setPreviewStageLayout(null);
      const video = previewIcon.querySelector('.thumb-video');
      if (video) {
        video.addEventListener('loadeddata', () => {
          try { video.currentTime = 0.1; } catch { /* ignore */ }
        });
      }
    }
  }

  function applyAccessStatus(status) {
    setAccessUrl(status.mobileUrl || status.url);
    if (status.qrDataUrl && qrcodeEl) {
      qrcodeEl.innerHTML = `<img src="${status.qrDataUrl}" alt="扫码访问" />`;
    }
    renderAccessUrl();
    if (saveDirTextEl) saveDirTextEl.textContent = status.saveDir || '—';
  }

  async function loadAccessInfo() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      applyAccessStatus({
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
        .then((status) => applyAccessStatus(status))
        .catch(() => {});
    }
  }

  async function reloadServiceAndAccess() {
    if (isNative && window.snapdrop?.restartService) {
      const status = await window.snapdrop.restartService();
      applyAccessStatus(status);
      return;
    }
    await loadAccessInfo();
  }

  async function doUpload(files) {
    if (!files.length) return;
    hideAppToast();
    showInfoToast('上传中…', 60000);
    const form = new FormData();
    files.forEach((f) => form.append('files', f, f.name));
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');
      hideAppToast();
      await showInfoToast(`已上传 ${data.files?.length || files.length} 个`, 800, 'ok');
      const uploadedNames = (data.files || []).map((f) => f.name).filter(Boolean);
      if (uploadedNames.length) await queueRefreshFiles(uploadedNames);
      else await refreshFiles();
    } catch (err) {
      hideAppToast();
      await showInfoToast(err.message || '上传失败', 800, 'error');
    }
  }

  function uploadFiles(fileList) {
    const files = Array.from(fileList);
    if (!files.length) return uploadChain;
    uploadChain = uploadChain.then(() => doUpload(files));
    return uploadChain;
  }

  function buildEmptyListHtml() {
    return '';
  }

  function setEmptyDropzone(active) {
    fileListEl.classList.toggle('file-list--empty', active);
    filesAppendZone?.classList.toggle('files-append-zone--upload', active);
    filesAppendZone?.classList.toggle('files-append-zone--add', !active);
  }

  function bindUploadZones() {
    if (!filesAppendZone || filesAppendZone.dataset.bound) return;
    filesAppendZone.dataset.bound = '1';
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

  function normalizeSelectNames(selectName) {
    if (selectName == null) return null;
    return (Array.isArray(selectName) ? selectName : [selectName]).filter(Boolean);
  }

  function enqueueUploadSelect(name) {
    if (!name) return;
    pendingUploadSelect.push(name);
    if (uploadSelectFlushTimer) clearTimeout(uploadSelectFlushTimer);
    uploadSelectFlushTimer = setTimeout(() => {
      uploadSelectFlushTimer = null;
      const names = [...new Set(pendingUploadSelect)];
      pendingUploadSelect = [];
      if (names.length) queueRefreshFiles(names);
    }, 120);
  }

  async function refreshFiles(selectName) {
    const selectNames = normalizeSelectNames(selectName);
    const res = await fetch('/api/files');
    const { files } = await res.json();
    allFiles = files;
    const prevSelected = new Set(selectedNames);
    selectedNames = new Set(files.filter((f) => prevSelected.has(f.name)).map((f) => f.name));
    let previewName = null;
    if (selectNames?.length) {
      const valid = selectNames.filter((n) => files.some((f) => f.name === n));
      if (valid.length) {
        selectedNames = new Set(valid);
        previewName = valid[valid.length - 1];
      }
    }

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
          selectItem(li, file, { scroll: true });
          lastSelectIndex = index;
          return;
        }
        if (modKey) {
          toggleFileSelection(file.name, !selectedNames.has(file.name));
          selectItem(li, file, { scroll: true });
          lastSelectIndex = index;
          return;
        }
        // AIGC START — 已选中项再次点击则取消该项（含多选）
        if (selectedNames.has(file.name)) {
          selectedNames.delete(file.name);
          updateSelectionUi();
          if (selectedNames.size === 0) {
            document.querySelectorAll('.file-list li').forEach((el) => el.classList.remove('active'));
            showPreview(null);
            lastSelectIndex = -1;
            return;
          }
          if (li.classList.contains('active') || selectedFile?.name === file.name) {
            const nextName = [...selectedNames][selectedNames.size - 1];
            const nextFile = allFiles.find((f) => f.name === nextName);
            const nextLi = fileListEl.querySelector(`li[data-name="${CSS.escape(nextName)}"]`);
            if (nextFile && nextLi) selectItem(nextLi, nextFile, { scroll: false });
            else showPreview(null);
          }
          lastSelectIndex = index;
          return;
        }
        // AIGC END
        selectedNames.clear();
        selectedNames.add(file.name);
        updateSelectionUi();
        selectItem(li, file, { scroll: true });
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
      if (previewName === file.name) selectItem(li, file, { scroll: false });
    });

    updateSelectionUi();
  }

  function queueRefreshFiles(selectName) {
    const names = normalizeSelectNames(selectName);
    refreshQueue = refreshQueue
      .then(async () => {
        if (!names?.length) {
          await refreshFiles();
          return;
        }
        for (let attempt = 0; attempt < 8; attempt += 1) {
          await refreshFiles(names);
          const allSelected = names.every((n) => selectedNames.has(n));
          const previewOk = names.some((n) => selectedFile?.name === n);
          if (allSelected && previewOk) return;
          await new Promise((r) => setTimeout(r, 80));
        }
      })
      .catch(() => {});
    return refreshQueue;
  }

  function selectItem(li, file, options = {}) {
    document.querySelectorAll('.file-list li').forEach((el) => el.classList.remove('active'));
    li.classList.add('active');
    showPreview(file);
    if (options.scroll && fileListEl && fileListEl.scrollHeight > fileListEl.clientHeight) {
      li.scrollIntoView({ block: 'nearest' });
    }
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
          enqueueUploadSelect(data.file?.name);
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

  const btnRefresh = document.getElementById('btnRefresh');
  let refreshBusy = false;

  function resetRefreshButton() {
    refreshBusy = false;
    if (!btnRefresh) return;
    btnRefresh.disabled = false;
    btnRefresh.textContent = '重启';
  }

  btnRefresh?.addEventListener('click', async () => {
    if (!btnRefresh || refreshBusy) return;
    refreshBusy = true;
    btnRefresh.disabled = true;
    btnRefresh.textContent = '重启中…';
    const safetyTimer = setTimeout(resetRefreshButton, 120000);

    let enableStarted = false;
    try {
      if (isNative && window.snapdrop?.runEnable) {
        const res = await window.snapdrop.runEnable();
        if (!res?.ok) throw new Error(res?.message || '重启失败');
        enableStarted = true;
        clearTimeout(safetyTimer);
        await showInfoToast(res.message || '正在重新打包并启动…', 1500);
        return;
      }
      await reloadServiceAndAccess();
      connectEvents();
      await refreshFiles();
      await showInfoToast('重启成功');
    } catch (err) {
      await showInfoToast(err?.message || '重启失败', 500, 'error');
    } finally {
      clearTimeout(safetyTimer);
      if (!enableStarted) resetRefreshButton();
    }
  });

  btnDeleteAll?.addEventListener('click', deleteSelectedFiles);

  btnToggleUrl?.addEventListener('click', () => {
    if (!realAccessUrl) return;
    urlRevealed = !urlRevealed;
    renderAccessUrl();
  });

  btnCopyFile?.addEventListener('click', async () => {
    if (!selectedFile) return;
    await runCopyWithFastToast(() => copyFileToClipboard(selectedFile));
  });

  if (isNative) {
    saveDirEl?.addEventListener('click', () => window.snapdrop.openSaveDir());
    window.snapdrop.onFileUploaded((file) => enqueueUploadSelect(file?.name));
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
  }

  init().catch(() => {
    refreshFiles().catch(() => {});
  });
})();
