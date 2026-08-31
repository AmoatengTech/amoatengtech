/* ============================================================
   activities/musicpaint.js
   Music paint: paint with colors, each color plays a note from
   the C-major pentatonic scale (always pleasant, never
   dissonant, which is important for kids).

   - Tap = single note + dot
   - Drag = continuous tone sequence + brush trail
   - Mute toggle in toolbar
   - Same pointer pipeline as freedraw (DRY via Utils.attachPointer)

   Depends on SoundKit (audio.js) for synthesis.
   ============================================================ */

(function (global) {
  'use strict';

  const { qs, qsa, el, attachPointer, attachPinchZoom, colorsForAge, fitSquareCanvas } = global.Utils;
  const { exportCanvas, loadSettings, saveSettings, saveDraft, loadDraft, clearDraft } = global.Storage;
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

  // Undo stack (same pattern as freedraw, kept here rather
  // than abstracted into a shared "UndoStack" class because KISS:
  // each activity has slightly different snapshot semantics).
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
    draftDirty = true;
    syncActionButtons();
  }

  function clearCanvas() {
    pushUndo();
    // Music paint uses a dark background for that "night sky" feel
    ctx.fillStyle = '#1a1a2e';
    const rect = canvas.getBoundingClientRect();
    ctx.fillRect(0, 0, rect.width, rect.height);
    hasArt = false;
    draftDirty = true;
    flushDraft();          // deliberate clear -> drop the saved draft too
    clearDraft('musicpaint');
    syncActionButtons();
  }

  /** Grey Undo/Clear out when there is nothing to undo / nothing
      painted yet (cause-and-effect affordance for kids). */
  function syncActionButtons() {
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (clearBtn) clearBtn.disabled = !hasArt;
  }

  function resizeCanvas() {
    // Snapshot BEFORE resizing: fitSquareCanvas assigns canvas.width,
    // which wipes the bitmap (same fix as freedraw.js).
    const prev = snapshot();
    const fit = fitSquareCanvas(canvas);
    if (!fit) return;
    const { size, dpr } = fit;
    lastFitSize = size;
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
    hasArt = true;
    draftDirty = true;
    syncActionButtons();
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

    // Play a note every ~180ms while dragging, which creates a melody
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

  /** Reflect a muted state onto the toolbar button. Kept separate
      from toggleMute so init can apply the persisted preference
      without flipping the SoundKit state a second time. */
  function syncMuteUI(muted) {
    muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    // Keep the accessible name in sync (the text label is hidden on
    // mobile / toddler modes, so aria-label is the only name).
    muteBtn.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
    muteBtn.querySelector('[aria-hidden="true"]').textContent = muted ? '🔇' : '🔊';
    muteBtn.querySelector('.btn__label').textContent = muted ? 'Sound off' : 'Sound on';
  }

  function toggleMute() {
    const nowMuted = !SoundKit.isMuted();
    SoundKit.setMuted(nowMuted);
    // Persist across reloads; the mute toggle used to reset to
    // sound-on every time the app loaded.
    saveSettings({ muted: nowMuted });
    syncMuteUI(nowMuted);
  }

  /* ---------- Draft persistence (crash-safe) ---------- */
  function flushDraft() {
    if (!draftDirty || !canvas) return;
    draftDirty = false;
    if (!hasArt && undoStack.length === 0) { clearDraft('musicpaint'); return; }
    try { saveDraft('musicpaint', { img: canvas.toDataURL('image/png') }); } catch (_) {}
  }

  function restoreDraft() {
    const draft = loadDraft('musicpaint');
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
    canvas = qs('[data-music-canvas]');
    colorGridEl = qs('[data-music-colors]');
    sizeInput = qs('[data-music-size]');
    muteBtn = qs('[data-music-mute]');
    undoBtn = qs('[data-music-undo]');
    clearBtn = qs('[data-music-clear]');
    ctx = canvas.getContext('2d');

    size = parseInt(sizeInput.value, 10) || 30;
    color = colorsForAge()[0].value;

    resizeCanvas();
    buildColorGrid();

    sizeInput.addEventListener('input', () => {
      size = parseInt(sizeInput.value, 10);
    });
    muteBtn.addEventListener('click', toggleMute);
    undoBtn.addEventListener('click', restoreUndo);
    clearBtn.addEventListener('click', clearCanvas);

    // Restore the persisted mute preference BEFORE any note can play
    // (selectColor previews a note below), so a muted reload stays muted.
    syncMuteUI(SoundKit.setMuted(!!loadSettings().muted));

    // Single finger paints; two-finger pinch-zoom handled separately on
    // the canvas-wrap (see attachPinchZoom in utils.js).
    detachPointer = attachPointer(canvas, {
      onStart: (pos) => { if (canvas.dataset.pinch) return; startStroke(pos.x, pos.y); },
      onMove:  (pos) => { if (canvas.dataset.pinch) return; continueStroke(pos.x, pos.y); },
      onEnd:   () => endStroke()
    });
    detachPinch = attachPinchZoom(canvas.parentElement, canvas);

    // Observe the canvas-wrap parent (not the canvas) so rotation
    // and layout changes re-fit while preserving the painting.
    resizeObs = new ResizeObserver(() => resizeCanvas());
    resizeObs.observe(canvas.parentElement);

    // Restore crash-safe draft, then arm periodic + on-hide flushing
    restoreDraft();
    syncActionButtons();
    startDrafting();
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
    return exportCanvas(canvas, 'my-music-paint.png');
  }

  function onAgeChange() {
    buildColorGrid();
  }

  /* ---------- Export ---------- */
  global.Activities = global.Activities || {};
  global.Activities.musicpaint = { init, destroy, exportPNG, onAgeChange };
})(window);
