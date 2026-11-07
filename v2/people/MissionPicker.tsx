/**
 * Choisir une mission depuis une fiche :
 *  · salarié / extra → « Placer sur une mission » : la personne est placée
 *    directement sur le créneau choisi (missions à venir avec une place libre) ;
 *  · auto-entrepreneur → « Inviter sur une mission » : il/elle n'est jamais
 *    placé·e d'office, on l'invite à postuler ; la mission garde la trace.
 * Une seule liste, cliquable ; les jours de repos ou d'absence sont indiqués.
 */
import { useMemo } from 'react';
import { X, BedDouble, Mail, CalendarPlus } from 'lucide-react';
import type { Mission, MissionPerson } from '@/mocks/v2Missions';
import { MOCK_TODAY } from '@/mocks/v2Today';
import { useV2People } from '@/stores/v2PeopleStore';
import { useV2Ui } from '@/stores/v2UiStore';
import {
  useVisibleMissions,
  effPlaced,
  effRequired,
  effPlacedCount,
  writePlaced,
  appendHistory,
} from '../mission/missionStore';
import { useUnavailability, offLabel } from './availability';
import { missionTimeLabel, parseISO } from '../time';
import { fillTone } from '../coverage';

interface Props {
  person: Pick<MissionPerson, 'id' | 'name' | 'kind' | 'photo' | 'rating'>;
  /** postes que la personne peut tenir (vide = tous) */
  roles?: string[];
  onClose: () => void;
  /** après placement / invitation : la mission concernée */
  onDone: (mission: Mission) => void;
}

export function MissionPicker({ person, roles = [], onClose, onDone }: Props) {
  const freelance = person.kind === 'freelance';
  const freelanceOnly = useV2Ui((s) => s.mode) === 'freelance';
  const missions = useVisibleMissions(freelanceOnly);
  const whyOff = useUnavailability();
  const invite = useV2People((s) => s.invite);
  const invited = useV2People((s) => s.invitations[person.name] ?? []);
  const log = useV2Ui((s) => s.log);

  // Missions à venir avec une place libre, où la personne n'est pas déjà : ses
  // postes d'abord ; s'il n'y en a aucune, les autres postes (on le dit).
  const { options, otherPostes } = useMemo(() => {
    const open = missions
      .filter((m) => m.date >= MOCK_TODAY)
      .filter((m) => effPlacedCount(m) < effRequired(m))
      .filter((m) => !effPlaced(m).some((p) => p.name === person.name))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    const inRoles = roles.length === 0 ? open : open.filter((m) => roles.includes(m.poste));
    return inRoles.length > 0
      ? { options: inRoles.slice(0, 12), otherPostes: false }
      : { options: open.slice(0, 12), otherPostes: open.length > 0 };
  }, [missions, person.name, roles]);

  const pick = (m: Mission) => {
    if (freelance) {
      invite(person.name, m.id);
      appendHistory(m.id, `${person.name} invité·e à postuler (depuis sa fiche)`, { silent: true });
      log({ kind: 'personne', label: 'Invitation envoyée', detail: `${person.name} · ${m.poste} · ${m.date}` });
    } else {
      writePlaced(m.id, [
        ...effPlaced(m),
        { id: person.id, name: person.name, kind: person.kind, photo: person.photo, rating: person.rating },
      ]);
      appendHistory(m.id, `${person.name} placé·e depuis sa fiche`);
    }
    onDone(m);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-se-ink/40" />
      <div className="se-root relative w-full max-w-md bg-se-surface rounded-se shadow-se-md p-5 max-h-[85vh] flex flex-col">
        <div className="flex items-start gap-2 mb-1">
          {freelance ? (
            <Mail className="w-5 h-5 text-se-freelance mt-0.5" aria-hidden="true" />
          ) : (
            <CalendarPlus className="w-5 h-5 text-se-blue mt-0.5" aria-hidden="true" />
          )}
          <h3 className="text-base font-extrabold text-se-ink">
            {freelance ? `Inviter ${person.name} sur une mission` : `Placer ${person.name} sur une mission`}
          </h3>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="ml-auto w-7 h-7 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-se-muted mb-3">
          {freelance
            ? 'Un auto-entrepreneur postule puis se valide : l’invitation lui propose le créneau.'
            : 'Missions à venir avec une place libre. Un clic place la personne.'}
        </p>

        {otherPostes && (
          <p className="text-xs text-se-cascade-ink bg-se-cascade-wash rounded-se-sm px-3 py-2 mb-2">
            Aucune place libre dans {roles.length > 1 ? 'ses postes habituels' : `son poste habituel (${roles[0]})`}.
            Voici les autres missions à pourvoir.
          </p>
        )}
        {options.length === 0 ? (
          <p className="text-sm text-se-muted">Aucune mission à venir avec une place libre.</p>
        ) : (
          <ul className="space-y-1.5 overflow-y-auto">
            {options.map((m) => {
              const off = freelance ? null : whyOff(person, m.date);
              const placed = effPlacedCount(m);
              const required = effRequired(m);
              const d = parseISO(m.date);
              const already = freelance && invited.includes(m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => pick(m)}
                    disabled={already}
                    className="w-full text-left rounded-se-sm border border-se-line px-3 py-2 hover:bg-se-surface-2 disabled:opacity-60 flex items-center gap-3"
                  >
                    <span className="w-12 shrink-0 text-center">
                      <span className="block se-eyebrow">{d.toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
                      <span className="block text-lg font-extrabold font-display text-se-ink leading-none">
                        {d.getDate()}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-se-ink truncate">{m.poste}</span>
                      <span className="block text-xs text-se-muted truncate">
                        {missionTimeLabel(m)} · {m.establishment}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {already ? (
                        <span className="text-[11px] font-semibold text-se-success">Invité·e</span>
                      ) : (
                        <span className={`text-xs font-semibold ${fillTone(placed, required)}`}>
                          {placed}/{required}
                        </span>
                      )}
                      {off && (
                        <span className="block text-[11px] text-se-muted inline-flex items-center gap-1">
                          <BedDouble className="w-3 h-3" aria-hidden="true" /> {offLabel(off)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
