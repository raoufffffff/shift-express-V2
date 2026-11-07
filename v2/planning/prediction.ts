/**
 * Le prédictif — à partir des HABITUDES, pas de règles figées.
 * Il lit toutes les missions connues (passées, en cours, à venir) et en tire :
 *   · l'équipe habituelle d'un poste (qui le tient d'habitude, surtout ce
 *     jour-là de la semaine et dans cet établissement) ;
 *   · les places encore libres à venir qu'elle pourrait prendre → suggestions
 *     en pointillé, à confirmer ;
 *   · les missions habituelles qui manquent au planning (créneau attendu tel
 *     jour d'après les Réglages — Matin, Soir… — sans mission dessus) →
 *     propositions à créer, avec l'équipe habituelle déjà suggérée dedans.
 * Une suggestion compte comme une place prise : le prédictif ne surbooke jamais,
 * ne propose personne en repos / absence, ni déjà pris ce jour-là.
 */
import type { Mission, MissionPlaced, PersonKind } from '@/mocks/v2Missions';
import { people } from '@/mocks/v2People';
import type { PosteNeed, StaffRule } from '@/stores/v2SettingsStore';
import { uncoveredSlots } from '@/stores/v2SettingsStore';
import type { PersonStatus } from '@/mocks/v2People';
import { effPlaced, effRequired, isLive, writePlaced, appendHistory, createMission } from '../mission/missionStore';
import { parseISO, addDays } from '../time';
import { employeeShiftRoom, monthOf } from '../plan';

export interface HabitCandidate {
  id: string;
  name: string;
  kind: PersonKind;
  /** fois où la personne a tenu ce poste */
  times: number;
  /** dont ce jour-là de la semaine */
  sameWeekday: number;
  /** score interne (fréquence + même jour + même établissement) */
  score: number;
}

export interface TeamSuggestion {
  mission: Mission;
  /** places libres (les suggestions déjà posées comptent comme prises) */
  free: number;
  adds: HabitCandidate[];
}

export interface ShiftProposal {
  date: string;
  poste: string;
  /** créneau des Réglages (Service, Matin, Soir…) */
  label: string;
  start: string;
  end: string;
  count: number;
  establishment: string;
  team: HabitCandidate[];
}

export type IsOff = (person: { id: string; name: string; kind?: string }, dateISO: string) => string | null;

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const weekdayName = (iso: string) => WEEKDAYS[parseISO(iso).getDay()];

/**
 * Qui tient d'habitude ce poste : fréquence sur toutes les missions connues,
 * bonus si c'est le même jour de la semaine et le même établissement.
 * Seulement le personnel (salariés, extras) : les auto-entrepreneurs se
 * proposent eux-mêmes, on ne les place pas d'office.
 */
export function habitualTeam(
  missions: Mission[],
  target: { poste: string; date: string; establishment: string; id?: string },
): HabitCandidate[] {
  const weekday = parseISO(target.date).getDay();
  const byName = new Map<string, HabitCandidate>();
  missions
    .filter((m) => m.id !== target.id && m.poste === target.poste)
    .forEach((m) => {
      const sameDay = parseISO(m.date).getDay() === weekday;
      const sameEst = m.establishment === target.establishment;
      effPlaced(m)
        .filter((p) => !p.suggested && p.kind !== 'freelance')
        .forEach((p) => {
          const cur = byName.get(p.name) ?? {
            id: p.id,
            name: p.name,
            kind: p.kind,
            times: 0,
            sameWeekday: 0,
            score: 0,
          };
          cur.times += 1;
          if (sameDay) cur.sameWeekday += 1;
          cur.score += 1 + (sameDay ? 2 : 0) + (sameEst ? 0.5 : 0);
          byName.set(p.name, cur);
        });
    });
  // Repli : les personnes dont c'est le métier, même sans historique ici.
  people
    .filter((p) => p.kind !== 'freelance' && p.roles.includes(target.poste) && !byName.has(p.name))
    .forEach((p) =>
      byName.set(p.name, { id: p.id, name: p.name, kind: p.kind, times: 0, sameWeekday: 0, score: 0.25 }),
    );
  return Array.from(byName.values()).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

interface Ctx {
  today: string;
  /** jours couverts à partir d'aujourd'hui */
  horizonDays?: number;
  isOff: IsOff;
  staff: StaffRule[];
  statuses: Record<string, PersonStatus | undefined>;
}

/** Une personne peut-elle être proposée sur cette mission ce jour-là ? */
function eligible(c: HabitCandidate, m: Mission, ctx: Ctx, busy: Set<string>): boolean {
  const status = ctx.statuses[c.id] ?? people.find((p) => p.id === c.id || p.name === c.name)?.status;
  if (status === 'bloque' || status === 'candidat') return false;
  if (busy.has(c.name)) return false;
  if (ctx.isOff({ id: c.id, name: c.name, kind: c.kind }, m.date) !== null) return false;
  // Salarié fixe : seulement les postes de sa règle (Réglages), s'il en a une.
  const rule = ctx.staff.find((r) => r.personId === c.id || r.name === c.name);
  if (c.kind === 'salarie' && rule && !rule.postes.includes(m.poste)) return false;
  return true;
}

/** Qui est déjà pris quel jour (placés + suggestions), pour ne proposer personne deux fois. */
function busyByDate(missions: Mission[]): Map<string, Set<string>> {
  const busy = new Map<string, Set<string>>();
  missions.filter(isLive).forEach((m) => {
    if (!busy.has(m.date)) busy.set(m.date, new Set());
    effPlaced(m).forEach((p) => busy.get(m.date)!.add(p.name));
  });
  return busy;
}

/**
 * Places libres à venir que l'équipe habituelle pourrait prendre.
 * Missions concernées : à partir d'aujourd'hui, pilotées par le personnel
 * (salariés ou cascade), pas encore pleines une fois les suggestions comptées.
 */
export function predictTeams(missions: Mission[], ctx: Ctx): TeamSuggestion[] {
  const end = addDays(ctx.today, ctx.horizonDays ?? 14);
  const busy = busyByDate(missions);
  const out: TeamSuggestion[] = [];
  missions
    .filter(isLive)
    .filter((m) => m.date >= ctx.today && m.date <= end)
    .filter((m) => m.system !== 'freelance' && m.coverage !== 'freelance_validated')
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .forEach((m) => {
      const placed = effPlaced(m);
      const free = effRequired(m) - placed.length; // suggestions comprises = places prises
      if (free <= 0) return;
      const dayBusy = busy.get(m.date) ?? new Set<string>();
      const adds: HabitCandidate[] = [];
      habitualTeam(missions, m).forEach((c) => {
        if (adds.length >= free) return;
        if (!eligible(c, m, ctx, dayBusy)) return;
        adds.push(c);
        dayBusy.add(c.name);
      });
      if (adds.length > 0) out.push({ mission: m, free, adds });
    });
  return out;
}

/**
 * Missions habituelles absentes du planning : un créneau attendu ce jour-là
 * (Réglages) sans mission vivante dessus → proposition prête à créer, à
 * l'horaire du créneau, avec l'équipe habituelle déjà suggérée.
 */
export function predictShifts(
  missions: Mission[],
  needs: PosteNeed[],
  ctx: Ctx & { from: string; days: number; establishment: string },
): ShiftProposal[] {
  const busy = busyByDate(missions);
  const live = missions.filter(isLive);
  const out: ShiftProposal[] = [];
  for (let i = 0; i < ctx.days; i += 1) {
    const date = addDays(ctx.from, i);
    if (date < ctx.today) continue;
    uncoveredSlots(needs, date, live).forEach(({ poste, slot }) => {
      const probe: Mission = {
        id: `probe-${date}-${poste}-${slot.start}`,
        poste,
        establishment: ctx.establishment,
        date,
        start: slot.start,
        end: slot.end,
        required: slot.count,
        system: 'employe',
        coverage: 'shortage',
        placed: [],
        candidates: [],
        estimatedCost: 0,
      };
      const dayBusy = new Set(busy.get(date) ?? []);
      const team: HabitCandidate[] = [];
      habitualTeam(missions, probe).forEach((c) => {
        if (team.length >= slot.count) return;
        if (!eligible(c, probe, ctx, dayBusy)) return;
        team.push(c);
        dayBusy.add(c.name);
      });
      out.push({
        date,
        poste,
        label: slot.label,
        start: slot.start,
        end: slot.end,
        count: slot.count,
        establishment: ctx.establishment,
        team,
      });
    });
  }
  return out;
}

const asSuggested = (c: HabitCandidate): MissionPlaced => ({
  id: c.id,
  name: c.name,
  kind: c.kind,
  suggested: true,
  checkedIn: false,
  note: 'Équipe habituelle',
});

/** Écrit les suggestions d'équipe (pointillé, à confirmer). Renvoie le nombre de personnes proposées. */
export function applyTeamSuggestions(sugs: TeamSuggestion[]): number {
  let n = 0;
  sugs.forEach(({ mission, adds }) => {
    if (adds.length === 0) return;
    writePlaced(mission.id, [...effPlaced(mission), ...adds.map(asSuggested)]);
    appendHistory(
      mission.id,
      `Prédictif : ${adds.map((c) => c.name).join(', ')} proposé·e${adds.length > 1 ? 's' : ''} (équipe habituelle du ${weekdayName(mission.date)})`,
      { silent: true },
    );
    n += adds.length;
  });
  return n;
}

/** Crée les missions habituelles proposées, équipe suggérée dedans. Renvoie leurs ids. */
export function applyShiftProposals(props: ShiftProposal[]): string[] {
  // Jamais au-delà des shifts employés que la formule permet, mois par mois.
  const rooms = new Map<string, number>();
  const allowed = props.filter((p) => {
    const month = monthOf(p.date);
    const room = rooms.get(month) ?? employeeShiftRoom(undefined, month);
    if (room <= 0) return false;
    rooms.set(month, room - 1);
    return true;
  });
  return allowed.map(
    (p) =>
      createMission({
        poste: p.poste,
        establishment: p.establishment,
        date: p.date,
        start: p.start,
        end: p.end,
        required: p.count,
        system: 'employe',
        coverage: p.team.length > 0 ? 'suggested' : 'shortage',
        placed: p.team.map(asSuggested),
        candidates: [],
        estimatedCost: 0,
        history: [
          {
            at: 'maintenant',
            label: `Mission proposée par le prédictif · ${p.label.toLowerCase()} habituel du ${weekdayName(p.date)}${
              p.team.length > 0
                ? ` · ${p.team.map((c) => c.name).join(', ')} suggéré·e${p.team.length > 1 ? 's' : ''}`
                : ''
            }`,
          },
        ],
      }).id,
  );
}

/** Suggestions en attente : (mission, personne) sur les missions vivantes. */
export function pendingSuggestions(missions: Mission[], fromDate?: string): { m: Mission; p: MissionPlaced }[] {
  return missions
    .filter(isLive)
    .filter((m) => !fromDate || m.date >= fromDate)
    .flatMap((m) =>
      effPlaced(m)
        .filter((p) => p.suggested)
        .map((p) => ({ m, p })),
    );
}

/**
 * Confirme les suggestions : la personne devient placée pour de bon.
 * Jamais au-delà du besoin ; une personne indisponible ce jour-là (repos,
 * absence) est retirée au lieu d'être confirmée. Renvoie {confirmed, dropped}.
 */
export function confirmSuggestions(missions: Mission[], isOff: IsOff): { confirmed: number; dropped: string[] } {
  let confirmed = 0;
  const dropped: string[] = [];
  missions.filter(isLive).forEach((m) => {
    const placed = effPlaced(m);
    if (!placed.some((p) => p.suggested)) return;
    const firm = placed.filter((p) => !p.suggested);
    let room = effRequired(m) - firm.length;
    const next: MissionPlaced[] = [...firm];
    const kept: string[] = [];
    placed
      .filter((p) => p.suggested)
      .forEach((p) => {
        if (room <= 0 || isOff(p, m.date) !== null) {
          dropped.push(`${p.name} · ${m.poste} · ${weekdayName(m.date)}`);
          return;
        }
        next.push({ ...p, suggested: false, note: undefined });
        kept.push(p.name);
        room -= 1;
        confirmed += 1;
      });
    writePlaced(m.id, next);
    if (kept.length > 0) appendHistory(m.id, `Suggestions confirmées : ${kept.join(', ')}`);
  });
  return { confirmed, dropped };
}
