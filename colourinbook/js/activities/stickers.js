/* ============================================================
   activities/stickers.js
   Sticker collage: tap a sticker in the toolbar, then tap the
   canvas to place it. Undo / clear supported.

   - Stickers are emoji rendered via fillText on canvas, which
     keeps the implementation simple (KISS) and works for PNG
     export with zero extra steps.
   - Sticker data is plain JS — adding categories or stickers
     is data-only (Open-Closed).
   ============================================================ */

(function (global) {
  'use strict';

  const { qs, qsa, el, attachPointer, fitSquareCanvas } = global.Utils;
  const { exportCanvas } = global.Storage;

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
  }

  function undo() {
    if (!placements.length) return;
    placements.pop();
    redrawAll();
  }

  function clearAll() {
    placements.length = 0;
    redrawAll();
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
  let resizeObs = null;

  function init() {
    canvas = qs('[data-stickers-canvas]');
    categoryBar = qs('[data-sticker-categories]');
    stickerGrid = qs('[data-sticker-grid]');
    ctx = canvas.getContext('2d');

    buildCategoryBar();
    buildStickerGrid();
    resizeCanvas();

    qs('[data-stickers-undo]').addEventListener('click', undo);
    qs('[data-stickers-clear]').addEventListener('click', clearAll);

    // Tap-to-place. For drag, also place on every move (creates a trail).
    let lastPlaced = 0;
    detachPointer = attachPointer(canvas, {
      onStart: (pos) => {
        placeAt(pos.x, pos.y);
        lastPlaced = Date.now();
      },
      onMove: (pos) => {
        // Throttle drag-placement to ~ every 120ms to avoid over-density
        const now = Date.now();
        if (now - lastPlaced > 120) {
          placeAt(pos.x, pos.y);
          lastPlaced = now;
        }
      }
    });

    resizeObs = new ResizeObserver(() => resizeCanvas());
    resizeObs.observe(canvas);
  }

  function destroy() {
    if (detachPointer) detachPointer();
    if (resizeObs) resizeObs.disconnect();
    placements.length = 0;
  }

  function exportPNG() {
    return exportCanvas(canvas, 'my-stickers.png');
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
