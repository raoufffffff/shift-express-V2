/**
 * « Envoyer la semaine aux équipes » — chaque personne placée reçoit ses
 * créneaux de la semaine (appli et e-mail, en vrai). Avant d'envoyer, on voit
 * qui recevra quoi, et ce qui cloche encore (places à pourvoir, repos non
 * respecté) — on peut quand même envoyer. Une fois la semaine envoyée, un
 * second envoi ne prévient que les personnes dont quelque chose a changé.
 */
import { useMemo, useState } from 'react';
import { X, Send, Check, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useV2Settings } from '@/stores/v2SettingsStore';
import { Avatar } from '../Avatar';
import { personKindStyle } from '../coverage';
import {
  useMissionStore,
  effMissions,
  effPlacedCount,
  effRequired,
  effSentWeek,
  sendWeek,
  weekChangesSince,
  weekShiftsByPerson,
} from '../mission/missionStore';
import { addDays, missionHours, parseISO } from '../time';
import { restIssues } from './weekPlan';

interface Props {
  weekStart: string;
  onClose: () => void;
}

const fmtDay = (iso: string) =>
  parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};

export function SendWeekDialog({ weekStart, onClose }: Props) {
  const version = useMissionStore();
  const restRules = useV2Settings((s) => s.restRules);
  const staff = useV2Settings((s) => s.staff);
  const [sentTo, setSentTo] = useState<number | null>(null);

  const label = `semaine du ${fmtDay(weekStart)} au ${fmtDay(addDays(weekStart, 6))}`;
  const already = effSentWeek(weekStart);
  const changes = useMemo(() => {
    void version;
    return weekChangesSince(weekStart);
  }, [weekStart, version]);
  const changedNames = new Set(changes.map((c) => c.name));

  // Qui reçoit quoi : toutes les personnes placées (premier envoi), ou seulement celles dont ça a changé.
  const rows = useMemo(() => {
    void version;
    const by = weekShiftsByPerson(weekStart);
    const all = Array.from(by.values());
    // Une personne retirée de tout : elle doit aussi être prévenue (plus rien à faire).
    changes
      .filter((c) => !by.has(c.name))
      .forEach((c) => all.push({ person: { id: c.name, name: c.name, kind: 'salarie' }, missions: [] }));
    const shown = already ? all.filter((r) => changedNames.has(r.person.name)) : all;
    return shown.sort(
      (a, b) =>
        Number(b.person.kind === 'salarie') - Number(a.person.kind === 'salarie') ||
        a.person.name.localeCompare(b.person.name),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, version, already, changes]);

  // Ce qui cloche encore, en mots simples : on peut envoyer quand même.
  const warnings = useMemo(() => {
    void version;
    const end = addDays(weekStart, 6);
    const week = effMissions().filter((m) => m.date >= weekStart && m.date <= end);
    const missing = week.reduce((s, m) => s + Math.max(effRequired(m) - effPlacedCount(m), 0), 0);
    const all = effMissions();
    const rest = staff.filter((r) => restIssues(all, r.name, weekStart, restRules).length > 0).map((r) => r.name);
    const out: { icon: 'missing' | 'rest'; text: string }[] = [];
    if (missing > 0)
      out.push({
        icon: 'missing',
        text: `${missing} place${missing > 1 ? 's' : ''} encore à pourvoir : les personnes placées recevront quand même leur planning.`,
      });
    if (rest.length > 0) out.push({ icon: 'rest', text: `Repos non respecté : ${rest.join(', ')}.` });
    return out;
  }, [weekStart, version, staff, restRules]);

  const totalShifts = rows.reduce((s, r) => s + r.missions.length, 0);
  const nothingToSend = rows.length === 0;

  const send = () =>
    setSentTo(sendWeek(weekStart, `Semaine du ${fmtDay(weekStart)} au ${fmtDay(addDays(weekStart, 6))}`));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-se-ink/40" />
      <div
        role="dialog"
        aria-label="Envoyer la semaine aux équipes"
        className="se-root relative w-full max-w-xl max-h-[92vh] flex flex-col bg-se-surface rounded-se shadow-se-md overflow-hidden"
      >
        <header className="flex items-center gap-3 px-5 py-4 border-b border-se-line">
          <span className="w-9 h-9 rounded-se-sm bg-se-blue-wash text-se-blue-ink grid place-items-center shrink-0">
            <Send className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-se-ink leading-tight">
              {already ? 'Envoyer les changements' : 'Envoyer la semaine aux équipes'}
            </h2>
            <p className="text-xs text-se-muted">
              {label}
              {already ? ` · déjà envoyée ${fmtWhen(already.at)}` : ''}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-se-sm text-se-muted hover:text-se-ink hover:bg-se-surface-2"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {sentTo !== null ? (
            <div className="text-center py-8">
              <Check className="w-8 h-8 mx-auto text-se-success mb-2" aria-hidden="true" />
              <p className="font-semibold text-se-ink">
                {already && sentTo === 0
                  ? 'Rien de nouveau à envoyer'
                  : `${sentTo} personne${sentTo > 1 ? 's' : ''} prévenue${sentTo > 1 ? 's' : ''}`}
              </p>
              <p className="text-sm text-se-muted mt-1">
                Chacun·e a reçu ses créneaux de la semaine dans son appli et par e-mail. Si vous changez quelque chose
                ensuite, seules les personnes concernées seront prévenues à nouveau.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-se-ink">
                {already
                  ? nothingToSend
                    ? 'Rien n’a changé depuis le dernier envoi : tout le monde a déjà le bon planning.'
                    : `Depuis le dernier envoi, ${rows.length} personne${rows.length > 1 ? 's ont vu leurs' : ' a vu ses'} créneaux changer. Seules ces personnes seront prévenues.`
                  : nothingToSend
                    ? 'Personne n’est placé sur cette semaine : rien à envoyer pour l’instant.'
                    : `${rows.length} personne${rows.length > 1 ? 's' : ''} recevron${rows.length > 1 ? 't' : 'a'} ${totalShifts} créneau${totalShifts > 1 ? 'x' : ''} dans leur appli et par e-mail. Chacun·e ne voit que les siens.`}
              </p>

              {warnings.length > 0 && !nothingToSend && (
                <ul className="space-y-1.5">
                  {warnings.map((w) => (
                    <li
                      key={w.text}
                      className="flex items-start gap-2 rounded-se-sm bg-se-cascade-wash text-se-cascade-ink text-sm px-3 py-2"
                    >
                      {w.icon === 'rest' ? (
                        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                      )}
                      <span>{w.text}</span>
                    </li>
                  ))}
                </ul>
              )}

              <ul className="divide-y divide-se-line rounded-se border border-se-line">
                {rows.map((r) => {
                  const hours = Math.round(r.missions.reduce((s, m) => s + missionHours(m), 0) * 10) / 10;
                  const change = changes.find((c) => c.name === r.person.name);
                  return (
                    <li key={r.person.name} className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar person={r.person} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-se-ink truncate">{r.person.name}</p>
                          <p className={`text-[11px] ${personKindStyle[r.person.kind].text}`}>
                            {personKindStyle[r.person.kind].label}
                            <span className="text-se-muted">
                              {' '}
                              · {r.missions.length} créneau{r.missions.length > 1 ? 'x' : ''} · {hours} h
                            </span>
                          </p>
                        </div>
                        {change && (
                          <span className="se-badge bg-se-blue-wash text-se-blue-ink">
                            {change.added > 0 ? `+${change.added}` : ''}
                            {change.added > 0 && change.removed > 0 ? ' / ' : ''}
                            {change.removed > 0 ? `−${change.removed}` : ''}
                          </span>
                        )}
                      </div>
                      {r.missions.length > 0 ? (
                        <ul className="mt-1.5 ml-[42px] text-xs text-se-muted space-y-0.5">
                          {r.missions.map((m) => (
                            <li key={m.id} className="tabular-nums">
                              {fmtDay(m.date)} · {m.start}–{m.end} · {m.poste}
                              {m.establishment ? ` · ${m.establishment}` : ''}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1.5 ml-[42px] text-xs text-se-muted">Plus rien cette semaine.</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 px-5 py-4 border-t border-se-line">
          {sentTo !== null ? (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto px-4 py-2.5 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
            >
              Fermer
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
              >
                {nothingToSend ? 'Fermer' : 'Pas maintenant'}
              </button>
              {!nothingToSend && (
                <button
                  type="button"
                  onClick={send}
                  className="ml-auto inline-flex items-center gap-1.5 px-4 py-2.5 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                  {already ? 'Envoyer les changements' : 'Envoyer'} à {rows.length} personne{rows.length > 1 ? 's' : ''}
                </button>
              )}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
