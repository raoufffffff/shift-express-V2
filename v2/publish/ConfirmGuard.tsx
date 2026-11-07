/**
 * Garde-fou — la petite fenêtre de confirmation qui s'intercale avant toute
 * validation qui engage de l'argent ou des personnes (prompt, règle n°1).
 * Un titre, ce qu'on s'apprête à faire, le coût ou le risque, puis UN bouton
 * pour confirmer et un pour reculer. Rien d'autre.
 */
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  title: string;
  tone?: 'default' | 'warning' | 'danger';
  /** lignes de détail (coût, chevauchement, repos…) affichées avant le clic */
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const toneRing: Record<NonNullable<Props['tone']>, string> = {
  default: 'bg-se-blue text-white hover:bg-se-blue-ink',
  warning: 'bg-se-cascade text-white hover:bg-se-cascade-ink',
  danger: 'bg-se-danger text-white hover:opacity-90',
};

export function ConfirmGuard({ title, tone = 'default', children, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed lg:absolute inset-0 z-10 flex items-center justify-center p-4">
      <button type="button" aria-label="Annuler" onClick={onCancel} className="absolute inset-0 bg-se-ink/40" />
      <div className="se-root relative w-full max-w-sm bg-se-surface rounded-se shadow-se-md p-5">
        <div className="flex items-start gap-3 mb-3">
          {tone !== 'default' && (
            <AlertTriangle
              className={`w-5 h-5 shrink-0 ${tone === 'danger' ? 'text-se-danger' : 'text-se-cascade-ink'}`}
              aria-hidden="true"
            />
          )}
          <h3 className="text-base font-extrabold text-se-ink">{title}</h3>
        </div>
        <div className="text-sm text-se-ink space-y-1.5 mb-4">{children}</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
          >
            Revenir
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-se-sm text-sm font-semibold ${toneRing[tone]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
