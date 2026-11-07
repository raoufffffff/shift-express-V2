/**
 * La facture comme document : qui facture, qui paie, les lignes, le total,
 * les mentions légales. Un seul modèle pour l'écran (InvoiceWindow) et pour
 * le PDF (page imprimable → boîte d'impression → « Enregistrer en PDF »).
 *
 *  · Prestation : facture émise au nom de l'auto-entrepreneur (mandat de
 *    facturation Shift Express), au montant TTC du devis, TVA non applicable.
 *  · Commission : facture Shift Express pour la mise en relation, HT + TVA 20 %.
 */
import type { BillingInfo } from '@/stores/v2SettingsStore';
import { SHIFT_EXPRESS_BANK } from '@/stores/v2SettingsStore';
import { parseISO } from '../time';

export type InvoiceKind = 'prestation' | 'commission' | 'annulation';

export interface Invoice {
  id: string;
  ref: string;
  kind: InvoiceKind;
  /** ISO — date de la mission (et d'émission) */
  date: string;
  seller: string;
  label: string;
  ttc: number;
  paid: boolean;
  /** contexte de la mission facturée */
  missionId: string;
  poste: string;
  establishment: string;
  start: string;
  end: string;
  /** auto-entrepreneur concerné (nom), pour la commission */
  freelance: string;
}

export interface InvoiceParty {
  name: string;
  lines: string[];
}

export interface InvoiceLine {
  label: string;
  qty: string;
  unit: string;
  total: number;
}

export interface InvoiceDoc {
  invoice: Invoice;
  title: string;
  from: InvoiceParty;
  to: InvoiceParty;
  lines: InvoiceLine[];
  ht: number;
  tva: number;
  ttc: number;
  /** mentions sous le total */
  mentions: string[];
  /** « Réglée le … » / « À régler par … » */
  settlement: string;
}

/** Shift Express, émetteur des factures de commission (maquette). */
const SHIFT_EXPRESS: InvoiceParty = {
  name: 'Shift Express SAS',
  lines: [
    'Plateforme de mise en relation',
    '10 rue de la République, 69001 Lyon',
    'SIRET 912 345 678 00019 · TVA FR12912345678',
  ],
};

export const euros = (n: number) =>
  `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export const longDate = (iso: string) =>
  parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (iso: string) => parseISO(iso).toLocaleDateString('fr-FR');

/** Heures entre deux horaires « HH:MM » (passage minuit compris). */
export function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let min = eh * 60 + em - (sh * 60 + sm);
  if (min <= 0) min += 24 * 60;
  return Math.round((min / 60) * 100) / 100;
}

/** Échéance : 30 jours après la mission. */
function dueDate(iso: string): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + 30);
  return d.toLocaleDateString('fr-FR');
}

/** Qui paie : la fiche comptable de l'établissement, sinon celle de l'entreprise. */
export function billedParty(
  billing: BillingInfo,
  establishmentName: string,
  establishmentAddress?: string,
): InvoiceParty {
  const lines = [establishmentName];
  if (establishmentAddress && establishmentAddress !== billing.billingAddress) lines.push(establishmentAddress);
  lines.push(billing.billingAddress, `SIRET ${billing.siret}`);
  if (billing.contactName) lines.push(`À l'attention de ${billing.contactName}`);
  return { name: billing.legalName, lines };
}

export function buildInvoiceDoc(
  invoice: Invoice,
  to: InvoiceParty,
  payment: { method: 'virement' | 'sepa' },
): InvoiceDoc {
  const hours = hoursBetween(invoice.start, invoice.end);
  const when = `${shortDate(invoice.date)} · ${invoice.start}–${invoice.end} (${hours.toLocaleString('fr-FR')} h)`;
  const settlement = invoice.paid
    ? `Réglée · ${payment.method === 'sepa' ? 'prélèvement SEPA' : 'virement'} via Shift Express`
    : payment.method === 'sepa'
      ? `À régler avant le ${dueDate(invoice.date)} · prélèvement SEPA via Shift Express`
      : `À régler avant le ${dueDate(invoice.date)} par virement à ${SHIFT_EXPRESS_BANK.holder} · IBAN ${SHIFT_EXPRESS_BANK.iban} · BIC ${SHIFT_EXPRESS_BANK.bic} · référence ${invoice.ref}`;

  if (invoice.kind === 'prestation') {
    return {
      invoice,
      title: 'Facture de prestation',
      from: {
        name: invoice.seller,
        lines: [
          'Auto-entrepreneur',
          'Facture émise par Shift Express au nom et pour le compte du prestataire (mandat de facturation)',
        ],
      },
      to,
      lines: [
        {
          label: `Prestation ${invoice.poste} · ${invoice.establishment}`,
          qty: when,
          unit: 'au devis',
          total: invoice.ttc,
        },
      ],
      ht: invoice.ttc,
      tva: 0,
      ttc: invoice.ttc,
      mentions: [
        'TVA non applicable, art. 293 B du CGI.',
        'Montant conforme au devis validé par l’établissement avant la mission.',
        'Pas d’escompte pour paiement anticipé. Pénalités de retard : 3 × le taux d’intérêt légal ; indemnité forfaitaire de recouvrement : 40 €.',
      ],
      settlement,
    };
  }
  const ht = Math.round((invoice.ttc / 1.2) * 100) / 100;
  const tva = Math.round((invoice.ttc - ht) * 100) / 100;
  if (invoice.kind === 'annulation') {
    // Frais d'annulation : indemnité due à l'auto-entrepreneur prévenu trop tard, émise via Shift Express.
    return {
      invoice,
      title: 'Frais d’annulation',
      from: SHIFT_EXPRESS,
      to,
      lines: [
        {
          label: `Indemnité d’annulation · ${invoice.freelance} · ${invoice.poste}`,
          qty: when,
          unit: invoice.label.split(' · ').pop() ?? 'selon le délai',
          total: ht,
        },
      ],
      ht,
      tva,
      ttc: invoice.ttc,
      mentions: [
        'Annulation par l’établissement après le délai gratuit (48 h avant le début, préavis allongé pour les missions longues).',
        'Indemnité reversée à l’auto-entrepreneur. TVA 20 %.',
      ],
      settlement,
    };
  }
  return {
    invoice,
    title: 'Facture de commission',
    from: SHIFT_EXPRESS,
    to,
    lines: [
      {
        label: `Mise en relation · ${invoice.freelance} · ${invoice.poste}`,
        qty: when,
        unit: '12 % de la prestation HT',
        total: ht,
      },
    ],
    ht,
    tva,
    ttc: invoice.ttc,
    mentions: [
      'TVA 20 % sur la commission de mise en relation.',
      'Pas d’escompte pour paiement anticipé. Pénalités de retard : 3 × le taux d’intérêt légal ; indemnité forfaitaire de recouvrement : 40 €.',
    ],
    settlement,
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Page HTML autonome, prête à imprimer (A4) — le navigateur fait le PDF. */
export function invoiceHtml(doc: InvoiceDoc): string {
  const { invoice } = doc;
  const party = (p: InvoiceParty) =>
    `<p class="name">${esc(p.name)}</p>${p.lines.map((l) => `<p>${esc(l)}</p>`).join('')}`;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(invoice.ref)} · ${esc(doc.title)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Plus Jakarta Sans', -apple-system, 'Segoe UI', sans-serif; color: #0f172a; margin: 0; padding: 32px; font-size: 13px; line-height: 1.45; }
  header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .ref { font-family: ui-monospace, Menlo, monospace; color: #475569; }
  .brand { font-weight: 800; color: ${invoice.kind === 'prestation' ? '#FF0058' : '#2563EB'}; font-size: 15px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
  .parties h2 { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #64748b; margin: 0 0 6px; }
  .parties p { margin: 0; color: #334155; }
  .parties .name { font-weight: 700; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { text-align: left; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #64748b; padding: 8px 6px; border-bottom: 1px solid #e2e8f0; }
  td { padding: 10px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .muted { color: #64748b; font-size: 12px; }
  .totals { margin-left: auto; width: 280px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 6px; }
  .totals .ttc { border-top: 2px solid #0f172a; margin-top: 4px; padding-top: 8px; font-weight: 800; font-size: 16px; }
  .settle { margin: 24px 0; padding: 10px 12px; border-radius: 8px; background: ${invoice.paid ? '#ecfdf5' : '#fff7ed'}; color: ${invoice.paid ? '#047857' : '#c2410c'}; font-weight: 600; }
  footer { margin-top: 28px; color: #64748b; font-size: 11px; }
  footer p { margin: 2px 0; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <header>
    <div>
      <h1>${esc(doc.title)}</h1>
      <p class="ref">${esc(invoice.ref)}</p>
      <p class="muted">Émise le ${esc(longDate(invoice.date))}</p>
    </div>
    <div class="brand">Shift Express</div>
  </header>
  <section class="parties">
    <div><h2>Émetteur</h2>${party(doc.from)}</div>
    <div><h2>Facturé à</h2>${party(doc.to)}</div>
  </section>
  <table>
    <thead><tr><th>Désignation</th><th>Détail</th><th>Base</th><th class="num">${invoice.kind === 'prestation' ? 'Montant' : 'HT'}</th></tr></thead>
    <tbody>${doc.lines
      .map(
        (l) =>
          `<tr><td>${esc(l.label)}</td><td class="muted">${esc(l.qty)}</td><td class="muted">${esc(l.unit)}</td><td class="num">${esc(euros(l.total))}</td></tr>`,
      )
      .join('')}</tbody>
  </table>
  <div class="totals">
    ${invoice.kind === 'commission' ? `<div><span>Total HT</span><span>${esc(euros(doc.ht))}</span></div><div><span>TVA 20 %</span><span>${esc(euros(doc.tva))}</span></div>` : ''}
    <div class="ttc"><span>Total ${invoice.kind === 'prestation' ? '' : 'TTC'}</span><span>${esc(euros(doc.ttc))}</span></div>
  </div>
  <p class="settle">${esc(doc.settlement)}</p>
  <footer>${doc.mentions.map((m) => `<p>${esc(m)}</p>`).join('')}</footer>
</body></html>`;
}

/**
 * Imprime la facture (→ « Enregistrer en PDF » dans la boîte d'impression).
 * La page est rendue dans un cadre invisible de la page courante : pas de
 * fenêtre surgissante à autoriser, ça marche dans tous les navigateurs.
 */
export function printInvoice(doc: InvoiceDoc): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('data-invoice', doc.invoice.ref);
  frame.setAttribute('title', `${doc.invoice.ref} — impression`);
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  frame.srcdoc = invoiceHtml(doc);
  const cleanup = () => frame.remove();
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return cleanup();
    win.addEventListener('afterprint', cleanup);
    // Laisse le temps aux polices, puis ouvre la boîte d'impression.
    setTimeout(() => {
      win.focus();
      win.print();
    }, 150);
    // Si « afterprint » ne vient jamais (aperçu annulé), on nettoie quand même.
    setTimeout(cleanup, 120_000);
  };
  document.body.appendChild(frame);
}

/** Télécharge la facture en fichier HTML autonome (ouvrable et imprimable partout). */
export function downloadInvoiceHtml(doc: InvoiceDoc): void {
  const blob = new Blob([invoiceHtml(doc)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${doc.invoice.ref}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
