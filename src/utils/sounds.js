/**
 * Lightweight sound effects synthesized with the Web Audio API.
 * No external audio files — every sound is a generated tone, so there's
 * nothing to source, host, or ship as a binary asset.
 *
 * Preference is persisted to localStorage and defaults to ON.
 */

const STORAGE_KEY = 'quizlike_sound';

let audioCtx = null;
const getCtx = () => {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
};

export const isSoundEnabled = () => localStorage.getItem(STORAGE_KEY) !== 'off';

export const setSoundEnabled = (enabled) => {
  localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
};

export const toggleSound = () => {
  const next = !isSoundEnabled();
  setSoundEnabled(next);
  return next;
};

/** Plays a single synthesized tone. Fails silently if AudioContext is unavailable. */
const tone = (freq, duration, type = 'sine', startTime = 0, gainPeak = 0.15) => {
  if (!isSoundEnabled()) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime + startTime;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  } catch {
    // AudioContext blocked or unavailable — silently no-op.
  }
};

/** Pleasant ascending major-triad chime for a correct answer. */
export const playCorrect = () => {
  tone(523.25, 0.12, 'sine', 0);
  tone(659.25, 0.18, 'sine', 0.1);
  tone(783.99, 0.22, 'sine', 0.2);
};

/** Low descending buzz for a wrong answer. */
export const playWrong = () => {
  tone(196, 0.25, 'sawtooth', 0, 0.07);
  tone(146.83, 0.3, 'sawtooth', 0.08, 0.07);
};

/** Soft tick, used for the final-seconds timer countdown. */
export const playTick = () => {
  tone(880, 0.05, 'square', 0, 0.045);
};

/** Five-note ascending fanfare for quiz/session completion. */
export const playComplete = () => {
  [523.25, 587.33, 659.25, 698.46, 783.99].forEach((f, i) => tone(f, 0.18, 'sine', i * 0.1));
};

/** Subtle click for low-stakes UI feedback (card flip, button press). */
export const playClick = () => {
  tone(440, 0.04, 'sine', 0, 0.04);
};

/** Two-note chime for incoming notifications. */
export const playNotification = () => {
  tone(880, 0.1, 'sine', 0);
  tone(1108.73, 0.15, 'sine', 0.08);
};
