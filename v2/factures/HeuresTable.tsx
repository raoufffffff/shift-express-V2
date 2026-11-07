/**
 * Heures par shift — une ligne par personne et par mission de la période,
 * façon tableau de paie : approuvé, date, nom, arrivée, sortie, durée,
 * établissement, poste, montant.
 *  · Salariés et extras : l'arrivée et la sortie se corrigent d'un clic
 *    (liste d'heures par quart d'heure, l'heure prévue en repère).
 *  · Auto-entrepreneurs : rien n'est modifiable — c'est « au devis », la
 *    facture fait foi.
 *  · « Relevé d'heures à remplissage automatique » recopie les heures
 *    planifiées sur les lignes internes non validées (option : remplacer
 *    les pointages existants).
 *  · Les lignes sont celles du relevé partagé (missionStore) : l'onglet
 *    Relevé d'heures de la fenêtre de mission montre les mêmes.
 */
import { useMemo, useState } from 'react';
import {
  Lock,
  Wand2,
  X,
  Check,
  ChevronDown,
  AlertTriangle,
  FileSpreadsheet,
  Send,
  BadgeCheck,
  Trash2,
} from 'lucide-react';
import type { Mission, MissionPlaced } from '@/mocks/v2Missions';
import { useV2Settings, staffRuleOf, salaryRateOf } from '@/stores/v2SettingsStore';
import { useV2Ui } from '@/stores/v2UiStore';
import {
  useMissionStore,
  effPlaced,
  effMissions,
  effTimesheet,
  writeTimesheet,
  restoreTimesheetLines,
} from '../mission/missionStore';
import type { TimesheetLine } from '../mission/missionStore';
import { ProfileWindow } from '../mission/ProfileWindow';
import { ConfirmGuard } from '../publish/ConfirmGuard';
import { personKindStyle } from '../coverage';
import { Avatar } from '../Avatar';
import { minutesBetween, formatDuration, missionTimeLabel, missionMinutes, parseISO } from '../time';
import { inRange } from './PeriodPicker';
import type { DateRange } from './PeriodPicker';

interface Row {
  key: string;
  mission: Mission;
  person: MissionPlaced;
  internal: boolean;
}

/** Où part le relevé une fois approuvé. */
export type ExportFormat = 'excel' | 'silae' | 'payfit' | 'autre';
export const EXPORT_LABEL: Record<ExportFormat, string> = {
  excel: 'Excel',
  silae: 'Silae',
  payfit: 'Payfit',
  autre: 'Autre logiciel de paie',
};
/** Une ligne du relevé telle qu'elle part dans le fichier. */
export interface ExportRow {
  date: string;
  name: string;
  kind: string;
  in: string;
  out: string;
  minutes: number;
  establishment: string;
  poste: string;
  amount: number | null;
  internal: boolean;
}
/** Ce qui part : résumé du relevé approuvé, et ses lignes. */
export interface ExportSummary {
  lines: number;
  internalLines: number;
  minutes: number;
  paie: number;
  freelanceTTC: number;
  rows: ExportRow[];
}

/** Heures par quart d'heure, 00:00 → 23:45. */
const SLOTS = Array.from(
  { length: 96 },
  (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
);

export function HeuresTable({
  range,
  establishment = null,
  onExport,
}: {
  range: DateRange;
  /** un seul établissement (null = tous) */
  establishment?: string | null;
  /** relevé approuvé → Excel, Silae, Payfit ou autre */
  onExport: (format: ExportFormat, summary: ExportSummary) => void;
}) {
  const version = useMissionStore(); // les lignes suivent les placements en direct
  // Tarif horaire : celui de la fiche salarié (Réglages) sinon l'indicatif du poste.
  const staff = useV2Settings((s) => s.staff);
  const rateOf = (r: Row) => staffRuleOf(staff, r.person)?.hourlyRate ?? salaryRateOf(r.mission.poste);

  // Supprimer une ligne (personnel seulement) demande confirmation ; clic sur la
  // mission → sa fenêtre, clic sur la personne → sa fiche.
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [profile, setProfile] = useState<MissionPlaced | null>(null);
  const requestOpenMission = useV2Ui((s) => s.requestOpenMission);

  // Une ligne par personne placée (hors suggestions) sur la période, triée par date.
  const allRows = useMemo<Row[]>(() => {
    void version;
    return [...effMissions()]
      .filter((m) => inRange(m.date, range) && (!establishment || m.establishment === establishment))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
      .flatMap((mission) =>
        effPlaced(mission)
          .filter((p) => !p.suggested)
          .map((person) => ({
            key: `${mission.id}:${person.id}`,
            mission,
            person,
            internal: person.kind !== 'freelance',
          })),
      );
  }, [version, range, establishment]);
  // Les lignes sont celles du relevé partagé : la fenêtre de mission lit et écrit les mêmes.
  const report = (r: Row): TimesheetLine => effTimesheet(r.mission, r.person);
  const patch = (r: Row, p: Partial<TimesheetLine>) => writeTimesheet(r.mission, r.person, p);
  // Lignes retirées du relevé (personne absente, doublon…) : elles ne partent pas en paie.
  const removedCount = allRows.filter((r) => report(r).removed).length;
  const rows = allRows.filter((r) => !report(r).removed);

  const [autoFill, setAutoFill] = useState(false);
  const [filled, setFilled] = useState<number | null>(null);

  // Une ligne s'approuve seulement si elle est complète : arrivée ET sortie
  // pour un salarié / extra ; un auto-entrepreneur est « au devis », donc complet.
  const isComplete = (r: Row) => {
    const rep = report(r);
    return !r.internal || (!!rep.in && !!rep.out);
  };
  const incomplete = rows.filter((r) => !isComplete(r));
  const approvedCount = rows.filter((r) => report(r).approved).length;
  const totalMinutes = rows.reduce((s, r) => {
    const rep = report(r);
    return s + (rep.in && rep.out ? minutesBetween(rep.in, rep.out) : 0);
  }, 0);
  const amountOf = (r: Row): number | null => {
    const rep = report(r);
    if (!r.internal) return r.person.cost ?? null;
    return rep.in && rep.out ? Math.round((minutesBetween(rep.in, rep.out) / 60) * rateOf(r)) : null;
  };
  const allApproved = rows.length > 0 && approvedCount === rows.length;
  const summary: ExportSummary = {
    lines: rows.length,
    internalLines: rows.filter((r) => r.internal).length,
    minutes: totalMinutes,
    paie: rows.filter((r) => r.internal).reduce((s, r) => s + (amountOf(r) ?? 0), 0),
    freelanceTTC: rows.filter((r) => !r.internal).reduce((s, r) => s + (amountOf(r) ?? 0), 0),
    rows: rows.map((r) => {
      const rep = report(r);
      return {
        date: r.mission.date,
        name: r.person.name,
        kind: personKindStyle[r.person.kind].label,
        in: rep.in ?? '',
        out: rep.out ?? '',
        minutes: rep.in && rep.out ? minutesBetween(rep.in, rep.out) : 0,
        establishment: r.mission.establishment,
        poste: r.mission.poste,
        amount: amountOf(r),
        internal: r.internal,
      };
    }),
  };

  // Lignes que le remplissage automatique touchera.
  const eligible = (replace: boolean) =>
    rows.filter((r) => {
      if (!r.internal) return false;
      const rep = report(r);
      if (rep.approved) return false;
      return replace || !rep.in || !rep.out;
    });

  const runAutoFill = (replace: boolean) => {
    const targets = eligible(replace);
    // Avec une coupure, la sortie est la fin de la seconde partie.
    targets.forEach((r) => patch(r, { in: r.mission.start, out: r.mission.split?.end ?? r.mission.end }));
    setFilled(targets.length);
    setAutoFill(false);
  };

  // « Tout approuver » n'approuve que les lignes complètes.
  const completeRows = rows.filter(isComplete);
  const allCompleteApproved = completeRows.length > 0 && completeRows.every((r) => report(r).approved);
  const toggleAll = () => completeRows.forEach((r) => patch(r, { approved: !allCompleteApproved }));

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div>
          <p className="se-eyebrow">Heures par mission</p>
          <p className="text-sm text-se-muted">
            {approvedCount}/{rows.length} validés · {formatDuration(totalMinutes)} pointées
            {incomplete.length > 0 && (
              <span className="text-se-cascade-ink font-semibold"> · {incomplete.length} sans pointage</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAutoFill(true)}
          className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-se-sm text-sm font-semibold border border-se-line bg-se-surface text-se-ink hover:bg-se-surface-2"
        >
          <Wand2 className="w-4 h-4 text-se-blue-ink" aria-hidden="true" /> Relevé d'heures à remplissage automatique
        </button>
      </div>

      {filled !== null && (
        <p className="mb-3 text-sm text-se-success bg-se-success-wash rounded-se-sm px-3 py-2 inline-flex items-center gap-1.5">
          <Check className="w-4 h-4" aria-hidden="true" />
          {filled === 0
            ? 'Aucune ligne à remplir.'
            : `${filled} ligne${filled > 1 ? 's' : ''} remplie${filled > 1 ? 's' : ''} aux heures planifiées.`}
        </p>
      )}

      {/* Tableau en entier, sans défilement horizontal : colonnes en % de la
          largeur disponible, textes longs tronqués (infobulle au survol). */}
      <div className="bg-se-surface border border-se-line rounded-se shadow-se overflow-hidden">
        <table className="w-full table-fixed text-[13px]">
          <colgroup>
            <col style={{ width: '11%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '8.5%' }} />
            <col style={{ width: '8.5%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '11%' }} />
          </colgroup>
          <thead>
            <tr className="border-b border-se-line se-eyebrow text-left align-bottom">
              <th className="px-2 py-2.5">
                <label className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 cursor-pointer leading-tight">
                  <input
                    type="checkbox"
                    checked={allCompleteApproved}
                    disabled={completeRows.length === 0}
                    onChange={toggleAll}
                    className="accent-se-blue"
                    aria-label="Valider toutes les lignes complètes"
                    title="Valide toutes les lignes complètes"
                  />
                  Validé
                </label>
              </th>
              <th className="px-2 py-2.5">Date</th>
              <th className="px-2 py-2.5">Nom</th>
              <th className="px-2 py-2.5">Arrivée</th>
              <th className="px-2 py-2.5">Sortie</th>
              <th className="px-2 py-2.5">Durée</th>
              <th className="px-2 py-2.5">Lieu</th>
              <th className="px-2 py-2.5">Poste</th>
              <th className="px-2 py-2.5 text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rep = report(r);
              const k = personKindStyle[r.person.kind];
              const mins = rep.in && rep.out ? minutesBetween(rep.in, rep.out) : null;
              const planned = missionMinutes(r.mission);
              const editable = r.internal && !rep.approved;
              const complete = isComplete(r);
              const amount = amountOf(r);
              return (
                <tr
                  key={r.key}
                  className={`border-b border-se-line last:border-0 ${
                    rep.approved ? 'bg-se-success-wash/30' : !complete ? 'bg-se-cascade-wash/30' : ''
                  }`}
                >
                  <td className="px-2 py-2 align-middle">
                    <span
                      className="inline-flex items-center gap-1"
                      title={
                        complete ? undefined : "Remplissez l'arrivée et la sortie, ou retirez la ligne, pour valider"
                      }
                    >
                      <input
                        type="checkbox"
                        checked={rep.approved}
                        disabled={!complete}
                        onChange={(e) => patch(r, { approved: e.target.checked })}
                        className="accent-se-blue disabled:opacity-40"
                        aria-label={`Valider ${r.person.name} le ${r.mission.date}`}
                      />
                      {!complete && <AlertTriangle className="w-3.5 h-3.5 text-se-cascade-ink" aria-hidden="true" />}
                    </span>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => requestOpenMission(r.mission.id)}
                      title="Ouvrir la mission"
                      className="text-left hover:text-se-blue-ink"
                    >
                      <span className="block font-semibold text-se-ink">
                        {parseISO(r.mission.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                      </span>
                      <span className="block text-[11px] text-se-muted">
                        {parseISO(r.mission.date).toLocaleDateString('fr-FR', { weekday: 'long' })}
                      </span>
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => setProfile(r.person)}
                      title="Ouvrir la fiche"
                      className="flex items-center gap-2 min-w-0 max-w-full text-left group"
                    >
                      <Avatar person={r.person} size={24} />
                      <span className="min-w-0">
                        <span
                          className="block font-semibold text-se-ink truncate group-hover:text-se-blue-ink"
                          title={r.person.name}
                        >
                          {r.person.name}
                        </span>
                        <span className={`block text-[10px] leading-tight ${k.text}`}>{k.label}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    <TimeCell
                      planned={r.mission.start}
                      value={rep.in}
                      editable={editable}
                      locked={!r.internal}
                      onChange={(v) => patch(r, { in: v })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <TimeCell
                      planned={r.mission.split?.end ?? r.mission.end}
                      value={rep.out}
                      editable={editable}
                      locked={!r.internal}
                      onChange={(v) => patch(r, { out: v })}
                    />
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {mins !== null ? (
                      <>
                        <span className="block font-semibold text-se-ink">{formatDuration(mins)}</span>
                        <span className="block text-[11px] text-se-muted" title="Durée prévue">
                          ({formatDuration(planned)})
                        </span>
                      </>
                    ) : (
                      <span className="text-se-muted">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-se-ink truncate" title={r.mission.establishment}>
                    <button
                      type="button"
                      onClick={() => requestOpenMission(r.mission.id)}
                      title="Ouvrir la mission"
                      className="truncate max-w-full text-left hover:text-se-blue-ink"
                    >
                      {r.mission.establishment}
                    </button>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => requestOpenMission(r.mission.id)}
                      title="Ouvrir la mission"
                      className="text-left max-w-full hover:text-se-blue-ink"
                    >
                      <span className="block text-se-ink truncate" title={r.mission.poste}>
                        {r.mission.poste}
                      </span>
                      <span className="block text-[11px] text-se-muted truncate">
                        {missionTimeLabel(r.mission)} · {formatDuration(planned)}
                      </span>
                    </button>
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {r.internal ? (
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <span className="font-semibold text-se-ink">{amount !== null ? `${amount} €` : '—'}</span>
                        {/* Supprimer la ligne : personnel seulement, avec confirmation */}
                        {!rep.approved && (
                          <button
                            type="button"
                            onClick={() => setDeleting(r)}
                            aria-label={`Supprimer la ligne de ${r.person.name} le ${r.mission.date}`}
                            title="Supprimer cette ligne du relevé"
                            className="w-7 h-7 grid place-items-center rounded-se-sm text-se-muted hover:text-se-danger hover:bg-se-danger-wash"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                    ) : (
                      <span className="block font-semibold text-se-freelance-ink">
                        {amount !== null ? `${amount} €` : '—'}
                        <span className="block text-[11px] font-normal text-se-muted">TTC · au devis</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Supprimer une ligne : on confirme (personnel seulement ; un auto-entrepreneur est au devis) */}
      {deleting && (
        <div className="fixed inset-0 z-50">
          <ConfirmGuard
            title="Êtes-vous sûr de vouloir supprimer ?"
            tone="danger"
            confirmLabel="Supprimer"
            onCancel={() => setDeleting(null)}
            onConfirm={() => {
              patch(deleting, { removed: true });
              setDeleting(null);
            }}
          >
            <p>
              La ligne de <strong>{deleting.person.name}</strong> ({deleting.mission.poste} ·{' '}
              {parseISO(deleting.mission.date).toLocaleDateString('fr-FR')}) sort du relevé d’heures : elle ne partira
              pas en paie.
            </p>
            <p className="text-se-muted">La mission elle-même n’est pas touchée. Vous pourrez la remettre.</p>
          </ConfirmGuard>
        </div>
      )}
      {profile && <ProfileWindow person={profile} onClose={() => setProfile(null)} />}
      <p className="text-xs text-se-muted mt-2">
        Les heures des auto-entrepreneurs ne se modifient pas : la facture au devis fait foi. Une ligne validée est
        verrouillée.
        {removedCount > 0 && (
          <>
            {' '}
            {removedCount} ligne{removedCount > 1 ? 's' : ''} supprimée{removedCount > 1 ? 's' : ''} du relevé.{' '}
            <button
              type="button"
              onClick={restoreTimesheetLines}
              className="font-semibold text-se-blue-ink hover:text-se-blue"
            >
              Tout remettre
            </button>
          </>
        )}
      </p>

      {/* Et après : approuver tout, puis envoyer en paie */}
      {rows.length > 0 &&
        (allApproved ? (
          <div className="mt-4 rounded-se border border-se-success/40 bg-se-success-wash/40 p-4">
            <p className="inline-flex items-center gap-1.5 font-semibold text-se-ink">
              <BadgeCheck className="w-4 h-4 text-se-success" aria-hidden="true" /> Relevé validé
              <span className="font-normal text-se-muted">
                · {rows.length} ligne{rows.length > 1 ? 's' : ''} · {formatDuration(totalMinutes)} · paie {summary.paie}{' '}
                €
              </span>
            </p>
            <p className="text-xs text-se-muted mt-0.5 mb-3">Où envoyer les heures ?</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onExport('excel', summary)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
              >
                <FileSpreadsheet className="w-4 h-4" aria-hidden="true" /> Télécharger Excel
              </button>
              {(['silae', 'payfit', 'autre'] as ExportFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onExport(f, summary)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-se-sm text-sm font-semibold border border-se-line bg-se-surface text-se-ink hover:bg-se-surface-2"
                >
                  <Send className="w-4 h-4 text-se-blue-ink" aria-hidden="true" />
                  {f === 'autre' ? 'Autre logiciel…' : `Envoyer à ${EXPORT_LABEL[f]}`}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-4 inline-flex items-start gap-1.5 text-sm text-se-muted rounded-se-sm border border-dashed border-se-line px-3 py-2.5">
            {incomplete.length > 0 ? (
              <>
                <AlertTriangle className="w-4 h-4 text-se-cascade-ink mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  <b className="text-se-ink">
                    {incomplete.length} ligne{incomplete.length > 1 ? 's' : ''} sans pointage
                  </b>{' '}
                  : remplissez l'arrivée et la sortie (ou utilisez le remplissage automatique), ou retirez-les. Ensuite,
                  validez tout pour envoyer en paie.
                </span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 text-se-success mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Toutes les lignes sont complètes. Validez-les ({rows.length - approvedCount} restante
                  {rows.length - approvedCount > 1 ? 's' : ''}) pour télécharger l'Excel ou envoyer à Silae, Payfit…
                </span>
              </>
            )}
          </p>
        ))}

      {autoFill && <AutoFillDialog count={eligible} onClose={() => setAutoFill(false)} onRun={runAutoFill} />}
    </section>
  );
}

/* ── Cellule d'heure : prévu en repère, réel modifiable d'un clic ── */
function TimeCell({
  planned,
  value,
  editable,
  locked,
  onChange,
}: {
  planned: string;
  value?: string;
  editable: boolean;
  locked: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const content = (
    <>
      <span className={`block font-semibold ${value ? 'text-se-ink' : 'text-se-muted'}`}>{value ?? '—'}</span>
      <span className="block text-[11px] text-se-muted">{planned}</span>
    </>
  );
  if (!editable) {
    return (
      <span
        className="inline-flex items-start gap-1 max-w-full"
        title={locked ? 'Au devis — non modifiable' : 'Validé — verrouillé'}
      >
        <span>{content}</span>
        <Lock className="w-3 h-3 text-se-muted mt-1" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-left rounded-se-sm px-1 py-0.5 -mx-1 hover:bg-se-surface-2 inline-flex items-start gap-0.5 max-w-full"
        aria-label={`Modifier l'heure (prévu ${planned})`}
      >
        <span>{content}</span>
        <ChevronDown className="w-3 h-3 text-se-muted mt-1" aria-hidden="true" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <ul
            className="absolute z-30 top-full left-0 mt-1 w-24 max-h-56 overflow-y-auto rounded-se-sm border border-se-line bg-se-surface shadow-se-md py-1"
            ref={(el) => {
              // On ouvre la liste sur l'heure réelle, sinon sur l'heure prévue.
              const target = el?.querySelector<HTMLElement>('[data-focus="1"]');
              if (el && target) el.scrollTop = Math.max(target.offsetTop - 80, 0);
            }}
          >
            {SLOTS.map((t) => {
              const isValue = t === value;
              const isPlanned = t === planned;
              return (
                <li key={t}>
                  <button
                    type="button"
                    data-focus={isValue || (!value && isPlanned) ? '1' : undefined}
                    onClick={() => {
                      onChange(t);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-se-surface-2 ${
                      isValue
                        ? 'bg-se-blue-wash text-se-blue-ink font-semibold'
                        : isPlanned
                          ? 'text-se-ink font-semibold'
                          : 'text-se-ink'
                    }`}
                  >
                    {t}
                    {isPlanned && <span className="ml-1 text-[10px] text-se-muted">prévu</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </span>
  );
}

/* ── Remplissage automatique ───────────────────────────────── */
function AutoFillDialog({
  count,
  onClose,
  onRun,
}: {
  count: (replace: boolean) => Row[];
  onClose: () => void;
  onRun: (replace: boolean) => void;
}) {
  const [fromPlanned, setFromPlanned] = useState(true);
  const [replace, setReplace] = useState(false);
  const n = count(replace).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-se-ink/40" />
      <div className="se-root relative w-full max-w-md bg-se-surface rounded-se shadow-se-md p-5">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="w-5 h-5 text-se-blue-ink" aria-hidden="true" />
          <h3 className="text-base font-extrabold text-se-ink">Relevé d'heures à remplissage automatique</h3>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="ml-auto w-7 h-7 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-se-ink bg-se-cascade-wash rounded-se-sm px-3 py-2 mb-4">
          <b>Veuillez noter !</b> Le remplissage automatique ne remplira pas les heures des lignes déjà validées.
        </p>

        <p className="se-eyebrow mb-2">Remplir aux heures programmées :</p>
        <div className="space-y-2.5 mb-4">
          <label className="flex items-start gap-2.5 text-sm text-se-ink cursor-pointer">
            <input
              type="checkbox"
              checked={fromPlanned}
              onChange={(e) => setFromPlanned(e.target.checked)}
              className="accent-se-blue mt-0.5"
            />
            <span>Remplissage automatique du relevé d'heures en fonction des heures planifiées</span>
          </label>
          <label className="flex items-start gap-2.5 text-sm text-se-ink cursor-pointer">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
              className="accent-se-blue mt-0.5"
            />
            <span>
              Remplacer les relevés d'heures existants
              <span className="block text-xs text-se-muted">Sinon, seules les lignes sans pointage sont remplies.</span>
            </span>
          </label>
        </div>

        <p className="text-xs text-se-muted mb-4">
          Concerne uniquement vos salariés et extras ({n} ligne{n > 1 ? 's' : ''}). Les auto-entrepreneurs ne sont
          jamais modifiés : au devis.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onRun(replace)}
            disabled={!fromPlanned || n === 0}
            className="flex-1 py-2 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink disabled:opacity-40"
          >
            Remplir {n > 0 ? `(${n})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
