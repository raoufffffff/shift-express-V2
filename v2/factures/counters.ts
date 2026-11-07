/**
 * Compteurs de paie — ce que le gestionnaire regarde avant d'envoyer la paie,
 * par personne et par période :
 *   · heures faites (placements fermes, tous établissements) face au contrat ;
 *   · heures supplémentaires : semaine par semaine, tout ce qui dépasse les
 *     heures hebdo du contrat (le droit du travail compte les heures sup à la
 *     semaine, pas au mois) ; les extras n'ont pas de contrat hebdo → pas de sup ;
 *   · absences de la période, par motif, en jours ouvrés pour la personne
 *     (ses jours de repos ne comptent pas) ;
 *   · congés payés : 25 jours acquis par an (du 1er juin), moins les jours pris.
 * Rien n'est écrit ici ; l'export paie (export.ts) reprend ces lignes telles quelles.
 */
import type { Mission } from '@/mocks/v2Missions';
import type { Absence, AbsenceReason } from '@/stores/v2PeopleStore';
import type { PoolRule, StaffRule } from '@/stores/v2SettingsStore';
import { effPlaced, isLive } from '../mission/missionStore';
import { addDays, missionHours, parseISO } from '../time';
import { weekStartOf } from '../planning/weekPlan';
import type { DateRange } from './PeriodPicker';

/** Jours de congés payés acquis par an (base légale : 2,5 j par mois, 30 j ouvrables ≈ 25 j ouvrés). */
export const LEAVE_DAYS_PER_YEAR = 25;
/** Majoration des heures supplémentaires (25 % pour les 8 premières, simplifié ici). */
export const OVERTIME_RATE = 1.25;

export interface WeekCounter {
  /** lundi ISO */
  weekStart: string;
  hours: number;
  /** heures du contrat sur la semaine (0 pour un extra) */
  contract: number;
  overtime: number;
}

export interface Counter {
  id: string;
  name: string;
  kind: 'salarie' | 'extra';
  contract: string;
  hourlyRate: number;
  /** heures hebdo du contrat (0 pour un extra) */
  weeklyHours: number;
  /** heures fermes dans la période */
  hours: number;
  /** heures du contrat sur la période, au prorata des jours (35 h × 31 j / 7 = 155 h pour un mois de 31 j) */
  contractHours: number;
  overtime: number;
  /** heures payées au taux normal */
  normalHours: number;
  /** brut estimé : normales × taux + sup × taux × 1,25 */
  gross: number;
  /** jours d'absence dans la période, par motif */
  absences: Partial<Record<AbsenceReason, number>>;
  /** congés payés pris depuis le 1er juin, et ce qu'il reste */
  leaveTaken: number;
  leaveLeft: number;
  weeks: WeekCounter[];
}

interface Input {
  range: DateRange;
  today: string;
  staff: StaffRule[];
  pool: PoolRule[];
  absences: Absence[];
  missions: Mission[];
}

const round1 = (h: number) => Math.round(h * 10) / 10;

/** 1er juin de l'année de référence des congés en cours. */
export function leaveYearStart(today: string): string {
  const d = parseISO(today);
  const y = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-06-01`;
}

/** Les jours ISO d'une plage, dans l'ordre. */
function daysOf(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Jours d'absence d'une personne entre deux dates, hors ses jours de repos, par motif. */
function absenceDays(
  absences: Absence[],
  name: string,
  from: string,
  to: string,
  restDays: number[],
): Partial<Record<AbsenceReason, number>> {
  const out: Partial<Record<AbsenceReason, number>> = {};
  absences
    .filter((a) => a.name === name && a.to >= from && a.from <= to)
    .forEach((a) => {
      const n = daysOf(a.from < from ? from : a.from, a.to > to ? to : a.to).filter(
        (d) => !restDays.includes(parseISO(d).getDay()),
      ).length;
      if (n > 0) out[a.reason] = (out[a.reason] ?? 0) + n;
    });
  return out;
}

/** Les compteurs de la période, salariés d'abord puis extras, par nom. */
export function buildCounters(input: Input): Counter[] {
  const { range, today, staff, pool, absences, missions } = input;
  const live = missions.filter(isLive);
  // Les semaines (lun → dim) qui touchent la période.
  const weekStarts: string[] = [];
  for (let w = weekStartOf(range.from); w <= range.to; w = addDays(w, 7)) weekStarts.push(w);
  const hoursOf = (name: string, from: string, to: string) =>
    live
      .filter((m) => m.date >= from && m.date <= to)
      .filter((m) => effPlaced(m).some((p) => p.name === name && !p.suggested))
      .reduce((s, m) => s + missionHours(m), 0);

  const one = (
    base: { id: string; name: string; kind: 'salarie' | 'extra'; contract: string; hourlyRate: number },
    weeklyHours: number,
    restDays: number[],
  ): Counter => {
    const weeks: WeekCounter[] = weekStarts.map((weekStart) => {
      const hours = round1(hoursOf(base.name, weekStart, addDays(weekStart, 6)));
      return { weekStart, hours, contract: weeklyHours, overtime: round1(Math.max(hours - weeklyHours, 0)) };
    });
    const hours = round1(hoursOf(base.name, range.from, range.to));
    // Heures du contrat sur la période : au prorata des jours (35 h × 31 j / 7 = 155 h pour octobre).
    const days = daysOf(range.from, range.to).length;
    const overtime = round1(weeks.reduce((s, w) => s + w.overtime, 0));
    const normalHours = round1(Math.max(hours - overtime, 0));
    const gross = Math.round(normalHours * base.hourlyRate + overtime * base.hourlyRate * OVERTIME_RATE);
    const leaveTaken = absenceDays(absences, base.name, leaveYearStart(today), range.to, restDays)['Congés payés'] ?? 0;
    return {
      ...base,
      weeklyHours,
      hours,
      contractHours: round1((weeklyHours * days) / 7),
      overtime,
      normalHours,
      gross,
      absences: absenceDays(absences, base.name, range.from, range.to, restDays),
      leaveTaken,
      leaveLeft: base.kind === 'salarie' ? LEAVE_DAYS_PER_YEAR - leaveTaken : 0,
      weeks,
    };
  };

  const salaries = staff.map((r) =>
    one(
      { id: r.personId, name: r.name, kind: 'salarie', contract: r.contract, hourlyRate: r.hourlyRate },
      r.weeklyHours,
      r.restDays,
    ),
  );
  const extras = pool.map((r) =>
    one(
      {
        id: r.personId,
        name: r.name,
        kind: 'extra',
        contract: r.contract === 'Intérim' && r.agency ? `Intérim · ${r.agency}` : r.contract,
        hourlyRate: r.hourlyRate,
      },
      0,
      [],
    ),
  );
  const byName = (a: Counter, b: Counter) => a.name.localeCompare(b.name);
  return [...salaries.sort(byName), ...extras.sort(byName)];
}

/** « 5 j de congés payés · 2 j maladie » */
export function absencesPhrase(a: Counter['absences']): string {
  return (Object.entries(a) as [AbsenceReason, number][])
    .filter(([, n]) => n > 0)
    .map(([reason, n]) => `${n} j ${reason === 'Congés payés' ? 'de congés payés' : reason.toLowerCase()}`)
    .join(' · ');
}
