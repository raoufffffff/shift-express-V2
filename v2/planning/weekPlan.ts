/**
 * Le plan de semaine — ce qu'Optimiser propose, calculé à part pour être relu :
 *   0. les créneaux attendus (Réglages › Postes) sans mission dessus → à créer ;
 *   1. les HORAIRES DU CONTRAT des fixes (semaine type de chacun) : la personne
 *      est posée sur son créneau, ce jour-là, sauf congés ou règle de repos ;
 *   2. les FIXES programmés automatiquement, qui tiennent le poste, ni en repos
 *      ni en congés, pas déjà pris ce jour-là, dont les heures hebdo du contrat
 *      ne seraient pas dépassées et dont les règles de repos sont respectées ;
 *      d'abord ceux dont c'est le créneau habituel (Matin, Soir…), puis ceux
 *      qui ont le moins d'heures cette semaine, pour répartir équitablement ;
 *   3. le bassin de talents (CDD d'usage, intérim) pour ce qui reste.
 * Les règles de repos (Réglages › Personnel) : 11 h entre deux journées, 6 jours
 * d'affilée au plus, 2 jours de repos par semaine, 13 h d'amplitude par jour.
 * Rien n'est écrit ici : la fenêtre Optimiser applique le plan une fois relu
 * (le préremplissage des horaires du contrat, lui, est dans contractFill.ts).
 */
import type { Mission, PersonKind } from '@/mocks/v2Missions';
import { people } from '@/mocks/v2People';
import type { PersonStatus } from '@/mocks/v2People';
import type { Absence } from '@/stores/v2PeopleStore';
import type { ContractShift, PoolRule, PosteNeed, RestRules, StaffRule } from '@/stores/v2SettingsStore';
import {
  againstWish,
  contractShiftsOn,
  isClosedDay,
  needsFor,
  slotIndexOf,
  slotsOn,
  uncoveredSlots,
} from '@/stores/v2SettingsStore';
import { offLabel, offReason } from '../people/availability';
import { effPlaced, effRequired, isLive } from '../mission/missionStore';
import { addDays, minutesBetween, missionHours, parseISO, toISO } from '../time';

export interface Candidate {
  id: string;
  name: string;
  kind: PersonKind;
  /** bassin de talents : CDD d'usage, intérim (+ agence) */
  contract?: string;
  /** placé·e parce que c'est dans ses horaires du contrat */
  fixed?: boolean;
  /** placé·e contre un souhait (« évite le dimanche ») : en dernier recours */
  wish?: string;
}

export interface Plan {
  mission: Mission;
  /** créneau attendu (Réglages) sans mission : à créer, la mission est virtuelle */
  create: boolean;
  /** nom du créneau (Service, Matin, Soir…) quand on le connaît */
  slotLabel?: string;
  missing: number;
  /** fixes proposés (dans la limite des places) */
  salaries: Candidate[];
  /** renforts proposés pour ce qui reste */
  extras: Candidate[];
  /** fixes du poste écartés parce qu'en repos ou absents ce jour-là */
  resting: string[];
  /** fixes du poste écartés parce que leurs heures hebdo seraient dépassées */
  overHours: string[];
  /** fixes du poste écartés par une règle de repos (11 h, 6 jours d'affilée…) */
  restRule: string[];
}

/** Une personne fixe et sa semaine : heures déjà placées, heures proposées, plafond du contrat. */
export interface StaffWeek {
  id: string;
  name: string;
  /** heures fermes déjà au planning sur la semaine */
  before: number;
  /** heures que ce plan ajoute */
  added: number;
  /** heures hebdo du contrat */
  cap: number;
  autoSchedule: boolean;
  /** créneaux de la semaine, existants et proposés, dans l'ordre des jours */
  shifts: {
    date: string;
    poste: string;
    label?: string;
    start: string;
    end: string;
    planned: boolean;
    /** créneau des horaires du contrat */
    fixed?: boolean;
  }[];
}

/** Un créneau travaillé : ce qu'il faut pour vérifier les règles de repos. */
export interface Shift {
  date: string;
  start: string;
  end: string;
}

/** Lundi de la semaine qui contient ce jour. */
export const weekStartOf = (iso: string): string => {
  const d = parseISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
};
const inWeek = (date: string, weekStart: string) => date >= weekStart && date <= addDays(weekStart, 6);

/** Missions vivantes où la personne est placée pour de bon (pas une simple suggestion). */
const firmFor = (missions: Mission[], name: string) =>
  missions.filter((m) => isLive(m) && effPlaced(m).some((p) => p.name === name && !p.suggested));

/** Créneaux fermes d'une personne, toutes dates confondues (pour les règles de repos). */
export function shiftsOf(allMissions: Mission[], name: string): Shift[] {
  return firmFor(allMissions, name).map((m) => ({ date: m.date, start: m.start, end: m.end }));
}

/** Heures fermes déjà placées d'une personne sur la semaine (lun → dim). */
export function hoursPlacedInWeek(allMissions: Mission[], name: string, weekStart: string): number {
  return firmFor(allMissions, name)
    .filter((m) => inWeek(m.date, weekStart))
    .reduce((s, m) => s + missionHours(m), 0);
}

/* ── Règles de repos ───────────────────────────────────────── */
const fmtDay = (iso: string) => parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
const fmtH = (mins: number) => `${Math.round((mins / 60) * 10) / 10} h`;
/** Minutes absolues [début, fin] d'un créneau (la fin passe au lendemain si elle précède le début). */
function absSpan(s: Shift): [number, number] {
  const [h, m] = s.start.split(':').map(Number);
  const a = Math.round(parseISO(s.date).getTime() / 60000) + h * 60 + m;
  return [a, a + minutesBetween(s.start, s.end)];
}

/**
 * Ce qu'enfreindrait ce créneau pour une personne qui a déjà `shifts`, en mots
 * simples (« repos de 7 h seulement entre jeu. 30 et ven. 31 »), ou null.
 */
export function restIssue(shifts: Shift[], cand: Shift, rules: RestRules): string | null {
  const [cs, ce] = absSpan(cand);
  const others = shifts.filter((s) => !(s.date === cand.date && s.start === cand.start && s.end === cand.end));
  // Déjà pris à cette heure-là.
  for (const s of others) {
    const [a, b] = absSpan(s);
    if (a < ce && cs < b) return `déjà pris·e ${fmtDay(cand.date)} ${s.start}–${s.end}`;
  }
  // Repos quotidien entre deux journées de travail.
  const minRest = rules.minRestHours * 60;
  for (const s of others.filter((x) => x.date !== cand.date)) {
    const [a, b] = absSpan(s);
    const gap = b <= cs ? cs - b : a - ce;
    if (gap < minRest) {
      const [first, second] = b <= cs ? [s.date, cand.date] : [cand.date, s.date];
      return `repos de ${fmtH(gap)} seulement entre ${fmtDay(first)} et ${fmtDay(second)} (${rules.minRestHours} h exigées)`;
    }
  }
  // Amplitude de la journée : du premier début à la dernière fin.
  const sameDay = [...others.filter((x) => x.date === cand.date), cand].map(absSpan);
  const span = Math.max(...sameDay.map((x) => x[1])) - Math.min(...sameDay.map((x) => x[0]));
  if (span > rules.maxDailySpanHours * 60) {
    return `amplitude de ${fmtH(span)} ${fmtDay(cand.date)} (${rules.maxDailySpanHours} h au plus)`;
  }
  // Jours d'affilée et jours de repos de la semaine.
  const worked = new Set([...others.map((x) => x.date), cand.date]);
  let run = 1;
  for (let d = addDays(cand.date, -1); worked.has(d); d = addDays(d, -1)) run += 1;
  for (let d = addDays(cand.date, 1); worked.has(d); d = addDays(d, 1)) run += 1;
  if (run > rules.maxConsecutiveDays) return `${run}e jour d'affilée (${rules.maxConsecutiveDays} au plus)`;
  const ws = weekStartOf(cand.date);
  const daysThisWeek = Array.from(worked).filter((d) => inWeek(d, ws)).length;
  if (daysThisWeek > 7 - rules.restDaysPerWeek) {
    return `${daysThisWeek}e jour de la semaine (${rules.restDaysPerWeek} jours de repos exigés)`;
  }
  return null;
}

/** Écarts aux règles de repos déjà au planning d'une personne, sur une semaine. */
export function restIssues(allMissions: Mission[], name: string, weekStart: string, rules: RestRules): string[] {
  const shifts = shiftsOf(allMissions, name);
  const out = new Set<string>();
  shifts
    .filter((s) => inWeek(s.date, weekStart))
    .forEach((s) => {
      const issue = restIssue(
        shifts.filter((x) => x !== s),
        s,
        rules,
      );
      if (issue) out.add(issue);
    });
  return Array.from(out);
}

/** Une mission est-elle l'un des créneaux du contrat de la personne ? */
export function isContractShift(rule: StaffRule, m: { poste: string; date: string; start: string }): boolean {
  return contractShiftsOn(rule, parseISO(m.date).getDay()).some((c) => c.poste === m.poste && c.start === m.start);
}

/* ── Le plan ───────────────────────────────────────────────── */
interface Input {
  /** missions visibles (filtrées par établissement), existantes à compléter */
  missions: Mission[];
  /** toutes les missions : les heures d'une personne se comptent sur tous les établissements */
  allMissions: Mission[];
  dates: string[];
  today: string;
  needs: PosteNeed[];
  /** établissement des créneaux à créer */
  establishment: string;
  staff: StaffRule[];
  pool: PoolRule[];
  statuses: Record<string, PersonStatus | undefined>;
  absences: Absence[];
  restRules: RestRules;
}

interface Target {
  m: Mission;
  create: boolean;
  slotLabel?: string;
  missing: number;
  salaries: Candidate[];
}

const round1 = (h: number) => Math.round(h * 10) / 10;

/** Mission virtuelle d'un créneau à créer. */
const virtual = (
  establishment: string,
  date: string,
  poste: string,
  slot: { label: string; start: string; end: string; count: number },
): Target => ({
  create: true,
  slotLabel: slot.label,
  missing: slot.count,
  salaries: [],
  m: {
    id: `new:${date}:${poste}:${slot.start}`,
    poste,
    establishment,
    date,
    start: slot.start,
    end: slot.end,
    required: slot.count,
    system: 'employe',
    coverage: 'shortage',
    placed: [],
    candidates: [],
    estimatedCost: 0,
  } as Mission,
});

export function buildWeekPlan(input: Input): { plans: Plan[]; staffWeek: StaffWeek[] } {
  const { missions, allMissions, dates, today, needs, establishment, staff, pool, statuses, absences, restRules } =
    input;
  const live = missions.filter(isLive);

  // Missions existantes où il manque du monde.
  const targets: Target[] = missions
    .filter((m) => dates.includes(m.date))
    .filter((m) => m.coverage !== 'freelance_validated')
    .map((m) => ({
      m,
      create: false,
      slotLabel: labelOf(m, needs),
      missing: effRequired(m) - effPlaced(m).filter((p) => !p.suggested).length,
      salaries: [],
    }))
    .filter((x) => x.missing > 0);
  // Créneaux attendus d'après les Réglages, sans mission dessus ce jour-là : on les crée.
  dates
    .filter((date) => date >= today)
    .forEach((date) =>
      uncoveredSlots(needs, date, live).forEach(({ poste, slot }) =>
        targets.push(virtual(establishment, date, poste, slot)),
      ),
    );

  // Ce que chacun a déjà (placements fermes, tous établissements) + ce que ce plan ajoute.
  const known = new Map<string, Shift[]>();
  const shiftsKnown = (name: string) => known.get(name) ?? [];
  const take = (name: string, s: Shift) => known.set(name, [...shiftsKnown(name), s]);
  allMissions.filter(isLive).forEach((m) =>
    effPlaced(m).forEach((p) => {
      if (!p.suggested) take(p.name, { date: m.date, start: m.start, end: m.end });
    }),
  );
  const isBusy = (date: string, name: string) => shiftsKnown(name).some((s) => s.date === date);

  // Heures ajoutées par ce plan, par semaine et par personne (le plafond du contrat se lit par semaine).
  const addedHours = new Map<string, number>();
  const hoursKey = (date: string, name: string) => `${weekStartOf(date)}:${name}`;
  const hoursSoFar = (date: string, name: string) =>
    hoursPlacedInWeek(allMissions, name, weekStartOf(date)) + (addedHours.get(hoursKey(date, name)) ?? 0);
  const planned: Record<string, StaffWeek['shifts']> = {};
  const place = (t: Target, r: StaffRule, fixed: boolean) => {
    // Les horaires du contrat priment sur les souhaits ; ailleurs on dit quand on va contre.
    const wish = fixed ? null : againstWish(r, t.m.date);
    t.salaries.push({
      id: r.personId,
      name: r.name,
      kind: 'salarie',
      fixed: fixed || undefined,
      wish: wish ?? undefined,
    });
    take(r.name, { date: t.m.date, start: t.m.start, end: t.m.end });
    const k = hoursKey(t.m.date, r.name);
    addedHours.set(k, (addedHours.get(k) ?? 0) + missionHours(t.m));
    (planned[r.name] ??= []).push({
      date: t.m.date,
      poste: t.m.poste,
      label: t.slotLabel,
      start: t.m.start,
      end: t.m.end,
      planned: true,
      fixed,
    });
  };
  const off = (r: { personId: string; name: string }, date: string) =>
    offReason(staff, absences, { id: r.personId, name: r.name, kind: 'salarie' }, date);
  const active = staff.filter((r) => r.autoSchedule !== false && statuses[r.personId] !== 'bloque');
  // Motifs d'exclusion collectés par mission, pour les afficher.
  const why = new Map<string, { resting: string[]; overHours: string[]; restRule: string[] }>();
  const whyOf = (id: string) => why.get(id) ?? why.set(id, { resting: [], overHours: [], restRule: [] }).get(id)!;

  // ── 1. Horaires du contrat : chacun sur son créneau, ce jour-là (jamais un jour fermé) ──
  dates
    .filter((date) => date >= today && !isClosedDay(date))
    .forEach((date) => {
      const weekday = parseISO(date).getDay();
      active.forEach((r) =>
        contractShiftsOn(r, weekday).forEach((c) => {
          const t = contractTarget(c, date, targets, live, needs, establishment);
          if (!t) return; // créneau complet, ou la personne y est déjà
          if (t.salaries.some((x) => x.name === r.name)) return;
          const reason = off(r, date);
          if (reason) return whyOf(t.m.id).resting.push(`${r.name} (${offLabel(reason)})`);
          const issue = restIssue(shiftsKnown(r.name), { date, start: t.m.start, end: t.m.end }, restRules);
          if (issue) return whyOf(t.m.id).restRule.push(`${r.name} : ${issue}`);
          if (hoursSoFar(date, r.name) + missionHours(t.m) > r.weeklyHours) {
            return whyOf(t.m.id).overHours.push(
              `${r.name} (${round1(hoursSoFar(date, r.name))} h / ${r.weeklyHours} h)`,
            );
          }
          place(t, r, true);
        }),
      );
    });

  targets.sort((a, b) => a.m.date.localeCompare(b.m.date) || a.m.start.localeCompare(b.m.start));

  const plans: Plan[] = targets.map((t) => {
    const { m, create, missing, slotLabel } = t;
    const hours = missionHours(m);
    const w = whyOf(m.id);
    // ── 2. Fixes programmés automatiquement, qui tiennent le poste ──
    const eligible = active.filter((r) => r.postes.includes(m.poste) && !t.salaries.some((x) => x.name === r.name));
    eligible
      .map((r) => ({ name: r.name, why: off(r, m.date) }))
      .filter((x) => x.why !== null)
      .forEach((x) => w.resting.push(`${x.name} (${offLabel(x.why!)})`));
    const free = eligible.filter((r) => off(r, m.date) === null && !isBusy(m.date, r.name));
    // Heures hebdo : on ne place pas au-delà du contrat.
    free
      .filter((r) => hoursSoFar(m.date, r.name) + hours > r.weeklyHours)
      .forEach((r) => w.overHours.push(`${r.name} (${round1(hoursSoFar(m.date, r.name))} h / ${r.weeklyHours} h)`));
    // Règles de repos : 11 h entre deux journées, jours d'affilée, repos de la semaine.
    const rested = free
      .filter((r) => hoursSoFar(m.date, r.name) + hours <= r.weeklyHours)
      .filter((r) => {
        const issue = restIssue(shiftsKnown(r.name), { date: m.date, start: m.start, end: m.end }, restRules);
        if (issue) w.restRule.push(`${r.name} : ${issue}`);
        return !issue;
      });
    // D'abord le créneau habituel et ceux qui veulent plus d'heures, en dernier ceux qui
    // évitent ce jour-là ou veulent moins d'heures, puis le moins d'heures cette semaine.
    const pref = (r: StaffRule) =>
      (r.slots?.length ? (slotLabel && r.slots.includes(slotLabel) ? 2 : 0) : 1) +
      (r.wishes?.hours === 'plus' ? 1 : r.wishes?.hours === 'moins' ? -1 : 0) +
      (againstWish(r, m.date) ? -4 : 0);
    rested
      .sort(
        (a, b) =>
          pref(b) - pref(a) || hoursSoFar(m.date, a.name) - hoursSoFar(m.date, b.name) || a.name.localeCompare(b.name),
      )
      .forEach((r) => {
        if (t.salaries.length >= missing) return;
        place(t, r, false);
      });
    // ── 3. Puis le bassin de talents (CDD d'usage, intérim) : Réglages › Personnel ──
    const extras: Candidate[] = [];
    pool
      .filter((r) => r.postes.includes(m.poste))
      .filter((r) => (statuses[r.personId] ?? people.find((p) => p.id === r.personId)?.status) !== 'bloque')
      .filter((r) => offReason(staff, absences, { id: r.personId, name: r.name, kind: 'extra' }, m.date) === null)
      .filter((r) => !isBusy(m.date, r.name))
      .sort((a, b) => Number(!!againstWish(a, m.date)) - Number(!!againstWish(b, m.date)))
      .forEach((r) => {
        if (t.salaries.length + extras.length >= missing) return;
        extras.push({
          id: r.personId,
          name: r.name,
          kind: 'extra',
          contract: r.contract === 'Intérim' && r.agency ? `Intérim · ${r.agency}` : r.contract,
          wish: againstWish(r, m.date) ?? undefined,
        });
        take(r.name, { date: m.date, start: m.start, end: m.end });
      });
    return {
      mission: m,
      create,
      slotLabel,
      missing,
      salaries: t.salaries,
      extras,
      // Une personne peut avoir été écartée deux fois (horaires du contrat, puis placement libre) : une seule ligne.
      resting: Array.from(new Set(w.resting)),
      overHours: Array.from(new Set(w.overHours)),
      restRule: Array.from(new Set(w.restRule)),
    };
  });

  // La semaine de chaque fixe : ce qui est déjà au planning + ce que le plan ajoute.
  const weekStart = weekStartOf(dates[0] ?? today);
  const staffWeek: StaffWeek[] = staff.map((r) => {
    const existingShifts = firmFor(allMissions, r.name)
      .filter((m) => inWeek(m.date, weekStart))
      .map((m) => ({
        date: m.date,
        poste: m.poste,
        label: labelOf(m, needs),
        start: m.start,
        end: m.end,
        planned: false,
        fixed: isContractShift(r, m),
      }));
    const shifts = [...existingShifts, ...(planned[r.name] ?? []).filter((x) => inWeek(x.date, weekStart))].sort(
      (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
    );
    return {
      id: r.personId,
      name: r.name,
      before: round1(existingShifts.reduce((s, x) => s + missionHours(x), 0)),
      added: round1(shifts.filter((x) => x.planned).reduce((s, x) => s + missionHours(x), 0)),
      cap: r.weeklyHours,
      autoSchedule: r.autoSchedule !== false,
      shifts,
    };
  });

  return { plans, staffWeek };
}

/**
 * La mission qui porte un créneau du contrat ce jour-là : celle qui couvre ce
 * créneau du poste (existante, si elle a de la place), sinon le créneau attendu
 * à créer, sinon une mission à créer aux horaires du contrat (le poste n'est pas
 * attendu ce jour-là d'après les Réglages, mais le contrat le dit).
 */
function contractTarget(
  c: ContractShift,
  date: string,
  targets: Target[],
  live: Mission[],
  needs: PosteNeed[],
  establishment: string,
): Target | null {
  const need = needsFor(needs, date).find((n) => n.poste === c.poste);
  const slots = need ? slotsOn(need, parseISO(date).getDay()) : [];
  const idx = slots.findIndex((sl) => sl.label === c.label);
  const dayMissions = live.filter((m) => m.date === date && m.poste === c.poste);
  const covering =
    idx >= 0
      ? dayMissions.find((m) => slotIndexOf(m, slots) === idx)
      : dayMissions.find((m) => m.start === c.start && m.end === c.end);
  if (covering) return targets.find((t) => t.m.id === covering.id) ?? null;
  const slot = idx >= 0 ? slots[idx] : { label: c.label, start: c.start, end: c.end, count: 1 };
  const id = `new:${date}:${c.poste}:${slot.start}`;
  const found = targets.find((t) => t.m.id === id);
  if (found) return found;
  const t = virtual(establishment, date, c.poste, slot);
  targets.push(t);
  return t;
}

/** Nom du créneau des Réglages que couvre une mission existante (Matin, Soir…), s'il y en a un. */
export function labelOf(m: { poste: string; date: string; start: string; end: string }, needs: PosteNeed[]) {
  const need = needsFor(needs, m.date).find((n) => n.poste === m.poste);
  if (!need) return undefined;
  const slots = slotsOn(need, parseISO(m.date).getDay());
  const i = slotIndexOf(m, slots);
  return i >= 0 ? slots[i].label : undefined;
}
