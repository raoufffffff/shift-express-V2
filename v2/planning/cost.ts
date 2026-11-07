/**
 * Ce que coûte le planning — en euros, pour une semaine ou un jeu de missions :
 *   · paie : heures des salariés et extras placés × leur tarif horaire brut
 *     (fiche Réglages › Personnel, sinon l'indicatif du poste) ;
 *   · auto-entrepreneurs : le devis de chacun s'il existe, sinon heures × tarif
 *     des Réglages › Cascade pour l'établissement et le poste.
 * Même calcul pour les propositions d'Optimiser (ce que coûterait le placement).
 */
import type { Mission, PersonKind } from '@/mocks/v2Missions';
import type { EstablishmentInfo, PoolRule, StaffRule } from '@/stores/v2SettingsStore';
import { rateFor, salaryRateOf } from '@/stores/v2SettingsStore';
import { effPlaced } from '../mission/missionStore';
import { missionHours } from '../time';

export interface CostContext {
  staff: StaffRule[];
  pool: PoolRule[];
  freelanceRates: Record<string, Record<string, number>>;
  establishments: EstablishmentInfo[];
  /** établissement du compte (portée du tarif par défaut) */
  accountEstablishmentId: string;
}

export interface Cost {
  /** salariés + extras, brut */
  paie: number;
  /** auto-entrepreneurs, TTC */
  freelance: number;
  total: number;
}

/** Tarif horaire brut d'un salarié / extra (fiche, sinon indicatif du poste). */
export function hourlyRateOf(
  p: { id: string; name: string; kind: PersonKind },
  poste: string,
  ctx: Pick<CostContext, 'staff' | 'pool'>,
): number {
  const rule =
    p.kind === 'salarie'
      ? ctx.staff.find((r) => r.personId === p.id || r.name === p.name)
      : ctx.pool.find((r) => r.personId === p.id || r.name === p.name);
  return rule?.hourlyRate ?? salaryRateOf(poste);
}

/** Tarif auto-entrepreneur d'une mission (Réglages › Cascade, établissement puis entreprise). */
export function freelanceRateOfMission(m: Pick<Mission, 'establishment' | 'poste'>, ctx: CostContext): number {
  const estId = ctx.establishments.find((e) => e.name === m.establishment)?.id ?? ctx.accountEstablishmentId;
  return rateFor(ctx.freelanceRates, estId, m.poste);
}

/** Coût d'un placement (une personne sur une mission). */
export function placementCost(
  m: Mission,
  p: { id: string; name: string; kind: PersonKind; cost?: number },
  ctx: CostContext,
): number {
  const h = missionHours(m);
  if (p.kind === 'freelance') return p.cost ?? h * freelanceRateOfMission(m, ctx);
  return h * hourlyRateOf(p, m.poste, ctx);
}

/** Coût des personnes placées (fermes) sur ces missions. */
export function costOf(missions: Mission[], ctx: CostContext): Cost {
  let paie = 0;
  let freelance = 0;
  missions.forEach((m) =>
    effPlaced(m)
      .filter((p) => !p.suggested)
      .forEach((p) => {
        const c = placementCost(m, p, ctx);
        if (p.kind === 'freelance') freelance += c;
        else paie += c;
      }),
  );
  paie = Math.round(paie);
  freelance = Math.round(freelance);
  return { paie, freelance, total: paie + freelance };
}

/** « 1 240 € » avec l'espace fine française. */
export const euros = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
