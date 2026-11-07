/**
 * Menu déroulant à choix multiple (langues, logiciels…).
 * Un bouton qui résume la sélection ; au clic, un panneau de cases à cocher.
 * Clic en dehors → se referme. Partagé par le panneau Publier et la fenêtre
 * de mission (modification d'un shift).
 * Le panneau s'ouvre vers le haut quand il n'y a pas la place en dessous
 * (bas d'une fenêtre qui défile), pour ne jamais être coupé.
 */
import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

/** Hauteur maximale du panneau (max-h-56) + marge. */
const PANEL_HEIGHT = 240;

/** Premier ancêtre qui défile (sinon la fenêtre). */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

export function MultiSelect({ options, value, onChange, placeholder = 'Choisir…' }: Props) {
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);

  const openPanel = () => {
    const el = ref.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const parent = scrollParentOf(el);
      const bottomLimit = parent
        ? Math.min(parent.getBoundingClientRect().bottom, window.innerHeight)
        : window.innerHeight;
      const topLimit = parent ? Math.max(parent.getBoundingClientRect().top, 0) : 0;
      const below = bottomLimit - rect.bottom;
      const above = rect.top - topLimit;
      setUpward(below < PANEL_HEIGHT && above > below);
    }
    setOpen(true);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-expanded={open}
        className="w-full h-10 flex items-center justify-between gap-2 rounded-se-sm border border-se-line bg-se-surface px-3 text-sm focus:outline-none focus:border-se-blue"
      >
        <span className={value.length ? 'text-se-ink truncate' : 'text-se-muted'}>
          {value.length ? value.join(', ') : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-se-muted transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <>
          {/* clic en dehors pour fermer */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            className={`absolute z-20 w-full max-h-56 overflow-y-auto rounded-se-sm border border-se-line bg-se-surface shadow-se-md p-1 ${
              upward ? 'bottom-full mb-1' : 'mt-1'
            }`}
          >
            {options.map((o) => (
              <label
                key={o}
                className="flex items-center gap-2 px-2 py-1.5 rounded-[6px] hover:bg-se-surface-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={value.includes(o)}
                  onChange={() => toggle(o)}
                  className="accent-se-blue"
                />
                <span className="text-sm text-se-ink">{o}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
