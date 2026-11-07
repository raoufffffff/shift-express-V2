/**
 * Petit composeur de message ouvert depuis une fiche (salarié, extra ou
 * auto-entrepreneur). Le message est conservé (store Personnes) et tracé dans
 * l'historique des décisions ; les derniers envois restent visibles sous le champ.
 */
import { useState } from 'react';
import { Check, Send, X } from 'lucide-react';
import { useV2People } from '@/stores/v2PeopleStore';
import { useV2Ui } from '@/stores/v2UiStore';

export function MessageComposer({ name, onClose }: { name: string; onClose: () => void }) {
  const [text, setText] = useState('');
  const sent = useV2People((s) => s.directMessages[name] ?? []);
  const send = useV2People((s) => s.sendDirectMessage);
  const log = useV2Ui((s) => s.log);
  const [justSent, setJustSent] = useState(false);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    send(name, t);
    log({ kind: 'personne', label: 'Message envoyé', detail: `${name} · « ${t} »` });
    setText('');
    setJustSent(true);
  };

  return (
    <div className="rounded-se border border-se-line bg-se-surface p-3">
      <div className="flex items-center gap-2 mb-2">
        <p className="se-eyebrow">Message à {name}</p>
        <button
          type="button"
          aria-label="Fermer"
          onClick={onClose}
          className="ml-auto w-7 h-7 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        autoFocus
        placeholder="Votre message…"
        className="w-full rounded-se-sm border border-se-line bg-se-surface-2 px-3 py-2 text-sm text-se-ink focus:outline-none focus:border-se-blue focus:bg-se-surface resize-none"
      />
      <div className="flex items-center gap-2 mt-2">
        {justSent && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-se-success">
            <Check className="w-3.5 h-3.5" aria-hidden="true" /> Envoyé
          </span>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          className="ml-auto inline-flex items-center gap-1.5 h-9 px-3.5 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink disabled:opacity-40"
        >
          <Send className="w-4 h-4" aria-hidden="true" /> Envoyer
        </button>
      </div>
      {sent.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-se-line pt-2">
          {sent
            .slice(-3)
            .reverse()
            .map((m) => (
              <li key={m.at} className="text-xs text-se-ink">
                <span className="text-se-muted">
                  {new Date(m.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} ·
                </span>{' '}
                {m.text}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
