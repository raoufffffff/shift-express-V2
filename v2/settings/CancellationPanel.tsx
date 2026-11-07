/**
 * Réglages › Annulation & frais — la règle appliquée quand le client annule
 * un shift, en mots simples et avec les chiffres en vigueur. Lecture seule :
 * elle découle des conditions générales Shift Express (cancellation.ts).
 */
import { ShieldCheck, Clock, CalendarRange, Users, Wallet } from 'lucide-react';
import { Drawer } from './Drawer';
import { CANCELLATION_POLICY, noticeHoursFor } from '../mission/cancellation';

export function CancellationPanel({ onClose }: { onClose: () => void }) {
  const p = CANCELLATION_POLICY;
  const rows = [
    {
      icon: ShieldCheck,
      title: `Sans frais jusqu'à ${p.freeHours} h avant le début`,
      text: 'Un shift d’un jour s’annule gratuitement tant qu’il reste au moins 48 h. Les personnes placées sont prévenues.',
    },
    {
      icon: Clock,
      title: `Entre ${p.freeHours} h et ${p.halfHours} h : 50 % · moins de ${p.halfHours} h : 100 %`,
      text: 'Sur le devis des auto-entrepreneurs validés uniquement. Le montant exact s’affiche avant de confirmer.',
    },
    {
      icon: CalendarRange,
      title: 'Missions longues : le préavis grandit avec la durée',
      text: `+${p.perExtraDayHours} h par jour au-delà du premier, plafonné à ${p.maxNoticeHours / 24} jours. Les frais se calculent jour par jour : seuls les jours dans le délai sont facturés.`,
    },
    {
      icon: Users,
      title: 'Votre personnel ne génère pas de frais',
      text: 'Salariés et extras sont simplement prévenus. Seuls les auto-entrepreneurs validés (devis engagé) comptent.',
    },
  ];
  const examples = [1, 2, 3, 5, 10].map((d) => ({ d, h: noticeHoursFor(d) }));

  return (
    <Drawer title="Annulation & frais" subtitle="Ce qui s'applique quand vous annulez une mission." onClose={onClose}>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.title} className="flex items-start gap-3 rounded-se border border-se-line p-3.5">
            <span className="w-9 h-9 rounded-se-sm bg-se-surface-2 grid place-items-center shrink-0 text-se-muted">
              <r.icon className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-se-ink">{r.title}</p>
              <p className="text-xs text-se-muted mt-0.5 leading-relaxed">{r.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-se border border-se-line overflow-hidden">
        <p className="se-eyebrow px-3.5 py-2.5 bg-se-surface-2 border-b border-se-line">
          Préavis gratuit selon la durée
        </p>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-se-line">
            {examples.map((e) => (
              <tr key={e.d}>
                <td className="px-3.5 py-2 text-se-ink">
                  {e.d} jour{e.d > 1 ? 's' : ''}
                </td>
                <td className="px-3.5 py-2 text-right font-semibold text-se-ink tabular-nums">
                  {e.h >= 48 ? `${e.h / 24} j` : `${e.h} h`} avant le début
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 inline-flex items-start gap-1.5 text-xs text-se-muted leading-relaxed">
        <Wallet className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        Les frais d’annulation suivent le même règlement que vos factures (prélèvement ou virement, voir Paiement). Ces
        conditions font partie des conditions générales Shift Express.
      </p>
    </Drawer>
  );
}
