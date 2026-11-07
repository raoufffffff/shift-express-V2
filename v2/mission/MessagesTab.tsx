/**
 * Onglet Messages de la mission — le fil partagé avec les personnes placées
 * et les postulants. Un seul fil par mission : on parle du créneau, pas ailleurs.
 * PAS de saisie libre : on choisit un message tout fait (retard, problème,
 * merci de nous rejoindre, confirmer, tenue & accès) ou on pose la question
 * de disponibilité (du … au …, horaires). Si la personne répond oui, un bouton
 * « Créer le shift » crée la mission avec elle dedans.
 */
import { useEffect, useRef, useState } from 'react';
import { MOCK_TODAY } from '@/mocks/v2Today';
import { useV2People } from '@/stores/v2PeopleStore';
import type { StoredMessage } from '@/stores/v2PeopleStore';
import { useV2Ui } from '@/stores/v2UiStore';
import {
  CheckCheck,
  Clock,
  AlertTriangle,
  MapPin,
  UserCheck,
  Shirt,
  CalendarSearch,
  CalendarPlus,
  Check,
  Send,
} from 'lucide-react';
import type { Mission, MissionPerson } from '@/mocks/v2Missions';
import { personKindStyle } from '../coverage';
import { Avatar } from '../Avatar';
import { useMissionStore, effPlaced, createMission } from './missionStore';
import { missionTimeLabel, parseISO, toISO } from '../time';

type Audience = 'placed' | 'candidates' | 'all';

interface Message extends StoredMessage {
  from?: string;
  fromPerson?: MissionPerson;
}

/** Les messages tout faits — les cas qui reviennent chaque semaine. Rien d'autre ne part. */
const TEMPLATES: { key: string; label: string; icon: typeof Clock; text: string; tone?: 'warning' }[] = [
  {
    key: 'late',
    label: 'Retard ?',
    icon: Clock,
    text: 'Il manque quelqu’un au pointage — tout va bien ? Prévenez-nous si vous avez du retard.',
    tone: 'warning',
  },
  {
    key: 'problem',
    label: 'Nous avons un problème',
    icon: AlertTriangle,
    text: 'Nous avons un problème sur le créneau : merci de nous rappeler au plus vite.',
    tone: 'warning',
  },
  {
    key: 'join',
    label: 'Merci de nous rejoindre',
    icon: MapPin,
    text: 'Merci de nous rejoindre dès que possible au point de rendez-vous indiqué dans la mission.',
  },
  {
    key: 'confirm',
    label: 'Confirmer la présence',
    icon: UserCheck,
    text: 'Bonjour, pouvez-vous confirmer votre présence pour le créneau ? Merci !',
  },
  {
    key: 'dress',
    label: 'Tenue & accès',
    icon: Shirt,
    text: 'Rappel : tenue noire, entrée par la porte de service côté cour. À tout à l’heure.',
  },
];

const AUDIENCE_LABEL: Record<Audience, string> = {
  placed: 'Aux placés',
  candidates: 'Aux postulants',
  all: 'À tous',
};

const fmtShort = (iso: string) =>
  parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = parseISO(from);
  const end = parseISO(to);
  while (d <= end && out.length < 31) {
    out.push(toISO(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Quelques messages d'exemple, ancrés sur les gens de la mission. */
export function seedThread(mission: Mission, placed: MissionPerson[]): Message[] {
  const first = placed[0] ?? mission.candidates[0];
  const day = parseISO(mission.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const thread: Message[] = [
    {
      id: 'm1',
      mine: true,
      audience: 'all',
      text: `Bonjour, créneau ${mission.poste} le ${day}, ${mission.start}–${mission.end}. Qui est dispo ?`,
      time: '09:12',
      seen: Math.max(placed.length + mission.candidates.length - 1, 0),
    },
  ];
  if (first) {
    thread.push({ id: 'm2', mine: false, fromPerson: first, text: 'Présent·e, je prends le créneau.', time: '09:18' });
    thread.push({
      id: 's1',
      mine: false,
      system: true,
      text: `${first.name} a été placé·e sur le créneau`,
      time: '09:19',
    });
    thread.push({
      id: 'm3',
      mine: true,
      audience: 'placed',
      text: 'Parfait, à tout à l’heure. Tenue habituelle.',
      time: '09:20',
      seen: placed.length,
    });
  }
  return thread;
}

/** « Aujourd'hui » de la maquette : une mission passée est terminée. */
const TODAY = MOCK_TODAY;

export function MessagesTab({ mission }: { mission: Mission }) {
  useMissionStore(); // les participants suivent les placements en direct
  // Mission terminée : les auto-entrepreneurs quittent la messagerie (la
  // relation s'arrête avec la mission) ; le personnel, lui, reste joignable.
  const ended = mission.date < TODAY;
  const placed = effPlaced(mission).filter((p) => !p.suggested && !(ended && p.kind === 'freelance'));
  const candidates = mission.candidates.filter(
    (c) => !placed.some((p) => p.id === c.id) && !(ended && c.kind === 'freelance'),
  );

  // Les messages envoyés pendant la session sont conservés par mission (store).
  const stored = useV2People((s) => s.threads[mission.id]) ?? [];
  const appendMessage = useV2People((s) => s.appendMessage);
  const updateMessage = useV2People((s) => s.updateMessage);
  const requestOpenMission = useV2Ui((s) => s.requestOpenMission);
  const freelanceOnly = useV2Ui((s) => s.mode) === 'freelance';
  const log = useV2Ui((s) => s.log);
  const messages: Message[] = [...seedThread(mission, placed), ...stored];

  const [audience, setAudience] = useState<Audience>('placed');
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState('');
  const [avail, setAvail] = useState({ from: '2026-11-05', to: '2026-11-05', start: mission.start, end: mission.end });
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAudience('placed');
    setAsking(false);
  }, [mission.id]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const recipients =
    audience === 'placed' ? placed : audience === 'candidates' ? candidates : [...placed, ...candidates];
  // Saisie libre : seulement quand on n'écrit qu'au personnel (salariés, extras).
  // Dès qu'un auto-entrepreneur est destinataire, messages tout faits uniquement.
  const freeText = recipients.length > 0 && recipients.every((r) => r.kind !== 'freelance');
  const now = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const send = (text: string) => {
    const t = text.trim();
    if (!t || recipients.length === 0) return;
    appendMessage(mission.id, { id: `me-${Date.now()}`, mine: true, text: t, time: now(), seen: 0, audience });
    setDraft('');
  };

  // Question de disponibilité → la première personne visée répond oui (simulé) → « Créer le shift ».
  const askAvailability = () => {
    const target = recipients[0];
    if (!target || avail.to < avail.from) return;
    const range =
      avail.from === avail.to ? `le ${fmtShort(avail.from)}` : `du ${fmtShort(avail.from)} au ${fmtShort(avail.to)}`;
    const id = `me-${Date.now()}`;
    appendMessage(mission.id, {
      id,
      mine: true,
      text: `${target.name}, êtes-vous disponible ${range}, de ${avail.start} à ${avail.end} ?`,
      time: now(),
      seen: 0,
      audience,
      availability: { ...avail, to_name: target.name },
    });
    setAsking(false);
    // Réponse simulée : oui.
    setTimeout(() => {
      appendMessage(mission.id, {
        id: `${id}-r`,
        mine: false,
        from: target.name,
        text: `Oui, je suis disponible ${range} de ${avail.start} à ${avail.end}.`,
        time: now(),
      });
      updateMessage(mission.id, id, { availableYes: true });
    }, 1500);
  };

  const createShift = (m: Message) => {
    if (!m.availability) return;
    const target = [...placed, ...candidates].find((p) => p.name === m.availability!.to_name);
    const ids: string[] = [];
    datesBetween(m.availability.from, m.availability.to).forEach((d) => {
      const created = createMission({
        poste: mission.poste,
        establishment: mission.establishment,
        date: d,
        start: m.availability!.start,
        end: m.availability!.end,
        required: 1,
        system: target?.kind === 'freelance' ? 'freelance' : 'employe',
        coverage: target?.kind === 'freelance' ? 'freelance_validated' : 'complete',
        placed: target
          ? [{ id: target.id, name: target.name, kind: target.kind, cost: target.cost, checkedIn: false }]
          : [],
        candidates: [],
        estimatedCost: target?.cost ?? 0,
        history: [{ at: 'maintenant', label: `Créée depuis la messagerie · ${target?.name ?? ''} disponible` }],
      });
      ids.push(created.id);
    });
    updateMessage(mission.id, m.id, { createdMissionIds: ids });
    appendMessage(mission.id, {
      id: `sys-${Date.now()}`,
      mine: false,
      system: true,
      text: `${ids.length} shift${ids.length > 1 ? 's' : ''} créé${ids.length > 1 ? 's' : ''} avec ${m.availability.to_name}`,
      time: now(),
    });
    log({
      kind: 'publication',
      label: `${ids.length} shift${ids.length > 1 ? 's' : ''} créé${ids.length > 1 ? 's' : ''} depuis la messagerie`,
      detail: `${mission.poste} · ${m.availability.to_name}`,
      missionId: ids[0],
    });
  };

  const participant = (p: MissionPerson, status: 'placé' | 'postulant') => (
    <li key={p.id} className="flex items-center gap-2 min-w-0">
      <Avatar person={p} size={26} />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-se-ink truncate">{p.name}</span>
        <span className={`block text-[10px] leading-tight ${personKindStyle[p.kind].text}`}>
          {personKindStyle[p.kind].label} · {status}
        </span>
      </span>
    </li>
  );

  return (
    <div className="grid md:grid-cols-[1fr_220px] min-h-[520px]">
      {/* ── Fil ──────────────────────────────────────────────── */}
      <div className="flex flex-col min-h-0 md:border-r border-se-line">
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <p className="text-center text-[11px] text-se-muted">
            Fil de la mission · {mission.poste} · {missionTimeLabel(mission)}
          </p>
          {messages.map((m) => (
            <Bubble
              key={m.id}
              message={m}
              recipients={recipients.length}
              people={[...placed, ...candidates]}
              onCreateShift={() => createShift(m)}
              onOpenCreated={(id) => requestOpenMission(id)}
            />
          ))}
          <div ref={endRef} />
        </div>

        {/* Choisir un message (pas de saisie libre) */}
        <div className="border-t border-se-line px-4 pt-3 pb-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
              aria-label="Destinataires"
              className="h-8 px-2 rounded-se-sm text-xs font-semibold border border-se-line bg-se-surface text-se-ink"
            >
              <option value="placed">Aux placés ({placed.length})</option>
              <option value="candidates">Aux postulants ({candidates.length})</option>
              <option value="all">À tous ({placed.length + candidates.length})</option>
            </select>
            <p className="text-[11px] text-se-muted">
              {recipients.length === 0
                ? 'Personne à qui écrire pour l’instant.'
                : 'Choisissez un message : il part tel quel.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => send(t.text)}
                disabled={recipients.length === 0}
                title={t.text}
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs font-semibold border disabled:opacity-40 ${
                  t.tone === 'warning'
                    ? 'border-se-cascade/60 text-se-cascade-ink bg-se-cascade-wash/60 hover:bg-se-cascade-wash'
                    : 'border-se-line bg-se-surface text-se-ink hover:bg-se-surface-2'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" aria-hidden="true" /> {t.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAsking((v) => !v)}
              disabled={recipients.length === 0}
              aria-expanded={asking}
              className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs font-semibold border disabled:opacity-40 ${
                asking
                  ? 'bg-se-blue text-white border-se-blue'
                  : 'border-se-blue/40 text-se-blue-ink bg-se-blue-wash/60 hover:bg-se-blue-wash'
              }`}
            >
              <CalendarSearch className="w-3.5 h-3.5" aria-hidden="true" /> Êtes-vous disponible ?
            </button>
          </div>

          {/* Personnel seul destinataire : on peut écrire librement */}
          {freeText && !asking && (
            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                placeholder={`Écrire ${AUDIENCE_LABEL[audience].toLowerCase()} (personnel)…`}
                className="flex-1 min-h-[40px] max-h-28 py-2.5 px-3 rounded-se-sm border border-se-line bg-se-surface text-sm text-se-ink resize-none focus:outline-none focus:border-se-blue"
              />
              <button
                type="button"
                onClick={() => send(draft)}
                aria-label="Envoyer"
                disabled={!draft.trim()}
                className="w-10 h-10 grid place-items-center rounded-se-sm bg-se-blue text-white hover:bg-se-blue-ink disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
          {!freeText && recipients.length > 0 && !asking && (
            <p className="text-[11px] text-se-muted">
              Un auto-entrepreneur est destinataire : messages tout faits uniquement, pas de saisie libre.
            </p>
          )}

          {asking && (
            <div className="rounded-se-sm border border-se-blue/40 bg-se-blue-wash/30 p-3">
              <p className="text-xs text-se-ink mb-2">
                Question envoyée à <strong>{recipients[0]?.name}</strong>
                {recipients.length > 1 ? ` (premier·ère des ${AUDIENCE_LABEL[audience].toLowerCase()})` : ''} : si la
                réponse est oui, vous pourrez créer le shift en un clic.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="block">
                  <span className="se-eyebrow block mb-1">Du</span>
                  <input
                    type="date"
                    value={avail.from}
                    onChange={(e) =>
                      setAvail((a) => ({
                        ...a,
                        from: e.target.value,
                        to: a.to < e.target.value ? e.target.value : a.to,
                      }))
                    }
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="se-eyebrow block mb-1">Au</span>
                  <input
                    type="date"
                    value={avail.to}
                    min={avail.from}
                    onChange={(e) => setAvail((a) => ({ ...a, to: e.target.value }))}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="se-eyebrow block mb-1">Début</span>
                  <input
                    type="time"
                    value={avail.start}
                    onChange={(e) => setAvail((a) => ({ ...a, start: e.target.value }))}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="se-eyebrow block mb-1">Fin</span>
                  <input
                    type="time"
                    value={avail.end}
                    onChange={(e) => setAvail((a) => ({ ...a, end: e.target.value }))}
                    className={inputCls}
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setAsking(false)}
                  className="h-8 px-3 rounded-se-sm text-xs font-semibold text-se-muted hover:bg-se-surface-2"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={askAvailability}
                  className="h-8 px-3 rounded-se-sm text-xs font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
                >
                  Envoyer la question
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Participants ────────────────────────────────────── */}
      <aside className="px-4 py-4 space-y-4 border-t md:border-t-0 border-se-line">
        <div>
          <p className="se-eyebrow mb-2">
            Placés <span className="text-se-muted font-normal">· {placed.length}</span>
          </p>
          {placed.length === 0 ? (
            <p className="text-xs text-se-muted">Personne pour l'instant.</p>
          ) : (
            <ul className="space-y-2">{placed.map((p) => participant(p, 'placé'))}</ul>
          )}
        </div>
        <div>
          <p className="se-eyebrow mb-2">
            Postulants <span className="text-se-muted font-normal">· {candidates.length}</span>
          </p>
          {candidates.length === 0 ? (
            <p className="text-xs text-se-muted">Aucun postulant.</p>
          ) : (
            <ul className="space-y-2">{candidates.map((p) => participant(p, 'postulant'))}</ul>
          )}
        </div>
        <p className="text-[11px] text-se-muted leading-relaxed">
          {freelanceOnly ? 'Messages' : 'Saisie libre avec votre personnel ; messages'} tout faits avec les
          auto-entrepreneurs, qui quittent le fil une fois la mission terminée et n’ont pas vos coordonnées directes.
        </p>
      </aside>
    </div>
  );
}

const inputCls =
  'w-full h-8 rounded-se-sm border border-se-line bg-se-surface px-2 text-xs text-se-ink focus:outline-none focus:border-se-blue';

function Bubble({
  message,
  recipients,
  people,
  onCreateShift,
  onOpenCreated,
}: {
  message: Message;
  recipients: number;
  people: MissionPerson[];
  onCreateShift: () => void;
  onOpenCreated: (id: string) => void;
}) {
  if (message.system) {
    return (
      <p className="text-center text-[11px] text-se-muted">
        <span className="px-2 py-0.5 rounded-full bg-se-surface-2">{message.text}</span>
      </p>
    );
  }
  if (message.mine) {
    const seen = message.seen ?? 0;
    const created = message.createdMissionIds ?? [];
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%]">
          <div className="rounded-se rounded-br-sm bg-se-blue text-white px-3 py-2 text-sm whitespace-pre-wrap">
            {message.text}
          </div>
          <p className="text-[11px] text-se-muted mt-0.5 text-right flex items-center justify-end gap-1">
            {message.audience && <span>{AUDIENCE_LABEL[message.audience]} ·</span>}
            <span>{message.time}</span>
            <CheckCheck
              className={`w-3.5 h-3.5 ${seen > 0 ? 'text-se-blue' : 'text-se-muted/60'}`}
              aria-hidden="true"
            />
            <span>{seen > 0 ? `Vu par ${seen}` : recipients > 0 ? 'Envoyé' : ''}</span>
          </p>
          {/* Disponibilité : en attente → oui → Créer le shift → créé */}
          {message.availability && !message.availableYes && (
            <p className="text-[11px] text-se-muted mt-1 text-right inline-flex items-center gap-1 w-full justify-end">
              <Clock className="w-3 h-3" aria-hidden="true" /> En attente de réponse…
            </p>
          )}
          {message.availability && message.availableYes && created.length === 0 && (
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                onClick={onCreateShift}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-se-sm text-xs font-semibold bg-se-success text-white hover:opacity-90"
              >
                <CalendarPlus className="w-4 h-4" aria-hidden="true" /> Créer la mission avec{' '}
                {message.availability.to_name}
              </button>
            </div>
          )}
          {created.length > 0 && (
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                onClick={() => onOpenCreated(created[0])}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-se-success"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" /> {created.length} shift
                {created.length > 1 ? 's' : ''} créé
                {created.length > 1 ? 's' : ''} · ouvrir
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
  const from = message.fromPerson ?? people.find((p) => p.name === message.from);
  const k = from ? personKindStyle[from.kind] : null;
  return (
    <div className="flex gap-2">
      {from && <Avatar person={from} size={28} />}
      <div className="max-w-[78%]">
        <p className="text-xs mb-0.5">
          <span className="font-semibold text-se-ink">{from?.name ?? message.from}</span>
          {k && <span className={`ml-1.5 ${k.text}`}>{k.label}</span>}
        </p>
        <div className="rounded-se rounded-tl-sm bg-se-surface-2 text-se-ink px-3 py-2 text-sm whitespace-pre-wrap">
          {message.text}
        </div>
        <p className="text-[11px] text-se-muted mt-0.5">{message.time}</p>
      </div>
    </div>
  );
}
