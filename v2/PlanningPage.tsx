/**
 * Planning — accueil de l'espace client v2.
 * En-tête : période + taux de couverture, bouton Aujourd'hui, choix
 * Semaine / Mois, filtre par établissement.
 * Deux vues : Semaine (grille par poste) · Mois (calendrier).
 * Une carte ouvre la fenêtre de mission.
 */
import { useEffect, useMemo, useState } from 'react';
import { fillPct } from './coverage';
import { MOCK_TODAY } from '@/mocks/v2Today';
import {
  Sparkles,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Building2,
  ShieldAlert,
  Send,
  Undo2,
  Check,
  X,
} from 'lucide-react';
import type { Mission, MissionPerson } from '@/mocks/v2Missions';
import { people } from '@/mocks/v2People';
import type { Person } from '@/mocks/v2People';
import { useV2People } from '@/stores/v2PeopleStore';
import { ExportMenu } from './ExportMenu';
import { exportPeople, exportPlanning } from './export';
import { usePosteNeeds, useV2Settings, exceptionOn, seasonOn } from '@/stores/v2SettingsStore';
import type { PosteSlot } from '@/stores/v2SettingsStore';
import { useUnavailability, offLabel } from './people/availability';
import { printWeekPlanning } from './planning/printPlanning';
import { useV2Ui } from '@/stores/v2UiStore';
import {
  useMissionStore,
  effPlaced,
  effPlacedCount,
  effRequired,
  visibleMissions,
  isLive,
  effUndoable,
  undoLast,
  effSentWeek,
  weekChangesSince,
  rescheduleMission,
  appendHistory,
  beginUndoable,
  endUndoable,
} from './mission/missionStore';
import { SendWeekDialog } from './planning/SendWeekDialog';
import { costOf, euros } from './planning/cost';
import { QuickFill } from './planning/QuickFill';
import { OptimizeDialog } from './planning/OptimizeDialog';
import type { Scope as OptimizeScope } from './planning/OptimizeDialog';
import { hoursPlacedInWeek, restIssue, restIssues, shiftsOf } from './planning/weekPlan';
import { applyContractShifts, contractShiftsPlaced } from './planning/contractFill';
import { addDays, parseISO } from './time';
import { PredictionDialog } from './planning/PredictionDialog';
import { predictTeams, applyTeamSuggestions, pendingSuggestions } from './planning/prediction';
import { UpgradeDialog } from './settings/UpgradeDialog';
import { planLimits, isUnlimited, planName, employeeShiftsInMonth, monthLabel, monthOf } from './plan';
import { MissionCard } from './planning/MissionCard';
import { WeekView } from './planning/WeekView';
import type { RowDef } from './planning/WeekView';
import { Avatar } from './Avatar';
import { personKindStyle } from './coverage';
import { MonthView } from './planning/MonthView';
import { DayView } from './planning/DayView';
import { PublishPanel } from './publish/PublishPanel';
import { printProfiles } from './mission/printProfiles';

type View = 'jour' | 'semaine' | 'mois';
/** Filtre d'affichage : tout (défaut), un poste, ou le planning d'une personne. */
type Lens = 'normal' | 'poste' | 'etablissement' | 'personnel';
const TODAY = MOCK_TODAY;
const ALL = 'all';
/** Le prédictif propose l'équipe habituelle une fois par session (pas à chaque visite). */
let autoPredicted = false;

/* ── Préférences d'affichage (navigateur) : vue · affichage · établissement ── */
const PREFS_KEY = 'se-v2-planning';
interface Prefs {
  view?: View;
  lens?: Lens;
  establishment?: string;
}
function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Prefs) : {};
  } catch {
    return {};
  }
}
function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* stockage indisponible (navigation privée…) : on ignore */
  }
}
/** « mar. 4 nov. à 10:12 » */
const fmtSentAt = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};
const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

export function PlanningPage() {
  const version = useMissionStore(); // les stats et filtres suivent les placements en direct
  const [publishing, setPublishing] = useState(false);
  // Préremplissage du panneau Publier depuis une case « à pourvoir » (poste, jour, créneau).
  const [prefill, setPrefill] = useState<{ poste?: string; date?: string; slot?: PosteSlot } | null>(null);
  // « + » sur une case à pourvoir : placer quelqu'un directement, ou publier.
  const [quick, setQuick] = useState<{ poste?: string; date: string; slot?: PosteSlot } | null>(null);
  // Vue, affichage et filtre : retrouvés d'une visite à l'autre (ce navigateur).
  // Sur téléphone, sans préférence enregistrée, on ouvre sur la journée.
  const prefs = useMemo(loadPrefs, []);
  const [view, setView] = useState<View>(prefs.view ?? (isPhone() ? 'jour' : 'semaine'));
  const [establishment, setEstablishment] = useState<string>(prefs.establishment ?? ALL);
  const [todayTick, setTodayTick] = useState(0);
  const [lens, setLens] = useState<Lens>(prefs.lens ?? 'normal');
  useEffect(() => savePrefs({ view, establishment, lens }), [view, establishment, lens]);
  const posteConfig = usePosteNeeds(); // postes actifs et leurs jours (Réglages)
  // Freelance uniquement : même planning, mais on ne fait que publier aux auto-entrepreneurs.
  const freelanceOnly = useV2Ui((s) => s.mode) === 'freelance';
  const setMode = useV2Ui((s) => s.setMode);
  const [upgrading, setUpgrading] = useState(false);
  // Formule : combien de shifts employés le mois permet encore (null = illimité).
  const plan = useV2Ui((s) => s.plan);
  const shiftLimit = isUnlimited(planLimits(plan).employeeShiftsPerMonth)
    ? null
    : planLimits(plan).employeeShiftsPerMonth;
  // Ouverture / fermeture d'une mission demandée ailleurs (cloche, duplication, annulation).
  const requestOpenMission = useV2Ui((s) => s.requestOpenMission);
  // « Prédictif » : suggestions d'équipe habituelle et missions habituelles à créer.
  const [predicting, setPredicting] = useState(false);
  // « Optimiser » : salariés disponibles → extras → recherche d'auto-entrepreneurs.
  // Depuis la vue Par personnel, « Placer les fixes sur la semaine » ouvre directement la semaine.
  const [optimizing, setOptimizing] = useState<false | { scope?: OptimizeScope }>(false);
  // « Envoyer la semaine aux équipes » : chaque personne placée reçoit ses créneaux.
  const [sending, setSending] = useState(false);
  // Bandeau « Annuler le placement » replié à la main (par libellé : un nouveau placement le rouvre).
  const [undoHidden, setUndoHidden] = useState<string | null>(null);
  // Glisser-déposer refusé (passé, jour fermé, horaires figés) : la raison, quelques secondes.
  const [moveNotice, setMoveNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!moveNotice) return;
    const t = setTimeout(() => setMoveNotice(null), 6000);
    return () => clearTimeout(t);
  }, [moveNotice]);
  // Exports Excel : ce qu'il faut pour les listes de personnes.
  const staff = useV2Settings((s) => s.staff);
  const pool = useV2Settings((s) => s.pool);
  const freelanceRates = useV2Settings((s) => s.cascade.freelanceRates);
  const account = useV2Settings((s) => s.account);
  const restRules = useV2Settings((s) => s.restRules);
  const exceptions = useV2Settings((s) => s.exceptions);
  const seasons = useV2Settings((s) => s.seasons);
  const statuses = useV2People((s) => s.statuses);
  const absences = useV2People((s) => s.absences);
  const favorites = useV2People((s) => s.favorites);
  const addedStaff = useMemo<Person[]>(
    () =>
      staff
        .filter((r) => !people.some((p) => p.id === r.personId || p.name === r.name))
        .map((r) => ({
          id: r.personId,
          name: r.name,
          kind: 'salarie',
          status: 'actif',
          roles: r.postes,
          missionsDone: 0,
          hoursThisMonth: 0,
          reliability: 0,
        })),
    [staff],
  );
  const whyOff = useUnavailability(); // repos fixe ou absence déclarée

  // Missions du mock + celles créées pendant la session (placement direct, publication).
  // En mode auto-entrepreneur : seulement les missions qui les concernent, et
  // personne d'autre dedans — aucun salarié ni extra n'apparaît.
  const allMissions = useMemo(() => {
    void version;
    // Annulées comprises : elles restent hachurées à leur place (jamais effacées).
    return visibleMissions(freelanceOnly, true);
  }, [version, freelanceOnly]);
  // Établissements : ceux des Réglages (y compris ajoutés), plus ceux présents dans les missions.
  const configured = useV2Settings((s) => s.establishments);
  const establishments = useMemo(
    () => Array.from(new Set([...configured.map((e) => e.name), ...allMissions.map((m) => m.establishment)])),
    [configured, allMissions],
  );

  // Filtre établissement appliqué à tout l'écran (stats, vues, fenêtre).
  const missions = useMemo(
    () => (establishment === ALL ? allMissions : allMissions.filter((m) => m.establishment === establishment)),
    [establishment, allMissions],
  );
  // Pour compter, exporter, suggérer : seulement les missions encore d'actualité.
  const liveMissions = useMemo(() => missions.filter(isLive), [missions]);

  // Semaine affichée : ancrée sur les données, puis décalée avec ‹ › ; « Aujourd'hui » revient.
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => {
    // Semaine standard lundi → dimanche, celle d'aujourd'hui (les missions passées
    // du mock ne doivent pas tirer le planning en arrière).
    const [y, mo, d] = TODAY.split('-').map(Number);
    const today = new Date(y, mo - 1, d);
    const s = new Date(y, mo - 1, d - ((today.getDay() + 6) % 7) + weekOffset * 7);
    return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
  }, [weekOffset]);
  // Lignes de la grille selon l'affichage :
  //  · Par poste → une ligne par poste programmé (ordre de la config, puis les autres) ;
  //  · Par personnel → une ligne par personne réservée (placée), photo + nom.
  // En vue normale (Tout), la grille suit la config du compte sans étiquette.
  const rows = useMemo<RowDef[] | undefined>(() => {
    void version; // les personnes réservées suivent les placements en direct
    if (lens === 'poste') {
      const configured = posteConfig.map((c) => c.poste);
      const present = Array.from(new Set(liveMissions.map((m) => m.poste)));
      const postes = [
        ...configured.filter((p) => present.includes(p)),
        ...present.filter((p) => !configured.includes(p)),
      ];
      return postes.map((poste) => ({
        key: poste,
        poste,
        filter: (m) => m.poste === poste,
        // Étiquette compacte : la colonne de gauche reste étroite, le texte passe à la ligne.
        label: <span className="block text-xs font-semibold text-se-ink leading-tight break-words">{poste}</span>,
      }));
    }
    if (lens === 'personnel') {
      // Une ligne par personne (clé = nom : la même personne peut porter
      // plusieurs identifiants dans les données de démo) : d'abord TOUS les
      // fixes des Réglages, même sans rien cette semaine (on voit qui est
      // libre), puis les autres personnes placées.
      const people = new Map<string, MissionPerson>();
      staff.forEach((r) => people.set(r.name, { id: r.personId, name: r.name, kind: 'salarie' }));
      liveMissions.forEach((m) =>
        effPlaced(m).forEach((p) => !p.suggested && !people.has(p.name) && people.set(p.name, p)),
      );
      return Array.from(people.values())
        .sort((a, b) => Number(b.kind === 'salarie') - Number(a.kind === 'salarie') || a.name.localeCompare(b.name))
        .map((p) => {
          const rule = staff.find((r) => r.name === p.name);
          // Heures fermes de la semaine affichée, face au contrat (tous établissements).
          const hours = rule ? Math.round(hoursPlacedInWeek(allMissions, p.name, weekStart) * 10) / 10 : 0;
          const over = !!rule && hours > rule.weeklyHours;
          // Règles de repos (11 h entre deux journées, jours d'affilée…) déjà enfreintes cette semaine.
          const issues = rule ? restIssues(allMissions, p.name, weekStart, restRules) : [];
          return {
            key: p.name,
            filter: (m) => effPlaced(m).some((x) => x.name === p.name && !x.suggested),
            // Case vide → « repos » / « congés »… quand la personne n'est pas disponible ce jour-là.
            off: (date) => {
              const r = whyOff(p, date);
              return r ? offLabel(r) : null;
            },
            label: (
              <span className="flex items-center gap-2 min-w-0">
                <Avatar person={p} size={28} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-se-ink truncate">{p.name}</span>
                  <span className={`block text-[11px] ${personKindStyle[p.kind].text}`}>
                    {personKindStyle[p.kind].label}
                    {rule && (
                      <span className={`tabular-nums ${over ? 'text-se-danger font-semibold' : 'text-se-muted'}`}>
                        {' '}
                        · {hours} h / {rule.weeklyHours} h
                      </span>
                    )}
                  </span>
                  {issues.length > 0 && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-se-danger"
                      title={issues.join(' · ')}
                    >
                      <ShieldAlert className="w-3 h-3" aria-hidden="true" /> Repos non respecté
                    </span>
                  )}
                </span>
              </span>
            ),
          };
        });
    }
    if (lens === 'etablissement') {
      // Une ligne par établissement (ceux des Réglages d'abord, puis ceux vus dans les missions).
      return establishments.map((name) => ({
        key: name,
        filter: (m) => m.establishment === name,
        label: (
          <span className="flex items-start gap-1.5 min-w-0">
            <Building2 className="w-3.5 h-3.5 mt-0.5 text-se-muted shrink-0" aria-hidden="true" />
            <span className="block text-xs font-semibold text-se-ink leading-tight break-words">{name}</span>
          </span>
        ),
      }));
    }
    return undefined;
  }, [lens, liveMissions, allMissions, version, posteConfig, establishments, whyOff, staff, weekStart, restRules]);
  // Les cases « à pourvoir » n'ont de sens que par poste (ou en vue normale).
  const needs = lens !== 'personnel' && lens !== 'etablissement';
  // Missions de la semaine affichée (export Excel du planning).
  const weekMissions = useMemo(() => {
    const [y, mo, d] = weekStart.split('-').map(Number);
    const end = new Date(y, mo - 1, d + 6);
    const endISO = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    return liveMissions.filter((m) => m.date >= weekStart && m.date <= endISO);
  }, [liveMissions, weekStart]);
  // En vue Mois « par personne », on ne garde que les missions des personnes filtrées.
  const monthMissions = lens === 'personnel' && rows ? missions.filter((m) => rows.some((r) => r.filter(m))) : missions;

  // En-tête : les chiffres de la période affichée (la semaine en vue Semaine), pas de tout le mock.
  const scoped = view === 'semaine' ? weekMissions : liveMissions;
  const required = scoped.reduce((s, m) => s + effRequired(m), 0);
  const placed = scoped.reduce((s, m) => s + effPlacedCount(m), 0);
  const coverage = fillPct(placed, required);
  const missing = Math.max(required - placed, 0);
  const gaugeTone = coverage >= 100 ? 'bg-se-success' : coverage === 0 ? 'bg-se-danger' : 'bg-se-cascade';
  // Ce que coûte la période affichée : paie des salariés / extras placés + auto-entrepreneurs (devis ou tarif).
  const cost = useMemo(() => {
    void version;
    return costOf(scoped, {
      staff,
      pool,
      freelanceRates,
      establishments: configured,
      accountEstablishmentId: account.establishmentId,
    });
  }, [scoped, staff, pool, freelanceRates, configured, account.establishmentId, version]);

  // Libellé de période selon la vue (la semaine est ancrée sur les données).
  const periodLabel = useMemo(() => {
    const [y, mo, d] = weekStart.split('-').map(Number);
    const a = new Date(y, mo - 1, d);
    const b = new Date(a);
    b.setDate(a.getDate() + 6);
    const fmt = (x: Date) => x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    // Une semaine type saisonnière en cours (Réglages › Postes) : on le dit à côté de la période.
    const season = seasonOn(seasons, weekStart) ?? seasonOn(seasons, addDays(weekStart, 6));
    const suffix = season ? ` · ${season.name}` : '';
    if (view === 'semaine') return `Semaine du ${fmt(a)} — ${fmt(b)}${suffix}`;
    if (view === 'mois') return 'Vue mensuelle';
    return 'Vue par jour';
  }, [view, weekStart, seasons]);

  // Envoi de la semaine affichée : fait ou non, et ce qui a bougé depuis.
  const { sent, sentChanges, undoable } = useMemo(() => {
    void version;
    return { sent: effSentWeek(weekStart), sentChanges: weekChangesSince(weekStart), undoable: effUndoable() };
  }, [weekStart, version]);

  // La fenêtre de mission est montée une fois pour toutes dans la coquille
  // (MissionWindowHost) : ici on ne fait que demander son ouverture.
  const openById = (id: string) => requestOpenMission(id);

  // Suggestions du prédictif encore à confirmer (pointillé), sur les missions affichées.
  const suggestions = pendingSuggestions(liveMissions, TODAY);
  // Prédictif actif : au premier affichage de la session, l'équipe habituelle est
  // proposée en pointillé sur les places libres à venir (jamais placée d'office).
  const staffRules = staff;
  useEffect(() => {
    if (freelanceOnly || autoPredicted) return;
    autoPredicted = true;
    applyTeamSuggestions(
      predictTeams(visibleMissions(false, true), { today: TODAY, isOff: whyOff, staff: staffRules, statuses }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Horaires du contrat (Réglages › Personnel) : la semaine affichée se préremplit
  // seule avec les créneaux fixes de chacun, à partir d'aujourd'hui. Chaque
  // (jour, personne, créneau) n'est tenté qu'une fois : un créneau retiré à la
  // main n'est pas reposé.
  // Shifts employés du mois affiché (celui de la semaine en vue).
  const periodMonth = monthOf(weekStart);
  const employeeShifts = useMemo(() => {
    void version;
    return employeeShiftsInMonth(periodMonth);
  }, [version, periodMonth]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const createIn = establishment === ALL ? (configured[0]?.name ?? '') : establishment;
  useEffect(() => {
    if (freelanceOnly) return;
    applyContractShifts({
      dates: weekDates,
      today: TODAY,
      staff,
      needs: posteConfig,
      establishment: createIn,
      statuses,
      absences,
      restRules,
    });
  }, [freelanceOnly, weekDates, staff, posteConfig, createIn, statuses, absences, restRules]);
  // Arrivée depuis le tableau de bord (« Optimiser le planning » / « Publier ») : la fenêtre s'ouvre d'emblée.
  const planningAction = useV2Ui((s) => s.planningAction);
  const requestPlanningAction = useV2Ui((s) => s.requestPlanningAction);
  useEffect(() => {
    if (!planningAction) return;
    if (planningAction === 'optimize') setOptimizing({});
    else if (planningAction === 'send') setSending(true);
    else if (planningAction === 'send-next') {
      // Alerte « semaine prochaine pas envoyée » : on se place sur la semaine prochaine.
      setView('semaine');
      setWeekOffset(1);
      setSending(true);
    } else if (planningAction === 'personnel') {
      setLens('personnel');
      setView('semaine');
    } else setPublishing(true);
    requestPlanningAction(null);
  }, [planningAction, requestPlanningAction]);
  const card = (m: Mission, dense?: boolean) => <MissionCard mission={m} dense={dense} onOpen={() => openById(m.id)} />;

  // Glisser-déposer : la mission change de jour, même horaire. Refusé dans le passé,
  // un jour fermé, ou quand un auto-entrepreneur validé fige les horaires. Si une
  // personne placée est en repos ou enfreint une règle ce jour-là, on déplace quand
  // même mais on le dit (bandeau « Annuler le placement » et historique).
  const moveMission = (id: string, date: string) => {
    const m = allMissions.find((x) => x.id === id);
    if (!m || m.date === date) return;
    const fmt = (iso: string) => parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
    if (date < TODAY) return setMoveNotice('On ne déplace pas une mission dans le passé.');
    const ex = exceptionOn(exceptions, date);
    if (ex?.kind === 'ferme')
      return setMoveNotice(`${fmt(date)} est fermé (${ex.label || 'journée fermée'}) : rien ne s'y pose.`);
    if (m.coverage === 'freelance_validated')
      return setMoveNotice('Un auto-entrepreneur est validé sur cette mission : ses horaires sont figés.');
    const others = allMissions.filter((x) => x.id !== m.id);
    const warnings = effPlaced(m)
      .filter((p) => !p.suggested)
      .map((p) => {
        const r = whyOff(p, date);
        if (r) return `${p.name} (${offLabel(r)} ce jour-là)`;
        const issue = restIssue(shiftsOf(others, p.name), { date, start: m.start, end: m.end }, restRules);
        return issue ? `${p.name} : ${issue}` : null;
      })
      .filter((w): w is string => !!w);
    beginUndoable('Déplacement');
    rescheduleMission(id, { date, start: m.start, end: m.end });
    appendHistory(
      id,
      `Déplacée du ${fmt(m.date)} au ${fmt(date)} (glisser-déposer)${warnings.length ? ` · attention : ${warnings.join(' · ')}` : ''}`,
    );
    endUndoable(
      `Déplacement : ${m.poste} du ${fmt(m.date)} au ${fmt(date)}${warnings.length ? ` · attention : ${warnings.join(' · ')}` : ''}`,
    );
  };

  const changeEstablishment = (value: string) => {
    setEstablishment(value);
  };

  // Un créneau attendu sans mission (« + ») → on demande : placer quelqu'un
  // directement, ou publier la mission (poste, jour et horaire déjà remplis).
  const createAt = (poste: string | undefined, date: string, slot?: PosteSlot) =>
    freelanceOnly ? publishAt(poste, date, slot) : setQuick({ poste, date, slot });
  const publishAt = (poste: string | undefined, date: string, slot?: PosteSlot) => {
    setQuick(null);
    setPrefill({ poste, date, slot });
    setPublishing(true);
  };

  return (
    <div className="p-4 md:p-6 max-w-[1700px] mx-auto">
      {/* ── En-tête ────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <p className="se-eyebrow mb-1">
            {periodLabel}
            {sent && (
              <span className="ml-2 inline-flex items-center gap-1 normal-case tracking-normal font-semibold text-se-success">
                <Check className="w-3 h-3" aria-hidden="true" />
                envoyée aux équipes {fmtSentAt(sent.at)}
                {sentChanges.length > 0
                  ? ` · ${sentChanges.length} personne${sentChanges.length > 1 ? 's' : ''} à prévenir depuis`
                  : ''}
              </span>
            )}
          </p>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-se-ink">Planning</h1>
            {!freelanceOnly && (
              <button
                type="button"
                onClick={() => setPredicting(true)}
                title="Équipe habituelle, missions habituelles, suggestions à confirmer"
                className="inline-flex items-center gap-1 se-badge bg-se-blue-wash text-se-blue-ink hover:bg-se-blue hover:text-white transition-colors"
              >
                <Sparkles className="w-3 h-3" aria-hidden="true" /> Prédictif
                {suggestions.length > 0 ? ` · ${suggestions.length} à confirmer` : ' actif'}
              </button>
            )}
          </div>
          {/* Jauge de couverture + chiffres clés, lisibles d'un coup d'œil */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5 text-sm">
            <div className="flex items-center gap-2">
              <div
                className="w-28 h-1.5 rounded-full bg-se-surface-2 overflow-hidden"
                role="progressbar"
                aria-valuenow={coverage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Taux de couverture"
              >
                <div
                  className={`h-full rounded-full ${gaugeTone} transition-all`}
                  style={{ width: `${Math.min(coverage, 100)}%` }}
                />
              </div>
              <span className="font-bold text-se-ink">{coverage} %</span>
              <span className="text-se-muted">couvert</span>
            </div>
            <span className="text-se-muted">
              {scoped.length} mission{scoped.length > 1 ? 's' : ''} · {placed}/{required} placés
            </span>
            {missing > 0 ? (
              <span className="se-badge bg-se-danger-wash text-se-danger">
                {missing} place{missing > 1 ? 's' : ''} à pourvoir
              </span>
            ) : (
              <span className="se-badge bg-se-success-wash text-se-success">Tout est couvert</span>
            )}
            {cost.total > 0 && (
              <span
                className="text-se-muted"
                title={
                  freelanceOnly
                    ? 'Auto-entrepreneurs placés : devis, sinon heures × tarif des Réglages'
                    : `Paie ${euros(cost.paie)} brut (heures × tarif horaire) · auto-entrepreneurs ${euros(cost.freelance)} TTC (devis, sinon tarif des Réglages)`
                }
              >
                · <span className="font-bold text-se-ink">{euros(freelanceOnly ? cost.freelance : cost.total)}</span>{' '}
                {view === 'semaine' ? 'cette semaine' : 'sur la période'}
                {!freelanceOnly && cost.freelance > 0 && cost.paie > 0 && (
                  <span className="hidden sm:inline">
                    {' '}
                    · paie {euros(cost.paie)} · auto-entrepreneurs {euros(cost.freelance)}
                  </span>
                )}
              </span>
            )}
            {!freelanceOnly && shiftLimit !== null && (
              <button
                type="button"
                onClick={() => setUpgrading(true)}
                title="Shifts proposés à votre personnel ce mois · les missions aux auto-entrepreneurs ne comptent pas"
                className={`se-badge ${
                  employeeShifts >= shiftLimit ? 'bg-se-danger-wash text-se-danger' : 'bg-se-surface-2 text-se-muted'
                } hover:underline`}
              >
                Shifts employés : {employeeShifts}/{shiftLimit} en {monthLabel(periodMonth)} · formule {planName(plan)}
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            {/* Exporter : PDF (boîte d'impression) ou Excel — planning et listes de personnes */}
            <ExportMenu
              entries={[
                {
                  key: 'pdf-week',
                  kind: 'pdf',
                  label: 'Planning de la semaine',
                  hint: 'A4 paysage, une carte par mission · Enregistrer en PDF',
                  run: () =>
                    printWeekPlanning({
                      weekStart,
                      missions,
                      establishment: establishment === ALL ? 'Tous les établissements' : establishment,
                    }),
                },
                {
                  key: 'pdf-profiles',
                  kind: 'pdf',
                  label: 'Profils validés de la semaine',
                  hint: 'Une fiche par personne validée, mission par mission · coordonnées des auto-entrepreneurs',
                  run: () =>
                    printProfiles(
                      weekMissions.filter(isLive).map((m) => ({ mission: m })),
                      `Profils validés · semaine du ${new Date(`${weekStart}T00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`,
                    ),
                },
                {
                  key: 'xls-week',
                  kind: 'excel',
                  label: 'Planning de la semaine',
                  hint: 'Une ligne par mission avec les personnes placées',
                  run: () => exportPlanning(weekMissions, periodLabel),
                },
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
            {!freelanceOnly && (
              <button
                type="button"
                onClick={() => setOptimizing({})}
                title="Placer vos salariés disponibles, puis vos extras, puis publier le reste"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-se-sm text-sm font-semibold border border-se-line bg-se-surface text-se-ink hover:bg-se-surface-2"
              >
                <Sparkles className="w-4 h-4 text-se-blue-ink" aria-hidden="true" /> Optimiser
              </button>
            )}
            {!freelanceOnly && (
              <button
                type="button"
                onClick={() => setSending(true)}
                title={
                  sent
                    ? sentChanges.length > 0
                      ? 'Des créneaux ont changé depuis l’envoi : prévenir les personnes concernées'
                      : `Semaine envoyée ${fmtSentAt(sent.at)} · tout le monde a le bon planning`
                    : 'Chaque personne placée reçoit ses créneaux de la semaine (appli et e-mail)'
                }
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-se-sm text-sm font-semibold border ${
                  sent && sentChanges.length > 0
                    ? 'border-se-blue text-se-blue-ink bg-se-blue-wash hover:bg-se-blue hover:text-white'
                    : sent
                      ? 'border-se-line bg-se-surface text-se-success hover:bg-se-surface-2'
                      : 'border-se-line bg-se-surface text-se-ink hover:bg-se-surface-2'
                }`}
              >
                {sent && sentChanges.length === 0 ? (
                  <>
                    <Check className="w-4 h-4" aria-hidden="true" /> Semaine envoyée
                  </>
                ) : sent ? (
                  <>
                    <Send className="w-4 h-4" aria-hidden="true" /> Prévenir {sentChanges.length} personne
                    {sentChanges.length > 1 ? 's' : ''}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" aria-hidden="true" /> Envoyer la semaine
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setPublishing(true)}
              className={`px-4 py-2.5 rounded-se-sm text-sm font-semibold text-white ${
                freelanceOnly ? 'bg-se-freelance hover:opacity-90' : 'bg-se-blue hover:bg-se-blue-ink'
              }`}
            >
              {freelanceOnly ? 'Publier aux auto-entrepreneurs' : 'Publier une mission'}
            </button>
          </div>
          {freelanceOnly && (
            <button
              type="button"
              onClick={() => setUpgrading(true)}
              className="text-xs font-semibold text-se-blue-ink hover:text-se-blue"
            >
              Gérer aussi mes salariés et extras ? Passer à la Gestion complète ›
            </button>
          )}
        </div>
      </header>

      {/* ── Barre de contrôles ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button
          type="button"
          onClick={() => {
            setTodayTick((t) => t + 1);
            setWeekOffset(0);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-se-sm text-sm font-semibold border border-se-line bg-se-surface text-se-ink hover:bg-se-surface-2"
        >
          <CalendarDays className="w-4 h-4" aria-hidden="true" /> Aujourd'hui
        </button>
        {view === 'semaine' && (
          <div className="inline-flex items-center rounded-se-sm border border-se-line bg-se-surface">
            <button
              type="button"
              aria-label="Semaine précédente"
              onClick={() => setWeekOffset((o) => o - 1)}
              className="w-9 h-[34px] grid place-items-center text-se-muted hover:text-se-ink hover:bg-se-surface-2 rounded-l-se-sm"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Semaine suivante"
              onClick={() => setWeekOffset((o) => o + 1)}
              className="w-9 h-[34px] grid place-items-center text-se-muted hover:text-se-ink hover:bg-se-surface-2 rounded-r-se-sm border-l border-se-line"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="inline-flex p-1 rounded-se-sm bg-se-surface-2 border border-se-line">
          {(['jour', 'semaine', 'mois'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-3.5 py-1.5 rounded-[7px] text-sm font-semibold capitalize transition-colors ${
                view === v ? 'bg-se-surface text-se-ink shadow-se' : 'text-se-muted hover:text-se-ink'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Filtre d'affichage : tout · par poste · par personnel */}
        <div className="inline-flex p-1 rounded-se-sm bg-se-surface-2 border border-se-line">
          {(
            [
              ['normal', 'Tout'],
              ['poste', 'Par poste'],
              ...(establishments.length > 1 ? [['etablissement', 'Par établissement']] : []),
              ['personnel', freelanceOnly ? 'Par auto-entrepreneur' : 'Par personnel'],
            ] as [Lens, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setLens(key);
                // « Par établissement » les montre tous : le filtre établissement n'a plus de sens.
                if (key === 'etablissement') setEstablishment(ALL);
              }}
              className={`px-3 py-1.5 rounded-[7px] text-sm font-semibold transition-colors ${
                lens === key ? 'bg-se-surface text-se-ink shadow-se' : 'text-se-muted hover:text-se-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Filtre établissement — même sélecteur que dans Factures & heures (inutile en vue par établissement) */}
        {establishments.length > 1 && lens !== 'etablissement' && (
          <label className="ml-auto relative inline-flex items-center">
            <span className="sr-only">Filtrer par établissement</span>
            <Building2 className="absolute left-3 w-4 h-4 text-se-muted pointer-events-none" aria-hidden="true" />
            <select
              value={establishment}
              onChange={(e) => changeEstablishment(e.target.value)}
              className={`h-10 pl-9 pr-8 rounded-se-sm border text-sm font-semibold appearance-none bg-se-surface focus:outline-none focus:border-se-blue ${
                establishment === ALL ? 'border-se-line text-se-ink' : 'border-se-blue text-se-blue-ink'
              }`}
            >
              <option value={ALL}>Tous les établissements</option>
              {establishments.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* ── Par personnel : la semaine des fixes, et un seul bouton pour la remplir ── */}
      {lens === 'personnel' && !freelanceOnly && staff.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4 rounded-se border border-se-line bg-se-surface-2/40 px-3.5 py-2.5 text-sm">
          <span className="text-se-ink">
            <span className="font-semibold">{staff.length} fixes</span> ·{' '}
            {Math.round(staff.reduce((t, r) => t + hoursPlacedInWeek(allMissions, r.name, weekStart), 0) * 10) / 10} h
            placées sur {staff.reduce((t, r) => t + r.weeklyHours, 0)} h de contrats cette semaine
            {(() => {
              void version;
              const fixed = contractShiftsPlaced(staff, posteConfig, weekDates);
              return fixed > 0
                ? ` · ${fixed} créneau${fixed > 1 ? 'x' : ''} du contrat déjà posé${fixed > 1 ? 's' : ''}`
                : '';
            })()}
            {staff.some((r) => hoursPlacedInWeek(allMissions, r.name, weekStart) > r.weeklyHours)
              ? ' · certains dépassent leurs heures'
              : ''}
            {staff.some((r) => restIssues(allMissions, r.name, weekStart, restRules).length > 0)
              ? ' · repos non respecté'
              : ''}
          </span>
          <button
            type="button"
            onClick={() => setOptimizing({ scope: 'week' })}
            title="Crée les créneaux attendus de la semaine et y place vos fixes selon leurs jours, leurs heures et leurs créneaux habituels"
            className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" /> Placer les fixes sur la semaine
          </button>
        </div>
      )}

      {/* ── Vues ───────────────────────────────────────────── */}
      {missions.length === 0 || (rows && rows.length === 0) ? (
        <p className="text-sm text-se-muted">
          {lens === 'personnel' ? 'Personne n’est encore réservé sur cette période.' : 'Aucune mission avec ce filtre.'}
        </p>
      ) : view === 'jour' ? (
        <DayView
          missions={missions}
          today={TODAY}
          focusToken={todayTick}
          onOpen={openById}
          onCreate={createAt}
          rows={rows}
          needs={needs && !freelanceOnly}
          plusOnly={freelanceOnly}
        />
      ) : view === 'semaine' ? (
        <WeekView
          missions={missions}
          today={TODAY}
          onOpen={openById}
          onCreate={createAt}
          renderCard={(m) => card(m, true)}
          rows={rows}
          needs={needs && !freelanceOnly}
          plusOnly={freelanceOnly}
          weekStart={weekStart}
          labelWidth={lens === 'poste' ? 96 : lens === 'etablissement' ? 128 : 172}
          onMove={lens === 'personnel' || freelanceOnly ? undefined : moveMission}
        />
      ) : (
        <MonthView
          missions={monthMissions}
          today={TODAY}
          focusToken={todayTick}
          onOpen={openById}
          onCreate={(date) => createAt(undefined, date)}
          postes={lens === 'poste' ? rows?.map((r) => r.key) : undefined}
          needs={needs && !freelanceOnly}
          plusOnly={freelanceOnly}
        />
      )}

      {predicting && (
        <PredictionDialog
          missions={missions}
          today={TODAY}
          establishment={
            establishment === ALL ? (configured[0]?.name ?? missions[0]?.establishment ?? '') : establishment
          }
          onClose={() => setPredicting(false)}
          onOpenMission={(id) => {
            setPredicting(false);
            openById(id);
          }}
        />
      )}

      {optimizing && (
        <OptimizeDialog
          missions={missions}
          today={TODAY}
          weekStart={weekStart}
          establishment={
            establishment === ALL ? (configured[0]?.name ?? missions[0]?.establishment ?? '') : establishment
          }
          initialScope={optimizing.scope}
          onClose={() => setOptimizing(false)}
          onOpenMission={(id) => {
            setOptimizing(false);
            openById(id);
          }}
        />
      )}
      {sending && <SendWeekDialog weekStart={weekStart} onClose={() => setSending(false)} />}

      {moveNotice && (
        <div
          role="alert"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)] rounded-se bg-se-danger text-white shadow-se-md px-4 py-2.5 text-sm font-semibold"
        >
          {moveNotice}
        </div>
      )}
      {/* ── Annuler le placement : tant que rien d'autre n'a bougé depuis ── */}
      {undoable && undoHidden !== undoable.label && !optimizing && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 max-w-[calc(100vw-2rem)] rounded-se bg-se-ink text-white shadow-se-md pl-4 pr-2 py-2.5 text-sm"
        >
          <span className="truncate">{undoable.label}</span>
          <button
            type="button"
            onClick={() => undoLast()}
            className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-se-sm font-semibold bg-white/15 hover:bg-white/25"
          >
            <Undo2 className="w-4 h-4" aria-hidden="true" /> Annuler le placement
          </button>
          <button
            type="button"
            aria-label="Masquer"
            onClick={() => setUndoHidden(undoable.label)}
            className="w-8 h-8 grid place-items-center rounded-se-sm text-white/70 hover:text-white hover:bg-white/15"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {upgrading && <UpgradeDialog onClose={() => setUpgrading(false)} onChosen={() => setMode('complete')} />}

      {quick && (
        <QuickFill
          poste={quick.poste}
          date={quick.date}
          slot={quick.slot}
          establishment={establishment === ALL ? undefined : establishment}
          onClose={() => setQuick(null)}
          onPublish={publishAt}
          onPlaced={(m) => {
            setQuick(null);
            requestOpenMission(m.id); // la fenêtre s'ouvre sur la mission créée
          }}
        />
      )}

      {publishing && (
        <PublishPanel
          initialSystem={freelanceOnly ? 'freelance' : 'cascade'}
          freelanceOnly={freelanceOnly}
          initialPoste={prefill?.poste}
          initialDate={prefill?.date}
          initialSlot={prefill?.slot}
          onClose={() => {
            setPublishing(false);
            setPrefill(null);
          }}
          onOpenMission={(id) => {
            setPublishing(false);
            setPrefill(null);
            openById(id);
          }}
        />
      )}
    </div>
  );
}
