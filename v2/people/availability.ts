/**
 * Disponibilité d'une personne un jour donné, en combinant :
 *  · les jours de repos fixes des salariés (Réglages › Personnel fixe & repos) ;
 *  · les absences déclarées (congés, maladie, formation…), salariés comme extras.
 * Renvoie la raison (« repos », « congés payés »…) ou null si la personne est libre.
 */
import { useV2Settings, restDaysOf } from '@/stores/v2SettingsStore';
import { useV2People, absenceOn } from '@/stores/v2PeopleStore';
import type { Absence } from '@/stores/v2PeopleStore';
import type { StaffRule } from '@/stores/v2SettingsStore';
import { parseISO } from '../time';

export type OffReason = 'repos' | Lowercase<Absence['reason']>;

export function offReason(
  staff: StaffRule[],
  absences: Absence[],
  person: { id: string; name: string; kind?: string },
  dateISO: string,
): OffReason | null {
  const abs = absenceOn(absences, person.name, dateISO);
  if (abs) return abs.reason.toLowerCase() as OffReason;
  if (person.kind === 'salarie' && restDaysOf(staff, person).includes(parseISO(dateISO).getDay())) return 'repos';
  return null;
}

/** Hook : (personne, jour) → raison d'indisponibilité ou null. */
export function useUnavailability(): (
  person: { id: string; name: string; kind?: string },
  dateISO: string,
) => OffReason | null {
  const staff = useV2Settings((s) => s.staff);
  const absences = useV2People((s) => s.absences);
  return (person, dateISO) => offReason(staff, absences, person, dateISO);
}

/** Libellé court pour une étiquette : « repos », « congés », « maladie »… */
export const offLabel = (r: OffReason): string => (r === 'congés payés' ? 'congés' : r);
