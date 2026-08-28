/* ============================================================
   utils.js
   Shared DOM helpers + pointer/touch helpers + color palette.
   Exposed as `window.Utils` so activity modules can consume.
   Single Responsibility: low-level browser helpers only.
   ============================================================ */

(function (global) {
  'use strict';

  /* ---------- DOM helpers ---------- */

  /** querySelector shorthand */
  const qs  = (sel, ctx = document) => ctx.querySelector(sel);
  /** querySelectorAll → Array shorthand */
  const qsa = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /**
   * Create a DOM element with attributes and children in one call.
   * DRY: replaces repetitive createElement + setAttribute chains.
   * @param {string} tag        - element tag, e.g. 'button'
   * @param {object} [attrs]    - {class, id, dataset:{...}, ...}
   * @param {Node[]} [children] - child nodes
   */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') node.className = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
      else if (key === 'html') node.innerHTML = value;
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) node.setAttribute(key, '');
      else if (value !== false && value != null) node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
      if (child == null) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  /* ---------- Pointer / touch helpers ---------- */

  /**
   * Get pointer position relative to an element, in CSS pixels.
   * Works for mouse, touch, and pen via Pointer Events.
   */
  function pointerPos(e, target) {
    const rect = target.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  /**
   * Attach start/move/end handlers using Pointer Events with
   * fallback for older touch browsers. Calls onStart/onMove/onEnd
   * with a normalized {x, y, e} object.
   *
   * Single Responsibility: abstracts input normalization so
   * activity modules don't repeat the same boilerplate.
   */
  function attachPointer(target, { onStart, onMove, onEnd } = {}) {
    let active = false;

    const getPos = (e) => pointerPos(e, target);

    const down = (e) => {
      // Only respond to primary buttons / first touch
      if (e.button !== undefined && e.button !== 0) return;
      active = true;
      try { target.setPointerCapture && target.setPointerCapture(e.pointerId); } catch (_) {}
      onStart && onStart(getPos(e), e);
      e.preventDefault();
    };
    const move = (e) => {
      if (!active) return;
      onMove && onMove(getPos(e), e);
      e.preventDefault();
    };
    const up = (e) => {
      if (!active) return;
      active = false;
      onEnd && onEnd(getPos(e), e);
      e.preventDefault();
    };

    target.addEventListener('pointerdown', down);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    target.addEventListener('pointerleave', up);

    return function detach() {
      target.removeEventListener('pointerdown', down);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      target.removeEventListener('pointerleave', up);
    };
  }

  /* ---------- Color palettes (shared by all activities) ---------- */

  /**
   * Kid palette: 12 named colors with friendly CSS names.
   * Each entry is {name, value} so the same array can drive
   * both coloring book (uses value) and music paint (uses value
   * + maps index → note).
   */
  const KID_COLORS = [
    { name: 'Red',        value: '#ff5252' },
    { name: 'Orange',     value: '#ff9f43' },
    { name: 'Yellow',     value: '#ffd84d' },
    { name: 'Green',      value: '#5cd66e' },
    { name: 'Teal',       value: '#4ecdc4' },
    { name: 'Sky',        value: '#6aa9ff' },
    { name: 'Indigo',     value: '#7c5cff' },
    { name: 'Pink',       value: '#ff7eb3' },
    { name: 'Brown',      value: '#a0703d' },
    { name: 'Black',      value: '#2d2a32' },
    { name: 'White',      value: '#ffffff' },
    { name: 'Gold',       value: '#d4a017' }
  ];

  /**
   * Toddler palette: 6 high-contrast colors only.
   */
  const TODDLER_COLORS = [
    { name: 'Red',    value: '#ff5252' },
    { name: 'Orange', value: '#ff9f43' },
    { name: 'Yellow', value: '#ffd84d' },
    { name: 'Green',  value: '#5cd66e' },
    { name: 'Blue',   value: '#6aa9ff' },
    { name: 'Pink',   value: '#ff7eb3' }
  ];

  /** Get the palette appropriate for the current age mode. */
  function colorsForAge() {
    return document.documentElement.dataset.age === 'toddler'
      ? TODDLER_COLORS
      : KID_COLORS;
  }

  /* ---------- Misc ---------- */

  /** No-op function. Useful as a default handler. */
  const noop = () => {};

  /** Debounce a function by `wait` ms. */
  function debounce(fn, wait = 200) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  /**
   * Force a canvas element to be square, sized to the smaller
   * dimension of its parent. Sets both the CSS size and the
   * backing store (accounting for devicePixelRatio).
   *
   * Returns the CSS size (number of CSS pixels per side) so the
   * caller can configure its context transform.
   *
   * Single Responsibility: only handles sizing. The caller is
   * responsible for redrawing content after a resize.
   *
   * @param {HTMLCanvasElement} canvas
   * @param {number} [padding=24] - px of breathing room around canvas
   * @returns {{size:number, dpr:number}|null} null if parent has 0 size
   */
  function fitSquareCanvas(canvas, padding = 24) {
    const parent = canvas.parentElement;
    if (!parent) return null;
    const pw = parent.clientWidth  - padding;
    const ph = parent.clientHeight - padding;
    if (pw <= 0 || ph <= 0) return null;
    const size = Math.max(64, Math.min(pw, ph));
    const dpr = window.devicePixelRatio || 1;

    canvas.style.width  = size + 'px';
    canvas.style.height = size + 'px';
    canvas.width  = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);

    return { size, dpr };
  }

  /* ---------- Export ---------- */
  global.Utils = {
    qs, qsa, el,
    pointerPos, attachPointer,
    KID_COLORS, TODDLER_COLORS, colorsForAge,
    noop, debounce,
    fitSquareCanvas
  };
})(window);
