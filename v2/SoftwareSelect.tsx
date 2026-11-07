/**
 * Choix du logiciel à maîtriser — UN SEUL (un lieu tourne sur un PMS ou une
 * caisse, pas plusieurs), groupé PMS hôtellerie / caisse POS restauration.
 * Même contrat que MultiSelect (tableau de 0 ou 1 valeur) pour s'y substituer
 * sans toucher aux données de mission.
 */
import { LOGICIEL_GROUPS } from '@/mocks/v2Missions';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export function SoftwareSelect({ value, onChange, placeholder = 'Aucun logiciel requis' }: Props) {
  const current = value[0] ?? '';
  return (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
      aria-label="Logiciel à maîtriser"
      className={`w-full h-10 rounded-se-sm border border-se-line bg-se-surface px-3 text-sm focus:outline-none focus:border-se-blue ${
        current ? 'text-se-ink' : 'text-se-muted'
      }`}
    >
      <option value="">{placeholder}</option>
      {LOGICIEL_GROUPS.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
