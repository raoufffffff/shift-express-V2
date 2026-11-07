/** Couleur = système/état de couverture. Classes Tailwind `se-*` par état. */
import type { CoverageSystem, Mission, PersonKind } from '@/mocks/v2Missions';
import { effPlaced, effPlacedCount, effRequired } from './mission/missionStore';

export interface CoverageStyle {
  /** bande colorée de la carte */
  band: string;
  /** pastille + texte du badge d'état */
  badge: string;
  dash?: boolean;
}

/**
 * Code couleur du planning — trois couleurs, rien d'autre :
 *   rouge  → personne (ni salarié, ni extra, ni auto-entrepreneur) ;
 *   orange → équipe incomplète ;
 *   vert   → couvert à 100 %.
 * Le système (salariés, cascade, freelances) ne change pas la couleur : il se lit
 * dans la fenêtre de la mission. Une suggestion du prédictif garde son pointillé.
 */
export function fillStyle(placed: number, required: number, suggested = false): CoverageStyle {
  const base =
    placed <= 0
      ? { band: 'bg-se-danger', badge: 'bg-se-danger-wash text-se-danger' }
      : placed < required
        ? { band: 'bg-se-cascade', badge: 'bg-se-cascade-wash text-se-cascade-ink' }
        : { band: 'bg-se-success', badge: 'bg-se-success-wash text-se-success' };
  return suggested ? { ...base, dash: true } : base;
}
/** Même chose, à partir d'une mission (placements en direct). */
export const missionFill = (m: Mission): CoverageStyle =>
  fillStyle(effPlacedCount(m), effRequired(m), m.coverage === 'suggested');

/** Shift annulé : gris, hachuré ; il ne porte plus de couleur d'état. */
export const cancelledStyle: CoverageStyle = {
  band: 'bg-se-surface-2 text-se-muted',
  badge: 'bg-se-surface-2 text-se-muted line-through',
};

/** Teinte texte d'un compteur placés/besoin : rouge vide · orange incomplet · vert complet. */
export function fillTone(placed: number, required: number): string {
  if (required <= 0) return 'text-se-muted';
  if (placed >= required) return 'text-se-success';
  if (placed <= 0) return 'text-se-danger';
  return 'text-se-cascade-ink';
}
/** Pourcentage de remplissage, borné et sans division par zéro. */
export const fillPct = (placed: number, required: number): number =>
  required > 0 ? Math.min(100, Math.round((placed / required) * 100)) : 0;

/**
 * Libellé d'état CALCULÉ depuis les placements en direct (pas depuis l'état
 * figé du mock) : il dit toujours la même chose que la couleur.
 */
export function missionStatusLabel(m: Mission): string {
  const placed = effPlacedCount(m);
  const required = effRequired(m);
  if (placed >= required) return m.coverage === 'freelance_validated' ? 'Complet · auto-entrepreneur' : 'Complet';
  if (m.coverage === 'published' || m.coverage === 'freelance_validated')
    return placed === 0 ? 'Publié aux auto-entrepreneurs' : `Publié · ${placed}/${required}`;
  if (m.coverage === 'cascade') return `Cascade · ${placed}/${required}`;
  if (m.coverage === 'suggested' && effPlaced(m).some((p) => p.suggested)) return 'Suggéré · à confirmer';
  return placed === 0 ? 'Manque' : `Incomplet · ${placed}/${required}`;
}

/** Couleur par type de personne : salarié bleu · extra violet · freelance rose. */
export interface PersonKindStyle {
  label: string;
  dot: string;
  wash: string;
  text: string;
}

export const personKindStyle: Record<PersonKind, PersonKindStyle> = {
  salarie: { label: 'Salarié', dot: 'bg-se-blue', wash: 'bg-se-blue-wash', text: 'text-se-blue-ink' },
  extra: { label: 'Extra', dot: 'bg-se-extra', wash: 'bg-se-extra-wash', text: 'text-se-extra-ink' },
  freelance: {
    label: 'Auto-entrepreneur',
    dot: 'bg-se-freelance',
    wash: 'bg-se-freelance-wash',
    text: 'text-se-freelance-ink',
  },
};

/**
 * Les 3 systèmes de couverture, en choix de carte pour le panneau Publier.
 * La couleur DIT le système : employé bleu · cascade orange · freelance rose.
 */
export interface SystemChoice {
  label: string;
  /** une phrase en mots simples, pas de jargon */
  blurb: string;
  dot: string;
  band: string;
  wash: string;
  text: string;
  ring: string;
}

export const systemChoice: Record<CoverageSystem, SystemChoice> = {
  employe: {
    label: 'Mes salariés',
    blurb: 'Je place mon équipe. Aucun coût en plus.',
    dot: 'bg-se-blue',
    band: 'bg-se-blue',
    wash: 'bg-se-blue-wash',
    text: 'text-se-blue-ink',
    ring: 'ring-se-blue border-se-blue',
  },
  cascade: {
    label: 'Cascade',
    blurb: "D'abord mes salariés, puis mes extras, puis les auto-entrepreneurs — automatique.",
    dot: 'bg-se-cascade',
    band: 'bg-se-cascade',
    wash: 'bg-se-cascade-wash',
    text: 'text-se-cascade-ink',
    ring: 'ring-se-cascade border-se-cascade',
  },
  freelance: {
    label: 'Auto-entrepreneurs',
    blurb: 'Je publie directement aux auto-entrepreneurs. Devis affiché avant de valider.',
    dot: 'bg-se-freelance',
    band: 'bg-se-freelance',
    wash: 'bg-se-freelance-wash',
    text: 'text-se-freelance-ink',
    ring: 'ring-se-freelance border-se-freelance',
  },
};
