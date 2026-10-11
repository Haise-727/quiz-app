/**
 * Finds the maths in a piece of question text, so "Solve $x^2 = 9$" can be drawn with a
 * real formula. Pure and free of React, so it has its own tests (scripts/test-math-text.mjs).
 *
 * The rules are the ones most people already know from Markdown and LaTeX:
 *   $...$      a formula inside a line
 *   $$...$$    a formula on its own line
 *   \$         a plain dollar sign
 *
 * Money must not turn into maths, so an inline formula needs text touching both dollar
 * signs: "$x$" is a formula but "It costs $5 and $10" is not, because the second dollar
 * sign has a space before it. A closing dollar sign also cannot be followed by a digit.
 *
 * @returns {{ type: 'text' | 'inline' | 'display', value: string }[]}
 */
export function splitMath(text) {
  const src = String(text ?? '');
  const parts = [];
  let buf = '';
  let i = 0;
  const flush = () => { if (buf) { parts.push({ type: 'text', value: buf }); buf = ''; } };

  while (i < src.length) {
    const ch = src[i];

    // An escaped dollar sign is just a dollar sign.
    if (ch === '\\' && src[i + 1] === '$') { buf += '$'; i += 2; continue; }

    if (ch === '$') {
      const display = src[i + 1] === '$';
      const open = display ? 2 : 1;
      // Look for the matching close, skipping over anything escaped with a backslash.
      let j = i + open;
      let close = -1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (display ? (src[j] === '$' && src[j + 1] === '$') : src[j] === '$') { close = j; break; }
        j += 1;
      }
      if (close > i + open) {
        const body = src.slice(i + open, close);
        const valid = body.trim().length > 0 && (display || (!/^\s/.test(body) && !/\s$/.test(body) && !/\d/.test(src[close + open] ?? '')));
        if (valid) {
          flush();
          parts.push({ type: display ? 'display' : 'inline', value: body });
          i = close + open;
          continue;
        }
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return parts;
}

/** Does this text contain any formula? Cheap, so a page can decide whether to load KaTeX at all. */
export const hasMath = (text) => splitMath(text).some((p) => p.type !== 'text');
