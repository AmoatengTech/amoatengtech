/* ============================================================
   storage.js
   Single Responsibility: persistence + export.
   - Save drawings as PNG (the only required "save" feature)
   - Read/write app settings (age mode) to localStorage
   Activity modules don't touch localStorage directly; they
   call into here.
   ============================================================ */

(function (global) {
  'use strict';

  const LS_KEY = 'colourinbook-settings';

  /* ---------- Settings (age mode) ---------- */
  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveSettings(patch) {
    const next = { ...loadSettings(), ...patch };
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch (_) {}
    return next;
  }

  /* ---------- Crash-safe drafts ----------
     Every activity buffers its in-progress artwork here (~every 10s
     + on tab hide/close), so a refresh or crash never loses work.
     Drafts are keyed per activity and cleared when the child
     deliberately clears the canvas. */
  const DRAFT_PREFIX = 'colourinbook-draft-';

  function saveDraft(activity, payload) {
    try { localStorage.setItem(DRAFT_PREFIX + activity, JSON.stringify(payload)); } catch (_) {}
  }

  function loadDraft(activity) {
    try { return JSON.parse(localStorage.getItem(DRAFT_PREFIX + activity) || 'null'); }
    catch (_) { return null; }
  }

  function clearDraft(activity) {
    try { localStorage.removeItem(DRAFT_PREFIX + activity); } catch (_) {}
  }

  /* ---------- PNG export ---------- */

  /**
   * Trigger a browser download for a data URL.
   * @param {string} dataUrl  - PNG data URL
   * @param {string} filename - download filename
   */
  function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Export an HTMLCanvasElement directly to PNG.
   */
  function exportCanvas(canvas, filename = 'my-picture.png') {
    const url = canvas.toDataURL('image/png');
    downloadDataUrl(url, filename);
    return Promise.resolve(url);
  }

  /**
   * Export an SVG element to PNG by rasterizing through a canvas.
   * Used by the coloring book activity.
   *
   * Single Responsibility: this is the only place that knows how
   * to turn an SVG into a PNG; coloring.js just calls this.
   *
   * @param {SVGSVGElement} svg
   * @param {string} [filename]
   * @param {number} [size]   - output pixel size (square)
   * @returns {Promise<string>} resolves to data URL
   */
  function exportSvg(svg, filename = 'my-colouring.png', size = 1024) {
    return new Promise((resolve, reject) => {
      // Clone the SVG so we can serialize a clean copy
      const clone = svg.cloneNode(true);
      // Ensure xmlns is set so the data URL is valid
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      if (!clone.getAttribute('width'))  clone.setAttribute('width',  size);
      if (!clone.getAttribute('height')) clone.setAttribute('height', size);

      const svgString = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        URL.revokeObjectURL(url);
        const png = canvas.toDataURL('image/png');
        downloadDataUrl(png, filename);
        resolve(png);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  }

  /* ---------- Export ---------- */
  global.Storage = {
    loadSettings,
    saveSettings,
    saveDraft,
    loadDraft,
    clearDraft,
    downloadDataUrl,
    exportCanvas,
    exportSvg
  };
})(window);
