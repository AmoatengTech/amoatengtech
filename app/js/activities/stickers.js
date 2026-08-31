/* ============================================================
   activities/stickers.js
   Sticker collage: tap a sticker in the toolbar, then tap the
   canvas to place it. Undo / clear supported.

   - Stickers are emoji rendered via fillText on canvas, which
     keeps the implementation simple (KISS) and works for PNG
     export with zero extra steps.
   - Sticker data is plain JS, so adding categories or stickers
     is data-only (Open-Closed).
   ============================================================ */

(function (global) {
  'use strict';

  const { qs, qsa, el, attachPointer, attachPinchZoom, fitSquareCanvas } = global.Utils;
  const { exportCanvas, saveDraft, loadDraft, clearDraft } = global.Storage;

  /* ---------- Sticker catalog ----------
     Each category: { id, label, emoji, stickers: string[] }
  */
  const CATEGORIES = [
    {
      id: 'animals', label: 'Animals', emoji: '🦁',
      stickers: ['🦁','🐯','🐻','🐼','🐨','🐰','🦊','🐸','🐵','🐘','🦒','🐬','🐠','🐙','🦋','🐝','🦄','🐶','🐱','🐭']
    },
    {
      id: 'food', label: 'Food', emoji: '🍎',
      stickers: ['🍎','🍌','🍉','🍇','🍓','🍒','🍑','🥝','🍍','🥥','🍕','🍔','🍟','🍩','🍪','🎂','🍦','🍫','🍭','🍿']
    },
    {
      id: 'nature', label: 'Nature', emoji: '🌸',
      stickers: ['🌸','🌼','🌻','🌷','🌹','🌳','🌴','🌵','🍁','🌿','⭐','🌟','✨','☀️','🌙','☁️','⚡','🌈','❄️','🔥']
    },
    {
      id: 'fun', label: 'Fun', emoji: '🎈',
      stickers: ['🎈','🎉','🎊','🎁','🎵','🎶','🏆','🥇','⚽','🏀','🚗','✈️','🚀','⛵','🏰','💎','🔮','🎲','🃏','🎩']
    }
  ];

  /* ---------- Module state ---------- */
  let canvas, ctx;
  let categoryBar, stickerGrid;
  let currentCategory = CATEGORIES[0].id;
  let currentSticker = CATEGORIES[0].stickers[0];

  // Sticker placements for redraw on resize + undo.
  // Each entry: { char, x, y, size }
  const placements = [];
  const STICKER_FONT = stickerSizePx => `${stickerSizePx}px ${getComputedStyle(document.body).fontFamily}`;

  const DEFAULT_STICKER_SIZE = 64;

  /* ---------- Helpers ---------- */

  function drawPlacement(p) {
    ctx.font = STICKER_FONT(p.size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.char, p.x, p.y);
  }

  function redrawAll() {
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    placements.forEach(drawPlacement);
  }

  function resizeCanvas() {
    const fit = fitSquareCanvas(canvas);
    if (!fit) return;
    const { dpr } = fit;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    redrawAll();
  }

  function placeAt(x, y) {
    const p = { char: currentSticker, x, y, size: DEFAULT_STICKER_SIZE };
    placements.push(p);
    drawPlacement(p);
    draftDirty = true;
    syncActionButtons();
  }

  /** Topmost placement under (x, y), or -1. Emoji glyphs are drawn
      centred on (p.x, p.y) at roughly p.size square, so a circular
      hit radius of half the sticker (+ a touch slop for small
      fingers) matches what the child sees. */
  function placementAt(x, y) {
    const radius = DEFAULT_STICKER_SIZE / 2 + 10;
    for (let i = placements.length - 1; i >= 0; i--) {
      const p = placements[i];
      const r = Math.max(radius, p.size / 2 + 10);
      const dx = x - p.x, dy = y - p.y;
      if (dx * dx + dy * dy <= r * r) return i;
    }
    return -1;
  }

  function undo() {
    if (!placements.length) return;
    placements.pop();
    draftDirty = true;
    redrawAll();
    syncActionButtons();
  }

  function clearAll() {
    placements.length = 0;
    draftDirty = true;
    redrawAll();
    syncActionButtons();
    clearDraft('stickers');
  }

  /** Grey Undo/Clear out when there is nothing to undo / no stickers
      placed yet (cause-and-effect affordance for kids). */
  function syncActionButtons() {
    if (undoBtn) undoBtn.disabled = placements.length === 0;
    if (clearBtn) clearBtn.disabled = placements.length === 0;
  }

  /* ---------- Toolbar ---------- */

  function buildCategoryBar() {
    categoryBar.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const btn = el('button', {
        type: 'button',
        class: 'category-pick__btn' + (cat.id === currentCategory ? ' is-active' : ''),
        dataset: { category: cat.id },
        title: cat.label,
        'aria-label': cat.label,
        'aria-pressed': cat.id === currentCategory ? 'true' : 'false',
        onclick: () => selectCategory(cat.id)
      }, [
        el('span', { 'aria-hidden': 'true' }, cat.emoji),
        el('span', { class: 'category-pick__name' }, cat.label)
      ]);
      categoryBar.appendChild(btn);
    });
  }

  function buildStickerGrid() {
    stickerGrid.innerHTML = '';
    const cat = CATEGORIES.find(c => c.id === currentCategory) || CATEGORIES[0];
    cat.stickers.forEach(char => {
      const btn = el('button', {
        type: 'button',
        class: 'sticker-grid__btn' + (char === currentSticker ? ' is-active' : ''),
        dataset: { sticker: char },
        title: char,
        'aria-label': `Sticker ${char}`,
        onclick: () => selectSticker(char)
      }, [document.createTextNode(char)]);
      stickerGrid.appendChild(btn);
    });
  }

  function selectCategory(id) {
    currentCategory = id;
    const cat = CATEGORIES.find(c => c.id === id);
    currentSticker = cat.stickers[0];
    qsa('[data-category]', categoryBar).forEach(btn => {
      const active = btn.dataset.category === id;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    buildStickerGrid();
  }

  function selectSticker(char) {
    currentSticker = char;
    qsa('[data-sticker]', stickerGrid).forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.sticker === char);
    });
  }

  /* ---------- Lifecycle ---------- */

  let detachPointer = null;
  let detachPinch = null;
  let resizeObs = null;

  // Crash-safe draft state + action-button refs
  let undoBtn, clearBtn;
  let draftDirty = false;
  let draftTimer = null;
  let flushDraftListeners = null;

  function init() {
    canvas = qs('[data-stickers-canvas]');
    categoryBar = qs('[data-sticker-categories]');
    stickerGrid = qs('[data-sticker-grid]');
    undoBtn = qs('[data-stickers-undo]');
    clearBtn = qs('[data-stickers-clear]');
    ctx = canvas.getContext('2d');

    buildCategoryBar();
    buildStickerGrid();
    resizeCanvas();

    undoBtn.addEventListener('click', undo);
    clearBtn.addEventListener('click', clearAll);

    // Tap on empty canvas = place a new sticker (drag leaves a trail,
    // as before). Tap ON a sticker = drag-move that sticker instead
    // of placing a new one on top of it.
    let lastPlaced = 0;
    let dragIndex = -1;
    detachPointer = attachPointer(canvas, {
      onStart: (pos) => {
        if (canvas.dataset.pinch) return;   // two-finger zoom, not a placement
        dragIndex = placementAt(pos.x, pos.y);
        if (dragIndex === -1) {
          placeAt(pos.x, pos.y);
          lastPlaced = Date.now();
        }
      },
      onMove: (pos) => {
        if (canvas.dataset.pinch) return;
        if (dragIndex !== -1) {
          // Repositioning an existing sticker
          const p = placements[dragIndex];
          p.x = pos.x; p.y = pos.y;
          draftDirty = true;
          redrawAll();
          return;
        }
        // Throttle drag-placement to ~ every 120ms to avoid over-density
        const now = Date.now();
        if (now - lastPlaced > 120) {
          placeAt(pos.x, pos.y);
          lastPlaced = now;
        }
      },
      onEnd: () => { dragIndex = -1; }
    });

    // Two-finger pinch-zoom + pan (shared helper; pointerPos is
    // already zoom-aware via canvas.dataset.zoom).
    detachPinch = attachPinchZoom(canvas.parentElement, canvas);

    // Restore crash-safe draft, then arm periodic + on-hide flushing
    restoreDraft();
    syncActionButtons();
    startDrafting();

    // Observe the canvas-wrap parent (not the canvas) so rotation
    // and layout changes re-fit while preserving placements.
    resizeObs = new ResizeObserver(() => resizeCanvas());
    resizeObs.observe(canvas.parentElement);
  }

  function destroy() {
    stopDrafting();
    if (detachPointer) detachPointer();
    if (detachPinch) detachPinch();
    if (resizeObs) resizeObs.disconnect();
    placements.length = 0;
  }

  function exportPNG() {
    return exportCanvas(canvas, 'my-stickers.png');
  }

  /* ---------- Draft persistence (crash-safe) ----------
     placements are plain {char, x, y, size} objects, so the whole
     collage serialises to JSON with no extra work. */
  function flushDraft() {
    if (!draftDirty || !canvas) return;
    draftDirty = false;
    if (placements.length === 0) { clearDraft('stickers'); return; }
    try { saveDraft('stickers', { placements }); } catch (_) {}
  }

  function restoreDraft() {
    const draft = loadDraft('stickers');
    if (!draft || !Array.isArray(draft.placements)) return false;
    for (const p of draft.placements) {
      if (p && typeof p.char === 'string' && isFinite(p.x) && isFinite(p.y) && isFinite(p.size)) {
        placements.push({ char: p.char, x: p.x, y: p.y, size: p.size });
      }
    }
    if (placements.length) {
      redrawAll();
      return true;
    }
    return false;
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

  function onAgeChange() {
    /* Toddler mode hides the category picker via CSS, so we
       force the "animals" category which has the most universal
       appeal for very young kids. */
    if (document.documentElement.dataset.age === 'toddler') {
      selectCategory('animals');
    }
  }

  /* ---------- Export ---------- */
  global.Activities = global.Activities || {};
  global.Activities.stickers = { init, destroy, exportPNG, onAgeChange };
})(window);
