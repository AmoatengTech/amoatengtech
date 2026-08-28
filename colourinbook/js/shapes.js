/* ============================================================
   shapes.js
   Single Responsibility: load + cache the shape catalog.
   - Fetches from a GitHub gist (owner-editable, no code changes)
   - Caches in localStorage for offline-first use
   - Falls back to bundled shapes if gist fails / not configured
   - Exposes getShapes() returning [{id, label, emoji, svg}]
   ============================================================ */

(function (global) {
  'use strict';

  const CACHE_KEY = 'colourinbook-shapes-cache';
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;  // refresh once per day if online

  /* ---------- Bundled fallback shapes ----------
     These ship with the app so it always works even if the
     gist is unreachable. They are the original 3 animals
     from the boilerplate. */
  const BUNDLED_SHAPES = [
    {
      id: 'giraffe',
      label: 'Giraffe',
      emoji: '🦒',
      svg: `<g class="animal is-active" data-animal="giraffe">
        <path class="pathBg" fill="#FFFFFF" d="M452.6 360.4h-40.4c-44.6 0-83.7-36.1-83.7-80.7v-200c0-2.1-.3-4.1-.9-5.9 3.7-1.2 6.7-4.1 7.8-8l7.2-24.4-24.1 7.1c-4.3 1.3-7.5 4.9-8.3 9.3l-.2.8c-.9-.1-1.8-.2-2.8-.2h-9.1c-10.5 0-17.3 5.2-23.3 13.8l-9.4 13.6c-3.9 5.6-11.4 10-17.8 12.4l-17.1 6.6c-5.5 2.1-9.1 7.4-9.1 13.4 0 10 8.1 18.2 18.2 18.2H265c1.2 0 2.2 1 2.2 2.2l-.7 229.8h-.1v362h46V539.8c0-14.6 11.8-26.4 26.4-26.4h100.4c29.4 0 53.1 23.8 53.1 53.1v163.9h46V446.3c.2-47.4-38.3-85.9-85.7-85.9z"/>
        <mask id="mask-giraffe"><path fill="#E6E6E6" d="M452.6 360.4h-40.4c-44.6 0-83.7-36.1-83.7-80.7v-200c0-2.1-.3-4.1-.9-5.9 3.7-1.2 6.7-4.1 7.8-8l7.2-24.4-24.1 7.1c-4.3 1.3-7.5 4.9-8.3 9.3l-.2.8c-.9-.1-1.8-.2-2.8-.2h-9.1c-10.5 0-17.3 5.2-23.3 13.8l-9.4 13.6c-3.9 5.6-11.4 10-17.8 12.4l-17.1 6.6c-5.5 2.1-9.1 7.4-9.1 13.4 0 10 8.1 18.2 18.2 18.2H265c1.2 0 2.2 1 2.2 2.2l-.7 229.8h-.1v362h46V539.8c0-14.6 11.8-26.4 26.4-26.4h100.4c29.4 0 53.1 23.8 53.1 53.1v163.9h46V446.3c.2-47.4-38.3-85.9-85.7-85.9z"/></mask>
        <g class="group" data-group mask="url(#mask-giraffe)"></g>
        <g class="animal__outline">
          <path fill="none" stroke="#000" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" d="M318.3 75.5l7.9-1.4c4.4-.8 8-4 9.2-8.3l7.2-24.4-24.1 7.1c-4.3 1.3-7.5 4.9-8.3 9.3l-1 5.3"/>
          <circle cx="290" cy="99.9" r="7" fill="black"/>
          <path fill="none" stroke="#000" stroke-width="8" stroke-linejoin="round" stroke-miterlimit="10" d="M266.5 702.4h46M492.5 702.4h46"/>
          <path d="M289.4 59.9l-3.2-18.6 9.4-1.6 3 17.9" fill="black"/>
          <circle cx="290.5" cy="38.3" r="8.8" fill="black" />
          <path fill="none" stroke="#000" stroke-width="8" stroke-linejoin="round" stroke-miterlimit="10" d="M310.1 58.6c-.9-.1-1.9-.2-2.8-.2h-9.1c-10.5 0-17.3 5.2-23.3 13.8l-9.4 13.6c-3.9 5.6-11.4 10-17.8 12.4l-17.1 6.6c-5.5 2.1-9.1 7.4-9.1 13.4v0c0 10 8.1 18.2 18.2 18.2h25.4c1.2 0 2.2 1 2.2 2.2l-.7 229.8h-.1v362h46V539.8c0-14.6 11.8-26.4 26.4-26.4h100.4c29.4 0 53.1 23.8 53.1 53.1v163.9h46V446.3c0-47.4-38.5-85.9-85.9-85.9h-40.4c-44.6 0-83.7-36.1-83.7-80.7v-200c0-2.1-.3-4.1-.8-5.9"/>
        </g>
      </g>`
    },
    {
      id: 'olive-flounder',
      label: 'Flounder',
      emoji: '🐟',
      svg: `<g class="animal" data-animal="olive-flounder">
        <path class="pathBg" fill="#FFF" d="M641.5 305.5c-1.8-3.8-6.8-4.9-10-2.1-52.7 45.8-128.7 41.7-128.7 41.7v.1c-1.5-1-2.9-2-4.3-2.9-5.5-5.4-11.4-11.1-17.7-16.8-1.6-3.2-22.2-114.3-149.5-120.3-114.2-5.4-195.1 127.7-195.1 127.7-9.3 9.3-17.4 18.3-24.2 26.1-3.5 4.1-2.6 10.3 1.9 13.2 3.3 2.1 6.8 4.7 9.9 7.8 2.6 2.6.3 7-3.4 6.4-3.5-.6-7.5-1-11.5-.9-7.6.2-12.8 7.8-10 14.9 1.2 3 2.9 5.8 5 8.4 21.5 26.1 63.5 71.6 114.8 100.6 0 0 75 53.5 148.2 44.4 71.3-8.8 130.3-64.5 135.8-118.2l-3.7 1c1.2-.8 2.5-1.6 3.7-2.3v1.3c63.7-.8 112.7 27.4 129 38.1 3.3 2.2 7.7 1.1 9.6-2.3 39.9-69.1 11.3-142.5.2-165.9z"/>
        <mask id="mask-flounder"><path fill="#FFFFFF" d="M641.5 305.5c-1.8-3.8-6.8-4.9-10-2.1-52.7 45.8-128.7 41.7-128.7 41.7v.1c-1.5-1-2.9-2-4.3-2.9-5.5-5.4-11.4-11.1-17.7-16.8-1.6-3.2-22.2-114.3-149.5-120.3-114.2-5.4-195.1 127.7-195.1 127.7-9.3 9.3-17.4 18.3-24.2 26.1-3.5 4.1-2.6 10.3 1.9 13.2 3.3 2.1 6.8 4.7 9.9 7.8 2.6 2.6.3 7-3.4 6.4-3.5-.6-7.5-1-11.5-.9-7.6.2-12.8 7.8-10 14.9 1.2 3 2.9 5.8 5 8.4 21.5 26.1 63.5 71.6 114.8 100.6 0 0 75 53.5 148.2 44.4 71.3-8.8 130.3-64.5 135.8-118.2l-3.7 1c1.2-.8 2.5-1.6 3.7-2.3v1.3c63.7-.8 112.7 27.4 129 38.1 3.3 2.2 7.7 1.1 9.6-2.3 39.9-69.1 11.3-142.5.2-165.9z"/></mask>
        <g class="group" data-group mask="url(#mask-flounder)"></g>
        <g class="animal__outline">
          <path fill="none" stroke="#000" stroke-width="8" stroke-linejoin="round" stroke-miterlimit="10" d="M502.8 345.2s76 4 128.7-41.7c3.2-2.8 8.2-1.8 10 2.1 11.2 23.5 39.7 96.8-.1 166-2 3.4-6.4 4.5-9.6 2.3-16.3-10.7-65.3-39-129-38.1"/>
          <path fill="none" stroke="#000" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" d="M218.7 509.5s75 53.5 148.2 44.4c71.3-8.8 130.3-64.5 135.8-118.2"/>
          <path fill="none" stroke="#000" stroke-width="8" stroke-linejoin="round" stroke-miterlimit="10" d="M574.9 360.9c-35.5 4.7-61-7.3-76.4-18.5-43.7-43.2-115.8-100.9-189.2-100.9-83.4 0-160 74.6-197.3 117.6-3.5 4.1-2.6 10.3 1.9 13.2 3.3 2.1 6.8 4.7 9.9 7.8 2.6 2.6.3 7-3.4 6.4-3.5-.6-7.5-1-11.5-.9-7.6.2-12.8 7.8-10 14.9 1.2 3 2.9 5.8 5 8.4 33.3 40.3 115.4 127.2 205.4 127.2 69.3 0 137.4-51.4 181.6-93.5 29.4-23.7 65.8-25.8 82-25.4 5.8.1 10.9-3.5 12.8-8.9 5.7-16.8 1.7-33-1.4-41.7-1.4-4-5.3-6.3-9.4-5.7z"/>
          <circle cx="173.5" cy="388.8" r="7"/>
          <circle cx="150.7" cy="354.1" r="7"/>
          <path fill="none" stroke="#000" stroke-width="8" stroke-linejoin="round" stroke-miterlimit="10" d="M309.3 241.5c64.2 0 127.4 44.1 171.5 84.1-1.6-3.2-22.2-114.3-149.5-120.3C217.1 199.9 136.2 333 136.2 333h0c41.3-41.8 105-91.5 173.1-91.5z"/>
        </g>
      </g>`
    },
    {
      id: 'snail',
      label: 'Snail',
      emoji: '🐌',
      svg: `<g class="animal" data-animal="snail">
        <path class="pathBg" fill="#FFFFFF" d="M580.7 491.6l-46.7-6.9c56.3-25 88.7-87.1 74.3-149.3-20.3-88.1-108.4-143-196.5-122.6-107.6 24.9-175.6 130.5-154.9 238.1-14.6-7.8-25.6-18.1-30.3-30.2l-28.9-61.1c-4.1-8.2-10.6-14.9-18.2-19.3 0-7.7.1-20.5.1-26.9.3-48.2.6-86.3-16-103-3.1-3.1-6.7-5.4-10.7-6.8-2.1-6.9-8.6-11.9-16.2-11.9-9.4 0-16.9 7.6-16.9 16.9s7.6 16.9 16.9 16.9c5.9 0 11.1-3 14.1-7.5 1 .6 2 1.4 2.9 2.3 12.5 12.5 12.2 49.8 11.9 93.1 0 6.1-.1 14.8-.1 21.8-7-1.3-14.3-.7-21.1 2.2 0-9.6.1-12.5.2-20.2.4-32.9.6-49.4-8.6-58.7-3.9-3.9-8.8-5.8-14.1-6.8-2.5-6.3-8.6-10.8-15.8-10.8-9.4 0-16.9 7.6-16.9 16.9 0 9.4 7.6 16.9 16.9 16.9 6.5 0 12.1-3.6 15-9 2.2.6 3.9 1.4 4.9 2.5 5.1 5.2 4.9 21.6 4.6 48.7-.1 7.9-.2 19.5-.2 29.5 0 0-14.1 13.5-5.6 52.2 7.1 32.5 20.6 51.9 20.6 51.9 13.2 26.4 33.4 48.5 58.4 64.1 25.1 15.5 53.9 23.7 83.4 23.7h310.9c24.1 0 39.6.2 39.6-23.9.1-13.2-30.5-19.8-57-22.8z"/>
        <mask id="mask-snail"><path fill="#FFFFFF" d="M580.7 491.6l-46.7-6.9c56.3-25 88.7-87.1 74.3-149.3-20.3-88.1-108.4-143-196.5-122.6-107.6 24.9-175.6 130.5-154.9 238.1-14.6-7.8-25.6-18.1-30.3-30.2l-28.9-61.1c-4.1-8.2-10.6-14.9-18.2-19.3 0-7.7.1-20.5.1-26.9.3-48.2.6-86.3-16-103-3.1-3.1-6.7-5.4-10.7-6.8-2.1-6.9-8.6-11.9-16.2-11.9-9.4 0-16.9 7.6-16.9 16.9s7.6 16.9 16.9 16.9c5.9 0 11.1-3 14.1-7.5 1 .6 2 1.4 2.9 2.3 12.5 12.5 12.2 49.8 11.9 93.1 0 6.1-.1 14.8-.1 21.8-7-1.3-14.3-.7-21.1 2.2 0-9.6.1-12.5.2-20.2.4-32.9.6-49.4-8.6-58.7-3.9-3.9-8.8-5.8-14.1-6.8-2.5-6.3-8.6-10.8-15.8-10.8-9.4 0-16.9 7.6-16.9 16.9 0 9.4 7.6 16.9 16.9 16.9 6.5 0 12.1-3.6 15-9 2.2.6 3.9 1.4 4.9 2.5 5.1 5.2 4.9 21.6 4.6 48.7-.1 7.9-.2 19.5-.2 29.5 0 0-14.1 13.5-5.6 52.2 7.1 32.5 20.6 51.9 20.6 51.9 13.2 26.4 33.4 48.5 58.4 64.1 25.1 15.5 53.9 23.7 83.4 23.7h310.9c24.1 0 39.6.2 39.6-23.9.1-13.2-30.5-19.8-57-22.8z"/></mask>
        <g class="group" data-group mask="url(#mask-snail)"></g>
        <g class="animal__outline" fill="none" stroke="#000" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10">
          <path d="M257.4 451.2c-14.8-7.9-26.1-18.3-30.9-30.5l-28.9-61.1c-4.1-8.2-10.6-14.9-18.2-19.3 0-7.7.1-20.5.1-26.9.3-48.2.6-86.3-16-103-3.1-3.1-6.7-5.4-10.7-6.8-2.1-6.9-8.6-11.9-16.2-11.9-9.4 0-16.9 7.6-16.9 16.9s7.6 16.9 16.9 16.9c5.9 0 11.1-3 14.1-7.5 1 .6 2 1.4 2.9 2.3 12.5 12.5 12.2 49.8 11.9 93.1 0 6.1-.1 14.8-.1 21.8-7-1.3-14.3-.7-21.1 2.2 0-9.6.1-12.5.2-20.2.4-32.9.6-49.4-8.6-58.7-3.9-3.9-8.8-5.8-14.1-6.8-2.5-6.3-8.6-10.8-15.8-10.8-9.4 0-16.9 7.6-16.9 16.9 0 9.4 7.6 16.9 16.9 16.9 6.5 0 12.1-3.6 15-9 2.2.6 3.9 1.4 4.9 2.5 5.1 5.2 4.9 21.6 4.6 48.7-.1 7.9-.2 19.5-.2 29.5 0 0-14.1 13.5-5.6 52.2 7.1 32.5 20.6 51.9 20.6 51.9 13.2 26.4 33.4 48.5 58.4 64.1 25.1 15.5 53.9 23.7 83.4 23.7H598c24.1 0 39.6 0 39.6-17.9 0-13.1-27.4-23.7-57.1-28.7-26.6-4.5-46.7-6.9-46.7-6.9"/>
          <path d="M494.7 375.4c-3.4-14.8-18.2-24-33-20.6-18.5 4.3-30 22.7-25.7 41.2 5.4 23.1 28.4 37.5 51.5 32.2 28.9-6.7 46.9-35.5 40.2-64.4-8.4-36.1-44.4-58.6-80.5-50.2-45.1 10.4-73.3 55.5-62.8 100.6 13.1 56.4 69.4 91.6 125.8 78.5 70.5-16.3 114.5-86.7 98.1-157.3-20.3-88.1-108.4-143-196.5-122.6-110.2 25.5-180.5 127.9-155 238 0 0 65.4 39.5 170.2 26"/>
          <circle fill="#000" stroke="none" cx="135.2" cy="207.5" r="7"/>
          <circle fill="#000" stroke="none" cx="103.9" cy="256.8" r="7"/>
        </g>
      </g>`
    }
  ];

  /* ---------- Cache helpers ---------- */

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.shapes || !Array.isArray(parsed.shapes)) return null;
      return parsed;
    } catch (_) { return null; }
  }

  function writeCache(shapes) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        shapes,
        cachedAt: Date.now()
      }));
    } catch (_) {}
  }

  /* ---------- Validate shape objects ----------
     Defensive: gist content is untrusted, so validate each entry. */
  function validateShape(s) {
    return s
      && typeof s.id === 'string' && s.id.length > 0
      && typeof s.label === 'string' && s.label.length > 0
      && typeof s.emoji === 'string'
      && typeof s.svg === 'string' && s.svg.includes('<g');
  }

  function sanitizeShapes(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(validateShape).map(s => ({
      id: s.id,
      label: s.label,
      emoji: s.emoji,
      svg: s.svg
    }));
  }

  /* ---------- Public API ---------- */

  /**
   * Load shapes: tries gist (if configured + online), else cache,
   * else bundled fallback. Always returns synchronously with the
   * best available list, and refreshes async if a newer gist
   * version is fetched.
   *
   * @param {function} [onUpdate] - called with refreshed shapes
   *                                if a fresh fetch succeeds
   * @returns {Array} shapes - best available right now
   */
  function loadShapes(onUpdate) {
    const gistUrl = (global.Config && global.Config.SHAPES_GIST_URL) || null;

    // 1. Try cache first (offline-first)
    const cached = readCache();
    let initialShapes = cached ? cached.shapes : BUNDLED_SHAPES;

    // 2. If no gist configured, just use bundled/cache and stop
    if (!gistUrl) {
      if (onUpdate) onUpdate(initialShapes);
      return initialShapes;
    }

    // 3. If cache is fresh (< 24h old), don't bother fetching
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
      if (onUpdate) onUpdate(cached.shapes);
      return cached.shapes;
    }

    // 4. Async refresh from gist (if online)
    if (navigator.onLine) {
      // Bust cache via timestamp query param
      const bustUrl = gistUrl + (gistUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
      fetch(bustUrl, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          const shapes = sanitizeShapes(data.shapes || data.animals || data);
          if (shapes.length === 0) return;
          writeCache(shapes);
          if (onUpdate) onUpdate(shapes);
        })
        .catch(() => {
          // Network failed — keep using cached/bundled shapes
        });
    }

    if (onUpdate) onUpdate(initialShapes);
    return initialShapes;
  }

  /* ---------- Export ---------- */
  global.Shapes = {
    loadShapes,
    BUNDLED_SHAPES  // exposed for testing / fallback
  };
})(window);
