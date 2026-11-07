/**
 * Corps de la fenêtre d'une mission ANNULÉE — lecture seule.
 * Une mission annulée ne disparaît jamais : elle reste hachurée dans le planning et
 * sa fenêtre garde la trace (quand, pourquoi, quels frais, qui était prévu).
 * Les profils ne s'ouvrent plus d'ici : la mission n'existe plus pour eux.
 */
import { Ban, Receipt, History, MapPin, Clock } from 'lucide-react';
import type { Mission } from '@/mocks/v2Missions';
import { personKindStyle } from '../coverage';
import { effPlaced, effRequired } from './missionStore';
import { Avatar } from '../Avatar';
import { missionTimeLabel, missionHours } from '../time';

export function CancelledBody({ mission }: { mission: Mission }) {
  const c = mission.cancelled!;
  const when = new Date(c.at);
  const whenLabel = `${when.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${when
    .toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    .replace(':', 'h')}`;
  const people = effPlaced(mission).filter((p) => !p.suggested);
  const required = effRequired(mission);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Bandeau : annulée quand, pourquoi, frais */}
      <div className="se-hatched rounded-se border border-se-line p-4 flex gap-3">
        <span className="w-10 h-10 rounded-se-sm bg-se-surface grid place-items-center text-se-muted shrink-0">
          <Ban className="w-5 h-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-se-ink first-letter:uppercase">Mission annulée le {whenLabel}</p>
          {c.reason && <p className="text-sm text-se-ink mt-0.5">Motif : {c.reason}</p>}
          <p className="text-sm mt-1 inline-flex items-center gap-1.5">
            <Receipt className="w-3.5 h-3.5 text-se-muted" aria-hidden="true" />
            {c.fees > 0 ? (
              <span className="font-semibold text-se-danger">
                {c.fees} € TTC de frais d'annulation · ligne « Annulation » dans Factures
              </span>
            ) : (
              <span className="font-semibold text-se-success">Sans frais d'annulation</span>
            )}
          </p>
          <p className="text-xs text-se-muted mt-1.5">
            La mission reste visible, hachurée, dans le planning. Elle ne compte plus dans les heures ni dans les
            factures de prestation.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Qui était prévu — sans accès aux profils */}
        <section className="rounded-se border border-se-line p-4">
          <p className="se-eyebrow mb-2">
            Qui était prévu{' '}
            <span className="text-se-muted font-normal">
              · {people.length}/{required}
            </span>
          </p>
          {people.length === 0 ? (
            <p className="text-sm text-se-muted">Personne n'était encore placé.</p>
          ) : (
            <ul className="space-y-2">
              {people.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5 opacity-80">
                  <span className="grayscale">
                    <Avatar person={p} size={32} tag />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-se-ink truncate">{p.name}</span>
                    <span className={`block text-[11px] ${personKindStyle[p.kind].text}`}>
                      {p.kind === 'freelance' ? 'Auto-entrepreneur' : personKindStyle[p.kind].label}
                      {p.kind === 'freelance' && p.cost ? ` · devis ${p.cost} € TTC` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-se-muted mt-3">Les profils ne sont plus accessibles depuis une mission annulée.</p>
        </section>

        {/* Détails figés + historique */}
        <section className="rounded-se border border-se-line p-4 space-y-3">
          <p className="se-eyebrow">Détails</p>
          <p className="text-sm text-se-ink inline-flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-se-muted" aria-hidden="true" /> {mission.establishment}
          </p>
          <p className="text-sm text-se-ink inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-se-muted" aria-hidden="true" /> {missionTimeLabel(mission)} ·{' '}
            {missionHours(mission)} h · {required} poste{required > 1 ? 's' : ''}
          </p>
          {mission.publicNote && <p className="text-sm text-se-muted">{mission.publicNote}</p>}

          {mission.history && mission.history.length > 0 && (
            <>
              <p className="se-eyebrow inline-flex items-center gap-1 pt-2">
                <History className="w-3 h-3" aria-hidden="true" /> Historique
              </p>
              <ol className="space-y-2">
                {mission.history.map((h, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span
                      className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${i === 0 ? 'bg-se-muted' : 'bg-se-line'}`}
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm text-se-ink leading-tight">{h.label}</p>
                      <p className="text-xs text-se-muted">{h.at}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
