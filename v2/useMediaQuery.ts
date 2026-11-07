/**
 * Petit hook « cet écran est-il large ? » — sert aux fenêtres qui changent de
 * disposition (colonnes côte à côte ↔ onglets) selon la place disponible.
 */
import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', notify);
      return () => mql.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Seuil `lg` de Tailwind : trois colonnes côte à côte à partir de 1024 px. */
export const useIsWide = () => useMediaQuery('(min-width: 1024px)');
