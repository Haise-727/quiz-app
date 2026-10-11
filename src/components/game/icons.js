import {
  PiFlagBold, PiFlameFill, PiCalendarCheckBold, PiTargetBold, PiCrownSimpleFill,
  PiCompassBold, PiTrendUpBold, PiStarFill, PiSunBold,
} from 'react-icons/pi';

/**
 * Badge icon keys (from utils/gamification.js) mapped to drawings. Kept apart from the
 * rules so the rules stay free of React and can move to a server unchanged.
 */
export const BADGE_ICONS = {
  flag: PiFlagBold,
  fire: PiFlameFill,
  calendar: PiCalendarCheckBold,
  target: PiTargetBold,
  crown: PiCrownSimpleFill,
  compass: PiCompassBold,
  trend: PiTrendUpBold,
  flame: PiFlameFill,
  star: PiStarFill,
  sun: PiSunBold,
};

/** Pastel tints from the theme. They switch with light and dark mode on their own. */
export const TINT = {
  green:  'bg-[hsl(var(--tint-green))] text-[hsl(var(--tint-green-fg))]',
  red:    'bg-[hsl(var(--tint-red))] text-[hsl(var(--tint-red-fg))]',
  blue:   'bg-[hsl(var(--tint-blue))] text-[hsl(var(--tint-blue-fg))]',
  yellow: 'bg-[hsl(var(--tint-yellow))] text-[hsl(var(--tint-yellow-fg))]',
  neutral:'bg-[hsl(var(--tint-neutral))] text-[hsl(var(--tint-neutral-fg))]',
};
