/**
 * « Évaluer vos auto-entrepreneurs » — fenêtre proposée à la connexion tant
 * qu'une mission passée a un auto-entrepreneur validé sans évaluation.
 * Une carte par personne et par mission : cinq étoiles, un mot (facultatif),
 * Enregistrer. « Plus tard » referme pour cette session. Les évaluations
 * nourrissent la fiche de la personne (bloc Évaluations, « chez vous »).
 */
import { useMemo, useState } from 'react';
import { MOCK_TODAY } from '@/mocks/v2Today';
import { Star, X, Check, ClipboardCheck } from 'lucide-react';
import type { Mission, MissionPlaced } from '@/mocks/v2Missions';
import { useV2People, reviewKey } from '@/stores/v2PeopleStore';
import { useV2Ui } from '@/stores/v2UiStore';
import { useAllMissions, effPlaced } from '../mission/missionStore';
import { Avatar } from '../Avatar';
import { parseISO } from '../time';

/** « Aujourd'hui » de la maquette. */
const TODAY = MOCK_TODAY;

const fmtDay = (iso: string) =>
  parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

interface Pending {
  mission: Mission;
  person: MissionPlaced;
}

/** Les évaluations en attente : missions passées, auto-entrepreneurs validés, pas encore notés. */
export function usePendingReviews(): Pending[] {
  const missions = useAllMissions();
  const reviews = useV2People((s) => s.reviews);
  return useMemo(
    () =>
      missions
        .filter((m) => m.date < TODAY)
        .flatMap((m) =>
          effPlaced(m)
            .filter((p) => p.kind === 'freelance' && !p.suggested && !reviews[reviewKey(m.id, p.name)])
            .map((person) => ({ mission: m, person })),
        )
        .sort((a, b) => b.mission.date.localeCompare(a.mission.date)),
    [missions, reviews],
  );
}

export function PendingReviewsDialog() {
  const pending = usePendingReviews();
  const dismissed = useV2People((s) => s.reviewsDismissed);
  const dismiss = useV2People((s) => s.dismissReviews);
  const addReview = useV2People((s) => s.addReview);
  const log = useV2Ui((s) => s.log);
  const [drafts, setDrafts] = useState<Record<string, { rating: number; comment: string }>>({});
  const [justDone, setJustDone] = useState<string[]>([]);

  if (dismissed || pending.length === 0) return null;

  const save = (p: Pending) => {
    const k = reviewKey(p.mission.id, p.person.name);
    const d = drafts[k];
    if (!d?.rating) return;
    addReview({ missionId: p.mission.id, name: p.person.name, rating: d.rating, comment: d.comment.trim() });
    log({
      kind: 'personne',
      label: `${p.person.name} évalué·e ${d.rating}/5`,
      detail: `${p.mission.poste} · ${fmtDay(p.mission.date)}`,
      missionId: p.mission.id,
    });
    setJustDone((s) => [...s, k]);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-se-ink/50" aria-hidden="true" />
      <div
        role="dialog"
        aria-label="Évaluer vos auto-entrepreneurs"
        className="se-root relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-se-surface rounded-se shadow-se-md overflow-hidden"
      >
        <header className="flex items-center gap-3 px-5 py-4 border-b border-se-line">
          <span className="w-9 h-9 rounded-se-sm bg-se-freelance-wash text-se-freelance-ink grid place-items-center shrink-0">
            <ClipboardCheck className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-se-ink">Évaluer vos auto-entrepreneurs</h2>
            <p className="text-xs text-se-muted">
              {pending.length} mission{pending.length > 1 ? 's' : ''} terminée{pending.length > 1 ? 's' : ''} sans
              évaluation. Une note aide tout le monde : vous, pour la prochaine fois ; eux, pour leur profil.
            </p>
          </div>
          <button
            type="button"
            aria-label="Plus tard"
            onClick={dismiss}
            className="ml-auto w-8 h-8 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <ul className="flex-1 overflow-y-auto divide-y divide-se-line">
          {pending.map((p) => {
            const k = reviewKey(p.mission.id, p.person.name);
            const d = drafts[k] ?? { rating: 0, comment: '' };
            const done = justDone.includes(k);
            return (
              <li key={k} className="px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex items-center gap-3 min-w-0 sm:w-64 shrink-0">
                  <Avatar person={p.person} size={40} />
                  <div className="min-w-0">
                    <p className="font-semibold text-se-ink truncate">{p.person.name}</p>
                    <p className="text-xs text-se-muted truncate">
                      {p.mission.poste} · {fmtDay(p.mission.date)}
                    </p>
                    <p className="text-xs text-se-muted truncate">
                      {p.mission.establishment} · {p.person.clockIn ?? p.mission.start}–
                      {p.person.clockOut ?? p.mission.end}
                    </p>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  {done ? (
                    <p className="inline-flex items-center gap-1.5 text-sm text-se-success font-semibold">
                      <Check className="w-4 h-4" aria-hidden="true" /> Merci, évaluation enregistrée.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center gap-1" role="radiogroup" aria-label="Note sur 5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={d.rating === n}
                            aria-label={`${n} sur 5`}
                            onClick={() => setDrafts((s) => ({ ...s, [k]: { ...d, rating: n } }))}
                            className="w-8 h-8 grid place-items-center rounded-se-sm hover:bg-se-surface-2"
                          >
                            <Star
                              className={`w-6 h-6 ${n <= d.rating ? 'fill-current text-amber-500' : 'text-se-line'}`}
                              aria-hidden="true"
                            />
                          </button>
                        ))}
                        <span className="ml-2 text-xs text-se-muted">
                          {d.rating === 0
                            ? 'Cliquez une étoile'
                            : ['', 'À éviter', 'Moyen', 'Bien', 'Très bien', 'Excellent'][d.rating]}
                        </span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <input
                          value={d.comment}
                          onChange={(e) => setDrafts((s) => ({ ...s, [k]: { ...d, comment: e.target.value } }))}
                          placeholder="Un mot (facultatif) : ponctualité, attitude, à reprendre ?"
                          className="flex-1 h-9 rounded-se-sm border border-se-line bg-se-surface px-3 text-sm text-se-ink focus:outline-none focus:border-se-blue"
                        />
                        <button
                          type="button"
                          disabled={d.rating === 0}
                          onClick={() => save(p)}
                          className="h-9 px-3.5 rounded-se-sm text-sm font-semibold bg-se-freelance text-white hover:opacity-90 disabled:opacity-40"
                        >
                          Enregistrer
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <footer className="flex items-center gap-3 px-5 py-3 border-t border-se-line">
          <p className="text-xs text-se-muted">
            Les évaluations apparaissent sur la fiche de la personne (« chez vous »).
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="ml-auto h-9 px-4 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
          >
            Plus tard
          </button>
        </footer>
      </div>
    </div>
  );
}
