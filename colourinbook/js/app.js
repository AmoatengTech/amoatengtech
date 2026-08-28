/* ============================================================
   app.js
   Orchestrator: wires together welcome screen, activity tabs,
   parent modal, save bar, and age mode. Delegates all drawing
   behavior to the activity modules in `window.Activities`.

   Dependency Inversion: app.js depends on the activity
   contract {init, destroy, exportPNG, onAgeChange} — it does
   not know HOW any activity draws, only that it can ask.
   ============================================================ */

(function () {
  'use strict';

  const { qs, qsa } = window.Utils;
  const { loadSettings, saveSettings } = window.Storage;

  /* ---------- Constants ---------- */
  const ACTIVITY_ORDER = ['coloring', 'freedraw', 'stickers', 'musicpaint'];
  const ACTIVITY_LABELS = {
    coloring:   'coloring',
    freedraw:   'drawing',
    stickers:   'stickers',
    musicpaint: 'music paint'
  };

  /* ---------- State ---------- */
  let currentActivity = null;     // activity id string
  let currentAge = 'kid';         // 'kid' | 'toddler'
  let toastTimer = null;

  /* ---------- Activity contract lookup ---------- */
  function activityModule(id) {
    return (window.Activities && window.Activities[id]) || null;
  }

  /* ---------- Screen switching ---------- */

  function showScreen(name) {
    qsa('[data-screen]').forEach(s => {
      s.hidden = s.dataset.screen !== name;
    });
  }

  /* ---------- Activity switching ---------- */

  function showPanel(id) {
    qsa('[data-activity-panel]').forEach(p => {
      p.hidden = p.dataset.activityPanel !== id;
    });
  }

  function selectActivityTab(id) {
    qsa('[data-activity-tab]').forEach(tab => {
      const active = tab.dataset.activityTab === id;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function switchActivity(id) {
    if (!ACTIVITY_ORDER.includes(id)) return;

    // Teardown previous activity (if any)
    if (currentActivity) {
      const prev = activityModule(currentActivity);
      if (prev && typeof prev.destroy === 'function') prev.destroy();
    }

    currentActivity = id;
    selectActivityTab(id);
    showPanel(id);

    // Init the new activity. We re-init every time so the canvas
    // is freshly sized to the now-visible panel (ResizeObserver
    // only fires when the element's box actually changes, and
    // hidden→visible counts).
    const mod = activityModule(id);
    if (mod && typeof mod.init === 'function') {
      // Defer one frame so layout settles before init measures sizes
      requestAnimationFrame(() => mod.init());
    }
  }

  /* ---------- Age mode ---------- */

  function setAge(age) {
    if (age !== 'kid' && age !== 'toddler') return;
    currentAge = age;
    document.documentElement.dataset.age = age;
    saveSettings({ age });

    // Refresh palettes in any already-initialized activity.
    // (We re-init current activity to apply age-mode cleanly.)
    if (currentActivity) {
      const mod = activityModule(currentActivity);
      if (mod && typeof mod.onAgeChange === 'function') {
        mod.onAgeChange();
      }
    }

    // Update parent modal active state
    qsa('[data-age-set]').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.ageSet === age);
    });
  }

  /* ---------- Parent modal ---------- */

  function openParent() {
    qs('[data-modal="parent"]').hidden = false;
  }
  function closeParent() {
    qs('[data-modal="parent"]').hidden = true;
  }

  /* ---------- Toast ---------- */

  function showToast(message, duration = 2200) {
    const toast = qs('[data-toast]');
    toast.textContent = message;
    toast.hidden = false;
    // Force reflow so the transform transition runs
    void toast.offsetWidth;
    toast.classList.add('is-visible');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('is-visible');
      // Hide after transition completes
      setTimeout(() => { toast.hidden = true; }, 250);
    }, duration);
  }

  /* ---------- Save ---------- */

  function handleSave() {
    if (!currentActivity) return;
    const mod = activityModule(currentActivity);
    if (!mod || typeof mod.exportPNG !== 'function') {
      showToast('Cannot save this picture');
      return;
    }

    showToast('Saving your picture...');

    Promise.resolve(mod.exportPNG())
      .then(() => showToast('Picture saved! 🎉'))
      .catch((err) => {
        console.error('Export failed:', err);
        showToast('Could not save — try again');
      });
  }

  /* ---------- Event wiring ---------- */

  function wireEvents() {
    // Welcome screen age picker
    qsa('[data-age-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        setAge(btn.dataset.agePick);
        enterApp();
      });
    });

    // Activity tab switching
    qsa('[data-activity-tab]').forEach(tab => {
      tab.addEventListener('click', () => switchActivity(tab.dataset.activityTab));
    });

    // Parent corner open/close
    qs('[data-action="open-parent"]').addEventListener('click', openParent);
    qsa('[data-action="close-parent"]').forEach(el => {
      el.addEventListener('click', closeParent);
    });

    // Age set buttons inside parent modal
    qsa('[data-age-set]').forEach(btn => {
      btn.addEventListener('click', () => setAge(btn.dataset.ageSet));
    });

    // Save bar
    qs('[data-action="save-png"]').addEventListener('click', handleSave);

    // ESC closes parent modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeParent();
    });

    // Resize re-init for current activity when crossing mobile/desktop
    // breakpoints (toolbar layout changes from row to column).
    let lastLayout = window.innerWidth > 800 ? 'wide' : 'narrow';
    window.addEventListener('resize', () => {
      const now = window.innerWidth > 800 ? 'wide' : 'narrow';
      if (now !== lastLayout && currentActivity) {
        lastLayout = now;
        const mod = activityModule(currentActivity);
        if (mod) {
          mod.destroy();
          requestAnimationFrame(() => mod.init());
        }
      }
    });
  }

  /* ---------- Boot ---------- */

  function enterApp() {
    showScreen('app');
    switchActivity('coloring');
  }

  function boot() {
    // Restore previously chosen age, if any
    const settings = loadSettings();
    if (settings.age === 'kid' || settings.age === 'toddler') {
      currentAge = settings.age;
      document.documentElement.dataset.age = settings.age;
      // Mark the active age button in parent modal
      qsa('[data-age-set]').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.ageSet === settings.age);
      });
    }

    wireEvents();

    // Initialize offline-first alert system
    if (window.Offline) window.Offline.init();

    // If we already know the age (returning user), skip welcome.
    // Otherwise show the welcome screen first.
    if (settings.age) {
      enterApp();
    } else {
      showScreen('welcome');
    }
  }

  // Boot when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose toast for other modules (e.g. offline.js)
  window.App = { toast: showToast };
})();
