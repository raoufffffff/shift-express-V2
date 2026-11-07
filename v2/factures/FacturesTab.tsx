/**
 * Onglet Factures — ce que l'établissement reçoit sur la période :
 *  · Factures de prestation : une par auto-entrepreneur validé sur une
 *    mission, au montant du devis (TVA non applicable, art. 293 B du CGI).
 *  · Factures de commission : émises par Shift Express pour la mise en
 *    relation, ligne par ligne. Pas de total de commission affiché : les
 *    chiffres du haut ne portent que sur les prestations.
 * Le règlement suit le réglage Paiement (prélèvement SEPA ou virement).
 */
import { useMemo, useState } from 'react';
import { MOCK_TODAY } from '@/mocks/v2Today';
import { Download, FileText, Check, Clock, Landmark, Repeat } from 'lucide-react';
import { useV2Settings, SHIFT_EXPRESS_BANK, paymentFeePct } from '@/stores/v2SettingsStore';
import { useMissionStore, effPlaced, effMissions, effCancellations } from '../mission/missionStore';
import { Segmented } from '../settings/controls';
import { inRange } from './PeriodPicker';
import type { DateRange } from './PeriodPicker';
import { InvoiceWindow } from './InvoiceWindow';
import { billedParty, buildInvoiceDoc, printInvoice } from './invoiceDoc';
import type { Invoice, InvoiceKind as Kind } from './invoiceDoc';
import { parseISO } from '../time';

type Filter = 'toutes' | Kind;

/** Commission Shift Express : 12 % HT de la prestation, TVA 20 %. */
const COMMISSION_RATE = 0.12;
/** « Aujourd'hui » de la maquette : les missions passées sont réglées. */
const TODAY = MOCK_TODAY;

const fmtDate = (iso: string) => parseISO(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
/** « 187 € », « 22,44 € » : pas de décimales inutiles, pour tenir en colonne. */
const euros = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

export function FacturesTab({ range, establishment = null }: { range: DateRange; establishment?: string | null }) {
  const version = useMissionStore(); // les factures suivent les freelances validés
  const payment = useV2Settings((s) => s.payment);
  const company = useV2Settings((s) => s.company);
  const establishments = useV2Settings((s) => s.establishments);
  const [filter, setFilter] = useState<Filter>('toutes');
  const [downloaded, setDownloaded] = useState<string | null>(null);
  const [opened, setOpened] = useState<Invoice | null>(null);

  // Le document complet d'une facture : facturé à l'établissement (sa fiche
  // comptable), sinon à l'entreprise.
  const docOf = (i: Invoice) => {
    const est = establishments.find((e) => e.name === i.establishment);
    const to = est ? billedParty(est, est.name, est.address) : billedParty(company, i.establishment);
    return buildInvoiceDoc(i, to, payment);
  };
  const download = (i: Invoice) => {
    printInvoice(docOf(i));
    setDownloaded(i.ref);
  };

  // Par auto-entrepreneur validé sur une mission : sa facture de prestation,
  // et la facture de commission Shift Express associée. `range` à null = toutes
  // les périodes (pour le solde à régler, qui ne dépend pas du mois affiché).
  const buildInvoices = (range: DateRange | null): Invoice[] => {
    let n = 0;
    const list: Invoice[] = [];
    [...effMissions()]
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
      .forEach((m) => {
        effPlaced(m)
          .filter((p) => p.kind === 'freelance' && !p.suggested)
          .forEach((p) => {
            n += 1;
            if (range && !inRange(m.date, range)) return;
            if (establishment && m.establishment !== establishment) return;
            const ttc = p.cost ?? 0;
            const paid = m.date < TODAY;
            const ctx = {
              date: m.date,
              paid,
              missionId: m.id,
              poste: m.poste,
              establishment: m.establishment,
              start: m.start,
              end: m.end,
              freelance: p.name,
            };
            list.push({
              ...ctx,
              id: `${m.id}:${p.id}:p`,
              ref: `FAC-${String(n).padStart(4, '0')}`,
              kind: 'prestation',
              seller: p.name,
              label: `${m.poste} · ${m.establishment} · ${m.start}–${m.end}`,
              ttc,
            });
            const ht = Math.round(ttc * COMMISSION_RATE * 100) / 100;
            list.push({
              ...ctx,
              id: `${m.id}:${p.id}:c`,
              ref: `COM-${String(n).padStart(4, '0')}`,
              kind: 'commission',
              seller: 'Shift Express',
              label: `Mise en relation · ${p.name} · ${m.poste}`,
              ttc: Math.round(ht * 1.2 * 100) / 100,
            });
          });
      });
    // Frais d'annulation : une ligne par auto-entrepreneur prévenu trop tard.
    let k = 0;
    effCancellations().forEach((c) =>
      c.lines
        .filter((l) => l.fee > 0)
        .forEach((l) => {
          k += 1;
          if (range && !inRange(c.date, range)) return;
          if (establishment && c.establishment !== establishment) return;
          list.push({
            id: `${c.id}:${l.name}`,
            ref: `ANN-${String(k).padStart(4, '0')}`,
            kind: 'annulation',
            date: c.date,
            paid: false,
            missionId: c.missionId,
            poste: c.poste,
            establishment: c.establishment,
            start: c.start,
            end: c.end,
            freelance: l.name,
            seller: 'Shift Express',
            label: `Frais d'annulation · ${l.name} · ${c.poste} · ${l.pct} % du devis`,
            ttc: l.fee,
          });
        }),
    );
    return list;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` suit les placements en direct
  const invoices = useMemo(() => buildInvoices(range), [version, range, establishment]);
  // Solde à régler, toutes périodes confondues : c'est ce qu'il faut virer (ou ce qui sera prélevé).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const outstanding = useMemo(() => buildInvoices(null).filter((i) => !i.paid), [version, establishment]);

  const shown = invoices.filter((i) => filter === 'toutes' || i.kind === filter);
  const prestations = invoices.filter((i) => i.kind === 'prestation');
  const commissions = invoices.filter((i) => i.kind === 'commission');
  const annulations = invoices.filter((i) => i.kind === 'annulation');
  const sum = (list: Invoice[]) => Math.round(list.reduce((s, i) => s + i.ttc, 0) * 100) / 100;
  // Reste à régler : TOUT ce qui n'est pas payé (prestations, frais d'annulation, commissions).
  const due = invoices.filter((i) => !i.paid);
  const paid = prestations.filter((i) => i.paid);

  // Comment ça se règle, d'après Réglages › Paiement — frais de service compris,
  // sur TOUT ce qui reste dû (pas seulement la période affichée).
  const feePct = paymentFeePct(payment);
  const fee = Math.round(sum(outstanding) * feePct) / 100;
  const dueTotal = Math.round((sum(outstanding) + fee) * 100) / 100;
  const dueHint =
    payment.method === 'sepa'
      ? payment.frequency === 'mois'
        ? `prélèvement SEPA le ${payment.dayOfMonth} du mois prochain · +${feePct} % de frais`
        : "prélèvement SEPA 2 jours après chaque relevé d'heures · sans frais"
      : `virement mensuel · +${feePct} % de frais`;

  return (
    <section>
      {/* Chiffres : prestations seulement */}
      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <Total
          label="Prestations auto-entrepreneurs"
          value={euros(sum(prestations))}
          hint={`${prestations.length} facture${prestations.length > 1 ? 's' : ''} · TTC, au devis`}
          accent
        />
        <Total
          label="Réglé"
          value={euros(sum(paid))}
          hint={`${paid.length} facture${paid.length > 1 ? 's' : ''} de prestation`}
        />
        <Total
          label="Reste à régler"
          value={euros(sum(due))}
          hint={
            due.length === 0
              ? outstanding.length > 0
                ? 'Tout est réglé sur cette période.'
                : 'Tout est réglé.'
              : `${due.length} facture${due.length > 1 ? 's' : ''} · ${dueHint}`
          }
        />
      </div>

      {/* Règlement par virement : l'IBAN de Shift Express est toujours là, avec le montant exact
          à virer (toutes périodes confondues). Prélèvement mensuel → ce qui sera prélevé, frais compris. */}
      {payment.method === 'virement' && (
        <div className="mb-5 rounded-se border border-se-cascade/40 bg-se-cascade-wash/40 px-4 py-3.5">
          <p className="flex items-start gap-2 text-sm text-se-ink">
            <Landmark className="w-4 h-4 mt-0.5 shrink-0 text-se-cascade-ink" aria-hidden="true" />
            {outstanding.length > 0 ? (
              <span>
                <strong>
                  Montant à virer : {euros(dueTotal)} · {outstanding.length} facture
                  {outstanding.length > 1 ? 's' : ''} à régler
                </strong>{' '}
                <span className="text-se-muted">
                  ({euros(sum(outstanding))} de factures + {euros(fee)} de frais de service {feePct} %, toutes périodes
                  confondues)
                </span>
              </span>
            ) : (
              <span>
                <strong>Rien à virer pour le moment.</strong>{' '}
                <span className="text-se-muted">
                  Vos prochaines factures se règlent par virement, une fois par mois, sur cet IBAN (+{feePct} % de frais
                  de service).
                </span>
              </span>
            )}
          </p>
          <dl className="mt-2.5 grid sm:grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-se-muted">Bénéficiaire</dt>
            <dd className="font-semibold text-se-ink">{SHIFT_EXPRESS_BANK.holder}</dd>
            <dt className="text-se-muted">IBAN</dt>
            <dd>
              <code className="select-all bg-se-surface rounded-se-sm px-2 py-0.5 text-sm text-se-ink tabular-nums">
                {SHIFT_EXPRESS_BANK.iban}
              </code>
            </dd>
            <dt className="text-se-muted">BIC</dt>
            <dd className="font-semibold text-se-ink tabular-nums">{SHIFT_EXPRESS_BANK.bic}</dd>
            {outstanding.length > 0 && (
              <>
                <dt className="text-se-muted">Référence</dt>
                <dd className="text-se-ink">{outstanding.map((i) => i.ref).join(', ')}</dd>
              </>
            )}
          </dl>
          {outstanding.length > 0 && (
            <p className="text-xs text-se-muted mt-2">
              Un seul virement pour tout. Dès réception, les factures passent « Réglée » ici et sur vos PDF.
            </p>
          )}
        </div>
      )}
      {outstanding.length > 0 && payment.method === 'sepa' && payment.frequency === 'mois' && (
        <p className="mb-5 inline-flex items-start gap-2 text-sm text-se-ink rounded-se border border-se-line bg-se-surface px-4 py-3">
          <Repeat className="w-4 h-4 mt-0.5 shrink-0 text-se-blue-ink" aria-hidden="true" />
          <span>
            <strong>{euros(dueTotal)}</strong> seront prélevés le {payment.dayOfMonth} du mois prochain sur{' '}
            {payment.iban}{' '}
            <span className="text-se-muted">
              ({euros(sum(outstanding))} de factures + {euros(fee)} de frais de service {feePct} %)
            </span>
            . Rien à faire.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { key: 'toutes', label: `Toutes · ${invoices.length}` },
            { key: 'prestation', label: `Prestation · ${prestations.length}` },
            { key: 'commission', label: `Commission · ${commissions.length}` },
            ...(annulations.length > 0
              ? [{ key: 'annulation' as const, label: `Annulation · ${annulations.length}` }]
              : []),
          ]}
        />
        {downloaded && (
          <span className="inline-flex items-center gap-1.5 text-sm text-se-success">
            <Check className="w-4 h-4" aria-hidden="true" /> {downloaded} : choisissez « Enregistrer en PDF ».
          </span>
        )}
        <span className="text-xs text-se-muted ml-auto">Cliquez une ligne pour voir la facture.</span>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-se-muted bg-se-surface border border-se-line rounded-se p-6 text-center">
          Aucune facture sur cette période. Une facture apparaît dès qu'un auto-entrepreneur est validé sur une mission.
        </p>
      ) : (
        <div className="bg-se-surface border border-se-line rounded-se shadow-se overflow-hidden">
          {/* En entier, sans défilement horizontal : colonnes en %, textes tronqués. */}
          <table className="w-full table-fixed text-[13px]">
            <colgroup>
              <col style={{ width: '13%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '31%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '5%' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-se-line se-eyebrow text-left">
                <th className="px-2 py-2.5">N°</th>
                <th className="px-2 py-2.5">Date</th>
                <th className="px-2 py-2.5">Émetteur</th>
                <th className="px-2 py-2.5">Objet</th>
                <th className="px-2 py-2.5 text-right">TTC</th>
                <th className="px-2 py-2.5">Règlement</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr
                  key={i.id}
                  tabIndex={0}
                  onClick={() => setOpened(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpened(i);
                    }
                  }}
                  className="border-b border-se-line last:border-0 cursor-pointer hover:bg-se-surface-2/60 focus:outline-none focus-visible:bg-se-surface-2"
                >
                  <td className="px-2 py-2">
                    <span className="block font-mono text-[11px] text-se-ink whitespace-nowrap">{i.ref}</span>
                    {i.kind === 'prestation' ? (
                      <span
                        className="se-badge bg-se-freelance-wash text-se-freelance-ink mt-0.5"
                        style={{ height: 16 }}
                      >
                        Prestation
                      </span>
                    ) : i.kind === 'annulation' ? (
                      <span className="se-badge bg-se-danger-wash text-se-danger mt-0.5" style={{ height: 16 }}>
                        Annulation
                      </span>
                    ) : (
                      <span className="se-badge bg-se-surface-2 text-se-muted mt-0.5" style={{ height: 16 }}>
                        Commission
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-se-ink whitespace-nowrap">{fmtDate(i.date)}</td>
                  <td className="px-2 py-2 font-semibold text-se-ink truncate" title={i.seller}>
                    {i.seller}
                  </td>
                  <td className="px-2 py-2 text-se-muted truncate" title={i.label}>
                    {i.label}
                  </td>
                  <td
                    className={`px-2 py-2 text-right font-semibold whitespace-nowrap ${
                      i.kind === 'prestation' ? 'text-se-freelance-ink' : 'text-se-ink'
                    }`}
                  >
                    {euros(i.ttc)}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {i.paid ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-se-success">
                        <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        Réglée
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-se-cascade-ink">
                        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        {payment.method === 'sepa' ? 'À prélever' : 'À virer'}
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        download(i);
                      }}
                      aria-label={`Télécharger ${i.ref}`}
                      title="Télécharger le PDF"
                      className="w-8 h-8 grid place-items-center rounded-se-sm text-se-muted hover:text-se-ink hover:bg-se-surface-2"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="inline-flex items-start gap-1.5 text-xs text-se-muted mt-3 leading-relaxed">
        <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Chaque prestation est facturée au nom de l'auto-entrepreneur, au montant TTC du devis validé (TVA non
          applicable, art. 293 B du CGI). La mise en relation fait l'objet d'une facture de commission Shift Express
          distincte. Vos salariés et extras ne génèrent pas de facture : leurs heures partent en paie.
        </span>
      </p>

      {opened && <InvoiceWindow doc={docOf(opened)} onClose={() => setOpened(null)} />}
    </section>
  );
}

function Total({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
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
