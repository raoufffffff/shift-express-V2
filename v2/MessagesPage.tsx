/**
 * Messages — tous les fils de mission au même endroit. À gauche, une ligne par
 * mission qui a des participants (placés, postulants) ou des messages envoyés,
 * avec le dernier message ; à droite, le fil complet (même composant que dans
 * la fenêtre de mission). Un bouton ouvre la mission sur le planning.
 * Sur téléphone : la liste, puis le fil avec un retour.
 */
import { useMemo, useState } from 'react';
import { MOCK_TODAY } from '@/mocks/v2Today';
import { Search, MessageSquare, CalendarDays, ChevronLeft, ArrowUpRight } from 'lucide-react';
import type { Mission } from '@/mocks/v2Missions';
import { useV2Ui } from '@/stores/v2UiStore';
import { useV2People } from '@/stores/v2PeopleStore';
import { useVisibleMissions, effPlaced } from './mission/missionStore';
import { MessagesTab, seedThread } from './mission/MessagesTab';
import { missionFill } from './coverage';
import { Avatar } from './Avatar';
import { parseISO } from './time';

/** « Aujourd'hui » de la maquette. */
const TODAY = MOCK_TODAY;

const fmtDay = (iso: string) =>
  parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

interface Thread {
  mission: Mission;
  lastText: string;
  lastTime: string;
  /** messages envoyés pendant la session */
  sent: number;
  participants: { id: string; name: string; kind: Mission['placed'][number]['kind'] }[];
}

export function MessagesPage() {
  const freelanceOnly = useV2Ui((s) => s.mode) === 'freelance';
  const missions = useVisibleMissions(freelanceOnly);
  const stored = useV2People((s) => s.threads);
  const requestOpenMission = useV2Ui((s) => s.requestOpenMission);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Un fil par mission avec quelqu'un à qui parler : les plus proches d'aujourd'hui d'abord.
  const threads = useMemo<Thread[]>(() => {
    const today = parseISO(TODAY).getTime();
    return missions
      .map((m) => {
        // Mission terminée : les auto-entrepreneurs quittent la messagerie.
        const ended = m.date < TODAY;
        const placed = effPlaced(m).filter((p) => !p.suggested && !(ended && p.kind === 'freelance'));
        const candidates = m.candidates.filter(
          (c) => !placed.some((p) => p.id === c.id) && !(ended && c.kind === 'freelance'),
        );
        const seed = seedThread(m, placed);
        const sent = stored[m.id] ?? [];
        const last = sent[sent.length - 1] ?? seed[seed.length - 1];
        return {
          mission: m,
          lastText: last?.text ?? '',
          lastTime: last?.time ?? '',
          sent: sent.length,
          participants: [...placed, ...candidates].map((p) => ({ id: p.id, name: p.name, kind: p.kind })),
        };
      })
      .filter((t) => t.participants.length > 0 || t.sent > 0)
      .sort(
        (a, b) =>
          Math.abs(parseISO(a.mission.date).getTime() - today) - Math.abs(parseISO(b.mission.date).getTime() - today) ||
          a.mission.start.localeCompare(b.mission.start),
      );
  }, [missions, stored]);

  const shown = threads.filter((t) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      t.mission.poste.toLowerCase().includes(q) ||
      t.mission.establishment.toLowerCase().includes(q) ||
      t.participants.some((p) => p.name.toLowerCase().includes(q))
    );
  });
  const selected = threads.find((t) => t.mission.id === selectedId) ?? null;

  // La fenêtre s'ouvre ici même, par-dessus les messages.
  const openMission = (m: Mission) => requestOpenMission(m.id);

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <header className="mb-5">
        <p className="se-eyebrow mb-1">Un fil par mission</p>
        <h1 className="text-3xl font-extrabold text-se-ink">Messages</h1>
        <p className="text-se-muted mt-1 text-sm">
          {threads.length} conversation{threads.length > 1 ? 's' : ''} ·{' '}
          {freelanceOnly ? 'avec les auto-entrepreneurs' : 'avec les personnes placées et les postulants'}
        </p>
      </header>

      <div className="grid md:grid-cols-[360px_1fr] gap-4 items-start">
        {/* ── Liste des fils ── */}
        <div className={`${selected ? 'hidden md:block' : ''}`}>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-se-muted" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher un poste, un lieu, un nom…"
              className="w-full h-10 pl-9 pr-3 rounded-se-sm border border-se-line bg-se-surface text-sm text-se-ink focus:outline-none focus:border-se-blue"
            />
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-se-muted bg-se-surface border border-se-line rounded-se p-6 text-center">
              Aucune conversation. Les fils apparaissent dès qu'une mission a des participants.
            </p>
          ) : (
            <ul className="bg-se-surface border border-se-line rounded-se shadow-se divide-y divide-se-line overflow-hidden">
              {shown.map((t) => {
                const on = t.mission.id === selectedId;
                const fill = missionFill(t.mission);
                return (
                  <li key={t.mission.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.mission.id)}
                      className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-se-surface-2 ${on ? 'bg-se-blue-wash/50' : ''}`}
                    >
                      <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${fill.band}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="font-semibold text-se-ink truncate">{t.mission.poste}</span>
                          <span className="text-xs text-se-muted whitespace-nowrap">
                            {fmtDay(t.mission.date)} · {t.mission.start}–{t.mission.end}
                          </span>
                          <span className="ml-auto text-[11px] text-se-muted whitespace-nowrap">{t.lastTime}</span>
                        </span>
                        <span className="block text-xs text-se-muted truncate">{t.mission.establishment}</span>
                        <span className="block text-sm text-se-ink/80 truncate mt-1">{t.lastText}</span>
                        <span className="flex items-center mt-1.5">
                          {t.participants.slice(0, 5).map((p, i) => (
                            <span key={p.id} className={i > 0 ? '-ml-1.5' : ''}>
                              <Avatar person={p} size={20} ring />
                            </span>
                          ))}
                          {t.participants.length > 5 && (
                            <span className="ml-1.5 text-[11px] text-se-muted">+{t.participants.length - 5}</span>
                          )}
                          {t.sent > 0 && (
                            <span className="ml-auto se-badge bg-se-blue-wash text-se-blue-ink" style={{ height: 18 }}>
                              {t.sent} envoyé{t.sent > 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Le fil ── */}
        <div className={`${selected ? '' : 'hidden md:block'}`}>
          {selected ? (
            <div className="bg-se-surface border border-se-line rounded-se shadow-se overflow-hidden">
              <header className="flex items-center gap-3 px-4 py-3 border-b border-se-line">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label="Retour à la liste"
                  className="md:hidden w-8 h-8 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${missionFill(selected.mission).band}`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <h2 className="text-base font-extrabold text-se-ink truncate">
                    {selected.mission.poste} · {fmtDay(selected.mission.date)}
                  </h2>
                  <p className="text-xs text-se-muted truncate">
                    {selected.mission.establishment} · {selected.mission.start}–{selected.mission.end}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openMission(selected.mission)}
                  className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-se-sm text-xs font-semibold border border-se-line bg-se-surface text-se-ink hover:bg-se-surface-2 whitespace-nowrap"
                >
                  <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" /> Ouvrir la mission
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </header>
              <MessagesTab key={selected.mission.id} mission={selected.mission} />
            </div>
          ) : (
            <div className="bg-se-surface border border-se-line rounded-se shadow-se min-h-[420px] grid place-items-center text-center p-8">
              <div>
                <MessageSquare className="w-8 h-8 mx-auto text-se-muted mb-2" aria-hidden="true" />
                <p className="font-semibold text-se-ink">Choisissez une conversation</p>
                <p className="text-sm text-se-muted mt-1">
                  Chaque fil reste lié à sa mission : on y parle du créneau, pas ailleurs.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
