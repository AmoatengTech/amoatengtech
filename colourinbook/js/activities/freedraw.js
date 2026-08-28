/* ============================================================
   activities/freedraw.js
   Free-draw canvas: brush + eraser, color palette, size slider,
   undo (snapshot-based), clear, save-as-PNG.

   Single Responsibility: only knows about drawing on its canvas.
   Saves snapshots to its own in-memory stack (NOT localStorage
   — keep simple, KISS).
   ============================================================ */

(function (global) {
  'use strict';

  const { qs, qsa, el, attachPointer, colorsForAge, fitSquareCanvas } = global.Utils;
  const { exportCanvas } = global.Storage;

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
  }

  function clearCanvas() {
    pushUndo();
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }

  /** Resize canvas to a square that fits its parent (retina-aware). */
  function resizeCanvas() {
    const fit = fitSquareCanvas(canvas);
    if (!fit) return;
    const { size, dpr } = fit;

    // Snapshot existing content to restore after resize
    const prev = snapshot();
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

    // Pointer drawing
    detachPointer = attachPointer(canvas, {
      onStart: (pos) => startStroke(pos.x, pos.y),
      onMove:  (pos) => continueStroke(pos.x, pos.y),
      onEnd:   () => endStroke()
    });

    // Resize handling
    resizeObs = new ResizeObserver(() => resizeCanvas());
    resizeObs.observe(canvas);
  }

  function destroy() {
    if (detachPointer) detachPointer();
    if (resizeObs) resizeObs.disconnect();
    undoStack.length = 0;
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
