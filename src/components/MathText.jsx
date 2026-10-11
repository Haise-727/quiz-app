import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { splitMath } from '@/utils/mathText';

/**
 * Text that may contain formulas, written between dollar signs: "Solve $x^2 = 9$".
 * Text without a formula comes back as plain text with no extra element, so using this
 * everywhere costs nothing on pages that have no maths.
 *
 * KaTeX (the formula drawing library, about 280 KB with its fonts) is fetched only the
 * first time a formula appears, and the raw text shows for a moment until it arrives.
 * It draws into an element through KaTeX's own `render`, with `trust` off, so teacher
 * text can never add links, HTML or scripts. KaTeX also writes a hidden MathML copy, so
 * screen readers read the formula aloud.
 */
let loading = null;
let katex = null;
function loadKatex() {
  if (!loading) {
    loading = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([mod]) => { katex = mod.default || mod; });
  }
  return loading;
}

function Formula({ source, display }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(source, ref.current, { displayMode: display, throwOnError: false, trust: false, strict: 'ignore', maxExpand: 500, maxSize: 20 });
    } catch {
      ref.current.textContent = source;   // never let one bad formula break the page
    }
  }, [source, display]);
  return <span ref={ref} className={display ? 'my-2 block overflow-x-auto' : undefined} />;
}

export default function MathText({ text, className }) {
  const parts = useMemo(() => splitMath(text), [text]);
  const hasFormula = parts.some((p) => p.type !== 'text');
  const [ready, setReady] = useState(!!katex);

  useEffect(() => {
    if (hasFormula && !katex) loadKatex().then(() => setReady(true)).catch(() => {});
  }, [hasFormula]);

  if (!hasFormula) return className ? <span className={className}>{text}</span> : <>{text}</>;
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.type === 'text') return <Fragment key={i}>{p.value}</Fragment>;
        if (!ready) return <span key={i}>{p.type === 'display' ? `$$${p.value}$$` : `$${p.value}$`}</span>;
        return <Formula key={i} source={p.value} display={p.type === 'display'} />;
      })}
    </span>
  );
}
