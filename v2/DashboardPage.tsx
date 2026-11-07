/**
 * Tableau de bord — ce qu'un directeur veut savoir en arrivant, sans chercher :
 *  · À traiter : places à pourvoir cette semaine, candidatures, tarifs
 *    négociés, pointages manquants, évaluations à donner, attestations de
 *    vigilance à demander, absences qui commencent. Chaque carte mène à l'action.
 *  · La semaine en chiffres : missions, couverture, heures, devis freelances.
 *  · Prochaines missions (clic → la mission).
 *  · Mon équipe : tout le monde d'un coup d'œil, clic → la fiche ; export Excel.
 * Remplace l'ancienne liste « Personnes » : les fiches s'ouvrent d'ici, du
 * planning, des missions et des Réglages.
 */
import { useMemo, useState } from 'react';
import { MOCK_TODAY } from '@/mocks/v2Today';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  UserPlus,
  Scale,
  Clock,
  Star,
  ShieldAlert,
  CalendarOff,
  CalendarDays,
  ArrowRight,
  Check,
  Users,
  Send,
  Bell,
} from 'lucide-react';
import type { Mission, MissionPerson } from '@/mocks/v2Missions';
import { people } from '@/mocks/v2People';
import type { Person } from '@/mocks/v2People';
import { freelanceProfileOf } from '@/mocks/v2Freelances';
import { useV2Ui } from '@/stores/v2UiStore';
import { useV2Settings } from '@/stores/v2SettingsStore';
import { useV2People } from '@/stores/v2PeopleStore';
import { useVisibleMissions, effPlaced, effPlacedCount, effRequired } from './mission/missionStore';
import { usePendingReviews } from './people/PendingReviewsDialog';
import { PersonSheet } from './people/PersonSheet';
import { FavoriteMark } from './people/FavoriteStar';
import { shortSubline } from './people/profileModel';
import { useUnavailability, offLabel } from './people/availability';
import { ExportMenu } from './ExportMenu';
import { exportPeople } from './export';
import { personKindStyle, missionFill } from './coverage';
import { Avatar } from './Avatar';
import { missionTimeLabel, missionHours, parseISO, addDays } from './time';
import { buildAlerts } from './planning/alerts';
import { useMissionStore } from './mission/missionStore';

/** « Aujourd'hui » de la maquette. */
const TODAY = MOCK_TODAY;

const fmtShort = (iso: string) =>
  parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtLong = (iso: string) =>
  parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function DashboardPage() {
  const freelanceOnly = useV2Ui((s) => s.mode) === 'freelance';
  const missions = useVisibleMissions(freelanceOnly);
  const requestOpenMission = useV2Ui((s) => s.requestOpenMission);
  const requestPlanningAction = useV2Ui((s) => s.requestPlanningAction);
  const navigate = useNavigate();
  const { locale = 'fr' } = useParams<{ locale: string }>();
  const staff = useV2Settings((s) => s.staff);
  const pool = useV2Settings((s) => s.pool);
  const statuses = useV2People((s) => s.statuses);
  const favorites = useV2People((s) => s.favorites);
  const absences = useV2People((s) => s.absences);
  const restRules = useV2Settings((s) => s.restRules);
  const exceptions = useV2Settings((s) => s.exceptions);
  const version = useMissionStore();
  // Alertes du planning : 48 h, semaine pas envoyée, heures, repos, souhaits, jour fermé.
  const alerts = useMemo(() => {
    void version;
    return freelanceOnly ? [] : buildAlerts({ today: TODAY, staff, pool, restRules, absences, exceptions });
  }, [freelanceOnly, staff, pool, restRules, absences, exceptions, version]);
  const rateDecisions = useV2People((s) => s.rateDecisions);
  const vigilanceRequests = useV2People((s) => s.vigilanceRequests);
  const reopenReviews = useV2People((s) => s.reopenReviews);
  const pendingReviews = usePendingReviews();
  const whyOff = useUnavailability();
  const [openPerson, setOpenPerson] = useState<Person | null>(null);

  // Semaine lundi → dimanche d'aujourd'hui.
  const monday = useMemo(() => {
    const d = parseISO(TODAY);
    return addDays(TODAY, -((d.getDay() + 6) % 7));
  }, []);
  const sunday = addDays(monday, 6);
  const week = missions.filter((m) => m.date >= monday && m.date <= sunday);
  const upcoming = missions
    .filter((m) => m.date >= TODAY)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .slice(0, 6);

  // ── Chiffres ──
  const required = week.reduce((s, m) => s + effRequired(m), 0);
  const placed = week.reduce((s, m) => s + effPlacedCount(m), 0);
  const missing = Math.max(required - placed, 0);
  const coverage = required ? Math.round((placed / required) * 100) : 100;
  const hours = week.reduce((s, m) => s + missionHours(m) * effPlacedCount(m), 0);
  const freelanceTTC = week.reduce(
    (s, m) =>
      s +
      effPlaced(m)
        .filter((p) => p.kind === 'freelance' && !p.suggested)
        .reduce((x, p) => x + (p.cost ?? 0), 0),
    0,
  );

  // ── À traiter ──
  const applicants = missions.flatMap((m) =>
    m.candidates
      .filter((c) => c.note === 'Se propose' && !effPlaced(m).some((p) => p.id === c.id))
      .filter((c) => !freelanceOnly || c.kind === 'freelance')
      .map((c) => ({ m, c })),
  );
  const negotiations = applicants.filter(({ m, c }) => c.proposedRate && !rateDecisions[`${m.id}:${c.id}`]);
  const missingClock = freelanceOnly
    ? []
    : missions
        .filter((m) => m.date < TODAY)
        .flatMap((m) =>
          effPlaced(m)
            .filter((p) => !p.suggested && p.kind !== 'freelance' && !p.clockIn)
            .map((p) => ({ m, p })),
        );
  const vigilance = people
    .filter((p) => p.kind === 'freelance')
    .map((p) => ({ p, prof: freelanceProfileOf(p.name) }))
    .filter(({ p, prof }) => prof && prof.vigilance.status !== 'valide' && !vigilanceRequests[p.name]);
  const absencesSoon = freelanceOnly
    ? []
    : absences.filter((a) => a.to >= TODAY && a.from <= addDays(TODAY, 7)).sort((a, b) => a.from.localeCompare(b.from));

  const openMission = (m: Mission) => requestOpenMission(m.id); // s'ouvre ici même
  const personByName = (name: string) => people.find((p) => p.name === name);

  // ── Mon équipe ──
  const team: Person[] = useMemo(() => {
    const known = new Set(people.map((p) => p.id));
    const added: Person[] = staff
      .filter((r) => !known.has(r.personId))
      .map((r) => ({
        id: r.personId,
        name: r.name,
        kind: 'salarie',
        status: 'actif',
        roles: r.postes,
        missionsDone: 0,
        hoursThisMonth: 0,
        reliability: 0,
      }));
    return [...people, ...added]
      .map((p) => ({ ...p, status: statuses[p.id] ?? p.status }))
      .filter((p) => !freelanceOnly || p.kind === 'freelance');
  }, [staff, statuses, freelanceOnly]);
  const addedStaff = team.filter((p) => !people.some((x) => x.id === p.id));
  const groups: { kind: Person['kind']; label: string }[] = freelanceOnly
    ? [{ kind: 'freelance', label: 'Auto-entrepreneurs' }]
    : [
        { kind: 'salarie', label: 'Salariés' },
        { kind: 'extra', label: 'Extras' },
        { kind: 'freelance', label: 'Auto-entrepreneurs' },
      ];

  const todo: {
    key: string;
    icon: typeof Clock;
    tone: string;
    count: number;
    /** false : pas de chiffre en grand (la phrase se suffit) */
    showCount?: boolean;
    label: string;
    hint: string;
    action: () => void;
    cta: string;
  }[] = [
    ...alerts.map((a) => ({
      key: `alert:${a.key}`,
      icon: a.target.kind === 'send' ? Send : a.level === 'urgent' ? AlertTriangle : Bell,
      tone: a.level === 'urgent' ? 'bg-se-danger-wash text-se-danger' : 'bg-se-cascade-wash text-se-cascade-ink',
      count: a.count,
      // « 3 places à pourvoir… » : le chiffre en grand ; sinon la phrase entière.
      showCount: /^\d/.test(a.title),
      label: a.title.replace(/^\d+\s/, ''),
      hint: a.detail,
      action: () => {
        if (a.target.kind === 'mission') return requestOpenMission(a.target.missionId);
        requestPlanningAction(a.target.kind === 'send' ? 'send-next' : a.target.kind);
        navigate(`/${locale}/v2`);
      },
      cta: a.cta,
    })),
    {
      key: 'missing',
      icon: AlertTriangle,
      tone: 'bg-se-danger-wash text-se-danger',
      count: missing,
      label: `place${missing > 1 ? 's' : ''} à pourvoir cette semaine`,
      hint: `${week.length} mission${week.length > 1 ? 's' : ''} · ${coverage} % couvert`,
      // Le planning s'ouvre directement sur la bonne fenêtre (Optimiser ou Publier).
      action: () => {
        requestPlanningAction(freelanceOnly ? 'publish' : 'optimize');
        navigate(`/${locale}/v2`);
      },
      cta: freelanceOnly ? 'Publier' : 'Optimiser le planning',
    },
    {
      key: 'applicants',
      icon: UserPlus,
      tone: 'bg-se-blue-wash text-se-blue-ink',
      count: applicants.length,
      label: `candidature${applicants.length > 1 ? 's' : ''} à étudier`,
      hint: applicants
        .slice(0, 2)
        .map(({ c }) => c.name)
        .join(', '),
      action: () => applicants[0] && openMission(applicants[0].m),
      cta: 'Voir',
    },
    {
      key: 'negotiations',
      icon: Scale,
      tone: 'bg-se-cascade-wash text-se-cascade-ink',
      count: negotiations.length,
      label: `tarif${negotiations.length > 1 ? 's' : ''} négocié${negotiations.length > 1 ? 's' : ''} à répondre`,
      hint: negotiations.map(({ c }) => `${c.name} · ${c.proposedRate} €/h`).join(', '),
      action: () => negotiations[0] && openMission(negotiations[0].m),
      cta: 'Répondre',
    },
    {
      key: 'clock',
      icon: Clock,
      tone: 'bg-se-danger-wash text-se-danger',
      count: missingClock.length,
      label: `pointage${missingClock.length > 1 ? 's' : ''} manquant${missingClock.length > 1 ? 's' : ''}`,
      hint: 'à compléter avant la paie',
      action: () => navigate(`/${locale}/v2/factures`),
      cta: "Relevé d'heures",
    },
    {
      key: 'reviews',
      icon: Star,
      tone: 'bg-amber-50 text-amber-700',
      count: pendingReviews.length,
      label: `évaluation${pendingReviews.length > 1 ? 's' : ''} à donner`,
      hint: pendingReviews.map((r) => r.person.name).join(', '),
      action: reopenReviews,
      cta: 'Évaluer',
    },
    {
      key: 'vigilance',
      icon: ShieldAlert,
      tone: 'bg-se-freelance-wash text-se-freelance-ink',
      count: vigilance.length,
      label: `attestation${vigilance.length > 1 ? 's' : ''} de vigilance à demander`,
      hint: vigilance.map(({ p }) => p.name).join(', '),
      action: () => vigilance[0] && setOpenPerson(vigilance[0].p),
      cta: 'Demander',
    },
    {
      key: 'absences',
      icon: CalendarOff,
      tone: 'bg-se-surface-2 text-se-ink',
      count: absencesSoon.length,
      label: `absence${absencesSoon.length > 1 ? 's' : ''} dans les 7 jours`,
      hint: absencesSoon.map((a) => `${a.name} · ${a.reason} ${fmtShort(a.from)} → ${fmtShort(a.to)}`).join(' · '),
      action: () => {
        const p = absencesSoon[0] && personByName(absencesSoon[0].name);
        if (p) setOpenPerson(p);
      },
      cta: 'Voir la fiche',
    },
  ].filter((t) => t.count > 0);

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="se-eyebrow mb-1 capitalize">{fmtLong(TODAY)}</p>
          <h1 className="text-3xl font-extrabold text-se-ink">Tableau de bord</h1>
          <p className="text-se-muted mt-1 text-sm">
            {todo.length === 0
              ? 'Rien à traiter : tout est en ordre.'
              : `${todo.length} chose${todo.length > 1 ? 's' : ''} à traiter.`}
          </p>
        </div>
        <ExportMenu
          compact
          entries={[
            ...(freelanceOnly
              ? []
              : [
                  {
                    key: 'xls-staff',
                    kind: 'excel' as const,
                    label: 'Liste du personnel',
                    hint: 'Salariés et extras · contrat, heures, repos, tarif',
                    run: () => exportPeople('personnel', { staff, statuses, favorites, extraPeople: addedStaff }),
                  },
                ]),
            {
              key: 'xls-freelances',
              kind: 'excel',
              label: 'Liste des auto-entrepreneurs',
              hint: 'Coordonnées en clair si validés chez vous · attestation',
              run: () => exportPeople('freelances', { staff, statuses, favorites }),
            },
            ...(freelanceOnly
              ? []
              : [
                  {
                    key: 'xls-all',
                    kind: 'excel' as const,
                    label: 'Tout le monde',
                    hint: 'Personnel et auto-entrepreneurs dans un seul fichier',
                    run: () => exportPeople('tous', { staff, statuses, favorites, extraPeople: addedStaff }),
                  },
                ]),
          ]}
        />
      </header>

      {/* ── À traiter ── */}
      {todo.length === 0 ? (
        <div className="rounded-se border border-se-line bg-se-surface shadow-se p-6 flex items-center gap-3 mb-5">
          <span className="w-10 h-10 rounded-full bg-se-success-wash text-se-success grid place-items-center">
            <Check className="w-5 h-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold text-se-ink">Tout est en ordre</p>
            <p className="text-sm text-se-muted">Aucune place à pourvoir, aucune candidature ni pointage en attente.</p>
          </div>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
          {todo.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                onClick={t.action}
                className="w-full text-left rounded-se border border-se-line bg-se-surface shadow-se p-4 flex items-start gap-3 hover:border-se-muted transition-colors"
              >
                <span className={`w-10 h-10 rounded-se-sm grid place-items-center shrink-0 ${t.tone}`}>
                  <t.icon className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">
                    {t.showCount !== false && (
                      <>
                        <span className="text-2xl font-extrabold font-display text-se-ink leading-none">
                          {t.count}
                        </span>{' '}
                      </>
                    )}
                    <span className="text-sm font-semibold text-se-ink">{t.label}</span>
                  </span>
                  {t.hint && <span className="block text-xs text-se-muted truncate mt-1">{t.hint}</span>}
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-se-blue-ink mt-2">
                    {t.cta} <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ── La semaine en chiffres ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat
          label="Missions cette semaine"
          value={String(week.length)}
          hint={`${fmtShort(monday)} → ${fmtShort(sunday)}`}
        />
        <Stat
          label="Couverture"
          value={`${coverage} %`}
          hint={`${placed}/${required} places`}
          tone={coverage >= 100 ? 'text-se-success' : placed === 0 ? 'text-se-danger' : 'text-se-cascade-ink'}
        />
        <Stat label="Heures planifiées" value={`${Math.round(hours * 10) / 10} h`} hint="personnes placées × durée" />
        <Stat
          label="Auto-entrepreneurs"
          value={`${Math.round(freelanceTTC)} € TTC`}
          hint="au devis, cette semaine"
          tone="text-se-freelance-ink"
        />
      </div>

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4 items-start">
        {/* ── Prochaines missions ── */}
        <section className="rounded-se border border-se-line bg-se-surface shadow-se p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-3.5 h-3.5 text-se-muted" aria-hidden="true" />
            <h2 className="se-eyebrow">Prochaines missions</h2>
            <button
              type="button"
              onClick={() => navigate(`/${locale}/v2`)}
              className="ml-auto text-xs font-semibold text-se-blue-ink hover:text-se-blue"
            >
              Tout le planning
            </button>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-se-muted">Aucune mission à venir.</p>
          ) : (
            <ul className="divide-y divide-se-line-soft">
              {upcoming.map((m) => {
                const fill = missionFill(m);
                const p = effPlacedCount(m);
                const r = effRequired(m);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => openMission(m)}
                      className="w-full flex items-center gap-3 py-2 text-left hover:bg-se-surface-2 rounded-se-sm px-1 -mx-1"
                    >
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${fill.band}`} aria-hidden="true" />
                      <span className="w-16 shrink-0 text-xs font-semibold text-se-ink">{fmtShort(m.date)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <span className="font-semibold text-se-ink">{m.poste}</span>
                        <span className="text-se-muted"> · {m.establishment}</span>
                      </span>
                      <span className="text-xs text-se-muted whitespace-nowrap">{missionTimeLabel(m)}</span>
                      <span
                        className={`text-xs font-bold tabular-nums ${p <= 0 ? 'text-se-danger' : p < r ? 'text-se-cascade-ink' : 'text-se-success'}`}
                      >
                        {p}/{r}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Mon équipe ── */}
        <section className="rounded-se border border-se-line bg-se-surface shadow-se p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-3.5 h-3.5 text-se-muted" aria-hidden="true" />
            <h2 className="se-eyebrow">{freelanceOnly ? 'Auto-entrepreneurs' : 'Mon équipe'}</h2>
            <span className="ml-auto text-xs text-se-muted">{team.length} personnes · clic → la fiche</span>
          </div>
          <div className="space-y-4">
            {groups.map((g) => {
              const list = team.filter((p) => p.kind === g.kind);
              if (list.length === 0) return null;
              const k = personKindStyle[g.kind];
              return (
                <div key={g.kind}>
                  <p className={`text-xs font-semibold mb-2 ${k.text}`}>
                    {g.label} <span className="text-se-muted font-normal">· {list.length}</span>
                  </p>
                  <ul className="grid sm:grid-cols-2 gap-1.5">
                    {list.map((p) => {
                      const off = p.kind === 'freelance' ? null : whyOff(p, TODAY);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => setOpenPerson(p)}
                            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-se-sm hover:bg-se-surface-2 text-left"
                          >
                            <Avatar person={p as MissionPerson} size={36} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-se-ink truncate">{p.name}</span>
                                {p.kind === 'freelance' && <FavoriteMark name={p.name} />}
                                {p.status === 'candidat' && (
                                  <span className="se-badge bg-se-blue-wash text-se-blue-ink" style={{ height: 16 }}>
                                    candidature
                                  </span>
                                )}
                                {p.status === 'bloque' && (
                                  <span className="se-badge bg-se-danger-wash text-se-danger" style={{ height: 16 }}>
                                    bloqué·e
                                  </span>
                                )}
                                {off && (
                                  <span
                                    className="se-badge bg-se-cascade-wash text-se-cascade-ink"
                                    style={{ height: 16 }}
                                  >
                                    {offLabel(off)}
                                  </span>
                                )}
                              </span>
                              {/* Même sous-ligne que la fiche : contrat · département, ou ville */}
                              <span className="block text-[11px] text-se-muted truncate">
                                {shortSubline(p, staff, pool)}
                                {p.roles.length > 0 ? ` · ${p.roles.join(', ')}` : ''}
                              </span>
                            </span>
                            {typeof p.rating === 'number' && (
                              <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-se-ink">
                                <Star className="w-3 h-3 fill-current text-amber-500" aria-hidden="true" />
                                {p.rating.toFixed(1)}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {openPerson && <PersonSheet person={openPerson} onClose={() => setOpenPerson(null)} />}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'text-se-ink',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="bg-se-surface border border-se-line rounded-se px-4 py-3.5 shadow-se">
      <p className="se-eyebrow mb-1">{label}</p>
      <p className={`text-xl font-extrabold font-display ${tone}`}>{value}</p>
      <p className="text-xs text-se-muted mt-0.5">{hint}</p>
    </div>
  );
}
