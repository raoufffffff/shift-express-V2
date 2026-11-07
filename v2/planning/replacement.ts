/**
 * Remplacer quelqu'un au pied levé — qui peut prendre ce créneau tout de suite ?
 * Même ordre que la cascade : d'abord les fixes qui tiennent le poste (libres
 * ce jour-là, heures du contrat et règles de repos respectées), d'abord ceux
 * dont c'est le créneau habituel puis ceux qui ont le moins d'heures cette
 * semaine ; ensuite le bassin de talents (CDD d'usage, intérim). Chaque
 * proposition dit en un mot pourquoi elle tient (« libre, 12 h / 35 h cette
 * semaine »). Ceux qu'on écarte sont listés avec la raison, pour ne pas chercher.
 * Rien n'est écrit ici : un clic sur une proposition place la personne.
 */
import type { Mission, PersonKind } from '@/mocks/v2Missions';
import { people } from '@/mocks/v2People';
import type { PersonStatus } from '@/mocks/v2People';
import type { Absence } from '@/stores/v2PeopleStore';
import type { PoolRule, PosteNeed, RestRules, StaffRule } from '@/stores/v2SettingsStore';
import { againstWish } from '@/stores/v2SettingsStore';
import { offLabel, offReason } from '../people/availability';
import { effPlaced, isLive } from '../mission/missionStore';
import { missionHours } from '../time';
import { hoursPlacedInWeek, labelOf, restIssue, shiftsOf, weekStartOf } from './weekPlan';

export interface Replacement {
  id: string;
  name: string;
  kind: PersonKind;
  /** bassin de talents : CDD d'usage, intérim (+ agence) */
  contract?: string;
  /** pourquoi cette personne convient, en mots simples */
  hint: string;
  /** c'est son créneau habituel */
  usual: boolean;
  /** contre un souhait (« évite le dimanche ») : proposé·e en dernier */
  wish?: string;
}

export interface Replacements {
  fixes: Replacement[];
  extras: Replacement[];
  /** écartés, avec la raison (« Lucas Petit : congés », « Emma Durand : repos de 9 h seulement… ») */
  excluded: string[];
}

interface Input {
  mission: Mission;
  /** toutes les missions vivantes (les heures et le repos se comptent sur tout) */
  allMissions: Mission[];
  needs: PosteNeed[];
  staff: StaffRule[];
  pool: PoolRule[];
  statuses: Record<string, PersonStatus | undefined>;
  absences: Absence[];
  restRules: RestRules;
  /** personnes qui viennent de se désister : ni proposées, ni listées parmi les écartés */
  exclude?: string[];
}

const round1 = (h: number) => Math.round(h * 10) / 10;

/** Qui peut remplacer, tout de suite, sur cette mission. */
export function replacementsFor(input: Input): Replacements {
  const { mission: m, allMissions, needs, staff, pool, statuses, absences, restRules, exclude = [] } = input;
  const live = allMissions.filter(isLive);
  const already = new Set([
    ...effPlaced(m)
      .filter((p) => !p.suggested)
      .map((p) => p.name),
    ...exclude,
  ]);
  const busy = (name: string) =>
    live.some((x) => x.date === m.date && x.id !== m.id && effPlaced(x).some((p) => p.name === name && !p.suggested));
  const hours = missionHours(m);
  const slotLabel = labelOf(m, needs);
  const weekStart = weekStartOf(m.date);
  const excluded: string[] = [];

  const fixes: Replacement[] = [];
  staff
    .filter((r) => r.postes.includes(m.poste) && !already.has(r.name))
    .filter((r) => statuses[r.personId] !== 'bloque')
    .forEach((r) => {
      const off = offReason(staff, absences, { id: r.personId, name: r.name, kind: 'salarie' }, m.date);
      if (off) return excluded.push(`${r.name} : ${offLabel(off)}`);
      if (busy(r.name)) return excluded.push(`${r.name} : déjà pris·e ce jour-là`);
      const soFar = hoursPlacedInWeek(allMissions, r.name, weekStart);
      if (soFar + hours > r.weeklyHours)
        return excluded.push(`${r.name} : ${round1(soFar)} h / ${r.weeklyHours} h déjà cette semaine`);
      const issue = restIssue(shiftsOf(allMissions, r.name), { date: m.date, start: m.start, end: m.end }, restRules);
      if (issue) return excluded.push(`${r.name} : ${issue}`);
      const usual = !!slotLabel && !!r.slots?.includes(slotLabel);
      const wish = againstWish(r, m.date) ?? undefined;
      fixes.push({
        id: r.personId,
        name: r.name,
        kind: 'salarie',
        usual,
        wish,
        hint: `${usual ? 'son créneau habituel · ' : ''}libre, ${round1(soFar)} h / ${r.weeklyHours} h cette semaine${
          wish ? ` · ${wish}` : r.wishes?.hours === 'plus' ? " · veut plus d'heures" : ''
        }`,
      });
    });
  // Ceux qui évitent ce jour-là passent en dernier, sans être écartés.
  fixes.sort(
    (a, b) =>
      Number(!!a.wish) - Number(!!b.wish) ||
      Number(b.usual) - Number(a.usual) ||
      hoursOf(a.hint) - hoursOf(b.hint) ||
      a.name.localeCompare(b.name),
  );

  const extras: Replacement[] = [];
  pool
    .filter((r) => r.postes.includes(m.poste) && !already.has(r.name))
    .filter((r) => (statuses[r.personId] ?? people.find((p) => p.id === r.personId)?.status) !== 'bloque')
    .forEach((r) => {
      const off = offReason(staff, absences, { id: r.personId, name: r.name, kind: 'extra' }, m.date);
      if (off) return excluded.push(`${r.name} : ${offLabel(off)}`);
      if (busy(r.name)) return excluded.push(`${r.name} : déjà pris·e ce jour-là`);
      const contract = r.contract === 'Intérim' && r.agency ? `Intérim · ${r.agency}` : r.contract;
      const wish = againstWish(r, m.date) ?? undefined;
      extras.push({
        id: r.personId,
        name: r.name,
        kind: 'extra',
        contract,
        usual: false,
        wish,
        hint: `${contract} · libre${wish ? ` · ${wish}` : ''}`,
      });
    });
  extras.sort((a, b) => Number(!!a.wish) - Number(!!b.wish) || a.name.localeCompare(b.name));

  return { fixes, extras, excluded };
}

/** Heures déjà placées, lues dans l'indice (« libre, 12 h / 35 h… ») pour trier sans recalculer. */
function hoursOf(hint: string): number {
  const found = /(\d+(?:\.\d+)?) h \//.exec(hint);
  return found ? Number(found[1]) : 0;
}
