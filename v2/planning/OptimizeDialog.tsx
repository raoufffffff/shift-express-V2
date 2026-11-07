/**
 * « Optimiser » — placer tout le personnel d'un coup, dans l'ordre de la cascade :
 *   0. les créneaux ATTENDUS (Réglages › Postes & besoins : tel poste, tel
 *      créneau — Matin, Soir… —, tels jours, tant de personnes) qui n'ont pas
 *      encore de mission dessus sont créés ;
 *   1. les salariés fixes qui tiennent le poste et ne sont ni en repos, ni en
 *      congés, ni déjà placés ce jour-là ;
 *   2. s'il manque encore du monde : les extras (CDD d'usage) connus pour le poste ;
 *   3. s'il manque toujours : un bouton, sur place, pour lancer la recherche
 *      d'auto-entrepreneurs au tarif des Réglages.
 * On choisit d'abord la portée — aujourd'hui, demain, toute la semaine ou un
 * jour précis — puis on relit les propositions (cochées par défaut) avant de
 * placer. Rien n'est écrit tant qu'on n'a pas cliqué « Placer ».
 */
import { useMemo, useState } from 'react';
import {
  X,
  Sparkles,
  BedDouble,
  Check,
  Search,
  CalendarDays,
  ArrowRight,
  CalendarPlus,
  Clock,
  ShieldAlert,
  FileText,
  Undo2,
  HeartOff,
} from 'lucide-react';
import type { Mission, MissionPlaced } from '@/mocks/v2Missions';
import { useV2Settings, rateFor } from '@/stores/v2SettingsStore';
import { useV2People } from '@/stores/v2PeopleStore';
import { useV2Ui } from '@/stores/v2UiStore';
import { employeeShiftRoom, planLimits, planName, monthOf } from '../plan';
import { personKindStyle } from '../coverage';
import { Avatar } from '../Avatar';
import {
  useMissionStore,
  effMissions,
  effPlaced,
  writePlaced,
  appendHistory,
  writeFreelanceRate,
  writeCoverage,
  createMission,
  beginUndoable,
  endUndoable,
  undoLast,
} from '../mission/missionStore';
import { parseISO, addDays } from '../time';
import { buildWeekPlan, weekStartOf } from './weekPlan';
import { euros, freelanceRateOfMission, hourlyRateOf } from './cost';
import { missionHours } from '../time';
import type { Candidate, Plan } from './weekPlan';

export type Scope = 'today' | 'tomorrow' | 'week' | 'day';

interface Props {
  /** missions visibles (déjà filtrées par établissement) */
  missions: Mission[];
  today: string;
  weekStart: string;
  /** établissement des créneaux à créer (celui filtré, sinon le premier) */
  establishment: string;
  onClose: () => void;
  onOpenMission: (id: string) => void;
  /** portée déjà choisie (ex. « Placer les fixes sur la semaine ») : on passe directement aux propositions */
  initialScope?: Scope;
}

const fmtDay = (iso: string) =>
  parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDayLong = (iso: string) =>
  parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export function OptimizeDialog({
  missions,
  today,
  weekStart,
  establishment,
  onClose,
  onOpenMission,
  initialScope,
}: Props) {
  const version = useMissionStore();
  const staff = useV2Settings((s) => s.staff);
  const pool = useV2Settings((s) => s.pool);
  const needs = useV2Settings((s) => s.postes);
  const establishments = useV2Settings((s) => s.establishments);
  const account = useV2Settings((s) => s.account);
  const cascade = useV2Settings((s) => s.cascade);
  const restRules = useV2Settings((s) => s.restRules);
  const statuses = useV2People((s) => s.statuses);
  const absences = useV2People((s) => s.absences);

  const [scope, setScope] = useState<Scope | null>(initialScope ?? null);
  const [day, setDay] = useState(addDays(today, 2));
  const [analysed, setAnalysed] = useState(!!initialScope);
  /** propositions décochées : `${missionId}:${personId}` */
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  /** recherches d'auto-entrepreneurs lancées depuis cette fenêtre */
  const [launched, setLaunched] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<{ placed: number; searches: number; created: number; skipped: number } | null>(null);
  const plan = useV2Ui((s) => s.plan);

  const dates = useMemo<string[]>(() => {
    if (scope === 'today') return [today];
    if (scope === 'tomorrow') return [addDays(today, 1)];
    if (scope === 'week') return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    if (scope === 'day') return [day];
    return [];
  }, [scope, today, weekStart, day]);

  const scopeLabel =
    scope === 'today'
      ? `aujourd'hui · ${fmtDayLong(today)}`
      : scope === 'tomorrow'
        ? `demain · ${fmtDayLong(addDays(today, 1))}`
        : scope === 'week'
          ? `semaine du ${fmtDay(weekStart)} au ${fmtDay(addDays(weekStart, 6))}`
          : scope === 'day'
            ? fmtDayLong(day)
            : '';

  // ── Le plan : qui on propose, mission par mission (moteur : weekPlan.ts) ──
  const { plans, staffWeek } = useMemo(() => {
    void version;
    if (!analysed) return { plans: [] as Plan[], staffWeek: [] };
    return buildWeekPlan({
      missions,
      allMissions: effMissions(),
      dates,
      today,
      needs,
      establishment,
      staff,
      pool,
      statuses,
      absences,
      restRules,
    });
  }, [analysed, missions, dates, today, needs, establishment, staff, pool, statuses, absences, restRules, version]);
  // Fixes concernés par la période : ceux qui y ont déjà quelque chose, ou à qui le plan propose quelque chose.
  const staffShown = staffWeek.filter((w) => w.shifts.length > 0 || w.added > 0);

  const weekStartOfDates = weekStartOf(dates[0] ?? today);
  const key = (m: Mission, c: Candidate) => `${m.id}:${c.id}`;
  const isOn = (m: Mission, c: Candidate) => !unchecked.has(key(m, c));
  const toggle = (m: Mission, c: Candidate) =>
    setUnchecked((s) => {
      const next = new Set(s);
      const k = key(m, c);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const selectedOf = (p: Plan) => [...p.salaries, ...p.extras].filter((c) => isOn(p.mission, c));
  const remainingOf = (p: Plan) => Math.max(p.missing - selectedOf(p).length, 0);

  const totalSelected = plans.reduce((s, p) => s + selectedOf(p).length, 0);
  const totalSalaries = plans.reduce((s, p) => s + p.salaries.filter((c) => isOn(p.mission, c)).length, 0);
  const totalExtras = plans.reduce((s, p) => s + p.extras.filter((c) => isOn(p.mission, c)).length, 0);
  const stillMissing = plans.filter((p) => remainingOf(p) > 0 && !launched.has(p.mission.id));
  const totalRemaining = stillMissing.reduce((s, p) => s + remainingOf(p), 0);
  const totalToCreate = plans.filter((p) => p.create).length;
  // Ce que coûterait le placement : paie des cochés, et auto-entrepreneurs si on publie le reste.
  const costCtx = {
    staff,
    pool,
    freelanceRates: cascade.freelanceRates,
    establishments,
    accountEstablishmentId: account.establishmentId,
  };
  const costPaie = Math.round(
    plans.reduce(
      (s, p) =>
        s + selectedOf(p).reduce((t, c) => t + missionHours(p.mission) * hourlyRateOf(c, p.mission.poste, costCtx), 0),
      0,
    ),
  );
  const costFreelance = Math.round(
    stillMissing.reduce(
      (s, p) => s + remainingOf(p) * missionHours(p.mission) * freelanceRateOfMission(p.mission, costCtx),
      0,
    ),
  );

  const defaultRate = (m: Mission) => {
    const estId = establishments.find((e) => e.name === m.establishment)?.id ?? account.establishmentId;
    return rateFor(cascade.freelanceRates, estId, m.poste);
  };

  // Lancer la recherche d'auto-entrepreneurs pour une mission (au tarif des Réglages).
  const searchNow = (m: Mission) => {
    const rate = defaultRate(m);
    writeFreelanceRate(m.id, rate);
    if (m.coverage === 'shortage' || m.coverage === 'suggested') writeCoverage(m.id, 'published');
    appendHistory(m.id, `Recherche d'auto-entrepreneurs lancée par l'optimisation · ${rate} €/h TTC`);
  };
  // Un créneau pas encore créé : on note le choix, la recherche partira à la création.
  const launchSearch = (p: Plan) => {
    if (!p.create) searchNow(p.mission);
    setLaunched((s) => new Set(s).add(p.mission.id));
  };

  // Placer pour de bon tout ce qui est coché.
  const apply = (withSearches: boolean) => {
    let placedCount = 0;
    let searches = 0;
    let createdCount = 0;
    // Formule : les créneaux à créer sont des shifts employés, jamais au-delà de ce que chaque mois permet.
    const rooms = new Map<string, number>();
    let skipped = 0;
    // Tout ce qui suit se défait d'un coup avec « Annuler le placement ».
    beginUndoable('Optimisation');
    plans.forEach((p) => {
      if (p.create) {
        const month = monthOf(p.mission.date);
        const room = rooms.get(month) ?? employeeShiftRoom(plan, month);
        if (room <= 0) {
          skipped += 1;
          return;
        }
        rooms.set(month, room - 1);
      }
      const picked = selectedOf(p);
      const added: MissionPlaced[] = picked.map((c) => ({ id: c.id, name: c.name, kind: c.kind, checkedIn: false }));
      const who = picked.map((c) => `${c.name}${c.contract ? ` (${c.contract})` : ''}`).join(', ');
      const wantsSearch = (withSearches && remainingOf(p) > 0) || launched.has(p.mission.id);
      let target = p.mission;
      if (p.create) {
        // Créneau attendu : la mission naît ici, avec les personnes choisies dedans.
        const v = p.mission;
        target = createMission({
          poste: v.poste,
          establishment: v.establishment,
          date: v.date,
          start: v.start,
          end: v.end,
          required: v.required,
          system: 'employe',
          coverage: added.length >= v.required ? 'complete' : 'shortage',
          placed: added,
          candidates: [],
          estimatedCost: 0,
          history: [
            {
              at: 'maintenant',
              label: `Créée par l'optimisation (${p.slotLabel ? `${p.slotLabel.toLowerCase()} ` : ''}attendu le ${fmtDay(v.date)})${who ? ` · ${who} placé·e${picked.length > 1 ? 's' : ''}` : ''}`,
            },
          ],
        });
        createdCount += 1;
        placedCount += picked.length;
      } else if (picked.length > 0) {
        writePlaced(p.mission.id, [...effPlaced(p.mission), ...added]);
        appendHistory(p.mission.id, `Optimisation : ${who} placé·e${picked.length > 1 ? 's' : ''}`);
        placedCount += picked.length;
      }
      if (wantsSearch && (p.create || !launched.has(p.mission.id))) {
        searchNow(target);
        searches += 1;
      }
    });
    const summary = [
      createdCount > 0
        ? `${createdCount} mission${createdCount > 1 ? 's' : ''} créée${createdCount > 1 ? 's' : ''}`
        : '',
      `${placedCount} personne${placedCount > 1 ? 's' : ''} placée${placedCount > 1 ? 's' : ''}`,
    ]
      .filter(Boolean)
      .join(' · ');
    endUndoable(`Optimisation : ${summary}`);
    setDone({ placed: placedCount, searches: Math.max(searches, launched.size), created: createdCount, skipped });
  };

  const SCOPES: { key: Scope; label: string; hint: string }[] = [
    { key: 'today', label: "Aujourd'hui", hint: fmtDay(today) },
    { key: 'tomorrow', label: 'Demain', hint: fmtDay(addDays(today, 1)) },
    { key: 'week', label: 'Toute la semaine', hint: `${fmtDay(weekStart)} → ${fmtDay(addDays(weekStart, 6))}` },
    { key: 'day', label: 'Un jour en particulier', hint: 'choisir la date' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-se-ink/40" />
      <div
        role="dialog"
        aria-label="Optimiser le planning"
        className="se-root relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-se-surface rounded-se shadow-se-md overflow-hidden"
      >
        <header className="flex items-center gap-3 px-5 py-4 border-b border-se-line">
          <span className="w-9 h-9 rounded-se-sm bg-se-blue-wash text-se-blue-ink grid place-items-center shrink-0">
            <Sparkles className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-se-ink">Optimiser le planning</h2>
            <p className="text-xs text-se-muted truncate">
              {analysed && scope ? scopeLabel : 'Salariés disponibles → extras (CDD d’usage) → auto-entrepreneurs'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="ml-auto w-8 h-8 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* ── 1. La portée ──────────────────────────────────── */}
          {!analysed && (
            <>
              <p className="se-eyebrow mb-2">Optimiser pour</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {SCOPES.map((s) => {
                  const on = scope === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setScope(s.key)}
                      className={`text-left rounded-se border p-3 transition-colors ${
                        on
                          ? 'border-se-blue ring-1 ring-se-blue bg-se-blue-wash/40'
                          : 'border-se-line hover:border-se-muted'
                      }`}
                    >
                      <span className="block font-semibold text-se-ink">{s.label}</span>
                      <span className="block text-xs text-se-muted mt-0.5">{s.hint}</span>
                    </button>
                  );
                })}
              </div>
              {scope === 'day' && (
                <label className="mt-3 inline-flex items-center gap-2 text-sm text-se-ink">
                  <CalendarDays className="w-4 h-4 text-se-muted" aria-hidden="true" />
                  <input
                    type="date"
                    value={day}
                    min={today}
                    onChange={(e) => setDay(e.target.value)}
                    className="h-10 rounded-se-sm border border-se-line bg-se-surface px-3 text-sm text-se-ink focus:outline-none focus:border-se-blue"
                  />
                </label>
              )}
              <p className="text-xs text-se-muted mt-4 leading-relaxed">
                L’optimisation lit vos besoins (Réglages › Postes), crée les créneaux attendus qui manquent, pose
                d’abord les horaires du contrat de vos fixes, puis les autres salariés disponibles, puis vos extras en
                CDD d’usage, et vous laisse lancer la recherche d’auto-entrepreneurs pour ce qui reste. Elle respecte
                les jours de repos, les congés, les heures du contrat et les règles de repos (11 h entre deux journées,
                jours d’affilée, repos de la semaine). Rien n’est placé sans votre accord.
              </p>
            </>
          )}

          {/* ── 2. Les propositions ──────────────────────────── */}
          {analysed && !done && (
            <>
              {plans.length === 0 ? (
                <div className="text-center py-10">
                  <Check className="w-8 h-8 mx-auto text-se-success mb-2" aria-hidden="true" />
                  <p className="font-semibold text-se-ink">Tout est déjà couvert</p>
                  <p className="text-sm text-se-muted mt-1">Aucune place à pourvoir sur cette période.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-se-ink mb-3">
                    {plans.length - totalToCreate > 0 && (
                      <>
                        <strong>{plans.length - totalToCreate}</strong> mission
                        {plans.length - totalToCreate > 1 ? 's' : ''} à compléter
                      </>
                    )}
                    {totalToCreate > 0 && (
                      <>
                        {plans.length - totalToCreate > 0 && ' · '}
                        <span className="text-se-blue-ink font-semibold">
                          {totalToCreate} créneau{totalToCreate > 1 ? 'x' : ''} attendu{totalToCreate > 1 ? 's' : ''} à
                          créer
                        </span>
                      </>
                    )}
                    {' · '}
                    <span className="text-se-blue-ink font-semibold">
                      {totalSalaries} salarié{totalSalaries > 1 ? 's' : ''}
                    </span>
                    {' · '}
                    <span className="text-se-extra-ink font-semibold">
                      {totalExtras} extra{totalExtras > 1 ? 's' : ''}
                    </span>
                    {totalRemaining > 0 && (
                      <>
                        {' · '}
                        <span className="text-se-danger font-semibold">
                          {totalRemaining} place{totalRemaining > 1 ? 's' : ''} sans personne
                        </span>
                      </>
                    )}
                  </p>
                  {(costPaie > 0 || costFreelance > 0) && (
                    <p className="text-xs text-se-muted -mt-2 mb-3">
                      Coût estimé : <span className="font-semibold text-se-ink">+{euros(costPaie)}</span> de paie brute
                      pour les personnes cochées
                      {costFreelance > 0 && (
                        <>
                          {' '}
                          · <span className="font-semibold text-se-freelance-ink">+{euros(costFreelance)}</span> TTC si
                          le reste part aux auto-entrepreneurs
                        </>
                      )}
                      .
                    </p>
                  )}
                  {/* ── Vos fixes sur la semaine : heures déjà placées + proposées, face au contrat ── */}
                  {staffShown.length > 0 && (
                    <div className="rounded-se border border-se-line bg-se-surface-2/40 px-3 py-2.5 mb-3">
                      <p className="se-eyebrow mb-1.5">
                        Vos fixes · semaine du {fmtDay(weekStartOfDates)}{' '}
                        <span className="normal-case tracking-normal font-normal text-se-muted">
                          · heures placées / contrat
                        </span>
                      </p>
                      <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
                        {staffShown.map((w) => {
                          const total = Math.round((w.before + w.added) * 10) / 10;
                          const pct = Math.min(100, Math.round((total / Math.max(w.cap, 1)) * 100));
                          const tone = total > w.cap ? 'bg-se-danger' : pct >= 90 ? 'bg-se-success' : 'bg-se-blue';
                          return (
                            <li key={w.id} className="min-w-0">
                              <div className="flex items-center gap-2 text-xs">
                                <Avatar person={{ id: w.id, name: w.name, kind: 'salarie' }} size={22} />
                                <span className="font-semibold text-se-ink truncate">{w.name}</span>
                                <span className="ml-auto tabular-nums text-se-muted whitespace-nowrap">
                                  {w.shifts.length} créneau{w.shifts.length > 1 ? 'x' : ''} ·{' '}
                                  <span className={total > w.cap ? 'text-se-danger font-semibold' : 'text-se-ink'}>
                                    {total} h
                                  </span>{' '}
                                  / {w.cap} h{w.added > 0 && <span className="text-se-blue-ink"> · +{w.added} h</span>}
                                </span>
                              </div>
                              <div
                                className="h-1 mt-1 rounded-full bg-se-surface-2 overflow-hidden"
                                role="progressbar"
                                aria-valuenow={pct}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={`${w.name} : ${total} h sur ${w.cap} h`}
                              >
                                <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  <ul className="space-y-3">
                    {plans.map((p) => {
                      const remaining = remainingOf(p);
                      const isLaunched = launched.has(p.mission.id);
                      return (
                        <li key={p.mission.id} className="rounded-se border border-se-line overflow-hidden">
                          <button
                            type="button"
                            disabled={p.create}
                            onClick={() => onOpenMission(p.mission.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 bg-se-surface-2/60 text-left hover:bg-se-surface-2 disabled:hover:bg-se-surface-2/60"
                          >
                            {p.create && (
                              <CalendarPlus className="w-4 h-4 text-se-blue-ink shrink-0" aria-hidden="true" />
                            )}
                            <span className="font-semibold text-se-ink">{p.mission.poste}</span>
                            <span className="text-xs text-se-muted">
                              {fmtDay(p.mission.date)} · {p.mission.start}–{p.mission.end} · {p.mission.establishment}
                            </span>
                            {p.create ? (
                              <span
                                className="ml-auto se-badge bg-se-blue-wash text-se-blue-ink"
                                style={{ height: 18 }}
                              >
                                {p.slotLabel ?? 'Attendu'} · à créer · {p.missing} pers.
                              </span>
                            ) : (
                              <>
                                <span
                                  className="ml-auto se-badge bg-se-danger-wash text-se-danger"
                                  style={{ height: 18 }}
                                >
                                  {p.missing} place{p.missing > 1 ? 's' : ''}
                                </span>
                                <ArrowRight className="w-3.5 h-3.5 text-se-muted" aria-hidden="true" />
                              </>
                            )}
                          </button>
                          <ul className="divide-y divide-se-line">
                            {[...p.salaries, ...p.extras].map((c) => {
                              const k = personKindStyle[c.kind];
                              const on = isOn(p.mission, c);
                              return (
                                <li key={c.id}>
                                  <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-se-surface-2/50">
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      onChange={() => toggle(p.mission, c)}
                                      className="accent-se-blue"
                                    />
                                    <Avatar person={c} size={28} />
                                    <span
                                      className={`text-sm font-semibold ${on ? 'text-se-ink' : 'text-se-muted line-through'}`}
                                    >
                                      {c.name}
                                    </span>
                                    <span className={`se-badge ${k.wash} ${k.text}`} style={{ height: 18 }}>
                                      {c.contract ? `Extra · ${c.contract}` : k.label}
                                    </span>
                                    {c.fixed && (
                                      <span
                                        className="se-badge bg-se-blue-wash text-se-blue-ink inline-flex items-center gap-1"
                                        style={{ height: 18 }}
                                        title="Ce créneau est dans ses horaires du contrat (Réglages › Personnel)"
                                      >
                                        <FileText className="w-3 h-3" aria-hidden="true" /> Horaires du contrat
                                      </span>
                                    )}
                                    {c.wish && (
                                      <span
                                        className="se-badge bg-se-cascade-wash text-se-cascade-ink inline-flex items-center gap-1"
                                        style={{ height: 18 }}
                                        title="Personne d'autre de libre : placé·e malgré son souhait (Réglages › Personnel › Souhaits)"
                                      >
                                        <HeartOff className="w-3 h-3" aria-hidden="true" /> Contre son souhait ·{' '}
                                        {c.wish}
                                      </span>
                                    )}
                                  </label>
                                </li>
                              );
                            })}
                            {p.resting.length > 0 && (
                              <li className="flex items-center gap-2 px-3 py-1.5 text-xs text-se-muted">
                                <BedDouble className="w-3.5 h-3.5" aria-hidden="true" />
                                Indisponibles ce jour-là : {p.resting.join(', ')}
                              </li>
                            )}
                            {p.overHours.length > 0 && (
                              <li className="flex items-center gap-2 px-3 py-1.5 text-xs text-se-muted">
                                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                                Heures hebdo atteintes : {p.overHours.join(', ')}
                              </li>
                            )}
                            {p.restRule.length > 0 && (
                              <li className="flex items-start gap-2 px-3 py-1.5 text-xs text-se-muted">
                                <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                                <span>Règles de repos : {p.restRule.join(' · ')}</span>
                              </li>
                            )}
                            {remaining > 0 && (
                              <li className="flex flex-wrap items-center gap-2 px-3 py-2 bg-se-freelance-wash/40">
                                <span className="text-sm text-se-ink">
                                  Il manque encore <strong>{remaining}</strong> place{remaining > 1 ? 's' : ''}
                                  {p.salaries.length + p.extras.length === 0
                                    ? ' — personne de disponible en interne'
                                    : ''}
                                  .
                                </span>
                                {isLaunched ? (
                                  <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-se-freelance-ink">
                                    <Check className="w-3.5 h-3.5" aria-hidden="true" /> Recherche lancée ·{' '}
                                    {defaultRate(p.mission)} €/h
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => launchSearch(p)}
                                    className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-se-sm text-xs font-semibold bg-se-freelance text-white hover:opacity-90"
                                  >
                                    <Search className="w-3.5 h-3.5" aria-hidden="true" /> Lancer la recherche
                                    d’auto-entrepreneurs
                                  </button>
                                )}
                              </li>
                            )}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          )}

          {/* ── 3. Fait ───────────────────────────────────────── */}
          {done && (
            <div className="text-center py-8">
              <Check className="w-8 h-8 mx-auto text-se-success mb-2" aria-hidden="true" />
              <p className="font-semibold text-se-ink">
                {done.created > 0
                  ? `${done.created} mission${done.created > 1 ? 's' : ''} créée${done.created > 1 ? 's' : ''} · `
                  : ''}
                {done.placed} personne{done.placed > 1 ? 's' : ''} placée{done.placed > 1 ? 's' : ''}
                {done.searches > 0
                  ? ` · ${done.searches} recherche${done.searches > 1 ? 's' : ''} d’auto-entrepreneurs lancée${done.searches > 1 ? 's' : ''}`
                  : ''}
              </p>
              {done.skipped > 0 && (
                <p className="text-sm text-se-danger mt-1">
                  {done.skipped} créneau{done.skipped > 1 ? 'x' : ''} non créé{done.skipped > 1 ? 's' : ''} : la formule{' '}
                  {planName(plan)} permet {planLimits(plan).employeeShiftsPerMonth} shifts employés par mois.
                  Publiez-les aux auto-entrepreneurs (illimité) ou changez de formule dans Réglages › Abonnement.
                </p>
              )}
              <p className="text-sm text-se-muted mt-1">
                Le planning est à jour. Les personnes placées seront prévenues quand vous enverrez la semaine aux
                équipes. Un doute ? « Annuler le placement » remet tout comme avant.
              </p>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 px-5 py-4 border-t border-se-line">
          {!analysed ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!scope}
                onClick={() => setAnalysed(true)}
                className="ml-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink disabled:opacity-40"
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" /> Voir les propositions
              </button>
            </>
          ) : done ? (
            <>
              <button
                type="button"
                onClick={() => {
                  undoLast();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
              >
                <Undo2 className="w-4 h-4" aria-hidden="true" /> Annuler le placement
              </button>
              <button
                type="button"
                onClick={onClose}
                className="ml-auto px-4 py-2.5 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
              >
                Fermer
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setAnalysed(false);
                  setUnchecked(new Set());
                }}
                className="px-4 py-2.5 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
              >
                Changer la période
              </button>
              {plans.length > 0 && (
                <>
                  {totalRemaining > 0 && (
                    <button
                      type="button"
                      onClick={() => apply(true)}
                      className="ml-auto inline-flex items-center gap-1.5 px-4 py-2.5 rounded-se-sm text-sm font-semibold border border-se-freelance text-se-freelance-ink hover:bg-se-freelance-wash"
                    >
                      <Search className="w-4 h-4" aria-hidden="true" />
                      Placer et publier le reste ({totalRemaining})
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={totalSelected === 0 && launched.size === 0 && totalToCreate === 0}
                    onClick={() => apply(false)}
                    className={`${totalRemaining > 0 ? '' : 'ml-auto'} px-4 py-2.5 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink disabled:opacity-40`}
                  >
                    {totalToCreate > 0
                      ? `Créer ${totalToCreate} et placer ${totalSelected}`
                      : `Placer ${totalSelected} personne${totalSelected > 1 ? 's' : ''}`}
                  </button>
                </>
              )}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
