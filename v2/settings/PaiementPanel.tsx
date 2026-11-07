/**
 * Paiement — comment et quand l'établissement règle les missions
 * d'auto-entrepreneurs : prélèvement SEPA (par mission ou par mois) ou
 * virement (par mois uniquement). Frais de service sur la facture mensuelle :
 * SEPA 2 %, virement 3 % ; le prélèvement par mission est sans frais.
 * Tout changement qui engage l'argent passe par une confirmation.
 */
import { useState } from 'react';
import { Landmark, Repeat, CheckCircle2, FileSignature } from 'lucide-react';
import { useV2Settings, SHIFT_EXPRESS_BANK, paymentFeePct } from '@/stores/v2SettingsStore';
import type { PaymentMethod, PaymentFrequency } from '@/stores/v2SettingsStore';
import { Drawer } from './Drawer';
import { SettingRow, Segmented, inputCls } from './controls';
import { ConfirmGuard } from '../publish/ConfirmGuard';

const METHODS: { key: PaymentMethod; label: string; blurb: string; fee: string; icon: typeof Landmark }[] = [
  {
    key: 'sepa',
    label: 'Prélèvement SEPA',
    blurb: 'Shift Express prélève sur votre compte. Rien à faire, jamais de retard.',
    fee: 'Par mission : sans frais · par mois : +2 %',
    icon: Repeat,
  },
  {
    key: 'virement',
    label: 'Virement',
    blurb: 'Une facture par mois, vous virez vous-même sous 7 jours.',
    fee: 'Par mois uniquement · +3 %',
    icon: Landmark,
  },
];

export function PaiementPanel({ onClose }: { onClose: () => void }) {
  const payment = useV2Settings((s) => s.payment);
  const setPayment = useV2Settings((s) => s.setPayment);
  const [pendingMethod, setPendingMethod] = useState<PaymentMethod | null>(null);
  const [signing, setSigning] = useState(false);

  const chooseMethod = (m: PaymentMethod) => {
    if (m === payment.method) return;
    setPendingMethod(m);
  };

  return (
    <Drawer title="Paiement" subtitle="Comment et quand vous réglez les auto-entrepreneurs." onClose={onClose}>
      <div className="relative space-y-6">
        {/* Méthode */}
        <section>
          <p className="se-eyebrow mb-2">Moyen de paiement</p>
          <div className="space-y-2">
            {METHODS.map(({ key, label, blurb, fee, icon: Icon }) => {
              const on = payment.method === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => chooseMethod(key)}
                  className={`w-full text-left rounded-se border p-3.5 flex items-start gap-3 transition-colors ${
                    on
                      ? 'border-se-blue ring-1 ring-se-blue bg-se-blue-wash/40'
                      : 'border-se-line bg-se-surface hover:border-se-muted'
                  }`}
                >
                  <span
                    className={`w-9 h-9 rounded-se-sm grid place-items-center shrink-0 ${on ? 'bg-se-blue text-white' : 'bg-se-surface-2 text-se-ink'}`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="font-semibold text-se-ink block">{label}</span>
                    <span className="text-xs text-se-muted block">{blurb}</span>
                    <span className="text-xs font-semibold text-se-ink block mt-0.5">{fee}</span>
                  </span>
                  {on && <CheckCircle2 className="w-5 h-5 text-se-blue ml-auto shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Fréquence : le virement est mensuel uniquement */}
        <section>
          <p className="se-eyebrow mb-2">Fréquence</p>
          {payment.method === 'sepa' ? (
            <Segmented<PaymentFrequency>
              value={payment.frequency}
              onChange={(frequency) => setPayment({ frequency })}
              options={[
                { key: 'shift', label: 'Par mission' },
                { key: 'mois', label: 'Par mois' },
              ]}
            />
          ) : (
            <p className="text-sm font-semibold text-se-ink">Par mois</p>
          )}
          <p className="text-xs text-se-muted mt-2 leading-relaxed">
            {payment.frequency === 'shift'
              ? "Chaque mission est prélevée 2 jours après la validation de son relevé d'heures. Une facture par mission, sans frais de service."
              : payment.method === 'sepa'
                ? `Une seule facture récapitulative par mois, prélevée le ${payment.dayOfMonth} du mois suivant, frais de service de ${paymentFeePct(payment)} % compris.`
                : `Une seule facture récapitulative par mois, envoyée le ${payment.dayOfMonth} du mois suivant, à régler sous 7 jours, frais de service de ${paymentFeePct(payment)} % compris. Le virement n'existe pas par mission.`}
          </p>
        </section>

        {/* Détails */}
        <section className="rounded-se border border-se-line px-4">
          {payment.frequency === 'mois' && (
            <SettingRow label="Jour du règlement" hint="Date de la facture récapitulative">
              <select
                value={payment.dayOfMonth}
                onChange={(e) => setPayment({ dayOfMonth: Number(e.target.value) })}
                className={inputCls}
                aria-label="Jour du mois"
              >
                {[1, 5, 10, 15, 20, 25].map((d) => (
                  <option key={d} value={d}>
                    le {d}
                  </option>
                ))}
              </select>
            </SettingRow>
          )}
          <SettingRow
            label="Frais de service"
            hint={paymentFeePct(payment) > 0 ? 'Ajoutés à la facture mensuelle' : 'Aucun en prélèvement par mission'}
          >
            <span className="text-sm font-bold text-se-ink tabular-nums">
              {paymentFeePct(payment) > 0 ? `+${paymentFeePct(payment)} %` : '0 %'}
            </span>
          </SettingRow>
          {payment.method === 'sepa' ? (
            <SettingRow label="Compte bancaire" hint="Compte prélevé">
              <code className="text-xs bg-se-surface-2 rounded-se-sm px-2.5 py-1.5 text-se-ink">{payment.iban}</code>
            </SettingRow>
          ) : (
            <SettingRow label="Virer à" hint={`${SHIFT_EXPRESS_BANK.holder} · BIC ${SHIFT_EXPRESS_BANK.bic}`}>
              <code className="select-all text-xs bg-se-surface-2 rounded-se-sm px-2.5 py-1.5 text-se-ink tabular-nums">
                {SHIFT_EXPRESS_BANK.iban}
              </code>
            </SettingRow>
          )}
          {payment.method === 'sepa' && (
            <SettingRow
              label="Mandat SEPA"
              hint={payment.mandateSigned ? 'Signé électroniquement' : 'À signer pour activer le prélèvement'}
            >
              {payment.mandateSigned ? (
                <span className="se-badge bg-se-success-wash text-se-success inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Signé
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setSigning(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
                >
                  <FileSignature className="w-4 h-4" aria-hidden="true" /> Signer le mandat
                </button>
              )}
            </SettingRow>
          )}
          <SettingRow label="Factures envoyées à" hint="Vous pouvez mettre votre comptable">
            <input
              type="email"
              value={payment.invoiceEmail}
              onChange={(e) => setPayment({ invoiceEmail: e.target.value })}
              className={`${inputCls} w-52`}
              aria-label="E-mail de facturation"
            />
          </SettingRow>
        </section>

        <p className="text-xs text-se-muted leading-relaxed">
          Le tarif de chaque auto-entrepreneur est affiché TTC avant toute validation, et vous ne réglez que les heures
          validées. Ce réglage ne concerne que les auto-entrepreneurs.
        </p>

        {/* Garde-fous */}
        {pendingMethod && (
          <ConfirmGuard
            title={pendingMethod === 'sepa' ? 'Passer au prélèvement SEPA ?' : 'Passer au virement ?'}
            confirmLabel={pendingMethod === 'sepa' ? 'Passer au prélèvement' : 'Passer au virement'}
            onCancel={() => setPendingMethod(null)}
            onConfirm={() => {
              setPayment({
                method: pendingMethod,
                mandateSigned: pendingMethod === 'sepa' ? payment.mandateSigned : false,
              });
              setPendingMethod(null);
            }}
          >
            {pendingMethod === 'sepa' ? (
              <>
                <p>Les prochaines factures seront prélevées sur le compte {payment.iban}.</p>
                <p>{payment.mandateSigned ? 'Votre mandat est déjà signé.' : 'Il vous restera à signer le mandat.'}</p>
              </>
            ) : (
              <>
                <p>
                  Une facture par mois, à virer vous-même sous 7 jours à {SHIFT_EXPRESS_BANK.holder}, frais de service
                  de 3 % compris. L'IBAN s'affiche dans Factures & heures.
                </p>
                <p>Au-delà de 7 jours, les nouvelles publications aux auto-entrepreneurs sont suspendues.</p>
              </>
            )}
          </ConfirmGuard>
        )}
        {signing && (
          <ConfirmGuard
            title="Signer le mandat SEPA"
            confirmLabel="Je signe le mandat"
            onCancel={() => setSigning(false)}
            onConfirm={() => {
              setPayment({ mandateSigned: true });
              setSigning(false);
            }}
          >
            <p>Vous autorisez Shift Express à prélever les factures de missions sur le compte {payment.iban}.</p>
            <p>Révocable à tout moment depuis cet écran.</p>
          </ConfirmGuard>
        )}
      </div>
    </Drawer>
  );
}
