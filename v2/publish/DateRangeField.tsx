/**
 * Champ « Dates » du panneau Publier : un bouton qui ressemble à un champ et
 * affiche la plage (« mar. 3 nov. » ou « lun. 2 → dim. 8 nov. · 7 jours »).
 * Au clic, un sélecteur s'ouvre dessous : raccourcis (Demain, Ce week-end,
 * Semaine prochaine, 2 semaines) et calendrier début → fin, puis Appliquer.
 * Même esprit que le sélecteur de période de Factures & heures.
 */
import { useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { RangeCalendar } from '../factures/PeriodPicker';
import type { DateRange } from '../factures/PeriodPicker';
import { parseISO, toISO } from '../time';

const fmtShort = (iso: string) =>
  parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtLong = (iso: string) =>
  parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const dayCount = (r: DateRange) => Math.round((parseISO(r.to).getTime() - parseISO(r.from).getTime()) / 86_400_000) + 1;

/** Raccourcis calculés à partir d'aujourd'hui. */
function presets(today: string): { label: string; range: DateRange }[] {
  const d = parseISO(today);
  const at = (n: number) => {
    const x = new Date(d);
    x.setDate(d.getDate() + n);
    return toISO(x);
  };
  const dow = d.getDay(); // 0 = dim
  const toMonday = (8 - dow) % 7 || 7;
  const toSaturday = (6 - dow + 7) % 7 || 7;
  return [
    { label: 'Demain', range: { from: at(1), to: at(1) } },
    { label: 'Ce week-end', range: { from: at(toSaturday), to: at(toSaturday + 1) } },
    { label: 'Semaine prochaine', range: { from: at(toMonday), to: at(toMonday + 6) } },
    { label: '2 semaines', range: { from: at(toMonday), to: at(toMonday + 13) } },
  ];
}

export function DateRangeField({
  value,
  onChange,
  today,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);
  const single = value.from === value.to;
  const label = single ? fmtLong(value.from) : `${fmtShort(value.from)} → ${fmtShort(value.to)}`;
  const openPicker = () => {
    setDraft(value);
    setOpen(true);
  };
  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="w-full h-10 flex items-center gap-2 rounded-se-sm border border-se-line bg-se-surface px-3 text-sm text-left hover:border-se-muted focus:outline-none focus:border-se-blue"
      >
        <CalendarDays className="w-4 h-4 text-se-muted shrink-0" aria-hidden="true" />
        <span className="font-semibold text-se-ink truncate first-letter:uppercase">{label}</span>
        {!single && <span className="text-xs text-se-muted whitespace-nowrap">· {dayCount(value)} jours</span>}
        <ChevronDown
          className={`w-4 h-4 text-se-muted ml-auto shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fermer"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div
            role="dialog"
            aria-label="Choisir les dates"
            className="se-root absolute left-0 right-0 top-full mt-1.5 z-40 bg-se-surface border border-se-line rounded-se shadow-se-md p-3"
          >
            <div className="flex flex-wrap gap-1.5 mb-3">
              {presets(today).map((p) => {
                const on = draft.from === p.range.from && draft.to === p.range.to;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setDraft(p.range)}
                    className={`h-8 px-3 rounded-full text-xs font-semibold border transition-colors ${
                      on
                        ? 'bg-se-blue text-white border-se-blue'
                        : 'bg-se-surface border-se-line text-se-ink hover:border-se-muted'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <RangeCalendar value={draft} today={today} onChange={setDraft} />
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-se-line">
              <p className="text-xs text-se-muted min-w-0 flex-1 truncate">
                {draft.from === draft.to
                  ? fmtLong(draft.from)
                  : `${fmtShort(draft.from)} → ${fmtShort(draft.to)} · ${dayCount(draft)} jours`}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-9 px-3 rounded-se-sm text-sm font-semibold text-se-muted hover:bg-se-surface-2"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={apply}
                className="h-9 px-4 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
              >
                Appliquer
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
