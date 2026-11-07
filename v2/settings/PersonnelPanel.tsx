/**
 * Personnel fixe & bassin de talents.
 *  · Les FIXES (CDI, CDD, apprenti·e) : rangés par département, avec poste,
 *    tarif horaire brut (repris dans le relevé d'heures), heures hebdo et jours
 *    de repos. Ils sont programmés AUTOMATIQUEMENT sur leurs jours de travail
 *    par Optimiser et le prédictif, jamais en repos ni en congés ; chacun peut
 *    être sorti de la programmation automatique.
 *  · Le BASSIN DE TALENTS : les renforts connus (CDD d'usage, intérim avec son
 *    agence), appelés en deuxième quand il manque du monde. Pas de repos fixe :
 *    ils se proposent ou vous les placez.
 * Ajouter quelqu'un : un nom, un poste, un contrat — c'est tout.
 */
import { useState } from 'react';
import { Plus, Trash2, Sparkles, UserPlus, ShieldAlert, FileText, Lock, Heart } from 'lucide-react';
import { useV2Ui } from '@/stores/v2UiStore';
import { UpgradeDialog } from './UpgradeDialog';
import { planLimits, planName, isUnlimited, limitLabel, nextPlan } from '../plan';
import {
  useV2Settings,
  DAY_LONG,
  DEPARTMENTS,
  POOL_CONTRACTS,
  salaryRateOf,
  contractHoursPerWeek,
  NO_WISHES,
  wishPhrase,
} from '@/stores/v2SettingsStore';
import { MOCK_TODAY } from '@/mocks/v2Today';
import { hoursPlacedInWeek, restIssues, weekStartOf } from '../planning/weekPlan';
import type { Contract, ContractShift, Department, StaffRule, PoolRule, PoolContract } from '@/stores/v2SettingsStore';
import { useMissionStore, effPlaced, effMissions } from '../mission/missionStore';
import { Avatar } from '../Avatar';
import { Drawer } from './Drawer';
import { DayPicker, Segmented, Stepper, Toggle, inputCls } from './controls';
import { parseISO } from '../time';

const CONTRACTS: Contract[] = ['CDI', 'CDD', 'Apprenti·e'];
/** Lundi → dimanche, pour lire les jours travaillés dans l'ordre de la semaine. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
/** Semaine en cours (celle d'aujourd'hui), pour « cette semaine » dans la fiche. */
const THIS_WEEK = weekStartOf(MOCK_TODAY);

export function PersonnelPanel({ onClose }: { onClose: () => void }) {
  useMissionStore(); // les conflits suivent les placements en direct
  const staff = useV2Settings((s) => s.staff);
  const postesConfig = useV2Settings((s) => s.postes);
  const updateStaff = useV2Settings((s) => s.updateStaff);
  const addStaff = useV2Settings((s) => s.addStaff);
  const removeStaff = useV2Settings((s) => s.removeStaff);
  const pool = useV2Settings((s) => s.pool);
  const updatePool = useV2Settings((s) => s.updatePool);
  const addPool = useV2Settings((s) => s.addPool);
  const removePool = useV2Settings((s) => s.removePool);
  const restRules = useV2Settings((s) => s.restRules);
  const setRestRules = useV2Settings((s) => s.setRestRules);

  const [adding, setAdding] = useState<'staff' | 'pool' | null>(null);
  // Formule : combien d'employés (fixes + bassin) elle permet.
  const plan = useV2Ui((s) => s.plan);
  const employeeLimit = planLimits(plan).employees;
  const employees = staff.length + pool.length;
  const employeesAtLimit = !isUnlimited(employeeLimit) && employees >= employeeLimit;
  const [upgrading, setUpgrading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const totalHours = staff.reduce((s, r) => s + r.weeklyHours, 0);
  const autoCount = staff.filter((r) => r.autoSchedule !== false).length;
  // Noms de créneaux connus : ceux des Réglages › Postes (Service, Matin, Soir…).
  const slotNames = Array.from(new Set(postesConfig.flatMap((p) => p.slots.map((sl) => sl.label)).filter(Boolean)));
  const byDepartment = DEPARTMENTS.map((d) => ({
    department: d,
    rows: staff.filter((r) => r.department === d),
  })).filter((g) => g.rows.length > 0);

  return (
    <Drawer
      title="Personnel fixe & bassin de talents"
      subtitle="Vos fixes, programmés automatiquement sur leurs jours ; vos renforts, appelés quand il manque du monde."
      onClose={onClose}
      wide
      footer={
        adding === 'staff' ? (
          <AddStaffForm
            postesConfig={postesConfig}
            onCancel={() => setAdding(null)}
            onAdd={(rule) => {
              addStaff(rule);
              setAdding(null);
            }}
          />
        ) : adding === 'pool' ? (
          <AddPoolForm
            postes={postesConfig.map((p) => p.poste)}
            onCancel={() => setAdding(null)}
            onAdd={(rule) => {
              addPool(rule);
              setAdding(null);
            }}
          />
        ) : employeesAtLimit ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-se-ink">
            <Lock className="w-4 h-4 text-se-muted shrink-0" aria-hidden="true" />
            <span>
              Formule {planName(plan)} : {limitLabel(employeeLimit, 'employé')}, vous en avez {employees}.
              {nextPlan(plan, 'employees')
                ? ` Pour en ajouter, passez à ${planName(nextPlan(plan, 'employees')!)}.`
                : ''}
            </span>
            <button
              type="button"
              onClick={() => setUpgrading(true)}
              className="ml-auto text-sm font-semibold text-se-blue-ink hover:text-se-blue"
            >
              Voir les formules ›
            </button>
            {upgrading && (
              <UpgradeDialog
                onClose={() => setUpgrading(false)}
                reason={`Formule ${planName(plan)} : ${limitLabel(employeeLimit, 'employé')}. Choisissez une formule qui en permet plus.`}
              />
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAdding('staff')}
              className="inline-flex items-center justify-center gap-1.5 py-3 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
            >
              <Plus className="w-4 h-4" aria-hidden="true" /> Ajouter un fixe
            </button>
            <button
              type="button"
              onClick={() => setAdding('pool')}
              className="inline-flex items-center justify-center gap-1.5 py-3 rounded-se-sm text-sm font-semibold bg-se-extra text-white hover:opacity-90"
            >
              <UserPlus className="w-4 h-4" aria-hidden="true" /> Ajouter au bassin de talents
            </button>
          </div>
        )
      }
    >
      {/* ── Les fixes ─────────────────────────────────────────── */}
      <div className="flex items-start gap-2 rounded-se bg-se-blue-wash/50 px-3.5 py-3 mb-4">
        <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-se-blue-ink" aria-hidden="true" />
        <p className="text-sm text-se-ink">
          <span className="font-semibold">Fixes · CDI, CDD, apprenti·e</span> — {staff.length} personne
          {staff.length > 1 ? 's' : ''}, {totalHours} h hebdo. {autoCount === staff.length ? 'Toutes' : `${autoCount}`}{' '}
          programmée{autoCount > 1 ? 's' : ''} automatiquement : leurs <b>horaires du contrat</b> se posent seuls sur
          chaque semaine, <b>Optimiser</b> et le prédictif complètent sur leurs jours de travail — jamais un jour de
          repos ni en congés, jamais au-delà des heures du contrat ni des règles de repos ci-dessous.
        </p>
      </div>

      {/* ── Règles de repos : ce que le planning ne dépasse jamais ── */}
      <section className="rounded-se border border-se-line bg-se-surface p-3.5 mb-5">
        <p className="se-eyebrow mb-1 inline-flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" /> Règles de repos
        </p>
        <p className="text-xs text-se-muted mb-3">
          Optimiser et le préremplissage ne placent jamais au-delà ; le planning signale en rouge ce qui les enfreint
          déjà (« Repos non respecté »).
        </p>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-se-ink">Repos entre deux journées</span>
            <Stepper
              value={restRules.minRestHours}
              onChange={(minRestHours) => setRestRules({ minRestHours })}
              min={8}
              max={16}
              suffix="h"
              label="Repos minimal entre deux journées de travail"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-se-ink">Jours de travail d'affilée au plus</span>
            <Stepper
              value={restRules.maxConsecutiveDays}
              onChange={(maxConsecutiveDays) => setRestRules({ maxConsecutiveDays })}
              min={3}
              max={7}
              suffix="j"
              label="Jours de travail d'affilée au maximum"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-se-ink">Jours de repos par semaine</span>
            <Stepper
              value={restRules.restDaysPerWeek}
              onChange={(restDaysPerWeek) => setRestRules({ restDaysPerWeek })}
              min={1}
              max={3}
              suffix="j"
              label="Jours de repos par semaine"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-se-ink">Amplitude maximale d'une journée</span>
            <Stepper
              value={restRules.maxDailySpanHours}
              onChange={(maxDailySpanHours) => setRestRules({ maxDailySpanHours })}
              min={10}
              max={14}
              suffix="h"
              label="Amplitude maximale d'une journée"
            />
          </div>
        </div>
      </section>

      {byDepartment.map(({ department, rows }) => (
        <section key={department} className="mb-5">
          <p className="se-eyebrow mb-2">
            {department} <span className="normal-case tracking-normal font-semibold">· {rows.length}</span>
          </p>
          <ul className="space-y-3">
            {rows.map((rule) => {
              // Missions où la personne est placée un jour de repos.
              const conflicts = effMissions().filter(
                (m) =>
                  rule.restDays.includes(parseISO(m.date).getDay()) &&
                  effPlaced(m).some((p) => p.name === rule.name && !p.suggested),
              );
              const person = { id: rule.personId, name: rule.name, kind: 'salarie' as const };
              const hoursThisWeek = Math.round(hoursPlacedInWeek(effMissions(), rule.name, THIS_WEEK) * 10) / 10;
              const posteOptions = postesConfig.filter((p) => p.department === rule.department).map((p) => p.poste);
              // Horaires du contrat : une ligne par créneau des postes que la personne tient.
              const contractRows = rule.postes.flatMap((poste) =>
                (postesConfig.find((p) => p.poste === poste)?.slots ?? []).map((sl) => ({
                  poste,
                  label: sl.label,
                  start: sl.start,
                  end: sl.end,
                })),
              );
              const scheduledDays = (row: { poste: string; label: string }) =>
                (rule.schedule ?? []).filter((c) => c.poste === row.poste && c.label === row.label).map((c) => c.day);
              const setScheduledDays = (row: (typeof contractRows)[number], days: number[]) => {
                const others = (rule.schedule ?? []).filter((c) => !(c.poste === row.poste && c.label === row.label));
                const added: ContractShift[] = days.map((day) => ({ day, ...row }));
                // Un jour d'horaires fixes n'est jamais un jour de repos.
                updateStaff(rule.personId, {
                  schedule: [...others, ...added],
                  restDays: rule.restDays.filter((d) => !days.includes(d)),
                });
              };
              const fixedHours = contractHoursPerWeek(rule);
              const issues = restIssues(effMissions(), rule.name, THIS_WEEK, restRules);
              return (
                <li key={rule.personId} className="rounded-se border border-se-line bg-se-surface p-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar person={person} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-se-ink truncate">{rule.name}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        <select
                          value={rule.postes[0] ?? ''}
                          onChange={(e) => updateStaff(rule.personId, { postes: [e.target.value] })}
                          className="text-xs text-se-muted bg-transparent -ml-0.5 focus:outline-none"
                          aria-label={`Poste de ${rule.name}`}
                        >
                          {[...new Set([...(rule.postes[0] ? [rule.postes[0]] : []), ...posteOptions])].map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                        </select>
                        <span className="text-xs text-se-muted">·</span>
                        <select
                          value={rule.department}
                          onChange={(e) => updateStaff(rule.personId, { department: e.target.value as Department })}
                          className="text-xs text-se-muted bg-transparent focus:outline-none"
                          aria-label={`Département de ${rule.name}`}
                        >
                          {DEPARTMENTS.map((d) => (
                            <option key={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <select
                      value={rule.contract}
                      onChange={(e) => updateStaff(rule.personId, { contract: e.target.value as Contract })}
                      className={`${inputCls} h-8 px-2`}
                      aria-label={`Contrat de ${rule.name}`}
                    >
                      {CONTRACTS.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    {confirmRemove === rule.personId ? (
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="text-se-muted">Retirer ?</span>
                        <button
                          type="button"
                          onClick={() => {
                            removeStaff(rule.personId);
                            setConfirmRemove(null);
                          }}
                          className="px-2 py-1 rounded-se-sm font-semibold bg-se-danger text-white"
                        >
                          Oui
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemove(null)}
                          className="px-2 py-1 rounded-se-sm font-semibold text-se-muted hover:bg-se-surface-2"
                        >
                          Non
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(rule.personId)}
                        aria-label={`Retirer ${rule.name} du personnel fixe`}
                        className="w-8 h-8 grid place-items-center rounded-se-sm text-se-muted hover:text-se-danger hover:bg-se-danger-wash"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-[1fr_auto_auto] gap-x-6 gap-y-3 mt-3.5 pt-3.5 border-t border-se-line/70">
                    <div>
                      <p className="se-eyebrow mb-1.5">Jours de repos</p>
                      <DayPicker
                        value={rule.restDays}
                        onChange={(restDays) => updateStaff(rule.personId, { restDays })}
                        tone="ink"
                      />
                      <p className="text-xs text-se-muted mt-1.5">
                        {rule.restDays.length === 0
                          ? 'Aucun jour de repos fixe · '
                          : `Repos ${rule.restDays
                              .slice()
                              .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
                              .map((d) => DAY_LONG[d])
                              .join(' et ')} · `}
                        travaille{' '}
                        {WEEK_ORDER.filter((d) => !rule.restDays.includes(d))
                          .map((d) => DAY_LONG[d].slice(0, 3))
                          .join(', ')}
                        .
                      </p>
                      <label className="mt-2 inline-flex items-center gap-2 text-xs text-se-ink">
                        <Toggle
                          on={rule.autoSchedule !== false}
                          onChange={(autoSchedule) => updateStaff(rule.personId, { autoSchedule })}
                          label={`Programmation automatique de ${rule.name}`}
                        />
                        <span>
                          Programmation automatique
                          <span className="block text-se-muted">
                            {rule.autoSchedule !== false
                              ? 'Optimiser le·la place sur ses jours de travail.'
                              : 'Jamais placé·e automatiquement : vous le·la placez vous-même.'}
                          </span>
                        </span>
                      </label>
                    </div>
                    <div>
                      <p className="se-eyebrow mb-1.5">Tarif horaire brut</p>
                      <Stepper
                        value={rule.hourlyRate}
                        onChange={(hourlyRate) => updateStaff(rule.personId, { hourlyRate })}
                        min={11}
                        max={60}
                        suffix="€/h"
                        label={`Tarif horaire de ${rule.name}`}
                      />
                    </div>
                    <div>
                      <p className="se-eyebrow mb-1.5">Heures par semaine</p>
                      <Stepper
                        value={rule.weeklyHours}
                        onChange={(weeklyHours) => updateStaff(rule.personId, { weeklyHours })}
                        min={8}
                        max={48}
                        suffix="h"
                        label={`Heures hebdo de ${rule.name}`}
                      />
                      <p
                        className={`text-xs mt-1.5 tabular-nums ${hoursThisWeek > rule.weeklyHours ? 'text-se-danger font-semibold' : 'text-se-muted'}`}
                      >
                        Cette semaine : {hoursThisWeek} h placées
                        {hoursThisWeek > rule.weeklyHours ? ' · au-delà du contrat' : ''}
                      </p>
                    </div>
                    <div className="sm:col-span-3">
                      <p className="se-eyebrow mb-1.5 inline-flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Horaires du contrat
                      </p>
                      {contractRows.length === 0 ? (
                        <p className="text-xs text-se-muted">
                          Aucun créneau sur ses postes dans Réglages › Postes : ajoutez-en un pour fixer ses horaires.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {contractRows.map((row) => (
                            <li
                              key={`${row.poste}-${row.label}`}
                              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
                            >
                              <span className="min-w-[200px] text-se-ink">
                                <span className="font-semibold">{row.poste}</span>
                                <span className="text-se-muted">
                                  {' '}
                                  · {row.label} {row.start}–{row.end}
                                </span>
                              </span>
                              <DayPicker
                                value={scheduledDays(row)}
                                onChange={(days) => setScheduledDays(row, days)}
                                size="sm"
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="text-xs text-se-muted mt-1.5">
                        {fixedHours === 0
                          ? 'Aucun horaire fixe : Optimiser le·la place là où il manque du monde, sur ses jours de travail.'
                          : `${fixedHours} h fixes par semaine, posées seules sur le planning` +
                            (fixedHours < rule.weeklyHours
                              ? ` · ${Math.round((rule.weeklyHours - fixedHours) * 10) / 10} h restent à placer par Optimiser.`
                              : fixedHours > rule.weeklyHours
                                ? ' · au-delà des heures du contrat.'
                                : '.')}
                      </p>
                    </div>
                    <div className="sm:col-span-3">
                      <p className="se-eyebrow mb-1.5">Créneaux habituels</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {slotNames.map((name) => {
                          const on = (rule.slots ?? []).includes(name);
                          return (
                            <button
                              key={name}
                              type="button"
                              aria-pressed={on}
                              onClick={() =>
                                updateStaff(rule.personId, {
                                  slots: on
                                    ? (rule.slots ?? []).filter((x) => x !== name)
                                    : [...(rule.slots ?? []), name],
                                })
                              }
                              className={`h-7 px-2.5 rounded-full border text-xs font-semibold transition-colors ${
                                on
                                  ? 'bg-se-blue text-white border-se-blue'
                                  : 'bg-se-surface text-se-muted border-se-line hover:border-se-muted'
                              }`}
                            >
                              {name}
                            </button>
                          );
                        })}
                        <span className="text-xs text-se-muted ml-1">
                          {(rule.slots ?? []).length === 0
                            ? "N'importe quel créneau."
                            : `Servi·e d'abord sur ${(rule.slots ?? []).join(' et ')}, ailleurs s'il manque du monde.`}
                        </span>
                      </div>
                    </div>
                    <div className="sm:col-span-3">
                      <p className="se-eyebrow mb-1.5 inline-flex items-center gap-1.5">
                        <Heart className="w-3.5 h-3.5" aria-hidden="true" /> Souhaits
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                        <span className="inline-flex items-center gap-2">
                          <span className="text-se-muted">Jours à éviter</span>
                          <DayPicker
                            value={rule.wishes?.avoidDays ?? []}
                            onChange={(avoidDays) =>
                              updateStaff(rule.personId, { wishes: { ...(rule.wishes ?? NO_WISHES), avoidDays } })
                            }
                            size="sm"
                          />
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <span className="text-se-muted">Heures</span>
                          <Segmented
                            value={rule.wishes?.hours ?? 'contrat'}
                            onChange={(v) =>
                              updateStaff(rule.personId, {
                                wishes: { ...(rule.wishes ?? NO_WISHES), hours: v === 'contrat' ? null : v },
                              })
                            }
                            options={[
                              { key: 'contrat', label: 'Comme le contrat' },
                              { key: 'plus', label: 'En veut plus' },
                              { key: 'moins', label: 'En veut moins' },
                            ]}
                          />
                        </span>
                      </div>
                      <p className="text-xs text-se-muted mt-1.5">
                        {wishPhrase(rule.wishes)}. Jamais un interdit : Optimiser sert d'abord ceux qui le souhaitent et
                        le dit quand il va contre.
                      </p>
                    </div>
                  </div>

                  {issues.length > 0 && (
                    <p className="mt-3 text-xs font-semibold text-se-danger bg-se-danger-wash rounded-se-sm px-2.5 py-1.5 inline-flex items-start gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                      <span>Repos non respecté cette semaine : {issues.join(' · ')}</span>
                    </p>
                  )}
                  {conflicts.length > 0 && (
                    <p className="mt-3 text-xs font-semibold text-se-danger bg-se-danger-wash rounded-se-sm px-2.5 py-1.5">
                      Placé·e un jour de repos :{' '}
                      {conflicts
                        .map(
                          (m) =>
                            `${parseISO(m.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })} (${m.poste})`,
                        )
                        .join(', ')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* ── Le bassin de talents ───────────────────────────────── */}
      <div className="flex items-start gap-2 rounded-se bg-se-extra-wash/60 px-3.5 py-3 mb-3 mt-6">
        <UserPlus className="w-4 h-4 mt-0.5 shrink-0 text-se-extra-ink" aria-hidden="true" />
        <p className="text-sm text-se-ink">
          <span className="font-semibold">Bassin de talents · CDD d’usage, intérim</span> — {pool.length} renfort
          {pool.length > 1 ? 's' : ''}. Appelés en deuxième, après vos fixes, quand il manque du monde. Pas de repos
          fixe : ils se proposent, ou vous les placez.
        </p>
      </div>
      {pool.length === 0 ? (
        <p className="text-sm text-se-muted border border-dashed border-se-line rounded-se p-4 text-center mb-5">
          Personne dans le bassin pour l'instant. Ajoutez vos extras habituels et vos intérimaires.
        </p>
      ) : (
        <ul className="space-y-2 mb-5">
          {pool.map((r) => {
            const person = { id: r.personId, name: r.name, kind: 'extra' as const };
            return (
              <li key={r.personId} className="rounded-se border border-se-line bg-se-surface p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar person={person} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-se-ink truncate">{r.name}</p>
                    <select
                      value={r.postes[0] ?? ''}
                      onChange={(e) => updatePool(r.personId, { postes: [e.target.value] })}
                      className="text-xs text-se-muted bg-transparent -ml-0.5 focus:outline-none"
                      aria-label={`Poste de ${r.name}`}
                    >
                      {[...new Set([...(r.postes[0] ? [r.postes[0]] : []), ...postesConfig.map((p) => p.poste)])].map(
                        (p) => (
                          <option key={p}>{p}</option>
                        ),
                      )}
                    </select>
                  </div>
                  <select
                    value={r.contract}
                    onChange={(e) => updatePool(r.personId, { contract: e.target.value as PoolContract })}
                    className={`${inputCls} h-8 px-2`}
                    aria-label={`Contrat de ${r.name}`}
                  >
                    {POOL_CONTRACTS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  {r.contract === 'Intérim' && (
                    <input
                      value={r.agency ?? ''}
                      onChange={(e) => updatePool(r.personId, { agency: e.target.value })}
                      placeholder="Agence d'intérim"
                      className={`${inputCls} h-8 px-2 w-40`}
                      aria-label={`Agence d'intérim de ${r.name}`}
                    />
                  )}
                  <Stepper
                    value={r.hourlyRate}
                    onChange={(hourlyRate) => updatePool(r.personId, { hourlyRate })}
                    min={11}
                    max={60}
                    suffix="€/h"
                    label={`Tarif horaire de ${r.name}`}
                  />
                  {confirmRemove === r.personId ? (
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="text-se-muted">Retirer ?</span>
                      <button
                        type="button"
                        onClick={() => {
                          removePool(r.personId);
                          setConfirmRemove(null);
                        }}
                        className="px-2 py-1 rounded-se-sm font-semibold bg-se-danger text-white"
                      >
                        Oui
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(null)}
                        className="px-2 py-1 rounded-se-sm font-semibold text-se-muted hover:bg-se-surface-2"
                      >
                        Non
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(r.personId)}
                      aria-label={`Retirer ${r.name} du bassin de talents`}
                      className="w-8 h-8 grid place-items-center rounded-se-sm text-se-muted hover:text-se-danger hover:bg-se-danger-wash"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-se-muted leading-relaxed">
        Le tarif horaire sert au montant du relevé d'heures. Les auto-entrepreneurs ne sont ni fixes ni dans le bassin :
        ils se proposent sur vos missions publiées et vous les validez.
      </p>
    </Drawer>
  );
}

/* ── Ajouter au bassin : nom, contrat (CDD d'usage / intérim + agence), poste, tarif ── */
function AddPoolForm({
  postes,
  onCancel,
  onAdd,
}: {
  postes: string[];
  onCancel: () => void;
  onAdd: (rule: PoolRule) => void;
}) {
  const [name, setName] = useState('');
  const [contract, setContract] = useState<PoolContract>('CDD d’usage');
  const [agency, setAgency] = useState('');
  const [poste, setPoste] = useState<string>(postes[0] ?? '');
  const [rate, setRate] = useState<number | null>(null);
  const effectiveRate = rate ?? salaryRateOf(poste);

  const submit = () => {
    const n = name.trim();
    if (!n || !poste) return;
    onAdd({
      personId: `x-${Date.now()}`,
      name: n,
      contract,
      agency: contract === 'Intérim' ? agency.trim() || undefined : undefined,
      postes: [poste],
      hourlyRate: effectiveRate,
    });
  };

  return (
    <div className="space-y-2.5">
      <p className="se-eyebrow">Nouveau renfort</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Prénom Nom"
          className={`${inputCls} flex-1 min-w-[160px]`}
          aria-label="Nom du renfort"
        />
        <select
          value={contract}
          onChange={(e) => setContract(e.target.value as PoolContract)}
          className={inputCls}
          aria-label="Contrat"
        >
          {POOL_CONTRACTS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {contract === 'Intérim' && (
          <input
            value={agency}
            onChange={(e) => setAgency(e.target.value)}
            placeholder="Agence d'intérim"
            className={`${inputCls} w-44`}
            aria-label="Agence d'intérim"
          />
        )}
        <select value={poste} onChange={(e) => setPoste(e.target.value)} className={inputCls} aria-label="Poste">
          {postes.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-sm text-se-muted">
          <input
            type="number"
            min={11}
            max={60}
            value={effectiveRate}
            onChange={(e) => setRate(Number(e.target.value))}
            className={`${inputCls} w-20`}
            aria-label="Tarif horaire brut"
          />
          €/h brut
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim() || !poste}
          className="px-4 h-9 rounded-se-sm text-sm font-semibold bg-se-extra text-white hover:opacity-90 disabled:opacity-40"
        >
          Ajouter
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 h-9 rounded-se-sm text-sm font-semibold text-se-muted hover:bg-se-surface-2"
        >
          Annuler
        </button>
        <span className="text-xs text-se-muted ml-auto">Proposé·e par Optimiser après vos fixes.</span>
      </div>
    </div>
  );
}

/* ── Ajouter du personnel : nom, département, poste, contrat, tarif ── */
function AddStaffForm({
  postesConfig,
  onCancel,
  onAdd,
}: {
  postesConfig: { poste: string; department: Department }[];
  onCancel: () => void;
  onAdd: (rule: StaffRule) => void;
}) {
  const [name, setName] = useState('');
  const [department, setDepartment] = useState<Department>('Restauration');
  const posteOptions = postesConfig.filter((p) => p.department === department).map((p) => p.poste);
  const [poste, setPoste] = useState<string>('');
  const [contract, setContract] = useState<Contract>('CDI');
  const chosenPoste = poste && posteOptions.includes(poste) ? poste : (posteOptions[0] ?? '');
  const [rate, setRate] = useState<number | null>(null);
  const effectiveRate = rate ?? salaryRateOf(chosenPoste);

  const submit = () => {
    const n = name.trim();
    if (!n || !chosenPoste) return;
    onAdd({
      personId: `s-${Date.now()}`,
      name: n,
      department,
      postes: [chosenPoste],
      hourlyRate: effectiveRate,
      restDays: [],
      weeklyHours: 35,
      contract,
      autoSchedule: true,
    });
  };

  return (
    <div className="space-y-2.5">
      <p className="se-eyebrow">Nouveau fixe · CDI, CDD ou apprenti·e</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Prénom Nom"
          className={`${inputCls} flex-1 min-w-[160px]`}
          aria-label="Nom du salarié"
        />
        <select
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value as Department);
            setPoste('');
          }}
          className={inputCls}
          aria-label="Département"
        >
          {DEPARTMENTS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select
          value={chosenPoste}
          onChange={(e) => setPoste(e.target.value)}
          className={inputCls}
          aria-label="Poste"
          disabled={posteOptions.length === 0}
        >
          {posteOptions.length === 0 ? (
            <option value="">Aucun poste dans ce département</option>
          ) : (
            posteOptions.map((p) => <option key={p}>{p}</option>)
          )}
        </select>
        <select
          value={contract}
          onChange={(e) => setContract(e.target.value as Contract)}
          className={inputCls}
          aria-label="Contrat"
        >
          {CONTRACTS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-sm text-se-muted">
          <input
            type="number"
            min={11}
            max={60}
            value={effectiveRate}
            onChange={(e) => setRate(Number(e.target.value))}
            className={`${inputCls} w-20`}
            aria-label="Tarif horaire brut"
          />
          €/h brut
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim() || !chosenPoste}
          className="px-4 h-9 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink disabled:opacity-40"
        >
          Ajouter
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 h-9 rounded-se-sm text-sm font-semibold text-se-muted hover:bg-se-surface-2"
        >
          Annuler
        </button>
        <span className="text-xs text-se-muted ml-auto">
          Repos, heures et horaires du contrat se règlent ensuite sur la fiche · programmé·e automatiquement.
        </span>
      </div>
    </div>
  );
}
