(function (global) {
  const baseUrl = global.location?.origin || '';

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return s.replace(/"/g, '&quot;');
  }

  function fileUrl(file) {
    return baseUrl + file.url;
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
      return '<div class="thumb-badge thumb-pdf"><span>PDF</span></div>';
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

  async function fetchFiles() {
    const res = await fetch('/api/files');
    const data = await res.json();
    return data.files || [];
  }

  async function uploadFileList(fileList) {
    const files = Array.from(fileList);
    if (!files.length) return { ok: true, files: [] };
    const form = new FormData();
    files.forEach((f) => form.append('files', f, f.name));
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '上传失败');
    return data;
  }

  async function deleteFileByName(name) {
    const res = await fetch(`/api/files/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '删除失败');
    return data;
  }

  async function checkUpdate() {
    const res = await fetch('/api/update-check');
    if (!res.ok) throw new Error('check failed');
    return res.json();
  }

  function connectEvents(handlers) {
    const es = new EventSource('/events');
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'upload') handlers.onUpload?.(data);
        if (data.type === 'delete') handlers.onDelete?.(data);
      } catch { /* ignore */ }
    };
    es.onerror = () => {
      es.close();
      setTimeout(() => connectEvents(handlers), 3000);
    };
    return es;
  }

  global.KuaiChuanCore = {
    baseUrl,
    formatSize,
    formatTime,
    isImage,
    getFileKind,
    getFileExtLabel,
    escapeHtml,
    escapeAttr,
    fileUrl,
    buildFileThumbHtml,
    setupListThumb,
    fetchFiles,
    uploadFileList,
    deleteFileByName,
    checkUpdate,
    connectEvents,
  };
})(typeof window !== 'undefined' ? window : globalThis);
