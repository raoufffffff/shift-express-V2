/**
 * Règle d'annulation d'un shift par le client.
 *
 *  · Shift simple : annulation SANS FRAIS jusqu'à 48 h avant le début.
 *    Entre 48 h et 24 h : 50 % du devis des auto-entrepreneurs validés.
 *    Moins de 24 h : 100 %.
 *  · Mission longue (événement de plusieurs jours) : le préavis gratuit grandit
 *    avec la durée — 48 h pour 1 jour, +24 h par jour supplémentaire, plafonné
 *    à 7 jours (ex. 3 jours → 96 h, 5 jours → 144 h). Les frais se calculent
 *    jour par jour : seuls les jours qui tombent dans le délai sont facturés.
 *  · Les salariés et extras ne génèrent pas de frais Shift Express (ils sont
 *    prévenus) ; seuls les auto-entrepreneurs validés (devis engagé) comptent.
 *
 * Tout est paramétrable ici en un endroit ; en vrai, ces valeurs viendraient
 * des conditions générales / des Réglages.
 */
import type { Mission, MissionPlaced } from '@/mocks/v2Missions';
import { MOCK_NOW } from '@/mocks/v2Today';

/** « Maintenant » de la maquette (aujourd'hui = 31 oct. 2026, 10 h). */
export const NOW = MOCK_NOW;

export const CANCELLATION_POLICY = {
  /** heures de préavis pour annuler sans frais un shift d'un jour */
  freeHours: 48,
  /** en dessous de ce délai : 100 % ; entre halfHours et le préavis : 50 % */
  halfHours: 24,
  /** missions longues : préavis supplémentaire par jour au-delà du premier */
  perExtraDayHours: 24,
  /** plafond du préavis (7 jours) */
  maxNoticeHours: 7 * 24,
};

const parse = (date: string, time: string): Date => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
};
const fmtDateTime = (d: Date) =>
  d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) +
  ' ' +
  d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Préavis gratuit (heures) selon la durée de la mission en jours. */
export function noticeHoursFor(days: number): number {
  const p = CANCELLATION_POLICY;
  return Math.min(p.freeHours + Math.max(days - 1, 0) * p.perExtraDayHours, p.maxNoticeHours);
}

/** Heures entre « maintenant » et le début d'une mission (négatif si commencée). */
export function hoursUntil(m: Pick<Mission, 'date' | 'start'>, now: string = NOW): number {
  const [d, t] = now.split('T');
  return Math.round(((parse(m.date, m.start).getTime() - parse(d, t).getTime()) / 36e5) * 10) / 10;
}

/** Pourcentage de frais pour un jour donné, selon les heures restantes et le préavis. */
export function feePercent(hours: number, noticeHours: number): 0 | 50 | 100 {
  if (hours >= noticeHours) return 0;
  if (hours >= CANCELLATION_POLICY.halfHours) return 50;
  return 100;
}

export interface FeeLine {
  name: string;
  quote: number;
  pct: 0 | 50 | 100;
  fee: number;
}
export interface CancellationQuote {
  /** heures avant le début */
  hoursUntil: number;
  /** préavis gratuit applicable (heures) */
  noticeHours: number;
  /** jusqu'à quand l'annulation est gratuite (libellé) */
  freeUntil: string;
  pct: 0 | 50 | 100;
  lines: FeeLine[];
  total: number;
  /** personnel prévenu sans frais */
  staffCount: number;
  /** mission longue (événement) : nombre de jours */
  days: number;
}

/** Ce que coûterait l'annulation de CETTE mission maintenant. */
export function cancellationQuote(
  m: Mission,
  placed: MissionPlaced[],
  opts: { days?: number; now?: string } = {},
): CancellationQuote {
  const days = Math.max(opts.days ?? 1, 1);
  const noticeHours = noticeHoursFor(days);
  const h = hoursUntil(m, opts.now);
  const pct = feePercent(h, noticeHours);
  const freelances = placed.filter((p) => !p.suggested && p.kind === 'freelance');
  const lines: FeeLine[] = freelances.map((p) => {
    const quote = p.cost ?? 0;
    return { name: p.name, quote, pct, fee: Math.round((quote * pct) / 100) };
  });
  const freeUntilDate = new Date(parse(m.date, m.start).getTime() - noticeHours * 36e5);
  return {
    hoursUntil: h,
    noticeHours,
    freeUntil: fmtDateTime(freeUntilDate),
    pct,
    lines,
    total: lines.reduce((s, l) => s + l.fee, 0),
    staffCount: placed.filter((p) => !p.suggested && p.kind !== 'freelance').length,
    days,
  };
}

/** « dans 30 h » / « dans 3 j » / « déjà commencée ». */
export function hoursLabel(h: number): string {
  if (h < 0) return 'déjà commencée';
  if (h < 48) return `dans ${Math.round(h)} h`;
  return `dans ${Math.round(h / 24)} j`;
}
