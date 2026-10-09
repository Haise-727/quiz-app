/**
 * One motion language for the whole app, so "snappy" means the same thing on every page.
 *
 * Rules of thumb used here:
 *  - Press feedback and selection use a stiff spring. It starts instantly and settles in
 *    well under 250ms, so the interface never feels like it is catching up with a tap.
 *  - Entrances are short fades with a small rise, staggered by about 40ms. Never everything
 *    at once, never longer than the eye needs to follow.
 *  - Only transform and opacity are animated. They stay on the GPU and never reflow the page.
 *
 * The app is wrapped in <MotionConfig reducedMotion="user"> (main.jsx), so people who ask
 * their system for less motion automatically get fades instead of movement.
 */

/** Stiff and quick: presses, selections, toggles. */
export const spring = { type: 'spring', stiffness: 520, damping: 32, mass: 0.7 };

/** A little softer: cards and panels settling into place. */
export const springSoft = { type: 'spring', stiffness: 300, damping: 28, mass: 0.9 };

/** Overshoots on purpose: a reward landing (badge, level up, correct streak). */
export const springPop = { type: 'spring', stiffness: 420, damping: 15, mass: 0.8 };

/** The curve for plain fades and slides. Fast out, long settle. */
export const ease = [0.16, 1, 0.3, 1];

/** Parent: staggers its children. */
export const stagger = (gap = 0.04, delay = 0) => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

/** Child: rise and fade in. */
export const rise = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease } },
};

/** Child: fade only, for places where movement would be distracting. */
export const fade = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
};

/** Child: scale up from slightly small. Good for tiles that appear in a grid. */
export const pop = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: spring },
};

/** Spread onto any motion element that should feel pressable. */
export const pressable = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.97 },
  transition: spring,
};

/**
 * Question to question movement in a quiz. `direction` is 1 for forward, -1 for back.
 * Short distance and a fast exit, so the next question is readable almost at once.
 */
export const slideQuestion = {
  enter: (direction) => ({ x: direction > 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { ...spring, opacity: { duration: 0.12 } } },
  exit: (direction) => ({ x: direction > 0 ? -32 : 32, opacity: 0, transition: { duration: 0.1 } }),
};

/** Quick horizontal shake for "that did not work". */
export const shake = { x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.36 } };
