/**
 * Exports « Excel » (CSV ; séparateur point-virgule, UTF-8 avec BOM, décimales
 * à la française — s'ouvre directement dans Excel et Numbers) :
 *  · liste des personnes : personnel (salariés + extras), auto-entrepreneurs, ou tout ;
 *  · planning de la semaine : une ligne par mission, avec les personnes placées.
 */
import type { Mission } from '@/mocks/v2Missions';
import { people } from '@/mocks/v2People';
import type { Person, PersonStatus } from '@/mocks/v2People';
import { freelanceProfileOf, maskPhone, maskEmail } from '@/mocks/v2Freelances';
import type { StaffRule } from '@/stores/v2SettingsStore';
import { DAY_LONG } from '@/stores/v2SettingsStore';
import { effPlaced, effPlacedCount, effRequired, isContactUnlocked } from './mission/missionStore';
import { missionHours } from './time';
import type { Counter } from './factures/counters';

const LETTER = { salarie: 'S', extra: 'E', freelance: 'A' } as const;
const KIND = { salarie: 'Salarié', extra: 'Extra (CDD d’usage)', freelance: 'Auto-entrepreneur' } as const;
const STATUS: Record<PersonStatus, string> = {
  actif: 'Actif',
  dispo: 'Disponible',
  candidat: 'Candidature',
  bloque: 'Bloqué',
};

const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Télécharge un CSV lisible par Excel. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const csv = '﻿' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
const today = () => new Date().toISOString().slice(0, 10);

export type PeopleScope = 'personnel' | 'freelances' | 'tous';

/**
 * Liste des personnes. Les coordonnées d'un auto-entrepreneur ne sortent en
 * clair que s'il a été validé sur une de vos missions (sinon masquées).
 */
export function exportPeople(
  scope: PeopleScope,
  opts: { staff: StaffRule[]; statuses: Record<string, PersonStatus>; favorites: string[]; extraPeople?: Person[] },
): number {
  const all = [...people, ...(opts.extraPeople ?? [])];
  const list = all.filter((p) =>
    scope === 'tous' ? true : scope === 'freelances' ? p.kind === 'freelance' : p.kind !== 'freelance',
  );
  const header = [
    'Nom',
    'Type',
    'Statut',
    'Postes',
    'Note',
    'Missions',
    'Heures ce mois',
    'Fiabilité (%)',
    'Tarif (€/h)',
    'Contrat',
    'Heures hebdo',
    'Jours de repos',
    'Favori',
    'Téléphone',
    'E-mail',
    'SIRET',
    'Ville',
    'Attestation de vigilance',
  ];
  const rows = list.map((p) => {
    const rule = p.kind === 'salarie' ? opts.staff.find((r) => r.personId === p.id || r.name === p.name) : undefined;
    const prof = p.kind === 'freelance' ? freelanceProfileOf(p.name) : undefined;
    const unlocked = p.kind === 'freelance' && isContactUnlocked(p.name);
    const vig = prof
      ? prof.vigilance.status === 'valide'
        ? `Valide jusqu’au ${prof.vigilance.until}`
        : prof.vigilance.status === 'expiree'
          ? `Expirée le ${prof.vigilance.until}`
          : 'Non fournie'
      : '';
    return [
      p.name,
      KIND[p.kind],
      STATUS[opts.statuses[p.id] ?? p.status],
      (rule?.postes ?? p.roles).join(', '),
      typeof p.rating === 'number' ? num(p.rating) : '',
      p.missionsDone,
      p.hoursThisMonth,
      p.reliability || '',
      rule ? rule.hourlyRate : p.kind === 'freelance' ? (p.costPerHour ?? '') : '',
      rule?.contract ?? (p.kind === 'extra' ? 'CDD d’usage' : p.kind === 'freelance' ? 'Prestation' : ''),
      rule?.weeklyHours ?? '',
      rule ? rule.restDays.map((d) => DAY_LONG[d]).join(', ') : '',
      p.kind === 'freelance' ? (opts.favorites.includes(p.name) ? 'Oui' : 'Non') : '',
      prof ? (unlocked ? prof.phone : maskPhone(prof.phone)) : '',
      prof ? (unlocked ? prof.email : maskEmail(prof.email)) : '',
      prof ? (unlocked ? prof.siret : 'masqué') : '',
      prof?.city ?? '',
      vig,
    ];
  });
  const name = scope === 'tous' ? 'tout-le-monde' : scope === 'freelances' ? 'auto-entrepreneurs' : 'personnel';
  downloadCsv(`${name}-${today()}`, header, rows);
  return rows.length;
}

/** Planning : une ligne par mission de la plage, avec les personnes placées. */
export function exportPlanning(missions: Mission[], label: string): number {
  const header = [
    'Date',
    'Début',
    'Fin',
    'Durée (h)',
    'Poste',
    'Établissement',
    'Besoin',
    'Placés',
    'Couverture (%)',
    'Personnes placées',
    'Système',
    'État',
  ];
  const stateLabel = (placed: number, required: number) =>
    placed <= 0 ? 'Personne' : placed < required ? 'Incomplet' : 'Complet';
  const rows = [...missions]
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .map((m) => {
      const placed = effPlacedCount(m);
      const required = effRequired(m);
      return [
        m.date.split('-').reverse().join('/'),
        m.start,
        m.end,
        num(missionHours(m)),
        m.poste,
        m.establishment,
        required,
        placed,
        required ? Math.round((placed / required) * 100) : 0,
        effPlaced(m)
          .filter((p) => !p.suggested)
          .map((p) => `${p.name} (${LETTER[p.kind]})`)
          .join(', '),
        m.system === 'employe' ? 'Salariés' : m.system === 'cascade' ? 'Cascade' : 'Auto-entrepreneurs',
        stateLabel(placed, required),
      ];
    });
  downloadCsv(`planning-${slug(label)}`, header, rows);
  return rows.length;
}

/**
 * Export paie : une ligne par salarié / extra avec les compteurs de la période
 * (heures normales, heures sup, brut estimé, absences, congés). Rien de plus que
 * ce que l'onglet Compteurs affiche.
 */
export function exportPaie(counters: Counter[], label: string): number {
  const header = [
    'Nom',
    'Type',
    'Contrat',
    'Heures hebdo contrat',
    'Heures contrat (période)',
    'Heures faites',
    'Heures normales',
    'Heures sup',
    'Taux horaire (€)',
    'Brut estimé (€)',
    'Congés payés pris (j)',
    'Maladie (j)',
    'Formation (j)',
    'Autres absences (j)',
    'Solde congés (j)',
  ];
  const rows = counters.map((c) => [
    c.name,
    c.kind === 'salarie' ? 'Salarié' : 'Extra',
    c.contract,
    c.weeklyHours || '',
    c.contractHours || '',
    num(c.hours),
    num(c.normalHours),
    num(c.overtime),
    num(c.hourlyRate),
    c.gross,
    c.absences['Congés payés'] ?? 0,
    c.absences.Maladie ?? 0,
    c.absences.Formation ?? 0,
    (c.absences.Indisponible ?? 0) + (c.absences.Autre ?? 0),
    c.kind === 'salarie' ? c.leaveLeft : '',
  ]);
  downloadCsv(`paie-${slug(label)}`, header, rows);
  return rows.length;
}
