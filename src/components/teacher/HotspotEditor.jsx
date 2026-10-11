import { useEffect, useMemo, useRef, useState } from 'react';
import { PiTrashBold, PiXBold } from 'react-icons/pi';

const clamp = (n, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const round1 = (n) => Math.round(n * 10) / 10;
const MIN_SIZE = 3;   // smaller than 3% of the picture is a slip of the finger, not an area

/**
 * Where a teacher marks the right area(s) on the picture of a "click on the image"
 * question. Drag on the picture to draw a box. Draw several boxes and a click in any of
 * them counts as right. The boxes are saved as percentages of the picture, the same unit
 * the student's click uses, so they line up at any size.
 *
 * The picture is drawn exactly the way the student sees it (the original, resized only by
 * ImageKit), because a crop here would move the boxes. For the same reason a crop set on
 * this question is ignored by this question type.
 *
 * Drawing needs a pointer, so each box also has number fields (left, top, width, height)
 * that do the same job from a keyboard.
 *
 * @param file      a File the teacher just picked, or the stored media object { url }
 * @param regions   [{ id, x, y, w, h }]
 * @param onChange  (regions) => void
 */
export default function HotspotEditor({ file, regions, onChange }) {
  const box = useRef(null);
  const [draft, setDraft] = useState(null);       // the box being dragged: { x0, y0, x1, y1 }

  // A File needs a temporary address to show. A stored picture already has one.
  const src = useMemo(() => {
    if (!file) return '';
    if (file instanceof File) return URL.createObjectURL(file);
    return file.url ? `${file.url}${file.url.includes('?') ? '&' : '?'}tr=w-1200` : '';
  }, [file]);
  useEffect(() => () => { if (file instanceof File && src) URL.revokeObjectURL(src); }, [file, src]);

  if (!src) {
    return <p className="rounded-lg bg-[hsl(var(--muted))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">Add the picture above first. Then drag on it here to mark the right area.</p>;
  }

  const point = (e) => {
    const r = box.current.getBoundingClientRect();
    return { x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) };
  };

  const down = (e) => {
    if (e.target.closest('[data-region-remove]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const move = (e) => { if (draft) { const p = point(e); setDraft({ ...draft, x1: p.x, y1: p.y }); } };
  const up = () => {
    if (!draft) return;
    const x = Math.min(draft.x0, draft.x1); const y = Math.min(draft.y0, draft.y1);
    const w = Math.abs(draft.x1 - draft.x0); const h = Math.abs(draft.y1 - draft.y0);
    setDraft(null);
    if (w >= MIN_SIZE && h >= MIN_SIZE) {
      onChange([...regions, { id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, x: round1(x), y: round1(y), w: round1(w), h: round1(h) }]);
    }
  };

  const setField = (id, key, raw) => {
    const value = clamp(Number(raw) || 0);
    onChange(regions.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, [key]: round1(value) };
      // A box may not hang off the edge of the picture.
      next.w = round1(Math.min(next.w, 100 - next.x)); next.h = round1(Math.min(next.h, 100 - next.y));
      return next;
    }));
  };
  const remove = (id) => onChange(regions.filter((r) => r.id !== id));

  const live = draft && { x: Math.min(draft.x0, draft.x1), y: Math.min(draft.y0, draft.y1), w: Math.abs(draft.x1 - draft.x0), h: Math.abs(draft.y1 - draft.y0) };

  return (
    <div>
      <p className="eyebrow mb-2">Drag on the picture to mark the right area. Add more than one if several places are right.</p>
      <div className="relative inline-block max-w-full">
        <div
          ref={box}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => setDraft(null)}
          className="relative cursor-crosshair touch-none select-none overflow-hidden rounded-xl border border-[hsl(var(--border))] leading-[0]"
        >
          <img src={src} alt="The question picture, with the right areas outlined" draggable={false} className="block max-h-[26rem] w-auto max-w-full" />
          {regions.map((r, i) => (
            <span key={r.id} className="absolute rounded-md border-2 border-dashed border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/15" style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}>
              <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[hsl(var(--primary))] font-mono text-[10px] leading-none text-[hsl(var(--primary-foreground))]">{i + 1}</span>
            </span>
          ))}
          {live && <span className="absolute rounded-md border-2 border-dashed border-[hsl(var(--ink))] bg-[hsl(var(--ink))]/10" style={{ left: `${live.x}%`, top: `${live.y}%`, width: `${live.w}%`, height: `${live.h}%` }} />}
        </div>
      </div>

      {regions.length > 0 && (
        <ul className="mt-4 divide-y divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
          {regions.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
              <span className="w-14 text-sm font-medium">Area {i + 1}</span>
              {[['x', 'Left'], ['y', 'Top'], ['w', 'Width'], ['h', 'Height']].map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                  {label}
                  <input
                    type="number" min="0" max="100" step="0.5" value={r[key]}
                    onChange={(e) => setField(r.id, key, e.target.value)}
                    aria-label={`Area ${i + 1} ${label.toLowerCase()} in percent`}
                    className="tabular h-8 w-16 rounded-md border border-[hsl(var(--input))] bg-transparent px-2 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--ink))]"
                  />
                </label>
              ))}
              <button type="button" onClick={() => remove(r.id)} data-region-remove aria-label={`Remove area ${i + 1}`} className="ml-auto grid h-8 w-8 cursor-pointer place-items-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--destructive))]">
                <PiTrashBold className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
