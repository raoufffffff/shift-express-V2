/**
 * Petite photo ronde d'une personne. Si la photo manque ou ne charge pas,
 * on voit ses initiales sur la couleur de son type (salarié / extra / freelance).
 * Avec `tag`, une petite lettre sous la photo dit le type d'un coup d'œil :
 * S salarié · E extra · A auto-entrepreneur (planning).
 */
import type { MissionPerson, PersonKind } from '@/mocks/v2Missions';
import { personKindStyle } from './coverage';

const KIND_LETTER: Record<PersonKind, string> = { salarie: 'S', extra: 'E', freelance: 'A' };
const KIND_WORD: Record<PersonKind, string> = { salarie: 'Salarié', extra: 'Extra', freelance: 'Auto-entrepreneur' };

export function Avatar({
  person,
  size = 24,
  tag = false,
  ring = false,
}: {
  person: Pick<MissionPerson, 'id' | 'name' | 'kind' | 'photo'>;
  size?: number;
  /** lettre du type (S · E · A) sous la photo */
  tag?: boolean;
  /** liseré blanc pour les photos qui se chevauchent */
  ring?: boolean;
}) {
  const k = personKindStyle[person.kind];
  const initials = person.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
  // Photo de démo stable par personne quand le mock n'en fournit pas.
  const src = person.photo ?? `https://i.pravatar.cc/${size * 2}?u=${encodeURIComponent(person.id)}`;

  const circle = (
    <span
      className={`relative inline-grid place-items-center rounded-full overflow-hidden shrink-0 ${k.wash} ${k.text} font-bold leading-none ${
        ring ? 'ring-2 ring-se-surface' : ''
      }`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      {initials}
      <img
        src={src}
        alt=""
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
    </span>
  );

  if (!tag) return circle;
  const tagSize = Math.max(Math.round(size * 0.5), 11);
  return (
    <span
      className="relative inline-block shrink-0 align-middle"
      style={{ width: size, height: size + tagSize / 2 }}
      title={`${person.name} · ${KIND_WORD[person.kind]}`}
    >
      {circle}
      <span
        className="absolute left-1/2 -translate-x-1/2 grid place-items-center rounded-full bg-se-ink text-white font-bold ring-2 ring-se-surface"
        style={{ bottom: 0, width: tagSize, height: tagSize, fontSize: Math.round(tagSize * 0.64), lineHeight: 1 }}
        aria-label={KIND_WORD[person.kind]}
        role="img"
      >
        {KIND_LETTER[person.kind]}
      </span>
    </span>
  );
}
