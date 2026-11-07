/**
 * Votre formule — les quatre de l'app : Free (gratuit, pour essayer), Starter,
 * Pro, Enterprise (sur devis). Chacune dit en trois lignes ce qu'elle permet :
 * établissements, shifts employés par mois, employés. Les shifts publiés aux
 * auto-entrepreneurs ne sont jamais comptés. Avant de rétrograder, on prévient
 * de ce qui dépasserait. Enterprise : on rappelle, rien ne change tout seul.
 */
import { useState } from 'react';
import { X, Check, Users, GitBranch, Clock, Building2, CalendarDays, Lock, Phone, AlertTriangle } from 'lucide-react';
import { useV2Ui } from '@/stores/v2UiStore';
import { useV2Settings } from '@/stores/v2SettingsStore';
import { useMissionStore } from '../mission/missionStore';
import {
  PLAN_ORDER,
  PLAN_BLURB,
  planName,
  planPrice,
  planYearly,
  planLimits,
  limitLabel,
  isUnlimited,
  employeeShiftsInMonth,
  overLimits,
} from '../plan';
import type { SubscriptionPlan } from '../plan';

/** Première lettre en capitale (« Employés illimités »). */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const INCLUDED = [
  { icon: Users, text: 'Vos salariés et extras dans le planning, placement direct, jours de repos' },
  { icon: GitBranch, text: 'Cascade : vos salariés, puis vos extras, puis les auto-entrepreneurs' },
  { icon: Clock, text: 'Relevé d’heures, approbation et envoi en paie (Excel, Silae, Payfit…)' },
  { icon: Building2, text: 'Postes, besoins quotidiens, personnel fixe et gestionnaires' },
];

interface Props {
  onClose: () => void;
  /** pourquoi la fenêtre s'ouvre (limite atteinte…), en une phrase */
  reason?: string;
  /** après un changement de formule (la formule est déjà enregistrée) */
  onChosen?: (plan: SubscriptionPlan) => void;
}

export function UpgradeDialog({ onClose, reason, onChosen }: Props) {
  useMissionStore(); // les shifts employés du mois suivent le planning
  const current = useV2Ui((s) => s.plan);
  const setPlan = useV2Ui((s) => s.setPlan);
  const establishments = useV2Settings((s) => s.establishments);
  const staff = useV2Settings((s) => s.staff);
  const pool = useV2Settings((s) => s.pool);
  const usage = {
    establishments: establishments.length,
    employees: staff.length + pool.length,
    employeeShifts: employeeShiftsInMonth(),
  };
  const [plan, setSelected] = useState<SubscriptionPlan>(current);
  const [called, setCalled] = useState(false);
  const warnings = plan === current ? [] : overLimits(plan, usage);

  const choose = () => {
    if (plan === 'enterprise') {
      setCalled(true);
      return;
    }
    if (plan !== current) {
      setPlan(plan);
      onChosen?.(plan);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-se-ink/50" />
      <div className="se-root relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-se-surface rounded-se shadow-se-md overflow-hidden">
        <header className="flex items-start gap-3 px-5 py-4 border-b border-se-line">
          <div className="min-w-0 flex-1">
            <p className="se-eyebrow mb-0.5">Abonnement</p>
            <h2 className="text-lg font-extrabold text-se-ink">Votre formule</h2>
            <p className="text-sm text-se-muted mt-0.5">
              {reason ??
                'La formule fixe le nombre d’établissements, de shifts employés par mois et d’employés. Les missions publiées aux auto-entrepreneurs sont toujours illimitées.'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="p-5 space-y-5 overflow-y-auto">
          {called ? (
            <div className="text-center py-6">
              <Phone className="w-8 h-8 mx-auto text-se-blue-ink mb-2" aria-hidden="true" />
              <p className="font-semibold text-se-ink">On vous rappelle sous 24 h pour la formule Enterprise.</p>
              <p className="text-sm text-se-muted mt-1">
                Votre formule {planName(current)} reste en place en attendant.
              </p>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Formule">
                {PLAN_ORDER.map((key) => {
                  const on = plan === key;
                  const l = planLimits(key);
                  const yearly = planYearly(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setSelected(key)}
                      className={`text-left rounded-se border p-3.5 transition-colors ${
                        on
                          ? 'border-se-blue ring-1 ring-se-blue bg-se-blue-wash/40'
                          : 'border-se-line hover:border-se-muted'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-se-ink">{planName(key)}</span>
                        {key === current && (
                          <span className="se-badge bg-se-success-wash text-se-success" style={{ height: 18 }}>
                            Actuelle
                          </span>
                        )}
                        {on && <Check className="w-4 h-4 text-se-blue-ink ml-auto" aria-hidden="true" />}
                      </span>
                      <span className="block text-lg font-extrabold font-display text-se-ink mt-1">
                        {planPrice(key)}
                      </span>
                      <span className="block text-xs text-se-muted">{yearly ?? PLAN_BLURB[key]}</span>
                      <ul className="mt-2.5 space-y-1 text-xs text-se-ink">
                        <li className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-se-muted shrink-0" aria-hidden="true" />
                          {cap(limitLabel(l.establishments, 'établissement'))}
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5 text-se-muted shrink-0" aria-hidden="true" />
                          {isUnlimited(l.employeeShiftsPerMonth)
                            ? 'Shifts employés illimités'
                            : `${l.employeeShiftsPerMonth} shifts employés par mois`}
                        </li>
                        <li className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-se-muted shrink-0" aria-hidden="true" />
                          {cap(limitLabel(l.employees, 'employé'))}
                        </li>
                      </ul>
                    </button>
                  );
                })}
              </div>

              {warnings.length > 0 && (
                <div className="flex items-start gap-2 rounded-se border border-se-cascade/50 bg-se-cascade-wash px-3.5 py-3 text-sm text-se-ink">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-se-cascade-ink" aria-hidden="true" />
                  <p>
                    <strong>Avec {planName(plan)} :</strong> {warnings.join(' ; ')}.
                  </p>
                </div>
              )}

              <div>
                <p className="se-eyebrow mb-1.5">Dans toutes les formules</p>
                <ul className="space-y-1.5">
                  {INCLUDED.map(({ icon: Icon, text }) => (
                    <li key={text} className="flex items-start gap-2 text-sm text-se-ink">
                      <Icon className="w-4 h-4 text-se-blue-ink mt-0.5 shrink-0" aria-hidden="true" />
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-se-line space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
            >
              {called ? 'Fermer' : plan === current ? `Garder ${planName(current)}` : 'Annuler'}
            </button>
            {!called && plan !== current && (
              <button
                type="button"
                onClick={choose}
                className="flex-1 py-2.5 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
              >
                {plan === 'enterprise' ? 'Être rappelé·e' : `Passer à ${planName(plan)}`}
              </button>
            )}
          </div>
          <p className="inline-flex items-center gap-1.5 text-xs text-se-muted">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" /> Sans engagement, résiliable à tout moment. −20 % à
            l’année.
          </p>
        </footer>
      </div>
    </div>
  );
}
