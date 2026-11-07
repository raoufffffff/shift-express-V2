/**
 * Garde-fou « tarif négocié » : un auto-entrepreneur postule en proposant un
 * tarif horaire différent du tarif publié. On voit les deux montants, l'écart
 * sur la mission, et on choisit : accepter son tarif, contre-proposer (dans
 * la fourchette publiée → proposé), ou refuser. Rien n'est engagé avant.
 */
import { useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Minus, Plus, X } from 'lucide-react';
import type { MissionPerson } from '@/mocks/v2Missions';
import { Avatar } from '../Avatar';

interface Props {
  person: MissionPerson;
  /** tarif publié (€/h TTC) */
  baseRate: number;
  /** heures de la mission */
  hours: number;
  onAccept: (rate: number) => void;
  onCounter: (rate: number) => void;
  onRefuse: () => void;
  onCancel: () => void;
}

const euros = (n: number) => `${Math.round(n)} € TTC`;

export function RateNegotiationGuard({ person, baseRate, hours, onAccept, onCounter, onRefuse, onCancel }: Props) {
  const proposed = person.proposedRate ?? baseRate;
  const [countering, setCountering] = useState(false);
  const [counter, setCounter] = useState(Math.min(baseRate + 1, proposed - 1 >= baseRate ? proposed - 1 : baseRate));
  const min = Math.min(baseRate, proposed);
  const max = Math.max(baseRate, proposed);
  const diff = (proposed - baseRate) * hours;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
      <button type="button" aria-label="Annuler" onClick={onCancel} className="absolute inset-0 bg-se-ink/40" />
      <div className="se-root relative w-full max-w-md bg-se-surface rounded-se shadow-se-md p-5">
        <div className="flex items-start gap-3 mb-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-se-cascade-ink mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-se-ink">Tarif négocié</h3>
            <p className="text-sm text-se-muted">
              {person.name} postule à un tarif différent de celui que vous avez publié.
            </p>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onCancel}
            className="ml-auto w-7 h-7 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Les deux tarifs, côte à côte */}
        <div className="flex items-center gap-3 rounded-se border border-se-line p-3 mb-3">
          <Avatar person={person} size={40} />
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 flex-1 text-center">
            <div>
              <p className="text-[11px] text-se-muted">Publié</p>
              <p className="text-lg font-extrabold font-display text-se-ink leading-none">{baseRate} €/h</p>
              <p className="text-[11px] text-se-muted mt-0.5">{euros(baseRate * hours)}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-se-muted" aria-hidden="true" />
            <div>
              <p className="text-[11px] text-se-muted">Proposé</p>
              <p className="text-lg font-extrabold font-display text-se-freelance-ink leading-none">{proposed} €/h</p>
              <p className="text-[11px] text-se-muted mt-0.5">{euros(proposed * hours)}</p>
            </div>
          </div>
        </div>
        <p className="text-sm text-se-ink mb-4">
          {diff > 0 ? (
            <>
              Soit <strong>+{euros(diff)}</strong> sur cette mission ({hours} h).
            </>
          ) : diff < 0 ? (
            <>
              Soit <strong>{euros(diff)}</strong> sur cette mission ({hours} h) : moins cher que publié.
            </>
          ) : (
            <>Même montant sur la mission.</>
          )}
        </p>

        {countering ? (
          <div className="rounded-se-sm border border-se-line p-3 mb-4">
            <p className="se-eyebrow mb-2">Votre contre-proposition</p>
            <div className="flex items-center gap-3">
              <div className="flex items-center h-10 rounded-se-sm border border-se-line bg-se-surface">
                <button
                  type="button"
                  aria-label="Moins"
                  disabled={counter <= min}
                  onClick={() => setCounter((c) => Math.max(min, c - 1))}
                  className="w-9 h-full grid place-items-center text-se-muted hover:text-se-ink disabled:opacity-30"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-20 text-center text-sm font-semibold text-se-ink tabular-nums">{counter} €/h</span>
                <button
                  type="button"
                  aria-label="Plus"
                  disabled={counter >= max}
                  onClick={() => setCounter((c) => Math.min(max, c + 1))}
                  className="w-9 h-full grid place-items-center text-se-muted hover:text-se-ink disabled:opacity-30"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-se-muted">
                entre {min} et {max} €/h · {euros(counter * hours)} sur la mission
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefuse}
            className="h-10 px-3.5 rounded-se-sm text-sm font-semibold border border-se-line text-se-danger hover:bg-se-danger-wash"
          >
            Refuser
          </button>
          {countering ? (
            <button
              type="button"
              onClick={() => onCounter(counter)}
              className="h-10 px-3.5 rounded-se-sm text-sm font-semibold border border-se-cascade text-se-cascade-ink hover:bg-se-cascade-wash"
            >
              Envoyer {counter} €/h
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCountering(true)}
              className="h-10 px-3.5 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
            >
              Contre-proposer
            </button>
          )}
          <button
            type="button"
            onClick={() => onAccept(proposed)}
            className="ml-auto inline-flex items-center gap-1.5 h-10 px-4 rounded-se-sm text-sm font-semibold bg-se-freelance text-white hover:opacity-90"
          >
            <Check className="w-4 h-4" aria-hidden="true" /> Accepter {proposed} €/h
          </button>
        </div>
        <p className="text-[11px] text-se-muted mt-3">
          Accepter engage {euros(proposed * hours)}, facturés sur les heures validées. Une contre-proposition ou un
          refus prévient {person.name} sans rien engager.
        </p>
      </div>
    </div>
  );
}
