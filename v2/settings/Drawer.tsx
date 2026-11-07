/** Fenêtre latérale (drawer) réutilisée par les panneaux de Réglages. */
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  /** sous-titre en mots simples : à quoi sert ce panneau */
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** panneau large (grilles : postes, personnel) */
  wide?: boolean;
  /** panneau très large (tableaux : compteurs de paie) */
  xl?: boolean;
}

export function Drawer({ title, subtitle, onClose, children, footer, wide, xl }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-se-ink/40" />
      <div
        className={`se-root relative w-full ${xl ? 'max-w-5xl' : wide ? 'max-w-2xl' : 'max-w-md'} bg-se-surface shadow-se-md flex flex-col max-h-screen`}
      >
        <header className="flex items-center gap-3 px-5 py-4 border-b border-se-line">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-se-ink">{title}</h2>
            {subtitle && <p className="text-xs text-se-muted mt-0.5">{subtitle}</p>}
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
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="px-5 py-4 border-t border-se-line">{footer}</footer>}
      </div>
    </div>
  );
}
