/**
 * Fenêtre d'une facture — le document tel qu'il sera imprimé : émetteur,
 * facturé à, la ligne, le total, le règlement. Deux actions seulement :
 * ouvrir le PDF (page imprimable → « Enregistrer en PDF ») et voir la mission.
 */
import { useState } from 'react';
import { X, Download, Check, Clock, CalendarDays, FileDown } from 'lucide-react';
import { useV2Ui } from '@/stores/v2UiStore';
import type { InvoiceDoc, InvoiceParty } from './invoiceDoc';
import { euros, longDate, printInvoice, downloadInvoiceHtml } from './invoiceDoc';

export function InvoiceWindow({ doc, onClose }: { doc: InvoiceDoc; onClose: () => void }) {
  const { invoice } = doc;
  const [result, setResult] = useState<'printed' | 'downloaded' | null>(null);
  const requestOpenMission = useV2Ui((s) => s.requestOpenMission);
  const prestation = invoice.kind === 'prestation';

  const seeMission = () => {
    onClose();
    requestOpenMission(invoice.missionId); // la fenêtre s'ouvre par-dessus les factures
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-se-ink/40" />
      <div
        role="dialog"
        aria-label={`${doc.title} ${invoice.ref}`}
        className="se-root relative w-full max-w-2xl bg-se-surface rounded-se shadow-se-md flex flex-col max-h-[92vh]"
      >
        <header className="flex items-start gap-3 px-6 py-4 border-b border-se-line">
          <div className="min-w-0">
            <p className="se-eyebrow mb-0.5">{doc.title}</p>
            <h2 className="text-lg font-extrabold text-se-ink font-mono">{invoice.ref}</h2>
            <p className="text-xs text-se-muted mt-0.5">Émise le {longDate(invoice.date)}</p>
          </div>
          <span
            className={`ml-auto se-badge ${prestation ? 'bg-se-freelance-wash text-se-freelance-ink' : 'bg-se-surface-2 text-se-muted'}`}
            style={{ height: 20 }}
          >
            {prestation ? 'Prestation' : invoice.kind === 'annulation' ? 'Annulation' : 'Commission'}
          </span>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Émetteur / Facturé à */}
          <div className="grid sm:grid-cols-2 gap-5">
            <Party title="Émetteur" party={doc.from} />
            <Party title="Facturé à" party={doc.to} />
          </div>

          {/* Lignes */}
          <div className="border border-se-line rounded-se overflow-hidden">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: '42%' }} />
                <col style={{ width: '38%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr className="se-eyebrow text-left border-b border-se-line bg-se-surface-2/60">
                  <th className="px-3 py-2">Désignation</th>
                  <th className="px-3 py-2">Détail</th>
                  <th className="px-3 py-2 text-right">{prestation ? 'Montant' : 'HT'}</th>
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((l) => (
                  <tr key={l.label} className="border-b border-se-line last:border-0">
                    <td className="px-3 py-2.5 text-se-ink font-medium">{l.label}</td>
                    <td className="px-3 py-2.5 text-se-muted text-xs">
                      {l.qty}
                      <span className="block">{l.unit}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-se-ink whitespace-nowrap">
                      {euros(l.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totaux */}
          <dl className="ml-auto w-full sm:w-72 text-sm space-y-1">
            {!prestation && (
              <>
                <TotalRow label="Total HT">{euros(doc.ht)}</TotalRow>
                <TotalRow label="TVA 20 %">{euros(doc.tva)}</TotalRow>
              </>
            )}
            <div className="flex items-baseline justify-between border-t-2 border-se-ink pt-2 mt-1">
              <dt className="font-extrabold text-se-ink">Total {prestation ? '' : 'TTC'}</dt>
              <dd className={`text-lg font-extrabold ${prestation ? 'text-se-freelance-ink' : 'text-se-ink'}`}>
                {euros(doc.ttc)}
              </dd>
            </div>
          </dl>

          {/* Règlement */}
          <p
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-se-sm text-sm font-semibold ${
              invoice.paid ? 'bg-se-success-wash text-se-success' : 'bg-se-cascade-wash text-se-cascade-ink'
            }`}
          >
            {invoice.paid ? (
              <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
            {doc.settlement}
          </p>

          <ul className="text-[11px] text-se-muted leading-relaxed space-y-0.5">
            {doc.mentions.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>

        <footer className="flex flex-wrap items-center gap-3 px-6 py-4 border-t border-se-line">
          <button
            type="button"
            onClick={() => {
              printInvoice(doc);
              setResult('printed');
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
          >
            <Download className="w-4 h-4" aria-hidden="true" /> Télécharger le PDF
          </button>
          <button
            type="button"
            onClick={() => {
              downloadInvoiceHtml(doc);
              setResult('downloaded');
            }}
            title="Fichier HTML autonome, imprimable partout"
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
          >
            <FileDown className="w-4 h-4" aria-hidden="true" /> Fichier
          </button>
          <button
            type="button"
            onClick={seeMission}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
          >
            <CalendarDays className="w-4 h-4" aria-hidden="true" /> Voir la mission
          </button>
          {result && (
            <span className="inline-flex items-center gap-1.5 text-xs text-se-muted">
              <Check className="w-3.5 h-3.5 text-se-success" aria-hidden="true" />
              {result === 'printed'
                ? 'Dans la boîte d’impression, choisissez « Enregistrer en PDF ».'
                : `${invoice.ref}.html téléchargé.`}
            </span>
          )}
        </footer>
      </div>
    </div>
  );
}

function Party({ title, party }: { title: string; party: InvoiceParty }) {
  return (
    <div>
      <p className="se-eyebrow mb-1.5">{title}</p>
      <p className="font-bold text-se-ink">{party.name}</p>
      {party.lines.map((l) => (
        <p key={l} className="text-xs text-se-muted leading-relaxed">
          {l}
        </p>
      ))}
    </div>
  );
}

function TotalRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-se-muted">{label}</dt>
      <dd className="text-se-ink">{children}</dd>
    </div>
  );
}
