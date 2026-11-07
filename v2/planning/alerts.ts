/**
 * Alertes — ce qui mérite un coup d'œil avant que ça coince, déduit de l'état
 * réel du planning (rien à saisir) :
 *   · places à pourvoir dans les 48 h ;
 *   · la semaine prochaine pas encore envoyée aux équipes (dès le jeudi) ;
 *   · heures du contrat dépassées, règles de repos enfreintes cette semaine ;
 *   · fixes très en dessous de leur contrat cette semaine ;
 *   · placements contre un souhait (« évite le dimanche ») ;
 *   · missions posées sur un jour fermé.
 * Chaque alerte dit où aller : Optimiser, Envoyer la semaine, le planning
 * Par personnel, ou la mission concernée. Le tableau de bord et la cloche les affichent.
 */
import type { Absence } from '@/stores/v2PeopleStore';
import type { ExceptionDay, PoolRule, RestRules, StaffRule } from '@/stores/v2SettingsStore';
import { againstWish, exceptionOn } from '@/stores/v2SettingsStore';
import { effMissions, effPlaced, effPlacedCount, effRequired, effSentWeek, isLive } from '../mission/missionStore';
import { addDays, parseISO } from '../time';
import { hoursPlacedInWeek, restIssues, weekStartOf } from './weekPlan';

export type AlertLevel = 'urgent' | 'attention';
export type AlertTarget =
  { kind: 'optimize' } | { kind: 'send' } | { kind: 'personnel' } | { kind: 'mission'; missionId: string };

export interface Alert {
  key: string;
  level: AlertLevel;
  /** « 3 places à pourvoir dans les 48 h » */
  title: string;
  /** détail en mots simples */
  detail: string;
  count: number;
  target: AlertTarget;
  /** libellé du bouton */
  cta: string;
}

interface Input {
  today: string;
  staff: StaffRule[];
  pool: PoolRule[];
  restRules: RestRules;
  absences: Absence[];
  exceptions: ExceptionDay[];
}

const fmtDay = (iso: string) => parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
const n = (count: number, one: string, many = `${one}s`) => `${count} ${count > 1 ? many : one}`;

/** Les alertes du moment, les plus urgentes d'abord. */
export function buildAlerts(input: Input): Alert[] {
  const { today, staff, pool, restRules, exceptions } = input;
  const live = effMissions().filter(isLive);
  const weekStart = weekStartOf(today);
  const nextWeekStart = addDays(weekStart, 7);
  const out: Alert[] = [];

  // ── Places à pourvoir dans les 48 h ──
  const soon = live.filter((m) => m.date >= today && m.date <= addDays(today, 2));
  const missingSoon = soon.reduce((s, m) => s + Math.max(effRequired(m) - effPlacedCount(m), 0), 0);
  if (missingSoon > 0) {
    out.push({
      key: 'soon',
      level: 'urgent',
      title: `${n(missingSoon, 'place')} à pourvoir dans les 48 h`,
      detail: soon
        .filter((m) => effRequired(m) > effPlacedCount(m))
        .map((m) => `${m.poste} ${fmtDay(m.date)} ${m.start}`)
        .slice(0, 3)
        .join(' · '),
      count: missingSoon,
      target: { kind: 'optimize' },
      cta: 'Optimiser',
    });
  }

  // ── Semaine prochaine pas envoyée (dès le jeudi) ──
  const weekday = parseISO(today).getDay();
  const nextWeek = live.filter((m) => m.date >= nextWeekStart && m.date <= addDays(nextWeekStart, 6));
  const nextPlaced = nextWeek.reduce((s, m) => s + effPlacedCount(m), 0);
  if ((weekday >= 4 || weekday === 0) && nextPlaced > 0 && !effSentWeek(nextWeekStart)) {
    out.push({
      key: 'send',
      level: 'attention',
      title: 'Semaine prochaine pas encore envoyée aux équipes',
      detail: `${n(nextPlaced, 'personne')} placée${nextPlaced > 1 ? 's' : ''} du ${fmtDay(nextWeekStart)} au ${fmtDay(addDays(nextWeekStart, 6))} · personne n'a encore reçu son planning`,
      count: 1,
      target: { kind: 'send' },
      cta: 'Envoyer la semaine',
    });
  }

  // ── Fixes : heures du contrat dépassées, règles de repos, sous le contrat ──
  const over = staff
    .map((r) => ({ r, h: Math.round(hoursPlacedInWeek(live, r.name, weekStart) * 10) / 10 }))
    .filter((x) => x.h > x.r.weeklyHours);
  if (over.length > 0) {
    out.push({
      key: 'over',
      level: 'attention',
      title: `${n(over.length, 'fixe')} au-delà des heures du contrat cette semaine`,
      detail: over.map((x) => `${x.r.name} ${x.h} h / ${x.r.weeklyHours} h`).join(' · '),
      count: over.length,
      target: { kind: 'personnel' },
      cta: 'Voir par personnel',
    });
  }
  const rest = staff
    .map((r) => ({ r, issues: restIssues(live, r.name, weekStart, restRules) }))
    .filter((x) => x.issues.length > 0);
  if (rest.length > 0) {
    out.push({
      key: 'rest',
      level: 'urgent',
      title: `Repos non respecté : ${n(rest.length, 'personne')}`,
      detail: rest.map((x) => `${x.r.name} : ${x.issues[0]}`).join(' · '),
      count: rest.length,
      target: { kind: 'personnel' },
      cta: 'Voir par personnel',
    });
  }
  // Sous le contrat : moins de la moitié des heures, alors que la semaine est en cours.
  const under = staff
    .filter((r) => r.autoSchedule !== false)
    .map((r) => ({ r, h: Math.round(hoursPlacedInWeek(live, r.name, weekStart) * 10) / 10 }))
    .filter((x) => x.h < x.r.weeklyHours / 2);
  if (under.length > 0) {
    out.push({
      key: 'under',
      level: 'attention',
      title: `${n(under.length, 'fixe')} loin des heures du contrat cette semaine`,
      detail: under.map((x) => `${x.r.name} ${x.h} h / ${x.r.weeklyHours} h`).join(' · '),
      count: under.length,
      target: { kind: 'optimize' },
      cta: 'Placer les fixes',
    });
  }

  // ── Placements contre un souhait (cette semaine et la suivante) ──
  const rules = [...staff, ...pool];
  const wishes = live
    .filter((m) => m.date >= weekStart && m.date <= addDays(nextWeekStart, 6))
    .flatMap((m) =>
      effPlaced(m)
        .filter((p) => !p.suggested)
        .map((p) => ({ m, p, rule: rules.find((r) => r.personId === p.id || r.name === p.name) }))
        .filter((x) => x.rule && againstWish(x.rule, m.date))
        .map((x) => `${x.p.name} ${fmtDay(m.date)} (${againstWish(x.rule!, m.date)})`),
    );
  if (wishes.length > 0) {
    out.push({
      key: 'wishes',
      level: 'attention',
      title: `${n(wishes.length, 'placement')} contre un souhait`,
      detail: wishes.slice(0, 3).join(' · '),
      count: wishes.length,
      target: { kind: 'personnel' },
      cta: 'Voir par personnel',
    });
  }

  // ── Missions sur un jour fermé ──
  live
    .filter((m) => m.date >= today && exceptionOn(exceptions, m.date)?.kind === 'ferme')
    .forEach((m) => {
      const ex = exceptionOn(exceptions, m.date)!;
      out.push({
        key: `closed:${m.id}`,
        level: 'urgent',
        title: `Mission un jour fermé · ${fmtDay(m.date)}`,
        detail: `${m.poste} ${m.start}–${m.end} · ${ex.label || 'journée fermée'} (Réglages › Postes) : à déplacer ou à annuler`,
        count: 1,
        target: { kind: 'mission', missionId: m.id },
        cta: 'Ouvrir la mission',
      });
    });

  return out.sort((a, b) => Number(b.level === 'urgent') - Number(a.level === 'urgent'));
}
