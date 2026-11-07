/**
 * Vue Mois — façon Ubeya : le calendrier occupe toute la hauteur qui reste
 * sous les boutons, les semaines du mois s'empilent, chaque jour montre ses
 * missions en cartes compactes (bandeau rouge · orange · vert avec le poste et
 * le ratio, horaires, %, photos). L'en-tête Lun→Dim reste collé en haut
 * pendant qu'on descend ; la page, elle, ne bouge pas.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, UserMinus } from 'lucide-react';
import type { Mission } from '@/mocks/v2Missions';
import { usePosteNeeds, uncoveredSlots } from '@/stores/v2SettingsStore';
import { missionFill, cancelledStyle, fillTone } from '../coverage';
import {
  useMissionStore,
  effPlaced,
  effPlacedCount,
  effRequired,
  isLive,
  pendingReleases,
} from '../mission/missionStore';
import { Avatar } from '../Avatar';
import { missionTimeLabel, parseISO, toISO } from '../time';

interface Props {
  missions: Mission[];
  today: string;
  /** incrémenté par le bouton « Aujourd'hui » pour revenir au mois courant */
  focusToken: number;
  onOpen: (missionId: string) => void;
  /** jour avec des postes attendus mais sans mission → publier */
  onCreate?: (date: string) => void;
  /** postes concernés par « à pourvoir » (filtre) ; défaut : toute la config */
  postes?: string[];
  /** afficher les « à pourvoir » (désactivé en vue par personnel) */
  needs?: boolean;
  /** mode auto-entrepreneur : pas d'« à pourvoir », un « + » discret par jour */
  plusOnly?: boolean;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Teinte du compteur du jour : la même règle de couleur que partout. */
const tone = fillTone;

export function MonthView({
  missions,
  today,
  focusToken,
  onOpen,
  onCreate,
  postes,
  needs = true,
  plusOnly = false,
}: Props) {
  const init = parseISO(today);
  const [ym, setYm] = useState({ y: init.getFullYear(), m: init.getMonth() });
  const posteConfig = usePosteNeeds(); // besoins quotidiens (Réglages)

  // Le bouton « Aujourd'hui » ramène au mois du jour.
  useEffect(() => {
    const d = parseISO(today);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  }, [focusToken, today]);

  // Le cadre prend toute la hauteur restante de l'écran (jusqu'au bas, moins une marge).
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameHeight, setFrameHeight] = useState<number>(600);
  useLayoutEffect(() => {
    const measure = () => {
      const top = frameRef.current?.getBoundingClientRect().top ?? 0;
      setFrameHeight(Math.max(window.innerHeight - top - 16, 420));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const first = new Date(ym.y, ym.m, 1);
  const lead = (first.getDay() + 6) % 7; // nombre de jours avant le 1er (lundi = 0)
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - lead);
  const rows = Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + w * 7 + i);
      return d;
    }),
  );

  const monthLabel = first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  // Les annulées restent affichées (hachurées) mais ne comptent plus.
  const live = missions.filter(isLive);
  const inMonthMissions = live.filter((m) => {
    const d = parseISO(m.date);
    return d.getFullYear() === ym.y && d.getMonth() === ym.m;
  });
  const monthPlaced = inMonthMissions.reduce((s, m) => s + effPlacedCount(m), 0);
  const monthRequired = inMonthMissions.reduce((s, m) => s + effRequired(m), 0);

  return (
    <div>
      {/* Navigation du mois + total */}
      <div className="flex items-center gap-1 mb-2">
        <button
          type="button"
          aria-label="Mois précédent"
          onClick={() => setYm(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))}
          className="w-8 h-8 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <p className="font-display font-extrabold text-se-ink capitalize min-w-[170px] text-center">{monthLabel}</p>
        <button
          type="button"
          aria-label="Mois suivant"
          onClick={() => setYm(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}
          className="w-8 h-8 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <p className="ml-3 text-sm text-se-muted">
          <span className={`font-semibold ${tone(monthPlaced, monthRequired)}`}>
            {monthPlaced}/{monthRequired}
          </span>{' '}
          placés · {inMonthMissions.length} mission{inMonthMissions.length > 1 ? 's' : ''} ce mois
        </p>
      </div>

      {/* Le calendrier : toute la hauteur restante, défile tout seul, en-tête fixe */}
      <div
        ref={frameRef}
        style={{ height: frameHeight }}
        className="overflow-y-auto rounded-se border border-se-line bg-se-surface shadow-se"
      >
        <div className="sticky top-0 z-10 grid grid-cols-7 bg-se-surface border-b border-se-line">
          {WEEKDAYS.map((w) => (
            <p key={w} className="se-eyebrow text-center py-2 border-r border-se-line/60 last:border-r-0">
              {w}
            </p>
          ))}
        </div>

        {rows.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-se-line last:border-b-0">
            {week.map((d) => {
              const iso = toISO(d);
              const inMonth = d.getMonth() === ym.m;
              const isToday = iso === today;
              const list = missions.filter((m) => m.date === iso).sort((a, b) => a.start.localeCompare(b.start));
              const liveList = list.filter(isLive);
              const placed = liveList.reduce((s, m) => s + effPlacedCount(m), 0);
              const required = liveList.reduce((s, m) => s + effRequired(m), 0);
              // Créneaux attendus ce jour (config du compte) sans mission dessus.
              const missing = inMonth && needs ? uncoveredSlots(posteConfig, iso, liveList, postes).length : 0;
              return (
                <div
                  key={iso}
                  className={`min-h-[132px] p-1.5 border-r border-se-line/60 last:border-r-0 ${
                    inMonth ? 'bg-se-surface' : 'bg-se-surface-2/50'
                  } ${isToday ? 'bg-se-blue-wash/40' : ''}`}
                >
                  {/* Numéro du jour + (placés/besoin/missions), comme Ubeya */}
                  <div className="flex items-center gap-1 mb-1 h-6">
                    <span
                      className={`font-extrabold font-display leading-none ${
                        isToday
                          ? 'text-white bg-se-blue rounded-full w-6 h-6 grid place-items-center text-xs'
                          : inMonth
                            ? 'text-se-ink text-base'
                            : 'text-se-muted/50 text-base'
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    {liveList.length > 0 && (
                      <span className={`ml-auto text-[10px] font-semibold tabular-nums ${tone(placed, required)}`}>
                        ({placed}/{required}/{liveList.length})
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    {list.map((m) => (
                      <MonthCard key={m.id} mission={m} onOpen={() => onOpen(m.id)} />
                    ))}
                    {plusOnly && inMonth && (
                      <button
                        type="button"
                        onClick={() => onCreate?.(iso)}
                        aria-label={`Créer une mission le ${d.getDate()}`}
                        title="Créer une mission"
                        className="w-full h-7 rounded-[6px] text-se-muted/50 border border-dashed border-se-line/60 grid place-items-center hover:text-se-freelance-ink hover:border-se-freelance hover:bg-se-freelance-wash/30 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                    {missing > 0 && (
                      <button
                        type="button"
                        onClick={() => onCreate?.(iso)}
                        title="Postes attendus sans mission — publier"
                        className="w-full h-7 rounded-[6px] text-[11px] font-semibold text-se-danger border border-dashed border-se-danger/60 bg-se-danger-wash/50 animate-pulse hover:bg-se-danger-wash inline-flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3 h-3" aria-hidden="true" /> {missing} à pourvoir
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Carte compacte d'un jour du mois : bandeau (poste · placés/besoin) coloré
 * rouge · orange · vert, puis horaires et %, puis les photos avec leur lettre.
 */
function MonthCard({ mission, onOpen }: { mission: Mission; onOpen: () => void }) {
  useMissionStore();
  const cancelled = !!mission.cancelled;
  const style = cancelled ? cancelledStyle : missionFill(mission);
  const placed = effPlacedCount(mission);
  const required = effRequired(mission);
  const pct = required ? Math.round((placed / required) * 100) : 0;
  const faces = effPlaced(mission)
    .filter((p) => !p.suggested)
    .slice(0, 3);
  const more = Math.max(placed - faces.length, 0);
  const released = cancelled ? 0 : pendingReleases(mission).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${mission.poste} · ${mission.establishment} · ${placed}/${required}${released ? ' · shift relâché, à republier' : ''}`}
      aria-label={`${mission.poste} · ${placed} sur ${required}`}
      className={`w-full text-left rounded-[6px] overflow-hidden border border-se-line hover:border-se-muted transition-colors ${
        cancelled ? 'se-hatched' : 'bg-se-surface'
      }`}
    >
      <div
        className={`flex items-center justify-between gap-1 px-1.5 py-0.5 text-[11px] font-semibold ${style.band} ${
          style.dash ? 'border-b border-dashed border-white/60' : ''
        } ${cancelled ? 'border-b border-se-line' : 'text-white'}`}
      >
        <span className={`truncate ${cancelled ? 'line-through' : ''}`}>{mission.poste}</span>
        <span className="whitespace-nowrap">{cancelled ? 'Annulée' : `${placed}/${required}`}</span>
      </div>
      <div className="px-1.5 py-1">
        <div className="flex items-center justify-between gap-1 text-[10px] leading-none">
          <span className="font-medium text-se-ink whitespace-nowrap">{missionTimeLabel(mission)}</span>
          {!cancelled && <span className={tone(placed, required)}>{pct} %</span>}
        </div>
        {faces.length > 0 && (
          <div className="flex items-center mt-1">
            {faces.map((p, i) => (
              <span key={p.id} className={i > 0 ? '-ml-1' : ''}>
                <Avatar person={p} size={18} tag ring />
              </span>
            ))}
            {more > 0 && <span className="ml-1 text-[10px] text-se-muted">+{more}</span>}
          </div>
        )}
        {released > 0 && (
          <p className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-se-danger">
            <UserMinus className="w-3 h-3 shrink-0" aria-hidden="true" /> Shift relâché
          </p>
        )}
        <p className="mt-1 text-[10px] text-se-muted truncate">{mission.establishment}</p>
      </div>
    </button>
  );
}
