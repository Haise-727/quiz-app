import { PiCircleFill, PiDiamondFill, PiSquareFill, PiTriangleFill } from 'react-icons/pi';

/**
 * The four answer styles of a live game. Each option gets one by position: a shape and a
 * soft colour, so a player can say "the blue diamond" across a room and a colour blind
 * player still has the shape. The colours come from the theme tints, so they follow dark mode.
 */
export const TILES = [
  { Icon: PiTriangleFill, name: 'triangle', bg: 'bg-[hsl(var(--tint-red))]',    fg: 'text-[hsl(var(--tint-red-fg))]',    edge: 'border-[hsl(var(--tint-red-fg))]/25',    solid: 'border-[hsl(var(--tint-red-fg))]' },
  { Icon: PiDiamondFill,  name: 'diamond',  bg: 'bg-[hsl(var(--tint-blue))]',   fg: 'text-[hsl(var(--tint-blue-fg))]',   edge: 'border-[hsl(var(--tint-blue-fg))]/25',   solid: 'border-[hsl(var(--tint-blue-fg))]' },
  { Icon: PiCircleFill,   name: 'circle',   bg: 'bg-[hsl(var(--tint-yellow))]', fg: 'text-[hsl(var(--tint-yellow-fg))]', edge: 'border-[hsl(var(--tint-yellow-fg))]/25', solid: 'border-[hsl(var(--tint-yellow-fg))]' },
  { Icon: PiSquareFill,   name: 'square',   bg: 'bg-[hsl(var(--tint-green))]',  fg: 'text-[hsl(var(--tint-green-fg))]',  edge: 'border-[hsl(var(--tint-green-fg))]/25',  solid: 'border-[hsl(var(--tint-green-fg))]' },
];

export const tileFor = (index) => TILES[index % TILES.length];
