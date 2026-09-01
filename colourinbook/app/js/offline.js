/* ============================================================
   offline.js
   Single Responsibility: detect online/offline transitions
   and show a friendly custom modal (NOT browser alert).

   - App keeps working offline (it's offline-first)
   - Banner informs the user that loading remote shapes
     needs internet, so they know what to expect
   - Auto-dismisses when connection returns
   ============================================================ */

(function (global) {
  'use strict';

  const { qs, el } = global.Utils;
  let bannerEl = null;
  let lastOnline = navigator.onLine;

  function buildBanner() {
    bannerEl = el('div', {
      class: 'offline-banner',
      dataset: { offlineBanner: true },
      hidden: true,
      role: 'alert',
      'aria-live': 'polite'
    }, [
      el('div', { class: 'offline-banner__icon', 'aria-hidden': 'true' }, '📡'),
      el('div', { class: 'offline-banner__body' }, [
        el('div', { class: 'offline-banner__title' }, "You're offline"),
        el('div', { class: 'offline-banner__text' },
          "You can keep using ColourInBook because all features work offline. We'll let you know when you're back online."
        )
      ])
    ]);
    document.body.appendChild(bannerEl);
  }

  function showBanner() {
    if (!bannerEl) buildBanner();
    bannerEl.hidden = false;
    // Reflow for transition
    void bannerEl.offsetWidth;
    bannerEl.classList.add('is-visible');
  }

  function hideBanner() {
    if (!bannerEl) return;
    bannerEl.classList.remove('is-visible');
    setTimeout(() => { if (bannerEl) bannerEl.hidden = true; }, 300);

    // Brief "back online" toast
    if (global.App && global.App.toast) {
      global.App.toast("Back online! 🎉", 2000);
    }
  }

  function update() {
    const now = navigator.onLine;
    if (now !== lastOnline) {
      if (now) {
        hideBanner();
        // Try to refresh shapes from gist when coming back online
        if (global.Shapes) global.Shapes.loadShapes(updated => {
          if (global.Activities && global.Activities.coloring && updated) {
            // coloring activity will refresh on next init if needed
          }
        });
      } else {
        showBanner();
      }
      lastOnline = now;
    }
  }

  function init() {
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    // Check initial state (in case app loaded while offline)
    if (!navigator.onLine) {
      // Slight delay so it doesn't conflict with welcome screen animation
      setTimeout(showBanner, 800);
    }
  }

  global.Offline = { init, update };
})(window);
