/**
 * Fenêtre « Prédictif » — ouverte depuis le badge du planning.
 * Trois blocs, en mots simples :
 *   1. Suggestions en attente (pointillé dans le planning) → « Tout confirmer » ;
 *   2. Équipe habituelle à proposer sur les places libres à venir ;
 *   3. Missions habituelles qui manquent (7 prochains jours) → à créer.
 * On décoche ce qu'on ne veut pas, puis UN bouton « Appliquer ». Rien n'est
 * confirmé d'office : les propositions restent en pointillé jusqu'à confirmation.
 */
import { useMemo, useState } from 'react';
import { X, Sparkles, Check, CalendarPlus, Users, Info } from 'lucide-react';
import type { Mission } from '@/mocks/v2Missions';
import { useV2Settings } from '@/stores/v2SettingsStore';
import { useV2People } from '@/stores/v2PeopleStore';
import { Avatar } from '../Avatar';
import { personKindStyle } from '../coverage';
import { useUnavailability, offLabel } from '../people/availability';
import { useMissionStore } from '../mission/missionStore';
import { missionTimeLabel } from '../time';
import {
  predictTeams,
  predictShifts,
  pendingSuggestions,
  applyTeamSuggestions,
  applyShiftProposals,
  confirmSuggestions,
} from './prediction';
import { addDays } from '../time';

interface Props {
  /** missions affichées (annulées comprises ; le moteur les ignore) */
  missions: Mission[];
  today: string;
  /** établissement filtré, ou le nom de l'établissement principal */
  establishment: string;
  onClose: () => void;
  onOpenMission: (id: string) => void;
}

const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
};

export function PredictionDialog({ missions, today, establishment, onClose, onOpenMission }: Props) {
  const version = useMissionStore();
  const staff = useV2Settings((s) => s.staff);
  const postes = useV2Settings((s) => s.postes);
  const statuses = useV2People((s) => s.statuses);
  const isOff = useUnavailability();

  const [offTeams, setOffTeams] = useState<Set<string>>(new Set());
  const [offShifts, setOffShifts] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<{ proposed: number; created: number; confirmed: number; dropped: string[] } | null>(
    null,
  );

  const ctx = useMemo(() => ({ today, isOff, staff, statuses }), [today, isOff, staff, statuses]);
  const pending = useMemo(() => {
    void version;
    return pendingSuggestions(missions, today);
  }, [missions, today, version]);
  const teams = useMemo(() => {
    void version;
    return predictTeams(missions, ctx);
  }, [missions, ctx, version]);
  const shifts = useMemo(() => {
    void version;
    return predictShifts(missions, postes, { ...ctx, from: today, days: 7, establishment });
  }, [missions, postes, ctx, today, establishment, version]);

  const teamKey = (t: { mission: Mission }, name: string) => `${t.mission.id}:${name}`;
  const shiftKey = (s: { date: string; poste: string; start: string }) => `${s.date}:${s.poste}:${s.start}`;
  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, k: string) =>
    set((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const selectedTeams = teams
    .map((t) => ({ ...t, adds: t.adds.filter((c) => !offTeams.has(teamKey(t, c.name))) }))
    .filter((t) => t.adds.length > 0);
  const selectedShifts = shifts.filter((s) => !offShifts.has(shiftKey(s)));
  const nProposed = selectedTeams.reduce((s, t) => s + t.adds.length, 0);
  const total = nProposed + selectedShifts.length;

  const apply = () => {
    const proposed = applyTeamSuggestions(selectedTeams);
    const created = applyShiftProposals(selectedShifts).length;
    setDone({ proposed, created, confirmed: 0, dropped: [] });
  };
  const confirmAll = () => {
    const r = confirmSuggestions(missions, isOff);
    setDone({ proposed: 0, created: 0, confirmed: r.confirmed, dropped: r.dropped });
  };

  const pendingConflicts = pending.filter(({ m, p }) => isOff(p, m.date) !== null).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-se-ink/40" />
      <div
        role="dialog"
        aria-label="Prédictif"
        className="se-root relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-se-surface rounded-se shadow-se-md overflow-hidden"
      >
        <header className="flex items-center gap-3 px-5 py-4 border-b border-se-line">
          <span className="w-9 h-9 rounded-se-sm bg-se-blue-wash text-se-blue-ink grid place-items-center shrink-0">
            <Sparkles className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-se-ink">Prédictif</h2>
            <p className="text-xs text-se-muted truncate">
              D'après vos habitudes : qui tient quel poste, quel jour. Rien n'est placé sans votre accord.
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

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {done ? (
            <div className="rounded-se border border-se-line p-4 space-y-2">
              <p className="font-bold text-se-ink inline-flex items-center gap-2">
                <Check className="w-4 h-4 text-se-success" aria-hidden="true" /> C'est fait
              </p>
              {done.proposed > 0 && (
                <p className="text-sm text-se-ink">
                  {done.proposed} personne{done.proposed > 1 ? 's' : ''} proposée{done.proposed > 1 ? 's' : ''} en
                  pointillé dans le planning. Confirmez-les d'ici ou mission par mission.
                </p>
              )}
              {done.created > 0 && (
                <p className="text-sm text-se-ink">
                  {done.created} mission{done.created > 1 ? 's' : ''} habituelle{done.created > 1 ? 's' : ''} créée
                  {done.created > 1 ? 's' : ''}, équipe suggérée dedans.
                </p>
              )}
              {done.confirmed > 0 && (
                <p className="text-sm text-se-ink">
                  {done.confirmed} placement{done.confirmed > 1 ? 's' : ''} confirmé{done.confirmed > 1 ? 's' : ''} :
                  les personnes sont prévenues.
                </p>
              )}
              {done.dropped.length > 0 && (
                <p className="text-sm text-se-cascade-ink">
                  Non confirmé (indisponible ou plus de place) : {done.dropped.join(' · ')}.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* 1. Suggestions en attente */}
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <p className="se-eyebrow">
                    Suggestions en attente <span className="text-se-muted font-normal">· {pending.length}</span>
                  </p>
                  {pending.length > 0 && (
                    <button
                      type="button"
                      onClick={confirmAll}
                      className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-se-sm text-xs font-semibold bg-se-success text-white hover:opacity-90"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" /> Tout confirmer
                    </button>
                  )}
                </div>
                {pending.length === 0 ? (
                  <p className="text-sm text-se-muted">Aucune suggestion en pointillé dans le planning.</p>
                ) : (
                  <ul className="rounded-se border border-se-line divide-y divide-se-line">
                    {pending.map(({ m, p }) => {
                      const off = isOff(p, m.date);
                      return (
                        <li key={`${m.id}:${p.id}`} className="flex items-center gap-3 px-3 py-2">
                          <Avatar person={p} size={28} tag />
                          <button
                            type="button"
                            onClick={() => onOpenMission(m.id)}
                            className="min-w-0 text-left flex-1 hover:underline"
                          >
                            <span className="block text-sm font-semibold text-se-ink truncate">{p.name}</span>
                            <span className="block text-xs text-se-muted truncate">
                              {m.poste} · {fmtDay(m.date)} · {missionTimeLabel(m)}
                            </span>
                          </button>
                          {off ? (
                            <span className="se-badge bg-se-cascade-wash text-se-cascade-ink">{offLabel(off)}</span>
                          ) : (
                            <span className="text-xs text-se-muted">{p.note ?? 'à confirmer'}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {pendingConflicts > 0 && (
                  <p className="text-xs text-se-cascade-ink mt-1.5">
                    {pendingConflicts} personne{pendingConflicts > 1 ? 's' : ''} indisponible
                    {pendingConflicts > 1 ? 's' : ''} ce jour-là : « Tout confirmer » la retire au lieu de la placer.
                  </p>
                )}
              </section>

              {/* 2. Équipe habituelle sur les places libres */}
              <section>
                <p className="se-eyebrow mb-2 inline-flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" aria-hidden="true" /> Équipe habituelle à proposer{' '}
                  <span className="text-se-muted font-normal">· {teams.reduce((s, t) => s + t.adds.length, 0)}</span>
                </p>
                {teams.length === 0 ? (
                  <p className="text-sm text-se-muted">
                    Aucune place libre à venir que votre équipe habituelle pourrait prendre.
                  </p>
                ) : (
                  <ul className="rounded-se border border-se-line divide-y divide-se-line">
                    {teams.map((t) => (
                      <li key={t.mission.id} className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onOpenMission(t.mission.id)}
                          className="text-left text-sm font-semibold text-se-ink hover:underline"
                        >
                          {t.mission.poste} · {fmtDay(t.mission.date)} · {missionTimeLabel(t.mission)}
                          <span className="text-se-muted font-normal">
                            {' '}
                            · {t.free} place{t.free > 1 ? 's' : ''} libre{t.free > 1 ? 's' : ''}
                          </span>
                        </button>
                        <ul className="mt-1.5 space-y-1">
                          {t.adds.map((c) => {
                            const k = teamKey(t, c.name);
                            const on = !offTeams.has(k);
                            return (
                              <li key={k}>
                                <label className="flex items-center gap-2.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={() => toggle(setOffTeams, k)}
                                    className="accent-se-blue w-4 h-4"
                                  />
                                  <Avatar person={{ id: c.id, name: c.name, kind: c.kind }} size={24} tag />
                                  <span className={`text-sm ${on ? 'text-se-ink' : 'text-se-muted line-through'}`}>
                                    {c.name}
                                  </span>
                                  <span className={`text-[11px] ${personKindStyle[c.kind].text}`}>
                                    {personKindStyle[c.kind].label}
                                  </span>
                                  <span className="ml-auto text-xs text-se-muted">
                                    {c.times > 0
                                      ? `${c.times} fois sur ce poste${c.sameWeekday > 0 ? ` · ${c.sameWeekday} le même jour` : ''}`
                                      : 'tient ce poste'}
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* 3. Missions habituelles qui manquent */}
              <section>
                <p className="se-eyebrow mb-2 inline-flex items-center gap-1.5">
                  <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" /> Missions habituelles à créer{' '}
                  <span className="text-se-muted font-normal">
                    · {fmtDay(today)} → {fmtDay(addDays(today, 6))} · {shifts.length}
                  </span>
                </p>
                {shifts.length === 0 ? (
                  <p className="text-sm text-se-muted">Tous les postes attendus ces 7 jours ont leur mission.</p>
                ) : (
                  <ul className="rounded-se border border-se-line divide-y divide-se-line">
                    {shifts.map((s) => {
                      const k = shiftKey(s);
                      const on = !offShifts.has(k);
                      return (
                        <li key={k} className="px-3 py-2">
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggle(setOffShifts, k)}
                              className="accent-se-blue w-4 h-4 mt-0.5"
                            />
                            <span className="min-w-0 flex-1">
                              <span
                                className={`block text-sm font-semibold ${on ? 'text-se-ink' : 'text-se-muted line-through'}`}
                              >
                                {s.poste} · {fmtDay(s.date)} · {s.label} {s.start}–{s.end} · {s.count} poste
                                {s.count > 1 ? 's' : ''}
                              </span>
                              <span className="block text-xs text-se-muted">
                                {s.team.length > 0
                                  ? `Équipe habituelle suggérée : ${s.team.map((c) => c.name).join(', ')}`
                                  : 'Personne d’habituel disponible : la mission sera à pourvoir.'}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <p className="text-xs text-se-muted inline-flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                Une suggestion compte comme une place prise : jamais de surbooking, personne en repos ou absent,
                personne deux fois le même jour. Les auto-entrepreneurs ne sont jamais placés d'office : ils se
                proposent.
              </p>
            </>
          )}
        </div>

        <footer className="flex items-center gap-2 px-5 py-3 border-t border-se-line bg-se-surface-2/60">
          {done ? (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto px-4 py-2 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:opacity-90"
            >
              Fermer
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface"
              >
                Plus tard
              </button>
              <button
                type="button"
                disabled={total === 0}
                onClick={apply}
                className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:opacity-90 disabled:opacity-40"
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" /> Appliquer
                {total > 0
                  ? ` · ${nProposed > 0 ? `${nProposed} proposition${nProposed > 1 ? 's' : ''}` : ''}${
                      nProposed > 0 && selectedShifts.length > 0 ? ' + ' : ''
                    }${selectedShifts.length > 0 ? `${selectedShifts.length} mission${selectedShifts.length > 1 ? 's' : ''}` : ''}`
                  : ''}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
