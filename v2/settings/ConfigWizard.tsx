/**
 * Assistant de Configuration — 3 étapes, en mots simples, pour démarrer sans
 * formation : (1) l'établissement et le mode, (2) les postes et tarifs,
 * (3) inviter l'équipe. Un pas à la fois, Précédent / Suivant, puis Terminer.
 */
import { useState } from 'react';
import { X, Check, Copy } from 'lucide-react';
import { usageModes, tarifs, cascadeOrder, publicLinks } from '@/mocks/v2Settings';
import type { UsageMode } from '@/mocks/v2Settings';
import { useV2Settings, rateFor, COMPANY } from '@/stores/v2SettingsStore';
import { BillingFields, isBillingComplete } from './BillingFields';
import type { BillingValue } from './BillingFields';

const STEPS = ['Établissement', 'Postes & tarifs', 'Votre équipe'] as const;

interface Props {
  initialMode: UsageMode;
  onClose: () => void;
  onDone: (mode: UsageMode) => void;
}

export function ConfigWizard({ initialMode, onClose, onDone }: Props) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<UsageMode>(initialMode);
  const [name, setName] = useState('Le Comptoir du Centre');
  const [address, setAddress] = useState('12 rue des Halles, 69001 Lyon');
  // Fiche comptable : indispensable pour que les factures partent au bon endroit.
  const company = useV2Settings((s) => s.company);
  const freelanceRates = useV2Settings((s) => s.cascade.freelanceRates);
  const setCompany = useV2Settings((s) => s.setCompany);
  const [billing, setBilling] = useState<BillingValue>(company);
  const billingOk = isBillingComplete(billing);

  // Mode auto-entrepreneur : pas d'équipe à inviter, pas de salaires.
  const freelanceOnly = mode === 'freelance';
  const steps: readonly string[] = freelanceOnly ? ['Établissement', 'Tarifs', 'Vos auto-entrepreneurs'] : STEPS;
  const links = publicLinks.filter((l) => !freelanceOnly || l.id === 'l-freelance');

  const last = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-se-ink/40" />
      <div className="se-root relative w-full max-w-lg max-h-[92vh] flex flex-col bg-se-surface rounded-se shadow-se-md overflow-hidden">
        {/* En-tête + progression */}
        <header className="px-5 py-4 border-b border-se-line">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-extrabold text-se-ink">Configuration</h2>
            <button
              type="button"
              aria-label="Fermer"
              onClick={onClose}
              className="ml-auto w-8 h-8 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            {steps.map((label, i) => (
              <div key={label} className="flex items-center gap-2 flex-1 last:flex-none">
                <span
                  className={`w-6 h-6 rounded-full grid place-items-center text-xs font-bold shrink-0 ${
                    i < step
                      ? 'bg-se-success text-white'
                      : i === step
                        ? 'bg-se-blue text-white'
                        : 'bg-se-surface-2 text-se-muted'
                  }`}
                >
                  {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </span>
                <span className={`text-xs font-semibold ${i === step ? 'text-se-ink' : 'text-se-muted'}`}>{label}</span>
                {i < steps.length - 1 && <span className="flex-1 h-px bg-se-line" />}
              </div>
            ))}
          </div>
        </header>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === 0 && (
            <div className="space-y-5">
              <label className="block">
                <span className="se-eyebrow block mb-1.5">Nom de l'établissement</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="se-eyebrow block mb-1.5">Adresse de l'établissement</span>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
              </label>

              {/* Informations comptables : raison sociale, SIRET, facturation, contact, comptable */}
              <div className="rounded-se border border-se-line p-3.5">
                <p className="se-eyebrow mb-2">Informations comptables</p>
                <BillingFields
                  value={billing}
                  onChange={(p) => setBilling((b) => ({ ...b, ...p }))}
                  address={address}
                />
                {!billingOk && (
                  <p className="text-xs text-se-muted mt-2">
                    Raison sociale, SIRET (14 chiffres), adresse de facturation, contact et e-mail du comptable sont
                    nécessaires pour facturer.
                  </p>
                )}
              </div>

              <div>
                <p className="se-eyebrow mb-2">Comment vous allez l'utiliser</p>
                <div className="space-y-2">
                  {(['complete', 'freelance'] as UsageMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`w-full text-left rounded-se border p-3 ${
                        mode === m ? 'border-se-blue ring-1 ring-se-blue' : 'border-se-line hover:border-se-muted'
                      }`}
                    >
                      <span className="font-semibold text-se-ink block">{usageModes[m].label}</span>
                      <span className="text-xs text-se-muted">{usageModes[m].blurb}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              {!freelanceOnly && (
                <>
                  <p className="se-eyebrow mb-2">Ordre de la cascade</p>
                  <div className="flex items-center flex-wrap gap-1.5 mb-5">
                    {cascadeOrder.map((s, i) => (
                      <span key={s} className="inline-flex items-center gap-1.5">
                        {i > 0 && <span className="text-se-muted">›</span>}
                        <span className="se-badge bg-se-surface-2 text-se-ink" style={{ height: 24 }}>
                          {s}
                        </span>
                      </span>
                    ))}
                  </div>
                </>
              )}
              <p className="se-eyebrow mb-2">
                {freelanceOnly ? 'Vos postes et le tarif auto-entrepreneur' : 'Vos postes et leurs tarifs'}
              </p>
              <div className="rounded-se border border-se-line overflow-hidden">
                {tarifs.map((t) => (
                  <div
                    key={t.poste}
                    className="flex items-center justify-between px-3 py-2.5 border-b border-se-line last:border-0"
                  >
                    <span className="text-sm font-semibold text-se-ink">{t.poste}</span>
                    <span className="text-sm text-se-muted">
                      {!freelanceOnly && <>{t.salaireHoraire} €/h · </>}
                      {/* Le tarif réellement réglé dans Réglages, pas l'indicatif du mock */}
                      <span className="text-se-freelance-ink font-semibold">
                        {rateFor(freelanceRates, COMPANY, t.poste)} €/h TTC
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-se-muted mt-2">Vous pourrez ajuster chaque tarif plus tard dans Réglages.</p>
            </div>
          )}

          {step === 2 && (
            <div>
              <p className="text-sm text-se-ink mb-4">
                {freelanceOnly
                  ? "Partagez ce lien aux auto-entrepreneurs qui veulent travailler avec vous. C'est la dernière étape."
                  : "Partagez un lien pour que votre équipe et les freelances vous rejoignent. C'est la dernière étape."}
              </p>
              <ul className="space-y-3">
                {links.map((l) => (
                  <li key={l.id} className="rounded-se border border-se-line p-3.5">
                    <p className="font-semibold text-se-ink">{l.label}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <code className="flex-1 min-w-0 truncate text-xs bg-se-surface-2 rounded-se-sm px-2.5 py-2 text-se-ink">
                        {l.url}
                      </code>
                      <span className="inline-flex items-center gap-1 px-3 py-2 rounded-se-sm text-sm font-semibold border border-se-line text-se-muted shrink-0">
                        <Copy className="w-4 h-4" aria-hidden="true" /> Copier
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Pied — un pas à la fois */}
        <footer className="flex items-center gap-2 px-5 py-4 border-t border-se-line">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="px-4 py-2.5 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
            >
              Précédent
            </button>
          ) : (
            <span className="text-xs text-se-muted">
              Étape {step + 1} sur {STEPS.length}
            </span>
          )}
          <button
            type="button"
            disabled={step === 0 && !billingOk}
            onClick={() => {
              if (step === 0) setCompany(billing);
              if (last) onDone(mode);
              else setStep((s) => s + 1);
            }}
            className="ml-auto px-5 py-2.5 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink disabled:opacity-40"
          >
            {last ? 'Terminer' : 'Suivant'}
          </button>
        </footer>
      </div>
    </div>
  );
}

const inputCls =
  'w-full h-10 rounded-se-sm border border-se-line bg-se-surface px-3 text-sm text-se-ink focus:outline-none focus:border-se-blue';
