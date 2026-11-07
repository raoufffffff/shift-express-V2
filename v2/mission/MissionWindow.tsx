/**
 * Fenêtre d'une mission (le cœur de l'app v2).
 * Overlay à 3 colonnes ouvert depuis une carte du Planning.
 * En-tête : ‹ › mission précédente / suivante, poste, statut, établissement.
 * 3 onglets seulement : Planification · Feuille de temps · Messages.
 */
import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Link2 } from 'lucide-react';
import type { Mission } from '@/mocks/v2Missions';
import { missionsOfEvent } from '@/mocks/v2Missions';
import { missionFill, cancelledStyle, missionStatusLabel } from '../coverage';
import { PlanificationTab } from './PlanificationTab';
import { FeuilleTab } from './FeuilleTab';
import { MessagesTab } from './MessagesTab';
import { EventWindow } from './EventWindow';
import { CancelledBody } from './CancelledBody';
import { missionTimeLabel } from '../time';
import { missionRef } from '../missionRef';

type Tab = 'planification' | 'feuille' | 'messages';

interface Props {
  missions: Mission[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}

export function MissionWindow({ missions, index, onIndexChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('planification');
  const [showEvent, setShowEvent] = useState(false);
  const mission = missions[index];
  // Annulée : la fenêtre reste ouvrable (trace), grise, en lecture seule.
  const cancelled = !!mission.cancelled;
  const style = cancelled ? cancelledStyle : missionFill(mission);

  // Jours de l'événement auquel appartient la mission (le cas échéant).
  const eventDays = mission.eventId ? missionsOfEvent(mission.eventId) : [];
  const dayIndex = eventDays.findIndex((d) => d.id === mission.id);

  const go = useCallback(
    (delta: number) => {
      const next = (index + delta + missions.length) % missions.length;
      onIndexChange(next);
    },
    [index, missions.length, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  const dateLabel = new Date(mission.date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6">
      {/* fond */}
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-se-ink/40" />

      {/* Téléphone : plein écran. Grand écran : hauteur fixe, les colonnes défilent chacune de leur côté. */}
      <div className="se-root relative w-full max-w-6xl h-full sm:h-auto sm:max-h-[92vh] lg:h-[92vh] flex flex-col bg-se-surface rounded-none sm:rounded-se shadow-se-md overflow-hidden">
        {/* En-tête */}
        <header className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 border-b border-se-line">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Mission précédente"
              onClick={() => go(-1)}
              className="w-8 h-8 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              aria-label="Mission suivante"
              onClick={() => go(1)}
              className="w-8 h-8 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <span
            className={`w-1.5 self-stretch rounded-full ${style.band} ${style.dash ? 'opacity-60' : ''}`}
            aria-hidden="true"
          />

          <div className="min-w-0">
            <h2
              className={`text-base sm:text-lg font-extrabold truncate ${cancelled ? 'text-se-muted line-through' : 'text-se-ink'}`}
            >
              {mission.poste} · <span className="font-semibold text-se-muted">{dateLabel}</span>
            </h2>
            <p className="text-sm text-se-muted truncate">
              {mission.establishment} · {missionTimeLabel(mission)} ·{' '}
              <span className="tabular-nums select-all" title="Numéro de la mission">
                {missionRef(mission.id)}
              </span>
            </p>
          </div>

          <span className={`se-badge ${cancelled ? 'bg-se-surface-2 text-se-muted' : style.badge} ml-auto`}>
            {cancelled ? 'Annulée' : missionStatusLabel(mission)}
          </span>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Bandeau événement : la mission est un jour d'un événement */}
        {mission.eventId && (
          <div className="flex items-center gap-2 px-4 py-2 bg-se-blue-wash border-b border-se-line">
            <Link2 className="w-4 h-4 text-se-blue-ink shrink-0" aria-hidden="true" />
            <p className="text-sm text-se-ink truncate">
              <span className="font-semibold">{mission.eventName}</span>
              {dayIndex >= 0 && (
                <span className="text-se-muted">
                  {' '}
                  · jour {dayIndex + 1}/{eventDays.length}
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={() => setShowEvent(true)}
              className="ml-auto text-sm font-semibold text-se-blue-ink hover:text-se-blue whitespace-nowrap"
            >
              Voir tout l'événement
            </button>
          </div>
        )}

        {/* Onglets (pas pour une mission annulée : lecture seule) */}
        {cancelled ? (
          <div className="flex-1 overflow-y-auto">
            <CancelledBody mission={mission} />
          </div>
        ) : (
          <>
            <div className="flex gap-1 px-3 sm:px-4 pt-1.5 border-b border-se-line overflow-x-auto">
              {(
                [
                  ['planification', 'Planification'],
                  ['feuille', "Relevé d'heures"],
                  ['messages', 'Messages'],
                ] as [Tab, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                    tab === key ? 'border-se-blue text-se-ink' : 'border-transparent text-se-muted hover:text-se-ink'
                  }`}
                >
                  {key === 'feuille' ? (
                    <>
                      <span className="sm:hidden">Heures</span>
                      <span className="hidden sm:inline">{label}</span>
                    </>
                  ) : (
                    label
                  )}
                </button>
              ))}
            </div>

            {/* Corps */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {tab === 'planification' && <PlanificationTab mission={mission} />}
              {tab === 'feuille' && <FeuilleTab mission={mission} />}
              {tab === 'messages' && <MessagesTab mission={mission} />}
            </div>
          </>
        )}
      </div>

      {showEvent && mission.eventId && (
        <EventWindow
          eventId={mission.eventId}
          onClose={() => setShowEvent(false)}
          onOpenDay={(id) => {
            const i = missions.findIndex((m) => m.id === id);
            if (i >= 0) onIndexChange(i);
            setShowEvent(false);
          }}
        />
      )}
    </div>
  );
}
