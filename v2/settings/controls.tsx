/**
 * Petits contrôles partagés par les panneaux de Réglages : interrupteur,
 * choix des jours de la semaine, compteur − n +, et une ligne « libellé + aide ».
 */
import type { ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { DAY_ORDER, DAY_SHORT, DAY_LONG } from '@/stores/v2SettingsStore';

/* ── Interrupteur ──────────────────────────────────────────── */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-se-blue' : 'bg-se-line'}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

/* ── Jours de la semaine (L M M J V S D) ───────────────────── */
export function DayPicker({
  value,
  onChange,
  tone = 'blue',
  size = 'md',
}: {
  value: number[];
  onChange: (days: number[]) => void;
  /** bleu = jours travaillés/attendus · gris = repos */
  tone?: 'blue' | 'ink';
  size?: 'sm' | 'md';
}) {
  const toggle = (d: number) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d]);
  const on = tone === 'blue' ? 'bg-se-blue text-white border-se-blue' : 'bg-se-ink text-white border-se-ink';
  const dim = size === 'sm' ? 'w-6 h-6 text-[11px]' : 'w-7 h-7 text-xs';
  return (
    <div className="inline-flex gap-1" role="group">
      {DAY_ORDER.map((d) => {
        const active = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={active}
            aria-label={DAY_LONG[d]}
            title={DAY_LONG[d]}
            onClick={() => toggle(d)}
            className={`${dim} rounded-full border font-bold transition-colors ${
              active ? on : 'bg-se-surface text-se-muted border-se-line hover:border-se-muted'
            }`}
          >
            {DAY_SHORT[d]}
          </button>
        );
      })}
    </div>
  );
}

/* ── Compteur − n + ────────────────────────────────────────── */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 20,
  suffix,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  label: string;
}) {
  const btn =
    'w-7 h-7 grid place-items-center rounded-full border border-se-line text-se-ink hover:bg-se-surface-2 disabled:opacity-30';
  return (
    <div className="inline-flex items-center gap-1.5" aria-label={label}>
      <button
        type="button"
        aria-label="Moins"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className={btn}
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="min-w-[2.5rem] text-center text-sm font-bold text-se-ink tabular-nums">
        {value}
        {suffix && <span className="font-normal text-se-muted"> {suffix}</span>}
      </span>
      <button
        type="button"
        aria-label="Plus"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={btn}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ── Ligne de réglage : libellé + aide à gauche, contrôle à droite ── */
export function SettingRow({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-se-line last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-se-ink">{label}</p>
        {hint && <p className="text-xs text-se-muted mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Deux ou trois choix côte à côte, un seul actif. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <div className="inline-flex p-1 rounded-se-sm bg-se-surface-2 border border-se-line">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 rounded-[7px] text-sm font-semibold transition-colors ${
            value === o.key ? 'bg-se-surface text-se-ink shadow-se' : 'text-se-muted hover:text-se-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const inputCls =
  'h-9 rounded-se-sm border border-se-line bg-se-surface px-3 text-sm text-se-ink focus:outline-none focus:border-se-blue';
