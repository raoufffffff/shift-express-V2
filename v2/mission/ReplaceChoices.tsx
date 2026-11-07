/**
 * « Qui peut remplacer tout de suite ? » — après un désistement ou une absence
 * de dernière minute : les personnes libres qui tiennent le poste, dans l'ordre
 * de la cascade (fixes, puis bassin de talents), une ligne par personne, un clic
 * place. Celles qu'on écarte sont dites en une ligne (congés, déjà prise, repos).
 */
import { useMemo, useState } from 'react';
import { ChevronRight, UserCheck } from 'lucide-react';
import type { Mission } from '@/mocks/v2Missions';
import { useV2Settings } from '@/stores/v2SettingsStore';
import { useV2People } from '@/stores/v2PeopleStore';
import { Avatar } from '../Avatar';
import { personKindStyle } from '../coverage';
import { replacementsFor } from '../planning/replacement';
import type { Replacement } from '../planning/replacement';
import { useMissionStore, effMissions, replacePerson } from './missionStore';
import type { ShiftRelease } from './missionStore';

interface Props {
  mission: Mission;
  /** la ou les personnes à remplacer */
  released: ShiftRelease[];
  onDone: (who: Replacement) => void;
}

const SHOWN = 3;

export function ReplaceChoices({ mission, released, onDone }: Props) {
  const version = useMissionStore();
  const staff = useV2Settings((s) => s.staff);
  const pool = useV2Settings((s) => s.pool);
  const needs = useV2Settings((s) => s.postes);
  const restRules = useV2Settings((s) => s.restRules);
  const statuses = useV2People((s) => s.statuses);
  const absences = useV2People((s) => s.absences);
  const [all, setAll] = useState(false);

  const { fixes, extras, excluded } = useMemo(() => {
    void version;
    return replacementsFor({
      mission,
      allMissions: effMissions(),
      needs,
      staff,
      pool,
      statuses,
      absences,
      restRules,
      exclude: released.map((r) => r.name),
    });
  }, [mission, released, needs, staff, pool, statuses, absences, restRules, version]);
  const list = [...fixes, ...extras];
  const shown = all ? list : list.slice(0, SHOWN);

  const choose = (r: Replacement) => {
    const out = released[0];
    replacePerson(mission.id, { personId: out.personId, name: out.name, reason: out.reason }, r);
    onDone(r);
  };

  if (list.length === 0) {
    return (
      <p className="text-sm text-se-muted">
        Personne de libre chez vos fixes ni vos extras pour ce créneau
        {excluded.length > 0 ? ` (${excluded.join(' · ')})` : ''}. Republiez-le :
      </p>
    );
  }
  return (
    <div>
      <p className="se-eyebrow mb-1.5">Remplacer tout de suite</p>
      <ul className="space-y-1.5">
        {shown.map((r) => {
          const k = personKindStyle[r.kind];
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => choose(r)}
                className="w-full flex items-center gap-3 rounded-se-sm border border-se-line bg-se-surface p-2.5 text-left hover:border-se-muted hover:bg-se-surface-2/60 transition-colors"
              >
                <Avatar person={r} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-se-ink">
                    {r.name} <span className={`font-medium ${k.text}`}>· {k.label}</span>
                  </span>
                  <span className="block text-xs text-se-muted leading-snug">{r.hint}</span>
                </span>
                <span className="inline-flex items-center gap-1 shrink-0 text-xs font-semibold text-se-blue-ink">
                  <UserCheck className="w-3.5 h-3.5" aria-hidden="true" /> Placer
                  <ChevronRight className="w-4 h-4 text-se-muted" aria-hidden="true" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {(list.length > SHOWN || excluded.length > 0) && (
        <p className="mt-1.5 text-xs text-se-muted">
          {list.length > SHOWN && !all && (
            <button
              type="button"
              onClick={() => setAll(true)}
              className="font-semibold text-se-blue-ink hover:underline"
            >
              Voir les {list.length - SHOWN} autres
            </button>
          )}
          {list.length > SHOWN && !all && excluded.length > 0 ? ' · ' : ''}
          {excluded.length > 0 ? `Écartés : ${excluded.join(' · ')}` : ''}
        </p>
      )}
      <p className="se-eyebrow mt-3 mb-1.5">Ou republier le créneau</p>
    </div>
  );
}
