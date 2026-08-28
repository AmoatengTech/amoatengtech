/* ============================================================
   activities/coloring.js
   Coloring activity — now data-driven via the Shapes catalog.
   Shapes are loaded from a GitHub gist (owner-editable, no
   code changes) by js/shapes.js. This module just renders them.

   Single Responsibility: coloring mechanics only (paint spots,
   undo, clear). Knows nothing about how shapes got here.
   ============================================================ */

(function (global) {
  'use strict';

  const { qs, qsa, el, attachPointer, colorsForAge } = global.Utils;
  const { exportSvg } = global.Storage;
  const Shapes = global.Shapes;

  /* ---------- Module state ---------- */
  // shapes: Array<{id, label, emoji, svg}> — loaded from catalog
  let shapes = [];
  // spots: Map<shapeId, string[]> — paint spots per shape
  const spots = new Map();
  let currentShape = null;
  let currentColor = null;
  let currentSize = 40;

  // Cached DOM refs
  let canvasEl, svgEl, sizeInput, colorGridEl, shapePickerEl;
  let detachPointer = null;

  /* ---------- Helpers ---------- */
  const shapeById  = (id) => shapes.find(s => s.id === id);
  const shapeGroup = (id) => svgEl.querySelector(`[data-animal="${id}"]`);
  const spotGroup  = (id) => shapeGroup(id) && shapeGroup(id).querySelector('[data-group]');
  const spotsFor   = (id) => spots.get(id) || (spots.set(id, []), spots.get(id));

  function svgCoords(clientX, clientY) {
    const pt = svgEl.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function renderSpots(id) {
    const g = spotGroup(id);
    if (g) g.innerHTML = spotsFor(id).join('');
  }

  /* ---------- Actions ---------- */
  function paintAt(clientX, clientY) {
    if (!currentShape) return;
    const { x, y } = svgCoords(clientX, clientY);
    if (x < 0 || y < 0 || x > 760 || y > 760) return;
    const arr = spotsFor(currentShape);
    arr.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" fill="${currentColor}" r="${currentSize}" />`);
    renderSpots(currentShape);
  }

  function undo() {
    if (!currentShape) return;
    const arr = spotsFor(currentShape);
    if (!arr.length) return;
    arr.pop();
    renderSpots(currentShape);
  }

  function clearCurrent() {
    if (!currentShape) return;
    spots.set(currentShape, []);
    renderSpots(currentShape);
  }

  function selectShape(id) {
    if (!shapeById(id)) return;
    currentShape = id;
    // Toggle .is-active on the visible shape
    shapes.forEach(s => {
      const g = shapeGroup(s.id);
      if (g) g.classList.toggle('is-active', s.id === id);
    });
    // Sync the toolbar buttons
    qsa('[data-shape-pick]', shapePickerEl).forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.shapePick === id);
    });
  }

  function selectColor(value) {
    currentColor = value;
    qsa('.color-swatch', colorGridEl).forEach(sw => {
      sw.classList.toggle('is-active', sw.dataset.color === value);
    });
  }

  /* ---------- Toolbar setup ---------- */

  /** Build the shape picker buttons dynamically from the catalog.
      This is the key change: shapes are no longer hardcoded in HTML. */
  function buildShapePicker() {
    if (!shapePickerEl) return;
    shapePickerEl.innerHTML = '';
    shapes.forEach(s => {
      const btn = el('button', {
        type: 'button',
        class: 'shape-pick__btn' + (s.id === currentShape ? ' is-active' : ''),
        dataset: { shapePick: s.id },
        title: s.label,
        'aria-label': s.label,
        'aria-pressed': s.id === currentShape ? 'true' : 'false',
        onclick: () => selectShape(s.id)
      }, [
        el('span', { 'aria-hidden': 'true' }, s.emoji),
        el('span', { class: 'shape-pick__name' }, s.label)
      ]);
      shapePickerEl.appendChild(btn);
    });
  }

  /** Build the SVG element with all shapes inside. */
  function buildSvg() {
    svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgEl.setAttribute('viewBox', '0 0 760 760');
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svgEl.innerHTML = shapes.map(s => s.svg).join('');
    canvasEl.innerHTML = '';
    canvasEl.appendChild(svgEl);
  }

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

  /** Called when the shape catalog is refreshed (e.g. gist updated). */
  function refreshShapes(newShapes) {
    // Preserve spots for shapes that still exist
    const newIds = new Set(newShapes.map(s => s.id));
    for (const id of spots.keys()) {
      if (!newIds.has(id)) spots.delete(id);
    }
    shapes = newShapes;
    if (!shapeById(currentShape)) {
      currentShape = shapes[0] ? shapes[0].id : null;
    }
    buildSvg();
    buildShapePicker();
    if (currentShape) selectShape(currentShape);
    // Re-attach pointer events (svgEl was rebuilt)
    if (detachPointer) detachPointer();
    attachPainting();
  }

  /* ---------- Painting ---------- */
  function attachPainting() {
    let lastDragPaint = 0;
    detachPointer = attachPointer(svgEl, {
      onStart: (pos, e) => paintAt(e.clientX, e.clientY),
      onMove: (pos, e) => {
        const pressed = e.pointerType === 'mouse' ? e.buttons > 0 : true;
        if (!pressed) return;
        const now = Date.now();
        if (now - lastDragPaint < 60) return;
        lastDragPaint = now;
        paintAt(e.clientX, e.clientY);
      }
    });
  }

  /* ---------- Activity lifecycle ---------- */
  function init() {
    canvasEl  = qs('[data-coloring-canvas]');
    sizeInput = qs('[data-coloring-size]');
    colorGridEl = qs('[data-coloring-colors]');
    shapePickerEl = qs('[data-shape-picker]');

    // Load shapes (sync: best-available; async: refresh from gist)
    shapes = Shapes.loadShapes(refreshShapes);
    if (shapes.length === 0) {
      // Catastrophic fallback: no shapes available
      canvasEl.innerHTML = '<p style="padding:2rem;text-align:center">No shapes available. Please check your shape catalog.</p>';
      return;
    }
    currentShape = shapes[0].id;

    buildSvg();
    buildShapePicker();
    currentSize = parseInt(sizeInput.value, 10) || 40;
    currentColor = colorsForAge()[0].value;
    buildColorGrid();

    sizeInput.addEventListener('input', () => {
      currentSize = parseInt(sizeInput.value, 10);
    });
    qs('[data-coloring-undo]').addEventListener('click', undo);
    qs('[data-coloring-clear]').addEventListener('click', clearCurrent);

    attachPainting();
    selectShape(currentShape);
  }

  function destroy() {
    if (detachPointer) detachPointer();
    if (svgEl && svgEl.parentNode) svgEl.parentNode.removeChild(svgEl);
    spots.clear();
  }

  function exportPNG() {
    return exportSvg(svgEl, 'my-coloring.png', 1024);
  }

  function onAgeChange() {
    buildColorGrid();
  }

  /* ---------- Export ---------- */
  global.Activities = global.Activities || {};
  global.Activities.coloring = { init, destroy, exportPNG, onAgeChange };
})(window);
