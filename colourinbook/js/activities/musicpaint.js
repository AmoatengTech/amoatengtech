/* ============================================================
   activities/musicpaint.js
   Music paint: paint with colors, each color plays a note from
   the C-major pentatonic scale (always pleasant, never
   dissonant — important for kids).

   - Tap = single note + dot
   - Drag = continuous tone sequence + brush trail
   - Mute toggle in toolbar
   - Same pointer pipeline as freedraw (DRY via Utils.attachPointer)

   Depends on SoundKit (audio.js) for synthesis.
   ============================================================ */

(function (global) {
  'use strict';

  const { qs, qsa, el, attachPointer, colorsForAge, fitSquareCanvas } = global.Utils;
  const { exportCanvas } = global.Storage;
  const SoundKit = global.SoundKit;

  /* ---------- Module state ---------- */
  let canvas, ctx;
  let colorGridEl, sizeInput, muteBtn;
  let color = null;
  let colorIndex = 0;
  let size = 30;
  let drawing = false;
  let lastX = 0, lastY = 0;
  let lastNoteTime = 0;

  // Undo stack (same pattern as freedraw — kept here rather
  // than abstracted into a shared "UndoStack" class because KISS:
  // each activity has slightly different snapshot semantics).
  const MAX_UNDO = 20;
  const undoStack = [];

  /* ---------- Helpers ---------- */

  function snapshot() {
    try { return ctx.getImageData(0, 0, canvas.width, canvas.height); }
    catch (_) { return null; }
  }
  function pushUndo() {
    const s = snapshot();
    if (!s) return;
    undoStack.push(s);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }
  function restoreUndo() {
    const s = undoStack.pop();
    if (!s) return;
    ctx.putImageData(s, 0, 0);
  }

  function clearCanvas() {
    pushUndo();
    // Music paint uses a dark background for that "night sky" feel
    ctx.fillStyle = '#1a1a2e';
    const rect = canvas.getBoundingClientRect();
    ctx.fillRect(0, 0, rect.width, rect.height);
  }

  function resizeCanvas() {
    const fit = fitSquareCanvas(canvas);
    if (!fit) return;
    const { size, dpr } = fit;
    const prev = snapshot();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, size, size);
    if (prev) {
      const tmp = document.createElement('canvas');
      tmp.width = prev.width; tmp.height = prev.height;
      tmp.getContext('2d').putImageData(prev, 0, 0);
      ctx.drawImage(tmp, 0, 0, size, size);
    }
  }

  /* ---------- Drawing + sound ---------- */

  function playCurrentNote() {
    const palette = colorsForAge();
    SoundKit.playNote(colorIndex, palette.length, { duration: 0.4, volume: 0.22 });
  }

  function startStroke(x, y) {
    pushUndo();
    drawing = true;
    lastX = x; lastY = y;

    // Glow dot
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.6;
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    playCurrentNote();
    lastNoteTime = Date.now();
  }

  function continueStroke(x, y) {
    if (!drawing) return;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    lastX = x; lastY = y;

    // Play a note every ~180ms while dragging — creates a melody
    const now = Date.now();
    if (now - lastNoteTime > 180) {
      playCurrentNote();
      lastNoteTime = now;
    }
  }

  function endStroke() {
    drawing = false;
  }

  /* ---------- Toolbar ---------- */

  function buildColorGrid() {
    colorGridEl.innerHTML = '';
    const palette = colorsForAge();
    palette.forEach(({ name, value }, i) => {
      const sw = el('button', {
        type: 'button',
        class: 'color-swatch',
        dataset: { color: value, index: String(i) },
        title: name,
        'aria-label': `${name} note`,
        style: { backgroundColor: value },
        onclick: () => selectColor(value, i)
      });
      colorGridEl.appendChild(sw);
    });
    selectColor(palette[0].value, 0);
  }

  function selectColor(value, index) {
    color = value;
    colorIndex = index;
    qsa('.color-swatch', colorGridEl).forEach(sw => {
      sw.classList.toggle('is-active', sw.dataset.color === value);
    });
    // Preview the note so kids hear what each color sounds like
    playCurrentNote();
  }

  function toggleMute() {
    const nowMuted = !SoundKit.isMuted();
    SoundKit.setMuted(nowMuted);
    muteBtn.setAttribute('aria-pressed', nowMuted ? 'true' : 'false');
    muteBtn.querySelector('[aria-hidden="true"]').textContent = nowMuted ? '🔇' : '🔊';
    muteBtn.querySelector('.btn__label').textContent = nowMuted ? 'Sound off' : 'Sound on';
  }

  /* ---------- Lifecycle ---------- */

  let detachPointer = null;
  let resizeObs = null;

  function init() {
    canvas = qs('[data-music-canvas]');
    colorGridEl = qs('[data-music-colors]');
    sizeInput = qs('[data-music-size]');
    muteBtn = qs('[data-music-mute]');
    ctx = canvas.getContext('2d');

    size = parseInt(sizeInput.value, 10) || 30;
    color = colorsForAge()[0].value;

    resizeCanvas();
    buildColorGrid();

    sizeInput.addEventListener('input', () => {
      size = parseInt(sizeInput.value, 10);
    });
    muteBtn.addEventListener('click', toggleMute);
    qs('[data-music-undo]').addEventListener('click', restoreUndo);
    qs('[data-music-clear]').addEventListener('click', clearCanvas);

    detachPointer = attachPointer(canvas, {
      onStart: (pos) => startStroke(pos.x, pos.y),
      onMove:  (pos) => continueStroke(pos.x, pos.y),
      onEnd:   () => endStroke()
    });

    resizeObs = new ResizeObserver(() => resizeCanvas());
    resizeObs.observe(canvas);
  }

  function destroy() {
    if (detachPointer) detachPointer();
    if (resizeObs) resizeObs.disconnect();
    undoStack.length = 0;
  }

  function exportPNG() {
    return exportCanvas(canvas, 'my-music-paint.png');
  }

  function onAgeChange() {
    buildColorGrid();
  }

  /* ---------- Export ---------- */
  global.Activities = global.Activities || {};
  global.Activities.musicpaint = { init, destroy, exportPNG, onAgeChange };
})(window);
