/**
 * État d'interface de la refonte v2, partagé entre les écrans :
 *  · le mode d'usage (Auto-entrepreneurs uniquement / Gestion complète) ;
 *  · la formule d'abonnement (Free, Starter, Pro, Enterprise — celles de l'app) ;
 *  · l'ouverture d'une mission demandée depuis ailleurs (cloche, duplication) ;
 *  · la fermeture de la fenêtre de mission (après annulation) ;
 *  · les notifications lues, et ce dont on veut être prévenu (et par quel canal) ;
 *  · le journal des décisions de la session (onglet Historique de la cloche).
 */
import { create } from 'zustand';
import type { UsageMode } from '@/mocks/v2Settings';
import type { SubscriptionPlan } from '@shared/types';

/** Les quatre familles de notifications. */
export type NotifKind = 'candidature' | 'desistement' | 'cascade' | 'pointage' | 'repos' | 'alerte';
export interface NotifPrefs {
  /** familles actives (une famille coupée n'apparaît plus dans la cloche) */
  kinds: Record<NotifKind, boolean>;
  push: boolean;
  email: boolean;
  /** ne rien recevoir la nuit (push), sauf cascade */
  quietNight: boolean;
}

/** Fenêtre ou vue du planning à ouvrir en arrivant (tableau de bord, cloche). */
export type PlanningAction = 'optimize' | 'publish' | 'send' | 'send-next' | 'personnel';

/* ── Historique des décisions ─────────────────────────────── */
/** Famille d'une entrée du journal (icône et couleur dans la cloche). */
export type JournalKind = 'mission' | 'personne' | 'paie' | 'publication';
export interface JournalEntry {
  id: string;
  /** horodatage ISO (heure réelle de la décision) */
  at: string;
  kind: JournalKind;
  /** ce qui a été décidé, en mots simples */
  label: string;
  /** contexte : mission, personne, période… */
  detail?: string;
  /** mission concernée (un clic l'ouvre) */
  missionId?: string;
}

interface V2UiState {
  mode: UsageMode;
  /** formule en cours (limites d'établissements, de shifts employés et d'employés) */
  plan: SubscriptionPlan;
  setPlan: (plan: SubscriptionPlan) => void;
  /** décisions prises pendant la session, plus récente en premier */
  journal: JournalEntry[];
  log: (entry: Omit<JournalEntry, 'id' | 'at'>) => void;
  setMode: (mode: UsageMode) => void;
  /** mission à ouvrir sur le planning (consommée par PlanningPage) */
  openMissionId: string | null;
  requestOpenMission: (id: string | null) => void;
  /** fenêtre du planning à ouvrir en arrivant (tableau de bord → « Optimiser » / « Publier ») */
  planningAction: PlanningAction | null;
  requestPlanningAction: (action: PlanningAction | null) => void;
  /** incrémenté pour fermer la fenêtre de mission ouverte */
  closeMissionToken: number;
  requestCloseMission: () => void;
  readNotifications: string[];
  markNotificationsRead: (ids: string[]) => void;
  notifPrefs: NotifPrefs;
  setNotifPrefs: (patch: Partial<Omit<NotifPrefs, 'kinds'>>) => void;
  setNotifKind: (kind: NotifKind, on: boolean) => void;
}

export const useV2Ui = create<V2UiState>((set) => ({
  mode: 'complete',
  // La maquette a deux établissements : il faut Pro (Free et Starter n'en permettent qu'un).
  plan: 'pro',
  setPlan: (plan) => set({ plan }),
  journal: [],
  log: (entry) =>
    set((s) => ({
      journal: [{ ...entry, id: `j-${Date.now()}-${s.journal.length}`, at: new Date().toISOString() }, ...s.journal],
    })),
  setMode: (mode) => set({ mode }),
  openMissionId: null,
  requestOpenMission: (id) => set({ openMissionId: id }),
  planningAction: null,
  requestPlanningAction: (action) => set({ planningAction: action }),
  closeMissionToken: 0,
  requestCloseMission: () => set((s) => ({ closeMissionToken: s.closeMissionToken + 1 })),
  readNotifications: [],
  markNotificationsRead: (ids) =>
    set((s) => ({ readNotifications: Array.from(new Set([...s.readNotifications, ...ids])) })),
  notifPrefs: {
    kinds: { candidature: true, desistement: true, cascade: true, pointage: true, repos: true, alerte: true },
    push: true,
    email: true,
    quietNight: true,
  },
  setNotifPrefs: (patch) => set((s) => ({ notifPrefs: { ...s.notifPrefs, ...patch } })),
  setNotifKind: (kind, on) =>
    set((s) => ({ notifPrefs: { ...s.notifPrefs, kinds: { ...s.notifPrefs.kinds, [kind]: on } } })),
}));
