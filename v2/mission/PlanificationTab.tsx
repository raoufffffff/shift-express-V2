/**
 * Onglet Planification de la fenêtre de mission — 3 colonnes :
 *   Gauche  — Qui peut prendre ce créneau : postulants groupés par type +
 *             barre de recherche. « Ajouter quelqu'un » (centre) y renvoie.
 *   Centre  — Placés sur ce créneau (+ bloc d'état + actions)
 *   Droite  — Détails de la mission, ou profil de la personne cliquée
 *
 * Placer un freelance engage un coût → petit garde-fou « vous réglez le total ».
 * Un salarié / extra se place directement, sans message — sauf un salarié sur
 * un de ses jours de repos (Réglages › Personnel fixe) : on prévient d'abord.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Plus,
  Minus,
  Users,
  Star,
  MapPin,
  Clock,
  User,
  History,
  Eye,
  Lock,
  Search,
  AlertTriangle,
  FileText,
  Languages,
  Monitor,
  X,
  Bell,
  Zap,
  Phone,
  BedDouble,
  Pencil,
  UserMinus,
  Trash2,
  Megaphone,
  CalendarClock,
  ChevronRight,
  FileDown,
} from 'lucide-react';
import type { Mission, MissionPerson, MissionPlaced, PersonKind } from '@/mocks/v2Missions';
import { availableRoster, LANGUES } from '@/mocks/v2Missions';
import { DAY_LONG, useV2Settings } from '@/stores/v2SettingsStore';
import { people } from '@/mocks/v2People';
import { useUnavailability, offLabel } from '../people/availability';
import { useV2Ui } from '@/stores/v2UiStore';
import { MultiSelect } from '../MultiSelect';
import { SoftwareSelect } from '../SoftwareSelect';
import { Avatar } from '../Avatar';
import { missionTimeLabel, missionHours } from '../time';
import { personKindStyle } from '../coverage';
import { ConfirmGuard } from '../publish/ConfirmGuard';
import { useIsWide } from '../useMediaQuery';
import { ProfileWindow } from './ProfileWindow';
import { RateNegotiationGuard } from './RateNegotiationGuard';
import { FavoriteMark } from '../people/FavoriteStar';
import { useV2People } from '@/stores/v2PeopleStore';
import { FreelanceSearchPanel } from './FreelanceSearchPanel';
import { printProfiles, missionProfilesTitle } from './printProfiles';
import {
  useMissionStore,
  effPlaced,
  effPlacedCount,
  effRequired,
  writeRequired,
  writePlaced,
  effFreelanceRate,
  writeFreelanceRate,
  clearFreelanceRate,
  duplicateMission,
  cancelMission,
  rescheduleMission,
  writeCoverage,
  appendHistory,
  effMissions,
  writeDetails,
  reportFreelance,
  effFreelanceReport,
  effBoost,
  writeBoost,
  effCalled,
  writeCalled,
  pendingReleases,
  resolveReleases,
  republishLabel,
} from './missionStore';
import type { FreelanceReportKind, RepublishTarget } from './missionStore';
import { RepublishChoices } from './RepublishChoices';
import { ReplaceChoices } from './ReplaceChoices';
import { availableActions, isApplicant, sortCandidates, kindGroupLabel } from './missionActions';
import { cancellationQuote, hoursLabel } from './cancellation';
import type { CancellationQuote } from './cancellation';

interface Props {
  mission: Mission;
}

/** Actions de la colonne centre qui demandent une confirmation ou un formulaire. */
type PendingAction = 'cancelPublish' | 'cancel' | 'reschedule';

/** Motifs proposés quand on annule toute la mission. */
const CANCEL_REASONS = ['Événement annulé', 'Baisse d’activité', 'Doublon', 'Besoin couvert autrement', 'Autre'];

/** Bloc « frais d'annulation » : gratuit, ou le détail par auto-entrepreneur et le total. */
function CancellationFees({ quote }: { quote: CancellationQuote }) {
  const free = quote.pct === 0 || quote.lines.length === 0;
  return (
    <div
      className={`mt-3 rounded-se-sm border px-3 py-2.5 text-sm ${
        free ? 'border-se-success/40 bg-se-success-wash' : 'border-se-danger/40 bg-se-danger-wash'
      }`}
    >
      <p className={`font-semibold inline-flex items-center gap-1.5 ${free ? 'text-se-success' : 'text-se-danger'}`}>
        {free ? (
          <Check className="w-4 h-4" aria-hidden="true" />
        ) : (
          <AlertTriangle className="w-4 h-4" aria-hidden="true" />
        )}
        {free
          ? quote.lines.length === 0
            ? 'Annulation sans frais'
            : `Annulation sans frais · début ${hoursLabel(quote.hoursUntil)}`
          : `Frais d'annulation : ${quote.total} € TTC · début ${hoursLabel(quote.hoursUntil)}`}
      </p>
      {quote.lines.length > 0 && !free && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-se-ink">
          {quote.lines.map((l) => (
            <li key={l.name} className="flex justify-between gap-3">
              <span>
                {l.name} · {l.pct} % du devis ({l.quote} €)
              </span>
              <span className="font-semibold tabular-nums">{l.fee} €</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[11px] text-se-muted">
        {quote.lines.length === 0
          ? `Aucun auto-entrepreneur validé : ${quote.staffCount > 0 ? 'votre personnel est prévenu, ' : ''}rien n'est facturé.`
          : free
            ? `Gratuit jusqu'au ${quote.freeUntil} (préavis de ${quote.noticeHours} h${quote.days > 1 ? `, mission de ${quote.days} jours` : ''}). Ensuite 50 %, puis 100 % à moins de 24 h.`
            : `Le délai gratuit (${quote.noticeHours} h avant le début, jusqu'au ${quote.freeUntil}) est dépassé. Votre personnel, lui, est prévenu sans frais.`}
      </p>
    </div>
  );
}

/** Lendemain d'une date ISO. */
const nextDayOf = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const n = new Date(y, m - 1, d + 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

/** Motifs proposés quand on annule la réservation d'un salarié / extra. */
const REMOVE_REASONS = [
  'Absence / maladie',
  'Changement de planning',
  'Erreur de placement',
  'Demande de la personne',
  'Besoin réduit',
  'Autre',
];

/** Nom du jour de la semaine d'une date ISO (« mardi »). */
const weekdayOf = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return DAY_LONG[new Date(y, m - 1, d).getDay()];
};

export function PlanificationTab({ mission }: Props) {
  useMissionStore(); // re-render quand le store change (ici ou ailleurs)
  // Personne indisponible ce jour-là (repos fixe ou absence déclarée) → garde-fou.
  const whyOff = useUnavailability();
  const onRest = (p: MissionPerson) => whyOff(p, mission.date);
  const [restConflict, setRestConflict] = useState<MissionPerson | null>(null);
  const [selected, setSelected] = useState<MissionPerson | null>(null);
  // Incrémenté par « Ajouter quelqu'un » → la colonne gauche prend le focus.
  const [addFocus, setAddFocus] = useState(0);
  // Écran étroit : les trois colonnes deviennent trois onglets (Postulants ·
  // Placés · Détails) — sinon la fenêtre s'étire sur trois écrans de haut.
  const wide = useIsWide();
  const [pane, setPane] = useState<'who' | 'placed' | 'details'>('placed');
  // Freelance en attente de confirmation (coût engagé).
  const [pendingFreelance, setPendingFreelance] = useState<MissionPerson | null>(null);
  // Freelance qu'on signale (no-show / annulation) → Shift Express traite.
  const [reporting, setReporting] = useState<MissionPlaced | null>(null);
  // Salarié / extra qu'on retire : on demande confirmation, motif facultatif.
  const [removing, setRemoving] = useState<MissionPlaced | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  // Actions de la colonne centre (prévenir, booster, relancer, annuler, replanifier…).
  const [action, setAction] = useState<PendingAction | null>(null);
  // Garde-fou de suppression : d'abord le choix (modifier / republier / supprimer),
  // puis l'étape choisie. On ne supprime jamais en un clic.
  const [cancelStep, setCancelStep] = useState<'choice' | 'publish' | 'delete'>('choice');
  const [cancelReason, setCancelReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [duplicated, setDuplicated] = useState<Mission | null>(null);
  const [schedule, setSchedule] = useState({ date: mission.date, start: mission.start, end: mission.end });
  const requestOpenMission = useV2Ui((s) => s.requestOpenMission);

  // Placés & nombre de postes : persistés dans le store partagé → visibles sur
  // tout le planning, et conservés quand on ferme/rouvre la mission.
  const placed = effPlaced(mission);
  const required = effRequired(mission);

  // Fenêtre « Lancer la recherche d'auto-entrepreneurs ».
  const [searching, setSearching] = useState(false);
  // Personnel qu'on place alors qu'une recherche est en cours → on prévient qu'elle s'arrête.
  const [stopSearchFor, setStopSearchFor] = useState<MissionPerson | null>(null);

  useEffect(() => {
    setSelected(null);
    setPendingFreelance(null);
    setRestConflict(null);
    setReporting(null);
    setRemoving(null);
    setRemoveReason('');
    setAction(null);
    setCancelStep('choice');
    setCancelReason('');
    setNotice(null);
    setDuplicated(null);
    setSchedule({ date: mission.date, start: mission.start, end: mission.end });
    setSearching(false);
    setStopSearchFor(null);
  }, [mission.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vivier proposable = candidats du créneau + disponibles du jour (sans doublon).
  // En Freelance uniquement, seuls les auto-entrepreneurs sont proposables.
  const freelanceOnly = useV2Ui((s) => s.mode) === 'freelance';
  // Tout le personnel (Réglages) et tous les extras connus sont proposables via
  // « + Choisir dans le personnel », même sans candidature.
  const staffRules = useV2Settings((s) => s.staff);
  const poolRules = useV2Settings((s) => s.pool);
  const pool = useMemo(() => {
    const seen = new Set<string>();
    const add = (list: MissionPerson[], out: MissionPerson[]) =>
      list.forEach((p) => {
        if (seen.has(p.name)) return;
        seen.add(p.name);
        out.push(p);
      });
    const all: MissionPerson[] = [];
    add(mission.candidates, all);
    add(availableRoster, all);
    add(
      staffRules.map((r) => ({ id: r.personId, name: r.name, kind: 'salarie' as const, action: 'placer' as const })),
      all,
    );
    // Bassin de talents (Réglages) puis extras connus de l'app.
    add(
      poolRules.map((r) => ({
        id: r.personId,
        name: r.name,
        kind: 'extra' as const,
        rating: people.find((p) => p.id === r.personId)?.rating,
        action: 'placer' as const,
      })),
      all,
    );
    add(
      people
        .filter((p) => p.kind === 'extra')
        .map((p) => ({ id: p.id, name: p.name, kind: 'extra' as const, rating: p.rating, action: 'placer' as const })),
      all,
    );
    return freelanceOnly ? all.filter((p) => p.kind === 'freelance') : all;
  }, [mission.candidates, freelanceOnly, staffRules, poolRules]);

  const placedIds = new Set(placed.map((p) => p.id));
  const remaining = pool.filter((c) => !placedIds.has(c.id));

  const placedCount = placed.filter((p) => !p.suggested).length;
  const full = placedCount >= required;
  // Un auto-entrepreneur validé = devis engagé sur ces horaires : plus de replanification d'ici.
  const hoursLocked = placed.some((p) => p.kind === 'freelance' && !p.suggested);

  // Recherche d'auto-entrepreneurs : proposée tant que le créneau n'est ni couvert
  // ni déjà visible des auto-entrepreneurs (publié, validé, cascade à leur étape).
  const searchRate = effFreelanceRate(mission);
  const alreadyFreelance =
    mission.coverage === 'published' ||
    mission.coverage === 'freelance_validated' ||
    (mission.system === 'cascade' && mission.cascadeStep === 'freelances');
  let cta: string | null = null;
  if (searchRate === null && !full && !alreadyFreelance) {
    if (mission.system === 'employe') {
      cta = 'Ce créneau est réservé à vos salariés. Élargir aux auto-entrepreneurs ?';
    } else if (mission.system === 'cascade') {
      cta = mission.cascadeStep
        ? `Cascade — étape ${mission.cascadeStep === 'extras' ? 'extras' : 'salariés'} ouverte. Bascule automatique vers les auto-entrepreneurs${mission.cascadeFreelanceAt ? ` à ${mission.cascadeFreelanceAt}` : ''}.`
        : 'Cascade non lancée. Passer directement aux auto-entrepreneurs ?';
    } else {
      cta = 'Personne ne se propose ? Publiez ce créneau aux auto-entrepreneurs.';
    }
  }
  // La mission est visible des auto-entrepreneurs : booster et appeler ont un sens.
  const published = searchRate !== null || alreadyFreelance;

  const addPerson = (p: MissionPerson) => {
    if (placed.some((x) => x.id === p.id)) return;
    const next = [...placed, { ...p, suggested: false }];
    writePlaced(mission.id, next);
    // Besoin couvert → la recherche d'auto-entrepreneurs n'a plus lieu d'être.
    if (searchRate !== null && next.filter((x) => !x.suggested).length >= required) clearFreelanceRate(mission.id);
  };
  const removePerson = (id: string) =>
    writePlaced(
      mission.id,
      placed.filter((p) => p.id !== id),
    );
  const confirmSuggested = (id: string) =>
    writePlaced(
      mission.id,
      placed.map((p) => (p.id === id ? { ...p, suggested: false } : p)),
    );
  // Confirmer une suggestion : même garde-fou repos qu'un placement.
  const confirmPerson = (id: string) => {
    const p = placed.find((x) => x.id === id);
    if (p && onRest(p)) setRestConflict(p);
    else confirmSuggested(id);
  };
  // Après « Placer quand même » : la personne est déjà dans la liste (suggestion
  // à confirmer) ou pas encore (placement).
  const confirmRest = () => {
    const p = restConflict;
    setRestConflict(null);
    if (!p) return;
    if (placed.some((x) => x.id === p.id)) confirmSuggested(p.id);
    else addPerson(p);
  };

  // Un freelance ne se retire jamais directement : on signale (no-show ou
  // annulation), c'est tracé dans la mission, et Shift Express traite.
  const confirmReport = (kind: FreelanceReportKind) => {
    if (reporting) reportFreelance(mission, reporting, kind);
    setReporting(null);
  };

  // Un freelance engage un coût → confirmation. Salarié un jour de repos →
  // avertissement. Sinon : direct.
  const place = (p: MissionPerson) => {
    if (p.kind === 'freelance') setPendingFreelance(p);
    else if (onRest(p)) setRestConflict(p);
    else addPerson(p);
  };
  // Jamais de surbooking : complet, on n'ajoute plus (les boutons sont masqués).
  const requestAdd = (p: MissionPerson) => {
    if (full) return;
    // Placer du personnel pendant une recherche d'auto-entrepreneurs l'arrête : on prévient.
    if (searchRate !== null && p.kind !== 'freelance') setStopSearchFor(p);
    else place(p);
  };
  const confirmStopSearch = () => {
    const p = stopSearchFor;
    setStopSearchFor(null);
    if (p) {
      clearFreelanceRate(mission.id);
      addPerson(p);
    }
  };
  const confirmFreelance = () => {
    if (pendingFreelance) addPerson(pendingFreelance);
    setPendingFreelance(null);
  };
  // Frais d'annulation, calculés maintenant (préavis plus long pour un événement de plusieurs jours).
  const eventDayCount = mission.eventId ? effMissions().filter((x) => x.eventId === mission.eventId).length : 1;
  const cancelQuote = cancellationQuote(mission, placed, { days: eventDayCount });
  // Tarif négocié : accepter (au tarif proposé), contre-proposer ou refuser.
  const setRateDecision = useV2People((s) => s.setRateDecision);
  const missionDuration = missionHours(mission);
  const baseRate = (searchRate ?? Math.round((pendingFreelance?.cost ?? 0) / Math.max(missionDuration, 1))) || 31;
  const acceptNegotiated = (rate: number) => {
    const p = pendingFreelance;
    if (!p) return;
    addPerson({ ...p, cost: Math.round(rate * missionDuration), proposedRate: undefined });
    appendHistory(mission.id, `Tarif négocié accepté : ${p.name} à ${rate} €/h TTC (publié ${baseRate} €/h)`);
    setPendingFreelance(null);
  };
  const counterNegotiated = (rate: number) => {
    const p = pendingFreelance;
    if (!p) return;
    setRateDecision(mission.id, p.id, { status: 'countered', rate });
    appendHistory(
      mission.id,
      `Contre-proposition envoyée à ${p.name} : ${rate} €/h TTC (demandé ${p.proposedRate} €/h)`,
    );
    setPendingFreelance(null);
  };
  const refuseNegotiated = () => {
    const p = pendingFreelance;
    if (!p) return;
    setRateDecision(mission.id, p.id, { status: 'refused' });
    appendHistory(mission.id, `Tarif de ${p.name} refusé (${p.proposedRate} €/h TTC demandés)`);
    setPendingFreelance(null);
  };
  const whoColumn = (
    <WhoColumn
      key={mission.id}
      mission={mission}
      full={full}
      remainingPlaces={Math.max(required - placedCount, 0)}
      candidates={remaining}
      cta={cta}
      searchRate={searchRate}
      published={published}
      onSearchFreelances={() => setSearching(true)}
      onSelect={setSelected}
      onAct={requestAdd}
      onRest={onRest}
      focusToken={addFocus}
    />
  );
  const placedColumn = (
    <PlacedColumn
      mission={mission}
      required={required}
      placed={placed}
      full={full}
      placedCount={placedCount}
      searchRate={searchRate}
      hoursLocked={hoursLocked}
      onRest={onRest}
      onSelect={setSelected}
      onRemove={(id) => {
        setRemoveReason('');
        setRemoving(placed.find((p) => p.id === id) ?? null);
      }}
      onReport={setReporting}
      onConfirm={confirmPerson}
      onRequestAdd={() => {
        setAddFocus((t) => t + 1);
        setPane('who');
      }}
      onAction={(key) => {
        if (key === 'duplicate') {
          // Copie sur le lendemain, sans personne dedans ; on propose de l'ouvrir.
          const date = nextDayOf(mission.date);
          const copy = duplicateMission(mission, date);
          appendHistory(mission.id, `Dupliquée pour le ${weekdayOf(date)} ${date.slice(8)}`, { silent: true });
          setDuplicated(copy);
          setNotice(null);
        } else {
          if (key === 'cancel') setCancelStep('choice');
          setAction(key as PendingAction);
        }
      }}
      onReplaced={(name) => setNotice(`${name} est placé·e sur ce créneau. La personne est prévenue.`)}
      onRepublished={(target) => {
        setNotice(`Créneau republié ${republishLabel[target]}. Vous serez prévenu·e dès que quelqu'un se propose.`);
      }}
      onExportAll={() => {
        // Fiches PDF des validés seulement (jamais les suggestions) : une page par personne.
        const n = printProfiles([{ mission }], missionProfilesTitle(mission));
        setNotice(
          n > 0
            ? `${n} fiche${n > 1 ? 's' : ''} prête${n > 1 ? 's' : ''} : choisissez « Enregistrer en PDF » dans la boîte d'impression.`
            : 'Personne de validé sur ce créneau pour l’instant.',
        );
      }}
      onExportOne={(p) => {
        printProfiles([{ mission, people: [p] }], missionProfilesTitle(mission, p));
        setNotice(`Fiche de ${p.name} prête : choisissez « Enregistrer en PDF ».`);
      }}
      notice={
        duplicated ? (
          <span className="inline-flex items-center gap-2 flex-wrap">
            Copie créée pour le {weekdayOf(duplicated.date)} {duplicated.date.slice(8)}.
            <button
              type="button"
              onClick={() => requestOpenMission(duplicated.id)}
              className="font-semibold text-se-blue-ink hover:text-se-blue"
            >
              Ouvrir la copie ›
            </button>
          </span>
        ) : (
          notice
        )
      }
    />
  );
  const panes = [
    { key: 'who', label: 'Postulants', count: String(remaining.filter(isApplicant).length) },
    { key: 'placed', label: 'Placés', count: `${placedCount}/${required}` },
    { key: 'details', label: 'Détails', count: null },
  ] as const;

  return (
    <div
      className={`relative ${
        wide
          ? 'grid grid-cols-[1fr_1.1fr_1fr] grid-rows-[minmax(0,1fr)] h-full divide-x divide-se-line'
          : 'flex flex-col min-h-full'
      }`}
    >
      {wide ? (
        <>
          {whoColumn}
          {placedColumn}
          <DetailsColumn mission={mission} />
        </>
      ) : (
        <>
          {/* Sélecteur de volet, collé en haut pendant le défilement */}
          <div className="sticky top-0 z-[5] px-3 py-2 bg-se-surface border-b border-se-line">
            <div className="flex gap-0.5 p-0.5 rounded-se-sm bg-se-surface-2">
              {panes.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPane(p.key)}
                  className={`flex-1 h-8 rounded-se-sm text-sm font-semibold transition-colors ${
                    pane === p.key ? 'bg-se-surface text-se-ink shadow-se' : 'text-se-muted hover:text-se-ink'
                  }`}
                >
                  {p.label}
                  {p.count !== null && <span className="ml-1 text-xs font-normal text-se-muted">{p.count}</span>}
                </button>
              ))}
            </div>
          </div>
          {pane === 'who' && whoColumn}
          {pane === 'placed' && placedColumn}
          {pane === 'details' && <DetailsColumn mission={mission} />}
        </>
      )}

      {/* Garde-fous des actions : on dit ce qui va se passer, puis UN bouton.
          Relancer, booster, appeler : dans la colonne de gauche, à côté des personnes. */}
      {action === 'cancelPublish' && (
        <ConfirmGuard
          title="Annuler la publication ?"
          tone="danger"
          confirmLabel="Annuler la publication"
          onCancel={() => setAction(null)}
          onConfirm={() => {
            clearFreelanceRate(mission.id);
            writeCoverage(mission.id, 'shortage');
            appendHistory(mission.id, 'Publication aux auto-entrepreneurs annulée');
            setNotice('Publication annulée : les auto-entrepreneurs ne voient plus ce créneau.');
            setAction(null);
          }}
        >
          <p>Les auto-entrepreneurs ne verront plus cette mission. Les personnes déjà validées restent placées.</p>
          <p className="text-se-muted">Vous pourrez republier plus tard depuis cette fenêtre.</p>
        </ConfirmGuard>
      )}
      {/* Garde-fou de suppression — étape 1 : ce shift est dans le planning, que voulez-vous faire ? */}
      {action === 'cancel' && cancelStep === 'choice' && (
        <div className="fixed lg:absolute inset-0 z-10 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Revenir"
            onClick={() => setAction(null)}
            className="absolute inset-0 bg-se-ink/40"
          />
          <div className="se-root relative w-full max-w-sm bg-se-surface rounded-se shadow-se-md p-5">
            <div className="flex items-start gap-3 mb-1">
              <AlertTriangle className="w-5 h-5 shrink-0 text-se-cascade-ink" aria-hidden="true" />
              <h3 className="text-base font-extrabold text-se-ink">Ce shift fait partie du planning</h3>
            </div>
            <p className="text-sm text-se-muted mb-4">
              {mission.poste} · {weekdayOf(mission.date)} {mission.date.slice(8)} · {mission.start}–{mission.end} ·{' '}
              {placedCount}/{required} placé{placedCount > 1 ? 's' : ''}. Avant de le supprimer, vous pouvez :
            </p>
            <ul className="space-y-1.5">
              {!hoursLocked && (
                <li>
                  <button
                    type="button"
                    onClick={() => setAction('reschedule')}
                    className="w-full flex items-center gap-3 rounded-se-sm border border-se-line p-2.5 text-left hover:border-se-muted hover:bg-se-surface-2/60"
                  >
                    <span className="w-8 h-8 shrink-0 rounded-se-sm grid place-items-center bg-se-blue-wash text-se-blue-ink">
                      <CalendarClock className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-se-ink">Modifier le créneau</span>
                      <span className="block text-xs text-se-muted leading-snug">
                        Changer le jour ou l'horaire. Les personnes placées sont prévenues.
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0 text-se-muted" aria-hidden="true" />
                  </button>
                </li>
              )}
              <li>
                <button
                  type="button"
                  disabled={full}
                  onClick={() => setCancelStep('publish')}
                  className="w-full flex items-center gap-3 rounded-se-sm border border-se-line p-2.5 text-left hover:border-se-muted hover:bg-se-surface-2/60 disabled:opacity-50 disabled:hover:border-se-line disabled:hover:bg-transparent"
                >
                  <span className="w-8 h-8 shrink-0 rounded-se-sm grid place-items-center bg-se-cascade-wash text-se-cascade-ink">
                    <Megaphone className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-se-ink">Republier le créneau</span>
                    <span className="block text-xs text-se-muted leading-snug">
                      {full
                        ? 'Créneau complet : retirez d’abord la personne à remplacer.'
                        : `${Math.max(required - placedCount, 0)} place${required - placedCount > 1 ? 's' : ''} à pourvoir : à votre personnel, en cascade ou aux auto-entrepreneurs.`}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0 text-se-muted" aria-hidden="true" />
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setCancelStep('delete')}
                  className="w-full flex items-center gap-3 rounded-se-sm border border-se-line p-2.5 text-left hover:border-se-danger hover:bg-se-danger-wash/40"
                >
                  <span className="w-8 h-8 shrink-0 rounded-se-sm grid place-items-center bg-se-danger-wash text-se-danger">
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-se-danger">Supprimer la mission</span>
                    <span className="block text-xs text-se-muted leading-snug">
                      {cancelQuote.total > 0
                        ? `${cancelQuote.total} € de frais d'annulation (auto-entrepreneurs validés).`
                        : 'Sans frais. Elle reste hachurée dans le planning, en lecture seule.'}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0 text-se-muted" aria-hidden="true" />
                </button>
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setAction(null)}
              className="mt-4 w-full py-2 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
            >
              Revenir
            </button>
          </div>
        </div>
      )}
      {/* Étape 2a : republier plutôt que supprimer — à qui ? */}
      {action === 'cancel' && cancelStep === 'publish' && (
        <div className="fixed lg:absolute inset-0 z-10 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Revenir"
            onClick={() => setAction(null)}
            className="absolute inset-0 bg-se-ink/40"
          />
          <div className="se-root relative w-full max-w-sm bg-se-surface rounded-se shadow-se-md p-5">
            <h3 className="text-base font-extrabold text-se-ink mb-1">À qui republier ce créneau ?</h3>
            <p className="text-sm text-se-muted mb-4">
              {Math.max(required - placedCount, 0)} place{required - placedCount > 1 ? 's' : ''} · {mission.poste} ·{' '}
              {weekdayOf(mission.date)} {mission.date.slice(8)} · {mission.start}–{mission.end}
            </p>
            <RepublishChoices
              mission={mission}
              left={Math.max(required - placedCount, 0)}
              onDone={(target: RepublishTarget) => {
                setNotice(
                  `Créneau republié ${republishLabel[target]}. Vous serez prévenu·e dès que quelqu'un se propose.`,
                );
                setAction(null);
              }}
            />
            <button
              type="button"
              onClick={() => setCancelStep('choice')}
              className="mt-4 w-full py-2 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
            >
              Revenir
            </button>
          </div>
        </div>
      )}
      {/* Étape 2b : supprimer pour de bon — frais, motif, un bouton */}
      {action === 'cancel' && cancelStep === 'delete' && (
        <div className="fixed lg:absolute inset-0 z-10 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Revenir"
            onClick={() => setAction(null)}
            className="absolute inset-0 bg-se-ink/40"
          />
          <div className="se-root relative w-full max-w-sm bg-se-surface rounded-se shadow-se-md p-5">
            <div className="flex items-start gap-3 mb-2">
              <AlertTriangle className="w-5 h-5 shrink-0 text-se-danger" aria-hidden="true" />
              <h3 className="text-base font-extrabold text-se-ink">Supprimer cette mission ?</h3>
            </div>
            <p className="text-sm text-se-ink">
              Le créneau <strong>{mission.poste}</strong> du {weekdayOf(mission.date)} {mission.date.slice(8)} sort du
              planning actif : il reste visible, hachuré, en lecture seule.{' '}
              {placed.filter((p) => !p.suggested).length > 0 &&
                `${placed.filter((p) => !p.suggested).length} personne(s) placée(s) seront prévenues.`}
            </p>
            {/* Ce que coûte l'annulation, maintenant : gratuit jusqu'à 48 h avant (plus pour une mission longue) */}
            <CancellationFees quote={cancelQuote} />
            {cancelQuote.days > 1 && (
              <p className="mt-2 text-xs text-se-muted">
                Mission de {cancelQuote.days} jours : seul ce jour est annulé ici. Pour tout l'événement, passez par la
                fenêtre de l'événement.
              </p>
            )}
            <label className="block mt-4">
              <span className="se-eyebrow block mb-1.5">
                Motif <span className="font-normal normal-case text-se-muted">· facultatif</span>
              </span>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full h-10 rounded-se-sm border border-se-line bg-se-surface px-3 text-sm text-se-ink focus:outline-none focus:border-se-blue"
              >
                <option value="">Sélectionnez un motif</option>
                {CANCEL_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setCancelStep('choice')}
                className="flex-1 py-2 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
              >
                Revenir
              </button>
              <button
                type="button"
                onClick={() => {
                  cancelMission(
                    mission.id,
                    cancelReason || undefined,
                    cancelQuote.total > 0 ? { lines: cancelQuote.lines, total: cancelQuote.total } : undefined,
                  );
                  setAction(null);
                }}
                className="flex-1 py-2 rounded-se-sm text-sm font-semibold bg-se-danger text-white hover:opacity-90"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
      {action === 'reschedule' && (
        <div className="fixed lg:absolute inset-0 z-10 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Annuler"
            onClick={() => setAction(null)}
            className="absolute inset-0 bg-se-ink/40"
          />
          <div className="se-root relative w-full max-w-sm bg-se-surface rounded-se shadow-se-md p-5">
            <h3 className="text-base font-extrabold text-se-ink mb-1">Replanifier</h3>
            <p className="text-sm text-se-muted mb-4">
              Les personnes placées sont prévenues du nouveau créneau et doivent reconfirmer.
            </p>
            <label className="block mb-3">
              <span className="se-eyebrow block mb-1.5">Jour</span>
              <input
                type="date"
                value={schedule.date}
                onChange={(e) => e.target.value && setSchedule((s) => ({ ...s, date: e.target.value }))}
                className="w-full h-10 rounded-se-sm border border-se-line bg-se-surface px-3 text-sm text-se-ink focus:outline-none focus:border-se-blue"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="se-eyebrow block mb-1.5">Début</span>
                <input
                  type="time"
                  value={schedule.start}
                  onChange={(e) => setSchedule((s) => ({ ...s, start: e.target.value }))}
                  className="w-full h-10 rounded-se-sm border border-se-line bg-se-surface px-3 text-sm text-se-ink focus:outline-none focus:border-se-blue"
                />
              </label>
              <label className="block">
                <span className="se-eyebrow block mb-1.5">Fin</span>
                <input
                  type="time"
                  value={schedule.end}
                  onChange={(e) => setSchedule((s) => ({ ...s, end: e.target.value }))}
                  className="w-full h-10 rounded-se-sm border border-se-line bg-se-surface px-3 text-sm text-se-ink focus:outline-none focus:border-se-blue"
                />
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setAction(null)}
                className="flex-1 py-2 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
              >
                Revenir
              </button>
              <button
                type="button"
                onClick={() => {
                  rescheduleMission(mission.id, schedule);
                  appendHistory(
                    mission.id,
                    `Replanifiée : ${weekdayOf(schedule.date)} ${schedule.date.slice(8)} · ${schedule.start}–${schedule.end}`,
                  );
                  setNotice('Mission replanifiée : les personnes placées sont prévenues.');
                  setAction(null);
                }}
                className="flex-1 py-2 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
              >
                Replanifier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Garde-fou freelance : on engage un coût */}
      {pendingFreelance && pendingFreelance.proposedRate && (
        <RateNegotiationGuard
          person={pendingFreelance}
          baseRate={baseRate}
          hours={missionDuration}
          onAccept={acceptNegotiated}
          onCounter={counterNegotiated}
          onRefuse={refuseNegotiated}
          onCancel={() => setPendingFreelance(null)}
        />
      )}
      {pendingFreelance && !pendingFreelance.proposedRate && (
        <ConfirmGuard
          title="Valider cet auto-entrepreneur ?"
          confirmLabel="Valider et engager"
          onCancel={() => setPendingFreelance(null)}
          onConfirm={confirmFreelance}
        >
          <p>
            En validant <strong>{pendingFreelance.name}</strong>, vous réglez
            {typeof pendingFreelance.cost === 'number' ? (
              <>
                {' '}
                le total de <strong>{pendingFreelance.cost} € TTC</strong> pour cette mission.
              </>
            ) : (
              <> le total de la mission.</>
            )}
          </p>
          {!freelanceOnly && <p className="text-se-muted">Vos salariés et extras, eux, se placent sans frais.</p>}
        </ConfirmGuard>
      )}

      {/* Garde-fou repos : un salarié sur un de ses jours de repos (Réglages) */}
      {restConflict && (
        <ConfirmGuard
          title={
            whyOff(restConflict, mission.date) === 'repos'
              ? `${restConflict.name} est en repos ce jour-là`
              : `${restConflict.name} est absent·e ce jour-là (${whyOff(restConflict, mission.date)})`
          }
          tone="warning"
          confirmLabel="Placer quand même"
          onCancel={() => setRestConflict(null)}
          onConfirm={confirmRest}
        >
          {whyOff(restConflict, mission.date) === 'repos' ? (
            <>
              <p>
                Le <strong>{weekdayOf(mission.date)}</strong> est un jour de repos de{' '}
                <strong>{restConflict.name}</strong>. Vous pouvez placer cette personne quand même : elle sera prévenue
                et la mission comptera dans ses heures de la semaine.
              </p>
              <p className="text-se-muted">Pour changer ses jours de repos : Réglages › Personnel fixe & repos.</p>
            </>
          ) : (
            <>
              <p>
                <strong>{restConflict.name}</strong> a une absence déclarée ce jour-là (
                {whyOff(restConflict, mission.date)}). Placer quand même revient à annuler cette absence pour ce créneau
                : la personne sera prévenue.
              </p>
              <p className="text-se-muted">Les absences se gèrent depuis sa fiche (Personnes).</p>
            </>
          )}
        </ConfirmGuard>
      )}

      {/* Garde-fou : placer du personnel arrête la recherche d'auto-entrepreneurs */}
      {stopSearchFor && (
        <ConfirmGuard
          title="Arrêter la recherche d'auto-entrepreneurs ?"
          tone="warning"
          confirmLabel="Placer et arrêter"
          onCancel={() => setStopSearchFor(null)}
          onConfirm={confirmStopSearch}
        >
          <p>
            Placer <strong>{stopSearchFor.name}</strong> arrête la recherche en cours
            {searchRate !== null ? ` (${searchRate} €/h)` : ''}. Les auto-entrepreneurs ne verront plus cette mission.
          </p>
          <p className="text-se-muted">Vous pourrez la relancer depuis la colonne de gauche si besoin.</p>
        </ConfirmGuard>
      )}

      {/* Retirer un salarié / extra : on confirme, avec un motif facultatif */}
      {removing && (
        <div className="fixed lg:absolute inset-0 z-10 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Annuler"
            onClick={() => setRemoving(null)}
            className="absolute inset-0 bg-se-ink/40"
          />
          <div className="se-root relative w-full max-w-sm bg-se-surface rounded-se shadow-se-md p-5">
            <div className="flex items-start gap-3 mb-2">
              <AlertTriangle className="w-5 h-5 shrink-0 text-se-danger" aria-hidden="true" />
              <h3 className="text-base font-extrabold text-se-ink">Êtes-vous sûr ?</h3>
            </div>
            <p className="text-sm text-se-ink">
              Êtes-vous sûr de vouloir retirer <strong>{removing.name}</strong> de ce créneau ?
            </p>
            <label className="block mt-4">
              <span className="se-eyebrow block mb-1.5">
                Motif du retrait <span className="font-normal normal-case text-se-muted">· facultatif</span>
              </span>
              <select
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                className="w-full h-10 rounded-se-sm border border-se-line bg-se-surface px-3 text-sm text-se-ink focus:outline-none focus:border-se-blue"
              >
                <option value="">Sélectionnez un motif</option>
                {REMOVE_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <p className="text-xs text-se-muted mt-2">
              {removing.name} est prévenu·e et la place redevient à pourvoir.
            </p>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setRemoving(null)}
                className="flex-1 py-2 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
              >
                Revenir
              </button>
              <button
                type="button"
                onClick={() => {
                  removePerson(removing.id);
                  appendHistory(
                    mission.id,
                    `Réservation de ${removing.name} annulée${removeReason ? ` · ${removeReason}` : ''}`,
                  );
                  setRemoving(null);
                  setRemoveReason('');
                }}
                className="flex-1 py-2 rounded-se-sm text-sm font-semibold bg-se-danger text-white hover:opacity-90"
              >
                Retirer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signalement d'un auto-entrepreneur : absence ou annulation → Shift Express */}
      {reporting && (
        <div className="fixed lg:absolute inset-0 z-10 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Annuler"
            onClick={() => setReporting(null)}
            className="absolute inset-0 bg-se-ink/40"
          />
          <div className="se-root relative w-full max-w-sm bg-se-surface rounded-se shadow-se-md p-5">
            <div className="flex items-start gap-3 mb-2">
              <AlertTriangle className="w-5 h-5 shrink-0 text-se-cascade-ink" aria-hidden="true" />
              <h3 className="text-base font-extrabold text-se-ink">Signaler {reporting.name}</h3>
            </div>
            <p className="text-sm text-se-ink">
              Un auto-entrepreneur validé ne se retire pas directement. Dites ce qui se passe :{' '}
              <strong>Shift Express</strong> reçoit la notification et traite la demande.
            </p>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => confirmReport('no-show')}
                className="w-full text-left rounded-se-sm border border-se-line px-3 py-2.5 hover:bg-se-surface-2"
              >
                <span className="block text-sm font-semibold text-se-ink">Ne s'est pas présenté·e</span>
                <span className="block text-xs text-se-muted">
                  La personne n'est pas venue : Shift Express la contacte et ajuste la facture.
                </span>
              </button>
              <button
                type="button"
                onClick={() => confirmReport('annulation')}
                className="w-full text-left rounded-se-sm border border-se-line px-3 py-2.5 hover:bg-se-surface-2"
              >
                <span className="block text-sm font-semibold text-se-ink">Annuler cet engagement</span>
                <span className="block text-xs text-se-muted">
                  Vous n'avez plus besoin de cette personne : Shift Express traite (frais selon le préavis).
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setReporting(null)}
              className="mt-4 w-full py-2 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Lancer la recherche d'auto-entrepreneurs : tarif + ajustements */}
      {searching && (
        <FreelanceSearchPanel
          mission={mission}
          remaining={Math.max(required - placedCount, 0)}
          onClose={() => setSearching(false)}
          onLaunch={(l) => {
            // Tout ce qui a été rempli passe sur la mission : visible à droite (Détails).
            writeDetails(mission.id, {
              publicNote: l.consigne || undefined,
              privateNote: l.notePrivee || undefined,
              privatePdf: l.pdfName ?? undefined,
              languages: l.langues,
              software: l.logiciels,
            });
            // Horaires figés dès qu'un auto-entrepreneur est validé : on ne les touche pas.
            if (!hoursLocked && (l.date !== mission.date || l.start !== mission.start || l.end !== mission.end)) {
              rescheduleMission(mission.id, { date: l.date, start: l.start, end: l.end });
              appendHistory(
                mission.id,
                l.date !== mission.date
                  ? `Reportée au ${weekdayOf(l.date)} ${l.date.slice(8)} · ${l.start}–${l.end}`
                  : `Horaires modifiés : ${l.start}–${l.end}`,
              );
            }
            writeFreelanceRate(mission.id, l.rate);
            appendHistory(mission.id, `Recherche d'auto-entrepreneurs lancée · ${l.rate} €/h TTC`);
            setSearching(false);
          }}
        />
      )}

      {/* Profil en fenêtre, au clic sur un nom */}
      {selected && <ProfileWindow person={selected} mission={mission} onClose={() => setSelected(null)} />}
    </div>
  );
}

/* ── Colonne gauche ──────────────────────────────────────────── */
function WhoColumn({
  mission,
  full,
  remainingPlaces,
  candidates,
  cta,
  searchRate,
  published,
  onSearchFreelances,
  onSelect,
  onAct,
  onRest,
  focusToken,
}: {
  mission: Mission;
  /** créneau complet → on ne place / valide plus personne */
  full: boolean;
  /** places encore à couvrir — sert au coût du boost */
  remainingPlaces: number;
  candidates: MissionPerson[];
  /** texte d'invitation à lancer la recherche d'auto-entrepreneurs (ou null) */
  cta: string | null;
  /** tarif de la recherche déjà lancée (ou null) */
  searchRate: number | null;
  /** la mission est visible des auto-entrepreneurs → booster / appeler ont un sens */
  published: boolean;
  onSearchFreelances: () => void;
  onSelect: (p: MissionPerson) => void;
  onAct: (p: MissionPerson) => void;
  /** salarié dont c'est un jour de repos → étiquette « repos » */
  /** raison d'indisponibilité ce jour-là (repos, congés…) ou null */
  onRest: (p: MissionPerson) => string | null;
  focusToken: number;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [flash, setFlash] = useState(false);
  // Mode annuaire : « Ajouter quelqu'un » (colonne centre) ouvre TOUT le vivier
  // (employés non-postulants + tous les postulants, freelances compris). Par
  // défaut, on ne montre que les postulants (ceux qui se proposent).
  const [addMode, setAddMode] = useState(false);
  const freelanceOnly = useV2Ui((s) => s.mode) === 'freelance';
  // Actions de groupe : push (gratuit) pour salariés / extras ; booster et
  // appels (payants → garde-fou) pour les auto-entrepreneurs. L'état vit dans
  // le store : il reste quand on ferme / rouvre la mission.
  const [pushed, setPushed] = useState<Set<PersonKind>>(new Set());
  const [pushing, setPushing] = useState<PersonKind | null>(null);
  const [paid, setPaid] = useState<'boost' | 'call' | null>(null);
  // Prime du boost, au choix de +1 à +6 €/h ; coût recalculé en direct.
  const [boostAmount, setBoostAmount] = useState(2);
  const boostedAmount = effBoost(mission);
  const called = effCalled(mission);
  const hours = missionHours(mission);
  const boostTotal = Math.round(boostAmount * hours * Math.max(remainingPlaces, 1));
  const confirmPush = () => {
    if (pushing) {
      setPushed((prev) => new Set(prev).add(pushing));
      appendHistory(
        mission.id,
        `Relance : notification renvoyée à vos ${pushing === 'salarie' ? 'salariés' : 'extras'}`,
      );
    }
    setPushing(null);
  };
  const confirmPaid = () => {
    if (paid === 'boost') writeBoost(mission.id, boostAmount, boostTotal);
    if (paid === 'call') writeCalled(mission.id);
    setPaid(null);
  };

  useEffect(() => {
    if (!focusToken) return;
    setAddMode(true);
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    inputRef.current?.focus();
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1200);
    return () => clearTimeout(t);
  }, [focusToken]);

  // Par défaut : les postulants seulement, trois par type. « Ajouter quelqu'un »
  // (colonne centre) bascule sur tout le monde (personnel, extras,
  // auto-entrepreneurs), postulants ou non ; les postulants gardent leur point bleu.
  const MAX_SHOWN = 3;
  const [expanded, setExpanded] = useState<Set<PersonKind>>(new Set());
  const q = query.trim().toLowerCase();
  const matches = (c: MissionPerson) => !q || c.name.toLowerCase().includes(q);
  const ORDER: PersonKind[] = ['salarie', 'extra', 'freelance'];
  // Un groupe vide reste visible quand ses actions ont un sens : relancer son
  // personnel (gestion complète), booster / appeler si la mission est publiée.
  const visibleGroups = ORDER.map((kind) => {
    const all = sortCandidates(candidates.filter((c) => c.kind === kind && matches(c)));
    const people = addMode ? all : all.filter(isApplicant);
    const shown = addMode || expanded.has(kind) ? people : people.slice(0, MAX_SHOWN);
    return { kind, people, shown, hidden: people.length - shown.length };
  }).filter((g) => g.people.length > 0 || (!addMode && !q && (g.kind === 'freelance' ? published : !freelanceOnly)));

  return (
    <section
      ref={sectionRef}
      className={`p-4 lg:min-h-0 lg:overflow-y-auto scroll-mt-4 transition-shadow ${flash ? 'ring-2 ring-se-blue ring-inset' : ''}`}
    >
      {/* En-tête : Postulants ⇄ Tout le monde */}
      <div className="flex items-center gap-2 mb-1">
        {addMode ? (
          <button
            type="button"
            onClick={() => {
              setAddMode(false);
              setQuery('');
            }}
            className="se-eyebrow hover:text-se-ink"
          >
            ‹ Postulants
          </button>
        ) : (
          <p className="se-eyebrow">Postulants</p>
        )}
        {addMode && <span className="se-eyebrow text-se-muted">· Tout le monde</span>}
      </div>
      <p className="text-xs text-se-muted mb-2.5">
        {full
          ? 'Créneau complet : plus personne ne peut être placé. Retirez quelqu’un pour libérer une place.'
          : addMode
            ? 'Tout le monde — « a postulé » se valide, « n’a pas postulé » se place directement.'
            : 'Les personnes qui se proposent sur ce créneau, 3 par type. « Ajouter quelqu’un » montre tout le monde.'}
      </p>

      {/* Barre de recherche */}
      <div className="relative mb-3">
        <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-se-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un nom…"
          className="w-full h-9 pl-8 pr-3 rounded-se-sm border border-se-line bg-se-surface text-sm text-se-ink focus:outline-none focus:border-se-blue"
        />
      </div>

      {/* Recherche d'auto-entrepreneurs : en cours, ou à lancer */}
      {searchRate !== null ? (
        <div className="rounded-se-sm border border-se-freelance bg-se-freelance-wash/40 p-3 mb-3">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-se-freelance-ink">
            <Search className="w-4 h-4" aria-hidden="true" /> Recherche d'auto-entrepreneurs en cours
          </p>
          <p className="text-xs text-se-muted mt-0.5">Tarif proposé : {searchRate} €/h TTC.</p>
        </div>
      ) : (
        cta && (
          <div className="rounded-se-sm border border-se-freelance/40 bg-se-freelance-wash/30 p-3 mb-3">
            <p className="text-xs text-se-ink mb-2">{cta}</p>
            <button
              type="button"
              onClick={onSearchFreelances}
              className="w-full py-2 rounded-se-sm text-sm font-semibold bg-se-freelance text-white hover:opacity-90"
            >
              Lancer la recherche d'auto-entrepreneurs
            </button>
          </div>
        )
      )}

      {visibleGroups.length === 0 ? (
        <p className="text-sm text-se-muted">
          {q
            ? `Aucun résultat pour « ${query.trim()} ».`
            : addMode
              ? 'Personne de disponible à ajouter.'
              : 'Aucune candidature pour l’instant.'}
        </p>
      ) : (
        <div className="space-y-3">
          {visibleGroups.map((g) => {
            const k = personKindStyle[g.kind];
            return (
              <div key={g.kind}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`w-2 h-2 rounded-full ${k.dot}`} aria-hidden="true" />
                  <p className="se-eyebrow">{kindGroupLabel[g.kind]}</p>
                  <span className="text-xs text-se-muted">· {g.people.length}</span>
                  <div className="ml-auto flex items-center gap-1">
                    {g.kind !== 'freelance' ? (
                      pushed.has(g.kind) ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-se-success">
                          <Check className="w-3 h-3" aria-hidden="true" /> Relancés
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPushing(g.kind)}
                          className={pillCls}
                          title="Relancer par notification (tout le monde a déjà été prévenu à la publication)"
                        >
                          <Bell className="w-3 h-3" aria-hidden="true" /> Relancer
                        </button>
                      )
                    ) : !published ? null : (
                      <>
                        {boostedAmount !== null ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-se-success">
                            <Zap className="w-3 h-3" aria-hidden="true" /> Boost +{boostedAmount} €/h
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPaid('boost')}
                            className={pillCls}
                            title="Booster la mission"
                          >
                            <Zap className="w-3 h-3" aria-hidden="true" /> Booster
                          </button>
                        )}
                        {called ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-se-success">
                            <Phone className="w-3 h-3" aria-hidden="true" /> Appels lancés
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPaid('call')}
                            className={pillCls}
                            title="Lancer des appels"
                          >
                            <Phone className="w-3 h-3" aria-hidden="true" /> Appeler
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <ul className="-mx-1">
                  {g.shown.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 px-1 py-1 rounded-se-sm hover:bg-se-surface-2">
                      <button
                        type="button"
                        onClick={() => onSelect(c)}
                        className="min-w-0 flex-1 flex items-center gap-2 text-left"
                      >
                        <Avatar person={c} size={26} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="font-semibold text-se-ink hover:text-se-blue-ink truncate">{c.name}</span>
                            {c.kind === 'freelance' && <FavoriteMark name={c.name} />}
                            {/* Postulant (point bleu) ; dans « tout le monde », un tag dit qui a postulé ou non */}
                            {isApplicant(c) && !addMode && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-se-blue shrink-0"
                                title="Se propose"
                                aria-label="Se propose"
                              />
                            )}
                            {addMode &&
                              (isApplicant(c) ? (
                                <span className="se-badge bg-se-blue-wash text-se-blue-ink" style={{ height: 16 }}>
                                  a postulé
                                </span>
                              ) : (
                                <span className="se-badge bg-se-surface-2 text-se-muted" style={{ height: 16 }}>
                                  n’a pas postulé
                                </span>
                              ))}
                          </span>
                          <span className="flex items-center gap-1 mt-0.5 text-[11px] text-se-muted leading-none">
                            {typeof c.rating === 'number' && (
                              <span className="inline-flex items-center gap-0.5">
                                <Star className="w-2.5 h-2.5 fill-current text-amber-500" aria-hidden="true" />
                                {c.rating.toFixed(1)}
                              </span>
                            )}
                            {typeof c.match === 'number' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className={c.match >= 90 ? 'text-se-success font-semibold' : ''}>{c.match}%</span>
                              </>
                            )}
                            {c.kind === 'freelance' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>au devis</span>
                              </>
                            )}
                            {c.kind === 'freelance' && <RateTag missionId={mission.id} c={c} />}
                            {onRest(c) && <RestTag reason={onRest(c)!} />}
                          </span>
                        </span>
                      </button>
                      {!full && (
                        <button
                          type="button"
                          onClick={() => onAct(c)}
                          className="shrink-0 px-2 py-1 rounded-se-sm text-[11px] font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
                        >
                          {isApplicant(c) ? 'Valider' : 'Placer'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {/* « + » : le reste des postulants, ou tout le personnel même sans candidature */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 px-1">
                  {g.shown.length === 0 && (
                    <span className="text-xs text-se-muted">
                      {g.kind === 'freelance'
                        ? 'Aucun auto-entrepreneur postulant pour l’instant.'
                        : 'Aucun postulant · « Ajouter quelqu’un » pour choisir.'}
                    </span>
                  )}
                  {g.hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpanded((s) => new Set(s).add(g.kind))}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-se-blue-ink hover:text-se-blue"
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      {g.kind === 'freelance'
                        ? `Voir tous les auto-entrepreneurs postulants (${g.people.length})`
                        : `${g.hidden} autre${g.hidden > 1 ? 's' : ''} postulant${g.hidden > 1 ? 's' : ''}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Garde-fou : booster / appels engagent de l'argent */}
      {/* Push : on explique avant d'envoyer (gratuit) */}
      {pushing && (
        <ConfirmGuard
          title={`Relancer vos ${pushing === 'salarie' ? 'salariés' : 'extras'} ?`}
          confirmLabel="Relancer"
          onCancel={() => setPushing(null)}
          onConfirm={confirmPush}
        >
          <p>
            Tout le monde a été prévenu à la publication. Vos{' '}
            <strong>{pushing === 'salarie' ? 'salariés' : 'extras'}</strong> reçoivent une nouvelle notification sur
            leur téléphone pour ce créneau ({mission.poste}, {missionTimeLabel(mission)}) et peuvent se proposer en un
            clic.
          </p>
          <p className="text-se-muted">
            Gratuit, réservé à votre personnel. Pour les auto-entrepreneurs : Booster ou Appeler.
          </p>
        </ConfirmGuard>
      )}

      {/* Booster : on explique et on choisit la prime (+2 à +6 €/h) */}
      {paid === 'boost' && (
        <ConfirmGuard
          title="Booster la mission ?"
          confirmLabel={`Booster à +${boostAmount} €/h`}
          onCancel={() => setPaid(null)}
          onConfirm={confirmPaid}
        >
          <p>
            La mission remonte en <strong>tête de liste</strong> chez les auto-entrepreneurs et vous ajoutez une prime
            horaire à leur tarif. Plus la prime est haute, plus vite le créneau se remplit.
          </p>
          <div className="rounded-se-sm border border-se-line bg-se-surface-2/50 p-3">
            <div className="flex items-baseline justify-between mb-2">
              <p className="se-eyebrow">Prime horaire</p>
              <p className="text-xl font-extrabold font-display text-se-ink leading-none">
                +{boostAmount} <span className="text-xs font-normal text-se-muted">€/h</span>
              </p>
            </div>
            <input
              type="range"
              min={1}
              max={6}
              step={1}
              value={boostAmount}
              onChange={(e) => setBoostAmount(Number(e.target.value))}
              aria-label="Prime horaire du boost"
              className="w-full accent-se-blue"
            />
            <div className="flex justify-between text-[11px] text-se-muted mt-1">
              <span>+1 €</span>
              <span>+3 €</span>
              <span>+6 €</span>
            </div>
          </div>
          <p className="font-semibold text-se-ink">
            +{boostAmount} €/h · +{boostTotal} € sur la mission
            <span className="font-normal text-se-muted">
              {' '}
              ({Math.max(remainingPlaces, 1)} place{remainingPlaces > 1 ? 's' : ''} × {hours} h)
            </span>
          </p>
        </ConfirmGuard>
      )}

      {/* Appels : on explique avant de lancer (payant) */}
      {paid === 'call' && (
        <ConfirmGuard
          title="Lancer les appels ?"
          confirmLabel="Lancer"
          onCancel={() => setPaid(null)}
          onConfirm={confirmPaid}
        >
          <p>
            Shift Express appelle <strong>un par un</strong> les auto-entrepreneurs disponibles jusqu'à couvrir le
            créneau. Vous êtes prévenu·e dès qu'une personne accepte.
          </p>
          <p className="font-semibold text-se-ink">10 appels × 0,40 € = 4 €</p>
        </ConfirmGuard>
      )}
    </section>
  );
}

/** Petit bouton d'action de groupe (push, booster, appeler). */
const pillCls =
  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-se-line text-[11px] font-semibold text-se-ink hover:bg-se-surface-2';

/** Étiquette « Propose 34 €/h » d'un auto-entrepreneur qui négocie, ou l'état de votre réponse. */
function RateTag({ missionId, c }: { missionId: string; c: MissionPerson }) {
  const decision = useV2People((s) => s.rateDecisions[`${missionId}:${c.id}`]);
  if (!c.proposedRate) return null;
  if (decision?.status === 'refused') {
    return (
      <span className="ml-1 px-1.5 py-px rounded-full bg-se-surface-2 text-se-muted font-semibold">tarif refusé</span>
    );
  }
  if (decision?.status === 'countered') {
    return (
      <span
        className="ml-1 px-1.5 py-px rounded-full bg-se-blue-wash text-se-blue-ink font-semibold"
        title="Contre-proposition envoyée, en attente de réponse"
      >
        contre-prop. {decision.rate} €/h envoyée
      </span>
    );
  }
  return (
    <span
      className="ml-1 px-1.5 py-px rounded-full bg-se-cascade-wash text-se-cascade-ink font-semibold"
      title="Tarif négocié : différent du tarif publié"
    >
      propose {c.proposedRate} €/h
    </span>
  );
}

/** Étiquette « repos » / « congés » / « maladie »… : la personne n'est pas disponible ce jour-là. */
function RestTag({ reason = 'repos' }: { reason?: string }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-px rounded-full bg-se-cascade-wash text-se-cascade-ink font-semibold"
      title={reason === 'repos' ? 'Jour de repos (Réglages › Personnel fixe & repos)' : `Absence déclarée : ${reason}`}
    >
      <BedDouble className="w-2.5 h-2.5" aria-hidden="true" /> {offLabel(reason as Parameters<typeof offLabel>[0])}
    </span>
  );
}

/* ── Colonne centre ──────────────────────────────────────────── */
function PlacedColumn({
  mission,
  required,
  placed,
  full,
  placedCount,
  onSelect,
  searchRate,
  hoursLocked,
  onRest,
  onRemove,
  onReport,
  onConfirm,
  onRequestAdd,
  onAction,
  onRepublished,
  onReplaced,
  onExportAll,
  onExportOne,
  notice,
}: {
  mission: Mission;
  required: number;
  placed: MissionPlaced[];
  full: boolean;
  placedCount: number;
  /** recherche d'auto-entrepreneurs lancée → la mission se comporte comme publiée */
  searchRate: number | null;
  /** un auto-entrepreneur est validé : horaires figés, pas de replanification */
  hoursLocked: boolean;
  /** salarié placé un jour de repos → étiquette « repos » */
  /** raison d'indisponibilité ce jour-là (repos, congés…) ou null */
  onRest: (p: MissionPerson) => string | null;
  onSelect: (p: MissionPerson) => void;
  onRemove: (id: string) => void;
  onReport: (p: MissionPlaced) => void;
  onConfirm: (id: string) => void;
  onRequestAdd: () => void;
  /** une action du bas (prévenir, publier, booster, relancer, replanifier, dupliquer, annuler) */
  onAction: (key: string) => void;
  /** le créneau vient d'être republié depuis le bandeau de désistement */
  onRepublished: (target: RepublishTarget) => void;
  /** quelqu'un vient d'être placé à la place de la personne désistée */
  onReplaced: (name: string) => void;
  /** fiches PDF : tous les validés du créneau, ou une seule personne */
  onExportAll: () => void;
  onExportOne: (p: MissionPlaced) => void;
  /** retour de la dernière action, sous le bloc d'état */
  notice?: React.ReactNode;
}) {
  const searchActive = searchRate !== null;
  const validated = placed.filter((p) => !p.suggested);
  const actions = availableActions(searchActive ? { ...mission, coverage: 'published' } : mission, hoursLocked);
  // Désistements pas encore traités : le gestionnaire choisit comment republier.
  const released = pendingReleases(mission);
  const left = Math.max(required - placedCount, 0);
  return (
    <section className="p-3 sm:p-4 lg:min-h-0 lg:overflow-y-auto bg-se-surface-2/50">
      {released.length > 0 && (
        <div className="mb-3 rounded-se border border-se-danger/40 bg-se-danger-wash/40 p-3">
          <p className="flex items-start gap-2 text-sm text-se-ink">
            <UserMinus className="w-4 h-4 mt-0.5 shrink-0 text-se-danger" aria-hidden="true" />
            <span>
              {released.map((r, i) => (
                <span key={r.personId}>
                  {i > 0 && ' · '}
                  <strong>{r.name}</strong> a relâché ce shift {r.at}
                  {r.reason ? ` (${r.reason.toLowerCase()})` : ''}
                </span>
              ))}
              . Il manque <strong>{left}</strong> personne{left > 1 ? 's' : ''}. Qui la remplace ?
            </span>
          </p>
          <div className="mt-2.5 space-y-2">
            <ReplaceChoices mission={mission} released={released} onDone={(r) => onReplaced(r.name)} />
            <RepublishChoices mission={mission} left={left} onDone={onRepublished} />
          </div>
          <button
            type="button"
            onClick={() => {
              resolveReleases(mission.id);
              appendHistory(mission.id, 'Désistement traité sans republier', { silent: true });
            }}
            className="mt-2 text-xs font-semibold text-se-muted hover:text-se-ink"
          >
            Je m'en occupe autrement (placer quelqu'un moi-même)
          </button>
        </div>
      )}
      {/* L'état est dans le badge de l'en-tête ; on ne rappelle ici qu'une recherche en cours */}
      {searchActive && (
        <p className="mb-3 text-xs font-semibold text-se-freelance-ink">
          Recherche d'auto-entrepreneurs en cours · {searchRate} €/h TTC · {Math.max(required - placedCount, 0)} place
          {Math.max(required - placedCount, 0) > 1 ? 's' : ''} restante
          {Math.max(required - placedCount, 0) > 1 ? 's' : ''}
        </p>
      )}
      {notice && (
        <p className="mb-3 text-xs text-se-success bg-se-success-wash rounded-se-sm px-3 py-2 inline-flex items-start gap-1.5 w-full">
          <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </p>
      )}

      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="se-eyebrow">Placés sur ce créneau</p>
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-se-muted">
          {validated.length > 0 && (
            <button
              type="button"
              onClick={onExportAll}
              title="Fiches PDF des personnes validées sur ce créneau (une page par personne)"
              className="inline-flex items-center gap-1 text-se-blue-ink hover:text-se-blue"
            >
              <FileDown className="w-3.5 h-3.5" aria-hidden="true" /> Profils PDF
            </button>
          )}
          <span>
            {placedCount}/{required}
          </span>
        </span>
      </div>

      <ul className="space-y-2">
        {placed.map((p) => {
          const k = personKindStyle[p.kind];
          return (
            <li
              key={p.id}
              className={`rounded-se-sm border p-2 ${
                p.suggested ? 'border-dashed border-se-blue bg-se-blue-wash/40' : 'border-se-line bg-se-surface'
              }`}
            >
              {/* Une ligne : coche · avatar · nom + type · pointage · action */}
              <div className="flex items-center gap-2">
                {p.suggested ? (
                  <span
                    className="w-4 h-4 shrink-0 rounded-full border border-dashed border-se-blue"
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className="w-4 h-4 shrink-0 rounded-full bg-se-success text-white grid place-items-center"
                    aria-hidden="true"
                  >
                    <Check className="w-3 h-3" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  className="min-w-0 flex-1 flex items-center gap-2 text-left hover:text-se-blue-ink"
                >
                  <Avatar person={p} size={26} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-se-ink truncate">{p.name}</span>
                    <span className="block text-[11px] leading-tight text-se-muted truncate">
                      <span className={k.text}>{k.label}</span>
                      {onRest(p) && (
                        <>
                          {' · '}
                          <RestTag reason={onRest(p)!} />
                        </>
                      )}
                      {' · '}
                      {p.suggested ? 'suggéré·e' : p.checkedIn ? `pointé·e ${p.clockIn}` : 'à pointer'}
                    </span>
                  </span>
                </button>
                {!p.suggested && (
                  <button
                    type="button"
                    onClick={() => onExportOne(p)}
                    aria-label={`Fiche PDF de ${p.name}`}
                    title="Fiche PDF de cette personne"
                    className="shrink-0 w-7 h-7 grid place-items-center rounded-se-sm text-se-muted hover:text-se-blue-ink hover:bg-se-surface-2"
                  >
                    <FileDown className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
                {p.suggested ? (
                  <button
                    type="button"
                    onClick={() => onConfirm(p.id)}
                    className="shrink-0 px-2.5 py-1 rounded-se-sm text-xs font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
                  >
                    Confirmer
                  </button>
                ) : p.kind === 'freelance' ? (
                  // Un auto-entrepreneur ne se retire jamais directement : on signale.
                  effFreelanceReport(mission, p) ? (
                    <span className="shrink-0 text-right text-[11px] leading-tight font-semibold text-se-cascade-ink">
                      {effFreelanceReport(mission, p) === 'no-show' ? 'Signalé·e' : 'Annulation demandée'}
                      <span className="block font-normal text-se-muted">Shift Express traite</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onReport(p)}
                      className="shrink-0 text-xs font-semibold text-se-cascade-ink hover:text-se-danger"
                    >
                      Signaler
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => onRemove(p.id)}
                    className="shrink-0 text-xs font-semibold text-se-muted hover:text-se-danger"
                  >
                    Retirer
                  </button>
                )}
              </div>
            </li>
          );
        })}

        {/* « Ajouter quelqu'un » : renvoie à la liste de gauche (tout le monde).
            Complet → plus d'ajout, le bouton disparaît. */}
        {!full && (
          <li>
            <button
              type="button"
              onClick={onRequestAdd}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-se-sm border border-dashed border-se-line text-sm font-semibold text-se-muted hover:text-se-ink hover:border-se-muted"
            >
              <Plus className="w-4 h-4" aria-hidden="true" /> Ajouter quelqu'un
            </button>
          </li>
        )}
      </ul>

      {/* Actions en liens — le cycle de vie de la mission */}
      <div className="mt-4 pt-3 border-t border-se-line space-y-1.5">
        {full && <p className="text-xs text-se-success font-semibold mb-1">Besoin couvert.</p>}
        {hoursLocked && (
          <p className="inline-flex items-center gap-1 text-xs text-se-muted mb-1">
            <Lock className="w-3 h-3" aria-hidden="true" /> Horaires figés : auto-entrepreneur validé.
          </p>
        )}
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => onAction(a.key)}
            className={`flex w-full items-baseline justify-between text-left text-sm font-semibold ${
              a.tone === 'danger' ? 'text-se-danger hover:text-se-freelance-ink' : 'text-se-blue-ink hover:text-se-blue'
            }`}
          >
            <span>{a.label}</span>
            {a.costHint && <span className="text-xs font-normal text-se-muted">{a.costHint}</span>}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ── Colonne droite ──────────────────────────────────────────── */
function DetailsColumn({ mission }: { mission: Mission }) {
  // Présents : d'après le relevé partagé (pointage saisi ici ou dans Factures & heures).
  const pointed = effPlaced(mission).filter((p) => !p.suggested && p.checkedIn).length;
  const requiredNow = effRequired(mission);
  // Nombre de postes : − / + sur place. Jamais sous le nombre de personnes déjà
  // placées (on ne « déplace » personne en réduisant), jamais sous 1.
  const placedNow = effPlacedCount(mission);
  const minRequired = Math.max(placedNow, 1);
  const setRequired = (n: number) => {
    if (n < minRequired || n === requiredNow) return;
    writeRequired(mission.id, n);
    appendHistory(mission.id, `Nombre de postes : ${n} (avant ${requiredNow})`);
  };
  // « + » : on confirme d'abord — un poste de plus, c'est une personne de plus à trouver.
  const [confirmAdd, setConfirmAdd] = useState(false);
  // Jusqu'à quand on peut annuler sans frais (préavis plus long pour un événement).
  const eventDays = mission.eventId ? effMissions().filter((x) => x.eventId === mission.eventId).length : 1;
  const cancelInfo = cancellationQuote(mission, effPlaced(mission), { days: eventDays });

  // Infos du shift modifiables sur place (consigne, note privée + PDF,
  // langues, logiciels). Les textes s'enregistrent quand on quitte le champ,
  // les listes tout de suite ; la recherche d'auto-entrepreneurs écrit ici aussi.
  const [consigne, setConsigne] = useState(mission.publicNote ?? '');
  const [notePrivee, setNotePrivee] = useState(mission.privateNote ?? '');
  const langues = mission.languages ?? [];
  const logiciels = mission.software ?? [];
  const pdfName = mission.privatePdf ?? null;
  const setLangues = (v: string[]) => writeDetails(mission.id, { languages: v });
  const setLogiciels = (v: string[]) => writeDetails(mission.id, { software: v });
  const setPdfName = (v: string | null) => writeDetails(mission.id, { privatePdf: v ?? undefined });
  const saveConsigne = () => writeDetails(mission.id, { publicNote: consigne.trim() || undefined });
  const saveNotePrivee = () => writeDetails(mission.id, { privateNote: notePrivee.trim() || undefined });
  // Horaires du shift, modifiables depuis la colonne de droite.
  const [editHours, setEditHours] = useState(false);
  // Un auto-entrepreneur validé = devis engagé sur ces horaires : on ne les change plus d'ici.
  const hoursLocked = effPlaced(mission).some((p) => p.kind === 'freelance' && !p.suggested);
  const [hours, setHours] = useState({ start: mission.start, end: mission.end });
  useEffect(() => {
    setConsigne(mission.publicNote ?? '');
    setNotePrivee(mission.privateNote ?? '');
    setHours({ start: mission.start, end: mission.end });
    setEditHours(false);
  }, [mission.id, mission.publicNote, mission.privateNote, mission.start, mission.end]);

  return (
    <section className="p-3 sm:p-4 lg:min-h-0 lg:overflow-y-auto">
      {/* Où & quand : adresse, horaires, postes, gestionnaire (l'établissement est dans l'en-tête) */}
      <p className="se-eyebrow mb-1.5">Où &amp; quand</p>
      <div className="rounded-se-sm border border-se-line mb-4">
        <div className="p-2.5 space-y-1.5">
          {mission.address && (
            <p className="inline-flex items-start gap-1.5 text-sm text-se-ink">
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-se-muted shrink-0" aria-hidden="true" /> {mission.address}
            </p>
          )}
          {/* Horaires : modifiables sur place — sauf si un auto-entrepreneur est validé (devis engagé) */}
          {hoursLocked ? (
            <p
              className="inline-flex items-center gap-1.5 text-sm text-se-muted"
              title="Un auto-entrepreneur est validé sur ce créneau : les horaires sont figés. Un changement se signale depuis sa fiche."
            >
              <Clock className="w-3.5 h-3.5" aria-hidden="true" /> {missionTimeLabel(mission)}
              <Lock className="w-3 h-3 opacity-60" aria-hidden="true" />
            </p>
          ) : editHours ? (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <Clock className="w-3.5 h-3.5 text-se-muted" aria-hidden="true" />
              <input
                type="time"
                value={hours.start}
                onChange={(e) => setHours((h) => ({ ...h, start: e.target.value }))}
                className="h-8 w-[94px] rounded-se-sm border border-se-line bg-se-surface px-1.5 text-sm text-se-ink focus:outline-none focus:border-se-blue"
                aria-label="Début du shift"
              />
              <span className="text-se-muted">–</span>
              <input
                type="time"
                value={hours.end}
                onChange={(e) => setHours((h) => ({ ...h, end: e.target.value }))}
                className="h-8 w-[94px] rounded-se-sm border border-se-line bg-se-surface px-1.5 text-sm text-se-ink focus:outline-none focus:border-se-blue"
                aria-label="Fin du shift"
              />
              <button
                type="button"
                onClick={() => {
                  rescheduleMission(mission.id, { date: mission.date, start: hours.start, end: hours.end });
                  appendHistory(mission.id, `Horaires modifiés : ${hours.start}–${hours.end}`);
                  setEditHours(false);
                }}
                className="h-8 px-3 rounded-se-sm text-xs font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
              >
                Enregistrer
              </button>
              <button
                type="button"
                onClick={() => {
                  setHours({ start: mission.start, end: mission.end });
                  setEditHours(false);
                }}
                className="h-8 px-2 rounded-se-sm text-xs font-semibold text-se-muted hover:bg-se-surface-2"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditHours(true)}
              title="Modifier les horaires"
              className="inline-flex items-center gap-1.5 text-sm text-se-muted hover:text-se-ink group"
            >
              <Clock className="w-3.5 h-3.5" aria-hidden="true" /> {missionTimeLabel(mission)}
              <Pencil className="w-3 h-3 opacity-50 group-hover:opacity-100" aria-hidden="true" />
            </button>
          )}
          {/* Nombre de postes : − / + ; le − se grise dès qu'on atteint le nombre de placés */}
          <div className="flex items-center gap-1.5 text-sm text-se-muted">
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {requiredNow} poste{requiredNow > 1 ? 's' : ''}
              {placedNow > 0 && (
                <span className="text-xs">
                  {' '}
                  · {placedNow} placé{placedNow > 1 ? 's' : ''}
                </span>
              )}
            </span>
            <span className="ml-auto inline-flex items-center rounded-se-sm border border-se-line overflow-hidden">
              <button
                type="button"
                aria-label="Un poste de moins"
                title={requiredNow <= minRequired ? 'Retirez quelqu’un avant de réduire' : 'Un poste de moins'}
                disabled={requiredNow <= minRequired}
                onClick={() => setRequired(requiredNow - 1)}
                className="w-7 h-7 grid place-items-center text-se-ink hover:bg-se-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Minus className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Un poste de plus"
                title="Un poste de plus"
                onClick={() => setConfirmAdd(true)}
                className="w-7 h-7 grid place-items-center text-se-ink hover:bg-se-surface-2 border-l border-se-line"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </span>
          </div>
          {mission.manager && (
            <p className="inline-flex items-center gap-1.5 text-sm text-se-muted">
              <User className="w-3.5 h-3.5" aria-hidden="true" /> Gestionnaire · {mission.manager}
            </p>
          )}
        </div>
      </div>

      {/* Pas de détail de prix dans la fenêtre : tout est au devis. */}
      <p className="inline-flex items-center gap-1 text-xs text-se-muted mb-4">
        <Lock className="w-3 h-3" aria-hidden="true" /> Tarification au devis ·{' '}
        {cancelInfo.pct === 0
          ? `annulation sans frais jusqu'au ${cancelInfo.freeUntil}`
          : `annulation avec frais (${cancelInfo.total} € TTC)`}
        .
      </p>

      {/* Consigne visible — modifiable */}
      <p className="se-eyebrow inline-flex items-center gap-1 mb-1.5">
        <Eye className="w-3 h-3" aria-hidden="true" /> Consigne visible des personnes placées
      </p>
      <textarea
        value={consigne}
        onChange={(e) => setConsigne(e.target.value)}
        onBlur={saveConsigne}
        rows={2}
        placeholder="Ajouter une consigne pour l'équipe…"
        className={editCls}
      />

      {/* Note privée — modifiable, avec PDF joint */}
      <p className="se-eyebrow inline-flex items-center gap-1 mt-4 mb-1.5">
        <Lock className="w-3 h-3" aria-hidden="true" /> Note privée
      </p>
      <textarea
        value={notePrivee}
        onChange={(e) => setNotePrivee(e.target.value)}
        onBlur={saveNotePrivee}
        rows={2}
        placeholder="Visible de vous seul·e…"
        className={editCls}
      />
      <div className="mt-1.5">
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-se-blue-ink hover:text-se-blue cursor-pointer">
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => setPdfName(e.target.files?.[0]?.name ?? null)}
          />
          <FileText className="w-3.5 h-3.5" aria-hidden="true" />
          {pdfName ? 'Remplacer le PDF' : 'Joindre un PDF'}
        </label>
        {pdfName && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-se-ink">
            <FileText className="w-3.5 h-3.5 text-se-muted shrink-0" aria-hidden="true" />
            <span className="truncate">{pdfName}</span>
            <button
              type="button"
              onClick={() => setPdfName(null)}
              aria-label="Retirer le PDF"
              className="ml-auto text-se-muted hover:text-se-danger"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </p>
        )}
      </div>

      {/* Profil recherché — modifiable */}
      <p className="se-eyebrow inline-flex items-center gap-1 mt-4 mb-1.5">
        <Languages className="w-3 h-3" aria-hidden="true" /> Langues
      </p>
      <MultiSelect options={LANGUES} value={langues} onChange={setLangues} placeholder="Choisir des langues" />
      <p className="se-eyebrow inline-flex items-center gap-1 mt-3 mb-1.5">
        <Monitor className="w-3 h-3" aria-hidden="true" /> Logiciels
      </p>
      <SoftwareSelect value={logiciels} onChange={setLogiciels} />

      {/* Pointage */}
      <p className="se-eyebrow mt-4 mb-1.5">
        Pointage{' '}
        <span className="text-se-muted font-normal normal-case">
          · {pointed}/{requiredNow} présent·es
        </span>
      </p>
      <div className="h-2 rounded-full bg-se-line overflow-hidden">
        <div className="h-full bg-se-success" style={{ width: `${(pointed / Math.max(requiredNow, 1)) * 100}%` }} />
      </div>

      {/* Historique */}
      {mission.history && mission.history.length > 0 && (
        <>
          <p className="se-eyebrow inline-flex items-center gap-1 mt-4 mb-2">
            <History className="w-3 h-3" aria-hidden="true" /> Historique
          </p>
          <ol className="space-y-2.5">
            {mission.history.map((h, i) => (
              <li key={i} className="flex gap-2.5">
                <div className="flex flex-col items-center pt-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-se-blue' : 'bg-se-line'}`}
                    aria-hidden="true"
                  />
                  {i < mission.history!.length - 1 && (
                    <span className="w-px flex-1 bg-se-line mt-1" aria-hidden="true" />
                  )}
                </div>
                <div className="pb-0.5">
                  <p className="text-sm text-se-ink leading-tight">{h.label}</p>
                  <p className="text-xs text-se-muted">{h.at}</p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {/* Un poste de plus = une personne de plus à placer : on le dit avant */}
      {confirmAdd && (
        <ConfirmGuard
          title="Ajouter un poste ?"
          confirmLabel={`Passer à ${requiredNow + 1} postes`}
          onCancel={() => setConfirmAdd(false)}
          onConfirm={() => {
            setRequired(requiredNow + 1);
            setConfirmAdd(false);
          }}
        >
          <p>
            La mission passe de {requiredNow} à {requiredNow + 1} postes :{' '}
            <strong>une personne de plus à placer</strong> sur ce créneau.
          </p>
          <p className="text-se-muted">
            Sur le planning, elle affichera {placedNow}/{requiredNow + 1} et restera « à pourvoir » tant que cette place
            n’est pas prise.
          </p>
        </ConfirmGuard>
      )}
    </section>
  );
}

/** Champ texte modifiable de la colonne Détails (même rendu que la boîte de lecture). */
const editCls =
  'w-full rounded-se-sm border border-se-line bg-se-surface-2 p-2.5 text-sm text-se-ink focus:outline-none focus:border-se-blue focus:bg-se-surface resize-none';
