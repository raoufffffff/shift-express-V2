/**
 * Postes & besoins quotidiens — les postes internes de l'établissement et,
 * pour chacun, ses CRÉNEAUX attendus : un nom en mots simples (Service, Matin,
 * Soir, Nuit), un horaire, combien de personnes, quels jours. Un réceptionniste
 * peut ainsi être attendu 1 le matin et 1 le soir. C'est CE réglage qui fait
 * clignoter les cases « à pourvoir » du planning : un créneau attendu sans
 * mission = quelqu'un à trouver.
 */
import { useState } from 'react';
import { Plus, Trash2, X, CalendarOff, PartyPopper, Sun } from 'lucide-react';
import {
  useV2Settings,
  DEPARTMENTS,
  SLOT_PRESETS,
  needSummary,
  weeklyHeadcount,
  exceptionLabel,
} from '@/stores/v2SettingsStore';
import type { Department, ExceptionKind, PosteNeed, PosteSlot } from '@/stores/v2SettingsStore';
import { MOCK_TODAY } from '@/mocks/v2Today';
import { parseISO } from '../time';
import { Drawer } from './Drawer';
import { DayPicker, Segmented, Stepper, Toggle, inputCls } from './controls';

export function PostesPanel({ onClose }: { onClose: () => void }) {
  const standard = useV2Settings((s) => s.postes);
  const updateStandard = useV2Settings((s) => s.updatePoste);
  const addPoste = useV2Settings((s) => s.addPoste);
  const removePoste = useV2Settings((s) => s.removePoste);
  // Semaine type éditée : la standard, ou une saison (ses propres créneaux entre deux dates).
  const seasons = useV2Settings((s) => s.seasons);
  const addSeason = useV2Settings((s) => s.addSeason);
  const updateSeason = useV2Settings((s) => s.updateSeason);
  const removeSeason = useV2Settings((s) => s.removeSeason);
  const updateSeasonPoste = useV2Settings((s) => s.updateSeasonPoste);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const season = seasons.find((se) => se.id === seasonId) ?? null;
  const postes = season ? season.postes : standard;
  const updatePoste = (poste: string, patch: Partial<PosteNeed>) =>
    season ? updateSeasonPoste(season.id, poste, patch) : updateStandard(poste, patch);
  const [addingSeason, setAddingSeason] = useState(false);
  const [seasonName, setSeasonName] = useState('');
  const [seasonFrom, setSeasonFrom] = useState('2027-06-15');
  const [seasonTo, setSeasonTo] = useState('2027-09-15');

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState<Department>('Restauration');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const active = postes.filter((p) => p.active);
  // Total de personnes attendues sur une semaine type, tous créneaux confondus.
  const weeklyNeed = weeklyHeadcount(postes);
  const slotCount = active.reduce((s, p) => s + p.slots.length, 0);

  const submitNew = () => {
    const name = newName.trim();
    if (!name || postes.some((p) => p.poste.toLowerCase() === name.toLowerCase())) return;
    addPoste({
      poste: name,
      department: newDept,
      slots: [{ label: 'Service', start: '18:00', end: '23:00', count: 1, days: [5, 6] }],
      active: true,
    });
    setNewName('');
    setAdding(false);
  };

  return (
    <Drawer
      title="Postes & besoins quotidiens"
      subtitle="Chaque créneau attendu sans mission clignote « à pourvoir » sur le planning."
      onClose={onClose}
      wide
      footer={
        adding ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitNew()}
              placeholder="Nom du poste (ex. Runner)"
              className={`${inputCls} flex-1 min-w-[160px]`}
            />
            <select
              value={newDept}
              onChange={(e) => setNewDept(e.target.value as Department)}
              className={inputCls}
              aria-label="Département"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={submitNew}
              disabled={!newName.trim()}
              className="px-4 h-9 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink disabled:opacity-40"
            >
              Ajouter
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="px-3 h-9 rounded-se-sm text-sm font-semibold text-se-muted hover:bg-se-surface-2"
            >
              Annuler
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> Ajouter un poste
          </button>
        )
      }
    >
      {/* ── Quelle semaine type ? Standard, ou une saison entre deux dates ── */}
      <div className="mb-4">
        <p className="se-eyebrow mb-1.5">Semaine type</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={!season}
            onClick={() => setSeasonId(null)}
            className={`h-8 px-3 rounded-full border text-xs font-semibold transition-colors ${
              !season
                ? 'bg-se-blue text-white border-se-blue'
                : 'bg-se-surface text-se-ink border-se-line hover:border-se-muted'
            }`}
          >
            Standard
          </button>
          {seasons.map((se) => (
            <button
              key={se.id}
              type="button"
              aria-pressed={season?.id === se.id}
              onClick={() => setSeasonId(se.id)}
              className={`h-8 px-3 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                season?.id === se.id
                  ? 'bg-se-blue text-white border-se-blue'
                  : 'bg-se-surface text-se-ink border-se-line hover:border-se-muted'
              }`}
            >
              <Sun className="w-3.5 h-3.5" aria-hidden="true" />
              {se.name}
              <span className={season?.id === se.id ? 'text-white/80' : 'text-se-muted'}>
                · {fmtRange(se.from, se.to)}
              </span>
            </button>
          ))}
          {!addingSeason && (
            <button
              type="button"
              onClick={() => setAddingSeason(true)}
              className="h-8 px-2.5 rounded-full text-xs font-semibold text-se-blue-ink hover:bg-se-blue-wash inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Ajouter une saison
            </button>
          )}
        </div>
        {addingSeason && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={seasonName}
              onChange={(e) => setSeasonName(e.target.value)}
              placeholder="Nom (ex. Été, Salon, Fêtes)"
              className={`${inputCls} flex-1 min-w-[160px]`}
            />
            <input
              type="date"
              value={seasonFrom}
              onChange={(e) => setSeasonFrom(e.target.value)}
              className={inputCls}
              aria-label="Début de la saison"
            />
            <span className="text-se-muted">→</span>
            <input
              type="date"
              value={seasonTo}
              min={seasonFrom}
              onChange={(e) => setSeasonTo(e.target.value)}
              className={inputCls}
              aria-label="Fin de la saison"
            />
            <button
              type="button"
              disabled={!seasonName.trim() || !seasonFrom || !seasonTo || seasonTo < seasonFrom}
              onClick={() => {
                addSeason({ name: seasonName.trim(), from: seasonFrom, to: seasonTo });
                setSeasonName('');
                setAddingSeason(false);
              }}
              className="px-4 h-9 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink disabled:opacity-40"
            >
              Créer (copie de la standard)
            </button>
            <button
              type="button"
              onClick={() => setAddingSeason(false)}
              className="px-3 h-9 rounded-se-sm text-sm font-semibold text-se-muted hover:bg-se-surface-2"
            >
              Annuler
            </button>
          </div>
        )}
        {season ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <input
              value={season.name}
              onChange={(e) => updateSeason(season.id, { name: e.target.value })}
              className={`${inputCls} font-semibold`}
              aria-label="Nom de la saison"
            />
            <span className="text-se-muted">du</span>
            <input
              type="date"
              value={season.from}
              onChange={(e) => updateSeason(season.id, { from: e.target.value })}
              className={inputCls}
              aria-label="Début de la saison"
            />
            <span className="text-se-muted">au</span>
            <input
              type="date"
              value={season.to}
              min={season.from}
              onChange={(e) => updateSeason(season.id, { to: e.target.value })}
              className={inputCls}
              aria-label="Fin de la saison"
            />
            <button
              type="button"
              onClick={() => {
                removeSeason(season.id);
                setSeasonId(null);
              }}
              className="inline-flex items-center gap-1 px-2.5 h-9 rounded-se-sm text-xs font-semibold text-se-muted hover:text-se-danger hover:bg-se-danger-wash"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Supprimer la saison
            </button>
            <p className="w-full text-xs text-se-muted">
              Entre ces dates, le planning attend ces créneaux-là à la place de la semaine standard. Les postes
              eux-mêmes s'ajoutent ou se retirent sur la semaine standard.
            </p>
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-se-muted">
            La semaine standard vaut toute l'année, sauf pendant une saison. Une saison se crée en copie de la standard,
            puis se règle à part.
          </p>
        )}
      </div>

      <p className="text-sm text-se-muted mb-4">
        <span className="font-semibold text-se-ink">{active.length} postes actifs</span> · {slotCount} créneau
        {slotCount > 1 ? 'x' : ''} · {weeklyNeed} personnes attendues par semaine type
        {season ? ` « ${season.name} »` : ''}.
      </p>

      <ul className="space-y-3">
        {postes.map((p) => (
          <li key={p.poste}>
            <PosteRow
              need={p}
              onChange={(patch) => updatePoste(p.poste, patch)}
              onRemove={() => setConfirmRemove(p.poste)}
              confirming={confirmRemove === p.poste}
              onConfirmRemove={() => {
                removePoste(p.poste);
                setConfirmRemove(null);
              }}
              onCancelRemove={() => setConfirmRemove(null)}
              locked={!!season}
            />
          </li>
        ))}
      </ul>

      <ExceptionDays />
    </Drawer>
  );
}

function PosteRow({
  need,
  onChange,
  onRemove,
  confirming,
  onConfirmRemove,
  onCancelRemove,
  locked = false,
}: {
  need: PosteNeed;
  onChange: (patch: Partial<PosteNeed>) => void;
  onRemove: () => void;
  confirming: boolean;
  onConfirmRemove: () => void;
  /** semaine type saisonnière : le poste ne se supprime que sur la standard */
  locked?: boolean;
  onCancelRemove: () => void;
}) {
  const setSlot = (i: number, patch: Partial<PosteSlot>) =>
    onChange({ slots: need.slots.map((sl, j) => (j === i ? { ...sl, ...patch } : sl)) });
  // Nouveau créneau : les jours du dernier créneau (ou vendredi + samedi), 1 personne.
  const addSlot = (preset: { label: string; start: string; end: string }) =>
    onChange({
      slots: [...need.slots, { ...preset, count: 1, days: [...(need.slots[need.slots.length - 1]?.days ?? [5, 6])] }],
    });
  const removeSlot = (i: number) => onChange({ slots: need.slots.filter((_, j) => j !== i) });

  return (
    <div
      className={`rounded-se border p-3.5 transition-colors ${need.active ? 'border-se-line bg-se-surface' : 'border-se-line/60 bg-se-surface-2/40'}`}
    >
      <div className="flex items-center gap-3">
        <Toggle on={need.active} onChange={(active) => onChange({ active })} label={`${need.poste} actif`} />
        <div className="min-w-0 flex-1">
          <p className={`font-semibold truncate ${need.active ? 'text-se-ink' : 'text-se-muted'}`}>{need.poste}</p>
          <select
            value={need.department}
            onChange={(e) => onChange({ department: e.target.value as Department })}
            className="text-xs text-se-muted bg-transparent -ml-0.5 focus:outline-none"
            aria-label={`Département de ${need.poste}`}
          >
            {DEPARTMENTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
        {confirming ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="text-se-muted">Supprimer ?</span>
            <button
              type="button"
              onClick={onConfirmRemove}
              className="px-2 py-1 rounded-se-sm font-semibold bg-se-danger text-white"
            >
              Oui
            </button>
            <button
              type="button"
              onClick={onCancelRemove}
              className="px-2 py-1 rounded-se-sm font-semibold text-se-muted hover:bg-se-surface-2"
            >
              Non
            </button>
          </span>
        ) : locked ? null : (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Supprimer ${need.poste}`}
            className="w-8 h-8 grid place-items-center rounded-se-sm text-se-muted hover:text-se-danger hover:bg-se-danger-wash"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* En mots simples : ce que le planning attendra de ce poste. */}
      <p className="text-xs text-se-muted mt-2">{needSummary(need)}</p>

      {need.active && (
        <div className="mt-3 pt-3 border-t border-se-line/70">
          <p className="se-eyebrow mb-1.5">Créneaux attendus</p>
          <ul className="divide-y divide-se-line/60">
            {need.slots.map((sl, i) => (
              <li key={i} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <input
                  value={sl.label}
                  onChange={(e) => setSlot(i, { label: e.target.value })}
                  placeholder="Nom (Matin, Soir…)"
                  className={`${inputCls} h-8 px-2 w-[112px] font-semibold`}
                  aria-label={`Nom du créneau ${i + 1} de ${need.poste}`}
                />
                <span className="inline-flex items-center gap-1.5">
                  <input
                    type="time"
                    value={sl.start}
                    onChange={(e) => setSlot(i, { start: e.target.value })}
                    className={`${inputCls} h-8 px-2`}
                    aria-label={`Début · ${sl.label || `créneau ${i + 1}`}`}
                  />
                  <span className="text-se-muted">→</span>
                  <input
                    type="time"
                    value={sl.end}
                    onChange={(e) => setSlot(i, { end: e.target.value })}
                    className={`${inputCls} h-8 px-2`}
                    aria-label={`Fin · ${sl.label || `créneau ${i + 1}`}`}
                  />
                </span>
                <Stepper
                  value={sl.count}
                  onChange={(count) => setSlot(i, { count })}
                  min={1}
                  max={12}
                  suffix="pers."
                  label={`Personnes · ${sl.label || `créneau ${i + 1}`} · ${need.poste}`}
                />
                <DayPicker value={sl.days} onChange={(days) => setSlot(i, { days })} size="sm" />
                {need.slots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSlot(i)}
                    aria-label={`Retirer le créneau ${sl.label || i + 1} de ${need.poste}`}
                    title="Retirer ce créneau"
                    className="ml-auto w-7 h-7 grid place-items-center rounded-se-sm text-se-muted hover:text-se-danger hover:bg-se-danger-wash"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-se-muted mr-1">Ajouter un créneau :</span>
            {SLOT_PRESETS.map((pr) => (
              <button
                key={pr.label}
                type="button"
                onClick={() => addSlot(pr)}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-se-line text-xs font-semibold text-se-ink hover:border-se-blue hover:text-se-blue-ink hover:bg-se-blue-wash/40"
              >
                <Plus className="w-3 h-3" aria-hidden="true" /> {pr.label}
                <span className="font-normal text-se-muted">
                  {pr.start}–{pr.end}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** « 14 déc. → 3 janv. » */
const fmtRange = (from: string, to: string) => {
  const f = (iso: string) => parseISO(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `${f(from)} → ${f(to)}`;
};

/* ── Journées d'exception : fermé, ou renfort sur chaque créneau ── */
const fmtDate = (iso: string) =>
  parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function ExceptionDays() {
  const exceptions = useV2Settings((s) => s.exceptions);
  const addException = useV2Settings((s) => s.addException);
  const updateException = useV2Settings((s) => s.updateException);
  const removeException = useV2Settings((s) => s.removeException);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(MOCK_TODAY);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<ExceptionKind>('renfort');
  const [extra, setExtra] = useState(1);
  const upcoming = [...exceptions].sort((a, b) => a.date.localeCompare(b.date));

  const submit = () => {
    if (!date) return;
    addException({ date, label: label.trim(), kind, extra: kind === 'renfort' ? extra : 0 });
    setLabel('');
    setAdding(false);
  };

  return (
    <div className="mt-6 pt-5 border-t border-se-line">
      <p className="se-eyebrow mb-1">Journées d'exception</p>
      <p className="text-sm text-se-muted mb-3">
        Un jour qui ne suit pas la semaine type : <span className="font-semibold text-se-ink">fermé</span> (aucun
        créneau attendu, personne n'est posé) ou <span className="font-semibold text-se-ink">renfort</span> (chaque
        créneau attendu demande du monde en plus, pour les missions pas encore créées). Le planning le montre sur le
        jour.
      </p>
      {upcoming.length === 0 ? (
        <p className="text-sm text-se-muted">Aucune journée d'exception.</p>
      ) : (
        <ul className="divide-y divide-se-line/60 rounded-se border border-se-line">
          {upcoming.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-sm">
              <span
                className={`w-7 h-7 shrink-0 rounded-se-sm grid place-items-center ${
                  e.kind === 'ferme' ? 'bg-se-danger-wash text-se-danger' : 'bg-se-blue-wash text-se-blue-ink'
                }`}
              >
                {e.kind === 'ferme' ? (
                  <CalendarOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <PartyPopper className="w-4 h-4" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-se-ink capitalize">{fmtDate(e.date)}</span>
                <span className="block text-xs text-se-muted">{exceptionLabel(e)}</span>
              </span>
              {e.kind === 'renfort' && (
                <Stepper
                  value={e.extra}
                  onChange={(extra) => updateException(e.id, { extra })}
                  min={1}
                  max={10}
                  suffix="en plus"
                  label={`Personnes en plus · ${e.label || e.date}`}
                />
              )}
              <button
                type="button"
                onClick={() => removeException(e.id)}
                aria-label={`Retirer la journée du ${e.date}`}
                className="w-8 h-8 grid place-items-center rounded-se-sm text-se-muted hover:text-se-danger hover:bg-se-danger-wash"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
            aria-label="Date de la journée d'exception"
          />
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Pourquoi (ex. Soirée privée, Férié)"
            className={`${inputCls} flex-1 min-w-[160px]`}
          />
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { key: 'renfort', label: 'Renfort' },
              { key: 'ferme', label: 'Fermé' },
            ]}
          />
          {kind === 'renfort' && (
            <Stepper value={extra} onChange={setExtra} min={1} max={10} suffix="en plus" label="Personnes en plus" />
          )}
          <button
            type="button"
            onClick={submit}
            className="px-4 h-9 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
          >
            Ajouter
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="px-3 h-9 rounded-se-sm text-sm font-semibold text-se-muted hover:bg-se-surface-2"
          >
            Annuler
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-se-blue-ink hover:text-se-blue"
        >
          <Plus className="w-4 h-4" aria-hidden="true" /> Ajouter une journée d'exception
        </button>
      )}
    </div>
  );
}
