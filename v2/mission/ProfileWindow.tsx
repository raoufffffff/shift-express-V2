/**
 * Fenêtre « profil » ouverte depuis une mission en cliquant le nom d'une
 * personne (postulant ou placé) : la fiche commune (ProfileSheet), avec le
 * contexte de la mission (bloc « Pour cette mission »).
 */
import type { Mission, MissionPerson } from '@/mocks/v2Missions';
import { ProfileSheet } from '../people/ProfileSheet';
import { isApplicant } from './missionActions';
import { effPlaced } from './missionStore';

export function ProfileWindow({
  person,
  mission,
  onClose,
}: {
  person: MissionPerson;
  mission?: Mission;
  onClose: () => void;
}) {
  // Placé·e pour de bon sur la mission → « placé » ; sinon postulant (auto-entrepreneur, ou « à valider ») ; sinon disponible.
  const placed = mission ? effPlaced(mission).some((p) => p.id === person.id && !p.suggested) : 'checkedIn' in person;
  const missionContext = placed ? 'placed' : isApplicant(person) ? 'applicant' : 'available';
  return <ProfileSheet person={person} mission={mission} onClose={onClose} missionContext={missionContext} />;
}
