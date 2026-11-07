/**
 * Store partagé des placements de la maquette v2.
 * Par défaut une mission sert l'état du mock ; dès qu'on place / retire
 * quelqu'un, qu'on agrandit le créneau, qu'on le replanifie ou qu'on change
 * sa couverture, on écrit un « override » ici. Les missions créées pendant la
 * session (placement direct, publication, duplication) vivent ici aussi ; les
 * missions annulées restent, hachurées, en lecture seule.
 * Tous les écrans (planning, fenêtre de mission, relevé d'heures, factures,
 * notifications) lisent `effMissions()` et se mettent à jour ensemble, via
 * useSyncExternalStore. En vrai, ces écritures iraient en base ; ici elles
 * vivent en mémoire le temps de la session.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { allMissions } from '@/mocks/v2Missions';
import type { CoverageState, Mission, MissionCancellation, MissionPlaced, PersonKind } from '@/mocks/v2Missions';
import { useV2Ui } from '@/stores/v2UiStore';
import { addDays as addDaysISO } from '../time';

/** « lun. 27 oct. · 18:00–23:30 · Serveur·se » — contexte d'une mission dans l'historique. */
function missionContext(m: Pick<Mission, 'poste' | 'date' | 'start' | 'end'>): string {
  const [y, mo, d] = m.date.split('-').map(Number);
  const day = new Date(y, mo - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${m.poste} · ${day} · ${m.start}–${m.end}`;
}
/** Trace une décision dans l'historique de la cloche. */
function journal(kind: 'mission' | 'publication', label: string, m: Mission | undefined, missionId?: string) {
  useV2Ui.getState().log({ kind, label, detail: m ? missionContext(m) : undefined, missionId: missionId ?? m?.id });
}

interface Override {
  placed?: MissionPlaced[];
  required?: number;
  /** recherche d'auto-entrepreneurs lancée depuis la mission : tarif €/h TTC */
  freelanceRate?: number;
  /** replanification : nouveau jour / horaire */
  schedule?: { date: string; start: string; end: string };
  /** couverture changée (ex. publication annulée → manque) */
  coverage?: CoverageState;
  /** lignes de journal ajoutées pendant la session, plus récentes en premier */
  history?: { at: string; label: string }[];
  /** consigne, note privée, PDF, langues, logiciels modifiés depuis la fenêtre */
  details?: MissionDetails;
  /** prime horaire du boost activé (€/h), s'il y en a un */
  boost?: number;
  /** appels aux auto-entrepreneurs lancés */
  called?: boolean;
  /** republication (après un désistement, ou au lieu d'une suppression) : à qui le créneau est proposé */
  publish?: Pick<Mission, 'system' | 'cascadeStep' | 'cascadeFreelanceAt'>;
}

/**
 * Un salarié ou un extra qui RELÂCHE son shift (depuis son appli) : il sort
 * des placés, la place redevient à pourvoir et le gestionnaire est prévenu
 * (cloche, carte du planning, bandeau dans la fenêtre) jusqu'à ce qu'il
 * choisisse comment republier — ou que la place soit reprise.
 */
export interface ShiftRelease {
  personId: string;
  name: string;
  kind: PersonKind;
  /** « hier 18:40 », « il y a 2 h »… (libellé, la maquette n'a pas d'horloge) */
  at: string;
  reason?: string;
  /** le gestionnaire a choisi quoi faire (ou la place a été reprise) */
  handled?: boolean;
}
const releases = new Map<string, ShiftRelease[]>();

/**
 * Une ligne du relevé d'heures : heures pointées, validée ou non, retirée du
 * relevé ou non. Partagée entre la fenêtre de mission (onglet Relevé d'heures)
 * et Factures & heures : les deux écrans lisent et écrivent la même ligne.
 */
export interface TimesheetLine {
  in?: string;
  out?: string;
  approved: boolean;
  /** retirée du relevé (ne part pas en paie) */
  removed?: boolean;
}
const timesheet = new Map<string, TimesheetLine>();
const lineKey = (missionId: string, personId: string) => `${missionId}:${personId}`;

/** Un auto-entrepreneur signalé depuis une mission : Shift Express traite. */
export type FreelanceReportKind = 'no-show' | 'annulation';
const freelanceReports = new Map<string, FreelanceReportKind>();

/** Les infos d'un shift modifiables après coup (colonne Détails, recherche d'auto-entrepreneurs). */
export type MissionDetails = Partial<
  Pick<Mission, 'publicNote' | 'privateNote' | 'privatePdf' | 'languages' | 'software'>
>;

const overrides = new Map<string, Override>();
const created: Mission[] = [];
const cancelled = new Map<string, MissionCancellation>();
const listeners = new Set<() => void>();
let version = 0;

/* ── Annuler le dernier placement groupé (Optimiser, « Placer les fixes ») ── */
/**
 * Avant d'écrire d'un coup plusieurs missions, on photographie l'état du
 * store ; tant que rien d'autre n'a bougé, « Annuler le placement » le remet
 * tel quel. La moindre écriture suivante (un placement à la main, un pointage…)
 * rend l'annulation impossible : on n'effacerait pas ce qui a été fait après.
 */
interface Snapshot {
  overrides: Map<string, Override>;
  createdCount: number;
  cancelled: Map<string, MissionCancellation>;
  releases: Map<string, ShiftRelease[]>;
  sent: Map<string, SentWeek>;
}
export interface Undoable {
  /** « Optimisation : 2 missions créées · 5 personnes placées » */
  label: string;
}
let undoable: (Undoable & { snapshot: Snapshot }) | null = null;
let batching = false;

function takeSnapshot(): Snapshot {
  return {
    overrides: new Map(overrides),
    createdCount: created.length,
    cancelled: new Map(cancelled),
    releases: new Map(Array.from(releases.entries()).map(([k, v]) => [k, v.map((r) => ({ ...r }))])),
    sent: new Map(sentWeeks),
  };
}
/** Commence un placement groupé annulable : tout ce qui est écrit jusqu'à `endUndoable` se défait d'un coup. */
export function beginUndoable(label: string) {
  undoable = { label, snapshot: takeSnapshot() };
  batching = true;
}
export function endUndoable(label?: string) {
  if (undoable && label) undoable.label = label;
  // On prévient les écrans AVANT de sortir du lot : cette écriture-là fait partie du placement.
  emit();
  batching = false;
}
/** Le dernier placement groupé encore annulable, ou null. */
export function effUndoable(): Undoable | null {
  return undoable ? { label: undoable.label } : null;
}
/** Remet le planning comme avant le dernier placement groupé. */
export function undoLast() {
  if (!undoable) return;
  const { snapshot, label } = undoable;
  undoable = null;
  overrides.clear();
  snapshot.overrides.forEach((v, k) => overrides.set(k, v));
  created.splice(snapshot.createdCount);
  cancelled.clear();
  snapshot.cancelled.forEach((v, k) => cancelled.set(k, v));
  releases.clear();
  snapshot.releases.forEach((v, k) => releases.set(k, v));
  sentWeeks.clear();
  snapshot.sent.forEach((v, k) => sentWeeks.set(k, v));
  emit();
  useV2Ui.getState().log({ kind: 'mission', label: `Placement annulé · ${label}` });
}

function emit() {
  version += 1;
  // Une écriture hors placement groupé : le dernier placement n'est plus annulable.
  if (!batching && undoable) undoable = null;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function getSnapshot() {
  return version;
}

/** S'abonner au store : renvoie un numéro de version qui change à chaque écriture. */
export function useMissionStore(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Applique à une mission ce qui a été modifié pendant la session. */
function withOverrides(m: Mission): Mission {
  const o = overrides.get(m.id);
  if (!o) return m;
  return {
    ...m,
    ...(o.schedule ?? {}),
    ...(o.details ?? {}),
    ...(o.publish ?? {}),
    coverage: o.coverage ?? m.coverage,
    history: o.history ? [...o.history, ...(m.history ?? [])] : m.history,
  };
}
/** Marque une mission annulée (le planning la garde, hachurée). */
function withCancellation(m: Mission): Mission {
  const c = cancelled.get(m.id);
  return c ? { ...m, cancelled: c } : m;
}

/** Une mission encore d'actualité (ni annulée). */
export const isLive = (m: Mission): boolean => !m.cancelled;

/** Toutes les missions : mock + créées, replanifiées si besoin, sans les annulées. */
export function effMissions(): Mission[] {
  return [...allMissions, ...created].filter((m) => !cancelled.has(m.id)).map(withOverrides);
}
/**
 * Pareil, annulées comprises (marquées `cancelled`). Le planning et la fenêtre
 * de mission s'en servent : un shift annulé ne disparaît jamais, il reste
 * hachuré à sa place et sa fenêtre s'ouvre en lecture seule.
 */
export function effMissionsWithCancelled(): Mission[] {
  return [...allMissions, ...created].map(withOverrides).map(withCancellation);
}
/** Hook : toutes les missions, à jour à chaque écriture. */
export function useAllMissions(): Mission[] {
  useMissionStore();
  return effMissions();
}

/**
 * Missions visibles selon le mode. En « Auto-entrepreneurs uniquement » :
 * seulement celles qui les concernent, et personne d'autre dedans — aucun
 * salarié ni extra n'apparaît (placés, postulants, notes, journal).
 */
export function visibleMissions(freelanceOnly: boolean, withCancelled = false): Mission[] {
  const all = withCancelled ? effMissionsWithCancelled() : effMissions();
  if (!freelanceOnly) return all;
  return all
    .filter(
      (m) =>
        m.system === 'freelance' ||
        m.coverage === 'published' ||
        m.coverage === 'freelance_validated' ||
        m.id.startsWith('new-'),
    )
    .map((m) => ({
      ...m,
      placed: m.placed.filter((p) => p.kind === 'freelance'),
      candidates: m.candidates.filter((p) => p.kind === 'freelance'),
      privateNote: /cascade|salari|extra|équipe/i.test(m.privateNote ?? '') ? undefined : m.privateNote,
      history: m.history?.filter((h) => !/cascade|salari|extra|équipe|prédictif/i.test(h.label)),
    }));
}
/** Hook : missions visibles selon le mode, à jour à chaque écriture. */
export function useVisibleMissions(freelanceOnly: boolean, withCancelled = false): Mission[] {
  const version = useMissionStore();
  return useMemo(() => {
    void version;
    return visibleMissions(freelanceOnly, withCancelled);
  }, [version, freelanceOnly, withCancelled]);
}

/** Crée une mission (planning, relevé et factures la voient aussitôt). */
export function createMission(input: Omit<Mission, 'id'> & { id?: string }): Mission {
  const mission: Mission = { ...input, id: input.id ?? `new-${Date.now()}-${created.length + 1}` };
  created.push(mission);
  emit();
  // Historique : la première ligne du journal de la mission dit comment elle est née.
  journal('publication', mission.history?.[0]?.label ?? 'Mission créée', mission);
  return mission;
}

/** Copie une mission sur un autre jour, sans personne dedans. */
export function duplicateMission(m: Mission, date: string): Mission {
  // Sans l'id d'origine : la copie reçoit le sien (sinon les deux se confondent).
  const { id: _id, ...rest } = m;
  void _id;
  return createMission({
    ...rest,
    date,
    placed: [],
    candidates: [],
    coverage: 'shortage',
    cascadeStep: undefined,
    cascadeFreelanceAt: undefined,
    eventId: undefined,
    eventName: undefined,
    history: [{ at: 'maintenant', label: `Dupliquée depuis le ${m.date}` }],
  });
}

/**
 * Annule une mission : elle sort du relevé d'heures et des factures de
 * prestation, mais reste dans le planning, hachurée, avec sa trace (qui était
 * placé, pourquoi, quels frais). Les profils ne s'ouvrent plus depuis elle.
 */
export function cancelMission(id: string, reason?: string, fees?: { lines: CancellationFeeLine[]; total: number }) {
  const m = effMissions().find((x) => x.id === id);
  if (!m) return;
  cancelled.set(id, { at: new Date().toISOString(), reason, fees: fees?.total ?? 0 });
  const cur = overrides.get(id);
  overrides.set(id, {
    ...cur,
    history: [
      {
        at: 'maintenant',
        label: `Mission annulée${reason ? ` · ${reason}` : ''}${fees && fees.total > 0 ? ` · ${fees.total} € de frais` : ' · sans frais'}`,
      },
      ...(cur?.history ?? []),
    ],
  });
  // Frais d'annulation facturés : ils rejoignent les factures de la période.
  if (fees && fees.total > 0) {
    cancellations.push({
      id: `ann-${Date.now()}-${cancellations.length + 1}`,
      missionId: m.id,
      poste: m.poste,
      establishment: m.establishment,
      date: m.date,
      start: m.start,
      end: m.end,
      lines: fees.lines,
      total: fees.total,
      reason,
      at: new Date().toISOString(),
    });
  }
  emit();
  journal(
    'mission',
    `${reason ? `Mission annulée · ${reason}` : 'Mission annulée'}${fees && fees.total > 0 ? ` · ${fees.total} € de frais` : ''}`,
    m,
  );
}

/** Une ligne de frais d'annulation (un auto-entrepreneur validé). */
export interface CancellationFeeLine {
  name: string;
  quote: number;
  pct: number;
  fee: number;
}
/** Annulation facturée : ce qui est dû aux auto-entrepreneurs prévenus trop tard. */
export interface CancellationRecord {
  id: string;
  missionId: string;
  poste: string;
  establishment: string;
  date: string;
  start: string;
  end: string;
  lines: CancellationFeeLine[];
  total: number;
  reason?: string;
  at: string;
}
const cancellations: CancellationRecord[] = [];
/** Les annulations avec frais de la session (pour l'onglet Factures). */
export function effCancellations(): CancellationRecord[] {
  return [...cancellations];
}

/** Replanifie : jour et/ou horaire. */
export function rescheduleMission(id: string, schedule: { date: string; start: string; end: string }) {
  overrides.set(id, { ...overrides.get(id), schedule });
  emit();
}

/** Change l'état de couverture (ex. publication annulée → manque). */
export function writeCoverage(id: string, coverage: CoverageState) {
  overrides.set(id, { ...overrides.get(id), coverage });
  emit();
}

/**
 * Ajoute une ligne au journal de la mission (visible colonne droite) et, sauf
 * `silent`, à l'historique des décisions de la cloche.
 */
export function appendHistory(id: string, label: string, opts: { silent?: boolean } = {}) {
  const cur = overrides.get(id);
  overrides.set(id, { ...cur, history: [{ at: 'maintenant', label }, ...(cur?.history ?? [])] });
  emit();
  if (!opts.silent)
    journal(
      'mission',
      label,
      effMissions().find((m) => m.id === id),
      id,
    );
}

/**
 * Placés effectifs d'une mission (override s'il existe, sinon le mock), avec
 * les heures du relevé partagé : un pointage saisi dans Factures & heures se
 * voit aussi dans la fenêtre de mission et sur le tableau de bord.
 */
export function effPlaced(m: Mission): MissionPlaced[] {
  const base = overrides.get(m.id)?.placed ?? m.placed;
  return base.map((p) => {
    const line = timesheet.get(lineKey(m.id, p.id));
    if (!line || (line.in === undefined && line.out === undefined)) return p;
    return { ...p, clockIn: line.in, clockOut: line.out, checkedIn: !!line.in };
  });
}

/** La ligne de relevé d'une personne sur une mission (par défaut : ce que la mission connaît). */
export function effTimesheet(m: Mission, p: MissionPlaced): TimesheetLine {
  const line = timesheet.get(lineKey(m.id, p.id));
  return line ?? { in: p.clockIn, out: p.clockOut, approved: false };
}
/** Écrit une ligne du relevé (arrivée, sortie, validée, retirée). */
export function writeTimesheet(m: Mission, p: MissionPlaced, patch: Partial<TimesheetLine>) {
  timesheet.set(lineKey(m.id, p.id), { ...effTimesheet(m, p), ...patch });
  emit();
}
/** Remet dans le relevé toutes les lignes retirées. */
export function restoreTimesheetLines() {
  timesheet.forEach((line, key) => {
    if (line.removed) timesheet.set(key, { ...line, removed: false });
  });
  emit();
}

/** Signale un auto-entrepreneur placé (no-show ou annulation) : Shift Express traite. */
export function reportFreelance(m: Mission, p: MissionPlaced, kind: FreelanceReportKind) {
  freelanceReports.set(lineKey(m.id, p.id), kind);
  appendHistory(
    m.id,
    kind === 'no-show'
      ? `${p.name} signalé·e : ne s'est pas présenté·e — Shift Express traite`
      : `Annulation de l'engagement de ${p.name} demandée — Shift Express traite`,
  );
}
/** Le signalement en cours d'un auto-entrepreneur sur cette mission, ou null. */
export function effFreelanceReport(m: Mission, p: MissionPlaced): FreelanceReportKind | null {
  return freelanceReports.get(lineKey(m.id, p.id)) ?? null;
}

/** Boost activé sur la mission (€/h), ou null. */
export function effBoost(m: Mission): number | null {
  return overrides.get(m.id)?.boost ?? null;
}
export function writeBoost(id: string, amount: number, total: number) {
  overrides.set(id, { ...overrides.get(id), boost: amount });
  appendHistory(id, `Boost +${amount} €/h activé (+${total} € sur la mission)`);
}
/** Appels aux auto-entrepreneurs lancés sur cette mission ? */
export function effCalled(m: Mission): boolean {
  return overrides.get(m.id)?.called ?? false;
}
export function writeCalled(id: string) {
  overrides.set(id, { ...overrides.get(id), called: true });
  appendHistory(id, 'Relance : 10 appels lancés aux auto-entrepreneurs disponibles');
}
/** Nombre de postes effectif. */
export function effRequired(m: Mission): number {
  return overrides.get(m.id)?.required ?? m.required;
}
/** Placés réels, hors suggestions prédictives. */
export function effPlacedCount(m: Mission): number {
  return effPlaced(m).filter((p) => !p.suggested).length;
}

export function writePlaced(id: string, placed: MissionPlaced[]) {
  // En « Auto-entrepreneurs uniquement », l'écran ne voit que les auto-entrepreneurs :
  // on garde les salariés et extras tels quels, sinon ils disparaîtraient au retour.
  const freelanceOnly = useV2Ui.getState().mode === 'freelance';
  if (freelanceOnly) {
    const current = overrides.get(id)?.placed ?? [...allMissions, ...created].find((m) => m.id === id)?.placed ?? [];
    const hidden = current.filter((p) => p.kind !== 'freelance');
    placed = [...hidden, ...placed.filter((p) => p.kind === 'freelance')];
  }
  overrides.set(id, { ...overrides.get(id), placed });
  // Place reprise → le désistement n'a plus besoin d'être traité.
  const m = [...allMissions, ...created].find((x) => x.id === id);
  if (m && placed.filter((p) => !p.suggested).length >= (overrides.get(id)?.required ?? m.required)) {
    releases.get(id)?.forEach((r) => (r.handled = true));
  }
  emit();
}
export function writeRequired(id: string, required: number) {
  overrides.set(id, { ...overrides.get(id), required });
  emit();
}

/** Tarif de la recherche d'auto-entrepreneurs lancée, ou null si pas lancée. */
export function effFreelanceRate(m: Mission): number | null {
  return overrides.get(m.id)?.freelanceRate ?? null;
}
export function writeFreelanceRate(id: string, rate: number) {
  overrides.set(id, { ...overrides.get(id), freelanceRate: rate });
  emit();
}
/**
 * Favori : accepte automatiquement ses candidatures en cours (« Se propose »)
 * sur les missions où il reste de la place. Renvoie le nombre de placements.
 */
export function autoAcceptFavorite(name: string): number {
  let n = 0;
  effMissions().forEach((m) => {
    const placed = effPlaced(m);
    const remaining = effRequired(m) - placed.filter((p) => !p.suggested).length;
    if (remaining <= 0) return;
    // Une contre-proposition de tarif n'est jamais acceptée d'office : elle se décide à la main.
    const c = m.candidates.find(
      (x) => x.name === name && x.kind === 'freelance' && x.note === 'Se propose' && !x.proposedRate,
    );
    if (!c || placed.some((p) => p.name === name)) return;
    overrides.set(m.id, { ...overrides.get(m.id), placed: [...placed, { ...c, checkedIn: false }] });
    const cur = overrides.get(m.id);
    overrides.set(m.id, {
      ...cur,
      history: [{ at: 'maintenant', label: `${name} accepté·e automatiquement (favori)` }, ...(cur?.history ?? [])],
    });
    journal('mission', `${name} accepté·e automatiquement (favori)`, m);
    n += 1;
  });
  if (n > 0) emit();
  return n;
}

/** Contact d'un auto-entrepreneur visible ? Oui dès qu'il a été validé sur une mission. */
export function isContactUnlocked(name: string): boolean {
  return effMissions().some((m) => effPlaced(m).some((p) => p.name === name && p.kind === 'freelance' && !p.suggested));
}

/** Modifie consigne / note privée / PDF / langues / logiciels (visibles aussitôt partout). */
export function writeDetails(id: string, patch: MissionDetails) {
  const cur = overrides.get(id);
  overrides.set(id, { ...cur, details: { ...cur?.details, ...patch } });
  emit();
}
/** Arrête la recherche d'auto-entrepreneurs (quelqu'un a été placé, ou besoin couvert). */
export function clearFreelanceRate(id: string) {
  const cur = overrides.get(id);
  if (!cur || cur.freelanceRate === undefined) return;
  const next = { ...cur };
  delete next.freelanceRate;
  overrides.set(id, next);
  emit();
}

/* ── Désistements (shift relâché par un salarié / extra) ──────── */

/** Un salarié ou un extra relâche son shift : il sort des placés, le gestionnaire est prévenu. */
export function releaseShift(
  missionId: string,
  person: { id: string; name: string; kind: PersonKind },
  opts: { reason?: string; at?: string; silent?: boolean } = {},
) {
  const m = effMissions().find((x) => x.id === missionId);
  if (!m) return;
  const placed = effPlaced(m).filter((p) => p.id !== person.id);
  overrides.set(missionId, { ...overrides.get(missionId), placed });
  const list = releases.get(missionId) ?? [];
  list.unshift({
    personId: person.id,
    name: person.name,
    kind: person.kind,
    at: opts.at ?? 'maintenant',
    reason: opts.reason,
  });
  releases.set(missionId, list);
  const label = `${person.name} a relâché son shift${opts.reason ? ` · ${opts.reason}` : ''} — place à republier`;
  const cur = overrides.get(missionId);
  overrides.set(missionId, { ...cur, history: [{ at: opts.at ?? 'maintenant', label }, ...(cur?.history ?? [])] });
  emit();
  if (!opts.silent) journal('mission', label, m, missionId);
}
/**
 * Remplace une personne au pied levé : elle sort (si elle y est encore), le
 * remplaçant entre, le désistement est considéré traité. Une seule ligne dans
 * l'historique : « Clara Vidal remplace Hugo Moreau (maladie) ».
 */
export function replacePerson(
  missionId: string,
  out: { personId: string; name: string; reason?: string },
  inn: { id: string; name: string; kind: PersonKind },
) {
  const m = effMissions().find((x) => x.id === missionId);
  if (!m) return;
  // La personne sortante s'en va ; si le remplaçant y était en suggestion (pointillé), elle devient ferme.
  const placed = effPlaced(m).filter(
    (p) => p.id !== out.personId && p.name !== out.name && !(p.name === inn.name && p.suggested),
  );
  if (placed.some((p) => p.name === inn.name)) return;
  overrides.set(missionId, { ...overrides.get(missionId), placed: [...placed, { ...inn, checkedIn: false }] });
  releases.get(missionId)?.forEach((r) => (r.handled = true));
  const label = `${inn.name} remplace ${out.name}${out.reason ? ` (${out.reason.toLowerCase()})` : ''}`;
  const cur = overrides.get(missionId);
  overrides.set(missionId, { ...cur, history: [{ at: 'maintenant', label }, ...(cur?.history ?? [])] });
  emit();
  journal('mission', label, m, missionId);
}

/**
 * Absence déclarée (maladie, congés…) sur des jours où la personne est déjà
 * placée : chaque créneau à venir est relâché, à remplacer. Renvoie les missions touchées.
 */
export function releaseForAbsence(name: string, from: string, to: string, reason: string, today: string): Mission[] {
  const hit = effMissions().filter(
    (m) =>
      m.date >= today && m.date >= from && m.date <= to && effPlaced(m).some((p) => p.name === name && !p.suggested),
  );
  hit.forEach((m) => {
    const p = effPlaced(m).find((x) => x.name === name)!;
    releaseShift(m.id, { id: p.id, name: p.name, kind: p.kind }, { reason, silent: true });
  });
  return hit;
}

/** Désistements d'une mission, le plus récent en premier. */
export function effReleases(m: Mission): ShiftRelease[] {
  return releases.get(m.id) ?? [];
}
/** Désistements que le gestionnaire n'a pas encore traités. */
export function pendingReleases(m: Mission): ShiftRelease[] {
  return effReleases(m).filter((r) => !r.handled);
}
/** Le gestionnaire a décidé (republié, ou réglé autrement) : plus d'alerte. */
export function resolveReleases(missionId: string) {
  releases.get(missionId)?.forEach((r) => (r.handled = true));
  emit();
}

/* ── Republier un créneau (après un désistement, ou au lieu de le supprimer) ── */

export type RepublishTarget = 'personnel' | 'cascade' | 'freelance';
export const republishLabel: Record<RepublishTarget, string> = {
  personnel: 'à votre personnel',
  cascade: 'en cascade',
  freelance: 'aux auto-entrepreneurs',
};

/**
 * Propose à nouveau les places libres d'une mission :
 *  · personnel : salariés et extras prévenus, ils se proposent — aucun coût ;
 *  · cascade : salariés, puis extras, puis auto-entrepreneurs (délais des Réglages) ;
 *  · freelance : publiée tout de suite aux auto-entrepreneurs au tarif des Réglages.
 * Les désistements en attente sont considérés traités.
 */
export function republishMission(
  id: string,
  target: RepublishTarget,
  opts: { rate?: number; cascadeFreelanceAt?: string; cascadeHint?: string } = {},
) {
  const cur = overrides.get(id);
  const base = { ...cur };
  delete base.freelanceRate;
  if (target === 'personnel') {
    overrides.set(id, {
      ...base,
      coverage: 'shortage',
      publish: { system: 'employe', cascadeStep: undefined, cascadeFreelanceAt: undefined },
    });
  } else if (target === 'cascade') {
    overrides.set(id, {
      ...base,
      coverage: 'cascade',
      publish: { system: 'cascade', cascadeStep: 'salaries', cascadeFreelanceAt: opts.cascadeFreelanceAt },
    });
  } else {
    overrides.set(id, { ...cur, coverage: 'published', freelanceRate: opts.rate ?? cur?.freelanceRate ?? 31 });
  }
  releases.get(id)?.forEach((r) => (r.handled = true));
  emit();
  const label =
    target === 'personnel'
      ? 'Créneau reproposé à votre personnel (salariés et extras)'
      : target === 'cascade'
        ? `Cascade lancée${opts.cascadeHint ? ` · ${opts.cascadeHint}` : ''}`
        : `Publié aux auto-entrepreneurs · ${opts.rate ?? 31} €/h TTC`;
  const curH = overrides.get(id);
  overrides.set(id, { ...curH, history: [{ at: 'maintenant', label }, ...(curH?.history ?? [])] });
  emit();
  journal(
    'publication',
    label,
    effMissions().find((m) => m.id === id),
    id,
  );
}

/* ── Envoyer la semaine aux équipes ──────────────────────── */

/** Ce que chacun a reçu : ses créneaux au moment de l'envoi (pour repérer ce qui a changé depuis). */
export interface SentWeek {
  /** horodatage ISO de l'envoi */
  at: string;
  /** nombre de personnes prévenues */
  people: number;
  /** nombre de créneaux envoyés */
  shifts: number;
  /** par personne : empreinte de ses créneaux (« missionId date start end ») */
  byPerson: Record<string, string[]>;
}
const sentWeeks = new Map<string, SentWeek>();

/** Clé d'un créneau pour une personne : la mission, son jour et son horaire. */
const shiftKey = (m: Mission) => `${m.id} ${m.date} ${m.start}-${m.end}`;

/** Les créneaux fermes de la semaine, par personne (tous établissements). */
export function weekShiftsByPerson(weekStart: string): Map<string, { person: MissionPlaced; missions: Mission[] }> {
  const end = addDaysISO(weekStart, 6);
  const by = new Map<string, { person: MissionPlaced; missions: Mission[] }>();
  effMissions()
    .filter((m) => m.date >= weekStart && m.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .forEach((m) =>
      effPlaced(m)
        .filter((p) => !p.suggested)
        .forEach((p) => {
          const cur = by.get(p.name) ?? { person: p, missions: [] };
          cur.missions.push(m);
          by.set(p.name, cur);
        }),
    );
  return by;
}

/** L'envoi déjà fait pour cette semaine, ou null. */
export function effSentWeek(weekStart: string): SentWeek | null {
  return sentWeeks.get(weekStart) ?? null;
}

/**
 * Ce qui a changé depuis l'envoi : les personnes dont les créneaux ne sont
 * plus ceux reçus (ajout, retrait, horaire déplacé), avec le détail.
 */
export function weekChangesSince(weekStart: string): { name: string; added: number; removed: number }[] {
  const sent = sentWeeks.get(weekStart);
  if (!sent) return [];
  const now = weekShiftsByPerson(weekStart);
  const names = new Set([...Object.keys(sent.byPerson), ...now.keys()]);
  const out: { name: string; added: number; removed: number }[] = [];
  names.forEach((name) => {
    const before = new Set(sent.byPerson[name] ?? []);
    const after = new Set((now.get(name)?.missions ?? []).map(shiftKey));
    const added = Array.from(after).filter((k) => !before.has(k)).length;
    const removed = Array.from(before).filter((k) => !after.has(k)).length;
    if (added + removed > 0) out.push({ name, added, removed });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Envoie la semaine : chaque personne placée reçoit ses créneaux (appli et
 * e-mail, en vrai). Renvoie le nombre de personnes prévenues. Un second envoi
 * ne prévient que celles dont quelque chose a changé.
 */
export function sendWeek(weekStart: string, label: string): number {
  const changed = weekChangesSince(weekStart).map((c) => c.name);
  const already = sentWeeks.get(weekStart);
  const by = weekShiftsByPerson(weekStart);
  const byPerson: Record<string, string[]> = {};
  let shifts = 0;
  by.forEach((v, name) => {
    byPerson[name] = v.missions.map(shiftKey);
    shifts += v.missions.length;
  });
  const notified = already ? changed : Array.from(by.keys());
  sentWeeks.set(weekStart, { at: new Date().toISOString(), people: notified.length, shifts, byPerson });
  // Trace sur chaque mission concernée (fenêtre de mission, colonne droite), sans bruit dans la cloche.
  const touched = new Set<string>();
  by.forEach((v, name) => {
    if (!notified.includes(name)) return;
    v.missions.forEach((m) => touched.add(m.id));
  });
  touched.forEach((id) => {
    const cur = overrides.get(id);
    overrides.set(id, {
      ...cur,
      history: [
        {
          at: 'maintenant',
          label: already ? 'Changement envoyé aux personnes placées' : 'Planning envoyé aux personnes placées',
        },
        ...(cur?.history ?? []),
      ],
    });
  });
  emit();
  useV2Ui.getState().log({
    kind: 'publication',
    label: already
      ? `Changements de la ${label} envoyés à ${notified.length} personne${notified.length > 1 ? 's' : ''}`
      : `${label} envoyée à ${notified.length} personne${notified.length > 1 ? 's' : ''}`,
  });
  return notified.length;
}

// ── Scénario de la maquette : un commis a relâché le service de dimanche. ──
releaseShift(
  'm-commis',
  { id: 'p7', name: 'Hugo Moreau', kind: 'salarie' },
  { reason: 'Maladie', at: 'hier 18:40', silent: true },
);
