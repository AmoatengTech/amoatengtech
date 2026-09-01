/* ============================================================
   activities/freedraw.js
   Free-draw canvas: brush + eraser, color palette, size slider,
   undo (snapshot-based), clear, save-as-PNG.

   Single Responsibility: only knows about drawing on its canvas.
   Saves snapshots to its own in-memory stack (NOT localStorage,
   keeping it simple, KISS).
   ============================================================ */

(function (global) {
  'use strict';

  const { qs, qsa, el, attachPointer, attachPinchZoom, colorsForAge, fitSquareCanvas } = global.Utils;
  const { exportCanvas, saveDraft, loadDraft, clearDraft } = global.Storage;

  /* ---------- Module state ---------- */
  let canvas, ctx;
  let colorGridEl, sizeInput;
  let tool = 'brush';         // 'brush' | 'eraser'
  let color = null;
  let size = 14;
  let drawing = false;
  let lastX = 0, lastY = 0;

  // Undo stack: each entry is an ImageData snapshot of the canvas.
  // We cap the depth to avoid unbounded memory growth.
  const MAX_UNDO = 20;
  const undoStack = [];

  // Crash-safe draft state + action-button refs
  let undoBtn, clearBtn;
  let hasArt = false;
  let draftDirty = false;
  let draftTimer = null;
  let flushDraftListeners = null;
  let lastFitSize = 0;
  let detachPinch = null;

  /* ---------- Helpers ---------- */

  function snapshot() {
    try {
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (_) { return null; }
  }

  function pushUndo() {
    const snap = snapshot();
    if (!snap) return;
    undoStack.push(snap);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }

  function restoreUndo() {
    const snap = undoStack.pop();
    if (!snap) return;
    ctx.putImageData(snap, 0, 0);
    draftDirty = true;
    syncActionButtons();
  }

  function clearCanvas() {
    pushUndo();
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    hasArt = false;
    draftDirty = true;
    flushDraft();          // deliberate clear -> drop the saved draft too
    clearDraft('freedraw');
    syncActionButtons();
  }

  /** Grey Undo/Clear out when there is nothing to undo / nothing
      drawn yet (cause-and-effect affordance for kids). */
  function syncActionButtons() {
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (clearBtn) clearBtn.disabled = !hasArt;
  }

  /** Resize canvas to a square that fits its parent (retina-aware). */
  function resizeCanvas() {
    // Snapshot BEFORE resizing: setting canvas.width (inside
    // fitSquareCanvas) wipes the bitmap, so capturing afterwards
    // would snapshot an empty canvas and silently erase the art.
    const prev = snapshot();
    const fit = fitSquareCanvas(canvas);
    if (!fit) return;
    const { size, dpr } = fit;
    lastFitSize = size;

    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset before resize
    ctx.scale(dpr, dpr);

    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // Restore previous content if any (scaled to new size)
    if (prev) {
      const tmp = document.createElement('canvas');
      tmp.width = prev.width;
      tmp.height = prev.height;
      tmp.getContext('2d').putImageData(prev, 0, 0);
      ctx.drawImage(tmp, 0, 0, size, size);
    }
  }

  /* ---------- Drawing ---------- */

  function strokeStyle() {
    return tool === 'eraser' ? '#ffffff' : color;
  }

  function startStroke(x, y) {
    pushUndo();
    drawing = true;
    hasArt = true;
    draftDirty = true;
    syncActionButtons();
    lastX = x; lastY = y;
    // Dot for single-tap
    ctx.beginPath();
    ctx.fillStyle = strokeStyle();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function continueStroke(x, y) {
    if (!drawing) return;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = strokeStyle();
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastX = x; lastY = y;
  }

  function endStroke() {
    drawing = false;
  }

  /* ---------- Toolbar ---------- */

  function buildColorGrid() {
    colorGridEl.innerHTML = '';
    colorsForAge().forEach(({ name, value }) => {
      const sw = el('button', {
        type: 'button',
        class: 'color-swatch',
        dataset: { color: value },
        title: name,
        'aria-label': name,
        style: { backgroundColor: value },
        onclick: () => selectColor(value)
      });
      colorGridEl.appendChild(sw);
    });
    selectColor(colorsForAge()[0].value);
  }

  function selectColor(value) {
    color = value;
    tool = 'brush';
    qsa('.color-swatch', colorGridEl).forEach(sw => {
      sw.classList.toggle('is-active', sw.dataset.color === value);
    });
    qsa('[data-freedraw-tool]').forEach(btn => {
      const isActive = btn.dataset.freedrawTool === 'brush';
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function selectTool(name) {
    tool = name;
    qsa('[data-freedraw-tool]').forEach(btn => {
      const isActive = btn.dataset.freedrawTool === name;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  /* ---------- Draft persistence (crash-safe) ---------- */
  function flushDraft() {
    if (!draftDirty || !canvas) return;
    draftDirty = false;
    if (!hasArt && undoStack.length === 0) { clearDraft('freedraw'); return; }
    try { saveDraft('freedraw', { img: canvas.toDataURL('image/png') }); } catch (_) {}
  }

  function restoreDraft() {
    const draft = loadDraft('freedraw');
    if (!draft || !draft.img) return false;
    const img = new Image();
    img.onload = () => {
      if (!canvas) return;
      const s = lastFitSize || canvas.width / (window.devicePixelRatio || 1);
      ctx.drawImage(img, 0, 0, s, s);
      hasArt = true;
      syncActionButtons();
    };
    img.src = draft.img;
    return true;
  }

  function startDrafting() {
    draftTimer = setInterval(flushDraft, 10000);
    flushDraftListeners = () => flushDraft();
    window.addEventListener('beforeunload', flushDraftListeners);
    document.addEventListener('visibilitychange', flushDraftListeners);
  }

  function stopDrafting() {
    flushDraft();  // never lose the last <10s on tab switch/close
    if (draftTimer) clearInterval(draftTimer);
    if (flushDraftListeners) {
      window.removeEventListener('beforeunload', flushDraftListeners);
      document.removeEventListener('visibilitychange', flushDraftListeners);
      flushDraftListeners = null;
    }
  }

  /* ---------- Lifecycle ---------- */

  let detachPointer = null;
  let resizeObs = null;

  function init() {
    canvas = qs('[data-freedraw-canvas]');
    colorGridEl = qs('[data-freedraw-colors]');
    sizeInput = qs('[data-freedraw-size]');
    ctx = canvas.getContext('2d');

    size = parseInt(sizeInput.value, 10) || 14;
    color = colorsForAge()[0].value;

    resizeCanvas();
    buildColorGrid();

    // Tools
    qsa('[data-freedraw-tool]').forEach(btn => {
      btn.addEventListener('click', () => selectTool(btn.dataset.freedrawTool));
    });

    sizeInput.addEventListener('input', () => {
      size = parseInt(sizeInput.value, 10);
    });

    qs('[data-freedraw-undo]').addEventListener('click', restoreUndo);
    qs('[data-freedraw-clear]').addEventListener('click', clearCanvas);
    undoBtn = qs('[data-freedraw-undo]');
    clearBtn = qs('[data-freedraw-clear]');

    // Pointer drawing (single finger; two-finger pinch-zoom handled
    // separately on the canvas-wrap (see attachPinchZoom)
    detachPointer = attachPointer(canvas, {
      onStart: (pos) => { if (canvas.dataset.pinch) return; startStroke(pos.x, pos.y); },
      onMove:  (pos) => { if (canvas.dataset.pinch) return; continueStroke(pos.x, pos.y); },
      onEnd:   () => endStroke()
    });
    detachPinch = attachPinchZoom(canvas.parentElement, canvas);

    // Restore crash-safe draft, then arm periodic + on-hide flushing
    restoreDraft();
    syncActionButtons();
    startDrafting();

    // Resize handling: observe the canvas-wrap PARENT (not the
    // canvas); the canvas gets a fixed inline px size, so its own
    // box never changes when the layout does. Watching the parent
    // catches rotation, breakpoint crossing, and age-mode toolbar
    // width changes, and resizeCanvas() preserves existing content.
    resizeObs = new ResizeObserver(() => resizeCanvas());
    resizeObs.observe(canvas.parentElement);
  }

  function destroy() {
    stopDrafting();
    if (detachPointer) detachPointer();
    if (detachPinch) detachPinch();
    if (resizeObs) resizeObs.disconnect();
    undoStack.length = 0;
    hasArt = false;
  }

  function exportPNG() {
    return exportCanvas(canvas, 'my-drawing.png');
  }

  function onAgeChange() {
    buildColorGrid();
  }

  /* ---------- Export ---------- */
  global.Activities = global.Activities || {};
  global.Activities.freedraw = { init, destroy, exportPNG, onAgeChange };
})(window);
