/**
 * Bouton « Exporter » + petit menu : chaque entrée télécharge quelque chose
 * (PDF via la boîte d'impression, ou fichier Excel). Partagé par le Planning
 * et la liste Personnes. Un mot par entrée, et ce qu'on obtient en dessous.
 */
import { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Check, ChevronDown } from 'lucide-react';

export interface ExportEntry {
  key: string;
  label: string;
  hint?: string;
  kind: 'pdf' | 'excel';
  /** fait l'export ; peut renvoyer un nombre de lignes pour la confirmation */
  run: () => number | void;
}

export function ExportMenu({ entries, compact = false }: { entries: ExportEntry[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<{ label: string; count?: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 3500);
    return () => clearTimeout(t);
  }, [done]);

  const groups: { title: string; kind: ExportEntry['kind'] }[] = [
    { title: 'PDF', kind: 'pdf' },
    { title: 'Excel', kind: 'excel' },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Exporter en PDF ou Excel"
        className={`inline-flex items-center gap-1.5 rounded-se-sm text-sm font-semibold border border-se-line bg-se-surface text-se-ink hover:bg-se-surface-2 ${
          compact ? 'h-10 px-3' : 'px-4 py-2.5'
        }`}
      >
        <Download className="w-4 h-4 text-se-muted" aria-hidden="true" />
        {done ? (
          <span className="inline-flex items-center gap-1 text-se-success">
            <Check className="w-4 h-4" aria-hidden="true" /> {done.label}
            {typeof done.count === 'number' ? ` · ${done.count}` : ''}
          </span>
        ) : (
          <>
            Exporter
            <ChevronDown
              className={`w-3.5 h-3.5 text-se-muted transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fermer"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="se-root absolute right-0 z-50 mt-1.5 w-72 rounded-se border border-se-line bg-se-surface shadow-se-md p-1.5"
          >
            {groups.map((g) => {
              const list = entries.filter((e) => e.kind === g.kind);
              if (list.length === 0) return null;
              return (
                <div key={g.kind} className="py-1">
                  <p className="se-eyebrow px-2.5 py-1 inline-flex items-center gap-1.5">
                    {g.kind === 'pdf' ? (
                      <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    {g.title}
                  </p>
                  {list.map((e) => (
                    <button
                      key={e.key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        const n = e.run();
                        setOpen(false);
                        setDone({ label: e.label, count: typeof n === 'number' ? n : undefined });
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-se-sm hover:bg-se-surface-2"
                    >
                      <span className="block text-sm font-semibold text-se-ink">{e.label}</span>
                      {e.hint && <span className="block text-xs text-se-muted">{e.hint}</span>}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
