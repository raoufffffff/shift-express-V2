/**
 * « Lancer la recherche d'auto-entrepreneurs » — fenêtre ouverte depuis la
 * colonne gauche d'une mission réservée aux salariés, ou d'une cascade dont
 * l'étape auto-entrepreneurs n'est pas encore atteinte.
 * On fixe le TARIF HORAIRE (dans la fourchette de l'administrateur), on peut
 * repartir d'un modèle, changer la date et les horaires (bouton en haut à
 * droite), ajuster la consigne, la note privée (+ PDF), les langues et les
 * logiciels avant de lancer. Le devis estimé (tarif × heures × places
 * restantes) est affiché avant d'engager. Tout ce qui est rempli ici se
 * retrouve ensuite dans la colonne Détails de la mission.
 */
import { useState } from 'react';
import {
  X,
  Eye,
  Lock,
  Languages,
  Monitor,
  FileText,
  Search,
  CalendarDays,
  Bookmark,
  BookmarkCheck,
} from 'lucide-react';
import type { Mission } from '@/mocks/v2Missions';
import { LANGUES } from '@/mocks/v2Missions';
import { useV2Settings, useRateBounds, rateFor } from '@/stores/v2SettingsStore';
import { useV2Templates } from '@/stores/v2TemplatesStore';
import { MultiSelect } from '../MultiSelect';
import { SoftwareSelect } from '../SoftwareSelect';
import { hoursBetween } from '../time';

/** Ce que la recherche fixe sur la mission. */
export interface SearchLaunch {
  rate: number;
  date: string;
  start: string;
  end: string;
  consigne: string;
  notePrivee: string;
  pdfName: string | null;
  langues: string[];
  logiciels: string[];
}

interface Props {
  mission: Mission;
  /** places encore à couvrir sur le créneau */
  remaining: number;
  onClose: () => void;
  onLaunch: (launch: SearchLaunch) => void;
}

export function FreelanceSearchPanel({ mission, remaining, onClose, onLaunch }: Props) {
  // Tarif : celui des Réglages pour ce poste et cet établissement, dans la fourchette admin.
  const establishments = useV2Settings((s) => s.establishments);
  const account = useV2Settings((s) => s.account);
  const cascade = useV2Settings((s) => s.cascade);
  const boundsOf = useRateBounds();
  const establishmentId = establishments.find((e) => e.name === mission.establishment)?.id ?? account.establishmentId;
  const bounds = boundsOf(mission.poste, establishmentId);
  const defaultRate = Math.min(
    Math.max(rateFor(cascade.freelanceRates, establishmentId, mission.poste), bounds.min),
    bounds.max,
  );
  const [rate, setRate] = useState(defaultRate);

  // Date & horaires : modifiables depuis le bouton en haut à droite.
  const [editingDate, setEditingDate] = useState(false);
  const [date, setDate] = useState(mission.date);
  const [start, setStart] = useState(mission.start);
  const [end, setEnd] = useState(mission.end);
  const dateChanged = date !== mission.date || start !== mission.start || end !== mission.end;

  const [consigne, setConsigne] = useState(mission.publicNote ?? '');
  const [notePrivee, setNotePrivee] = useState(mission.privateNote ?? '');
  const [langues, setLangues] = useState<string[]>(mission.languages ?? []);
  const [logiciels, setLogiciels] = useState<string[]>(mission.software ?? []);
  const [pdfName, setPdfName] = useState<string | null>(mission.privatePdf ?? null);

  // Modèles : consigne, langues, logiciels (et horaires) d'un shift enregistré.
  const templates = useV2Templates((s) => s.templates);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTemplateId(id);
    setConsigne(t.consigne);
    setLangues(t.langues);
    setLogiciels(t.logiciels);
  };

  const hours = hoursBetween(start, end);
  const places = Math.max(remaining, 1);
  const devis = Math.round(rate * hours * places);
  const mid = Math.round((bounds.min + bounds.max) / 2);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-se-ink/50" />

      <div className="se-root relative w-full max-w-lg max-h-[92vh] flex flex-col bg-se-surface rounded-se shadow-se-md overflow-hidden">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-se-line">
          <span className="w-9 h-9 rounded-se-sm bg-se-freelance-wash text-se-freelance-ink grid place-items-center shrink-0">
            <Search className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-se-ink truncate">Lancer la recherche d'auto-entrepreneurs</h2>
            <p className="text-xs text-se-muted truncate">
              {mission.poste} · {fmtDay(date)} · {start}–{end} · {places} place{places > 1 ? 's' : ''} à couvrir
            </p>
          </div>
          {/* Modifier la date / les horaires — en haut à droite */}
          <button
            type="button"
            onClick={() => setEditingDate((v) => !v)}
            aria-expanded={editingDate}
            className={`ml-auto inline-flex items-center gap-1.5 h-8 px-2.5 rounded-se-sm text-xs font-semibold border whitespace-nowrap ${
              editingDate || dateChanged
                ? 'border-se-blue text-se-blue-ink bg-se-blue-wash'
                : 'border-se-line text-se-ink hover:bg-se-surface-2'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" /> Modifier la date
          </button>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {editingDate && (
          <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-se-line bg-se-blue-wash/40">
            <label className="block">
              <span className="se-eyebrow block mb-1">Jour</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="se-eyebrow block mb-1">Début</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={timeCls} />
            </label>
            <label className="block">
              <span className="se-eyebrow block mb-1">Fin</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={timeCls} />
            </label>
            <span className="text-xs text-se-muted pb-2.5">{hours} h</span>
            {dateChanged && (
              <button
                type="button"
                onClick={() => {
                  setDate(mission.date);
                  setStart(mission.start);
                  setEnd(mission.end);
                }}
                className="ml-auto text-xs font-semibold text-se-muted hover:text-se-ink pb-2.5"
              >
                Revenir à l'horaire actuel
              </button>
            )}
          </div>
        )}

        {/* pb-6 : de la place sous le dernier champ, pour descendre tout en bas */}
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6 space-y-4">
          {/* Partir d'un modèle */}
          {templates.length > 0 && (
            <div>
              <p className="se-eyebrow mb-1.5">
                Partir d'un modèle <span className="font-normal normal-case text-se-muted">· facultatif</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((t) => {
                  const on = templateId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyTemplate(t.id)}
                      title={`${t.poste} · ${t.start}–${t.end}${t.langues.length ? ` · ${t.langues.join(', ')}` : ''}`}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                        on ? 'bg-se-blue text-white border-se-blue' : 'border-se-line text-se-ink hover:border-se-muted'
                      }`}
                    >
                      {on ? (
                        <BookmarkCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tarif horaire, dans la fourchette de l'administrateur */}
          <div className="rounded-se-sm border border-se-line bg-se-surface-2/50 p-3">
            <div className="flex items-baseline justify-between mb-2">
              <p className="se-eyebrow">Tarif horaire proposé</p>
              <p className="text-xl font-extrabold font-display text-se-ink leading-none">
                {rate} <span className="text-xs font-normal text-se-muted">€/h TTC</span>
              </p>
            </div>
            <input
              type="range"
              min={bounds.min}
              max={bounds.max}
              step={1}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              aria-label="Tarif horaire"
              className="w-full accent-se-freelance"
            />
            <div className="flex justify-between text-[11px] text-se-muted mt-1">
              <span>{bounds.min} €</span>
              <span>{mid} €</span>
              <span>{bounds.max} €</span>
            </div>
            <p className="text-[11px] text-se-muted mt-1.5">
              {account.type === 'etablissements'
                ? `Fourchette fixée par l'administrateur pour ${mission.establishment}.`
                : 'Tarif libre.'}
              {rate !== defaultRate ? ` Habituel : ${defaultRate} €/h.` : ''}
            </p>
          </div>

          {/* Consigne & note privée */}
          <div>
            <p className="se-eyebrow inline-flex items-center gap-1 mb-1.5">
              <Eye className="w-3 h-3" aria-hidden="true" /> Consigne visible des auto-entrepreneurs
            </p>
            <textarea
              value={consigne}
              onChange={(e) => setConsigne(e.target.value)}
              rows={2}
              placeholder="Tenue, point de rendez-vous, briefing…"
              className={textareaCls}
            />
          </div>
          <div>
            <p className="se-eyebrow inline-flex items-center gap-1 mb-1.5">
              <Lock className="w-3 h-3" aria-hidden="true" /> Note privée
            </p>
            <textarea
              value={notePrivee}
              onChange={(e) => setNotePrivee(e.target.value)}
              rows={2}
              placeholder="Visible de vous seul·e."
              className={textareaCls}
            />
            <div className="mt-1.5">
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-se-blue-ink hover:text-se-blue cursor-pointer">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => setPdfName(e.target.files?.[0]?.name ?? null)}
                />
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                {pdfName ? 'Remplacer le PDF' : 'Joindre un PDF'}
              </label>
              {pdfName && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-se-ink">
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
          </div>

          {/* Profil recherché */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="se-eyebrow inline-flex items-center gap-1 mb-1.5">
                <Languages className="w-3 h-3" aria-hidden="true" /> Langues
              </p>
              <MultiSelect options={LANGUES} value={langues} onChange={setLangues} placeholder="Choisir des langues" />
            </div>
            <div>
              <p className="se-eyebrow inline-flex items-center gap-1 mb-1.5">
                <Monitor className="w-3 h-3" aria-hidden="true" /> Logiciels
              </p>
              <SoftwareSelect value={logiciels} onChange={setLogiciels} />
            </div>
          </div>
          <p className="text-xs text-se-muted">
            Consigne, note, langues et logiciels se retrouvent dans la colonne Détails de la mission.
          </p>
        </div>

        {/* Pied : devis avant d'engager, puis une seule action */}
        <footer className="px-4 py-3 border-t border-se-line flex items-center gap-3">
          <div className="min-w-0">
            <p className="se-eyebrow">Devis estimé</p>
            <p className="text-sm text-se-ink">
              <span className="font-extrabold font-display text-base">{devis} € TTC</span>
              <span className="text-se-muted">
                {' '}
                · {places} × {hours} h × {rate} €/h
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => onLaunch({ rate, date, start, end, consigne, notePrivee, pdfName, langues, logiciels })}
            className="ml-auto px-4 py-2.5 rounded-se-sm text-sm font-semibold bg-se-freelance text-white hover:opacity-90 whitespace-nowrap"
          >
            Lancer la recherche
          </button>
        </footer>
      </div>
    </div>
  );
}

const textareaCls =
  'w-full rounded-se-sm border border-se-line bg-se-surface px-3 py-2 text-sm text-se-ink focus:outline-none focus:border-se-blue resize-none';
const inputCls =
  'h-9 rounded-se-sm border border-se-line bg-se-surface px-2 text-sm text-se-ink focus:outline-none focus:border-se-blue';
const timeCls = `${inputCls} w-[104px]`;

/** « jeu. 5 nov. » */
function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}
