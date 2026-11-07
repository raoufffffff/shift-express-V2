/**
 * Fenêtre d'un ÉVÉNEMENT multi-jours (ex. « Salon des vins »).
 * Ouverte depuis le bandeau d'une mission qui fait partie d'un événement.
 *   Gauche  — postulants à l'événement ENTIER. Valider quelqu'un le place
 *             d'un coup sur TOUS les jours (et sur le planning).
 *   Droite  — la liste des jours, avec qui est placé sur chacun ; un clic
 *             ouvre le jour en détail.
 */
import { useMemo, useState } from 'react';
import { X, Link2, Check, Star, CalendarDays } from 'lucide-react';
import type { MissionPerson, PersonKind } from '@/mocks/v2Missions';
import { missionsOfEvent } from '@/mocks/v2Missions';
import { personKindStyle } from '../coverage';
import { useMissionStore, effPlaced, effPlacedCount, effRequired, writePlaced, cancelMission } from './missionStore';
import { cancellationQuote } from './cancellation';
import { ConfirmGuard } from '../publish/ConfirmGuard';
import { missionTimeLabel } from '../time';

const KIND_RANK: Record<PersonKind, number> = { salarie: 0, extra: 1, freelance: 2 };

export function EventWindow({
  eventId,
  onClose,
  onOpenDay,
}: {
  eventId: string;
  onClose: () => void;
  onOpenDay: (missionId: string) => void;
}) {
  useMissionStore(); // valider écrit dans le store → planning + jours à jour
  const days = missionsOfEvent(eventId);
  const event = days[0];
  const nbDays = days.length;

  // Postulants à l'événement entier, uniques par personne.
  const applicants: MissionPerson[] = useMemo(() => {
    const map = new Map<string, MissionPerson>();
    days.forEach((d) =>
      d.candidates
        .filter((c) => c.forEvent)
        .forEach((c) => {
          if (!map.has(c.id)) map.set(c.id, c);
        }),
    );
    return Array.from(map.values()).sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
  }, [days]);

  // Validé « pour tout l'événement » = présent sur CHAQUE jour.
  const isValidated = (id: string) => days.length > 0 && days.every((d) => effPlaced(d).some((p) => p.id === id));
  // Placer / retirer la personne sur tous les jours d'un coup → se répercute
  // sur le planning (store partagé).
  const toggleEvent = (person: MissionPerson) => {
    const on = isValidated(person.id);
    days.forEach((d) => {
      const cur = effPlaced(d);
      if (on) {
        writePlaced(
          d.id,
          cur.filter((p) => p.id !== person.id),
        );
      } else if (!cur.some((p) => p.id === person.id)) {
        writePlaced(d.id, [...cur, { ...person, suggested: false }]);
      }
    });
  };

  const validatedPeople = applicants.filter((a) => isValidated(a.id));

  // Annulation de tout l'événement : frais jour par jour, préavis allongé selon la durée.
  const [cancelling, setCancelling] = useState(false);
  const dayQuotes = days.map((d) => cancellationQuote(d, effPlaced(d), { days: nbDays }));
  const totalFees = dayQuotes.reduce((s, q) => s + q.total, 0);

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-se-ink/50" />

      <div className="se-root relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-se-surface rounded-se shadow-se-md overflow-hidden">
        {/* En-tête */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-se-line">
          <span className="w-9 h-9 rounded-se-sm bg-se-blue-wash text-se-blue-ink grid place-items-center">
            <Link2 className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="se-eyebrow">Événement</p>
            <h2 className="text-lg font-extrabold text-se-ink truncate">{event.eventName}</h2>
          </div>
          <span className="se-badge bg-se-surface-2 text-se-muted ml-2">
            {nbDays} jours · {event.establishment}
          </span>
          {/* Annuler tout l'événement : les frais se calculent jour par jour */}
          <button
            type="button"
            onClick={() => setCancelling(true)}
            className="ml-auto h-8 px-3 rounded-se-sm text-xs font-semibold border border-se-line text-se-danger hover:bg-se-danger-wash whitespace-nowrap"
          >
            Annuler l'événement
          </button>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {cancelling && (
          <ConfirmGuard
            title={`Annuler les ${nbDays} jours de l'événement ?`}
            tone="danger"
            confirmLabel={totalFees > 0 ? `Annuler · ${totalFees} € de frais` : 'Annuler sans frais'}
            onCancel={() => setCancelling(false)}
            onConfirm={() => {
              days.forEach((d, i) => {
                const q = dayQuotes[i];
                cancelMission(d.id, 'Événement annulé', q.total > 0 ? { lines: q.lines, total: q.total } : undefined);
              });
              setCancelling(false);
              onClose();
            }}
          >
            <p>
              <strong>{event.eventName}</strong> disparaît du planning, tous les jours compris. Les personnes placées
              sont prévenues.
            </p>
            <ul className="text-xs divide-y divide-se-line-soft rounded-se-sm border border-se-line">
              {days.map((d, i) => {
                const q = dayQuotes[i];
                return (
                  <li key={d.id} className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className="font-semibold text-se-ink">
                      {new Date(d.date).toLocaleDateString('fr-FR', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    <span className="text-se-muted">
                      {q.lines.length === 0
                        ? 'aucun auto-entrepreneur validé'
                        : q.pct === 0
                          ? `${q.lines.length} auto-entrepreneur${q.lines.length > 1 ? 's' : ''} · sans frais (${q.noticeHours} h de préavis respectées)`
                          : `${q.lines.map((l) => l.name).join(', ')} · ${q.pct} % du devis`}
                    </span>
                    <span
                      className={`ml-auto font-semibold tabular-nums ${q.total > 0 ? 'text-se-danger' : 'text-se-success'}`}
                    >
                      {q.total} €
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className={totalFees > 0 ? 'font-semibold text-se-danger' : 'font-semibold text-se-success'}>
              {totalFees > 0
                ? `Total des frais d'annulation : ${totalFees} € TTC (préavis de ${dayQuotes[0]?.noticeHours ?? 48} h pour une mission de ${nbDays} jours).`
                : dayQuotes.some((q) => q.lines.length > 0)
                  ? `Sans frais : les ${nbDays} jours sont au-delà du préavis de ${dayQuotes[0]?.noticeHours ?? 48} h.`
                  : 'Sans frais : aucun auto-entrepreneur validé sur cet événement.'}
            </p>
          </ConfirmGuard>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-se-line flex-1 overflow-y-auto">
          {/* ── Postulants à l'événement entier ─────────────── */}
          <section className="p-4">
            <p className="se-eyebrow mb-1">Postulent à l'événement entier</p>
            <p className="text-xs text-se-muted mb-3">Valider une personne la place sur les {nbDays} jours.</p>

            {applicants.length === 0 ? (
              <p className="text-sm text-se-muted">Aucune candidature pour l'événement entier.</p>
            ) : (
              <ul className="space-y-2">
                {applicants.map((a) => {
                  const k = personKindStyle[a.kind];
                  const on = isValidated(a.id);
                  const total = typeof a.cost === 'number' ? a.cost * nbDays : null;
                  return (
                    <li
                      key={a.id}
                      className={`rounded-se-sm border p-2.5 flex items-center gap-2 ${on ? 'border-se-success bg-se-success-wash/40' : 'border-se-line'}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-se-ink truncate">{a.name}</span>
                          <span className={`se-badge ${k.wash} ${k.text}`} style={{ height: 18 }}>
                            {k.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-se-muted">
                          {typeof a.rating === 'number' && (
                            <span className="inline-flex items-center gap-0.5">
                              <Star className="w-3 h-3 fill-current text-amber-500" aria-hidden="true" />
                              {a.rating.toFixed(1)}
                            </span>
                          )}
                          {typeof a.match === 'number' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className={a.match >= 90 ? 'text-se-success font-semibold' : ''}>{a.match}%</span>
                            </>
                          )}
                          {typeof a.cost === 'number' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold text-se-ink">
                                {a.cost} €/j · {total} € TTC
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {on && a.kind === 'freelance' ? (
                        // Un auto-entrepreneur validé ne se retire pas d'ici : « Signaler » dans sa fiche.
                        <span
                          title="Auto-entrepreneur validé : un problème se signale depuis sa fiche"
                          className="shrink-0 px-3 py-1.5 rounded-se-sm text-xs font-semibold inline-flex items-center gap-1 bg-se-success-wash text-se-success"
                        >
                          <Check className="w-3.5 h-3.5" aria-hidden="true" /> Validé
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleEvent(a)}
                          className={`shrink-0 px-3 py-1.5 rounded-se-sm text-xs font-semibold inline-flex items-center gap-1 ${
                            on
                              ? 'bg-se-success text-white hover:opacity-90'
                              : 'bg-se-blue text-white hover:bg-se-blue-ink'
                          }`}
                        >
                          {on ? (
                            <>
                              <Check className="w-3.5 h-3.5" aria-hidden="true" /> Validé
                            </>
                          ) : (
                            `Valider · ${nbDays} j`
                          )}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {validatedPeople.length > 0 && (
              <p className="text-xs text-se-success font-semibold mt-3">
                {validatedPeople.length} personne{validatedPeople.length > 1 ? 's' : ''} placée
                {validatedPeople.length > 1 ? 's' : ''} sur tout l'événement.
              </p>
            )}
          </section>

          {/* ── Les jours ───────────────────────────────────── */}
          <section className="p-4 bg-se-surface-2/50">
            <p className="se-eyebrow mb-3">Les {nbDays} jours</p>
            <ul className="space-y-2">
              {days.map((m) => {
                const count = effPlacedCount(m);
                const required = effRequired(m);
                const covered = count >= required;
                const dayLabel = new Date(m.date).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                });
                const placedHere = effPlaced(m).filter((p) => !p.suggested);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onOpenDay(m.id)}
                      className="w-full text-left rounded-se-sm border border-se-line bg-se-surface p-3 hover:border-se-muted"
                    >
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-se-muted" aria-hidden="true" />
                        <span className="font-semibold text-se-ink capitalize">{dayLabel}</span>
                        <span className="text-xs text-se-muted">· {missionTimeLabel(m)}</span>
                        <span
                          className={`se-badge ml-auto ${covered ? 'bg-se-success-wash text-se-success' : 'bg-se-danger-wash text-se-danger'}`}
                        >
                          {count}/{required}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {placedHere.length === 0 ? (
                          <span className="text-xs text-se-muted">Personne de placé.</span>
                        ) : (
                          placedHere.map((p) => {
                            const viaEvent = applicants.some((a) => a.id === p.id);
                            return (
                              <span
                                key={p.id}
                                className={`se-badge inline-flex items-center gap-1 ${
                                  viaEvent ? 'bg-se-success-wash text-se-success' : 'bg-se-surface-2 text-se-muted'
                                }`}
                              >
                                {viaEvent && <Check className="w-3 h-3" aria-hidden="true" />} {p.name}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
