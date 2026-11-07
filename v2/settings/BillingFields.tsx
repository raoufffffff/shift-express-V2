/**
 * Informations comptables d'une entreprise ou d'un établissement : raison
 * sociale, SIRET, adresse de facturation, nom du contact, e-mail du comptable.
 * Même bloc partout où l'on crée ou modifie un lieu (Établissements,
 * Configuration guidée), pour que les factures partent au bon endroit.
 */
import { Building2, Mail, MapPin, User, Hash } from 'lucide-react';

export interface BillingValue {
  /** raison sociale (nom légal facturé) */
  legalName: string;
  siret: string;
  billingAddress: string;
  contactName: string;
  accountingEmail: string;
}

export const EMPTY_BILLING: BillingValue = {
  legalName: '',
  siret: '',
  billingAddress: '',
  contactName: '',
  accountingEmail: '',
};

/** SIRET = 14 chiffres (espaces tolérés). */
export const isSiretValid = (s: string): boolean => /^\d{14}$/.test(s.replace(/\s/g, ''));
export const isEmailValid = (s: string): boolean => /\S+@\S+\.\S+/.test(s);
/** « 901 234 567 00012 » */
export const formatSiret = (s: string): string => {
  const d = s.replace(/\D/g, '').slice(0, 14);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9)].filter(Boolean).join(' ');
};
/** Tout est renseigné et cohérent ? */
export const isBillingComplete = (v: BillingValue): boolean =>
  v.legalName.trim().length > 1 &&
  isSiretValid(v.siret) &&
  v.billingAddress.trim().length > 4 &&
  v.contactName.trim().length > 1 &&
  isEmailValid(v.accountingEmail);

const baseInput =
  'w-full h-9 rounded-se-sm border border-se-line bg-se-surface px-3 text-sm text-se-ink focus:outline-none focus:border-se-blue';

export function BillingFields({
  value,
  onChange,
  address,
  autoFocus,
}: {
  value: BillingValue;
  onChange: (patch: Partial<BillingValue>) => void;
  /** adresse du lieu : propose « même adresse » pour la facturation */
  address?: string;
  autoFocus?: boolean;
}) {
  const same = !!address && value.billingAddress === address;
  const siretOk = value.siret === '' || isSiretValid(value.siret);
  const emailOk = value.accountingEmail === '' || isEmailValid(value.accountingEmail);

  return (
    <div className="grid sm:grid-cols-2 gap-x-3 gap-y-3">
      <label className="block">
        <span className="se-eyebrow mb-1.5 inline-flex items-center gap-1">
          <Building2 className="w-3 h-3" aria-hidden="true" /> Raison sociale
        </span>
        <input
          autoFocus={autoFocus}
          value={value.legalName}
          onChange={(e) => onChange({ legalName: e.target.value })}
          placeholder="Ex. Comptoir du Centre SAS"
          className={baseInput}
        />
      </label>
      <label className="block">
        <span className="se-eyebrow mb-1.5 inline-flex items-center gap-1">
          <Hash className="w-3 h-3" aria-hidden="true" /> SIRET
        </span>
        <input
          value={value.siret}
          onChange={(e) => onChange({ siret: formatSiret(e.target.value) })}
          inputMode="numeric"
          placeholder="14 chiffres"
          className={`${baseInput} tabular-nums ${siretOk ? '' : 'border-se-danger'}`}
          aria-invalid={!siretOk}
        />
        {!siretOk && <span className="block text-[11px] text-se-danger mt-1">Le SIRET fait 14 chiffres.</span>}
      </label>
      <label className="block sm:col-span-2">
        <span className="se-eyebrow mb-1.5 inline-flex items-center gap-1">
          <MapPin className="w-3 h-3" aria-hidden="true" /> Adresse de facturation
        </span>
        <input
          value={value.billingAddress}
          onChange={(e) => onChange({ billingAddress: e.target.value })}
          placeholder="Rue, code postal, ville"
          className={baseInput}
        />
        {address && (
          <label className="inline-flex items-center gap-1.5 text-xs text-se-muted mt-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={same}
              onChange={(e) => onChange({ billingAddress: e.target.checked ? address : '' })}
              className="accent-se-blue"
            />
            Même adresse que l'établissement
          </label>
        )}
      </label>
      <label className="block">
        <span className="se-eyebrow mb-1.5 inline-flex items-center gap-1">
          <User className="w-3 h-3" aria-hidden="true" /> Nom du contact
        </span>
        <input
          value={value.contactName}
          onChange={(e) => onChange({ contactName: e.target.value })}
          placeholder="Prénom Nom"
          className={baseInput}
        />
      </label>
      <label className="block">
        <span className="se-eyebrow mb-1.5 inline-flex items-center gap-1">
          <Mail className="w-3 h-3" aria-hidden="true" /> E-mail du comptable
        </span>
        <input
          type="email"
          value={value.accountingEmail}
          onChange={(e) => onChange({ accountingEmail: e.target.value })}
          placeholder="compta@…"
          className={`${baseInput} ${emailOk ? '' : 'border-se-danger'}`}
          aria-invalid={!emailOk}
        />
        <span className="block text-[11px] text-se-muted mt-1">Reçoit les factures et les relevés.</span>
      </label>
    </div>
  );
}

/** Résumé lisible d'une fiche comptable (carte d'établissement, bloc entreprise). */
export function BillingSummary({ value }: { value: BillingValue }) {
  return (
    <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
      <div className="flex gap-1.5 min-w-0">
        <dt className="text-se-muted shrink-0">Raison sociale</dt>
        <dd className="text-se-ink font-semibold truncate">{value.legalName || '—'}</dd>
      </div>
      <div className="flex gap-1.5 min-w-0">
        <dt className="text-se-muted shrink-0">SIRET</dt>
        <dd className="text-se-ink tabular-nums truncate">{value.siret || '—'}</dd>
      </div>
      <div className="flex gap-1.5 min-w-0 sm:col-span-2">
        <dt className="text-se-muted shrink-0">Facturation</dt>
        <dd className="text-se-ink truncate">{value.billingAddress || '—'}</dd>
      </div>
      <div className="flex gap-1.5 min-w-0">
        <dt className="text-se-muted shrink-0">Contact</dt>
        <dd className="text-se-ink truncate">{value.contactName || '—'}</dd>
      </div>
      <div className="flex gap-1.5 min-w-0">
        <dt className="text-se-muted shrink-0">Comptable</dt>
        <dd className="text-se-ink truncate">{value.accountingEmail || '—'}</dd>
      </div>
    </dl>
  );
}
