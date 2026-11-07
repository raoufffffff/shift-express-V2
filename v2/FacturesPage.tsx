/**
 * Factures & heures — l'argent et les heures au même endroit, par période.
 *   En haut : les chiffres de la période (heures, paie, freelances, total).
 *   Deux onglets :
 *     · Relevé d'heures — le tableau de paie par shift, en entier, puis l'Export
 *       (Silae · Payfit · CSV) avec un récap avant d'envoyer.
 *     · Factures — les factures de prestation des auto-entrepreneurs.
 *   Un petit bouton « Compteurs » dans l'en-tête ouvre un volet à part : par
 *   personne, heures sup, absences, congés, brut estimé et l'export paie.
 *   Période : ce mois-ci · mois dernier · mois suivant · personnalisé.
 */
import { useMemo, useState } from 'react';
import { MOCK_TODAY } from '@/mocks/v2Today';
import { Download, X, Clock, FileText, Building2, Gauge } from 'lucide-react';
import { HeuresTable, EXPORT_LABEL } from './factures/HeuresTable';
import type { ExportFormat, ExportSummary } from './factures/HeuresTable';
import { FacturesTab } from './factures/FacturesTab';
import { CountersTab } from './factures/CountersTab';
import { Drawer } from './settings/Drawer';
import { useV2Ui } from '@/stores/v2UiStore';
import { useV2Settings, staffRuleOf, salaryRateOf } from '@/stores/v2SettingsStore';
import { useMissionStore, effMissions, effPlaced } from './mission/missionStore';
import { missionHours } from './time';
import { PeriodPicker, monthRange, rangeLabel, inRange } from './factures/PeriodPicker';
import type { DateRange, PeriodKey } from './factures/PeriodPicker';

/** « Aujourd'hui » de la maquette. */
const TODAY = MOCK_TODAY;

type Tab = 'heures' | 'factures';

export function FacturesPage() {
  // Freelance uniquement : pas de relevé d'heures ni de paie, juste les factures.
  const freelanceOnly = useV2Ui((s) => s.mode) === 'freelance';
  const [tab, setTab] = useState<Tab>(freelanceOnly ? 'factures' : 'heures');
  // Export proposé une fois le relevé approuvé (Excel, Silae, Payfit, autre).
  const [exporting, setExporting] = useState<{ format: ExportFormat; summary: ExportSummary } | null>(null);
  // Période : ce mois-ci par défaut (« aujourd'hui » de la maquette = 27/10/2026).
  const [periodKey, setPeriodKey] = useState<PeriodKey>('current');
  // Volet « Compteurs » (heures sup, absences, congés, export paie) : à part, sur demande.
  const [counters, setCounters] = useState(false);
  const [range, setRange] = useState<DateRange>(() => monthRange(TODAY, 0));
  const periode = rangeLabel(range);

  // Filtre par établissement (compte « avec établissements » seulement) : relevé,
  // factures et chiffres du haut suivent.
  const account = useV2Settings((s) => s.account);
  const establishments = useV2Settings((s) => s.establishments);
  const [establishment, setEstablishment] = useState<string | null>(null);
  const showEstablishmentFilter = account.type === 'etablissements' && establishments.length > 1;
  const scope = showEstablishmentFilter ? establishment : null;

  // Chiffres de la période : heures planifiées des personnes placées, paie
  // (tarif de la fiche salarié, sinon l'indicatif du poste), freelances au devis.
  const version = useMissionStore();
  const staff = useV2Settings((s) => s.staff);
  const { totalHours, paie, freelanceTTC } = useMemo(() => {
    void version;
    let hours = 0;
    let paie = 0;
    let freelanceTTC = 0;
    effMissions()
      .filter((m) => inRange(m.date, range) && (!scope || m.establishment === scope))
      .forEach((m) => {
        const h = missionHours(m);
        effPlaced(m)
          .filter((p) => !p.suggested)
          .forEach((p) => {
            hours += h;
            if (p.kind === 'freelance') freelanceTTC += p.cost ?? 0;
            else paie += h * (staffRuleOf(staff, p)?.hourlyRate ?? salaryRateOf(m.poste));
          });
      });
    return { totalHours: Math.round(hours * 10) / 10, paie: Math.round(paie), freelanceTTC: Math.round(freelanceTTC) };
  }, [version, range, scope, staff]);

  const TABS: { key: Tab; label: string; icon: typeof Clock }[] = [
    { key: 'heures', label: "Relevé d'heures", icon: Clock },
    { key: 'factures', label: 'Factures', icon: FileText },
  ];

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="se-eyebrow mb-1">
            {freelanceOnly ? 'Vos factures de prestation, par période' : 'Argent & heures au même endroit'}
          </p>
          <h1 className="text-3xl font-extrabold text-se-ink">{freelanceOnly ? 'Factures' : 'Factures & heures'}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Filtre établissement : tous, ou un seul */}
          {showEstablishmentFilter && (
            <label className="relative inline-flex items-center">
              <Building2 className="absolute left-3 w-4 h-4 text-se-muted pointer-events-none" aria-hidden="true" />
              <select
                value={establishment ?? ''}
                onChange={(e) => setEstablishment(e.target.value || null)}
                aria-label="Établissement"
                className={`h-10 pl-9 pr-8 rounded-se-sm border text-sm font-semibold appearance-none bg-se-surface focus:outline-none focus:border-se-blue ${
                  establishment ? 'border-se-blue text-se-blue-ink' : 'border-se-line text-se-ink'
                }`}
              >
                <option value="">Tous les établissements</option>
                {establishments.map((e) => (
                  <option key={e.id} value={e.name}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!freelanceOnly && (
            <button
              type="button"
              onClick={() => setCounters(true)}
              title="Heures sup, absences, congés, brut estimé par personne · export paie"
              className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-se-sm text-sm font-semibold border border-se-line bg-se-surface text-se-ink hover:bg-se-surface-2"
            >
              <Gauge className="w-4 h-4 text-se-blue-ink" aria-hidden="true" /> Compteurs
            </button>
          )}
          {/* Sélecteur de période : bouton avec la plage → raccourcis + double calendrier */}
          <PeriodPicker
            today={TODAY}
            value={periodKey}
            range={range}
            onChange={(k, r) => {
              setPeriodKey(k);
              setRange(r);
            }}
          />
        </div>
      </header>

      {/* Chiffres de la période (en freelance, l'onglet Factures a les siens) */}
      {!freelanceOnly && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Stat label="Heures" value={`${totalHours} h`} hint={scope ? scope : 'sur la période, tous établissements'} />
          <Stat label="Paie (salariés + extras)" value={`${paie} €`} hint="heures planifiées × tarif horaire" />
          <Stat
            label="Auto-entrepreneurs"
            value={`${freelanceTTC} € TTC`}
            hint="au devis, facturé via Shift Express"
            accent
          />
          <Stat label="Total période" value={`${paie + freelanceTTC} €`} hint="paie + auto-entrepreneurs" />
        </div>
      )}

      {/* Onglets : Relevé d'heures | Factures (un seul onglet en freelance → pas d'onglets) */}
      <div
        role="tablist"
        aria-label="Factures & heures"
        className={`flex gap-1 border-b border-se-line mb-5 ${freelanceOnly ? 'hidden' : ''}`}
      >
        {TABS.map(({ key, label, icon: Icon }) => {
          const on = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 -mb-px text-sm font-semibold border-b-2 transition-colors ${
                on ? 'border-se-blue text-se-ink' : 'border-transparent text-se-muted hover:text-se-ink'
              }`}
            >
              <Icon className={`w-4 h-4 ${on ? 'text-se-blue-ink' : ''}`} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      {tab === 'heures' && !freelanceOnly ? (
        // Heures par shift — pointages modifiables (internes), au devis (freelances).
        // Une fois tout approuvé, le tableau propose Excel / Silae / Payfit / autre.
        <HeuresTable
          range={range}
          establishment={scope}
          onExport={(format, summary) => setExporting({ format, summary })}
        />
      ) : (
        <FacturesTab range={range} establishment={scope} />
      )}

      {counters && (
        <Drawer
          title="Compteurs"
          subtitle={`${periode} · heures sup, absences, congés, brut estimé par personne, et l'export paie`}
          onClose={() => setCounters(false)}
          xl
        >
          <CountersTab range={range} today={TODAY} periode={periode} />
        </Drawer>
      )}
      {exporting && (
        <ExportRecap
          format={exporting.format}
          periode={periode}
          summary={exporting.summary}
          onClose={() => setExporting(null)}
        />
      )}
    </div>
  );
}

/** Télécharge le relevé en CSV « Excel » (séparateur ; UTF-8 avec BOM, décimales à la française). */
function downloadCsv(summary: ExportSummary, periode: string) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const dur = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
  const header = ['Date', 'Nom', 'Type', 'Arrivée', 'Sortie', 'Durée', 'Lieu', 'Poste', 'Montant (€)'];
  const lines = summary.rows.map((r) =>
    [
      r.date.split('-').reverse().join('/'),
      r.name,
      r.kind,
      r.in,
      r.out,
      dur(r.minutes),
      r.establishment,
      r.poste,
      r.amount === null ? '' : String(r.amount).replace('.', ','),
    ]
      .map(esc)
      .join(';'),
  );
  const total = ['', '', '', '', '', dur(summary.minutes), '', 'Total paie', String(summary.paie)].map(esc).join(';');
  const csv = '﻿' + [header.map(esc).join(';'), ...lines, total].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `releve-heures-${periode.replace(/[^\w]+/g, '-').toLowerCase()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Récap avant export : on dit exactement ce qui part et où, puis on confirme. */
function ExportRecap({
  format,
  periode,
  summary,
  onClose,
}: {
  format: ExportFormat;
  periode: string;
  summary: ExportSummary;
  onClose: () => void;
}) {
  const [done, setDone] = useState(false);
  const log = useV2Ui((s) => s.log);
  // Silae / Payfit / autre = paie (salariés + extras) ; Excel = tout le relevé.
  const isPaie = format !== 'excel';
  const lineCount = isPaie ? summary.internalLines : summary.lines;
  const [software, setSoftware] = useState('');
  const target = format === 'autre' ? software.trim() || 'votre logiciel de paie' : EXPORT_LABEL[format];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-se-ink/40" />
      <div className="se-root relative w-full max-w-sm bg-se-surface rounded-se shadow-se-md p-5">
        <div className="flex items-center gap-2 mb-3">
          <Download className="w-5 h-5 text-se-blue-ink" aria-hidden="true" />
          <h3 className="text-base font-extrabold text-se-ink">
            {format === 'excel' ? 'Télécharger le relevé' : `Envoyer en paie · ${EXPORT_LABEL[format]}`}
          </h3>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="ml-auto w-7 h-7 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="text-sm text-se-ink space-y-2">
            <p className="font-semibold text-se-success">{isPaie ? 'Envoyé.' : 'Fichier prêt.'}</p>
            <p className="text-se-muted">
              {isPaie
                ? `${lineCount} ligne${lineCount > 1 ? 's' : ''} d'heures validées transmises à ${target}.`
                : `Le fichier Excel du relevé (${lineCount} ligne${lineCount > 1 ? 's' : ''}) est téléchargé.`}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full py-2 rounded-se-sm text-sm font-semibold border border-se-line hover:bg-se-surface-2"
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            {format === 'autre' && (
              <label className="block mb-3">
                <span className="se-eyebrow block mb-1.5">Quel logiciel ?</span>
                <input
                  autoFocus
                  value={software}
                  onChange={(e) => setSoftware(e.target.value)}
                  placeholder="Ex. Sage, Cegid, ADP, Lucca…"
                  className="w-full h-10 rounded-se-sm border border-se-line bg-se-surface px-3 text-sm text-se-ink focus:outline-none focus:border-se-blue"
                />
              </label>
            )}
            <dl className="text-sm space-y-1.5 mb-4">
              <Row label="Période">{periode}</Row>
              <Row label="Contenu">
                {isPaie
                  ? 'Heures validées des salariés et extras'
                  : 'Tout le relevé validé (heures + auto-entrepreneurs)'}
              </Row>
              <Row label="Lignes">{lineCount}</Row>
              <Row label="Heures">
                {Math.floor(summary.minutes / 60)} h {String(summary.minutes % 60).padStart(2, '0')}
              </Row>
              <Row label={isPaie ? 'Masse salariale' : 'Total'}>
                <span className="font-semibold">
                  {isPaie ? `${summary.paie} €` : `${summary.paie + summary.freelanceTTC} €`}
                </span>
              </Row>
            </dl>
            <button
              type="button"
              onClick={() => {
                // Excel : un vrai fichier (CSV, séparateur « ; », s'ouvre dans Excel) ; paie : simulé.
                if (format === 'excel') downloadCsv(summary, periode);
                log({
                  kind: 'paie',
                  label: isPaie ? `Heures envoyées à ${target}` : 'Relevé d’heures téléchargé (Excel)',
                  detail: `${periode} · ${lineCount} ligne${lineCount > 1 ? 's' : ''}`,
                });
                setDone(true);
              }}
              className="w-full py-2.5 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
            >
              {isPaie ? `Envoyer à ${target}` : 'Télécharger le fichier Excel'}
            </button>
            <p className="text-xs text-se-muted mt-2 text-center">
              {isPaie ? 'Rien n’est transmis tant que vous n’avez pas confirmé.' : 'Le fichier reste sur votre poste.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className="bg-se-surface border border-se-line rounded-se px-4 py-3.5 shadow-se">
      <p className="se-eyebrow mb-1">{label}</p>
      <p className={`text-xl font-extrabold font-display ${accent ? 'text-se-freelance-ink' : 'text-se-ink'}`}>
        {value}
      </p>
      <p className="text-xs text-se-muted mt-0.5">{hint}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-se-muted">{label}</dt>
      <dd className="text-se-ink text-right">{children}</dd>
    </div>
  );
}
