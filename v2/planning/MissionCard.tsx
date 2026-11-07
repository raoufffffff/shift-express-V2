/**
 * Carte de mission — brique commune des vues Semaine et Liste.
 * Dans l'ordre (spec Ubeya) : bandeau coloré portant le POSTE + le ratio
 * placés/besoin, puis l'horaire, le % de couverture, et une étiquette
 * avec le nom de l'établissement. La couleur du bandeau DIT l'état ;
 * le libellé d'état reste en title/aria pour l'accessibilité.
 * Un clic ouvre la fenêtre de mission.
 */
import { Link2, UserMinus } from 'lucide-react';
import type { Mission } from '@/mocks/v2Missions';
import { missionFill, cancelledStyle, missionStatusLabel, fillPct } from '../coverage';
import { useMissionStore, effPlaced, effPlacedCount, effRequired, pendingReleases } from '../mission/missionStore';
import { Avatar } from '../Avatar';
import { missionTimeLabel } from '../time';

/** Photos des validés + ronds pointillés pour les places encore vides. */
const MAX_FACES = 4;

interface Props {
  mission: Mission;
  onOpen: () => void;
  /** version compacte pour la grille Semaine */
  dense?: boolean;
}

export function MissionCard({ mission, onOpen, dense }: Props) {
  useMissionStore(); // suit les placements en direct
  // Couleur = remplissage : rouge vide · orange incomplet · vert complet.
  // Annulée : gris hachuré, elle reste à sa place (trace), en lecture seule.
  const cancelled = !!mission.cancelled;
  const style = cancelled ? cancelledStyle : missionFill(mission);
  const placed = effPlacedCount(mission);
  const required = effRequired(mission);
  const pct = fillPct(placed, required);
  const statusLabel = cancelled ? 'Annulée' : missionStatusLabel(mission);
  const faces = effPlaced(mission)
    .filter((p) => !p.suggested)
    .slice(0, MAX_FACES);
  const extraFaces = Math.max(placed - faces.length, 0);
  // Quelqu'un s'est désisté et rien n'a été décidé : la carte le dit.
  const released = cancelled ? [] : pendingReleases(mission);
  const empty = Math.max(Math.min(required - placed, MAX_FACES - faces.length), 0);

  return (
    <button
      type="button"
      onClick={onOpen}
      title={statusLabel}
      aria-label={`${mission.poste} · ${statusLabel} · ${placed} sur ${required}`}
      className={`w-full text-left border border-se-line rounded-se overflow-hidden shadow-se hover:border-se-muted transition-colors ${
        cancelled ? 'se-hatched' : 'bg-se-surface'
      }`}
    >
      {/* Bandeau coloré : couleur = état, + poste + ratio placés/besoin */}
      <div
        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 ${style.band} ${
          style.dash ? 'border-b-2 border-dashed border-white/50' : ''
        } ${cancelled ? 'border-b border-se-line' : 'text-white'}`}
      >
        <span className={`font-semibold leading-tight truncate ${cancelled ? 'line-through' : ''}`}>
          {mission.poste}
        </span>
        <span className="font-bold text-sm whitespace-nowrap">{cancelled ? 'Annulée' : `${placed}/${required}`}</span>
      </div>

      <div className={dense ? 'p-2.5' : 'p-3.5'}>
        <div className="flex items-center gap-1.5 text-xs text-se-muted">
          <span className={`font-medium ${cancelled ? 'text-se-muted line-through' : 'text-se-ink'}`}>
            {missionTimeLabel(mission)}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {cancelled
              ? mission.cancelled!.fees > 0
                ? `${mission.cancelled!.fees} € de frais`
                : 'sans frais'
              : `${pct} %`}
          </span>
        </div>

        {/* Qui est validé (photos) + places encore vides (ronds pointillés) */}
        <div
          className={`flex items-center mt-2 ${cancelled ? 'grayscale opacity-70' : ''}`}
          aria-label={`${placed} validé${placed > 1 ? 's' : ''} sur ${required}`}
        >
          {faces.map((p, i) => (
            <span key={p.id} title={p.name} className={`rounded-full ${i > 0 ? '-ml-1' : ''}`}>
              {/* Lettre sous la photo : S salarié · E extra · A auto-entrepreneur */}
              <Avatar person={p} size={24} tag ring />
            </span>
          ))}
          {extraFaces > 0 && (
            <span className="-ml-1.5 w-[22px] h-[22px] rounded-full ring-2 ring-se-surface bg-se-surface-2 text-se-muted text-[10px] font-bold grid place-items-center">
              +{extraFaces}
            </span>
          )}
          {Array.from({ length: cancelled ? 0 : empty }, (_, i) => (
            <span
              key={`empty-${i}`}
              aria-hidden="true"
              className={`w-[22px] h-[22px] rounded-full border-2 border-dashed border-se-line bg-se-surface ${
                faces.length + i > 0 ? '-ml-1.5' : ''
              }`}
            />
          ))}
          {!dense && (
            <span className="se-badge bg-se-surface-2 text-se-muted ml-2 max-w-full truncate">
              {mission.establishment}
            </span>
          )}
        </div>
        {dense && (
          <span className="se-badge bg-se-surface-2 text-se-muted mt-2 max-w-full truncate">
            {mission.establishment}
          </span>
        )}
        {released.length > 0 && (
          <span
            className="se-badge bg-se-danger-wash text-se-danger mt-1.5 inline-flex items-center gap-1 max-w-full truncate"
            title={`${released.map((r) => r.name).join(', ')} : shift relâché, place à republier`}
          >
            <UserMinus className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="truncate">Shift relâché · à republier</span>
          </span>
        )}
        {mission.eventName && (
          <span className="se-badge bg-se-blue-wash text-se-blue-ink mt-1.5 inline-flex items-center gap-1 max-w-full truncate">
            <Link2 className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{mission.eventName}</span>
          </span>
        )}
      </div>
    </button>
  );
}
