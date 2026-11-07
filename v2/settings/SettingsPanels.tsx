/**
 * Les panneaux ouverts depuis Réglages › établissement : Établissements (type
 * de compte + gestionnaires), Tarification (salaire indicatif, fourchette
 * auto-entrepreneur pour l'entreprise ou par établissement), Liens.
 * Chacun dans un drawer, avec au plus une action principale.
 */
import { useState } from 'react';
import { MapPin, Copy, Check, Plus, Lock, Trash2, UserCog, RotateCcw, Pencil, Receipt } from 'lucide-react';
import { cascadeOrder, publicLinks } from '@/mocks/v2Settings';
import { useV2Settings, salaryRateOf, boundsFor, rateFor, COMPANY } from '@/stores/v2SettingsStore';
import type { AccountType, Manager, ManagerRole, BillingInfo, EstablishmentInfo } from '@/stores/v2SettingsStore';
import { useV2Ui } from '@/stores/v2UiStore';
import { Drawer } from './Drawer';
import { UpgradeDialog } from './UpgradeDialog';
import { planLimits, planName, isUnlimited, limitLabel, nextPlan } from '../plan';
import { Segmented, inputCls } from './controls';
import { BillingFields, BillingSummary, EMPTY_BILLING, isBillingComplete } from './BillingFields';

/* ── Établissements : type de compte, fiche comptable, lieux, gestionnaires ── */
export function EtablissementsPanel({ onClose }: { onClose: () => void }) {
  const type = useV2Settings((s) => s.account.type);
  const setAccount = useV2Settings((s) => s.setAccount);
  const managers = useV2Settings((s) => s.managers);
  const addManager = useV2Settings((s) => s.addManager);
  const removeManager = useV2Settings((s) => s.removeManager);
  const company = useV2Settings((s) => s.company);
  const setCompany = useV2Settings((s) => s.setCompany);
  const establishments = useV2Settings((s) => s.establishments);
  const addEstablishment = useV2Settings((s) => s.addEstablishment);
  const updateEstablishment = useV2Settings((s) => s.updateEstablishment);
  const multi = type === 'etablissements';
  // Formule : combien d'établissements elle permet.
  const plan = useV2Ui((s) => s.plan);
  const estLimit = planLimits(plan).establishments;
  const estAtLimit = !isUnlimited(estLimit) && establishments.length >= estLimit;
  const [upgrading, setUpgrading] = useState(false);

  // Formulaire « ajouter un gestionnaire » : pour quelle portée (null = entreprise).
  const [addingFor, setAddingFor] = useState<string | null | undefined>(undefined);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  // Fiche comptable en cours de modification : 'company' ou l'id d'un établissement.
  const [editingBilling, setEditingBilling] = useState<string | null>(null);
  // Création d'un établissement : nom, adresse + fiche comptable.
  const [addingEst, setAddingEst] = useState(false);
  const [newEst, setNewEst] = useState<{ name: string; address: string } & BillingInfo>({
    name: '',
    address: '',
    ...EMPTY_BILLING,
  });
  const newEstOk = newEst.name.trim().length > 1 && newEst.address.trim().length > 4 && isBillingComplete(newEst);
  const createEstablishment = () => {
    if (!newEstOk) return;
    addEstablishment({ ...newEst, name: newEst.name.trim(), address: newEst.address.trim() });
    setNewEst({ name: '', address: '', ...EMPTY_BILLING });
    setAddingEst(false);
  };

  /** Fiche comptable : résumé, ou formulaire si on la modifie. */
  const billing = (key: string, value: BillingInfo, onChange: (p: Partial<BillingInfo>) => void, address?: string) =>
    editingBilling === key ? (
      <div className="mt-3 rounded-se-sm bg-se-surface-2/50 p-3">
        <BillingFields value={value} onChange={onChange} address={address} />
        <button
          type="button"
          onClick={() => setEditingBilling(null)}
          disabled={!isBillingComplete(value)}
          className="mt-3 h-9 px-3.5 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink disabled:opacity-40"
        >
          Terminé
        </button>
      </div>
    ) : (
      <div className="mt-2">
        <div className="flex items-center justify-between">
          <p className="se-eyebrow inline-flex items-center gap-1">
            <Receipt className="w-3 h-3" aria-hidden="true" /> Facturation
          </p>
          <button
            type="button"
            onClick={() => setEditingBilling(key)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-se-blue-ink hover:text-se-blue"
          >
            <Pencil className="w-3 h-3" aria-hidden="true" /> Modifier
          </button>
        </div>
        <BillingSummary value={value} />
      </div>
    );

  const admins = managers.filter((m) => m.establishmentId === null);
  const forEst = (id: string) => managers.filter((m) => m.establishmentId === id);

  const list = (rows: Manager[], scope: string | null) => (
    <ul className="mt-2 space-y-1">
      {rows.map((m) => (
        <li key={m.id} className="flex items-center gap-2 text-sm">
          <span className="w-7 h-7 rounded-full bg-se-surface-2 grid place-items-center text-[11px] font-bold text-se-ink shrink-0">
            {m.name
              .split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 2)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-se-ink block truncate">{m.name}</span>
            <span className="text-xs text-se-muted block truncate">{m.email}</span>
          </span>
          <span
            className={`se-badge ${m.role === 'admin' ? 'bg-se-blue-wash text-se-blue-ink' : 'bg-se-surface-2 text-se-muted'}`}
            style={{ height: 18 }}
          >
            {m.role === 'admin' ? 'Administrateur' : 'Gestionnaire'}
          </span>
          {confirmRemove === m.id ? (
            <span className="inline-flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  removeManager(m.id);
                  setConfirmRemove(null);
                }}
                className="px-2 py-1 rounded-se-sm font-semibold bg-se-danger text-white"
              >
                Retirer
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                className="px-2 py-1 rounded-se-sm font-semibold text-se-muted hover:bg-se-surface-2"
              >
                Non
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemove(m.id)}
              aria-label={`Retirer ${m.name}`}
              className="w-7 h-7 grid place-items-center rounded-se-sm text-se-muted hover:text-se-danger hover:bg-se-danger-wash"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </li>
      ))}
      <li>
        {addingFor === scope ? (
          <AddManagerForm
            scope={scope}
            onCancel={() => setAddingFor(undefined)}
            onAdd={(m) => {
              addManager(m);
              setAddingFor(undefined);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingFor(scope)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-se-blue-ink hover:text-se-blue mt-1"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            {scope === null ? 'Ajouter un administrateur' : 'Ajouter un gestionnaire'}
          </button>
        )}
      </li>
    </ul>
  );

  return (
    <Drawer
      title="Établissements"
      subtitle="Un seul lieu, ou plusieurs établissements sous une même entreprise — et qui les gère."
      onClose={onClose}
      wide
      footer={
        !multi ? undefined : addingEst ? (
          <div className="space-y-3">
            <p className="se-eyebrow">Nouvel établissement</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                autoFocus
                value={newEst.name}
                onChange={(e) => setNewEst((v) => ({ ...v, name: e.target.value }))}
                placeholder="Nom de l'établissement"
                className={`${inputCls} w-full`}
                aria-label="Nom de l'établissement"
              />
              <input
                value={newEst.address}
                onChange={(e) =>
                  setNewEst((v) => ({
                    ...v,
                    address: e.target.value,
                    // La facturation suit l'adresse tant qu'on n'a pas saisi autre chose.
                    billingAddress: v.billingAddress === v.address ? e.target.value : v.billingAddress,
                  }))
                }
                placeholder="Adresse de l'établissement"
                className={`${inputCls} w-full`}
                aria-label="Adresse de l'établissement"
              />
            </div>
            <BillingFields
              value={newEst}
              onChange={(p) => setNewEst((v) => ({ ...v, ...p }))}
              address={newEst.address || undefined}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={createEstablishment}
                disabled={!newEstOk}
                className="h-10 px-4 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink disabled:opacity-40"
              >
                Créer l'établissement
              </button>
              <button
                type="button"
                onClick={() => setAddingEst(false)}
                className="h-10 px-3 rounded-se-sm text-sm font-semibold text-se-muted hover:bg-se-surface-2"
              >
                Annuler
              </button>
              {!newEstOk && (
                <span className="text-xs text-se-muted ml-auto">Nom, adresse et fiche comptable complète.</span>
              )}
            </div>
          </div>
        ) : estAtLimit ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-se-ink">
            <Lock className="w-4 h-4 text-se-muted shrink-0" aria-hidden="true" />
            <span>
              Formule {planName(plan)} : {limitLabel(estLimit, 'établissement')}.
              {nextPlan(plan) ? ` Pour en ajouter, passez à ${planName(nextPlan(plan)!)}.` : ''}
            </span>
            <button
              type="button"
              onClick={() => setUpgrading(true)}
              className="ml-auto text-sm font-semibold text-se-blue-ink hover:text-se-blue"
            >
              Voir les formules ›
            </button>
            {upgrading && (
              <UpgradeDialog
                onClose={() => setUpgrading(false)}
                reason={`Formule ${planName(plan)} : ${limitLabel(estLimit, 'établissement')}. Choisissez une formule qui en permet plus.`}
              />
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingEst(true)}
            className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> Ajouter un établissement
          </button>
        )
      }
    >
      <p className="se-eyebrow mb-1.5">Type de compte</p>
      <Segmented<AccountType>
        value={type}
        onChange={(t) => setAccount({ type: t })}
        options={[
          { key: 'seule', label: 'Entreprise seule' },
          { key: 'etablissements', label: 'Entreprise avec établissements' },
        ]}
      />
      <p className="text-xs text-se-muted mt-2 mb-5 leading-relaxed">
        {multi
          ? "Les administrateurs de l'entreprise fixent, pour chaque poste, le tarif auto-entrepreneur minimum et maximum — pour toute l'entreprise ou établissement par établissement (Tarification). Chaque gestionnaire règle le tarif maximal de son établissement à l'intérieur de cette fourchette."
          : 'Pas d’établissement : les gestionnaires règlent tout, y compris le tarif maximal proposé pour chaque poste.'}
      </p>

      {/* Entreprise : fiche comptable + administrateurs */}
      <div className="rounded-se border border-se-line p-3.5 mb-3">
        <p className="font-semibold text-se-ink inline-flex items-center gap-1.5">
          <UserCog className="w-4 h-4 text-se-muted" aria-hidden="true" /> Entreprise
        </p>
        <p className="text-xs text-se-muted mt-0.5">
          {multi
            ? 'Les administrateurs voient tous les établissements et fixent les fourchettes.'
            : 'Les personnes qui gèrent le compte.'}
        </p>
        {billing('company', company, setCompany)}
        <p className="se-eyebrow mt-3">Administrateurs</p>
        {list(admins, null)}
      </div>

      {multi ? (
        <ul className="space-y-3">
          {establishments.map((e: EstablishmentInfo) => (
            <li key={e.id} className="rounded-se border border-se-line p-3.5">
              <p className="font-semibold text-se-ink">{e.name}</p>
              <p className="text-sm text-se-muted inline-flex items-center gap-1 mt-1">
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> {e.address}
              </p>
              {billing(e.id, e, (p) => updateEstablishment(e.id, p), e.address)}
              <p className="se-eyebrow mt-3">Gestionnaires</p>
              {list(forEst(e.id), e.id)}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-se border border-se-line p-3.5">
          <p className="font-semibold text-se-ink">{establishments[0].name}</p>
          <p className="text-sm text-se-muted inline-flex items-center gap-1 mt-1">
            <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> {establishments[0].address}
          </p>
          <p className="text-xs text-se-muted mt-2">Facturé à l'entreprise (fiche ci-dessus).</p>
        </div>
      )}
    </Drawer>
  );
}

function AddManagerForm({
  scope,
  onCancel,
  onAdd,
}: {
  scope: string | null;
  onCancel: () => void;
  onAdd: (m: Omit<Manager, 'id'>) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const role: ManagerRole = scope === null ? 'admin' : 'gestionnaire';
  const ok = name.trim().length > 1 && /\S+@\S+\.\S+/.test(email);
  const submit = () => ok && onAdd({ name: name.trim(), email: email.trim(), role, establishmentId: scope });
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Prénom Nom"
        className={`${inputCls} flex-1 min-w-[140px]`}
        aria-label="Nom"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="E-mail d'invitation"
        className={`${inputCls} flex-1 min-w-[180px]`}
        aria-label="E-mail"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!ok}
        className="h-9 px-3.5 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink disabled:opacity-40"
      >
        Inviter
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="h-9 px-2.5 rounded-se-sm text-sm font-semibold text-se-muted hover:bg-se-surface-2"
      >
        Annuler
      </button>
    </div>
  );
}

/* ── Tarification ────────────────────────────────────────────── */
export function TarificationPanel({ onClose }: { onClose: () => void }) {
  const postes = useV2Settings((s) => s.postes);
  const rateBounds = useV2Settings((s) => s.rateBounds);
  const setRateBounds = useV2Settings((s) => s.setRateBounds);
  const clearRateBounds = useV2Settings((s) => s.clearRateBounds);
  const rates = useV2Settings((s) => s.cascade.freelanceRates);
  const multi = useV2Settings((s) => s.account.type) === 'etablissements';
  const setFreelanceRate = useV2Settings((s) => s.setFreelanceRate);
  const establishments = useV2Settings((s) => s.establishments);
  // Mode auto-entrepreneur : pas de salaire, pas de cascade ; le tarif max se règle ici.
  const freelanceOnly = useV2Ui((s) => s.mode) === 'freelance';
  // Portée en cours d'édition : toute l'entreprise, ou un établissement.
  const [scope, setScope] = useState<string>(COMPANY);
  const scopeName = scope === COMPANY ? "Toute l'entreprise" : (establishments.find((e) => e.id === scope)?.name ?? '');

  const numCls =
    'w-14 h-7 px-1.5 rounded-se-sm border border-se-line bg-se-surface text-sm text-se-ink text-right focus:outline-none focus:border-se-blue';
  // Colonnes : poste · (salaire) · (fourchette) · tarif max
  const cols = `grid-cols-[1fr${freelanceOnly ? '' : '_auto'}${multi ? '_auto' : ''}_auto]`;

  return (
    <Drawer
      title="Tarification"
      subtitle={
        freelanceOnly
          ? 'Tarif horaire maximal proposé aux auto-entrepreneurs, par poste.'
          : 'Salaire indicatif par poste, et tarif auto-entrepreneur.'
      }
      onClose={onClose}
      wide
    >
      {!freelanceOnly && (
        <>
          <p className="se-eyebrow mb-2">Ordre de la cascade</p>
          <div className="flex items-center flex-wrap gap-1.5 mb-5">
            {cascadeOrder.map((step, i) => (
              <span key={step} className="inline-flex items-center gap-1.5">
                {i > 0 && <span className="text-se-muted">›</span>}
                <span className="se-badge bg-se-surface-2 text-se-ink" style={{ height: 24 }}>
                  {step}
                </span>
              </span>
            ))}
          </div>
        </>
      )}

      {multi && (
        <div className="mb-3">
          <p className="se-eyebrow mb-1.5 inline-flex items-center gap-1">
            <Lock className="w-3 h-3" aria-hidden="true" /> Fourchette auto-entrepreneur pour
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[{ id: COMPANY, name: "Toute l'entreprise" }, ...establishments].map((e) => {
              const on = scope === e.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setScope(e.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                    on ? 'bg-se-blue text-white border-se-blue' : 'border-se-line text-se-ink hover:border-se-muted'
                  }`}
                >
                  {e.name}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-se-muted mt-1.5">
            {scope === COMPANY
              ? 'La fourchette de référence. Un établissement sans réglage propre la suit.'
              : `Propre à ${scopeName} : laissez vide pour suivre l'entreprise.`}
          </p>
        </div>
      )}

      <p className="se-eyebrow mb-2">Par poste</p>
      <div className="rounded-se border border-se-line overflow-hidden">
        <div className={`grid ${cols} gap-3 px-3 py-2 border-b border-se-line se-eyebrow`}>
          <span>Poste</span>
          {!freelanceOnly && <span className="w-16 text-right">Salaire</span>}
          {multi && <span className="w-[176px] text-right">Fourchette auto-entr.</span>}
          <span className="w-24 text-right">Tarif max</span>
        </div>
        {postes.map((p) => {
          const b = boundsFor(rateBounds, scope, p.poste);
          const own = scope === COMPANY || !!rateBounds[scope]?.[p.poste];
          const rate = rateFor(rates, scope, p.poste);
          return (
            <div
              key={p.poste}
              className={`grid ${cols} gap-3 px-3 py-2.5 border-b border-se-line last:border-0 items-center`}
            >
              <span className="text-sm font-semibold text-se-ink truncate">{p.poste}</span>
              {!freelanceOnly && (
                <span className="w-16 text-right text-sm text-se-muted">{salaryRateOf(p.poste)} €/h</span>
              )}
              {multi && (
                <span className="w-[176px] inline-flex items-center justify-end gap-1 text-sm text-se-ink">
                  {scope !== COMPANY &&
                    (own ? (
                      <button
                        type="button"
                        onClick={() => clearRateBounds(scope, p.poste)}
                        title="Revenir à la fourchette de l'entreprise"
                        aria-label={`Revenir à la fourchette de l'entreprise pour ${p.poste}`}
                        className="w-6 h-6 grid place-items-center rounded-se-sm text-se-muted hover:text-se-ink hover:bg-se-surface-2"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    ) : (
                      <span className="text-[10px] text-se-muted mr-1" title="Suit la fourchette de l'entreprise">
                        entreprise
                      </span>
                    ))}
                  <input
                    type="number"
                    min={10}
                    max={90}
                    value={b.min}
                    onChange={(e) => setRateBounds(scope, p.poste, { min: Number(e.target.value) })}
                    className={`${numCls} ${!own ? 'text-se-muted' : ''}`}
                    aria-label={`Tarif minimum pour ${p.poste}`}
                  />
                  <span className="text-se-muted">–</span>
                  <input
                    type="number"
                    min={10}
                    max={90}
                    value={b.max}
                    onChange={(e) => setRateBounds(scope, p.poste, { max: Number(e.target.value) })}
                    className={`${numCls} ${!own ? 'text-se-muted' : ''}`}
                    aria-label={`Tarif maximum pour ${p.poste}`}
                  />
                </span>
              )}
              {freelanceOnly ? (
                // En mode auto-entrepreneur, le tarif max se règle directement ici.
                <span className="w-24 inline-flex items-center justify-end gap-1 text-sm font-semibold text-se-freelance-ink">
                  <input
                    type="number"
                    min={b.min}
                    max={b.max}
                    value={rate}
                    onChange={(e) =>
                      setFreelanceRate(scope, p.poste, Math.min(Math.max(Number(e.target.value), b.min), b.max))
                    }
                    className={`${numCls} text-se-freelance-ink font-semibold`}
                    aria-label={`Tarif maximal pour ${p.poste}`}
                  />
                  €/h
                </span>
              ) : (
                <span className="w-24 text-right text-sm font-semibold text-se-freelance-ink">{rate} €/h TTC</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-se-muted mt-2 leading-relaxed">
        {freelanceOnly
          ? 'Tarif TTC maximal proposé aux auto-entrepreneurs pour chaque poste ; il est affiché avant chaque validation.'
          : 'Salaire = indicatif ; le tarif réel de chaque salarié est sur sa fiche (Personnel fixe & repos). '}
        {!freelanceOnly &&
          (multi
            ? 'La fourchette borne le curseur « tarif maximal » de la Cascade : un établissement ne peut proposer ni moins, ni plus.'
            : 'Le tarif maximal proposé aux auto-entrepreneurs se règle poste par poste dans la Cascade.')}
        {freelanceOnly && multi && ' La fourchette de l’entreprise borne ce que chaque établissement peut proposer.'}
      </p>
    </Drawer>
  );
}

/* ── Liens ───────────────────────────────────────────────────── */
export function LiensPanel({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  // Mode auto-entrepreneur : pas de lien d'inscription d'équipe.
  const freelanceOnly = useV2Ui((s) => s.mode) === 'freelance';
  const links = publicLinks.filter((l) => !freelanceOnly || l.id === 'l-freelance');

  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      setCopied(null);
    }
  };

  return (
    <Drawer title="Liens à partager" onClose={onClose}>
      <ul className="space-y-3">
        {links.map((l) => (
          <li key={l.id} className="rounded-se border border-se-line p-3.5">
            <p className="font-semibold text-se-ink">{l.label}</p>
            <p className="text-sm text-se-muted mt-0.5">{l.blurb}</p>
            <div className="flex items-center gap-2 mt-2.5">
              <code className="flex-1 min-w-0 truncate text-xs bg-se-surface-2 rounded-se-sm px-2.5 py-2 text-se-ink">
                {l.url}
              </code>
              <button
                type="button"
                onClick={() => copy(l.id, l.url)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-se-sm text-sm font-semibold border border-se-line hover:bg-se-surface-2 shrink-0"
              >
                {copied === l.id ? (
                  <>
                    <Check className="w-4 h-4 text-se-success" aria-hidden="true" /> Copié
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" aria-hidden="true" /> Copier
                  </>
                )}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
