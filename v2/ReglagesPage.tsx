/**
 * Réglages — l'entreprise, les établissements, les tarifs, les liens, et le
 * mode d'usage. Peu de boutons : un mode à choisir, des lignes cliquables qui
 * ouvrent un panneau, et l'assistant de Configuration.
 * Deux groupes : l'exploitation (paiement, postes & besoins, personnel fixe,
 * cascade) et l'établissement (lieux, tarifs, liens, configuration guidée).
 */
import { useState } from 'react';
import {
  Building2,
  Tag,
  Link2,
  Wand2,
  ChevronRight,
  CreditCard,
  LayoutGrid,
  BedDouble,
  GitBranch,
  BadgeCheck,
  Bell,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usageModes } from '@/mocks/v2Settings';
import type { UsageMode } from '@/mocks/v2Settings';
import { useV2Ui } from '@/stores/v2UiStore';
import { useV2Settings, rateFor, COMPANY, paymentFeePct, weeklyHeadcount } from '@/stores/v2SettingsStore';
import { EtablissementsPanel, TarificationPanel, LiensPanel } from './settings/SettingsPanels';
import { ConfigWizard } from './settings/ConfigWizard';
import { PaiementPanel } from './settings/PaiementPanel';
import { PostesPanel } from './settings/PostesPanel';
import { PersonnelPanel } from './settings/PersonnelPanel';
import { CascadePanel } from './settings/CascadePanel';
import { UpgradeDialog } from './settings/UpgradeDialog';
import { useMissionStore } from './mission/missionStore';
import { planName, planPrice, planSummary, planLimits, isUnlimited, employeeShiftsInMonth, monthLabel } from './plan';
import { NotificationsSettingsPanel } from './settings/NotificationsSettingsPanel';
import { CancellationPanel } from './settings/CancellationPanel';

type Panel =
  | 'abonnement'
  | 'paiement'
  | 'postes'
  | 'personnel'
  | 'cascade'
  | 'etablissements'
  | 'tarification'
  | 'liens'
  | 'notifications'
  | 'annulation'
  | 'config'
  | null;

interface Row {
  key: NonNullable<Panel>;
  icon: LucideIcon;
  label: string;
  hint: string;
}

export function ReglagesPage() {
  const mode = useV2Ui((s) => s.mode);
  const setMode = useV2Ui((s) => s.setMode);
  const [panel, setPanel] = useState<Panel>(null);
  const [upgrading, setUpgrading] = useState(false);
  const notifPrefs = useV2Ui((s) => s.notifPrefs);

  // Les résumés des lignes suivent les réglages en direct.
  const payment = useV2Settings((s) => s.payment);
  const postes = useV2Settings((s) => s.postes);
  const staff = useV2Settings((s) => s.staff);
  const pool = useV2Settings((s) => s.pool);
  const cascade = useV2Settings((s) => s.cascade);
  const accountType = useV2Settings((s) => s.account.type);
  const establishmentId = useV2Settings((s) => s.account.establishmentId);
  const managers = useV2Settings((s) => s.managers);
  const establishments = useV2Settings((s) => s.establishments);

  const activePostes = postes.filter((p) => p.active);
  const weeklyNeed = weeklyHeadcount(activePostes);
  const slotCount = activePostes.reduce((s, p) => s + p.slots.length, 0);
  const scope = accountType === 'etablissements' ? establishmentId : COMPANY;
  const rates = activePostes.map((p) => rateFor(cascade.freelanceRates, scope, p.poste));
  const rateRange = rates.length ? `${Math.min(...rates)}–${Math.max(...rates)} €/h` : '—';
  const departments = new Set(staff.map((r) => r.department)).size;

  // Formule : ce qu'on utilise face à ce qu'elle permet (les shifts employés suivent le planning).
  const plan = useV2Ui((s) => s.plan);
  useMissionStore();
  const limits = planLimits(plan);
  const employees = staff.length + pool.length;
  // « 2/5 établissements », « 6 employés (illimité) »
  const used = (n: number, max: number, unit: string) =>
    isUnlimited(max) ? `${n} ${unit} (illimité)` : `${n}/${max} ${unit}`;
  const abonnementHint =
    mode === 'freelance'
      ? 'Gratuit, sans abonnement · auto-entrepreneurs illimités · la Gestion complète commence avec la formule Free'
      : `${planName(plan)} · ${planPrice(plan)} · ${used(establishments.length, limits.establishments, `établissement${establishments.length > 1 ? 's' : ''}`)} · ${used(employeeShiftsInMonth(), limits.employeeShiftsPerMonth, `shifts employés en ${monthLabel()}`)} · ${used(employees, limits.employees, 'employés')}`;

  const operations: Row[] = [
    {
      key: 'abonnement',
      icon: BadgeCheck,
      label: 'Abonnement',
      hint: abonnementHint,
    },
    {
      key: 'paiement',
      icon: CreditCard,
      label: 'Paiement',
      hint: `${payment.method === 'sepa' ? 'Prélèvement SEPA' : 'Virement'} · ${payment.frequency === 'shift' ? 'par mission' : 'par mois'}${
        paymentFeePct(payment) > 0 ? ` · +${paymentFeePct(payment)} % de frais de service` : ' · sans frais'
      }${payment.method === 'sepa' && !payment.mandateSigned ? ' · mandat à signer' : ''}`,
    },
    {
      key: 'postes',
      icon: LayoutGrid,
      label: 'Postes & besoins quotidiens',
      hint: `${activePostes.length} postes actifs · ${slotCount} créneau${slotCount > 1 ? 'x' : ''} · ${weeklyNeed} personnes attendues par semaine`,
    },
    {
      key: 'personnel',
      icon: BedDouble,
      label: 'Personnel fixe & bassin de talents',
      hint: `${staff.length} fixes programmés sur leurs jours · ${pool.length} renfort${pool.length > 1 ? 's' : ''} (CDD d’usage, intérim) · ${departments} département${departments > 1 ? 's' : ''}`,
    },
    {
      key: 'cascade',
      icon: GitBranch,
      label: 'Cascade',
      hint: cascade.enabled
        ? `Paliers d'urgence · plus de ${cascade.comfortFrom} h avant : salariés ${cascade.salariesHours} h → extras ${cascade.extrasHours} h → auto-entrepreneurs · moins de ${cascade.tightFrom} h : tout le monde · ${rateRange} max selon le poste`
        : 'Désactivée par défaut',
    },
  ];

  const company: Row[] = [
    {
      key: 'etablissements',
      icon: Building2,
      label: 'Établissements',
      hint:
        accountType === 'etablissements'
          ? `Entreprise avec ${establishments.length} établissements · ${managers.length} gestionnaire${managers.length > 1 ? 's' : ''}`
          : `Entreprise seule · un lieu · ${managers.length} gestionnaire${managers.length > 1 ? 's' : ''}`,
    },
    {
      key: 'tarification',
      icon: Tag,
      label: 'Tarification',
      hint:
        accountType === 'etablissements'
          ? 'Fourchette auto-entrepreneur min–max par poste · entreprise ou par établissement'
          : 'Salaire indicatif et tarif auto-entrepreneur par poste',
    },
    {
      key: 'liens',
      icon: Link2,
      label: 'Liens à partager',
      hint: 'Inscription équipe · candidature auto-entrepreneur',
    },
    {
      key: 'notifications',
      icon: Bell,
      label: 'Notifications',
      hint: `${Object.values(notifPrefs.kinds).filter(Boolean).length} familles · ${[notifPrefs.push && 'push', notifPrefs.email && 'e-mail'].filter(Boolean).join(' + ') || 'aucun canal'}`,
    },
    {
      key: 'annulation',
      icon: ShieldCheck,
      label: 'Annulation & frais',
      hint: 'Sans frais jusqu’à 48 h avant · missions longues : préavis allongé',
    },
    { key: 'config', icon: Wand2, label: 'Configuration guidée', hint: 'Revoir les 3 étapes de départ' },
  ];

  const list = (rows: Row[]) => (
    <ul className="rounded-se border border-se-line bg-se-surface shadow-se overflow-hidden">
      {rows.map(({ key, icon: Icon, label, hint }) => (
        <li key={key}>
          <button
            type="button"
            onClick={() => (key === 'abonnement' ? setUpgrading(true) : setPanel(key))}
            className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-se-line last:border-0 text-left hover:bg-se-surface-2"
          >
            <span className="w-9 h-9 rounded-se-sm bg-se-surface-2 grid place-items-center text-se-ink shrink-0">
              <Icon className="w-4 h-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold text-se-ink block">{label}</span>
              <span className="text-xs text-se-muted block truncate">{hint}</span>
            </span>
            <ChevronRight className="w-5 h-5 text-se-muted shrink-0" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <header className="mb-6">
        <p className="se-eyebrow mb-1">Entreprise & compte</p>
        <h1 className="text-3xl font-extrabold text-se-ink">Réglages</h1>
      </header>

      {/* Mode d'usage — 2 choix */}
      <section className="mb-7">
        <p className="se-eyebrow mb-2">Mode d'usage</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {(['complete', 'freelance'] as UsageMode[]).map((m) => {
            const on = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`text-left rounded-se border p-4 transition-colors ${
                  on
                    ? 'border-se-blue ring-1 ring-se-blue bg-se-blue-wash/40'
                    : 'border-se-line bg-se-surface hover:border-se-muted'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${on ? 'bg-se-blue' : 'bg-se-line'}`} aria-hidden="true" />
                  <span className="font-semibold text-se-ink">{usageModes[m].label}</span>
                  {m === 'freelance' && (
                    <span className="se-badge bg-se-success-wash text-se-success ml-auto" style={{ height: 18 }}>
                      Gratuit
                    </span>
                  )}
                  {m === 'complete' && (
                    <span className="se-badge bg-se-blue-wash text-se-blue-ink ml-auto" style={{ height: 18 }}>
                      Formule {planName(plan)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-se-muted mt-1.5">
                  {m === 'freelance'
                    ? 'Je publie des missions aux auto-entrepreneurs. Aucun salarié, aucune paie.'
                    : usageModes[m].blurb}
                </p>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-se-muted mt-2">
          {mode === 'freelance'
            ? 'Gratuit et sans limite : vous publiez aux auto-entrepreneurs, rien d’autre. La Gestion complète (salariés, extras, cascade, paie) commence aussi gratuitement, avec la formule Free.'
            : `Formule ${planName(plan)} : ${planSummary(plan)}. Les missions publiées aux auto-entrepreneurs ne sont jamais comptées.`}
        </p>
      </section>

      {upgrading && <UpgradeDialog onClose={() => setUpgrading(false)} onChosen={() => setMode('complete')} />}

      {/* Exploitation — ce qui pilote le planning et les règlements.
          En Freelance uniquement : seulement le paiement (pas d'équipe, pas de cascade). */}
      <section className="mb-7">
        <p className="se-eyebrow mb-2">{mode === 'freelance' ? 'Paiement' : 'Exploitation'}</p>
        {list(
          mode === 'freelance' ? operations.filter((r) => r.key === 'paiement' || r.key === 'abonnement') : operations,
        )}
      </section>

      {/* Établissement */}
      <section>
        <p className="se-eyebrow mb-2">Réglages de l'établissement</p>
        {list(company)}
      </section>

      {panel === 'paiement' && <PaiementPanel onClose={() => setPanel(null)} />}
      {panel === 'postes' && <PostesPanel onClose={() => setPanel(null)} />}
      {panel === 'personnel' && <PersonnelPanel onClose={() => setPanel(null)} />}
      {panel === 'cascade' && <CascadePanel onClose={() => setPanel(null)} />}
      {panel === 'etablissements' && <EtablissementsPanel onClose={() => setPanel(null)} />}
      {panel === 'tarification' && <TarificationPanel onClose={() => setPanel(null)} />}
      {panel === 'liens' && <LiensPanel onClose={() => setPanel(null)} />}
      {panel === 'notifications' && <NotificationsSettingsPanel onClose={() => setPanel(null)} />}
      {panel === 'annulation' && <CancellationPanel onClose={() => setPanel(null)} />}
      {panel === 'config' && (
        <ConfigWizard
          initialMode={mode}
          onClose={() => setPanel(null)}
          onDone={(m) => {
            setMode(m);
            setPanel(null);
          }}
        />
      )}
    </div>
  );
}
