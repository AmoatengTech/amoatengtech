/* ============================================================
   config.js
   Single source of truth for app-level configuration.
   Owner-editable: gist URL.

   Community Edition: no paywall, no Cloudflare Worker, no Paystack.
   ============================================================ */

(function (global) {
  'use strict';

  /**
   * CONFIGURATION
   * --------------
   * As the app owner, edit these values to point at your own
   * services. Everything else in the codebase reads from here.
   */
  const CONFIG = {
    /* ---------- Shape catalog ----------
       A GitHub gist raw URL that returns JSON. Edit the gist
       (no git CLI needed) and the app picks up new shapes on
       next load. Format documented in shapes.js.
       To use your own gist:
         1. Create a gist at https://gist.github.com with a
            single file named `shapes.json`
         2. Click "Raw" to get the raw URL
         3. Paste it below
       Leave null to use the bundled fallback shapes. */
    SHAPES_GIST_URL: null,  // e.g. 'https://gist.githubusercontent.com/youruser/abc123/raw/shapes.json'

    /* ---------- App metadata ---------- */
    APP_NAME: 'ColourInBook',
    APP_VERSION: '1.1-community',
    SUPPORT_EMAIL: 'support@amoatengtech.com'  // update this
  };

  global.Config = CONFIG;
})(window);
