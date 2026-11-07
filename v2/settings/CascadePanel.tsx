/**
 * Cascade — paliers d'urgence. Le régime dépend du temps qu'il reste entre la
 * publication et le DÉBUT du shift : plus il est proche, plus vite tout le
 * monde est prévenu. Trois paliers en mots simples, chacun réglable, une frise
 * qui montre qui voit la mission et quand, et un simulateur « je publie un
 * shift qui commence dans… ». À l'étape auto-entrepreneurs, le tarif maximal
 * se règle PAR POSTE, pour l'établissement choisi, dans la fourchette fixée
 * par l'administrateur.
 */
import { useState } from 'react';
import { Briefcase, Lock, Zap, Sun, Timer, Siren } from 'lucide-react';
import { useV2Settings, useRateBounds, rateFor, COMPANY } from '@/stores/v2SettingsStore';
import type { CascadeSettings } from '@/stores/v2SettingsStore';
import { cascadePlan, regimeLabel, whoLabel, durationLabel, planSummary } from '../cascade';
import type { CascadePlan, CascadeWho } from '../cascade';
import { Drawer } from './Drawer';
import { SettingRow, Toggle, inputCls } from './controls';

/** Couleur de chaque public sur la frise. */
const WHO_STYLE: Record<CascadeWho, string> = {
  salaries: 'bg-se-blue',
  extras: 'bg-se-extra',
  personnel: 'bg-se-cascade',
  freelances: 'bg-se-freelance',
  tous: 'bg-se-freelance',
};

/** Petit champ « 24 h » dans une phrase. */
function Hours({
  value,
  onChange,
  min = 0,
  max = 168,
  step = 1,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1 mx-0.5">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.min(Math.max(n, min), max));
        }}
        className={`${inputCls} h-7 w-16 px-1.5 text-center font-bold tabular-nums`}
        aria-label={label}
      />
      <span className="text-se-muted">h</span>
    </span>
  );
}

/** La frise : publication → … → début du shift, segments proportionnels. */
export function CascadeTimeline({ plan }: { plan: CascadePlan }) {
  const total = Math.max(plan.hoursUntil, 0.5);
  return (
    <div>
      <div className="flex h-7 rounded-se-sm overflow-hidden ring-1 ring-se-line">
        {plan.steps.map((st) => {
          const share = Math.max(((st.toH - st.fromH) / total) * 100, 6);
          return (
            <div
              key={`${st.who}-${st.fromH}`}
              className={`${WHO_STYLE[st.who]} text-white text-[11px] font-semibold flex items-center justify-center px-1 truncate`}
              style={{ width: `${share}%` }}
              title={`${whoLabel[st.who]} · ${durationLabel(st.toH - st.fromH)}`}
            >
              <span className="truncate">{whoLabel[st.who]}</span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-se-muted mt-1">
        <span>Publication</span>
        {plan.steps.slice(1).map((st) => (
          <span key={st.fromH} className="tabular-nums">
            +{durationLabel(st.fromH)}
          </span>
        ))}
        <span>Début du shift ({durationLabel(plan.hoursUntil)})</span>
      </div>
    </div>
  );
}

const SIM_CHOICES: { h: number; label: string }[] = [
  { h: 2, label: '2 h' },
  { h: 5, label: '5 h' },
  { h: 12, label: '12 h' },
  { h: 36, label: '36 h' },
  { h: 72, label: '3 jours' },
  { h: 168, label: '7 jours' },
];

export function CascadePanel({ onClose }: { onClose: () => void }) {
  const cascade = useV2Settings((s) => s.cascade);
  const setCascade = useV2Settings((s) => s.setCascade);
  const setFreelanceRate = useV2Settings((s) => s.setFreelanceRate);
  const postes = useV2Settings((s) => s.postes).filter((p) => p.active);
  const account = useV2Settings((s) => s.account);
  const setAccount = useV2Settings((s) => s.setAccount);
  const rateBounds = useV2Settings((s) => s.rateBounds);
  const establishments = useV2Settings((s) => s.establishments);
  const boundsOf = useRateBounds();
  const [simH, setSimH] = useState(36);

  const multi = account.type === 'etablissements';
  const scope = multi ? account.establishmentId : COMPANY;
  const establishment = establishments.find((e) => e.id === account.establishmentId) ?? establishments[0];
  const rateOf = (poste: string) => rateFor(cascade.freelanceRates, scope, poste);
  const rates = postes.map((p) => rateOf(p.poste));
  const rateRange = rates.length === 0 ? '—' : `${Math.min(...rates)}–${Math.max(...rates)} €/h`;

  const set = (patch: Partial<Omit<CascadeSettings, 'freelanceRates'>>) => setCascade(patch);
  const plan = cascadePlan(cascade, simH);

  const tiers: {
    key: CascadePlan['regime'];
    icon: typeof Sun;
    tone: string;
    title: React.ReactNode;
    body: React.ReactNode;
  }[] = [
    {
      key: 'confort',
      icon: Sun,
      tone: 'bg-se-blue',
      title: (
        <>
          Publiée plus de{' '}
          <Hours
            value={cascade.comfortFrom}
            onChange={(comfortFrom) => set({ comfortFrom: Math.max(comfortFrom, cascade.tightFrom + 1) })}
            min={1}
            label="Seuil du palier confort"
          />{' '}
          avant le début
        </>
      ),
      body: (
        <>
          Mes salariés seuls pendant{' '}
          <Hours
            value={cascade.salariesHours}
            onChange={(salariesHours) => set({ salariesHours })}
            min={1}
            label="Heures réservées aux salariés"
          />
          , puis mes extras pendant{' '}
          <Hours
            value={cascade.extrasHours}
            onChange={(extrasHours) => set({ extrasHours })}
            min={0}
            label="Heures réservées aux extras"
          />
          , puis les auto-entrepreneurs. Dans tous les cas, les auto-entrepreneurs voient la mission au plus tard{' '}
          <Hours
            value={cascade.freelanceLatest}
            onChange={(freelanceLatest) => set({ freelanceLatest })}
            min={0}
            label="Délai minimal des auto-entrepreneurs"
          />{' '}
          avant le début.
        </>
      ),
    },
    {
      key: 'serre',
      icon: Timer,
      tone: 'bg-se-cascade',
      title: (
        <>
          Entre{' '}
          <Hours
            value={cascade.tightFrom}
            onChange={(tightFrom) => set({ tightFrom: Math.min(tightFrom, cascade.comfortFrom - 1) })}
            min={1}
            label="Seuil du palier serré"
          />{' '}
          et {cascade.comfortFrom} h avant le début
        </>
      ),
      body: (
        <>
          Tout mon personnel en même temps (salariés et extras), auto-entrepreneurs{' '}
          <Hours
            value={cascade.tightFreelanceAfter}
            onChange={(tightFreelanceAfter) => set({ tightFreelanceAfter })}
            min={0}
            step={0.5}
            label="Délai avant les auto-entrepreneurs, palier serré"
          />{' '}
          après.
        </>
      ),
    },
    {
      key: 'urgence',
      icon: Siren,
      tone: 'bg-se-freelance',
      title: <>Moins de {cascade.tightFrom} h avant le début</>,
      body: (
        <>
          Tout le monde en même temps. Mes salariés restent prioritaires si plusieurs se proposent. Sous{' '}
          <Hours
            value={cascade.boostUnder}
            onChange={(boostUnder) => set({ boostUnder })}
            min={0}
            step={0.5}
            label="Seuil du boost automatique"
          />{' '}
          , le boost est proposé d'office.
        </>
      ),
    },
  ];

  return (
    <Drawer title="Cascade" subtitle="Plus le shift est proche, plus vite tout le monde est prévenu." onClose={onClose}>
      <div className="space-y-5">
        <div className="rounded-se border border-se-line px-4">
          <SettingRow label="Cascade par défaut" hint="Proposée à chaque publication (modifiable mission par mission)">
            <Toggle on={cascade.enabled} onChange={(enabled) => setCascade({ enabled })} label="Cascade par défaut" />
          </SettingRow>
        </div>

        {/* Les trois paliers */}
        <ol className="space-y-2">
          {tiers.map(({ key, icon: Icon, tone, title, body }) => (
            <li
              key={key}
              className={`rounded-se border p-3.5 transition-colors ${
                plan.regime === key ? 'border-se-ink/40 bg-se-surface' : 'border-se-line bg-se-surface'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-9 h-9 rounded-se-sm grid place-items-center text-white shrink-0 ${tone}`}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="se-eyebrow">{regimeLabel[key]}</p>
                  <p className="text-sm font-semibold text-se-ink leading-relaxed">{title}</p>
                </div>
                {plan.regime === key && (
                  <span className="se-badge bg-se-surface-2 text-se-muted shrink-0">cas simulé</span>
                )}
              </div>
              <p className="text-sm text-se-ink leading-[2.1] mt-2">{body}</p>
            </li>
          ))}
        </ol>

        {/* Simulateur */}
        <div className="rounded-se border border-se-line bg-se-surface-2/50 p-3.5">
          <p className="se-eyebrow mb-2 inline-flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" aria-hidden="true" /> Testez
          </p>
          <p className="text-sm text-se-ink mb-3">
            Je publie maintenant un shift qui commence dans{' '}
            <select
              value={simH}
              onChange={(e) => setSimH(Number(e.target.value))}
              className={`${inputCls} h-8 px-2 font-semibold`}
              aria-label="Délai avant le début du shift simulé"
            >
              {SIM_CHOICES.map((c) => (
                <option key={c.h} value={c.h}>
                  {c.label}
                </option>
              ))}
            </select>
          </p>
          <CascadeTimeline plan={plan} />
          <p className="text-sm text-se-ink mt-3 leading-relaxed">
            {planSummary(plan)}
            {plan.regime !== 'urgence' && (
              <>
                {' '}
                Tarif maximal : <b>{rateRange} TTC</b> selon le poste{multi ? ` (${establishment.name})` : ''}.
              </>
            )}
          </p>
        </div>

        <div className="rounded-se border border-se-line px-4">
          <SettingRow
            label="Me prévenir avant chaque bascule"
            hint="Notification 1 h avant que la mission passe aux auto-entrepreneurs"
          >
            <Toggle
              on={cascade.notifyBeforeSwitch}
              onChange={(notifyBeforeSwitch) => setCascade({ notifyBeforeSwitch })}
              label="Prévenir avant la bascule"
            />
          </SettingRow>
        </div>

        {/* Étape auto-entrepreneurs : pour quel établissement, à quel tarif maximal */}
        <div className="rounded-se border border-se-line bg-se-surface p-3.5">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-se-sm grid place-items-center text-white shrink-0 bg-se-freelance">
              <Briefcase className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-se-ink">Les auto-entrepreneurs</p>
              <p className="text-xs text-se-muted">Tarif TTC affiché avant chaque validation.</p>
            </div>
          </div>
          <div className="mt-3 space-y-4">
            {multi && (
              <div>
                <p className="se-eyebrow mb-1.5">Pour l'établissement</p>
                <select
                  value={account.establishmentId}
                  onChange={(e) => setAccount({ establishmentId: e.target.value })}
                  className={`${inputCls} w-full`}
                  aria-label="Établissement"
                >
                  {establishments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <p className="se-eyebrow">Tarif horaire maximal, par poste</p>
                {multi && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-se-muted">
                    <Lock className="w-3 h-3" aria-hidden="true" /> fourchette fixée par l'entreprise
                  </span>
                )}
              </div>
              <ul className="divide-y divide-se-line rounded-se-sm border border-se-line">
                {postes.map((p) => {
                  const b = boundsOf(p.poste, scope);
                  const v = Math.min(Math.max(rateOf(p.poste), b.min), b.max);
                  const own = multi && !!rateBounds[scope]?.[p.poste];
                  return (
                    <li key={p.poste} className="px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-se-ink truncate">{p.poste}</span>
                        <span className="text-sm font-bold text-se-freelance-ink tabular-nums whitespace-nowrap">
                          {v} €/h TTC
                        </span>
                      </div>
                      <input
                        type="range"
                        min={b.min}
                        max={b.max}
                        step={1}
                        value={v}
                        onChange={(e) => setFreelanceRate(scope, p.poste, Number(e.target.value))}
                        className="w-full accent-se-freelance mt-1"
                        aria-label={`Tarif horaire maximal pour ${p.poste}`}
                      />
                      <span className="flex justify-between text-[10px] text-se-muted">
                        <span>{b.min} €</span>
                        {multi && <span>{own ? `fourchette ${establishment.name}` : 'fourchette entreprise'}</span>}
                        <span>{b.max} €</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-se-muted mt-1.5">
                {multi
                  ? "L'administrateur de l'entreprise fixe le minimum et le maximum de chaque poste, pour toute l'entreprise ou établissement par établissement (Réglages › Tarification). Vous choisissez à l'intérieur."
                  : 'Entreprise seule : vous fixez librement le tarif maximal de chaque poste.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
