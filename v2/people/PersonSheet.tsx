/**
 * Fiche d'une personne ouverte depuis Mon équipe : la même fenêtre pour
 * tout le monde (ProfileSheet), sans contexte de mission.
 */
import type { Person } from '@/mocks/v2People';
import { ProfileSheet } from './ProfileSheet';

export function PersonSheet({ person, onClose }: { person: Person; onClose: () => void }) {
  return <ProfileSheet person={person} onClose={onClose} />;
}
