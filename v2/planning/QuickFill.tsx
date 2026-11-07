/**
 * « + » sur une case à pourvoir → deux chemins, pas plus :
 *   · Placer quelqu'un directement : on pioche un salarié ou un extra, la
 *     mission est créée à l'horaire du créneau attendu (Matin, Soir…), la
 *     personne dedans.
 *   · Publier la mission : on ouvre le panneau Publier, poste et jour préremplis.
 * Les salariés dont c'est le jour de repos sont marqués ; un autre poste que
 * celui attendu l'est aussi. Zéro formulaire : on clique un nom, c'est fait.
 */
import { useState } from 'react';
import { X, UserPlus, Megaphone, BedDouble, ChevronRight } from 'lucide-react';
import type { Mission, MissionPerson } from '@/mocks/v2Missions';
import { people } from '@/mocks/v2People';
import { useV2Settings, DAY_LONG, uncoveredSlots, slotsOn } from '@/stores/v2SettingsStore';
import type { PosteSlot } from '@/stores/v2SettingsStore';
import { useUnavailability, offLabel } from '../people/availability';
import type { OffReason } from '../people/availability';
import { Avatar } from '../Avatar';
import { personKindStyle } from '../coverage';
import { createMission, effMissions, isLive } from '../mission/missionStore';
import { parseISO } from '../time';

interface Props {
  /** poste attendu (absent depuis la vue Mois : on le choisit ici) */
  poste?: string;
  date: string;
  /** créneau attendu cliqué (Matin, Soir…) ; sinon le premier créneau encore à pourvoir du poste */
  slot?: PosteSlot;
  /** établissement filtré dans le planning, sinon on le choisit ici */
  establishment?: string;
  onClose: () => void;
  /** → panneau Publier, prérempli (poste, jour, créneau) */
  onPublish: (poste: string, date: string, slot?: PosteSlot) => void;
  /** mission créée avec la personne dedans → on l'ouvre */
  onPlaced: (mission: Mission) => void;
}

export function QuickFill({
  poste: initialPoste,
  date,
  slot: initialSlot,
  establishment: initialEst,
  onClose,
  onPublish,
  onPlaced,
}: Props) {
  const postesConfig = useV2Settings((s) => s.postes).filter((p) => p.active);
  const staff = useV2Settings((s) => s.staff);
  const pool = useV2Settings((s) => s.pool);
  const whyOff = useUnavailability(); // repos fixe ou absence déclarée
  const establishments = useV2Settings((s) => s.establishments);
  const day = parseISO(date);
  const weekday = day.getDay();

  // Créneaux attendus ce jour-là sans mission dessus (pour la vue Mois : on
  // propose d'abord ces postes-là), sinon tous les postes actifs.
  const open = uncoveredSlots(postesConfig, date, effMissions().filter(isLive));
  const expected = Array.from(new Set(open.map((x) => x.poste)));
  const posteOptions = expected.length > 0 ? expected : postesConfig.map((p) => p.poste);
  const [poste, setPoste] = useState(initialPoste ?? posteOptions[0] ?? '');
  const [establishment, setEstablishment] = useState(initialEst ?? establishments[0].name);
  const [mode, setMode] = useState<'choose' | 'place'>('choose');

  // Le créneau : celui cliqué, sinon le premier encore à pourvoir du poste, sinon son premier créneau.
  const config = postesConfig.find((p) => p.poste === poste);
  const slot: PosteSlot | undefined =
    (initialSlot && poste === initialPoste ? initialSlot : undefined) ??
    open.find((x) => x.poste === poste)?.slot ??
    (config ? (slotsOn(config, weekday)[0] ?? config.slots[0]) : undefined);
  const start = slot?.start ?? '18:00';
  const end = slot?.end ?? '23:00';
  const required = slot?.count ?? 1;

  // Qui peut être placé : fixes (Réglages) + bassin de talents + extras connus.
  // `fits` = tient habituellement ce poste ; `off` = indisponible ce jour-là (repos, congés…).
  const candidates: (MissionPerson & { off: string | null; rest: boolean; fits: boolean })[] = [
    ...staff.map((r) => {
      const p = { id: r.personId, name: r.name, kind: 'salarie' as const };
      const off = whyOff(p, date);
      return { ...p, off, rest: off !== null, fits: r.postes.includes(poste) };
    }),
    ...pool.map((r) => {
      const mp = { id: r.personId, name: r.name, kind: 'extra' as const };
      const off = whyOff(mp, date);
      return { ...mp, off, rest: off !== null, fits: r.postes.includes(poste) };
    }),
    ...people
      .filter((p) => p.kind === 'extra' && !pool.some((r) => r.personId === p.id || r.name === p.name))
      .map((p) => {
        const mp = { id: p.id, name: p.name, kind: 'extra' as const, rating: p.rating };
        const off = whyOff(mp, date);
        return { ...mp, off, rest: off !== null, fits: p.roles.includes(poste) };
      }),
  ].sort((a, b) => Number(b.fits) - Number(a.fits) || Number(a.rest) - Number(b.rest) || a.name.localeCompare(b.name));

  const place = (p: MissionPerson) => {
    const mission = createMission({
      poste,
      establishment,
      date,
      start,
      end,
      required,
      system: 'employe',
      coverage: required <= 1 ? 'complete' : 'shortage',
      placed: [{ id: p.id, name: p.name, kind: p.kind, checkedIn: false }],
      candidates: [],
      estimatedCost: 0,
      history: [{ at: 'maintenant', label: `${p.name} placé·e directement depuis le planning` }],
    });
    onPlaced(mission);
  };

  const dateLabel = day.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-se-ink/40" />
      <div className="se-root relative w-full max-w-md bg-se-surface rounded-se shadow-se-md overflow-hidden">
        <header className="flex items-start gap-3 px-5 py-4 border-b border-se-line">
          <div className="min-w-0 flex-1">
            <p className="se-eyebrow mb-0.5">À pourvoir · {dateLabel}</p>
            {initialPoste ? (
              <h2 className="text-lg font-extrabold text-se-ink truncate">{poste}</h2>
            ) : (
              <select
                value={poste}
                onChange={(e) => setPoste(e.target.value)}
                className="h-9 rounded-se-sm border border-se-line bg-se-surface px-2 text-base font-extrabold text-se-ink focus:outline-none focus:border-se-blue"
                aria-label="Poste"
              >
                {posteOptions.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            )}
            <p className="text-xs text-se-muted mt-0.5">
              {slot ? `${slot.label} · ` : ''}
              {start}–{end} · {required} personne{required > 1 ? 's' : ''} ·{' '}
              {initialEst ? (
                establishment
              ) : (
                <select
                  value={establishment}
                  onChange={(e) => setEstablishment(e.target.value)}
                  className="bg-transparent text-xs text-se-ink font-semibold focus:outline-none"
                  aria-label="Établissement"
                >
                  {establishments.map((e) => (
                    <option key={e.id}>{e.name}</option>
                  ))}
                </select>
              )}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {mode === 'choose' ? (
          <div className="p-4 space-y-2">
            <button
              type="button"
              onClick={() => setMode('place')}
              className="w-full flex items-center gap-3 rounded-se border border-se-line p-3.5 text-left hover:border-se-blue hover:bg-se-blue-wash/30 transition-colors"
            >
              <span className="w-10 h-10 rounded-se-sm bg-se-blue grid place-items-center text-white shrink-0">
                <UserPlus className="w-5 h-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-se-ink">Placer quelqu'un directement</span>
                <span className="block text-xs text-se-muted">
                  Un salarié ou un extra, tout de suite. Aucun coût en plus.
                </span>
              </span>
              <ChevronRight className="w-5 h-5 text-se-muted shrink-0" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onPublish(poste, date, slot)}
              className="w-full flex items-center gap-3 rounded-se border border-se-line p-3.5 text-left hover:border-se-cascade hover:bg-se-cascade-wash/30 transition-colors"
            >
              <span className="w-10 h-10 rounded-se-sm bg-se-cascade grid place-items-center text-white shrink-0">
                <Megaphone className="w-5 h-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-se-ink">Publier la mission</span>
                <span className="block text-xs text-se-muted">
                  Cascade, salariés seuls ou auto-entrepreneurs : vous choisissez, poste et jour déjà remplis.
                </span>
              </span>
              <ChevronRight className="w-5 h-5 text-se-muted shrink-0" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="se-eyebrow">Qui placer ?</p>
              <button
                type="button"
                onClick={() => setMode('choose')}
                className="text-xs font-semibold text-se-muted hover:text-se-ink"
              >
                ‹ Retour
              </button>
            </div>
            <ul className="max-h-[320px] overflow-y-auto -mx-1 divide-y divide-se-line/60">
              {candidates.map((c) => {
                const k = personKindStyle[c.kind];
                return (
                  <li key={c.id} className="flex items-center gap-2.5 px-1 py-2">
                    <Avatar person={c} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold text-se-ink truncate">{c.name}</span>
                        <span className={`se-badge ${k.wash} ${k.text}`} style={{ height: 16 }}>
                          {k.label}
                        </span>
                        {c.off && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 rounded-full bg-se-cascade-wash text-se-cascade-ink text-[10px] font-semibold"
                            title={
                              c.off === 'repos' ? `Jour de repos (${DAY_LONG[weekday]})` : `Absence déclarée : ${c.off}`
                            }
                          >
                            <BedDouble className="w-2.5 h-2.5" aria-hidden="true" /> {offLabel(c.off as OffReason)}
                          </span>
                        )}
                      </span>
                      <span className="block text-[11px] text-se-muted">
                        {c.fits ? `Tient le poste ${poste}` : 'Autre poste habituellement'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => place(c)}
                      className={`shrink-0 px-3 py-1.5 rounded-se-sm text-xs font-semibold ${
                        c.rest
                          ? 'border border-se-cascade text-se-cascade-ink hover:bg-se-cascade-wash'
                          : 'bg-se-blue text-white hover:bg-se-blue-ink'
                      }`}
                    >
                      {c.rest ? 'Placer quand même' : 'Placer'}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-se-muted mt-3">
              La mission est créée à l'horaire du créneau attendu ; vous pourrez l'ajuster dans sa fenêtre. Besoin d'un
              auto-entrepreneur ? Passez par « Publier la mission ».
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
