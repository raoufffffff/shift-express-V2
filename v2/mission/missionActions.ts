/**
 * Logique de la colonne centre : la couverture pilote l'état.
 * Les liens de publication n'apparaissent QUE s'ils ont un sens dans l'état
 * courant ; quand placés = besoin, ils se cachent (prompt §2.3).
 */
import type { Mission, MissionPerson, PersonKind } from '@/mocks/v2Missions';
import { effPlaced, effRequired } from './missionStore';

/**
 * Un candidat a « postulé » (candidature reçue) vs simple disponibilité.
 * Un auto-entrepreneur est toujours un postulant : il ne se place pas, il se valide.
 */
export function isApplicant(c: MissionPerson): boolean {
  return c.kind === 'freelance' || c.action === 'valider';
}

/**
 * Action unique de la colonne gauche, selon la spec :
 * Remplacer si le créneau est déjà plein, sinon Valider si la personne a
 * postulé, sinon Placer (elle est seulement disponible).
 */
export function candidateAction(mission: Mission, c: MissionPerson): 'valider' | 'placer' | 'remplacer' {
  if (isFull(mission)) return 'remplacer';
  return isApplicant(c) ? 'valider' : 'placer';
}

/** Ordre fixe des types : salariés, puis extras/CDD, puis auto-entrepreneurs. */
const KIND_RANK: Record<PersonKind, number> = { salarie: 0, extra: 1, freelance: 2 };

/** En-tête de groupe de la colonne gauche. */
export const kindGroupLabel: Record<PersonKind, string> = {
  salarie: 'Salariés',
  extra: "Extras & CDD d'usage",
  freelance: 'Auto-entrepreneurs',
};

/**
 * Tri des postulants : par type (salarié → extra → freelance), puis
 * candidatures avant disponibilités, puis par note décroissante.
 */
export function sortCandidates(candidates: MissionPerson[]): MissionPerson[] {
  return [...candidates].sort((a, b) => {
    if (KIND_RANK[a.kind] !== KIND_RANK[b.kind]) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
    const applied = Number(isApplicant(b)) - Number(isApplicant(a)); // postulants d'abord
    if (applied !== 0) return applied;
    return (b.rating ?? 0) - (a.rating ?? 0);
  });
}

export interface MissionAction {
  key: string;
  label: string;
  /** action payante → le coût exact est affiché avant le clic (garde-fou) */
  costHint?: string;
  tone?: 'default' | 'danger';
}

/** Personnes réellement placées (store partagé ; une suggestion ne compte pas). */
export function effectivePlaced(m: Mission): number {
  return effPlaced(m).filter((p) => !p.suggested).length;
}

export function isFull(m: Mission): boolean {
  return effectivePlaced(m) >= effRequired(m);
}

/** Ligne d'état affichée au-dessus de la colonne centre. */
export function statusLine(m: Mission): string {
  const placed = effectivePlaced(m);
  const required = effRequired(m);
  const left = Math.max(0, required - placed);
  if (placed >= required) {
    return `Complet — ${placed}/${required} placés.`;
  }
  switch (m.coverage) {
    case 'complete':
      // Était complet, mais quelqu'un a été retiré : il manque du monde.
      return `Manque — ${left} place(s) à couvrir, rien de lancé.`;
    case 'suggested':
      return 'Suggéré par le prédictif — à confirmer.';
    case 'cascade':
      return `Cascade en cours — étape extras ouverte, ${left} place(s) restante(s).`;
    case 'shortage':
      return `Manque — ${left} place(s) à couvrir, rien de lancé.`;
    case 'published':
      return `Publié aux auto-entrepreneurs — ${left} place(s) restante(s).`;
    case 'freelance_validated':
      return `Auto-entrepreneur validé — ${m.quote ?? 0} € TTC engagés.`;
  }
}

/**
 * Liens d'action de la colonne centre : le cycle de vie de la mission.
 * Trouver du monde (relancer l'équipe, publier, booster, appeler) se fait dans
 * la colonne de gauche, à côté des personnes concernées — jamais en double ici.
 *  · Replanifier : sauf si un auto-entrepreneur est validé (devis engagé sur ces horaires).
 *  · Dupliquer : toujours.
 *  · Annuler la publication : seulement si la mission est publiée.
 *  · Supprimer la mission : toujours — derrière un garde-fou qui propose
 *    d'abord de modifier ou de republier le créneau.
 */
export function availableActions(m: Mission, hoursLocked = false): MissionAction[] {
  const actions: MissionAction[] = [];
  if (!hoursLocked) actions.push({ key: 'reschedule', label: 'Replanifier' });
  actions.push({ key: 'duplicate', label: 'Dupliquer' });
  if (m.coverage === 'published') {
    actions.push({ key: 'cancelPublish', label: 'Annuler la publication', tone: 'danger' });
  }
  actions.push({ key: 'cancel', label: 'Supprimer la mission', tone: 'danger' });
  return actions;
}
