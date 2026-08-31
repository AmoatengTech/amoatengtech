/* ============================================================
   activities/coloring.js
   Coloring activity, data-driven via the Shapes catalog.
   Shapes are loaded from a GitHub gist (owner-editable, no
   code changes) by js/shapes.js. This module just renders them.

   Single Responsibility: coloring mechanics only (paint spots,
   background paint, undo, clear, draft persistence). Knows
   nothing about how shapes got here.

   Paint model: every dab is an OPERATION logged per shape.
     layer 's' = silhouette spot  (clipped by the shape mask)
     layer 'b' = background spot  (unmasked, paints the area
                 AROUND the animal, i.e. the picture background)
   Taps inside the silhouette paint 's'; taps outside paint 'b'
   (hit-tested via isPointInFill on the shape's .pathBg, with a
   legacy fallback of painting the silhouette). One ordered log
   per shape keeps Undo interleaving correct.
   ============================================================ */

(function (global) {
  'use strict';

  const { qs, qsa, el, attachPointer, attachPinchZoom, colorsForAge } = global.Utils;
  const { exportSvg, saveDraft, loadDraft, clearDraft } = global.Storage;
  const Shapes = global.Shapes;

  /* ---------- Module state ---------- */
  // shapes: Array<{id, label, emoji, svg}>, loaded from the catalog
  let shapes = [];
  // opsLog: Map<shapeId, Array<{l:'s'|'b', c:<circle xml>}>>, holding ordered paint ops
  const opsLog = new Map();
  let currentShape = null;
  let currentColor = null;
  let currentSize = 40;

  // Draft (crash-safe auto-save) state
  let draftDirty = false;
  let draftTimer = null;
  let flushDraftListeners = null;

  // Cached DOM refs
  let canvasEl, svgEl, sizeInput, colorGridEl, shapePickerEl;
  let undoBtn, clearBtn;
  let detachPointer = null;
  let detachPinch = null;
  let svgFitRO = null;

  /* ---------- Helpers ---------- */
  const shapeById  = (id) => shapes.find(s => s.id === id);
  const shapeGroup = (id) => svgEl.querySelector(`[data-animal="${id}"]`);
  const spotGroup  = (id) => shapeGroup(id) && shapeGroup(id).querySelector('[data-group]');
  const bgGroup    = (id) => shapeGroup(id) && shapeGroup(id).querySelector('[data-bg-group]');
  const inkMask    = (id) => shapeGroup(id) && shapeGroup(id).querySelector('[data-ink-mask]');
  const opsFor     = (id) => opsLog.get(id) || (opsLog.set(id, []), opsLog.get(id));

  function svgCoords(clientX, clientY) {
    const pt = svgEl.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function renderShape(id) {
    const g = spotGroup(id);
    const b = bgGroup(id);
    const ink = inkMask(id);
    const ops = opsFor(id);
    const silhouetteOps = ops.filter(o => o.l === 's');
    if (g) g.innerHTML = silhouetteOps.map(o => o.c).join('');
    if (b) b.innerHTML = ops.filter(o => o.l === 'b').map(o => o.c).join('');
    // The ink layer's reveal mask mirrors every silhouette dab as a
    // solid white circle (luminance mask), so the redrawn lines show
    // exactly where the paint is and nowhere else. Original 3 shapes
    // have no ink layer and skip this.
    if (ink) ink.innerHTML = silhouetteOps.map(inkMaskCircle).join('');
  }

  /* A paint op's circle XML with its colour swapped for mask white. */
  function inkMaskCircle(op) {
    return op.c.replace(/fill="[^"]*"/, 'fill="#FFFFFF"');
  }

  /* ---------- Responsive SVG fit ----------
     The artwork is a square 760×760 viewBox, but nothing in the CSS
     could size it: the canvas card is content-sized (auto height,
     capped by .canvas-wrap) and CSS percentage max-heights cannot
     resolve against an auto-height parent. The SVG therefore fell
     back to its 300×150 default intrinsic size (square-ised by the
     viewBox ratio) and OVERFLOWED the height-capped card on phones,
     a giraffe showed only its middle band ("cropped to fit").
     Same solution as the raster canvases in freedraw/stickers
     (JS fit + ResizeObserver), with one critical difference: we
     measure the canvas-WRAP, never the card itself, because the card
     shrink-wraps the SVG, so measuring it is a feedback loop that
     can only shrink and then sticks. The wrap is sized by the grid
     (independent), so its content box minus both paddings is the
     true contain-fit budget. Caps at 640px, the max the original
     CSS already declared for the artwork. Paint coords are
     unaffected: svgCoords() maps through getScreenCTM(), which
     honours any rendered size. */
  function fitSvg() {
    if (!svgEl || !canvasEl) return;
    const wrap = canvasEl.parentElement;
    if (!wrap) return;
    const wcs = getComputedStyle(wrap);
    const ccs = getComputedStyle(canvasEl);
    const availW = wrap.clientWidth  - parseFloat(wcs.paddingLeft) - parseFloat(wcs.paddingRight)
                                   - parseFloat(ccs.paddingLeft) - parseFloat(ccs.paddingRight);
    const availH = wrap.clientHeight - parseFloat(wcs.paddingTop) - parseFloat(wcs.paddingBottom)
                                   - parseFloat(ccs.paddingTop) - parseFloat(ccs.paddingBottom);
    const size = Math.floor(Math.min(availW, availH, 640));
    if (size > 0) {
      svgEl.style.width  = size + 'px';
      svgEl.style.height = size + 'px';
    }
  }

  /* ---------- Silhouette hit-test ----------
     CC0 shapes carry multi-part silhouettes (<g class="pathBg"
     data-silhouette> holding body paths nested inside transform-bearing
     groups, e.g. frog's translate(346,-157)). Each Path2D is tested with
     ITS OWN path's matrix (rootCtm⁻¹ × pathScreenCtm = path-local →
     root viewBox), so per-part ancestor transforms and pinch-zoom are
     both honoured. Matrices are computed per call, which is cheap (dozens of
     paths max) and never stale. The original 3 shapes (single
     <path class="pathBg">, no transforms) take the same code path. */
  let silCache = { id: null, entries: [] };
  let silCtx = null;   // offscreen 760x760 canvas for the Path2D union test

  function silhouetteEntries() {
    if (silCache.id === currentShape && silCache.entries.length) return silCache;
    const entries = [];
    const g = shapeGroup(currentShape);
    if (g) {
      const sil = g.querySelector('[data-silhouette]');
      if (sil) {
        sil.querySelectorAll('path').forEach(p => {
          entries.push({
            el: p,
            p2d: new Path2D(p.getAttribute('d')),
            rule: p.getAttribute('fill-rule') === 'evenodd' ? 'evenodd' : 'nonzero',
          });
        });
      } else {
        const single = g.querySelector('path.pathBg');
        if (single) {
          entries.push({
            el: single,
            p2d: new Path2D(single.getAttribute('d')),
            rule: single.getAttribute('fill-rule') === 'evenodd' ? 'evenodd' : 'nonzero',
          });
        }
      }
    }
    silCache = { id: currentShape, entries };
    return silCache;
  }

  function pointInSilhouette(x, y) {
    const { entries } = silhouetteEntries();
    if (!entries.length) return true;   // legacy fallback: paint silhouette
    if (!silCtx) {
      const c = document.createElement('canvas');
      c.width = 760; c.height = 760;
      silCtx = c.getContext('2d');
    }
    const rootCtm = svgEl ? svgEl.getScreenCTM() : null;
    let hit = false;
    for (const e of entries) {
      try {
        if (rootCtm) {
          const elCtm = e.el.getScreenCTM();
          if (elCtm) {
            // path-local → root viewBox (pinch zoom cancels: both CTMs
            // include the same svgEl CSS transform)
            const m = rootCtm.inverse().multiply(elCtm);
            silCtx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
          } else {
            silCtx.setTransform(1, 0, 0, 1, 0, 0);
          }
        } else {
          silCtx.setTransform(1, 0, 0, 1, 0, 0);
        }
        if (silCtx.isPointInPath(e.p2d, x, y, e.rule)) { hit = true; break; }
      } catch (_) { /* next part */ }
    }
    return hit;
  }

  /* ---------- Mask + outline normalisation ----------
     The 20 CC0 outline animals ship with their white body shapes
     NESTED inside their black or outline parent shapes
     (<path ...><path fill="#FFF"/></path>, hippo even nests circles
     inside circles). SVG shape elements are not containers, so those
     nested children never render. Every affected <mask> therefore
     reads black or empty over the body, and because SVG masks are
     luminance-based, silhouette paint spots (layer 's') were
     invisible on all 20 of them: some masks are fully dark (only
     the background could be painted), partially white ones left
     just a few regions paintable. Hit-testing always used the FULL
     geometry union (silhouetteEntries reads every descendant path),
     so taps were even classified as silhouette where the mask hid
     the dab. Normalising each defective mask makes it exactly that
     same union:
       1. hoist every child out of shape elements (order and all
          ancestor transforms preserved);
       2. if a mask carried the nesting defect, force all its shape
          elements to solid white with no stroke.
     Masks without nesting (the original giraffe/flounder/snail,
     whose flat masks are already correct) are left untouched, so
     their current look, including the giraffe's 90% mask, is
     byte-preserved. Runs once per buildSvg, before any painting;
     exports and print rasterise this same live SVG, so they are
     fixed by the same change.

     The same conversion also duplicated the whole artwork into
     .animal__outline, which sits ABOVE the paint group in every
     shape. The original 3 carry stroke-only outlines there, so
     their lines stay crisp above the paint. The CC0 copies instead
     repeat the opaque body fills, which hid every dab (dog, sheep,
     hippo, mouse, octopus, elephant). Blankening those fills in
     the live copy is NOT safe: each fill also occludes earlier
     strokes and .pathBg art, so removing it changes the unpainted
     picture. The fix therefore leaves the live outline untouched
     and builds an INK LAYER on top of the paint instead:
       3. the spots group becomes the animal group's last child
          (paint above the artwork copy, so dabs are visible);
       4. a one-time clone of .animal__outline is appended above
          the paint, its nested children hoisted (same defect, same
          fix as the masks) and its BODY FILLS blanked: light fills
          of any kind, plus dark stroke-less fills drawn before the
          first light shape (the ground-shadow slot). What survives
          in the clone is exactly the line/detail art: strokes,
          eyes, nostrils, mouths, stripes;
       5. the clone is masked by a per-animal reveal mask holding a
          white circle for every silhouette dab, so the clone only
          ever redraws lines where paint was actually laid down.
     Net effect, identical to a paper colouring book: paint covers
     the body, the printed lines always stay visible on top of it,
     and with no paint applied the clone mask is empty, so the
     unpainted canvas is byte-identical to the untouched artwork.
     renderShape mirrors every dab into the reveal mask (see
     inkMaskCircle); exports and print rasterise this same live
     SVG, so they carry the fix too. */
  function hoistNestedShapes(root) {
    let hoisted = 0;
    let nested;
    while ((nested = qsa('path > *, circle > *, ellipse > *, rect > *', root)).length) {
      nested.forEach((child) => {
        const parent = child.parentNode;
        parent.parentNode.insertBefore(child, parent.nextSibling);
      });
      hoisted += nested.length;
      if (hoisted > 10000) break;  // safety valve, unreachable with current data
    }
    return hoisted;
  }

  /* Blank the body fills of an outline COPY (never the live one):
     light fills of any kind, plus dark stroke-less fills from
     before the first light shape (the ground-shadow slot). Fill/
     stroke resolve through group ancestors; SVG defaults kick in
     at the root (fill black, stroke none). */
  function effectivePaint(elm, name) {
    for (let n = elm; n && n.getAttribute; n = n.parentNode) {
      const v = n.getAttribute(name);
      if (v !== null && v !== 'inherit') return v;
    }
    return name === 'fill' ? '#000000' : 'none';
  }

  /* 0..255 perceived luminance, or -1 for 'none'/foreign formats
     (unparsable colours are never blanked, so nothing can vanish). */
  function colourLuminance(value) {
    let m = value.match(/^#([0-9a-f]{6})$/i);
    if (m) {
      return 0.2126 * parseInt(m[1].slice(0, 2), 16)
           + 0.7152 * parseInt(m[1].slice(2, 4), 16)
           + 0.0722 * parseInt(m[1].slice(4, 6), 16);
    }
    m = value.match(/^#([0-9a-f]{3})$/i);
    if (m) return colourLuminance('#' + m[1].split('').map((h) => h + h).join(''));
    m = value.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      const p = m[1].split(',').map((v) => parseFloat(v));
      return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
    }
    if (value === 'black') return 0;
    if (value === 'white') return 255;
    return -1;
  }

  /* Build the ink layer for one defective animal: a private copy of
     the outline art with body fills blanked, revealed only where
     silhouette paint exists (steps 4 and 5). */
  function buildInkLayer(animal) {
    const outline = animal.querySelector('.animal__outline');
    const spots = animal.querySelector('[data-group]');
    const animalId = animal.getAttribute('data-animal');
    if (!outline || !spots || !animalId) return;
    // Reveal mask: painted white circles only (luminance mask), in
    // the fixed 760x760 canvas space so the region never clips dabs
    // at the artwork edges.
    const holder = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    holder.innerHTML = '<mask id="mask-ink-' + animalId + '" maskUnits="userSpaceOnUse" x="0" y="0" width="760" height="760"><g data-ink-mask></g></mask>';
    animal.appendChild(holder.firstChild);
    const ink = outline.cloneNode(true);
    ink.classList.add('animal__outline--ink');
    ink.setAttribute('mask', 'url(#mask-ink-' + animalId + ')');
    hoistNestedShapes(ink);
    const shapes = qsa('path, circle, ellipse, rect, polygon, polyline, line', ink);
    const fills = shapes.map((s) => colourLuminance(effectivePaint(s, 'fill')));
    const strokes = shapes.map((s) => effectivePaint(s, 'stroke'));
    const firstBody = fills.findIndex((l) => l >= 200);
    shapes.forEach((s, i) => {
      const isBodyFill = fills[i] >= 200
        || (fills[i] >= 0 && fills[i] <= 80
            && strokes[i] === 'none' && firstBody >= 0 && i < firstBody);
      // blanked shapes keep their stroke, so body outlines still
      // redraw above the paint; unparsable colours (-1) stay put
      if (isBodyFill) s.setAttribute('fill', 'none');
    });
    animal.appendChild(ink);
  }

  function normalizeShapeMasks() {
    if (!svgEl) return;
    qsa('mask', svgEl).forEach((mask) => {
      if (!hoistNestedShapes(mask)) return;  // healthy mask (original 3 shapes): keep as authored
      qsa('path, circle, ellipse, rect, polygon, polyline, line', mask).forEach((s) => {
        s.setAttribute('fill', '#FFFFFF');
        s.setAttribute('stroke', 'none');
      });
      const animal = mask.closest('.animal');
      const spots = animal && animal.querySelector('[data-group]');
      // paint above the artwork copy (step 3), then the ink layer
      // on top of the paint (steps 4 and 5)
      if (animal && spots) animal.appendChild(spots);
      if (animal) buildInkLayer(animal);
    });
  }

  /* ---------- Actions ---------- */
  function paintAt(clientX, clientY) {
    if (!currentShape) return;
    const { x, y } = svgCoords(clientX, clientY);
    if (x < 0 || y < 0 || x > 760 || y > 760) return;
    const layer = pointInSilhouette(x, y) ? 's' : 'b';
    opsFor(currentShape).push({
      l: layer,
      c: `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" fill="${currentColor}" r="${currentSize}" />`
    });
    draftDirty = true;
    renderShape(currentShape);
    syncActionButtons();
  }

  function undo() {
    if (!currentShape) return;
    const ops = opsFor(currentShape);
    if (!ops.length) return;
    ops.pop();
    draftDirty = true;
    renderShape(currentShape);
    syncActionButtons();
  }

  function clearCurrent() {
    if (!currentShape) return;
    opsLog.set(currentShape, []);
    draftDirty = true;
    renderShape(currentShape);
    syncActionButtons();
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
      btn.setAttribute('aria-pressed', btn.dataset.shapePick === id ? 'true' : 'false');
    });
    syncActionButtons();
  }

  function selectColor(value) {
    currentColor = value;
    qsa('.color-swatch', colorGridEl).forEach(sw => {
      sw.classList.toggle('is-active', sw.dataset.color === value);
    });
  }

  /** Grey Undo/Clear out when the current shape has no paint ops
      (cause-and-effect affordance for kids). */
  function syncActionButtons() {
    if (!undoBtn || !clearBtn) return;
    const empty = !opsFor(currentShape).length;
    undoBtn.disabled = empty;
    clearBtn.disabled = empty;
  }

  /* ---------- Toolbar setup ---------- */

  /** Build the shape picker buttons dynamically from the catalog. */
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
    normalizeShapeMasks();
    canvasEl.innerHTML = '';
    canvasEl.appendChild(svgEl);
    // silhouette cache holds DOM refs into the old SVG, so rebuild it
    silCache = { id: null, entries: [], wrapG: null };
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
    // Preserve paint ops for shapes that still exist
    const newIds = new Set(newShapes.map(s => s.id));
    for (const id of opsLog.keys()) {
      if (!newIds.has(id)) opsLog.delete(id);
    }
    shapes = newShapes;
    if (!shapeById(currentShape)) {
      currentShape = shapes[0] ? shapes[0].id : null;
    }
    buildSvg();
    fitSvg();   // rebuilt SVG node loses its inline fit size
    buildShapePicker();
    shapes.forEach(s => renderShape(s.id));
    if (currentShape) selectShape(currentShape);
    // Re-attach pointer events (svgEl was rebuilt)
    if (detachPointer) detachPointer();
    attachPainting();
  }

  /* ---------- Painting ---------- */
  function attachPainting() {
    let lastDragPaint = 0;
    detachPointer = attachPointer(svgEl, {
      onStart: (pos, e) => {
        if (svgEl.dataset && svgEl.dataset.pinch) return;  // two-finger zoom in progress
        paintAt(e.clientX, e.clientY);
      },
      onMove: (pos, e) => {
        const pressed = e.pointerType === 'mouse' ? e.buttons > 0 : true;
        if (!pressed) return;
        if (svgEl.dataset && svgEl.dataset.pinch) return;  // two-finger zoom in progress
        const now = Date.now();
        if (now - lastDragPaint < 60) return;
        lastDragPaint = now;
        paintAt(e.clientX, e.clientY);
      }
    });
  }

  /* ---------- Draft persistence (crash-safe) ---------- */
  function flushDraft() {
    if (!draftDirty || !currentShape) return;
    draftDirty = false;
    saveDraft('coloring', {
      shape: currentShape,
      ops: Array.from(opsLog.entries())
    });
  }

  function restoreDraft() {
    const draft = loadDraft('coloring');
    if (!draft || !draft.ops) return false;
    for (const [id, ops] of draft.ops) {
      if (shapeById(id) && Array.isArray(ops)) opsLog.set(id, ops.filter(o => o && (o.l === 's' || o.l === 'b') && typeof o.c === 'string'));
    }
    if (draft.shape && shapeById(draft.shape)) currentShape = draft.shape;
    shapes.forEach(s => renderShape(s.id));
    return opsLog.size > 0;
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

  /* ---------- Activity lifecycle ---------- */
  function init() {
    canvasEl  = qs('[data-coloring-canvas]');
    sizeInput = qs('[data-coloring-size]');
    colorGridEl = qs('[data-coloring-colors]');
    shapePickerEl = qs('[data-shape-picker]');
    undoBtn = qs('[data-coloring-undo]');
    clearBtn = qs('[data-coloring-clear]');

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

    // Responsive fit: the wrap's height (breakpoint, orientation,
    // toolbar cap, age-mode chrome) drives how much room the card has.
    // Observing the canvas-wrap PARENT matches freedraw/stickers.
    svgFitRO = new ResizeObserver(fitSvg);
    svgFitRO.observe(canvasEl.parentElement);
    fitSvg();

    // Restore crash-safe draft (previous spots + selected shape)
    const hadDraft = restoreDraft();

    currentSize = parseInt(sizeInput.value, 10) || 40;
    currentColor = colorsForAge()[0].value;
    buildColorGrid();

    sizeInput.addEventListener('input', () => {
      currentSize = parseInt(sizeInput.value, 10);
    });
    undoBtn.addEventListener('click', undo);
    clearBtn.addEventListener('click', clearCurrent);

    attachPainting();
    // Two-finger pinch-zoom + pan for colouring fine details. The
    // transform lives on the SVG, and svgCoords() uses getScreenCTM()
    // (transform-aware), so paint coordinates stay correct while
    // zoomed. Exports serialise the untransformed clone, never zoomed.
    detachPinch = attachPinchZoom(canvasEl.parentElement, svgEl);
    selectShape(currentShape);
    if (hadDraft) draftDirty = false;  // restored state already persisted
    startDrafting();
  }

  function destroy() {
    stopDrafting();
    if (detachPointer) detachPointer();
    if (detachPinch) detachPinch();
    if (svgFitRO) svgFitRO.disconnect();
    if (svgEl && svgEl.parentNode) svgEl.parentNode.removeChild(svgEl);
    opsLog.clear();
  }

  /* ---------- Export ----------
     FIX: the live SVG contains EVERY catalog shape (non-active ones
     are hidden by the .canvas--coloring CSS rule). Serializing the
     raw clone therefore exported ALL shapes stacked into one PNG,
     the reported "saves all 3 shapes into one picture" bug (a
     rasterised <img> has no access to the app stylesheet, so
     display:none never applied). The export clone now strips every
     non-active .animal group first.
     FIX 2: the clone also inherited the live pinch-zoom inline
     transform (attachPinchZoom writes target.style.transform), so
     saving while zoomed produced a cropped, zoomed-in PNG. The clone
     is reset to the full unzoomed viewBox before serialisation. */
  function buildExportClone() {
    const clone = svgEl.cloneNode(true);
    qsa('.animal', clone).forEach(g => {
      if (!g.classList.contains('is-active')) g.remove();
      else g.classList.remove('is-active');  // class is meaningless without the stylesheet
    });
    clone.style.transform = '';
    clone.style.transformOrigin = '';
    // The responsive JS fit writes an inline pixel size, which must not
    // override exportSvg's 1024px width/height attributes in the
    // rasterised clone (inline style beats attributes → blurry export).
    clone.style.width = '';
    clone.style.height = '';
    delete clone.dataset.zoom;
    delete clone.dataset.pinch;
    return clone;
  }

  function exportPNG() {
    return exportSvg(buildExportClone(), 'my-colouring.png', 1024);
  }

  function onAgeChange() {
    buildColorGrid();
  }

  /* ---------- Export ---------- */
  global.Activities = global.Activities || {};
  global.Activities.coloring = { init, destroy, exportPNG, onAgeChange };
})(window);
