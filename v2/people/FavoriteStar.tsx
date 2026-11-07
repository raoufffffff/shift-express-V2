/**
 * Favori et étoiles — les seules briques partagées des fiches profil :
 *  · FavoriteStar — favori = accepté·e automatiquement quand il/elle postule ;
 *  · FavoriteMark — petite étoile pleine à côté d'un nom (listes) ;
 *  · Stars — note sur 5.
 * Rose = auto-entrepreneur.
 */
import { Star } from 'lucide-react';
import { useV2People } from '@/stores/v2PeopleStore';
import { useV2Ui } from '@/stores/v2UiStore';
import { autoAcceptFavorite } from '../mission/missionStore';

/** Étoile « favori » cliquable (liste Personnes, fenêtre profil, candidats). Rose = auto-entrepreneur. */
export function FavoriteStar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const on = useV2People((s) => s.favorites.includes(name));
  const toggleFavorite = useV2People((s) => s.toggleFavorite);
  const log = useV2Ui((s) => s.log);
  const dim = size === 'md' ? 'h-10 px-3.5 gap-2' : 'w-7 h-7';
  const icon = size === 'md' ? 'w-4 h-4' : 'w-4 h-4';
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      title={on ? 'Favori · accepté·e automatiquement quand il/elle postule' : 'Ajouter aux favoris'}
      onClick={(e) => {
        e.stopPropagation();
        const nowOn = toggleFavorite(name);
        const accepted = nowOn ? autoAcceptFavorite(name) : 0;
        log({
          kind: 'personne',
          label: nowOn
            ? `${name} ajouté·e aux favoris${accepted ? ` · ${accepted} candidature${accepted > 1 ? 's' : ''} acceptée${accepted > 1 ? 's' : ''}` : ''}`
            : `${name} retiré·e des favoris`,
          detail: 'Auto-entrepreneur',
        });
      }}
      className={`${dim} inline-flex items-center justify-center rounded-full border text-sm font-semibold transition-colors ${
        on
          ? 'text-se-freelance-ink bg-se-freelance-wash border-se-freelance/40 hover:border-se-freelance'
          : 'text-se-muted bg-se-surface border-se-line hover:text-se-freelance-ink hover:border-se-freelance/40 hover:bg-se-freelance-wash'
      }`}
    >
      <Star className={`${icon} ${on ? 'fill-current' : ''}`} aria-hidden="true" />
      {size === 'md' && <span>{on ? 'Favori' : 'Favori'}</span>}
    </button>
  );
}

/** Petite étoile pleine à côté d'un nom quand la personne est favorite (listes). */
export function FavoriteMark({ name }: { name: string }) {
  const on = useV2People((s) => s.favorites.includes(name));
  if (!on) return null;
  return (
    <Star
      className="w-3 h-3 shrink-0 fill-current text-se-freelance"
      aria-label="Favori · accepté·e automatiquement"
      role="img"
    />
  );
}

/** Cinq étoiles, remplies selon la note (ambre = note, comme partout dans la v2). */
export function Stars({ rating, size = 'w-3.5 h-3.5' }: { rating: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating.toFixed(1)} sur 5`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${size} ${i <= Math.round(rating) ? 'fill-current text-amber-500' : 'text-se-line'}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
