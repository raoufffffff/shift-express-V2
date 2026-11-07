/**
 * Hôte unique de la fenêtre de mission : monté dans la coquille v2, il ouvre
 * la mission demandée (`requestOpenMission`) par-dessus n'importe quel écran —
 * planning, tableau de bord, messages, cloche, factures, fiches — sans
 * passer par le planning. ‹ › passent d'une mission à l'autre dans l'ordre
 * du calendrier ; une mission annulée reste ouvrable, en lecture seule.
 */
import { useEffect, useMemo } from 'react';
import { useV2Ui } from '@/stores/v2UiStore';
import { useVisibleMissions } from './missionStore';
import { MissionWindow } from './MissionWindow';

export function MissionWindowHost() {
  const freelanceOnly = useV2Ui((s) => s.mode) === 'freelance';
  const openMissionId = useV2Ui((s) => s.openMissionId);
  const requestOpenMission = useV2Ui((s) => s.requestOpenMission);
  const missions = useVisibleMissions(freelanceOnly, true);
  const ordered = useMemo(
    () => [...missions].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)),
    [missions],
  );
  const index = openMissionId ? ordered.findIndex((m) => m.id === openMissionId) : -1;

  // Mission disparue (filtre de mode) → on ferme proprement.
  useEffect(() => {
    if (openMissionId && index < 0) requestOpenMission(null);
  }, [openMissionId, index, requestOpenMission]);

  if (index < 0) return null;
  return (
    <MissionWindow
      missions={ordered}
      index={index}
      onIndexChange={(i) => requestOpenMission(ordered[i]?.id ?? null)}
      onClose={() => requestOpenMission(null)}
    />
  );
}
