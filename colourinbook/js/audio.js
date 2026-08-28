/* ============================================================
   audio.js
   Single Responsibility: Web Audio synthesis for music paint.
   - Lazily creates an AudioContext (required by browsers
     to be created after a user gesture)
   - Exposes playNote(index, totalNotes) that maps a color
     index to a pentatonic scale note (always pleasant,
     never dissonant — important for kids)
   - Exposes setMuted(bool) so the toolbar mute toggle works
   ============================================================ */

(function (global) {
  'use strict';

  // C major pentatonic: C, D, E, G, A — across two octaves.
  // Pentatonic = no half-steps = any combo sounds harmonious,
  // which is perfect for a kids' music paint activity.
  const PENTATONIC_FREQS = [
    261.63, // C4
    293.66, // D4
    329.63, // E4
    392.00, // G4
    440.00, // A4
    523.25, // C5
    587.33, // D5
    659.25, // E5
    783.99, // G5
    880.00, // A5
    1046.50, // C6
    1174.66 // D6
  ];

  let ctx = null;
  let muted = false;

  /** Lazily create the AudioContext on first user gesture. */
  function ensureContext() {
    if (ctx) return ctx;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  /**
   * Play a short note for color index `i` out of `total` colors.
   * Maps the index into the pentatonic scale proportionally.
   *
   * @param {number} i     - color index (0-based)
   * @param {number} total - total colors in the palette
   * @param {object} [opts]
   * @param {number} [opts.duration=0.35]  - seconds
   * @param {number} [opts.volume=0.25]    - 0..1
   */
  function playNote(i, total, opts = {}) {
    if (muted) return;
    const audio = ensureContext();
    if (!audio) return;
    if (audio.state === 'suspended') audio.resume();

    const { duration = 0.35, volume = 0.25 } = opts;
    const idx = Math.round((i / Math.max(1, total - 1)) * (PENTATONIC_FREQS.length - 1));
    const freq = PENTATONIC_FREQS[idx];

    const t0 = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    // Soft, bell-like timbre
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0);

    // Quick attack, exponential decay — sounds like a music box
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(gain).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  function setMuted(value) {
    muted = !!value;
    return muted;
  }

  function isMuted() { return muted; }

  /* ---------- Export ---------- */
  global.SoundKit = {
    playNote,
    setMuted,
    isMuted,
    ensureContext
  };
})(window);
