/**
 * Vue Semaine — grille façon Ubeya, pilotée par la CONFIGURATION du compte :
 * une ligne par poste configuré (et non seulement ceux qui ont des missions).
 * Pour chaque jour, la config dit quels CRÉNEAUX du poste sont attendus
 * (Matin, Soir…) ; chaque créneau attendu sans mission vivante dessus CLIGNOTE
 * « à pourvoir » et ouvre la publication préremplie à son horaire.
 * Les missions d'un même événement s'illuminent ensemble au survol.
 * Avec `rows` (Par poste / Par personnel), chaque ligne porte son étiquette
 * dans une colonne de gauche : un poste, ou une personne (photo + nom).
 */
import { useRef, useState } from 'react';
import { fillTone } from '../coverage';
import { Plus, BedDouble } from 'lucide-react';
import type { Mission } from '@/mocks/v2Missions';
import { usePosteNeeds, uncoveredSlots, useV2Settings, exceptionOn, exceptionLabel } from '@/stores/v2SettingsStore';
import type { ExpectedSlot, PosteSlot } from '@/stores/v2SettingsStore';
import { effPlacedCount, effRequired, isLive } from '../mission/missionStore';
import { parseISO, toISO } from '../time';

/** Une ligne de la grille : étiquette + missions qui lui appartiennent. */
export interface RowDef {
  key: string;
  /** étiquette affichée dans la colonne de gauche (absente en vue normale) */
  label?: React.ReactNode;
  filter: (m: Mission) => boolean;
  /** poste de la ligne → cases « à pourvoir » selon la config */
  poste?: string;
  /** ligne « personne » : raison d'indisponibilité ce jour-là (repos, congés…) ou null */
  off?: (date: string) => string | null;
}

interface Props {
  missions: Mission[];
  onOpen: (missionId: string) => void;
  /** créneau attendu sans mission → créer la mission (poste, jour et horaire préremplis) */
  onCreate?: (poste: string | undefined, date: string, slot?: PosteSlot) => void;
  renderCard: (mission: Mission) => React.ReactNode;
  /** jour « aujourd'hui » (ISO) — sa colonne est surlignée */
  today?: string;
  /** lignes étiquetées (par poste / par personnel) ; défaut : la config du compte */
  rows?: RowDef[];
  /** afficher les cases « à pourvoir » (désactivé en vue par personnel) */
  needs?: boolean;
  /** mode auto-entrepreneur : pas d'« à pourvoir », juste un « + » discret par case vide */
  plusOnly?: boolean;
  /** premier jour de la semaine, pour ne pas glisser quand on filtre */
  weekStart?: string;
  /** largeur (px) de la colonne des étiquettes — étroite par poste, plus large par personne */
  labelWidth?: number;
  /** glisser-déposer : une carte lâchée sur un autre jour → la mission y est déplacée (même horaire) */
  onMove?: (missionId: string, date: string) => void;
}

/** Teinte du compteur de colonne : la même règle de couleur que partout. */
const dayTone = (placed: number, required: number, count: number) =>
  count === 0 ? 'text-se-muted' : fillTone(placed, required);

export function WeekView({
  missions,
  renderCard,
  today,
  onCreate,
  rows,
  needs = true,
  plusOnly = false,
  weekStart,
  labelWidth = 172,
  onMove,
}: Props) {
  // Événement survolé → toutes ses missions s'illuminent (elles sont reliées).
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null);
  // Glisser-déposer : la mission en main (ref : les événements dragover/drop arrivent
  // avant tout nouveau rendu), et la case survolée.
  const dragRef = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overCell, setOverCell] = useState<string | null>(null);
  // Besoins quotidiens configurés dans Réglages (postes actifs seulement).
  const posteConfig = usePosteNeeds();
  const exceptions = useV2Settings((s) => s.exceptions);

  // 7 jours contigus à partir du premier jour de données (lun→dim en prod).
  const first = weekStart ?? missions.map((m) => m.date).sort()[0] ?? today ?? toISO(new Date());
  const start = parseISO(first);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toISO(d);
  });

  // Lignes = postes configurés pour le compte (défaut), ou les lignes fournies.
  // En mode auto-entrepreneur sans filtre : une seule ligne, un « + » par jour.
  const lines: RowDef[] =
    rows ??
    (plusOnly
      ? [{ key: 'all', filter: () => true }]
      : posteConfig.map((c) => ({ key: c.poste, poste: c.poste, filter: (m: Mission) => m.poste === c.poste })));
  const labelled = !!rows;
  const cell = (row: RowDef, date: string) => missions.filter((m) => row.filter(m) && m.date === date);
  // Les shifts annulés restent affichés (hachurés) mais ne comptent plus nulle part.
  const live = missions.filter(isLive);
  // Créneaux attendus de la ligne ce jour-là sans mission vivante dessus : un « à pourvoir » chacun.
  const openSlots = (row: RowDef, date: string): ExpectedSlot[] =>
    needs && row.poste ? uncoveredSlots(posteConfig, date, live, [row.poste]) : [];
  const needButton = (row: RowDef, date: string, { slot }: ExpectedSlot, tall: boolean) => (
    <button
      key={`${slot.label}-${slot.start}`}
      type="button"
      onClick={() => onCreate?.(row.poste!, date, slot)}
      title={`${row.poste} attendu ${slot.label.toLowerCase()} ${slot.start}–${slot.end} — publier une mission`}
      className={`w-full ${tall ? 'flex-1 min-h-[64px]' : 'min-h-[44px]'} rounded-se-sm border-2 border-dashed border-se-danger/60 bg-se-danger-wash/50 animate-pulse flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-se-danger hover:bg-se-danger-wash hover:border-se-danger transition-colors`}
    >
      {!labelled && tall && <span className="text-xs font-semibold truncate max-w-full">{row.poste}</span>}
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold">
        <Plus className="w-3.5 h-3.5" aria-hidden="true" /> À pourvoir
      </span>
      <span className="text-[10px] font-medium truncate max-w-full">
        {slot.label} · {slot.start}–{slot.end}
      </span>
    </button>
  );

  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="grid min-w-full gap-2"
        style={{
          gridTemplateColumns: `${labelled ? `${labelWidth}px ` : ''}repeat(${days.length}, minmax(148px, 1fr))`,
        }}
      >
        {/* ── Ligne d'en-tête : un en-tête par jour (pas de colonne de postes
            en vue normale : chaque carte porte son poste dans le bandeau) ── */}
        {labelled && <div aria-hidden="true" />}
        {days.map((date) => {
          const dayMissions = live.filter((m) => m.date === date);
          const placed = dayMissions.reduce((s, m) => s + effPlacedCount(m), 0);
          const required = dayMissions.reduce((s, m) => s + effRequired(m), 0);
          const count = dayMissions.length;
          const missing = lines.reduce((s, r) => s + openSlots(r, date).length, 0);
          const d = parseISO(date);
          const isToday = date === today;
          return (
            <div
              key={date}
              className={`px-2 pb-1.5 pt-1 rounded-se-sm ${isToday ? 'bg-se-blue-wash/60 ring-1 ring-se-blue/30' : ''}`}
            >
              <div className="flex items-baseline gap-1.5">
                <p className="se-eyebrow">{d.toLocaleDateString('fr-FR', { weekday: 'short' })}</p>
                <p className="text-lg font-extrabold font-display text-se-ink leading-none">{d.getDate()}</p>
                {isToday && <span className="text-[10px] font-semibold text-se-blue-ink ml-auto">auj.</span>}
              </div>
              {(() => {
                const ex = exceptionOn(exceptions, date);
                return ex ? (
                  <span
                    className={`inline-block max-w-full truncate mt-0.5 px-1.5 py-px rounded-full text-[10px] font-semibold ${
                      ex.kind === 'ferme' ? 'bg-se-danger-wash text-se-danger' : 'bg-se-blue-wash text-se-blue-ink'
                    }`}
                    title={exceptionLabel(ex)}
                  >
                    {exceptionLabel(ex)}
                  </span>
                ) : null;
              })()}
              <p className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                {count === 0 ? (
                  <span className="text-se-muted">—</span>
                ) : (
                  <>
                    <span className={`font-semibold ${dayTone(placed, required, count)}`} title="placés / besoin">
                      {placed}/{required}
                    </span>
                    <span className="text-se-muted">
                      · {count} créneau{count > 1 ? 'x' : ''}
                    </span>
                  </>
                )}
                {missing > 0 && (
                  <span className="text-se-danger font-semibold animate-pulse" title="postes attendus sans mission">
                    · {missing} à pourvoir
                  </span>
                )}
              </p>
            </div>
          );
        })}

        {/* ── Une ligne par poste configuré / par ligne fournie ── */}
        {lines.map((row) => {
          return (
            <div key={row.key} className="contents">
              {/* Étiquette : centrée verticalement, même séparateur que les cases de la ligne */}
              {labelled && (
                <div className="min-w-0 flex items-center py-2 pr-2 border-b border-se-line/60">{row.label}</div>
              )}
              {days.map((date) => {
                const here = cell(row, date);
                const open = openSlots(row, date);
                const cellKey = row.key + date;
                const canDrop = () => !!onMove && !!dragRef.current && !here.some((m) => m.id === dragRef.current);
                const dropHere = canDrop();
                return (
                  <div
                    key={cellKey}
                    onDragOver={(e) => {
                      if (!canDrop()) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (overCell !== cellKey) setOverCell(cellKey);
                    }}
                    onDragLeave={() => overCell === cellKey && setOverCell(null)}
                    onDrop={(e) => {
                      if (!canDrop()) return;
                      e.preventDefault();
                      const id = e.dataTransfer.getData('text/mission') || dragRef.current;
                      setOverCell(null);
                      setDragging(null);
                      dragRef.current = null;
                      if (id) onMove?.(id, date);
                    }}
                    className={`min-w-0 rounded-se-sm transition-colors ${labelled ? 'py-2 border-b border-se-line/60 min-h-[80px] flex flex-col' : ''} ${
                      dropHere && overCell === cellKey ? 'bg-se-blue-wash/70 ring-2 ring-se-blue/40' : ''
                    }`}
                  >
                    {here.length === 0 ? (
                      open.length > 0 ? (
                        // Attendu par la config mais personne : une case qui clignote par créneau.
                        <div className="h-full flex flex-col gap-1.5">
                          {open.map((x) => needButton(row, date, x, open.length === 1))}
                        </div>
                      ) : plusOnly ? (
                        // Mode auto-entrepreneur : rien ne dit qu'un poste est attendu — juste un « + ».
                        <button
                          type="button"
                          onClick={() => onCreate?.(row.poste, date)}
                          title={row.poste ? `Créer une mission ${row.poste}` : 'Créer une mission'}
                          aria-label={`Créer une mission${row.poste ? ` ${row.poste}` : ''} ce jour`}
                          className="w-full h-full min-h-[64px] rounded-se-sm border border-dashed border-se-line/60 grid place-items-center text-se-muted/50 hover:text-se-freelance-ink hover:border-se-freelance hover:bg-se-freelance-wash/30 transition-colors"
                        >
                          <Plus className="w-4 h-4" aria-hidden="true" />
                        </button>
                      ) : row.off?.(date) ? (
                        // Vue par personne : la case dit pourquoi la personne n'est pas là (repos, congés…).
                        <div
                          className="flex-1 h-full min-h-[64px] rounded-se-sm bg-se-surface-2/70 border border-se-line/40 grid place-items-center"
                          title={`Indisponible : ${row.off(date)}`}
                        >
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-se-muted">
                            <BedDouble className="w-3 h-3" aria-hidden="true" /> {row.off(date)}
                          </span>
                        </div>
                      ) : (
                        <div
                          className="flex-1 h-full min-h-[64px] rounded-se-sm border border-dashed border-se-line/40"
                          aria-hidden="true"
                        />
                      )
                    ) : (
                      <div className="space-y-2">
                        {here.map((m) => {
                          const linked = !!m.eventId && m.eventId === hoveredEvent;
                          return (
                            <div
                              key={m.id}
                              draggable={!!onMove && isLive(m)}
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/mission', m.id);
                                e.dataTransfer.effectAllowed = 'move';
                                dragRef.current = m.id;
                                setDragging(m.id);
                              }}
                              onDragEnd={() => {
                                dragRef.current = null;
                                setDragging(null);
                                setOverCell(null);
                              }}
                              title={
                                onMove && isLive(m)
                                  ? 'Glissez la carte sur un autre jour pour déplacer la mission'
                                  : undefined
                              }
                              onMouseEnter={() => m.eventId && setHoveredEvent(m.eventId)}
                              onMouseLeave={() => m.eventId && setHoveredEvent(null)}
                              className={`rounded-se transition-shadow ${onMove && isLive(m) ? 'cursor-grab active:cursor-grabbing' : ''} ${
                                linked ? 'ring-2 ring-se-blue ring-offset-2 ring-offset-se-surface' : ''
                              } ${dragging === m.id ? 'opacity-40' : ''}`}
                            >
                              {renderCard(m)}
                            </div>
                          );
                        })}
                        {/* Des missions, mais pas sur tous les créneaux attendus (ou seulement des annulées) : le besoin reste. */}
                        {open.map((x) => needButton(row, date, x, false))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
