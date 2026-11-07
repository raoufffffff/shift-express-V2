/**
 * Réglages d'exploitation de l'espace client v2, partagés entre les écrans :
 *  · compte : entreprise seule (un lieu) ou entreprise avec établissements ;
 *    dans ce cas l'administrateur entreprise fixe, par poste, la fourchette de
 *    tarif auto-entrepreneur — pour toute l'entreprise, ou établissement par
 *    établissement — que les gestionnaires ne peuvent pas dépasser ;
 *  · gestionnaires : administrateurs de l'entreprise et gestionnaires de chaque établissement ;
 *  · paiement (virement ou prélèvement SEPA, par shift ou par mois) ;
 *  · postes internes et leurs besoins quotidiens (→ cases « à pourvoir » du planning) ;
 *  · personnel fixe : département, poste, tarif horaire, repos, heures hebdo, contrat ;
 *  · cascade : paliers d'urgence selon le temps restant avant le shift, tarif maximal PAR POSTE (et par établissement).
 * En mémoire pour la maquette (pas de backend) ; les valeurs de départ viennent des mocks.
 */
import { create } from 'zustand';
import { posteConfig } from '@/mocks/v2Missions';
import { tarifs, establishments } from '@/mocks/v2Settings';
import { people } from '@/mocks/v2People';
import { minutesBetween, parseISO } from '@/pages/v2/time';

/* ── Compte ────────────────────────────────────────────────── */
/** Entreprise seule (pas d'établissement) ou entreprise avec établissements. */
export type AccountType = 'seule' | 'etablissements';
export interface AccountSettings {
  type: AccountType;
  /** établissement dont on règle la cascade (compte « avec établissements ») */
  establishmentId: string;
}

/** Portée « toute l'entreprise » pour les fourchettes et tarifs. */
export const COMPANY = '*';

/** Fourchette de tarif auto-entrepreneur fixée par l'administrateur entreprise (€/h TTC). */
export interface RateBounds {
  min: number;
  max: number;
}

/* ── Fiche comptable (entreprise et établissements) ────────── */
export interface BillingInfo {
  /** raison sociale facturée */
  legalName: string;
  siret: string;
  billingAddress: string;
  contactName: string;
  accountingEmail: string;
}
export interface EstablishmentInfo extends BillingInfo {
  id: string;
  name: string;
  /** adresse du lieu (≠ adresse de facturation possible) */
  address: string;
  /** personnes rattachées */
  team: number;
}

/* ── Gestionnaires ─────────────────────────────────────────── */
export type ManagerRole = 'admin' | 'gestionnaire';
export interface Manager {
  id: string;
  name: string;
  email: string;
  role: ManagerRole;
  /** établissement géré ; null = entreprise (administrateur) */
  establishmentId: string | null;
}

/* ── Paiement ──────────────────────────────────────────────── */
export type PaymentMethod = 'virement' | 'sepa';
export type PaymentFrequency = 'shift' | 'mois';
/** Coordonnées de Shift Express pour les règlements par virement (maquette). */
export const SHIFT_EXPRESS_BANK = {
  holder: 'Shift Express SAS',
  iban: 'FR76 3000 4028 3700 0101 2345 678',
  bic: 'BNPAFRPPXXX',
};
/**
 * Frais de service sur la facture mensuelle, en % du montant réglé :
 * prélèvement SEPA mensuel 2 %, virement (mensuel uniquement) 3 %.
 * Le prélèvement par mission reste sans frais.
 */
export function paymentFeePct(p: { method: PaymentMethod; frequency: PaymentFrequency }): number {
  if (p.method === 'virement') return 3;
  return p.frequency === 'mois' ? 2 : 0;
}
export interface PaymentSettings {
  method: PaymentMethod;
  frequency: PaymentFrequency;
  /** IBAN masqué (maquette) */
  iban: string;
  /** mandat SEPA signé ? (prélèvement seulement) */
  mandateSigned: boolean;
  /** jour du mois du règlement récapitulatif (fréquence « mois ») */
  dayOfMonth: number;
  /** e-mail qui reçoit les factures */
  invoiceEmail: string;
}

/* ── Postes & besoins quotidiens ───────────────────────────── */
export type Department = 'Accueil' | 'Restauration' | 'Cuisine' | 'Bar';
export const DEPARTMENTS: Department[] = ['Accueil', 'Restauration', 'Cuisine', 'Bar'];
/** Un créneau attendu d'un poste : « Matin 08:00–14:00, 1 personne, ven. sam. ». */
export interface PosteSlot {
  /** nom en mots simples : Service, Matin, Soir, Nuit… */
  label: string;
  /** horaire du créneau, prérempli à la publication */
  start: string;
  end: string;
  /** personnes attendues sur ce créneau */
  count: number;
  /** jours où ce créneau est attendu (0 = dim … 6 = sam) */
  days: number[];
}
export interface PosteNeed {
  poste: string;
  department: Department;
  /** créneaux attendus : un seul « Service » par défaut, ou Matin + Soir, etc. */
  slots: PosteSlot[];
  /** un poste inactif ne génère plus de « à pourvoir » */
  active: boolean;
}
/** Créneaux proposés par « Ajouter un créneau » (Réglages › Postes). */
export const SLOT_PRESETS: { label: string; start: string; end: string }[] = [
  { label: 'Matin', start: '08:00', end: '14:00' },
  { label: 'Soir', start: '14:00', end: '22:00' },
  { label: 'Nuit', start: '22:00', end: '06:00' },
  { label: 'Service', start: '18:00', end: '23:00' },
];

const DEPT_OF: Record<string, Department> = {
  'Serveur·se': 'Restauration',
  'Barman·aid': 'Bar',
  'Cuisinier·ère': 'Cuisine',
  'Commis de cuisine': 'Cuisine',
  'Plongeur·se': 'Cuisine',
  "Hôte·sse d'accueil": 'Accueil',
};

/* ── Personnel fixe ────────────────────────────────────────── */
export type Contract = 'CDI' | 'CDD' | 'Apprenti·e';
export interface StaffRule {
  personId: string;
  name: string;
  department: Department;
  /** postes que la personne tient */
  postes: string[];
  /** tarif horaire brut (€/h) — sert au montant du relevé d'heures */
  hourlyRate: number;
  /** jours de repos hebdomadaires (0 = dim … 6 = sam) */
  restDays: number[];
  /** heures hebdo du contrat : Optimiser ne place jamais au-delà */
  weeklyHours: number;
  contract: Contract;
  /** programmé·e automatiquement sur ses jours de travail (Optimiser, prédictif) */
  autoSchedule: boolean;
  /** créneaux habituels (Matin, Soir…) : servis en premier ; vide = n'importe lequel */
  slots?: string[];
  /**
   * Horaires du contrat (semaine type) : « jeudi, Matin 08:00–14:00 à l'accueil ».
   * Le planning se préremplit seul avec, chaque semaine ; Optimiser complète le reste.
   */
  schedule?: ContractShift[];
  /** souhaits de la personne (jours à éviter, plus ou moins d'heures) : Optimiser en tient compte sans jamais bloquer */
  wishes?: Wishes;
}
/**
 * Souhaits d'une personne, dits depuis son appli ou notés ici : des jours
 * qu'elle préfère éviter, l'envie de faire plus ou moins d'heures. Ce ne sont
 * pas des interdits : Optimiser sert d'abord ceux qui le souhaitent, place les
 * autres en dernier recours et le dit (« contre son souhait »).
 */
export interface Wishes {
  /** jours à éviter (0 = dim … 6 = sam) */
  avoidDays: number[];
  /** envie de plus ou moins d'heures que d'habitude */
  hours: 'plus' | 'moins' | null;
}
export const NO_WISHES: Wishes = { avoidDays: [], hours: null };
/** « évite le dimanche » si la date tombe un jour que la personne préfère éviter, sinon null. */
export function againstWish(rule: { wishes?: Wishes }, date: string): string | null {
  const day = parseISO(date).getDay();
  return rule.wishes?.avoidDays.includes(day) ? `évite le ${DAY_LONG[day]}` : null;
}
/** « Évite le dimanche et le lundi · veut plus d'heures », ou « Aucun souhait ». */
export function wishPhrase(w: Wishes | undefined): string {
  const parts: string[] = [];
  if (w?.avoidDays.length) parts.push(`évite ${daysPhrase(w.avoidDays)}`);
  if (w?.hours === 'plus') parts.push("veut plus d'heures");
  if (w?.hours === 'moins') parts.push("veut moins d'heures");
  if (parts.length === 0) return 'Aucun souhait';
  const text = parts.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
/** Un créneau fixe du contrat d'un salarié : tel jour, tel créneau d'un poste des Réglages. */
export interface ContractShift {
  /** 0 = dim … 6 = sam */
  day: number;
  poste: string;
  /** nom du créneau du poste (Matin, Soir, Service…) */
  label: string;
  start: string;
  end: string;
}
/** Créneaux du contrat d'un salarié un jour de la semaine donné. */
export function contractShiftsOn(rule: StaffRule, weekday: number): ContractShift[] {
  return (rule.schedule ?? []).filter((c) => c.day === weekday);
}
/** Heures fixes par semaine d'après le contrat. */
export function contractHoursPerWeek(rule: StaffRule): number {
  return Math.round(((rule.schedule ?? []).reduce((s, c) => s + minutesBetween(c.start, c.end), 0) / 60) * 10) / 10;
}

/* ── Règles de repos ───────────────────────────────────────── */
/**
 * Ce que le planning ne dépasse jamais pour un salarié (droit du travail /
 * convention HCR) : Optimiser et le préremplissage écartent la personne, et le
 * planning signale les écarts déjà en place.
 */
export interface RestRules {
  /** heures de repos entre la fin d'une journée et le début de la suivante (11 h) */
  minRestHours: number;
  /** jours de travail d'affilée au maximum (6) */
  maxConsecutiveDays: number;
  /** jours de repos par semaine (2) */
  restDaysPerWeek: number;
  /** amplitude maximale d'une journée, du premier début à la dernière fin (13 h) */
  maxDailySpanHours: number;
}
export const DEFAULT_REST_RULES: RestRules = {
  minRestHours: 11,
  maxConsecutiveDays: 6,
  restDaysPerWeek: 2,
  maxDailySpanHours: 13,
};

/* ── Bassin de talents ─────────────────────────────────────── */
/**
 * Les renforts connus de l'établissement, appelés en deuxième, après les
 * fixes : extras en CDD d'usage, intérimaires (avec leur agence). Pas de
 * repos fixe ni d'heures hebdo : ils se proposent, ou vous les placez.
 */
export type PoolContract = 'CDD d’usage' | 'Intérim';
export const POOL_CONTRACTS: PoolContract[] = ['CDD d’usage', 'Intérim'];
export interface PoolRule {
  personId: string;
  name: string;
  contract: PoolContract;
  /** agence d'intérim (contrat Intérim) */
  agency?: string;
  postes: string[];
  /** tarif horaire brut (€/h), repris dans le relevé d'heures */
  hourlyRate: number;
  wishes?: Wishes;
}

/* ── Journées d'exception ──────────────────────────────────── */
/**
 * Un jour qui ne suit pas la semaine type : fermé (aucun créneau attendu, les
 * horaires du contrat ne se posent pas) ou renfort (chaque créneau attendu
 * demande `extra` personne·s de plus — soirée privée, match, fête).
 */
export type ExceptionKind = 'ferme' | 'renfort';
export interface ExceptionDay {
  id: string;
  /** ISO yyyy-mm-dd */
  date: string;
  /** « Armistice », « Soirée privée »… */
  label: string;
  kind: ExceptionKind;
  /** renfort : personnes en plus sur chaque créneau attendu */
  extra: number;
}
/** La journée d'exception d'une date, s'il y en a une. */
export const exceptionOn = (exceptions: ExceptionDay[], date: string): ExceptionDay | undefined =>
  exceptions.find((e) => e.date === date);
/** « Fermé · Armistice », « Soirée privée · +1 par créneau » */
export function exceptionLabel(e: ExceptionDay): string {
  return e.kind === 'ferme'
    ? `Fermé${e.label ? ` · ${e.label}` : ''}`
    : `${e.label || 'Renfort'} · +${e.extra} par créneau`;
}

/* ── Semaines types saisonnières ───────────────────────────── */
/**
 * Une saison : entre deux dates, les besoins quotidiens suivent une AUTRE
 * semaine type (ses propres créneaux, jours et nombres par poste) à la place
 * de la standard. Exemple : fêtes de fin d'année, été, salon.
 */
export interface Season {
  id: string;
  name: string;
  /** ISO, inclus */
  from: string;
  to: string;
  postes: PosteNeed[];
}
/** La saison qui couvre cette date, s'il y en a une. */
export const seasonOn = (seasons: Season[], date: string): Season | undefined =>
  seasons.find((se) => se.from <= date && date <= se.to);
/** Les besoins qui s'appliquent à une date : ceux de la saison en cours, sinon `needs`. */
export function needsFor(needs: PosteNeed[], date: string): PosteNeed[] {
  const season = seasonOn(useV2Settings.getState().seasons, date);
  return season ? season.postes.filter((p) => p.active) : needs;
}

/* ── Cascade ───────────────────────────────────────────────── */
/**
 * Paliers d'urgence : le régime dépend du temps restant entre la publication
 * et le début du shift (voir pages/v2/cascade.ts pour le calcul).
 */
export interface CascadeSettings {
  /** la cascade est proposée par défaut à la publication */
  enabled: boolean;
  /** palier confort : publiée plus de X h avant le début */
  comfortFrom: number;
  /** confort : heures laissées aux salariés seuls */
  salariesHours: number;
  /** confort : heures laissées ensuite aux extras */
  extrasHours: number;
  /** confort : les auto-entrepreneurs voient la mission au plus tard X h avant le début */
  freelanceLatest: number;
  /** palier serré : entre X h et comfortFrom h avant le début */
  tightFrom: number;
  /** serré : auto-entrepreneurs X h après tout le personnel */
  tightFreelanceAfter: number;
  /** urgence : sous X h, le boost est proposé d'office */
  boostUnder: number;
  /** tarif horaire TTC maximal proposé aux auto-entrepreneurs : [portée][poste] */
  freelanceRates: Record<string, Record<string, number>>;
  /** prévenir le gestionnaire 1 h avant chaque bascule */
  notifyBeforeSwitch: boolean;
}

interface V2SettingsState {
  account: AccountSettings;
  /** fiche comptable de l'entreprise (facturée quand il n'y a pas d'établissement, ou pour le groupe) */
  company: BillingInfo;
  establishments: EstablishmentInfo[];
  setCompany: (patch: Partial<BillingInfo>) => void;
  addEstablishment: (e: Omit<EstablishmentInfo, 'id' | 'team'>) => EstablishmentInfo;
  updateEstablishment: (id: string, patch: Partial<EstablishmentInfo>) => void;
  /** fourchette admin : [portée = '*' entreprise ou id d'établissement][poste] */
  rateBounds: Record<string, Record<string, RateBounds>>;
  managers: Manager[];
  payment: PaymentSettings;
  postes: PosteNeed[];
  staff: StaffRule[];
  pool: PoolRule[];
  restRules: RestRules;
  exceptions: ExceptionDay[];
  seasons: Season[];
  cascade: CascadeSettings;
  /** crée une saison en copiant la semaine type standard */
  addSeason: (se: Omit<Season, 'id' | 'postes'>) => void;
  updateSeason: (id: string, patch: Partial<Omit<Season, 'id' | 'postes'>>) => void;
  removeSeason: (id: string) => void;
  updateSeasonPoste: (seasonId: string, poste: string, patch: Partial<PosteNeed>) => void;
  addException: (e: Omit<ExceptionDay, 'id'>) => void;
  updateException: (id: string, patch: Partial<ExceptionDay>) => void;
  removeException: (id: string) => void;
  setAccount: (patch: Partial<AccountSettings>) => void;
  setRateBounds: (scope: string, poste: string, patch: Partial<RateBounds>) => void;
  /** un établissement revient à la fourchette de l'entreprise pour ce poste */
  clearRateBounds: (scope: string, poste: string) => void;
  addManager: (m: Omit<Manager, 'id'>) => void;
  removeManager: (id: string) => void;
  setPayment: (patch: Partial<PaymentSettings>) => void;
  updatePoste: (poste: string, patch: Partial<PosteNeed>) => void;
  addPoste: (need: PosteNeed) => void;
  removePoste: (poste: string) => void;
  updateStaff: (personId: string, patch: Partial<StaffRule>) => void;
  addStaff: (rule: StaffRule) => void;
  removeStaff: (personId: string) => void;
  updatePool: (personId: string, patch: Partial<PoolRule>) => void;
  addPool: (rule: PoolRule) => void;
  removePool: (personId: string) => void;
  setRestRules: (patch: Partial<RestRules>) => void;
  setCascade: (patch: Partial<Omit<CascadeSettings, 'freelanceRates'>>) => void;
  setFreelanceRate: (scope: string, poste: string, rate: number) => void;
}

/** Tarif auto-entrepreneur indicatif d'un poste (mock), 30 € si inconnu. */
export const freelanceRateOf = (poste: string): number => tarifs.find((t) => t.poste === poste)?.freelanceTTC ?? 30;
/** Salaire horaire indicatif d'un poste (mock), 17 € si inconnu. */
export const salaryRateOf = (poste: string): number => tarifs.find((t) => t.poste === poste)?.salaireHoraire ?? 17;
/** Fourchette de départ d'un poste : −6 / +8 € autour du tarif indicatif. */
export const defaultBounds = (poste: string): RateBounds => ({
  min: freelanceRateOf(poste) - 6,
  max: freelanceRateOf(poste) + 8,
});
/** Fourchette libre quand le compte n'a pas d'établissements. */
export const FREE_BOUNDS: RateBounds = { min: 15, max: 60 };

const ALL_POSTES = posteConfig.map((c) => c.poste);

/** Horaires du contrat de départ (maquette), par personne. */
/** Démo : Lucas préfère éviter le dimanche, Emma veut plus d'heures. */
const MOCK_WISHES: Record<string, Wishes> = {
  'u-lucas': { avoidDays: [0], hours: null },
  'u-emma': { avoidDays: [], hours: 'plus' },
};
const MOCK_SCHEDULES: Record<string, ContractShift[]> = {
  'u-lucas': [4, 5, 6].map((day) => ({
    day,
    poste: "Hôte·sse d'accueil",
    label: 'Matin',
    start: '08:00',
    end: '14:00',
  })),
  'u-emma': [3, 6].map((day) => ({ day, poste: 'Barman·aid', label: 'Service', start: '19:00', end: '01:00' })),
};

/** Fourchette effective d'un poste pour une portée : la sienne, sinon celle de l'entreprise. */
export function boundsFor(
  rateBounds: Record<string, Record<string, RateBounds>>,
  scope: string,
  poste: string,
): RateBounds {
  return rateBounds[scope]?.[poste] ?? rateBounds[COMPANY]?.[poste] ?? defaultBounds(poste);
}
/** Tarif max effectif d'un poste pour une portée : le sien, sinon celui de l'entreprise. */
export function rateFor(rates: Record<string, Record<string, number>>, scope: string, poste: string): number {
  return rates[scope]?.[poste] ?? rates[COMPANY]?.[poste] ?? freelanceRateOf(poste);
}

const clamp = (v: number, b: RateBounds) => Math.min(Math.max(v, b.min), b.max);

export const useV2Settings = create<V2SettingsState>((set) => ({
  account: { type: 'etablissements', establishmentId: establishments[0].id },
  company: {
    legalName: 'Comptoir du Centre SAS',
    siret: '901 234 567 00012',
    billingAddress: '12 rue des Halles, 69001 Lyon',
    contactName: 'Alex Martin',
    accountingEmail: 'compta@comptoir-centre.fr',
  },
  establishments: establishments.map((e, i) => ({
    ...e,
    legalName: i === 0 ? 'Comptoir du Centre SAS' : 'Brasserie des Halles SARL',
    siret: i === 0 ? '901 234 567 00012' : '901 234 567 00038',
    billingAddress: e.address,
    contactName: i === 0 ? 'Camille Roux' : 'Julien Perrin',
    accountingEmail: i === 0 ? 'compta@comptoir-centre.fr' : 'compta@brasserie-halles.fr',
  })),
  setCompany: (patch) => set((s) => ({ company: { ...s.company, ...patch } })),
  addEstablishment: (e) => {
    const created: EstablishmentInfo = { ...e, id: `e-${Date.now()}`, team: 0 };
    set((s) => ({ establishments: [...s.establishments, created] }));
    return created;
  },
  updateEstablishment: (id, patch) =>
    set((s) => ({ establishments: s.establishments.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
  rateBounds: { [COMPANY]: Object.fromEntries(ALL_POSTES.map((p) => [p, defaultBounds(p)])) },
  managers: [
    { id: 'mg-admin', name: 'Alex Martin', email: 'alex@comptoir-centre.fr', role: 'admin', establishmentId: null },
    {
      id: 'mg-centre',
      name: 'Camille Roux',
      email: 'camille@comptoir-centre.fr',
      role: 'gestionnaire',
      establishmentId: establishments[0].id,
    },
    {
      id: 'mg-halles',
      name: 'Julien Perrin',
      email: 'julien@brasserie-halles.fr',
      role: 'gestionnaire',
      establishmentId: establishments[1]?.id ?? establishments[0].id,
    },
  ],
  payment: {
    method: 'sepa',
    frequency: 'mois',
    iban: 'FR76 •••• •••• •••• •••• •••• 418',
    mandateSigned: true,
    dayOfMonth: 5,
    invoiceEmail: 'compta@comptoir-centre.fr',
  },
  // Un créneau par poste d'après les mocks (plusieurs pour l'accueil : matin + soir), sur les jours du poste.
  postes: posteConfig.map((c) => ({
    poste: c.poste,
    department: DEPT_OF[c.poste] ?? 'Restauration',
    slots: c.slots.map((sl) => ({ ...sl, days: [...c.days] })),
    active: true,
  })),
  staff: people
    .filter((p) => p.kind === 'salarie')
    .map((p, i) => ({
      personId: p.id,
      name: p.name,
      department: DEPT_OF[p.roles[0]] ?? 'Restauration',
      postes: p.roles,
      hourlyRate: salaryRateOf(p.roles[0]),
      // repos de départ plausibles : dim+lun, lun+mar, mar+mer, mer+jeu…
      restDays: [(i + 0) % 7, (i + 1) % 7],
      weeklyHours: i === 0 ? 39 : 35,
      contract: i === 2 ? 'CDD' : 'CDI',
      autoSchedule: true,
      // Lucas tient l'accueil plutôt le matin ; les autres prennent n'importe quel créneau.
      slots: i === 0 ? ['Matin'] : [],
      // Horaires du contrat de départ : Lucas à l'accueil le matin jeu./ven./sam.,
      // Emma au bar mer. et sam. ; les autres n'ont pas d'horaires fixes.
      schedule: MOCK_SCHEDULES[p.id] ?? [],
      wishes: MOCK_WISHES[p.id],
    })),
  // Bassin de départ : les extras déjà connus (hors candidatures), en CDD d'usage.
  pool: people
    .filter((p) => p.kind === 'extra' && p.status !== 'candidat')
    .map((p) => ({
      personId: p.id,
      name: p.name,
      contract: 'CDD d’usage' as PoolContract,
      postes: p.roles,
      hourlyRate: salaryRateOf(p.roles[0]),
    })),
  restRules: { ...DEFAULT_REST_RULES },
  // Démo : un samedi de renfort et un jour férié fermé.
  exceptions: [
    { id: 'ex-1', date: '2026-11-07', label: 'Soirée privée', kind: 'renfort', extra: 1 },
    { id: 'ex-2', date: '2026-11-11', label: 'Armistice', kind: 'ferme', extra: 0 },
  ],
  // Démo : les fêtes de fin d'année, avec un serveur de plus en service et l'accueil tous les jours.
  seasons: [
    {
      id: 'season-fetes',
      name: 'Fêtes de fin d’année',
      from: '2026-12-14',
      to: '2027-01-03',
      postes: posteConfig.map((c) => ({
        poste: c.poste,
        department: DEPT_OF[c.poste] ?? 'Restauration',
        slots: c.slots.map((sl) => ({
          ...sl,
          days: c.poste === "Hôte·sse d'accueil" ? [1, 2, 3, 4, 5, 6, 0] : [...c.days],
          count: c.poste === 'Serveur·se' ? sl.count + 1 : sl.count,
        })),
        active: true,
      })),
    },
  ],
  addSeason: (se) =>
    set((s) => ({
      seasons: [
        ...s.seasons,
        {
          ...se,
          id: `season-${Date.now()}`,
          postes: s.postes.map((p) => ({ ...p, slots: p.slots.map((sl) => ({ ...sl })) })),
        },
      ].sort((a, b) => a.from.localeCompare(b.from)),
    })),
  updateSeason: (id, patch) =>
    set((s) => ({ seasons: s.seasons.map((se) => (se.id === id ? { ...se, ...patch } : se)) })),
  removeSeason: (id) => set((s) => ({ seasons: s.seasons.filter((se) => se.id !== id) })),
  updateSeasonPoste: (seasonId, poste, patch) =>
    set((s) => ({
      seasons: s.seasons.map((se) =>
        se.id === seasonId ? { ...se, postes: se.postes.map((p) => (p.poste === poste ? { ...p, ...patch } : p)) } : se,
      ),
    })),
  addException: (e) =>
    set((s) => ({
      exceptions: [...s.exceptions.filter((x) => x.date !== e.date), { ...e, id: `ex-${Date.now()}` }].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    })),
  updateException: (id, patch) =>
    set((s) => ({ exceptions: s.exceptions.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
  removeException: (id) => set((s) => ({ exceptions: s.exceptions.filter((e) => e.id !== id) })),
  cascade: {
    enabled: true,
    comfortFrom: 48,
    salariesHours: 24,
    extrasHours: 12,
    freelanceLatest: 24,
    tightFrom: 6,
    tightFreelanceAfter: 2,
    boostUnder: 1,
    freelanceRates: { [COMPANY]: Object.fromEntries(ALL_POSTES.map((p) => [p, freelanceRateOf(p)])) },
    notifyBeforeSwitch: true,
  },
  setAccount: (patch) => set((s) => ({ account: { ...s.account, ...patch } })),
  setRateBounds: (scope, poste, patch) =>
    set((s) => {
      const cur = boundsFor(s.rateBounds, scope, poste);
      const next = { ...cur, ...patch };
      if (next.min > next.max) {
        if (patch.min !== undefined) next.max = next.min;
        else next.min = next.max;
      }
      const rateBounds = { ...s.rateBounds, [scope]: { ...s.rateBounds[scope], [poste]: next } };
      // Les tarifs déjà réglés restent dans leur fourchette (entreprise et établissements).
      const freelanceRates = Object.fromEntries(
        Object.entries(s.cascade.freelanceRates).map(([sc, byPoste]) => [
          sc,
          Object.fromEntries(
            Object.entries(byPoste).map(([p, r]) => [p, p === poste ? clamp(r, boundsFor(rateBounds, sc, p)) : r]),
          ),
        ]),
      );
      return { rateBounds, cascade: { ...s.cascade, freelanceRates } };
    }),
  clearRateBounds: (scope, poste) =>
    set((s) => {
      if (scope === COMPANY) return {};
      const { [poste]: _removed, ...rest } = s.rateBounds[scope] ?? {};
      void _removed;
      return { rateBounds: { ...s.rateBounds, [scope]: rest } };
    }),
  addManager: (m) => set((s) => ({ managers: [...s.managers, { ...m, id: `mg-${Date.now()}` }] })),
  removeManager: (id) => set((s) => ({ managers: s.managers.filter((m) => m.id !== id) })),
  // Le virement n'existe que par mois : passer au virement force la fréquence mensuelle.
  setPayment: (patch) =>
    set((s) => {
      const next = { ...s.payment, ...patch };
      if (next.method === 'virement') next.frequency = 'mois';
      return { payment: next };
    }),
  updatePoste: (poste, patch) =>
    set((s) => ({ postes: s.postes.map((p) => (p.poste === poste ? { ...p, ...patch } : p)) })),
  addPoste: (need) =>
    set((s) => ({
      postes: [...s.postes, need],
      rateBounds: {
        ...s.rateBounds,
        [COMPANY]: { ...s.rateBounds[COMPANY], [need.poste]: defaultBounds(need.poste) },
      },
      cascade: {
        ...s.cascade,
        freelanceRates: {
          ...s.cascade.freelanceRates,
          [COMPANY]: { ...s.cascade.freelanceRates[COMPANY], [need.poste]: freelanceRateOf(need.poste) },
        },
      },
    })),
  removePoste: (poste) => set((s) => ({ postes: s.postes.filter((p) => p.poste !== poste) })),
  updateStaff: (personId, patch) =>
    set((s) => ({ staff: s.staff.map((r) => (r.personId === personId ? { ...r, ...patch } : r)) })),
  addStaff: (rule) => set((s) => ({ staff: [...s.staff, rule] })),
  removeStaff: (personId) => set((s) => ({ staff: s.staff.filter((r) => r.personId !== personId) })),
  updatePool: (personId, patch) =>
    set((s) => ({ pool: s.pool.map((r) => (r.personId === personId ? { ...r, ...patch } : r)) })),
  addPool: (rule) => set((s) => ({ pool: [...s.pool, rule] })),
  removePool: (personId) => set((s) => ({ pool: s.pool.filter((r) => r.personId !== personId) })),
  setRestRules: (patch) => set((s) => ({ restRules: { ...s.restRules, ...patch } })),
  setCascade: (patch) => set((s) => ({ cascade: { ...s.cascade, ...patch } })),
  setFreelanceRate: (scope, poste, rate) =>
    set((s) => ({
      cascade: {
        ...s.cascade,
        freelanceRates: {
          ...s.cascade.freelanceRates,
          [scope]: { ...s.cascade.freelanceRates[scope], [poste]: rate },
        },
      },
    })),
}));

/** Besoins actifs (postes et leurs créneaux), pour le planning. */
export function usePosteNeeds(): PosteNeed[] {
  // Les journées d'exception et les saisons changent les créneaux attendus : on s'y abonne aussi.
  useV2Settings((s) => s.exceptions);
  useV2Settings((s) => s.seasons);
  return useV2Settings((s) => s.postes).filter((p) => p.active);
}

/** Le jour est-il fermé (journée d'exception « fermé ») ? */
export function isClosedDay(date: string): boolean {
  return exceptionOn(useV2Settings.getState().exceptions, date)?.kind === 'ferme';
}
/**
 * Créneaux attendus d'un poste à une DATE : ceux du jour de la semaine, corrigés
 * par la journée d'exception (fermé → aucun ; renfort → `extra` personnes de plus).
 */
export function slotsOnDate(need: PosteNeed, date: string): PosteSlot[] {
  const ex = exceptionOn(useV2Settings.getState().exceptions, date);
  if (ex?.kind === 'ferme') return [];
  const slots = slotsOn(need, parseISO(date).getDay());
  return ex && ex.extra > 0 ? slots.map((sl) => ({ ...sl, count: sl.count + ex.extra })) : slots;
}

/* ── Créneaux attendus : helpers partagés par le planning ───── */
/** Un créneau attendu, rattaché à son poste. */
export interface ExpectedSlot {
  poste: string;
  slot: PosteSlot;
}

/** Jours où le poste est attendu (union de ses créneaux), dans l'ordre lun → dim. */
export function needDays(need: PosteNeed): number[] {
  const all = new Set(need.slots.flatMap((sl) => sl.days));
  return DAY_ORDER.filter((d) => all.has(d));
}

/** Créneaux attendus d'un poste un jour de la semaine donné (aucun si le poste est inactif). */
export function slotsOn(need: PosteNeed, weekday: number): PosteSlot[] {
  return need.active ? need.slots.filter((sl) => sl.days.includes(weekday)) : [];
}

/** Tous les créneaux attendus une date donnée (postes actifs, ou seulement `postes`). */
export function expectedSlots(needs: PosteNeed[], date: string, postes?: string[]): ExpectedSlot[] {
  return needsFor(needs, date)
    .filter((n) => !postes || postes.includes(n.poste))
    .flatMap((n) => slotsOnDate(n, date).map((slot) => ({ poste: n.poste, slot })));
}

/** Personnes attendues sur une semaine type (tous créneaux des postes actifs). */
export function weeklyHeadcount(needs: PosteNeed[]): number {
  return needs
    .filter((n) => n.active)
    .reduce((s, n) => s + n.slots.reduce((t, sl) => t + sl.days.length * sl.count, 0), 0);
}

/** Minutes [début, fin] d'un horaire, la fin passée au lendemain si elle précède le début. */
const span = (t: { start: string; end: string }): [number, number] => {
  const [h, m] = t.start.split(':').map(Number);
  const s0 = h * 60 + m;
  return [s0, s0 + minutesBetween(t.start, t.end)];
};
/** Minutes communes entre une mission et un créneau (la mission peut chevaucher minuit). */
function overlap(m: { start: string; end: string }, slot: { start: string; end: string }): number {
  const [ms, me] = span(m);
  const [ss, se] = span(slot);
  return Math.max(0, ...[-1440, 0, 1440].map((shift) => Math.min(me + shift, se) - Math.max(ms + shift, ss)));
}

/**
 * Le créneau que couvre une mission : celui qu'elle recouvre le plus, à égalité
 * celui dont le début est le plus proche. Une mission ne couvre qu'UN créneau.
 * −1 s'il n'y a aucun créneau.
 */
export function slotIndexOf(m: { start: string; end: string }, slots: PosteSlot[]): number {
  let best = -1;
  let bestOverlap = -1;
  let bestDist = Infinity;
  slots.forEach((sl, i) => {
    const o = overlap(m, sl);
    const dist = Math.abs(span(m)[0] - span(sl)[0]);
    if (o > bestOverlap || (o === bestOverlap && dist < bestDist)) {
      best = i;
      bestOverlap = o;
      bestDist = dist;
    }
  });
  return best;
}

/**
 * Créneaux attendus ce jour-là sans mission vivante dessus : chacun est une
 * case « à pourvoir ». `liveMissions` = missions encore d'actualité (toutes
 * dates confondues, on filtre ici) ; `postes` restreint aux lignes affichées.
 */
export function uncoveredSlots(
  needs: PosteNeed[],
  date: string,
  liveMissions: { poste: string; date: string; start: string; end: string }[],
  postes?: string[],
): ExpectedSlot[] {
  return needsFor(needs, date)
    .filter((n) => !postes || postes.includes(n.poste))
    .flatMap((n) => {
      const slots = slotsOnDate(n, date);
      if (slots.length === 0) return [];
      const covered = new Set<number>();
      liveMissions
        .filter((m) => m.date === date && m.poste === n.poste)
        .forEach((m) => covered.add(slotIndexOf(m, slots)));
      return slots.filter((_, i) => !covered.has(i)).map((slot) => ({ poste: n.poste, slot }));
    });
}

/** « le matin », « le soir », « la nuit », « en service », sinon « “Nom” ». */
export function slotPhrase(label: string): string {
  const l = label.trim().toLowerCase();
  if (l === 'matin' || l === 'soir' || l === 'midi' || l === 'après-midi') return `le ${l}`;
  if (l === 'nuit') return 'la nuit';
  if (l === 'service') return 'en service';
  return l ? `« ${label.trim()} »` : '';
}
/** « le vendredi et le samedi », « tous les jours », « aucun jour ». */
export function daysPhrase(days: number[]): string {
  const list = DAY_ORDER.filter((d) => days.includes(d));
  if (list.length === 0) return 'aucun jour';
  if (list.length === 7) return 'tous les jours';
  const names = list.map((d) => `le ${DAY_LONG[d]}`);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}
/** Phrase récapitulative d'un poste en mots simples, pour Réglages › Postes. */
export function needSummary(need: PosteNeed): string {
  if (!need.active) return 'Poste en pause : aucune case « à pourvoir » sur le planning.';
  if (need.slots.length === 0) return 'Aucun créneau : ajoutez-en un pour voir des cases « à pourvoir ».';
  const part = (sl: PosteSlot, withDays: boolean) =>
    `${sl.count} personne${sl.count > 1 ? 's' : ''} ${slotPhrase(sl.label)} (${sl.start}–${sl.end})${withDays ? ` ${daysPhrase(sl.days)}` : ''}`.replace(
      /\s+/g,
      ' ',
    );
  const sameDays = need.slots.every((sl) => daysPhrase(sl.days) === daysPhrase(need.slots[0].days));
  if (sameDays) {
    const parts = need.slots.map((sl) => part(sl, false));
    const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
    const d = daysPhrase(need.slots[0].days);
    return `${d.charAt(0).toUpperCase()}${d.slice(1)} : ${joined}.`;
  }
  return `${need.slots.map((sl) => part(sl, true)).join(' · ')}.`;
}

/**
 * Règle de personnel fixe d'une personne (undefined si ce n'est pas un salarié
 * fixe). Cherche par id, puis par nom : les mocks réutilisent une même personne
 * sous plusieurs ids selon la mission.
 */
export function staffRuleOf(staff: StaffRule[], person: { id: string; name: string }): StaffRule | undefined {
  return staff.find((r) => r.personId === person.id) ?? staff.find((r) => r.name === person.name);
}
/** Fiche du bassin de talents d'une personne (undefined si elle n'en fait pas partie). */
export function poolRuleOf(pool: PoolRule[], person: { id: string; name: string }): PoolRule | undefined {
  return pool.find((r) => r.personId === person.id) ?? pool.find((r) => r.name === person.name);
}

/** Jours de repos d'une personne (vide si elle n'est pas un salarié fixe). */
export function restDaysOf(staff: StaffRule[], person: { id: string; name: string }): number[] {
  return staffRuleOf(staff, person)?.restDays ?? [];
}

/** Hook : `isRestDay(person, '2026-10-27')` → la personne est-elle en repos ce jour-là ? */
export function useRestDayCheck(): (person: { id: string; name: string }, dateISO: string) => boolean {
  const staff = useV2Settings((s) => s.staff);
  return (person, dateISO) => restDaysOf(staff, person).includes(parseISO(dateISO).getDay());
}

/**
 * Fourchette effective d'un poste pour l'établissement courant : celle de
 * l'établissement, sinon celle de l'entreprise ; libre si compte « entreprise seule ».
 */
export function useRateBounds(): (poste: string, scope?: string) => RateBounds {
  const account = useV2Settings((s) => s.account);
  const bounds = useV2Settings((s) => s.rateBounds);
  return (poste, scope = account.establishmentId) =>
    account.type === 'etablissements' ? boundsFor(bounds, scope, poste) : FREE_BOUNDS;
}

export const DAY_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const DAY_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
