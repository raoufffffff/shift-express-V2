/**
 * Ce que le client écrit ou décide sur les personnes, le temps de la session :
 *  · note privée par personne ;
 *  · statut décidé (candidature acceptée → actif, refusée → bloqué, blocage) ;
 *  · fil de messages par mission (l'onglet Messages ne repart plus de zéro) ;
 *  · auto-entrepreneurs favoris (acceptés automatiquement quand ils postulent) ;
 *  · attestations de vigilance demandées (par nom, avec la date) ;
 *  · absences & congés déclarés ;
 *  · évaluations de fin de mission des auto-entrepreneurs ;
 *  · réponses aux tarifs négociés (contre-proposition, refus).
 * En mémoire pour la maquette ; en vrai, ces écritures iraient en base.
 */
import { create } from 'zustand';
import type { PersonStatus } from '@/mocks/v2People';

export interface StoredMessage {
  id: string;
  mine: boolean;
  from?: string;
  system?: boolean;
  text: string;
  time: string;
  seen?: number;
  audience?: 'placed' | 'candidates' | 'all';
  /** question de disponibilité : plage et horaires demandés */
  availability?: { from: string; to: string; start: string; end: string; to_name: string };
  /** réponse « oui » reçue (simulée) → bouton « Créer le shift » */
  availableYes?: boolean;
  /** missions créées depuis cette réponse */
  createdMissionIds?: string[];
}

/** Absence déclarée (congés, maladie, formation…) : la personne est indisponible ces jours-là. */
export type AbsenceReason = 'Congés payés' | 'Maladie' | 'Formation' | 'Indisponible' | 'Autre';
export const ABSENCE_REASONS: AbsenceReason[] = ['Congés payés', 'Maladie', 'Formation', 'Indisponible', 'Autre'];
export interface Absence {
  id: string;
  /** nom de la personne (les mocks réutilisent une même personne sous plusieurs ids) */
  name: string;
  /** ISO, inclus */
  from: string;
  to: string;
  reason: AbsenceReason;
}

/** L'absence qui couvre ce jour, s'il y en a une. */
export const absenceOn = (absences: Absence[], name: string, iso: string): Absence | undefined =>
  absences.find((a) => a.name === name && a.from <= iso && iso <= a.to);

/** Évaluation d'un auto-entrepreneur à la fin d'une mission. */
export interface Review {
  missionId: string;
  name: string;
  rating: number;
  comment: string;
  /** ISO datetime */
  at: string;
}
export const reviewKey = (missionId: string, name: string) => `${missionId}:${name}`;

/** Réponse du client à un tarif négocié par un auto-entrepreneur. */
export interface RateDecision {
  status: 'countered' | 'refused';
  /** €/h TTC contre-proposés */
  rate?: number;
}

interface V2PeopleState {
  notes: Record<string, string>;
  setNote: (personId: string, note: string) => void;
  statuses: Record<string, PersonStatus>;
  setStatus: (personId: string, status: PersonStatus) => void;
  /** messages envoyés pendant la session, par mission */
  threads: Record<string, StoredMessage[]>;
  appendMessage: (missionId: string, message: StoredMessage) => void;
  updateMessage: (missionId: string, messageId: string, patch: Partial<StoredMessage>) => void;
  /** auto-entrepreneurs favoris, par nom */
  favorites: string[];
  toggleFavorite: (name: string) => boolean;
  /** attestation de vigilance demandée : nom → date ISO de la demande */
  vigilanceRequests: Record<string, string>;
  requestVigilance: (name: string) => void;
  /** absences & congés déclarés (salariés, extras) */
  absences: Absence[];
  addAbsence: (a: Omit<Absence, 'id'>) => void;
  removeAbsence: (id: string) => void;
  /** évaluations de fin de mission : `${missionId}:${name}` */
  reviews: Record<string, Review>;
  addReview: (r: Omit<Review, 'at'>) => void;
  /** « Plus tard » sur la fenêtre d'évaluation : on ne la remontre pas cette session */
  reviewsDismissed: boolean;
  dismissReviews: () => void;
  /** rouvrir la fenêtre d'évaluation (depuis le tableau de bord) */
  reopenReviews: () => void;
  /** tarifs négociés : `${missionId}:${personId}` → décision */
  rateDecisions: Record<string, RateDecision>;
  setRateDecision: (missionId: string, personId: string, d: RateDecision) => void;
  /** messages envoyés à une personne depuis sa fiche : nom → messages */
  directMessages: Record<string, DirectMessage[]>;
  sendDirectMessage: (name: string, text: string) => void;
  /** problème signalé à Shift Express depuis une fiche : nom → date ISO */
  personReports: Record<string, string>;
  reportPerson: (name: string) => void;
  /** auto-entrepreneur invité à postuler : nom → missions */
  invitations: Record<string, string[]>;
  invite: (name: string, missionId: string) => void;
}

/** Un message envoyé à une personne depuis sa fiche (hors fil de mission). */
export interface DirectMessage {
  text: string;
  /** ISO datetime */
  at: string;
}

export const useV2People = create<V2PeopleState>((set, get) => ({
  notes: {},
  setNote: (personId, note) => set((s) => ({ notes: { ...s.notes, [personId]: note } })),
  statuses: {},
  setStatus: (personId, status) => set((s) => ({ statuses: { ...s.statuses, [personId]: status } })),
  threads: {},
  appendMessage: (missionId, message) =>
    set((s) => ({ threads: { ...s.threads, [missionId]: [...(s.threads[missionId] ?? []), message] } })),
  updateMessage: (missionId, messageId, patch) =>
    set((s) => ({
      threads: {
        ...s.threads,
        [missionId]: (s.threads[missionId] ?? []).map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
      },
    })),
  favorites: ['Nadia Cherif'],
  toggleFavorite: (name) => {
    const on = !get().favorites.includes(name);
    set((s) => ({ favorites: on ? [...s.favorites, name] : s.favorites.filter((n) => n !== name) }));
    return on;
  },
  vigilanceRequests: {},
  requestVigilance: (name) =>
    set((s) => ({ vigilanceRequests: { ...s.vigilanceRequests, [name]: new Date().toISOString() } })),
  absences: [{ id: 'abs-1', name: 'Hugo Moreau', from: '2026-11-04', to: '2026-11-08', reason: 'Congés payés' }],
  addAbsence: (a) => set((s) => ({ absences: [...s.absences, { ...a, id: `abs-${Date.now()}` }] })),
  removeAbsence: (id) => set((s) => ({ absences: s.absences.filter((a) => a.id !== id) })),
  reviews: {},
  addReview: (r) =>
    set((s) => ({
      reviews: { ...s.reviews, [reviewKey(r.missionId, r.name)]: { ...r, at: new Date().toISOString() } },
    })),
  reviewsDismissed: false,
  dismissReviews: () => set({ reviewsDismissed: true }),
  reopenReviews: () => set({ reviewsDismissed: false }),
  rateDecisions: {},
  setRateDecision: (missionId, personId, d) =>
    set((s) => ({ rateDecisions: { ...s.rateDecisions, [`${missionId}:${personId}`]: d } })),
  directMessages: {},
  sendDirectMessage: (name, text) =>
    set((s) => ({
      directMessages: {
        ...s.directMessages,
        [name]: [...(s.directMessages[name] ?? []), { text, at: new Date().toISOString() }],
      },
    })),
  personReports: {},
  reportPerson: (name) => set((s) => ({ personReports: { ...s.personReports, [name]: new Date().toISOString() } })),
  invitations: {},
  invite: (name, missionId) =>
    set((s) => ({
      invitations: {
        ...s.invitations,
        [name]: Array.from(new Set([...(s.invitations[name] ?? []), missionId])),
      },
    })),
}));

/** Hook : cet auto-entrepreneur est-il favori ? */
export const useIsFavorite = (name: string): boolean => useV2People((s) => s.favorites.includes(name));
