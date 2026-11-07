/**
 * Vue Jour — les missions d'UNE journée en liste de cartes larges, avec une
 * navigation ‹ › de jour en jour. À gauche de chaque carte : les personnes
 * VALIDÉES (placées — pas les simples suggestions), photo + nom.
 * Les créneaux attendus ce jour par la config du compte (Matin, Soir…) sans
 * mission dessus clignotent « à pourvoir » et ouvrent la publication préremplie.
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Link2, Plus, UserMinus } from 'lucide-react';
import type { Mission } from '@/mocks/v2Missions';
import { usePosteNeeds, uncoveredSlots, useV2Settings, exceptionOn, exceptionLabel } from '@/stores/v2SettingsStore';
import type { ExpectedSlot, PosteSlot } from '@/stores/v2SettingsStore';
import { missionFill, cancelledStyle } from '../coverage';
import { effPlaced, effPlacedCount, effRequired, isLive, pendingReleases } from '../mission/missionStore';
import { Avatar } from '../Avatar';
import type { RowDef } from './WeekView';
import { missionTimeLabel, parseISO, toISO } from '../time';

interface Props {
  missions: Mission[];
  today: string;
  /** incrémenté par « Aujourd'hui » → revient au jour courant */
  focusToken: number;
  onOpen: (missionId: string) => void;
  onCreate?: (poste: string | undefined, date: string, slot?: PosteSlot) => void;
  /** regroupement (par poste / par personnel) : une section par ligne ; défaut : liste plate */
  rows?: RowDef[];
  /** afficher les « à pourvoir » (désactivé en vue par personnel) */
  needs?: boolean;
  /** mode auto-entrepreneur : pas d'« à pourvoir », un simple « Créer une mission » */
  plusOnly?: boolean;
}

export function DayView({
  missions,
  today,
  focusToken,
  onOpen,
  onCreate,
  rows,
  needs = true,
  plusOnly = false,
}: Props) {
  const [date, setDate] = useState(today);
  useEffect(() => setDate(today), [focusToken, today]);
  const posteConfig = usePosteNeeds(); // besoins quotidiens (Réglages)
  const exceptions = useV2Settings((s) => s.exceptions);

  const shift = (delta: number) => {
    const d = parseISO(date);
    d.setDate(d.getDate() + delta);
    setDate(toISO(d));
  };

  const list = missions.filter((m) => m.date === date).sort((a, b) => a.start.localeCompare(b.start));
  // Les annulées restent dans la liste (hachurées) mais ne comptent plus.
  const live = list.filter(isLive);
  const rowPostes = rows?.map((r) => r.poste).filter((p): p is string => !!p);
  // Créneaux attendus ce jour sans mission vivante dessus : un « à pourvoir » chacun.
  const missing = needs ? uncoveredSlots(posteConfig, date, live, rowPostes) : [];
  const placed = live.reduce((s, m) => s + effPlacedCount(m), 0);
  const required = live.reduce((s, m) => s + effRequired(m), 0);
  const label = parseISO(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const isToday = date === today;
  const exception = exceptionOn(exceptions, date);

  return (
    <div>
      {/* ── Navigation de jour ─────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          aria-label="Jour précédent"
          onClick={() => shift(-1)}
          className="w-9 h-9 grid place-items-center rounded-se-sm border border-se-line bg-se-surface hover:bg-se-surface-2 text-se-muted"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="min-w-[220px]">
          <p className="font-display font-extrabold text-se-ink capitalize leading-tight">
            {label}
            {exception && (
              <span
                className={`ml-2 align-middle inline-block px-2 py-px rounded-full text-[11px] font-semibold normal-case ${
                  exception.kind === 'ferme' ? 'bg-se-danger-wash text-se-danger' : 'bg-se-blue-wash text-se-blue-ink'
                }`}
              >
                {exceptionLabel(exception)}
              </span>
            )}
          </p>
          <p className="text-xs text-se-muted">
            {live.length} mission{live.length > 1 ? 's' : ''} · {placed}/{required} placés
            {missing.length > 0 && (
              <span className="text-se-danger font-semibold animate-pulse"> · {missing.length} à pourvoir</span>
            )}
          </p>
        </div>
        <button
          type="button"
          aria-label="Jour suivant"
          onClick={() => shift(1)}
          className="w-9 h-9 grid place-items-center rounded-se-sm border border-se-line bg-se-surface hover:bg-se-surface-2 text-se-muted"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        {isToday && <span className="se-badge bg-se-blue-wash text-se-blue-ink ml-1">aujourd'hui</span>}
      </div>

      {/* ── Liste des missions du jour ─────────────────────── */}
      {rows ? (
        // Regroupé : une section par poste / par personne, dans l'ordre des lignes.
        <div className="space-y-5">
          {rows.map((row) => {
            const here = list.filter(row.filter);
            const miss = missing.filter((c) => c.poste === row.poste);
            return (
              <section key={row.key}>
                <div className="flex items-center gap-2 mb-2">
                  {row.label}
                  <span className="text-xs text-se-muted">
                    ·{' '}
                    {here.length > 0
                      ? `${here.length} mission${here.length > 1 ? 's' : ''}`
                      : miss.length > 0
                        ? 'à pourvoir'
                        : 'rien ce jour'}
                  </span>
                </div>
                {here.length > 0 || miss.length > 0 ? (
                  <ul className="space-y-2">
                    {here.map(card)}
                    {miss.map(missingItem)}
                  </ul>
                ) : (
                  <div className="h-10 rounded-se-sm border border-dashed border-se-line/50" aria-hidden="true" />
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map(card)}
          {missing.map(missingItem)}
          {list.length === 0 && missing.length === 0 && !plusOnly && (
            <li>
              <p className="text-sm text-se-muted">Rien de prévu ce jour.</p>
            </li>
          )}
          {plusOnly && (
            <li>
              <button
                type="button"
                onClick={() => onCreate?.(undefined, date)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-se border border-dashed border-se-line text-se-muted font-semibold text-sm hover:text-se-freelance-ink hover:border-se-freelance hover:bg-se-freelance-wash/30 transition-colors"
              >
                <Plus className="w-4 h-4" aria-hidden="true" /> Créer une mission ce jour
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );

  /** Carte large d'une mission : validés à gauche, bandeau + infos à droite. */
  function card(m: Mission) {
    const cancelled = !!m.cancelled;
    const style = cancelled ? cancelledStyle : missionFill(m);
    const people = effPlaced(m).filter((p) => !p.suggested); // validés seulement
    const count = people.length;
    const req = effRequired(m);
    const pct = Math.round((count / Math.max(req, 1)) * 100);
    const released = cancelled ? [] : pendingReleases(m);
    return (
      <li key={m.id}>
        <button
          type="button"
          onClick={() => onOpen(m.id)}
          className={`w-full text-left flex rounded-se border border-se-line shadow-se overflow-hidden hover:border-se-muted transition-colors ${
            cancelled ? 'se-hatched' : 'bg-se-surface'
          }`}
        >
          {/* Colonne gauche : personnes validées, photo + nom */}
          <div className="w-44 shrink-0 border-r border-se-line bg-se-surface-2/60 p-3">
            <p className="se-eyebrow mb-2">
              {cancelled ? 'Étaient prévus' : 'Validés'}{' '}
              <span className="text-se-muted font-normal">
                · {count}/{req}
              </span>
            </p>
            {people.length === 0 ? (
              <p className="text-xs text-se-muted">Personne pour l'instant.</p>
            ) : (
              <ul className="space-y-1.5">
                {people.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 min-w-0">
                    <Avatar person={p} size={28} />
                    <span className="text-xs font-medium text-se-ink truncate">{p.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Corps de la carte */}
          <div className="flex-1 min-w-0">
            <div
              className={`flex items-center justify-between gap-2 px-3 py-2 ${style.band} ${
                style.dash ? 'border-b-2 border-dashed border-white/50' : ''
              } ${cancelled ? 'border-b border-se-line' : 'text-white'}`}
            >
              <span className={`font-semibold truncate ${cancelled ? 'line-through' : ''}`}>{m.poste}</span>
              <span className="font-bold text-sm whitespace-nowrap">{cancelled ? 'Annulée' : `${count}/${req}`}</span>
            </div>
            <div className="p-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              <span className="font-medium text-se-ink">{missionTimeLabel(m)}</span>
              <span className="text-se-muted">
                {cancelled ? (m.cancelled!.fees > 0 ? `${m.cancelled!.fees} € de frais` : 'sans frais') : `${pct} %`}
              </span>
              <span className="se-badge bg-se-surface-2 text-se-muted">{m.establishment}</span>
              {released.length > 0 && (
                <span className="se-badge bg-se-danger-wash text-se-danger inline-flex items-center gap-1">
                  <UserMinus className="w-3 h-3" aria-hidden="true" /> {released[0].name} a relâché · à republier
                </span>
              )}
              {m.eventName && (
                <span className="se-badge bg-se-blue-wash text-se-blue-ink inline-flex items-center gap-1">
                  <Link2 className="w-3 h-3" aria-hidden="true" /> {m.eventName}
                </span>
              )}
            </div>
          </div>
        </button>
      </li>
    );
  }

  /** Créneau attendu ce jour sans mission : ça clignote. */
  function missingItem({ poste, slot }: ExpectedSlot) {
    return (
      <li key={`${poste}-${slot.label}-${slot.start}`}>
        <button
          type="button"
          onClick={() => onCreate?.(poste, date, slot)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-se border-2 border-dashed border-se-danger/60 bg-se-danger-wash/50 text-se-danger font-semibold text-sm animate-pulse hover:bg-se-danger-wash hover:border-se-danger transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden="true" /> {poste} · {slot.label} {slot.start}–{slot.end} · À pourvoir
        </button>
      </li>
    );
  }
}
