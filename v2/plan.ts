/**
 * Formules d'abonnement — LES MÊMES que l'app (packages/shared) : Free,
 * Starter, Pro, Enterprise. Ce qu'elles limitent : le nombre d'établissements,
 * le nombre de shifts EMPLOYÉS par mois (jamais ceux publiés aux
 * auto-entrepreneurs, qui restent illimités) et le nombre d'employés.
 * -1 = illimité. La maquette compte les shifts employés par mois de la date du
 * shift (l'app réelle compte par période de facturation).
 */
import { SUBSCRIPTION_PLANS } from '@shared/types';
import type { SubscriptionPlan } from '@shared/types';
import { MOCK_TODAY } from '@/mocks/v2Today';
import { useV2Ui } from '@/stores/v2UiStore';
import { effMissions } from './mission/missionStore';

export type { SubscriptionPlan };

export const PLAN_ORDER: SubscriptionPlan[] = ['free', 'starter', 'pro', 'enterprise'];
export const UNLIMITED = -1;

export interface PlanLimits {
  establishments: number;
  employeeShiftsPerMonth: number;
  employees: number;
}

export function planLimits(plan: SubscriptionPlan): PlanLimits {
  const c = SUBSCRIPTION_PLANS[plan];
  return {
    establishments: c.max_establishments,
    employeeShiftsPerMonth: c.max_shifts_per_month,
    employees: c.max_employees_per_establishment,
  };
}

export const planName = (plan: SubscriptionPlan): string => SUBSCRIPTION_PLANS[plan].name;

/** « Gratuit », « 49 €/mois », « Sur devis ». */
export function planPrice(plan: SubscriptionPlan): string {
  const c = SUBSCRIPTION_PLANS[plan];
  if (plan === 'enterprise') return 'Sur devis';
  if (c.price_monthly === 0) return 'Gratuit';
  return `${c.price_monthly} €/mois`;
}

/** « 39 €/mois facturé à l'année », ou null si la formule n'a pas de prix annuel. */
export function planYearly(plan: SubscriptionPlan): string | null {
  const c = SUBSCRIPTION_PLANS[plan];
  if (c.price_yearly <= 0) return null;
  return `${Math.round(c.price_yearly / 12)} €/mois facturé à l'année`;
}

export const PLAN_BLURB: Record<SubscriptionPlan, string> = {
  free: 'Pour essayer Shift Express',
  starter: 'Un établissement, toute votre équipe',
  pro: 'Chaînes et multi-établissements',
  enterprise: 'Grandes chaînes, 6 établissements et plus',
};

export const isUnlimited = (n: number): boolean => n === UNLIMITED;

/** « 15 employés », « employés illimités ». */
export function limitLabel(n: number, singular: string, plural = `${singular}s`): string {
  if (isUnlimited(n)) return `${plural} illimités`;
  return `${n} ${n > 1 ? plural : singular}`;
}

/** « 1 établissement · 15 shifts employés par mois · 15 employés ». */
export function planSummary(plan: SubscriptionPlan): string {
  const l = planLimits(plan);
  return [
    limitLabel(l.establishments, 'établissement'),
    isUnlimited(l.employeeShiftsPerMonth)
      ? 'shifts employés illimités'
      : `${l.employeeShiftsPerMonth} shifts employés par mois`,
    limitLabel(l.employees, 'employé'),
  ].join(' · ');
}

export const currentPlan = (): SubscriptionPlan => useV2Ui.getState().plan;

export const monthOf = (iso: string): string => iso.slice(0, 7);
export const MONTH_NOW = monthOf(MOCK_TODAY);
export const monthLabel = (month = MONTH_NOW): string =>
  new Date(`${month}-01T00:00`).toLocaleDateString('fr-FR', { month: 'long' });

/** Shifts employés (proposés au personnel ou en cascade) datés de ce mois, annulés exclus. */
export function employeeShiftsInMonth(month = MONTH_NOW): number {
  return effMissions().filter((m) => m.system !== 'freelance' && m.date.startsWith(month)).length;
}

/** Combien de shifts employés on peut encore créer ce mois (Infinity si illimité). */
export function employeeShiftRoom(plan: SubscriptionPlan = currentPlan(), month = MONTH_NOW): number {
  const max = planLimits(plan).employeeShiftsPerMonth;
  if (isUnlimited(max)) return Infinity;
  return Math.max(max - employeeShiftsInMonth(month), 0);
}

/** La première formule au-dessus qui permet PLUS sur ce point (ex. Starter n'a pas plus d'établissements que Free → Pro). */
export function nextPlan(plan: SubscriptionPlan, limit: keyof PlanLimits = 'establishments'): SubscriptionPlan | null {
  const cur = planLimits(plan)[limit];
  return (
    PLAN_ORDER.slice(PLAN_ORDER.indexOf(plan) + 1).find((p) => {
      const n = planLimits(p)[limit];
      return isUnlimited(n) || (!isUnlimited(cur) && n > cur);
    }) ?? null
  );
}

/** Ce qui dépasserait si on passait à cette formule (pour prévenir avant de rétrograder). */
export function overLimits(
  plan: SubscriptionPlan,
  usage: { establishments: number; employees: number; employeeShifts: number },
): string[] {
  const l = planLimits(plan);
  const out: string[] = [];
  if (!isUnlimited(l.establishments) && usage.establishments > l.establishments) {
    out.push(
      `vous avez ${usage.establishments} établissements, ${planName(plan)} en permet ${l.establishments} : les autres passeront en veille`,
    );
  }
  if (!isUnlimited(l.employees) && usage.employees > l.employees) {
    out.push(`vous avez ${usage.employees} employés, ${planName(plan)} en permet ${l.employees}`);
  }
  if (!isUnlimited(l.employeeShiftsPerMonth) && usage.employeeShifts > l.employeeShiftsPerMonth) {
    out.push(
      `vous avez déjà ${usage.employeeShifts} shifts employés ce mois, ${planName(plan)} en permet ${l.employeeShiftsPerMonth} : plus aucun ne pourra être créé avant le mois prochain`,
    );
  }
  return out;
}
