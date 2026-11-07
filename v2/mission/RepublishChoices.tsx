/**
 * « À qui republier ce créneau ? » — trois lignes cliquables, pas plus :
 *   · à mon personnel (salariés et extras, aucun coût) ;
 *   · en cascade (salariés → extras → auto-entrepreneurs, délais des Réglages) ;
 *   · directement aux auto-entrepreneurs (tarif des Réglages, validation avant engagement).
 * Sert après un désistement (bandeau de la fenêtre) et dans le garde-fou de
 * suppression (« republier plutôt que supprimer »). Un clic applique tout de suite.
 */
import { Users, GitBranch, Briefcase, ChevronRight } from 'lucide-react';
import type { Mission } from '@/mocks/v2Missions';
import { useV2Settings, rateFor } from '@/stores/v2SettingsStore';
import { systemChoice } from '../coverage';
import { cascadePlan, planShort, planSummary, atLabel } from '../cascade';
import { hoursUntil } from './cancellation';
import { republishMission } from './missionStore';
import type { RepublishTarget } from './missionStore';

interface Props {
  mission: Mission;
  /** places à pourvoir (pour la phrase) */
  left: number;
  onDone: (target: RepublishTarget) => void;
}

export function RepublishChoices({ mission, left, onDone }: Props) {
  const cascade = useV2Settings((s) => s.cascade);
  const establishments = useV2Settings((s) => s.establishments);
  const account = useV2Settings((s) => s.account);
  const estId = establishments.find((e) => e.name === mission.establishment)?.id ?? account.establishmentId;
  const rate = rateFor(cascade.freelanceRates, estId, mission.poste);
  // Paliers d'urgence : le plan dépend du temps restant avant le début du shift.
  const plan = cascadePlan(cascade, hoursUntil(mission));
  const places = `${left} place${left > 1 ? 's' : ''}`;

  const choose = (target: RepublishTarget) => {
    if (target === 'cascade') {
      republishMission(mission.id, 'cascade', {
        cascadeFreelanceAt: plan.freelancesAtH > 0 ? atLabel(plan.freelancesAtH) : undefined,
        cascadeHint: planSummary(plan),
      });
    } else if (target === 'freelance') {
      republishMission(mission.id, 'freelance', { rate });
    } else {
      republishMission(mission.id, 'personnel');
    }
    onDone(target);
  };

  const rows: {
    target: RepublishTarget;
    icon: typeof Users;
    label: string;
    hint: string;
    tone: keyof typeof systemChoice;
  }[] = [
    {
      target: 'personnel',
      icon: Users,
      label: 'Proposer à mon personnel',
      hint: `Salariés et extras prévenus, ils se proposent sur ${places}. Aucun coût.`,
      tone: 'employe',
    },
    {
      target: 'cascade',
      icon: GitBranch,
      label: 'Lancer la cascade',
      hint: `${planShort(plan)}.`,
      tone: 'cascade',
    },
    {
      target: 'freelance',
      icon: Briefcase,
      label: 'Publier aux auto-entrepreneurs',
      hint: `Tout de suite, ${rate} €/h TTC. Vous validez chaque personne avant tout engagement.`,
      tone: 'freelance',
    },
  ];

  return (
    <ul className="space-y-1.5">
      {rows.map(({ target, icon: Icon, label, hint, tone }) => {
        const c = systemChoice[tone];
        return (
          <li key={target}>
            <button
              type="button"
              onClick={() => choose(target)}
              className="w-full flex items-center gap-3 rounded-se-sm border border-se-line bg-se-surface p-2.5 text-left hover:border-se-muted hover:bg-se-surface-2/60 transition-colors"
            >
              <span className={`w-8 h-8 shrink-0 rounded-se-sm grid place-items-center ${c.wash} ${c.text}`}>
                <Icon className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-se-ink">{label}</span>
                <span className="block text-xs text-se-muted leading-snug">{hint}</span>
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-se-muted" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
