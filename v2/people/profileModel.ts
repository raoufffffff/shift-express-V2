/**
 * Modèle d'une fiche profil — UNE source pour la fenêtre dans l'app et la
 * fiche PDF : même en-tête (photo, nom, sous-ligne, deux étiquettes au plus,
 * trois chiffres clés) et mêmes blocs dans le même ordre.
 *  · auto-entrepreneur : coordonnées (en clair seulement si validé·e chez
 *    vous), compétences & langues, expériences, avis, attestation URSSAF ;
 *  · salarié / extra : contrat (tarif dans l'app seulement, jamais imprimé),
 *    heures de la semaine, absences, prochaines et dernières missions.
 * Les parties interactives (favori, message, inviter, absences, note privée,
 * demande d'attestation, signaler, bloquer) sont greffées par ProfileSheet.
 */
import type { Mission, MissionPlaced, MissionPerson, PersonKind } from '@/mocks/v2Missions';
import type { Person, PersonStatus } from '@/mocks/v2People';
import { people, statusLabel } from '@/mocks/v2People';
import type { FreelanceProfile } from '@/mocks/v2Freelances';
import { freelanceProfileOf, maskPhone, maskEmail } from '@/mocks/v2Freelances';
import { MOCK_TODAY } from '@/mocks/v2Today';
import type { StaffRule, PoolRule } from '@/stores/v2SettingsStore';
import { useV2Settings, staffRuleOf, poolRuleOf, DAY_LONG } from '@/stores/v2SettingsStore';
import type { Absence, Review } from '@/stores/v2PeopleStore';
import { useV2People, absenceOn } from '@/stores/v2PeopleStore';
import { effMissions, effPlaced, isContactUnlocked } from '../mission/missionStore';
import { personKindStyle } from '../coverage';
import { missionHours, missionTimeLabel, parseISO, toISO } from '../time';

/* ── Types du modèle ─────────────────────────────────────── */
export type Tone = 'ok' | 'warn' | 'danger' | 'blue' | 'pink' | 'muted';

export interface ProfileTag {
  text: string;
  tone: Tone;
}
export interface ProfileStat {
  value: string;
  label: string;
}
export interface ProfileRow {
  label: string;
  value: string;
  tone?: Tone;
  /** lien (tel:, mailto:) dans l'app */
  href?: string;
}
export interface ProfileChip {
  text: string;
  tone?: Tone;
}
export interface ProfileItem {
  id: string;
  title: string;
  detail?: string;
  when?: string;
  badge?: ProfileTag;
  /** un clic ouvre la mission (app) */
  missionId?: string;
}
export interface ProfileQuote {
  rating: number;
  text: string;
  by: string;
  when: string;
}
export interface ProfileGauge {
  value: number;
  max: number | null;
  label: string;
  hint: string;
}

export type ProfileSection =
  | { key: string; title: string; aside?: string; kind: 'rows'; rows: ProfileRow[]; text?: string }
  | { key: string; title: string; aside?: string; kind: 'chips'; chips: ProfileChip[] }
  | { key: string; title: string; aside?: string; kind: 'list'; items: ProfileItem[]; empty: string }
  | { key: string; title: string; aside?: string; kind: 'quotes'; quotes: ProfileQuote[]; average?: number }
  | { key: string; title: string; aside?: string; kind: 'gauge'; gauge: ProfileGauge }
  | { key: string; title: string; aside?: string; kind: 'text'; text: string };

export interface ProfileHero {
  name: string;
  kind: PersonKind;
  subline: string;
  tags: ProfileTag[];
  stats: ProfileStat[];
  rating?: number;
}

export interface ProfileData {
  hero: ProfileHero;
  sections: ProfileSection[];
  /** clé des notes et statuts dans le store (id du mock, sinon id de la personne) */
  key: string;
  status: PersonStatus;
  roles: string[];
  mock?: Person;
  profile?: FreelanceProfile;
  rule?: StaffRule;
  poolRule?: PoolRule;
  contactUnlocked: boolean;
  favorite: boolean;
}

export type PersonRef = Pick<MissionPerson, 'id' | 'name' | 'kind' | 'photo'> & { note?: string };

export interface ProfileContext {
  missionContext?: 'applicant' | 'available' | 'placed';
  /** mission en cours (fiche ouverte depuis une mission, ou PDF d'une mission) */
  mission?: Mission;
  /** fiche imprimée : coordonnées en clair seulement si validé·e, jamais le tarif */
  forPrint?: boolean;
  establishments: string[];
  staff: StaffRule[];
  pool: PoolRule[];
  statuses: Record<string, PersonStatus | undefined>;
  absences: Absence[];
  favorites: string[];
  myReviews: Record<string, Review>;
  missions: Mission[];
  today: string;
}

/* ── Formats ─────────────────────────────────────────────── */
export const fmtShort = (iso: string) => parseISO(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
export const fmtDate = (iso: string) =>
  parseISO(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtMonthYear = (iso: string) => parseISO(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const fmtLong = (iso: string) =>
  parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const h1 = (n: number) => Math.round(n * 10) / 10;

/** Lundi → dimanche de la semaine qui contient `iso`. */
export function weekOf(iso: string): { from: string; to: string } {
  const d = parseISO(iso);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: toISO(monday), to: toISO(sunday) };
}

/** Repos d'un fixe, en mots : « lundi et mardi ». */
const restLabel = (rule: StaffRule) =>
  rule.restDays.length === 0
    ? 'aucun jour fixe'
    : rule.restDays
        .slice()
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
        .map((d) => DAY_LONG[d])
        .join(' et ');

/* ── Construction ────────────────────────────────────────── */
export function buildProfile(person: PersonRef, ctx: ProfileContext): ProfileData {
  const mock = people.find((p) => p.id === person.id || p.name === person.name);
  const key = mock?.id ?? person.id;
  const status: PersonStatus = ctx.statuses[key] ?? mock?.status ?? 'actif';
  const favorite = ctx.favorites.includes(person.name);
  const kindLabel = personKindStyle[person.kind].label;

  // Missions de la personne (placée pour de bon), passées et à venir.
  const mine = ctx.missions
    .filter((m) => effPlaced(m).some((p) => p.name === person.name && !p.suggested))
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = mine.filter((m) => m.date >= ctx.today);
  const past = mine.filter((m) => m.date < ctx.today).reverse();
  const absentToday = absenceOn(ctx.absences, person.name, ctx.today);

  // Étiquettes : deux au plus, la plus importante d'abord.
  const tags: ProfileTag[] = [];
  if (status === 'bloque') tags.push({ text: 'Bloqué·e', tone: 'danger' });
  if (status === 'candidat') tags.push({ text: 'Candidature', tone: 'blue' });
  if (absentToday) tags.push({ text: `Absent·e · ${absentToday.reason.toLowerCase()}`, tone: 'warn' });
  if (ctx.missionContext === 'placed') tags.push({ text: 'Placé·e sur ce créneau', tone: 'ok' });
  if (ctx.missionContext === 'applicant') tags.push({ text: 'A postulé à ce créneau', tone: 'blue' });

  // Bloc « pour cette mission » (fiche ouverte depuis une mission, ou PDF).
  const me = ctx.mission ? effPlaced(ctx.mission).find((p) => p.name === person.name) : undefined;
  const missionSection = (m: Mission, placed?: MissionPlaced): ProfileSection => ({
    key: 'mission',
    title: 'Pour cette mission',
    kind: 'rows',
    rows: [
      { label: 'Poste', value: m.poste },
      { label: 'Quand', value: `${fmtLong(m.date)} · ${missionTimeLabel(m)}` },
      { label: 'Où', value: m.establishment },
      ...(placed?.cost ? [{ label: 'Devis TTC', value: `${placed.cost} €` }] : []),
      ...(placed
        ? [
            placed.checkedIn
              ? {
                  label: 'Pointage',
                  value: `arrivée ${placed.clockIn ?? '—'}${placed.clockOut ? ` · sortie ${placed.clockOut}` : ''}`,
                  tone: 'ok' as Tone,
                }
              : { label: 'Pointage', value: 'à faire', tone: 'muted' as Tone },
          ]
        : []),
    ],
  });

  const noteSection: ProfileSection = {
    key: 'note',
    title: 'Note privée',
    aside: 'vous seul·e',
    kind: 'text',
    text: person.note ?? mock?.note ?? '',
  };

  /* ── Auto-entrepreneur ── */
  if (person.kind === 'freelance') {
    const base = freelanceProfileOf(person.name);
    const myQuotes: ProfileQuote[] = Object.values(ctx.myReviews)
      .filter((r) => r.name === person.name)
      .map((r) => ({
        rating: r.rating,
        text: r.comment || 'Évaluation sans commentaire.',
        by: `Vous · ${ctx.missions.find((m) => m.id === r.missionId)?.establishment ?? 'chez vous'}`,
        when: r.at.slice(0, 10),
      }));
    const quotes: ProfileQuote[] = [
      ...myQuotes,
      ...(base?.reviews ?? []).map((r) => ({
        rating: r.rating,
        text: r.comment,
        by: `${r.author} · ${r.establishment}`,
        when: r.date,
      })),
    ];
    const average =
      quotes.length > 0 ? quotes.reduce((s, q) => s + q.rating, 0) / quotes.length : (mock?.rating ?? undefined);
    const unlocked = isContactUnlocked(person.name);
    const withYou = base?.experiences.filter((e) => ctx.establishments.includes(e.establishment)) ?? [];
    if (unlocked) tags.push({ text: 'Validé·e chez vous', tone: 'ok' });
    if (favorite) tags.push({ text: 'Favori', tone: 'pink' });

    const vig = base?.vigilance;
    const vigRow: ProfileRow = !vig
      ? { label: 'Attestation URSSAF', value: 'Non fournie', tone: 'danger' }
      : vig.status === 'valide'
        ? { label: 'Attestation URSSAF', value: `À jour jusqu'au ${fmtDate(vig.until!)}`, tone: 'ok' }
        : vig.status === 'expiree'
          ? { label: 'Attestation URSSAF', value: `Expirée le ${fmtDate(vig.until!)}`, tone: 'danger' }
          : { label: 'Attestation URSSAF', value: 'Non fournie', tone: 'danger' };

    const sections: ProfileSection[] = [];
    if (ctx.mission) sections.push(missionSection(ctx.mission, me));
    sections.push({
      key: 'contact',
      title: 'Coordonnées',
      aside: unlocked ? 'visibles · validé·e chez vous' : 'masquées',
      kind: 'rows',
      rows: base
        ? [
            {
              label: 'Téléphone',
              value: unlocked ? base.phone : maskPhone(base.phone),
              href: unlocked ? `tel:${base.phone.replace(/\s/g, '')}` : undefined,
            },
            {
              label: 'E-mail',
              value: unlocked ? base.email : maskEmail(base.email),
              href: unlocked ? `mailto:${base.email}` : undefined,
            },
            { label: 'SIRET', value: unlocked ? base.siret : '••• ••• ••• •••••' },
            { label: 'Ville', value: base.city },
            vigRow,
          ]
        : [vigRow],
      text: unlocked ? undefined : 'Visibles dès que vous validez cette personne sur une mission.',
    });
    if (base) {
      sections.push({
        key: 'skills',
        title: 'Compétences & langues',
        kind: 'chips',
        chips: [
          ...base.skills.map((s) => ({ text: s })),
          ...base.languages.map((l) => ({ text: l, tone: 'blue' as Tone })),
        ],
      });
      sections.push({
        key: 'experiences',
        title: 'Expériences',
        aside: `${base.experiences.length} missions · ${withYou.length} chez vous`,
        kind: 'list',
        items: base.experiences.map((e, i) => ({
          id: `${e.date}-${i}`,
          title: e.poste,
          detail: e.establishment,
          when: `${fmtShort(e.date)} · ${e.hours} h`,
          badge: ctx.establishments.includes(e.establishment) ? { text: 'chez vous', tone: 'pink' } : undefined,
        })),
        empty: 'Pas encore de mission.',
      });
    }
    if (quotes.length > 0 || average) {
      sections.push({
        key: 'reviews',
        title: 'Avis',
        aside: quotes.length > 0 ? `${quotes.length} avis` : undefined,
        kind: 'quotes',
        quotes,
        average,
      });
    }
    if (!ctx.forPrint) sections.push(noteSection);

    const missionsDone = mock?.missionsDone ?? base?.experiences.length ?? 0;
    return {
      hero: {
        name: person.name,
        kind: 'freelance',
        subline: [kindLabel, base?.city, base ? `sur Shift Express depuis ${fmtMonthYear(base.since)}` : undefined]
          .filter(Boolean)
          .join(' · '),
        tags: tags.slice(0, 2),
        stats: [
          { value: average ? `${average.toFixed(1)} ★` : '—', label: 'note' },
          { value: String(missionsDone), label: missionsDone > 1 ? 'missions' : 'mission' },
          { value: mock ? `${mock.reliability} %` : '—', label: 'présence' },
        ],
        rating: average,
      },
      sections,
      key,
      status,
      roles: mock?.roles ?? [],
      mock,
      profile: base,
      contactUnlocked: unlocked,
      favorite,
    };
  }

  /* ── Salarié / extra ── */
  const rule = person.kind === 'salarie' ? staffRuleOf(ctx.staff, person) : undefined;
  const poolRule = person.kind === 'extra' ? poolRuleOf(ctx.pool, person) : undefined;
  const week = weekOf(ctx.today);
  const weekHours = mine
    .filter((m) => m.date >= week.from && m.date <= week.to)
    .reduce((s, m) => s + missionHours(m), 0);
  const contractHours = rule?.weeklyHours ?? null;
  const roles = rule?.postes ?? poolRule?.postes ?? mock?.roles ?? [];
  const contractLabel = rule
    ? `${rule.contract} · ${rule.weeklyHours} h par semaine`
    : poolRule
      ? `${poolRule.contract}${poolRule.agency ? ` · ${poolRule.agency}` : ''} · bassin de talents`
      : 'CDD d’usage · appelé·e à la mission';
  const myAbsences = ctx.absences.filter((a) => a.name === person.name).sort((a, b) => a.from.localeCompare(b.from));

  const sections: ProfileSection[] = [];
  if (ctx.mission) sections.push(missionSection(ctx.mission, me));
  sections.push({
    key: 'contract',
    title: 'Contrat',
    aside: rule ? 'Réglages › Personnel fixe' : poolRule ? 'Réglages › Bassin de talents' : undefined,
    kind: 'rows',
    rows: [
      { label: 'Type', value: contractLabel },
      ...(rule ? [{ label: 'Département', value: rule.department }] : []),
      { label: 'Postes', value: roles.join(', ') || '—' },
      ...(rule ? [{ label: 'Repos', value: restLabel(rule) }] : []),
      ...(!ctx.forPrint && (rule || poolRule)
        ? [{ label: 'Tarif', value: `${(rule ?? poolRule)!.hourlyRate} €/h brut`, tone: 'muted' as Tone }]
        : []),
    ],
  });
  sections.push({
    key: 'week',
    title: 'Cette semaine',
    aside: `${fmtShort(week.from)} → ${fmtShort(week.to)}`,
    kind: 'gauge',
    gauge: {
      value: h1(weekHours),
      max: contractHours,
      label:
        contractHours !== null
          ? `${h1(weekHours)} h sur ${contractHours} h de contrat`
          : `${h1(weekHours)} h planifiées`,
      hint:
        contractHours === null
          ? 'Heures planifiées sur vos missions cette semaine.'
          : weekHours > contractHours
            ? `${h1(weekHours - contractHours)} h au-delà du contrat : heures supplémentaires à prévoir.`
            : `${h1(contractHours - weekHours)} h encore disponibles cette semaine.`,
    },
  });
  sections.push({
    key: 'absences',
    title: 'Absences & congés',
    aside: myAbsences.length ? `${myAbsences.length} déclarée${myAbsences.length > 1 ? 's' : ''}` : undefined,
    kind: 'list',
    items: myAbsences.map((a) => ({
      id: a.id,
      title: a.reason,
      when: a.from === a.to ? fmtShort(a.from) : `${fmtShort(a.from)} → ${fmtShort(a.to)}`,
    })),
    empty: 'Aucune absence déclarée.',
  });
  sections.push({
    key: 'upcoming',
    title: 'Prochaines missions',
    aside: upcoming.length ? `${upcoming.length} à venir` : undefined,
    kind: 'list',
    items: upcoming.slice(0, 3).map((m) => ({
      id: m.id,
      missionId: m.id,
      title: m.poste,
      detail: m.establishment,
      when: `${fmtShort(m.date)} · ${missionTimeLabel(m)}`,
    })),
    empty: 'Aucune mission à venir. Placez cette personne depuis le planning.',
  });
  sections.push({
    key: 'past',
    title: 'Dernières missions',
    kind: 'list',
    items: past.slice(0, 3).map((m) => {
      const p = effPlaced(m).find((x) => x.name === person.name);
      return {
        id: m.id,
        missionId: m.id,
        title: m.poste,
        detail: m.establishment,
        when: fmtShort(m.date),
        badge:
          p?.clockIn && p?.clockOut
            ? { text: `${p.clockIn}–${p.clockOut}`, tone: 'ok' as Tone }
            : { text: 'pointage manquant', tone: 'danger' as Tone },
      };
    }),
    empty: 'Pas encore de mission passée chez vous.',
  });
  if (!ctx.forPrint) sections.push(noteSection);

  const missionsDone = mock?.missionsDone ?? mine.length;
  return {
    hero: {
      name: person.name,
      kind: person.kind,
      subline: [
        person.kind === 'extra' ? 'Extra' : kindLabel,
        rule ? `${rule.contract} ${rule.weeklyHours} h` : (poolRule?.contract ?? 'CDD d’usage'),
        rule?.department ?? poolRule?.agency,
        status !== 'actif' && status !== 'bloque' && status !== 'candidat' ? statusLabel[status] : undefined,
      ]
        .filter(Boolean)
        .join(' · '),
      tags: tags.slice(0, 2),
      stats: [
        {
          value: contractHours !== null ? `${h1(weekHours)}/${contractHours} h` : `${h1(weekHours)} h`,
          label: 'cette semaine',
        },
        { value: String(missionsDone), label: missionsDone > 1 ? 'missions' : 'mission' },
        { value: mock && mock.reliability > 0 ? `${mock.reliability} %` : '—', label: 'présence' },
      ],
      rating: mock?.rating,
    },
    sections,
    key,
    status,
    roles,
    mock,
    rule,
    poolRule,
    contactUnlocked: true,
    favorite,
  };
}

/** Sous-ligne courte d'une personne pour les listes : « CDI 39 h · Restauration », « Auto-entrepreneur · Lyon 7ᵉ ». */
export function shortSubline(
  person: { id: string; name: string; kind: PersonKind },
  staff: StaffRule[],
  pool: PoolRule[],
): string {
  if (person.kind === 'freelance') {
    const base = freelanceProfileOf(person.name);
    return ['Auto-entrepreneur', base?.city].filter(Boolean).join(' · ');
  }
  if (person.kind === 'salarie') {
    const rule = staffRuleOf(staff, person);
    return rule ? `${rule.contract} ${rule.weeklyHours} h · ${rule.department}` : 'Salarié';
  }
  const poolRule = poolRuleOf(pool, person);
  return ['Extra', poolRule?.contract ?? 'CDD d’usage', poolRule?.agency].filter(Boolean).join(' · ');
}

/** Fiche pour l'impression, lue directement dans les stores (hors React). */
export function profileForPrint(person: PersonRef, mission?: Mission): ProfileData {
  const settings = useV2Settings.getState();
  const peopleState = useV2People.getState();
  return buildProfile(person, {
    mission,
    forPrint: true,
    missionContext: mission ? 'placed' : undefined,
    establishments: settings.establishments.map((e) => e.name),
    staff: settings.staff,
    pool: settings.pool,
    statuses: peopleState.statuses,
    absences: peopleState.absences,
    favorites: peopleState.favorites,
    myReviews: peopleState.reviews,
    missions: effMissions(),
    today: MOCK_TODAY,
  });
}
