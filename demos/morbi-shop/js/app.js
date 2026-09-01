/**
 * app.js — Composition root for morbi.shop (pre-phase 1)
 *
 * Routes:
 *   #/           → Morbi's landing page
 *   #/morcenzs   → Morcenzs storefront
 *   #/dashboard   → Admin panel
 */
(function (global) {
  'use strict';

  function boot() {
    var router = global.ChowMenuRouter;
    router.register('#/', function () { global.MorbiLanding.render(); });
    router.register('#/morcenzs', function () { global.MorbiStorefront.render(); });
    router.register('#/dashboard', function () { global.MorbiDashboard.render(); });
    router.default(function () { global.MorbiLanding.render(); });
    router.start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
