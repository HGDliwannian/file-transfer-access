// AIGC START
(function () {
  const C = window.KuaiChuanCore;
  if (!C) return;

  const fileInput = document.getElementById('fileInput');
  const uploadStatus = document.getElementById('uploadStatus');
  const fileListEl = document.getElementById('fileList');
  const filesDropArea = document.getElementById('filesDropArea');
  const filesAppendZone = document.getElementById('filesAppendZone');
  const filesBody = document.getElementById('filesBody');
  const fileCountEl = document.getElementById('fileCount');
  const btnDeleteAll = document.getElementById('btnDeleteAll');
  const btnCopySelected = document.getElementById('btnCopySelected');
  const selectionCountEl = document.getElementById('selectionCount');
  const previewPane = document.getElementById('previewPane');
  const previewFileName = document.getElementById('previewFileName');
  const previewFileMeta = document.getElementById('previewFileMeta');
  const previewImg = document.getElementById('previewImg');
  const previewFrame = document.getElementById('previewFrame');
  const previewIcon = document.getElementById('previewIcon');
  const previewIconHint = document.getElementById('previewIconHint');
  const btnDownload = document.getElementById('btnDownload');
  const btnCopyFile = document.getElementById('btnCopyFile');
  const btnClosePreview = document.getElementById('btnClosePreview');
  const confirmModal = document.getElementById('confirmModal');
  const confirmMessageEl = document.getElementById('confirmMessage');
  const confirmCancelBtn = document.getElementById('confirmCancel');
  const confirmOkBtn = document.getElementById('confirmOk');
  const appToast = document.getElementById('appToast');
  const appToastMessage = document.getElementById('appToastMessage');

  let uploadChain = Promise.resolve();
  let selectedFile = null;
  let selectedNames = new Set();
  let allFiles = [];
  let lastSelectIndex = -1;
  let appToastTimer = null;
  let uploadStatusTimer = null;

  function showToast(message, ms = 500, variant = 'ok') {
    return new Promise((resolve) => {
      if (appToastTimer) clearTimeout(appToastTimer);
      if (!appToast || !appToastMessage) {
        resolve();
        return;
      }
      appToastMessage.textContent = message;
      appToast.classList.toggle('m-toast--error', variant === 'error');
      appToast.classList.remove('hidden');
      appToastTimer = setTimeout(() => {
        appToast.classList.add('hidden');
        appToast.classList.remove('m-toast--error');
        appToastTimer = null;
        resolve();
      }, ms);
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
        confirmModal.querySelector('.m-modal__backdrop')?.removeEventListener('click', onCancel);
        resolve(result);
      };
      const onCancel = () => cleanup(false);
      const onOk = () => cleanup(true);
      confirmCancelBtn.addEventListener('click', onCancel);
      confirmOkBtn.addEventListener('click', onOk);
      confirmModal.querySelector('.m-modal__backdrop')?.addEventListener('click', onCancel);
    });
  }

  function setUploadStatus(text, type) {
    uploadStatus.textContent = text;
    uploadStatus.className = 'm-status' + (type ? ` ${type}` : '');
    if (uploadStatusTimer) clearTimeout(uploadStatusTimer);
    if (type === 'ok' || type === 'err') {
      uploadStatusTimer = setTimeout(() => {
        uploadStatus.textContent = '';
        uploadStatus.className = 'm-status';
      }, 2000);
    }
  }

  async function verifyClipboardImage() {
    if (!navigator.clipboard?.read) return true;
    try {
      const items = await navigator.clipboard.read();
      return items.some((item) => item.types.some((t) => t.startsWith('image/')));
    } catch {
      return false;
    }
  }

  async function verifyClipboardText(expected) {
    if (!navigator.clipboard?.readText) return true;
    try {
      return (await navigator.clipboard.readText()) === expected;
    } catch {
      return false;
    }
  }

  async function copyFileToClipboard(file) {
    const url = C.fileUrl(file);
    try {
      if (C.isImage(file.name)) {
        const res = await fetch(url);
        const blob = await res.blob();
        const type = blob.type || 'image/png';
        await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
        return (await verifyClipboardImage()) ? { ok: true } : { ok: false, message: '复制失败' };
      }
      if (/\.(txt|md|json|csv|log|xml|html|css|js|ts|py|sh|yaml|yml)$/i.test(file.name)) {
        const text = await (await fetch(url)).text();
        await navigator.clipboard.writeText(text);
        return (await verifyClipboardText(text)) ? { ok: true } : { ok: false, message: '复制失败' };
      }
      await navigator.clipboard.writeText(url);
      return (await verifyClipboardText(url)) ? { ok: true } : { ok: false, message: '复制失败' };
    } catch (err) {
      return { ok: false, message: err.message || '复制失败' };
    }
  }

  async function copyFilesToClipboard(files) {
    if (!files.length) return { ok: false, message: '请先选择文件' };
    if (files.length === 1) return copyFileToClipboard(files[0]);
    try {
      const text = files.map((f) => C.fileUrl(f)).join('\n');
      await navigator.clipboard.writeText(text);
      return (await verifyClipboardText(text)) ? { ok: true } : { ok: false, message: '批量复制失败' };
    } catch (err) {
      return { ok: false, message: err.message || '批量复制失败' };
    }
  }

  async function runCopy(copyFn) {
    const res = await copyFn();
    if (res?.ok) await showToast('已复制到剪贴板');
    else await showToast(res?.message || '复制失败', 500, 'error');
    return res;
  }

  function getSelectedFiles() {
    return allFiles.filter((f) => selectedNames.has(f.name));
  }

  function updateSelectionUi() {
    const count = selectedNames.size;
    if (selectionCountEl) {
      selectionCountEl.textContent = `已选 ${count}`;
      selectionCountEl.classList.toggle('hidden', count === 0);
    }
    if (btnCopySelected) btnCopySelected.disabled = count === 0;
    if (btnDeleteAll) btnDeleteAll.disabled = count === 0;
    document.querySelectorAll('.m-file-list li[data-name]').forEach((li) => {
      li.classList.toggle('checked', selectedNames.has(li.dataset.name));
    });
  }

  function setEmptyDropzone(active) {
    filesDropArea?.classList.toggle('m-drop-area--empty', active);
    fileListEl.classList.toggle('m-file-list--empty', active);
    filesAppendZone?.classList.toggle('hidden', active);
  }

  function buildEmptyListHtml() {
    return `<li class="m-drop-hint">
      <span class="m-drop-icon" aria-hidden="true">↑</span>
      点击此处上传<br>或从电脑端同步过来的文件会显示在这里
    </li>`;
  }

  function closePreview() {
    selectedFile = null;
    previewPane?.classList.add('hidden');
    filesBody?.classList.remove('has-preview');
    document.querySelectorAll('.m-file-list li').forEach((el) => el.classList.remove('active'));
  }

  function showPreview(file) {
    if (!file) {
      closePreview();
      return;
    }
    selectedFile = file;
    previewPane?.classList.remove('hidden');
    filesBody?.classList.add('has-preview');

    previewImg.hidden = true;
    previewFrame.hidden = true;
    previewIcon.hidden = true;
    previewIcon.innerHTML = '';
    previewIconHint?.classList.add('hidden');

    if (previewFileName) previewFileName.textContent = file.name;
    if (previewFileMeta) {
      previewFileMeta.textContent = `${C.formatSize(file.size)} · ${C.formatTime(file.mtime)}`;
    }

    const url = C.fileUrl(file);
    btnDownload.href = url;
    btnDownload.download = file.name;

    if (C.isImage(file.name)) {
      previewImg.src = url;
      previewImg.hidden = false;
    } else if (/\.pdf$/i.test(file.name)) {
      previewFrame.src = url;
      previewFrame.hidden = false;
    } else {
      previewIcon.innerHTML = C.buildFileThumbHtml(file);
      previewIcon.hidden = false;
      previewIconHint?.classList.remove('hidden');
    }
  }

  function selectItem(li, file) {
    document.querySelectorAll('.m-file-list li').forEach((el) => el.classList.remove('active'));
    li.classList.add('active');
    showPreview(file);
    li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function refreshFiles(selectName) {
    const files = await C.fetchFiles();
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
      closePreview();
      return;
    }

    setEmptyDropzone(false);

    files.forEach((file, index) => {
      const li = document.createElement('li');
      li.dataset.name = file.name;
      li.innerHTML = `
        <div class="m-file-row">
          <div class="m-file-remove-wrap">
            <button type="button" class="m-file-hit" aria-label="预览 ${C.escapeAttr(file.name)}">
              <div class="m-file-info">
                <div class="name">${C.escapeHtml(file.name)}</div>
                <div class="meta">${C.formatSize(file.size)} · ${C.formatTime(file.mtime)}</div>
              </div>
              <div class="m-file-thumb">${C.buildFileThumbHtml(file)}</div>
            </button>
            <button type="button" class="m-file-remove" data-action="delete" aria-label="删除">×</button>
          </div>
        </div>
      `;

      li.querySelector('.m-file-hit')?.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey) {
          if (selectedNames.has(file.name)) selectedNames.delete(file.name);
          else selectedNames.add(file.name);
          updateSelectionUi();
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
          await C.deleteFileByName(file.name);
          selectedNames.delete(file.name);
          if (selectedFile?.name === file.name) closePreview();
          await refreshFiles();
        } catch (err) {
          await showToast(err.message || '删除失败', 500, 'error');
          await refreshFiles();
        }
      });

      C.setupListThumb(li, file);
      fileListEl.appendChild(li);
      if (selectName === file.name) selectItem(li, file);
    });

    updateSelectionUi();
  }

  function uploadFiles(fileList) {
    const files = Array.from(fileList);
    if (!files.length) return uploadChain;
    uploadChain = uploadChain.then(async () => {
      setUploadStatus('上传中…');
      try {
        const data = await C.uploadFileList(files);
        setUploadStatus(`已上传 ${data.files?.length || files.length} 个`, 'ok');
        await refreshFiles(data.files?.[0]?.name);
      } catch (err) {
        setUploadStatus(err.message || '上传失败', 'err');
      }
    });
    return uploadChain;
  }

  fileInput?.addEventListener('change', () => {
    if (fileInput.files?.length) uploadFiles(fileInput.files);
    fileInput.value = '';
  });

  filesDropArea?.addEventListener('click', () => {
    if (filesDropArea.classList.contains('m-drop-area--empty')) fileInput?.click();
  });

  filesAppendZone?.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput?.click();
  });

  document.getElementById('btnRefresh')?.addEventListener('click', async () => {
    await refreshFiles();
    await showToast('刷新成功');
  });

  document.getElementById('btnCheckUpdate')?.addEventListener('click', async () => {
    try {
      const info = await C.checkUpdate();
      if (info?.available) {
        const label = `v${info.latest?.version || '—'}`;
        await showConfirm(`发现新版本 ${label}，是否立即升级？\n\n升级将退出当前应用并打开最新构建。`);
        return;
      }
      await showToast('当前已是最新版本');
    } catch {
      await showToast('检查更新失败', 500, 'error');
    }
  });

  btnClosePreview?.addEventListener('click', closePreview);

  btnCopyFile?.addEventListener('click', async () => {
    if (!selectedFile) return;
    await runCopy(() => copyFileToClipboard(selectedFile));
  });

  btnCopySelected?.addEventListener('click', async () => {
    const files = getSelectedFiles();
    await runCopy(() => copyFilesToClipboard(files));
  });

  btnDeleteAll?.addEventListener('click', async () => {
    const names = [...selectedNames];
    if (!names.length) return;
    const ok = await showConfirm(`确定删除 ${names.length} 个文件？`);
    if (!ok) return;
    btnDeleteAll.disabled = true;
    try {
      for (const name of names) {
        await C.deleteFileByName(name);
        selectedNames.delete(name);
      }
      closePreview();
      await refreshFiles();
    } catch (err) {
      await showToast(err.message || '删除失败', 500, 'error');
      await refreshFiles();
    }
  });

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  C.connectEvents({
    onUpload: (data) => {
      refreshFiles(data.file?.name);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('收到新文件', { body: data.file?.originalName || data.file?.name });
      }
    },
    onDelete: () => refreshFiles(),
  });

  refreshFiles().catch(() => {});
})();
// AIGC END
