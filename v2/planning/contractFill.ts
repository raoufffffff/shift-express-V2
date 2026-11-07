/**
 * Préremplissage du planning avec les HORAIRES DU CONTRAT des fixes
 * (Réglages › Personnel › Horaires du contrat) : dès qu'une semaine s'affiche,
 * chaque salarié est posé sur ses créneaux fixes — la mission est créée s'il
 * n'y en a pas encore sur ce créneau, sinon la personne y est ajoutée.
 * Jamais : un jour de congés, sur un créneau annulé, à la place de quelqu'un
 * (créneau complet), ni contre une règle de repos. Un créneau retiré à la main
 * n'est pas reposé : chaque (jour, personne, créneau) n'est tenté qu'une fois
 * par session.
 */
import type { PersonStatus } from '@/mocks/v2People';
import type { Absence } from '@/stores/v2PeopleStore';
import type { PosteNeed, RestRules, StaffRule } from '@/stores/v2SettingsStore';
import { DAY_LONG, contractShiftsOn, isClosedDay, needsFor, slotIndexOf, slotsOn } from '@/stores/v2SettingsStore';
import { offReason } from '../people/availability';
import {
  appendHistory,
  createMission,
  effMissions,
  effMissionsWithCancelled,
  effPlaced,
  effRequired,
  writePlaced,
} from '../mission/missionStore';
import { parseISO } from '../time';
import { restIssue, shiftsOf } from './weekPlan';
import { employeeShiftRoom, monthOf } from '../plan';

const attempted = new Set<string>();

interface Input {
  dates: string[];
  today: string;
  staff: StaffRule[];
  needs: PosteNeed[];
  /** établissement des missions à créer */
  establishment: string;
  statuses: Record<string, PersonStatus | undefined>;
  absences: Absence[];
  restRules: RestRules;
}

/** Pose les horaires du contrat sur ces jours. Renvoie le nombre de créneaux posés. */
export function applyContractShifts(input: Input): number {
  const { dates, today, staff, needs, establishment, statuses, absences, restRules } = input;
  let placed = 0;
  dates
    .filter((date) => date >= today && !isClosedDay(date))
    .forEach((date) => {
      const weekday = parseISO(date).getDay();
      staff
        .filter((r) => r.autoSchedule !== false && statuses[r.personId] !== 'bloque')
        .forEach((r) => {
          contractShiftsOn(r, weekday).forEach((c) => {
            const key = `${date}:${r.name}:${c.poste}:${c.label}`;
            if (attempted.has(key)) return;
            attempted.add(key);
            const person = { id: r.personId, name: r.name, kind: 'salarie' as const };
            if (offReason(staff, absences, person, date) !== null) return;
            const need = needsFor(needs, date).find((n) => n.poste === c.poste);
            const slots = need ? slotsOn(need, weekday) : [];
            const idx = slots.findIndex((sl) => sl.label === c.label);
            const slot = idx >= 0 ? slots[idx] : { label: c.label, start: c.start, end: c.end, count: 1 };
            // La mission qui couvre déjà ce créneau (annulée comprise : on ne la recrée pas).
            const dayMissions = effMissionsWithCancelled().filter((m) => m.date === date && m.poste === c.poste);
            const covering =
              idx >= 0
                ? dayMissions.find((m) => slotIndexOf(m, slots) === idx)
                : dayMissions.find((m) => m.start === c.start && m.end === c.end);
            const when = `${c.label.toLowerCase()} du ${DAY_LONG[weekday]}`;
            if (covering) {
              if (covering.cancelled) return;
              const already = effPlaced(covering);
              if (already.some((p) => p.name === r.name)) return;
              if (already.filter((p) => !p.suggested).length >= effRequired(covering)) return;
              const issue = restIssue(
                shiftsOf(effMissions(), r.name),
                { date, start: covering.start, end: covering.end },
                restRules,
              );
              if (issue) return;
              writePlaced(covering.id, [...already, { ...person, checkedIn: false }]);
              appendHistory(covering.id, `${r.name} placé·e d'après ses horaires du contrat (${when})`, {
                silent: true,
              });
              placed += 1;
              return;
            }
            if (restIssue(shiftsOf(effMissions(), r.name), { date, start: slot.start, end: slot.end }, restRules)) {
              return;
            }
            // Formule : plus de shifts employés possibles ce mois → rien n'est créé.
            if (employeeShiftRoom(undefined, monthOf(date)) <= 0) return;
            createMission({
              poste: c.poste,
              establishment,
              date,
              start: slot.start,
              end: slot.end,
              required: slot.count,
              system: 'employe',
              coverage: slot.count <= 1 ? 'complete' : 'shortage',
              placed: [{ ...person, checkedIn: false }],
              candidates: [],
              estimatedCost: 0,
              history: [{ at: 'maintenant', label: `Horaires du contrat de ${r.name} · ${when}` }],
            });
            placed += 1;
          });
        });
    });
  return placed;
}

/** Créneaux du contrat déjà au planning sur ces jours (la personne est bien dessus). */
export function contractShiftsPlaced(staff: StaffRule[], needs: PosteNeed[], dates: string[]): number {
  const live = effMissions();
  let n = 0;
  dates.forEach((date) => {
    const weekday = parseISO(date).getDay();
    staff.forEach((r) =>
      contractShiftsOn(r, weekday).forEach((c) => {
        const need = needsFor(needs, date).find((x) => x.poste === c.poste);
        const slots = need ? slotsOn(need, weekday) : [];
        const idx = slots.findIndex((sl) => sl.label === c.label);
        const on = live
          .filter((m) => m.date === date && m.poste === c.poste)
          .filter((m) => (idx >= 0 ? slotIndexOf(m, slots) === idx : m.start === c.start))
          .some((m) => effPlaced(m).some((p) => p.name === r.name && !p.suggested));
        if (on) n += 1;
      }),
    );
  });
  return n;
}
