/**
 * Panneau « Publier une mission » — la façon unique de créer un ou plusieurs
 * créneaux. On décrit le besoin (département → poste, établissement, nombre),
 * quand (plage de dates + jours de la semaine + horaire), le profil recherché
 * (langues, logiciels PMS/POS), les consignes (publique + note privée), puis
 * le système de couverture et le tarif proposé aux auto-entrepreneurs (dans la
 * fourchette fixée par l'administrateur). Le coût/devis reste sous les yeux.
 *
 * Tout vient des Réglages : postes et horaires habituels, établissements,
 * fourchettes de tarif, délais de cascade, personnel fixe (pour dire combien
 * de salariés tiennent le poste).
 *
 * Garde-fous avant de valider :
 *   • Date passée — on ne publie pas dans le passé.
 *   • Doublon   — un créneau quasi identique existe déjà l'un des jours → on prévient.
 *   • Devis     — pour les freelances, le TTC engagé est affiché dans le garde-fou.
 */
import { useEffect, useMemo, useState } from 'react';
import { MOCK_TODAY } from '@/mocks/v2Today';
import {
  X,
  ChevronDown,
  Users,
  Zap,
  Phone,
  Languages,
  Monitor,
  Eye,
  Lock,
  FileText,
  Bookmark,
  BookmarkCheck,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Plus,
} from 'lucide-react';
import { LANGUES } from '@/mocks/v2Missions';
import type { CoverageSystem, Mission } from '@/mocks/v2Missions';
import { people } from '@/mocks/v2People';
import { createMission, effMissions, useMissionStore, writeFreelanceRate } from '../mission/missionStore';
import { useV2Templates } from '@/stores/v2TemplatesStore';
import type { ShiftTemplate } from '@/stores/v2TemplatesStore';
import {
  useV2Settings,
  useRateBounds,
  rateFor,
  DEPARTMENTS,
  DAY_SHORT,
  DAY_ORDER,
  DAY_LONG,
} from '@/stores/v2SettingsStore';
import type { Department, PosteSlot } from '@/stores/v2SettingsStore';
import { systemChoice } from '../coverage';
import { hoursBetween } from '../time';
import { hoursUntil } from '../mission/cancellation';
import { cascadePlan, planShort, planSummary, atLabel } from '../cascade';
import { MultiSelect } from '../MultiSelect';
import { SoftwareSelect } from '../SoftwareSelect';
import { Segmented } from '../settings/controls';
import { DateRangeField } from './DateRangeField';
import { ConfirmGuard } from './ConfirmGuard';
import { useV2Ui } from '@/stores/v2UiStore';
import { UpgradeDialog } from '../settings/UpgradeDialog';
import { employeeShiftRoom, planLimits, planName, monthLabel, monthOf } from '../plan';

/** « Aujourd'hui » de la maquette, pour le repère du calendrier. */
const TODAY = MOCK_TODAY;
/** Boost : +2 €/h sur le tarif proposé. */
const BOOST = 2;

interface Props {
  onClose: () => void;
  /** ouvrir une mission existante (depuis l'alerte doublon) */
  onOpenMission?: (missionId: string) => void;
  /** système de couverture présélectionné (ex. 'freelance' en mode simple) */
  initialSystem?: CoverageSystem;
  /** mode Freelance uniquement : pas de choix de système, on publie aux auto-entrepreneurs */
  freelanceOnly?: boolean;
  /** préremplissage depuis une case « à pourvoir » du planning */
  initialPoste?: string;
  initialDate?: string;
  /** créneau attendu cliqué : horaire et nombre de personnes */
  initialSlot?: { start: string; end: string; count: number };
}

/** Nombre de jours inclus dans la plage [from, to]. */
function dayCountBetween(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  const diff = Math.round((b - a) / 86_400_000);
  return diff >= 0 ? diff + 1 : 1;
}

/** Toutes les dates ISO de la plage [from, to] (31 jours maximum). */
function datesBetween(from: string, to: string): string[] {
  const [y, m, d] = from.split('-').map(Number);
  const n = Math.min(dayCountBetween(from, to), 31);
  return Array.from({ length: n }, (_, i) => {
    const date = new Date(y, m - 1, d + i);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
}

const weekdayOf = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

/** Réglage d'un jour de la plage : horaire propre et/ou jour retiré. */
interface DayTweak {
  start?: string;
  end?: string;
  removed?: boolean;
}

/** Une mission par jour, ou un seul événement sur toute la plage. */
type PublishAs = 'shifts' | 'event';

export function PublishPanel({
  onClose,
  onOpenMission,
  initialSystem = 'cascade',
  freelanceOnly = false,
  initialPoste,
  initialDate,
  initialSlot,
}: Props) {
  // ── Réglages : postes, établissements, personnel, cascade, tarifs ──
  const posteNeeds = useV2Settings((s) => s.postes);
  const establishments = useV2Settings((s) => s.establishments);
  const account = useV2Settings((s) => s.account);
  const staff = useV2Settings((s) => s.staff);
  const cascadeSettings = useV2Settings((s) => s.cascade);
  const boundsOf = useRateBounds();
  const postesOf = (dept: Department) => posteNeeds.filter((p) => p.department === dept).map((p) => p.poste);
  const needOf = (p: string) => posteNeeds.find((n) => n.poste === p);
  // Créneaux habituels d'un poste pour un jour : ceux attendus ce jour-là, sinon tous les siens.
  const usualSlots = (p: string, date: string): PosteSlot[] => {
    const n = needOf(p);
    if (!n) return [];
    const onDay = n.slots.filter((sl) => sl.days.includes(weekdayOf(date)));
    return onDay.length > 0 ? onDay : n.slots;
  };

  // Préremplissage : on retrouve le département du poste demandé.
  const initDept: Department = needOf(initialPoste ?? '')?.department ?? 'Restauration';
  const [departement, setDepartement] = useState<Department>(initDept);
  const [poste, setPoste] = useState(initialPoste ?? postesOf(initDept)[0] ?? '');
  const [establishment, setEstablishment] = useState(
    establishments.find((e) => e.id === account.establishmentId)?.name ?? establishments[0]?.name ?? '',
  );
  const establishmentId = establishments.find((e) => e.name === establishment)?.id ?? account.establishmentId;
  const [dateFrom, setDateFrom] = useState(initialDate ?? '2026-11-03');
  const [dateTo, setDateTo] = useState(initialDate ?? '2026-11-03');
  // Horaire et nombre : le créneau cliqué, sinon le premier créneau habituel du poste ce jour-là.
  const initSlot = initialSlot ?? usualSlots(initialPoste ?? '', initialDate ?? '2026-11-03')[0];
  const [start, setStart] = useState(initSlot?.start ?? '18:00');
  const [end, setEnd] = useState(initSlot?.end ?? '23:30');
  const [required, setRequired] = useState(initSlot?.count ?? 2);
  // Coupure : une seconde plage le même jour, le tout compte pour UN seul shift.
  const [splitOn, setSplitOn] = useState(false);
  const [split, setSplit] = useState({ start: '18:00', end: '23:00' });
  const timeLabel = splitOn ? `${start}–${end} · ${split.start}–${split.end}` : `${start}–${end}`;
  const splitHours = splitOn ? hoursBetween(split.start, split.end) : 0;
  const [langues, setLangues] = useState<string[]>(['Français']);
  const [logiciels, setLogiciels] = useState<string[]>([]);
  const [consigne, setConsigne] = useState('');
  const [notePrivee, setNotePrivee] = useState('');
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [system, setSystem] = useState<CoverageSystem>(freelanceOnly ? 'freelance' : initialSystem);
  const [advanced, setAdvanced] = useState(false);
  // Liste jour par jour repliée par défaut (on l'ouvre pour ajuster un horaire ou retirer un jour).
  const [adjustDays, setAdjustDays] = useState(false);
  const [boost, setBoost] = useState(false);
  const [relance, setRelance] = useState(false);
  const [autoValidate, setAutoValidate] = useState(false);
  const [guard, setGuard] = useState<'duplicate' | 'confirm' | 'limit' | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  // Tarif proposé aux auto-entrepreneurs : celui des Réglages pour ce poste et
  // cet établissement, ajustable dans la fourchette de l'administrateur.
  const bounds = boundsOf(poste, establishmentId);
  const defaultRate = Math.min(
    Math.max(rateFor(cascadeSettings.freelanceRates, establishmentId, poste), bounds.min),
    bounds.max,
  );
  const [rateEdited, setRateEdited] = useState<number | null>(null);
  const rate = Math.min(Math.max(rateEdited ?? defaultRate, bounds.min), bounds.max);
  const effectiveRate = rate + (boost && system !== 'employe' ? BOOST : 0);

  // Changer de poste : horaire habituel et nombre attendu suivent (Réglages › Postes, premier créneau du jour).
  const changePoste = (p: string) => {
    setPoste(p);
    const sl = usualSlots(p, dateFrom)[0];
    if (sl) {
      setStart(sl.start);
      setEnd(sl.end);
      setRequired(sl.count);
    }
    setRateEdited(null);
  };
  const changeDepartement = (d: Department) => {
    setDepartement(d);
    const first = postesOf(d)[0];
    if (first) changePoste(first);
  };

  // Plage de dates → jours de la semaine gardés, un réglage par jour (horaire
  // propre, jour retiré), et le choix : une mission par jour, ou un seul événement.
  const [weekdays, setWeekdays] = useState<number[]>(DAY_ORDER);
  const [tweaks, setTweaks] = useState<Record<string, DayTweak>>({});
  const [publishAs, setPublishAs] = useState<PublishAs>('shifts');
  const allDays = useMemo(() => datesBetween(dateFrom, dateTo), [dateFrom, dateTo]);
  const weekDays = allDays.filter((d) => weekdays.includes(weekdayOf(d)));
  const dayStart = (d: string) => tweaks[d]?.start ?? start;
  const dayEnd = (d: string) => tweaks[d]?.end ?? end;
  const activeDays = weekDays.filter((d) => !tweaks[d]?.removed);
  // Cascade par paliers : le plan dépend du temps restant avant le premier jour publié.
  const cascadeDay = activeDays[0] ?? dateFrom;
  const cascadeHours = hoursUntil({ date: cascadeDay, start: dayStart(cascadeDay) });
  const plan = cascadePlan(cascadeSettings, cascadeHours);
  const tweak = (d: string, patch: DayTweak) => setTweaks((t) => ({ ...t, [d]: { ...t[d], ...patch } }));
  const toggleWeekday = (wd: number) =>
    setWeekdays((w) => (w.includes(wd) ? (w.length > 1 ? w.filter((x) => x !== wd) : w) : [...w, wd]));
  // Un jour qui sort de la plage perd son réglage.
  useEffect(() => {
    setTweaks((t) => Object.fromEntries(Object.entries(t).filter(([d]) => allDays.includes(d))));
  }, [allDays]);

  // Modèles : repartir d'un shift enregistré, ou enregistrer celui-ci.
  const templates = useV2Templates((s) => s.templates);
  const saveTemplate = useV2Templates((s) => s.saveTemplate);
  const removeTemplate = useV2Templates((s) => s.removeTemplate);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savedTemplate, setSavedTemplate] = useState<string | null>(null);
  const applyTemplate = (t: ShiftTemplate) => {
    setTemplateId(t.id);
    const dept = DEPARTMENTS.find((d) => d === t.departement) ?? needOf(t.poste)?.department ?? 'Restauration';
    setDepartement(dept);
    setPoste(t.poste);
    if (establishments.some((e) => e.name === t.establishment)) setEstablishment(t.establishment);
    setStart(t.start);
    setEnd(t.end);
    setRequired(t.required);
    setLangues(t.langues);
    setLogiciels(t.logiciels);
    setConsigne(t.consigne);
    setSystem(freelanceOnly ? 'freelance' : t.system);
    setTweaks({});
    setRateEdited(null);
  };
  const confirmSaveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    const t = saveTemplate({
      name,
      departement,
      poste,
      establishment,
      start,
      end,
      required,
      langues,
      logiciels,
      consigne,
      system,
    });
    setTemplateId(t.id);
    setSavedTemplate(name);
    setSavingTemplate(false);
    setTemplateName('');
  };

  const hours = Math.round((hoursBetween(start, end) + splitHours) * 10) / 10;
  const days = activeDays.length;
  // Coût : heures réelles de chaque jour gardé (horaires propres + coupure) × tarif proposé.
  const totalHours =
    Math.round(activeDays.reduce((s, d) => s + hoursBetween(dayStart(d), dayEnd(d)) + splitHours, 0) * 10) / 10;
  const devisTTC = Math.round(required * totalHours * effectiveRate);

  // ── Qui peut tenir ce poste ? (aide au choix du système) ──────────
  const staffForPoste = staff.filter((r) => r.postes.includes(poste));
  const firstDay = activeDays[0];
  const staffOffFirstDay = firstDay ? staffForPoste.filter((r) => r.restDays.includes(weekdayOf(firstDay))) : [];
  const staffAvailable = staffForPoste.length - (days === 1 ? staffOffFirstDay.length : 0);
  const freelancesForPoste = people.filter((p) => p.kind === 'freelance' && p.roles.includes(poste)).length;
  const extrasForPoste = people.filter((p) => p.kind === 'extra' && p.roles.includes(poste)).length;

  // ── Garde-fous : date passée, doublons sur l'un des jours ──────────
  const inPast = activeDays.some((d) => d < TODAY);
  const version = useMissionStore();
  const duplicates = useMemo<Mission[]>(() => {
    void version;
    return effMissions().filter(
      (m) => m.poste === poste && m.establishment === establishment && activeDays.includes(m.date),
    );
  }, [poste, establishment, activeDays, version]);
  const duplicate = duplicates[0];

  // Formule : shifts employés encore possibles ce mois (les auto-entrepreneurs ne comptent pas).
  // Mois par mois : le premier mois où la publication dépasserait ce qu'il reste.
  const formule = useV2Ui((s) => s.plan);
  const shiftLimit = planLimits(formule).employeeShiftsPerMonth;
  const limitHit = useMemo(() => {
    void version;
    if (system === 'freelance') return null;
    for (const month of Array.from(new Set(activeDays.map(monthOf)))) {
      const days = activeDays.filter((d) => d.startsWith(month)).length;
      const room = employeeShiftRoom(formule, month);
      if (days > room) return { month, days, room };
    }
    return null;
  }, [version, formule, activeDays, system]);

  const submit = () => {
    if (limitHit && guard !== 'confirm') {
      setGuard('limit');
      return;
    }
    if (duplicate && guard !== 'confirm') {
      setGuard('duplicate');
      return;
    }
    setGuard('confirm');
  };

  // Publier pour de bon : une mission par jour gardé, ou un seul événement
  // (missions reliées par eventId). Elle apparaît aussitôt sur le planning.
  const publish = () => {
    const eventId = publishAs === 'event' && activeDays.length > 1 ? `ev-${Date.now()}` : undefined;
    const eventName = eventId
      ? `${poste} · ${fmtDayShort(activeDays[0])} → ${fmtDayShort(activeDays[activeDays.length - 1])}`
      : undefined;
    const coverage = system === 'freelance' ? 'published' : system === 'cascade' ? 'cascade' : 'shortage';
    const label =
      system === 'freelance'
        ? `Publiée aux auto-entrepreneurs · ${effectiveRate} €/h TTC`
        : system === 'cascade'
          ? `Cascade lancée · ${planSummary(plan)}`
          : 'Proposée à vos salariés';
    const extraHistory = [
      // À la publication, tout le monde concerné est prévenu d'un coup ; ensuite,
      // le gestionnaire relance son personnel (notification) ou les auto-entrepreneurs (appels).
      {
        at: 'maintenant',
        label:
          system === 'employe'
            ? 'Notification envoyée à vos salariés'
            : system === 'cascade'
              ? 'Notification envoyée à vos salariés (puis extras et auto-entrepreneurs selon la cascade)'
              : 'Notification envoyée aux auto-entrepreneurs du poste',
      },
      boost && system !== 'employe' ? { at: 'maintenant', label: `Boost +${BOOST} €/h dès la publication` } : null,
      relance && system !== 'employe' ? { at: 'maintenant', label: 'Relance par appel si personne ne répond' } : null,
      autoValidate && system !== 'employe'
        ? { at: 'maintenant', label: 'Validation automatique du premier qui répond' }
        : null,
    ].filter((h): h is { at: string; label: string } => h !== null);
    activeDays.forEach((d) => {
      const h = hoursBetween(dayStart(d), dayEnd(d)) + splitHours;
      const m = createMission({
        poste,
        establishment,
        date: d,
        start: dayStart(d),
        end: dayEnd(d),
        split: splitOn ? { ...split } : undefined,
        required,
        system,
        coverage,
        placed: [],
        candidates: [],
        estimatedCost: system === 'employe' ? 0 : Math.round(required * h * effectiveRate),
        quote: system === 'freelance' ? Math.round(required * h * effectiveRate) : undefined,
        publicNote: consigne || undefined,
        privateNote: notePrivee || undefined,
        privatePdf: pdfName ?? undefined,
        languages: langues,
        software: logiciels,
        eventId,
        eventName,
        cascadeStep:
          system === 'cascade'
            ? plan.regime === 'urgence'
              ? 'freelances'
              : plan.regime === 'serre'
                ? 'extras'
                : 'salaries'
            : undefined,
        cascadeFreelanceAt: system === 'cascade' && plan.freelancesAtH > 0 ? atLabel(plan.freelancesAtH) : undefined,
        // La première ligne (la plus récente) dit comment la mission est née ; les options suivent.
        history: [{ at: 'maintenant', label }, ...extraHistory],
      });
      if (system !== 'employe') writeFreelanceRate(m.id, effectiveRate);
    });
    onClose();
  };

  const dateLabel =
    allDays.length > 1
      ? `du ${fmtDate(dateFrom)} au ${fmtDate(dateTo)} · ${days} jour${days > 1 ? 's' : ''}${
          publishAs === 'event' ? ' · événement entier' : ' · un shift par jour'
        }`
      : fmtDate(dateFrom);
  const weekdayLabel =
    weekdays.length === 7
      ? ''
      : DAY_ORDER.filter((wd) => weekdays.includes(wd))
          .map((wd) => DAY_LONG[wd].slice(0, 3))
          .join(', ');
  const canPublish = days > 0 && !inPast && poste !== '';

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-se-ink/40" />

      <div className="se-root relative w-full max-w-lg bg-se-surface shadow-se-md flex flex-col max-h-screen">
        {/* En-tête : titre + résumé vivant de ce qu'on est en train de publier */}
        <header className="flex items-center gap-3 px-5 py-4 border-b border-se-line">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-se-ink">Publier une mission</h2>
            <p className="text-xs text-se-muted truncate">
              {poste || 'Poste à choisir'} · {required} pers. ·{' '}
              {dateFrom === dateTo ? fmtDayShort(dateFrom) : `${fmtDayShort(dateFrom)} → ${fmtDayShort(dateTo)}`} ·{' '}
              {timeLabel}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="ml-auto w-8 h-8 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* ── Partir d'un modèle ────────────────────────────── */}
          {templates.length > 0 && (
            <div>
              <p className="se-eyebrow mb-1.5">
                Partir d'un modèle <span className="font-normal normal-case text-se-muted">· facultatif</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((t) => {
                  const on = templateId === t.id;
                  return (
                    <span key={t.id} className="inline-flex items-center">
                      <button
                        type="button"
                        onClick={() => applyTemplate(t)}
                        title={`${t.poste} · ${t.start}–${t.end} · ${t.required} pers.`}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold border transition-colors ${
                          on
                            ? 'bg-se-blue text-white border-se-blue'
                            : 'border-se-line text-se-ink hover:border-se-muted'
                        } ${on ? 'rounded-l-full' : 'rounded-full'}`}
                      >
                        {on ? (
                          <BookmarkCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        {t.name}
                      </button>
                      {on && (
                        <button
                          type="button"
                          onClick={() => {
                            removeTemplate(t.id);
                            setTemplateId(null);
                          }}
                          aria-label={`Supprimer le modèle ${t.name}`}
                          title="Supprimer ce modèle"
                          className="h-[34px] px-2 rounded-r-full border border-l-0 border-se-blue bg-se-blue-wash text-se-blue-ink hover:text-se-danger"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 1 · Le besoin ─────────────────────────────────── */}
          <SectionTitle n={1}>Le besoin</SectionTitle>
          <Field label="Département">
            <Segmented<Department>
              value={departement}
              onChange={changeDepartement}
              options={DEPARTMENTS.map((d) => ({ key: d, label: d }))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Poste">
              {postesOf(departement).length === 0 && !poste ? (
                <p className="text-sm text-se-muted">
                  Aucun poste dans ce département. Ajoutez-en dans Réglages › Postes.
                </p>
              ) : (
                <select value={poste} onChange={(e) => changePoste(e.target.value)} className={selectCls}>
                  {!postesOf(departement).includes(poste) && poste && <option>{poste}</option>}
                  {postesOf(departement).map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              )}
            </Field>

            {account.type === 'etablissements' && establishments.length > 1 && (
              <Field label="Établissement">
                <select
                  value={establishment}
                  onChange={(e) => {
                    setEstablishment(e.target.value);
                    setRateEdited(null);
                  }}
                  className={selectCls}
                >
                  {establishments.map((e) => (
                    <option key={e.id}>{e.name}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          {/* ── 2 · Quand : plage de dates au calendrier (début → fin) + horaire ── */}
          <SectionTitle n={2}>Quand</SectionTitle>
          {/* Dates : un champ qui ouvre le sélecteur (raccourcis + calendrier début → fin) */}
          <Field label="Dates">
            <DateRangeField
              value={{ from: dateFrom, to: dateTo }}
              today={TODAY}
              onChange={(r) => {
                setDateFrom(r.from);
                setDateTo(r.to);
              }}
            />
          </Field>

          {/* Jours de la semaine gardés — utile sur une plage (ex. tous les ven. et sam.) */}
          {allDays.length > 1 && (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="se-eyebrow">Jours de la semaine</span>
                <span className="text-xs text-se-muted">
                  {weekdays.length === 7 ? 'tous' : `${weekDays.length} jour${weekDays.length > 1 ? 's' : ''} gardés`}
                </span>
              </div>
              <div className="flex gap-1">
                {DAY_ORDER.map((wd) => {
                  const on = weekdays.includes(wd);
                  return (
                    <button
                      key={wd}
                      type="button"
                      aria-pressed={on}
                      aria-label={DAY_LONG[wd]}
                      onClick={() => toggleWeekday(wd)}
                      className={`flex-1 h-9 rounded-se-sm text-sm font-semibold border transition-colors ${
                        on ? 'bg-se-blue text-white border-se-blue' : 'border-se-line text-se-muted hover:text-se-ink'
                      }`}
                    >
                      {DAY_SHORT[wd]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Field label="Début">
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={selectCls} />
            </Field>
            <Field label="Fin">
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={selectCls} />
            </Field>
            <Field label="Personnes">
              <Stepper value={required} onChange={setRequired} min={1} />
            </Field>
          </div>
          {/* Coupure : seconde plage le même jour, un seul shift */}
          {splitOn ? (
            <div className="-mt-2 rounded-se-sm border border-se-line bg-se-surface-2/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <p className="se-eyebrow">
                  Reprise après coupure <span className="font-normal normal-case text-se-muted">· même shift</span>
                </p>
                <button
                  type="button"
                  onClick={() => setSplitOn(false)}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-se-muted hover:text-se-danger"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" /> Retirer la coupure
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Reprise">
                  <input
                    type="time"
                    value={split.start}
                    onChange={(e) => setSplit((s) => ({ ...s, start: e.target.value }))}
                    className={selectCls}
                  />
                </Field>
                <Field label="Fin">
                  <input
                    type="time"
                    value={split.end}
                    onChange={(e) => setSplit((s) => ({ ...s, end: e.target.value }))}
                    className={selectCls}
                  />
                </Field>
                <div className="self-end pb-2.5 text-xs text-se-muted">pause {hoursBetween(end, split.start)} h</div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                // Reprise proposée : 3 h après la fin, pour 4 h.
                const [eh, em] = end.split(':').map(Number);
                const s = (eh + 3) % 24;
                const e = (eh + 7) % 24;
                setSplit({
                  start: `${String(s).padStart(2, '0')}:${String(em).padStart(2, '0')}`,
                  end: `${String(e).padStart(2, '0')}:${String(em).padStart(2, '0')}`,
                });
                setSplitOn(true);
              }}
              className="-mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-se-blue-ink hover:text-se-blue"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Ajouter une coupure (ex. 11:00–15:00 puis 18:00–23:00)
            </button>
          )}
          <p className="-mt-2 text-xs text-se-muted">
            {splitOn ? `${timeLabel} · ${hours} h en une seule mission (coupure)` : `${hours} h par mission`}
            {!splitOn && end <= start ? ' · se termine le lendemain' : ''}
            {usualSlots(poste, dateFrom).length > 0 &&
            !usualSlots(poste, dateFrom).some((sl) => sl.start === start && sl.end === end)
              ? ` · habituel : ${usualSlots(poste, dateFrom)
                  .map((sl) => `${sl.label} ${sl.start}–${sl.end}`)
                  .join(' ou ')}`
              : ''}
          </p>

          {/* ── Les jours de la plage : retirer, ajuster l'horaire, puis par shift ou événement ── */}
          {allDays.length > 1 && (
            <div className="rounded-se border border-se-line">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-b border-se-line">
                <p className="se-eyebrow">
                  {days} jour{days > 1 ? 's' : ''}{' '}
                  <span className="font-normal normal-case text-se-muted">sur {allDays.length}</span>
                </p>
                <Segmented<PublishAs>
                  value={publishAs}
                  onChange={setPublishAs}
                  options={[
                    { key: 'shifts', label: 'Par mission' },
                    { key: 'event', label: 'Événement entier' },
                  ]}
                />
              </div>
              {/* La liste jour par jour est repliée : on l'ouvre seulement pour ajuster */}
              <button
                type="button"
                onClick={() => setAdjustDays((v) => !v)}
                aria-expanded={adjustDays}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-se-blue-ink hover:bg-se-surface-2"
              >
                {adjustDays ? 'Masquer le détail des jours' : 'Ajuster jour par jour (horaires, retirer un jour)'}
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${adjustDays ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {adjustDays && (
                <ul className="max-h-60 overflow-y-auto divide-y divide-se-line border-t border-se-line">
                  {weekDays.map((d) => {
                    const t = tweaks[d];
                    const custom = (t?.start && t.start !== start) || (t?.end && t.end !== end);
                    const dup = duplicates.some((m) => m.date === d);
                    return (
                      <li
                        key={d}
                        className={`flex items-center gap-2 px-3 py-1.5 ${t?.removed ? 'bg-se-surface-2/60' : ''}`}
                      >
                        <span
                          className={`w-[88px] shrink-0 text-sm ${t?.removed ? 'text-se-muted line-through' : 'text-se-ink font-semibold'}`}
                          title={dup ? 'Un créneau proche existe déjà ce jour-là' : undefined}
                        >
                          {fmtDayShort(d)}
                          {dup && !t?.removed && (
                            <AlertTriangle
                              className="inline w-3 h-3 ml-1 text-se-cascade-ink align-[-1px]"
                              aria-label="doublon"
                            />
                          )}
                        </span>
                        {t?.removed ? (
                          <>
                            <span className="flex-1 text-xs text-se-muted">retiré</span>
                            <button
                              type="button"
                              onClick={() => tweak(d, { removed: false })}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-se-blue-ink hover:text-se-blue"
                            >
                              <RotateCcw className="w-3 h-3" aria-hidden="true" /> Remettre
                            </button>
                          </>
                        ) : (
                          <>
                            <input
                              type="time"
                              value={dayStart(d)}
                              onChange={(e) => tweak(d, { start: e.target.value })}
                              aria-label={`Début le ${fmtDayShort(d)}`}
                              className={`${timeCls} ${custom ? 'border-se-blue text-se-blue-ink' : ''}`}
                            />
                            <span className="text-se-muted">–</span>
                            <input
                              type="time"
                              value={dayEnd(d)}
                              onChange={(e) => tweak(d, { end: e.target.value })}
                              aria-label={`Fin le ${fmtDayShort(d)}`}
                              className={`${timeCls} ${custom ? 'border-se-blue text-se-blue-ink' : ''}`}
                            />
                            <span className="flex-1 text-[11px] text-se-muted text-right tabular-nums">
                              {hoursBetween(dayStart(d), dayEnd(d))} h
                            </span>
                            <button
                              type="button"
                              onClick={() => tweak(d, { removed: true })}
                              aria-label={`Retirer le ${fmtDayShort(d)}`}
                              title="Retirer ce jour"
                              className="w-7 h-7 grid place-items-center rounded-se-sm text-se-muted hover:text-se-danger hover:bg-se-danger-wash"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="px-3 py-2 text-xs text-se-muted border-t border-se-line">
                {publishAs === 'event'
                  ? `Un seul événement : les candidats s'engagent sur les ${days} jours, une seule validation.`
                  : `${days} créneaux indépendants : chaque jour se couvre et se valide séparément.`}
                {days === 0 && ' Remettez au moins un jour.'}
              </p>
            </div>
          )}

          {/* Date passée : on ne publie pas dans le passé */}
          {inPast && (
            <div className="rounded-se-sm border border-se-danger bg-se-danger-wash px-3 py-2.5 text-sm">
              <p className="font-semibold text-se-danger">
                {days > 1 ? 'Certains jours sont passés' : 'Cette date est passée'}
              </p>
              <p className="text-se-ink mt-0.5">Choisissez une date à partir d'aujourd'hui, ou retirez ces jours.</p>
            </div>
          )}

          {/* Alerte doublon, en continu sous le jour/poste */}
          {duplicate && (
            <div className="rounded-se-sm border border-se-cascade bg-se-cascade-wash px-3 py-2.5 text-sm">
              <p className="font-semibold text-se-cascade-ink">
                {duplicates.length > 1
                  ? `${duplicates.length} créneaux proches existent déjà`
                  : 'Un créneau proche existe déjà'}
              </p>
              <p className="text-se-ink mt-0.5">
                {duplicate.poste} · {fmtDate(duplicate.date)} · {duplicate.start}–{duplicate.end}
                {duplicates.length > 1 ? ' …' : ''}
              </p>
              {onOpenMission && (
                <button
                  type="button"
                  onClick={() => onOpenMission(duplicate.id)}
                  className="mt-1.5 text-sm font-semibold text-se-cascade-ink underline underline-offset-2"
                >
                  Ouvrir ce créneau
                </button>
              )}
            </div>
          )}

          {/* ── 3 · Profil & consignes ─────────────────────────── */}
          <SectionTitle n={3}>
            Profil &amp; consignes <span className="font-normal normal-case text-se-muted">· facultatif</span>
          </SectionTitle>
          <div className="rounded-se border border-se-line p-4 space-y-4">
            <div>
              <p className="se-eyebrow inline-flex items-center gap-1 mb-2">
                <Languages className="w-3.5 h-3.5" aria-hidden="true" /> Langues
              </p>
              <MultiSelect options={LANGUES} value={langues} onChange={setLangues} placeholder="Choisir des langues" />
            </div>

            <div>
              <p className="se-eyebrow inline-flex items-center gap-1 mb-1">
                <Monitor className="w-3.5 h-3.5" aria-hidden="true" /> Logiciel à maîtriser
              </p>
              <p className="text-xs text-se-muted mb-2">
                Un seul : le PMS (hôtellerie) ou la caisse POS (restauration) du lieu.
              </p>
              <SoftwareSelect value={logiciels} onChange={setLogiciels} />
            </div>
          </div>

          {/* ── Consignes ─────────────────────────────────────── */}
          <Field
            label={
              <span className="inline-flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />{' '}
                {freelanceOnly ? 'Consigne visible des auto-entrepreneurs' : 'Consigne visible des personnes placées'}
              </span>
            }
          >
            <textarea
              value={consigne}
              onChange={(e) => setConsigne(e.target.value)}
              rows={2}
              placeholder="Tenue, point de rendez-vous, briefing…"
              className={textareaCls}
            />
          </Field>

          <Field
            label={
              <span className="inline-flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" aria-hidden="true" /> Note privée
              </span>
            }
          >
            <textarea
              value={notePrivee}
              onChange={(e) => setNotePrivee(e.target.value)}
              rows={2}
              placeholder="Visible de vous seul·e."
              className={textareaCls}
            />
          </Field>

          {/* PDF joint à la note privée */}
          <div className="-mt-2">
            <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-se-blue-ink hover:text-se-blue cursor-pointer">
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setPdfName(e.target.files?.[0]?.name ?? null)}
              />
              <FileText className="w-4 h-4" aria-hidden="true" />
              {pdfName ? 'Remplacer le PDF' : 'Joindre un PDF'}
            </label>
            {pdfName && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-se-ink">
                <FileText className="w-3.5 h-3.5 text-se-muted shrink-0" aria-hidden="true" />
                <span className="truncate">{pdfName}</span>
                <button
                  type="button"
                  onClick={() => setPdfName(null)}
                  aria-label="Retirer le PDF"
                  className="ml-auto text-se-muted hover:text-se-danger"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </p>
            )}
          </div>

          {/* ── 4 · Couverture & tarif ─────────────────────────── */}
          <SectionTitle n={4}>{freelanceOnly ? 'Tarif & devis' : 'Couverture & tarif'}</SectionTitle>
          {/* Choix du système — couleur = système (pas en Freelance uniquement).
              Sous chaque choix : qui peut vraiment tenir ce poste. */}
          <div className={freelanceOnly ? 'hidden' : ''}>
            <p className="se-eyebrow mb-2">Comment couvrir ce créneau</p>
            <div className="rounded-se border border-se-line divide-y divide-se-line overflow-hidden" role="radiogroup">
              {(['employe', 'cascade', 'freelance'] as CoverageSystem[]).map((key) => {
                const s = systemChoice[key];
                const on = system === key;
                const short = key !== 'freelance' && staffAvailable < required;
                const hint =
                  key === 'employe'
                    ? staffForPoste.length === 0
                      ? 'Aucun salarié fixe ne tient ce poste.'
                      : `${staffAvailable} salarié${staffAvailable > 1 ? 's' : ''} ${staffAvailable > 1 ? 'tiennent' : 'tient'} ce poste${
                          days === 1 && staffOffFirstDay.length > 0
                            ? ` · ${staffOffFirstDay.length} en repos ce jour-là`
                            : ''
                        }${short ? ` · il en faut ${required}` : ''}`
                    : key === 'cascade'
                      ? `${planShort(plan)} · ${staffForPoste.length} salarié${staffForPoste.length > 1 ? 's' : ''}, ${extrasForPoste} extra${extrasForPoste > 1 ? 's' : ''}`
                      : `${freelancesForPoste} auto-entrepreneur${freelancesForPoste > 1 ? 's' : ''} déjà venu${freelancesForPoste > 1 ? 's' : ''} sur ce poste · ${rate} €/h TTC`;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setSystem(key)}
                    className={`w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors ${
                      on ? s.wash : 'bg-se-surface hover:bg-se-surface-2'
                    }`}
                  >
                    {/* Bouton radio, couleur du système */}
                    <span
                      className={`mt-0.5 w-4 h-4 rounded-full border-2 grid place-items-center shrink-0 ${
                        on ? `${s.ring.split(' ')[1]}` : 'border-se-line'
                      }`}
                      aria-hidden="true"
                    >
                      {on && <span className={`w-2 h-2 rounded-full ${s.dot}`} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-se-ink">{s.label}</span>
                        <span className="text-xs text-se-muted truncate">{s.blurb}</span>
                      </span>
                      <span
                        className={`text-xs block mt-0.5 ${short && key === 'employe' ? 'text-se-danger font-semibold' : 'text-se-muted'}`}
                      >
                        {hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tarif proposé aux auto-entrepreneurs, dans la fourchette de l'administrateur */}
          {system !== 'employe' && (
            <div className="rounded-se border border-se-line p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="se-eyebrow">Tarif proposé aux auto-entrepreneurs</p>
                  <p className="text-xs text-se-muted mt-0.5">
                    {bounds.min === bounds.max
                      ? 'Tarif fixé par l’administrateur.'
                      : `Entre ${bounds.min} et ${bounds.max} €/h TTC${account.type === 'etablissements' ? ' · fourchette fixée par l’administrateur' : ''}`}
                    {rateEdited !== null && rate !== defaultRate ? ` · habituel : ${defaultRate} €/h` : ''}
                  </p>
                </div>
                <div className="w-32 shrink-0">
                  <Stepper
                    value={rate}
                    onChange={(n) => setRateEdited(n)}
                    min={bounds.min}
                    max={bounds.max}
                    suffix=" €/h"
                  />
                </div>
              </div>
              {boost && (
                <p className="text-xs text-se-blue-ink font-semibold mt-2">
                  Boost actif : {effectiveRate} €/h TTC proposés (+{BOOST} €/h).
                </p>
              )}
            </div>
          )}

          {/* Coût / devis, toujours visible */}
          <div className="rounded-se border border-se-line bg-se-surface-2 px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="se-eyebrow">{system === 'freelance' ? 'Devis freelance' : 'Coût estimé'}</span>
              <span className="text-xl font-extrabold font-display text-se-ink">
                {system === 'freelance' ? `${devisTTC} € TTC` : system === 'employe' ? 'Inclus' : `≈ ${devisTTC} € TTC`}
              </span>
            </div>
            <p className="text-xs text-se-muted mt-1">
              {required} pers. × {days > 1 ? `${totalHours} h sur ${days} j` : `${hours} h`}
              {system === 'employe'
                ? ' — vos salariés, aucun coût en plus.'
                : system === 'cascade'
                  ? ` × ${effectiveRate} €/h — payant seulement si la cascade va jusqu’aux auto-entrepreneurs.`
                  : ` × ${effectiveRate} €/h TTC`}
            </p>
          </div>

          {/* Options avancées, repliées (sans objet pour « Mes salariés ») */}
          {system !== 'employe' && (
            <div className="rounded-se border border-se-line">
              <button
                type="button"
                onClick={() => setAdvanced((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-se-ink"
              >
                <span>
                  Options avancées
                  {(boost || relance || autoValidate) && (
                    <span className="ml-2 text-xs font-normal text-se-blue-ink">
                      {[boost && 'boost', relance && 'relance', autoValidate && 'auto-validation']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${advanced ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {advanced && (
                <div className="px-4 pb-4 space-y-2 border-t border-se-line pt-3">
                  <Toggle
                    icon={<Zap className="w-4 h-4" />}
                    label="Booster dès la publication"
                    hint={`+${BOOST} €/h · attire plus de candidats`}
                    on={boost}
                    onChange={setBoost}
                  />
                  <Toggle
                    icon={<Phone className="w-4 h-4" />}
                    label="Relancer par appel si personne"
                    hint="10 appels × 0,40 € = 4 €"
                    on={relance}
                    onChange={setRelance}
                  />
                  <Toggle
                    icon={<Users className="w-4 h-4" />}
                    label="Valider automatiquement le 1ᵉʳ qui répond"
                    hint="sinon, vous validez à la main"
                    on={autoValidate}
                    onChange={setAutoValidate}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pied — une seule action, plus « enregistrer comme modèle » en lien */}
        <footer className="px-5 py-4 border-t border-se-line space-y-2.5">
          {savingTemplate ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmSaveTemplate()}
                placeholder="Nom du modèle (ex. Service du soir)"
                className={`${selectCls} flex-1`}
                aria-label="Nom du modèle"
              />
              <button
                type="button"
                onClick={confirmSaveTemplate}
                disabled={!templateName.trim()}
                className="h-10 px-3.5 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink disabled:opacity-40"
              >
                Enregistrer
              </button>
              <button
                type="button"
                onClick={() => setSavingTemplate(false)}
                className="h-10 px-2.5 rounded-se-sm text-sm font-semibold text-se-muted hover:bg-se-surface-2"
              >
                Annuler
              </button>
            </div>
          ) : savedTemplate ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-se-success">
              <BookmarkCheck className="w-3.5 h-3.5" aria-hidden="true" /> Modèle « {savedTemplate} » enregistré.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setSavingTemplate(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-se-blue-ink hover:text-se-blue"
            >
              <Bookmark className="w-3.5 h-3.5" aria-hidden="true" /> Enregistrer ce shift comme modèle
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!canPublish}
            className={`w-full py-3 rounded-se-sm text-sm font-semibold text-white ${
              systemChoice[system].band
            } hover:opacity-90 disabled:opacity-40`}
          >
            {system === 'employe'
              ? 'Placer mes salariés'
              : system === 'cascade'
                ? 'Lancer la cascade'
                : 'Publier aux auto-entrepreneurs'}
            {allDays.length > 1 && days > 0 ? ` · ${publishAs === 'event' ? 'événement' : `${days} missions`}` : ''}
          </button>
        </footer>

        {/* Garde-fou doublon : on a cliqué publier malgré le créneau proche */}
        {guard === 'duplicate' && duplicate && (
          <ConfirmGuard
            title="Publier quand même ?"
            tone="warning"
            confirmLabel="Oui, publier en plus"
            onCancel={() => setGuard(null)}
            onConfirm={() => setGuard('confirm')}
          >
            <p>
              {duplicates.length > 1 ? (
                <>
                  <strong>
                    {duplicates.length} créneaux {duplicate.poste}
                  </strong>{' '}
                  existent déjà au même endroit sur ces jours.
                </>
              ) : (
                <>
                  Un créneau <strong>{duplicate.poste}</strong> existe déjà le même jour au même endroit (
                  {duplicate.start}–{duplicate.end}).
                </>
              )}
            </p>
            <p className="text-se-muted">Vérifiez que vous ne publiez pas deux fois le même besoin.</p>
          </ConfirmGuard>
        )}

        {/* Garde-fou formule : plus assez de shifts employés ce mois */}
        {guard === 'limit' && limitHit && (
          <ConfirmGuard
            title={`Limite de la formule ${planName(formule)}`}
            tone="warning"
            confirmLabel="Publier aux auto-entrepreneurs"
            onCancel={() => setGuard(null)}
            onConfirm={() => {
              setSystem('freelance');
              setGuard(null);
            }}
          >
            <p>
              <strong>
                {limitHit.room === 0
                  ? `Vous avez atteint les ${shiftLimit} shifts employés de ${monthLabel(limitHit.month)}.`
                  : `Il reste ${limitHit.room} shift${limitHit.room > 1 ? 's' : ''} employé${limitHit.room > 1 ? 's' : ''} sur ${shiftLimit} en ${monthLabel(limitHit.month)}.`}
              </strong>{' '}
              Cette publication en crée {limitHit.days} ce mois-là.
            </p>
            <p className="text-se-muted">
              Les missions publiées aux auto-entrepreneurs ne sont pas comptées. Pour garder votre personnel dessus,
              passez à la formule supérieure.
            </p>
            <button
              type="button"
              onClick={() => setUpgrading(true)}
              className="text-sm font-semibold text-se-blue-ink hover:text-se-blue"
            >
              Voir les formules ›
            </button>
          </ConfirmGuard>
        )}
        {upgrading && (
          <UpgradeDialog
            onClose={() => setUpgrading(false)}
            reason={`Formule ${planName(formule)} : ${shiftLimit} shifts employés par mois. Passez au-dessus pour continuer à proposer vos shifts à votre personnel.`}
            onChosen={() => setGuard(null)}
          />
        )}

        {/* Garde-fou final : récap de ce qu'on engage */}
        {guard === 'confirm' && (
          <ConfirmGuard
            title={system === 'freelance' ? 'Confirmer la publication' : 'Confirmer'}
            tone="default"
            confirmLabel={system === 'employe' ? 'Placer' : system === 'cascade' ? 'Lancer' : 'Publier'}
            onCancel={() => setGuard(null)}
            onConfirm={publish}
          >
            <p>
              {poste} · {dateLabel}
              {weekdayLabel ? ` (${weekdayLabel})` : ''} · {timeLabel}
              {Object.values(tweaks).some((t) => !t.removed && (t.start || t.end))
                ? ' (horaires ajustés certains jours)'
                : ''}
            </p>
            <p>
              {required} personne{required > 1 ? 's' : ''} · {establishment} · {systemChoice[system].label}
            </p>
            {(langues.length > 0 || logiciels.length > 0) && (
              <p className="text-se-muted">{[langues.join(', '), logiciels.join(', ')].filter(Boolean).join(' · ')}</p>
            )}
            {system !== 'employe' && (
              <p className="font-semibold text-se-ink">
                {system === 'freelance'
                  ? `${devisTTC} € TTC engagés dès validation · ${effectiveRate} €/h.`
                  : `Jusqu’à ≈ ${devisTTC} € TTC si la cascade va aux auto-entrepreneurs · ${effectiveRate} €/h.`}
              </p>
            )}
            {(boost || relance || autoValidate) && system !== 'employe' && (
              <p className="text-se-muted">
                {[
                  boost && `boost +${BOOST} €/h`,
                  relance && 'relance par appel',
                  autoValidate && 'validation automatique',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </ConfirmGuard>
        )}
      </div>
    </div>
  );
}

const selectCls =
  'w-full h-10 rounded-se-sm border border-se-line bg-se-surface px-3 text-sm text-se-ink focus:outline-none focus:border-se-blue';
const textareaCls =
  'w-full rounded-se-sm border border-se-line bg-se-surface px-3 py-2 text-sm text-se-ink focus:outline-none focus:border-se-blue resize-none';

const timeCls =
  'h-8 w-[94px] rounded-se-sm border border-se-line bg-se-surface px-1.5 text-sm text-se-ink focus:outline-none focus:border-se-blue';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
/** « lun. 3 nov. » */
function fmtDayShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Titre d'étape : pastille numérotée + libellé, pour lire le panneau d'un coup d'œil. */
function SectionTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className={`flex items-center gap-2 se-eyebrow ${n > 1 ? 'pt-4 border-t border-se-line' : ''}`}>
      <span className="w-5 h-5 rounded-full bg-se-ink text-white text-[11px] font-bold grid place-items-center normal-case">
        {n}
      </span>
      {children}
    </p>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="se-eyebrow block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Stepper({
  value,
  onChange,
  min = 1,
  max = Infinity,
  suffix = '',
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center h-10 rounded-se-sm border border-se-line bg-se-surface">
      <button
        type="button"
        aria-label="Moins"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-9 h-full grid place-items-center text-se-muted hover:text-se-ink text-lg disabled:opacity-30"
      >
        −
      </button>
      <span className="flex-1 text-center text-sm font-semibold text-se-ink tabular-nums">
        {value}
        {suffix}
      </span>
      <button
        type="button"
        aria-label="Plus"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-9 h-full grid place-items-center text-se-muted hover:text-se-ink text-lg disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

function Toggle({
  icon,
  label,
  hint,
  on,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="w-full flex items-center gap-3 text-left"
    >
      <span className="text-se-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="text-sm font-semibold text-se-ink block">{label}</span>
        <span className="text-xs text-se-muted">{hint}</span>
      </span>
      <span className={`w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-se-blue' : 'bg-se-line'} relative`}>
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-4' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}
