/**
 * Cascade par paliers d'urgence — qui voit la mission, et quand, selon le
 * temps qu'il reste entre la publication et le DÉBUT du shift :
 *   · confort (publiée plus de `comfortFrom` h avant) : salariés seuls pendant
 *     `salariesHours` h, puis extras pendant `extrasHours` h, puis
 *     auto-entrepreneurs — qui la voient de toute façon au plus tard
 *     `freelanceLatest` h avant le début ;
 *   · serré (entre `tightFrom` et `comfortFrom` h) : tout le personnel en même
 *     temps, auto-entrepreneurs `tightFreelanceAfter` h après ;
 *   · urgence (moins de `tightFrom` h) : tout le monde en même temps, salariés
 *     prioritaires si plusieurs se proposent ; sous `boostUnder` h, boost proposé.
 * Tout se calcule ici, en heures après la publication ; les écrans n'ont qu'à
 * afficher. Les étapes passées sautent : publiée tard, la mission part à tous.
 */
import type { CascadeSettings } from '@/stores/v2SettingsStore';
import { MOCK_NOW } from '@/mocks/v2Today';

export type CascadeRegime = 'confort' | 'serre' | 'urgence';
export type CascadeWho = 'salaries' | 'extras' | 'personnel' | 'freelances' | 'tous';

export interface CascadeStep {
  who: CascadeWho;
  /** heures après la publication */
  fromH: number;
  toH: number;
}

export interface CascadePlan {
  regime: CascadeRegime;
  hoursUntil: number;
  steps: CascadeStep[];
  /** heures après la publication où les auto-entrepreneurs voient la mission (0 = tout de suite) */
  freelancesAtH: number;
  /** salariés prioritaires si plusieurs se proposent (régime urgence) */
  staffPriority: boolean;
  /** boost proposé d'office (shift imminent) */
  boost: boolean;
}

export const regimeLabel: Record<CascadeRegime, string> = {
  confort: 'Confort',
  serre: 'Serré',
  urgence: 'Urgence',
};

export const whoLabel: Record<CascadeWho, string> = {
  salaries: 'Mes salariés',
  extras: 'Mes extras',
  personnel: 'Tout mon personnel',
  freelances: 'Auto-entrepreneurs',
  tous: 'Tout le monde',
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function regimeFor(s: CascadeSettings, hoursUntil: number): CascadeRegime {
  if (hoursUntil > s.comfortFrom) return 'confort';
  if (hoursUntil > s.tightFrom) return 'serre';
  return 'urgence';
}

/** Le plan de cascade d'une mission publiée `hoursUntil` h avant son début. */
export function cascadePlan(s: CascadeSettings, hoursUntil: number): CascadePlan {
  const h = Math.max(hoursUntil, 0);
  const regime = regimeFor(s, h);
  const steps: CascadeStep[] = [];
  if (regime === 'confort') {
    // Plancher : les auto-entrepreneurs voient la mission au plus tard X h avant le début.
    const freelancesAt = r1(Math.min(s.salariesHours + s.extrasHours, Math.max(h - s.freelanceLatest, 0)));
    const salariesEnd = r1(Math.min(s.salariesHours, freelancesAt));
    if (salariesEnd > 0) steps.push({ who: 'salaries', fromH: 0, toH: salariesEnd });
    if (freelancesAt > salariesEnd) steps.push({ who: 'extras', fromH: salariesEnd, toH: freelancesAt });
    steps.push({ who: 'freelances', fromH: freelancesAt, toH: h });
    return { regime, hoursUntil: h, steps, freelancesAtH: freelancesAt, staffPriority: false, boost: false };
  }
  if (regime === 'serre') {
    const freelancesAt = r1(Math.min(s.tightFreelanceAfter, h));
    if (freelancesAt > 0) steps.push({ who: 'personnel', fromH: 0, toH: freelancesAt });
    steps.push({ who: 'freelances', fromH: freelancesAt, toH: h });
    return { regime, hoursUntil: h, steps, freelancesAtH: freelancesAt, staffPriority: false, boost: false };
  }
  steps.push({ who: 'tous', fromH: 0, toH: h });
  return { regime, hoursUntil: h, steps, freelancesAtH: 0, staffPriority: true, boost: h < s.boostUnder };
}

/** « 24 h », « 1 h 30 », « 45 min », « 3 j ». */
export function durationLabel(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours >= 48 && Number.isInteger(hours / 24)) return `${hours / 24} j`;
  const whole = Math.floor(hours);
  const min = Math.round((hours - whole) * 60);
  return min === 0 ? `${whole} h` : `${whole} h ${String(min).padStart(2, '0')}`;
}

const parseNow = (iso: string): Date => {
  const [d, t] = iso.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return new Date(y, m - 1, day, hh, mm);
};

/** « aujourd'hui 14:00 », « demain 10:00 », « jeu. 5 nov. 08:00 » — n heures après maintenant. */
export function atLabel(hoursFromNow: number, now: string = MOCK_NOW): string {
  const base = parseNow(now);
  const d = new Date(base.getTime() + hoursFromNow * 36e5);
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(base).setHours(0, 0, 0, 0)) / 864e5);
  if (days === 0) return `aujourd'hui ${time}`;
  if (days === 1) return `demain ${time}`;
  return `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

/** Une phrase courte pour une carte ou une liste (« Salariés 24 h → extras 12 h → auto-entrepreneurs »). */
export function planShort(p: CascadePlan): string {
  if (p.regime === 'urgence')
    return `Shift dans ${durationLabel(p.hoursUntil)} : tout le monde en même temps, salariés prioritaires${p.boost ? ', boost proposé' : ''}`;
  if (p.regime === 'serre')
    return `Shift dans ${durationLabel(p.hoursUntil)} : tout le personnel, puis auto-entrepreneurs ${durationLabel(p.freelancesAtH)} après`;
  return p.steps
    .map((st) =>
      st.who === 'freelances'
        ? 'auto-entrepreneurs'
        : `${whoLabel[st.who].replace('Mes ', '')} ${durationLabel(st.toH - st.fromH)}`,
    )
    .join(' → ');
}

/** La phrase complète, avec les heures réelles (historique, résumé des Réglages). */
export function planSummary(p: CascadePlan, now: string = MOCK_NOW): string {
  if (p.regime === 'urgence')
    return `Palier urgence (shift dans ${durationLabel(p.hoursUntil)}) : salariés, extras et auto-entrepreneurs prévenus en même temps, vos salariés prioritaires${p.boost ? ' · boost proposé' : ''}`;
  if (p.regime === 'serre')
    return `Palier serré (shift dans ${durationLabel(p.hoursUntil)}) : tout votre personnel tout de suite, auto-entrepreneurs ${atLabel(p.freelancesAtH, now)}`;
  const parts = p.steps.map((st) =>
    st.who === 'freelances'
      ? `auto-entrepreneurs ${atLabel(st.fromH, now)}`
      : `${whoLabel[st.who].toLowerCase()} jusqu'à ${atLabel(st.toH, now)}`,
  );
  return `Palier confort : ${parts.join(', ')}`;
}
