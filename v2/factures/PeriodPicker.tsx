/**
 * Choix de période — un bouton qui affiche la plage (« 27/10/26, lun. – 31/10/26, sam. »)
 * et ouvre un panneau : raccourcis à gauche (cette semaine, semaine dernière,
 * ce mois-ci, mois dernier, mois suivant, personnalisé), double calendrier à
 * droite pour choisir une plage au clic, puis « Appliquer ».
 * Partagé par le relevé d'heures et les factures.
 */
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarRange, Check, ChevronDown } from 'lucide-react';
import { parseISO, toISO } from '../time';

export interface DateRange {
  /** ISO yyyy-mm-dd, inclus */
  from: string;
  to: string;
}

export type PeriodKey = 'week' | 'lastWeek' | 'current' | 'previous' | 'next' | 'custom';

/** Bornes d'un mois décalé de `offset` par rapport à `today`. */
export function monthRange(today: string, offset: number): DateRange {
  const [y, m] = today.split('-').map(Number);
  return { from: toISO(new Date(y, m - 1 + offset, 1)), to: toISO(new Date(y, m + offset, 0)) };
}

/** Semaine lun→dim contenant `today`, décalée de `offset` semaines. */
export function weekRange(today: string, offset: number): DateRange {
  const d = parseISO(today);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: toISO(monday), to: toISO(sunday) };
}

export const inRange = (iso: string, r: DateRange): boolean => iso >= r.from && iso <= r.to;

/** « Octobre 2026 » si c'est un mois entier, sinon « 12/10 → 03/11/2026 ». */
export function rangeLabel(r: DateRange): string {
  const f = parseISO(r.from);
  const t = parseISO(r.to);
  const whole =
    f.getDate() === 1 &&
    f.getMonth() === t.getMonth() &&
    f.getFullYear() === t.getFullYear() &&
    t.getDate() === new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  if (whole) {
    const s = f.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return `${f.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} → ${t.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })}`;
}

/** « 27/10/26, lun. » — le format du bouton. */
const shortDay = (iso: string): string => {
  const d = parseISO(iso);
  return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}, ${d.toLocaleDateString(
    'fr-FR',
    { weekday: 'short' },
  )}`;
};

const PRESETS: { key: Exclude<PeriodKey, 'custom'>; label: string; range: (today: string) => DateRange }[] = [
  { key: 'week', label: 'Cette semaine', range: (t) => weekRange(t, 0) },
  { key: 'lastWeek', label: 'La semaine dernière', range: (t) => weekRange(t, -1) },
  { key: 'current', label: 'Ce mois-ci', range: (t) => monthRange(t, 0) },
  { key: 'previous', label: 'Mois dernier', range: (t) => monthRange(t, -1) },
  { key: 'next', label: 'Mois suivant', range: (t) => monthRange(t, 1) },
];

const WEEKDAYS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

export function PeriodPicker({
  today,
  value,
  range,
  onChange,
}: {
  today: string;
  value: PeriodKey;
  range: DateRange;
  onChange: (key: PeriodKey, range: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  // Brouillon : ce qu'on prépare dans le panneau avant « Appliquer ».
  const [draftKey, setDraftKey] = useState<PeriodKey>(value);
  const [draft, setDraft] = useState<DateRange>(range);
  // Sélection au clic : premier clic = début (en attente), second = fin.
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  // Mois affiché à gauche (le suivant est à droite).
  const [anchor, setAnchor] = useState(() => {
    const d = parseISO(range.from);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // À l'ouverture, on repart de la période appliquée.
  useEffect(() => {
    if (!open) return;
    setDraftKey(value);
    setDraft(range);
    setPendingStart(null);
    const d = parseISO(range.from);
    setAnchor({ y: d.getFullYear(), m: d.getMonth() });
  }, [open, value, range]);

  const pickPreset = (p: (typeof PRESETS)[number]) => {
    const r = p.range(today);
    setDraftKey(p.key);
    setDraft(r);
    setPendingStart(null);
    const d = parseISO(r.from);
    setAnchor({ y: d.getFullYear(), m: d.getMonth() });
  };

  const pickDay = (iso: string) => {
    setDraftKey('custom');
    if (pendingStart === null) {
      setPendingStart(iso);
      setDraft({ from: iso, to: iso });
      return;
    }
    const from = iso < pendingStart ? iso : pendingStart;
    const to = iso < pendingStart ? pendingStart : iso;
    setDraft({ from, to });
    setPendingStart(null);
  };

  const apply = () => {
    onChange(draftKey, draft);
    setOpen(false);
  };

  const shift = (n: number) =>
    setAnchor(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-2 h-10 px-3 rounded-se-sm border border-se-line bg-se-surface text-sm font-semibold text-se-ink hover:bg-se-surface-2"
      >
        <CalendarRange className="w-4 h-4 text-se-muted" aria-hidden="true" />
        <span className="whitespace-nowrap">
          {shortDay(range.from)} <span className="text-se-muted font-normal">–</span> {shortDay(range.to)}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-se-muted transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div
            role="dialog"
            aria-label="Choisir une période"
            className="se-root absolute right-0 top-full mt-1.5 z-40 flex bg-se-surface border border-se-line rounded-se shadow-se-md overflow-hidden"
          >
            {/* Raccourcis */}
            <div className="w-[196px] shrink-0 border-r border-se-line p-2 flex flex-col">
              <ul className="space-y-0.5">
                {PRESETS.map((p) => {
                  const on = draftKey === p.key;
                  return (
                    <li key={p.key}>
                      <button
                        type="button"
                        onClick={() => pickPreset(p)}
                        className={`w-full flex items-center gap-1.5 px-2.5 py-2 rounded-se-sm text-sm text-left ${
                          on ? 'bg-se-surface-2 font-semibold text-se-ink' : 'text-se-ink hover:bg-se-surface-2'
                        }`}
                      >
                        {on && <Check className="w-3.5 h-3.5 text-se-blue-ink" aria-hidden="true" />}
                        {p.label}
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button
                    type="button"
                    onClick={() => setDraftKey('custom')}
                    className={`w-full flex items-center gap-1.5 px-2.5 py-2 rounded-se-sm text-sm text-left ${
                      draftKey === 'custom'
                        ? 'bg-se-surface-2 font-semibold text-se-ink'
                        : 'text-se-ink hover:bg-se-surface-2'
                    }`}
                  >
                    {draftKey === 'custom' && <Check className="w-3.5 h-3.5 text-se-blue-ink" aria-hidden="true" />}
                    Personnalisé
                  </button>
                </li>
              </ul>
              <button
                type="button"
                onClick={apply}
                className="mt-auto w-full py-2 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
              >
                Appliquer
              </button>
            </div>

            {/* Double calendrier */}
            <div className="p-3">
              <div className="flex items-center justify-between mb-1">
                <button
                  type="button"
                  onClick={() => shift(-1)}
                  aria-label="Mois précédents"
                  className="w-8 h-8 grid place-items-center rounded-se-sm border border-se-line text-se-muted hover:text-se-ink hover:bg-se-surface-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <p className="text-xs text-se-muted">
                  {pendingStart ? 'Choisissez la fin de la période.' : 'Cliquez un début, puis une fin.'}
                </p>
                <button
                  type="button"
                  onClick={() => shift(1)}
                  aria-label="Mois suivants"
                  className="w-8 h-8 grid place-items-center rounded-se-sm border border-se-line text-se-muted hover:text-se-ink hover:bg-se-surface-2"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-6">
                <Month y={anchor.y} m={anchor.m} today={today} range={draft} pending={pendingStart} onPick={pickDay} />
                <Month
                  y={anchor.y + Math.floor((anchor.m + 1) / 12)}
                  m={(anchor.m + 1) % 12}
                  today={today}
                  range={draft}
                  pending={pendingStart}
                  onPick={pickDay}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Un mois du calendrier ─────────────────────────────────── */
function Month({
  y,
  m,
  today,
  range,
  pending,
  onPick,
}: {
  y: number;
  m: number;
  today: string;
  range: DateRange;
  pending: string | null;
  onPick: (iso: string) => void;
}) {
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(y, m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => toISO(new Date(y, m, i + 1))),
  ];
  while (cells.length % 7) cells.push(null);
  const title = first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="w-[238px]">
      <p className="text-center font-display font-extrabold text-se-ink capitalize mb-2">{title}</p>
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((w) => (
          <span key={w} className="h-7 grid place-items-center text-[11px] font-semibold text-se-muted">
            {w}
          </span>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <span key={`e${i}`} className="h-8" />;
          const selected = inRange(iso, range) && pending === null;
          const isStart = iso === range.from;
          const isEnd = iso === range.to;
          const isPending = iso === pending;
          const isToday = iso === today;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPick(iso)}
              aria-label={parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              aria-pressed={selected || isPending}
              className={`h-8 text-[13px] tabular-nums transition-colors ${
                isPending || ((isStart || isEnd) && selected)
                  ? 'bg-se-blue text-white font-semibold'
                  : selected
                    ? 'bg-se-blue-wash text-se-blue-ink'
                    : 'text-se-ink hover:bg-se-surface-2'
              } ${isStart && selected ? 'rounded-l-se-sm' : ''} ${isEnd && selected ? 'rounded-r-se-sm' : ''} ${
                isPending ? 'rounded-se-sm' : ''
              } ${isToday && !selected && !isPending ? 'ring-1 ring-inset ring-se-blue' : ''}`}
            >
              {Number(iso.slice(-2))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Calendrier de plage réutilisable (publication, etc.) ────── */
/**
 * Un ou deux mois, flèches de navigation, clic début puis clic fin.
 * `onChange` reçoit la plage complète (début = fin quand un seul jour).
 */
export function RangeCalendar({
  value,
  onChange,
  today,
  months = 1,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  today: string;
  months?: 1 | 2;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(() => {
    const d = parseISO(value.from);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const shift = (n: number) =>
    setAnchor(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));

  const pick = (iso: string) => {
    if (pending === null) {
      setPending(iso);
      onChange({ from: iso, to: iso });
      return;
    }
    onChange({ from: iso < pending ? iso : pending, to: iso < pending ? pending : iso });
    setPending(null);
  };

  return (
    <div className="rounded-se border border-se-line bg-se-surface p-3">
      <div className="flex items-center justify-between mb-1">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Mois précédent"
          className="w-8 h-8 grid place-items-center rounded-se-sm border border-se-line text-se-muted hover:text-se-ink hover:bg-se-surface-2"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <p className="text-xs text-se-muted">
          {pending ? 'Cliquez le dernier jour.' : 'Cliquez le premier jour, puis le dernier.'}
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Mois suivant"
          className="w-8 h-8 grid place-items-center rounded-se-sm border border-se-line text-se-muted hover:text-se-ink hover:bg-se-surface-2"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-6 justify-center">
        <Month y={anchor.y} m={anchor.m} today={today} range={value} pending={pending} onPick={pick} />
        {months === 2 && (
          <Month
            y={anchor.y + Math.floor((anchor.m + 1) / 12)}
            m={(anchor.m + 1) % 12}
            today={today}
            range={value}
            pending={pending}
            onPick={pick}
          />
        )}
      </div>
    </div>
  );
}
