/**
 * La fiche d'une personne — une seule fenêtre pour tout le monde, une seule
 * colonne qui défile. En haut la carte d'identité : photo, nom, sous-ligne,
 * deux étiquettes au plus, trois chiffres clés, UN bouton principal
 * (Inviter · Placer · Étudier la candidature) et « Message » en lien.
 * Puis les blocs du modèle (profileModel.ts), séparés par un filet, les
 * mêmes que sur la fiche PDF. Les gestes rares sont des liens en bas
 * (Signaler · Bloquer). Ouverte en cliquant un nom : Mon équipe, candidats
 * et placés d'une mission, relevé d'heures.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Check,
  MessageSquare,
  CalendarPlus,
  Flag,
  ShieldOff,
  UserCheck,
  UserX,
  Plus,
  Trash2,
  Clock,
  ChevronRight,
} from 'lucide-react';
import type { Mission } from '@/mocks/v2Missions';
import type { PersonStatus } from '@/mocks/v2People';
import { MOCK_TODAY } from '@/mocks/v2Today';
import { useV2Settings } from '@/stores/v2SettingsStore';
import { useV2People, ABSENCE_REASONS } from '@/stores/v2PeopleStore';
import type { AbsenceReason } from '@/stores/v2PeopleStore';
import { useV2Ui } from '@/stores/v2UiStore';
import { useAllMissions, releaseForAbsence } from '../mission/missionStore';
import { personKindStyle } from '../coverage';
import { Avatar } from '../Avatar';
import { FavoriteStar, Stars } from './FavoriteStar';
import { MessageComposer } from './MessageComposer';
import { MissionPicker } from './MissionPicker';
import { buildProfile, fmtShort } from './profileModel';
import type { PersonRef, ProfileSection, ProfileData, ProfileItem, Tone } from './profileModel';

interface Props {
  person: PersonRef;
  onClose: () => void;
  /** contexte mission : « a postulé » / « disponible » / « placé » */
  missionContext?: 'applicant' | 'available' | 'placed';
  /** mission depuis laquelle la fiche est ouverte (bloc « Pour cette mission ») */
  mission?: Mission;
}

const TONE: Record<Tone, string> = {
  ok: 'bg-se-success-wash text-se-success',
  warn: 'bg-se-cascade-wash text-se-cascade-ink',
  danger: 'bg-se-danger-wash text-se-danger',
  blue: 'bg-se-blue-wash text-se-blue-ink',
  pink: 'bg-se-freelance-wash text-se-freelance-ink',
  muted: 'bg-se-surface-2 text-se-muted',
};
const TEXT_TONE: Record<Tone, string> = {
  ok: 'text-se-success',
  warn: 'text-se-cascade-ink',
  danger: 'text-se-danger',
  blue: 'text-se-blue-ink',
  pink: 'text-se-freelance-ink',
  muted: 'text-se-muted',
};
const inputCls =
  'w-full h-9 rounded-se-sm border border-se-line bg-se-surface px-2.5 text-sm text-se-ink focus:outline-none focus:border-se-blue';

export function ProfileSheet({ person, onClose, missionContext, mission }: Props) {
  const k = personKindStyle[person.kind];
  const missions = useAllMissions();
  const establishments = useV2Settings((s) => s.establishments);
  const staff = useV2Settings((s) => s.staff);
  const pool = useV2Settings((s) => s.pool);
  const statuses = useV2People((s) => s.statuses);
  const absences = useV2People((s) => s.absences);
  const favorites = useV2People((s) => s.favorites);
  const myReviews = useV2People((s) => s.reviews);
  const data = useMemo<ProfileData>(
    () =>
      buildProfile(person, {
        missionContext,
        mission,
        establishments: establishments.map((e) => e.name),
        staff,
        pool,
        statuses,
        absences,
        favorites,
        myReviews,
        missions,
        today: MOCK_TODAY,
      }),
    [person, missionContext, mission, establishments, staff, pool, statuses, absences, favorites, myReviews, missions],
  );

  const log = useV2Ui((s) => s.log);
  const requestOpenMission = useV2Ui((s) => s.requestOpenMission);
  const setStatus = useV2People((s) => s.setStatus);
  const blocked = data.status === 'bloque';
  const decide = (next: PersonStatus, label: string) => {
    setStatus(data.key, next);
    log({ kind: 'personne', label, detail: `${person.name} · ${k.label}` });
  };

  // Un seul bouton principal ; « Message » replie un composeur sous l'en-tête.
  const [composing, setComposing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const primary = k.dot === 'bg-se-freelance' ? 'bg-se-freelance hover:opacity-90' : `${k.dot} hover:opacity-90`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const openMission = (id: string) => {
    onClose();
    requestOpenMission(id);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-6">
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-se-ink/50" />
      <div
        role="dialog"
        aria-label={`Fiche de ${person.name}`}
        className="se-root relative w-full max-w-xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col bg-se-surface rounded-none sm:rounded-se shadow-se-md overflow-hidden"
      >
        <button
          type="button"
          aria-label="Fermer"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-9 h-9 grid place-items-center rounded-full bg-se-surface/90 border border-se-line text-se-muted hover:text-se-ink"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex-1 overflow-y-auto">
          {/* ── Carte d'identité ── */}
          <header className="px-6 pt-8 pb-5 text-center">
            <span className="inline-block rounded-full ring-4 ring-se-surface shadow-se">
              <Avatar person={person} size={96} />
            </span>
            <h2 className="mt-3 text-2xl font-extrabold text-se-ink inline-flex items-center justify-center gap-2 max-w-full">
              <span className="truncate">{person.name}</span>
              {person.kind === 'freelance' && <FavoriteStar name={person.name} />}
            </h2>
            <p className={`text-sm font-semibold mt-0.5 ${k.text}`}>{data.hero.subline}</p>
            {data.hero.tags.length > 0 && (
              <p className="mt-2 flex items-center justify-center gap-1.5 flex-wrap">
                {data.hero.tags.map((t) => (
                  <span key={t.text} className={`se-badge ${TONE[t.tone]}`}>
                    {t.text}
                  </span>
                ))}
              </p>
            )}

            {/* Trois chiffres clés */}
            <dl className="mt-5 grid grid-cols-3 divide-x divide-se-line-soft">
              {data.hero.stats.map((s) => (
                <div key={s.label} className="px-2">
                  <dd className="text-2xl font-extrabold font-display text-se-ink leading-none tabular-nums">
                    {s.value}
                  </dd>
                  <dt className="se-eyebrow mt-1.5">{s.label}</dt>
                </div>
              ))}
            </dl>

            {/* Un bouton principal, « Message » en lien */}
            <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
              {data.status === 'candidat' ? (
                deciding ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        decide('bloque', 'Candidature refusée');
                        setFeedback(`Candidature refusée : ${person.name} est prévenu·e.`);
                        setDeciding(false);
                      }}
                      className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-sm font-semibold border border-se-line text-se-danger hover:bg-se-danger-wash"
                    >
                      <UserX className="w-4 h-4" aria-hidden="true" /> Refuser
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        decide('actif', 'Candidature acceptée');
                        setFeedback(
                          `${person.name} rejoint votre équipe : vous pouvez placer cette personne dès maintenant.`,
                        );
                        setDeciding(false);
                      }}
                      className={`inline-flex items-center gap-1.5 h-10 px-5 rounded-full text-sm font-semibold text-white ${primary}`}
                    >
                      <UserCheck className="w-4 h-4" aria-hidden="true" /> Accepter
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeciding(true)}
                    className={`h-10 px-5 rounded-full text-sm font-semibold text-white ${primary}`}
                  >
                    Étudier la candidature
                  </button>
                )
              ) : (
                <>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => setPicking(true)}
                    className={`inline-flex items-center gap-1.5 h-10 px-5 rounded-full text-sm font-semibold text-white disabled:opacity-40 ${primary}`}
                  >
                    <CalendarPlus className="w-4 h-4" aria-hidden="true" />
                    {person.kind === 'freelance' ? 'Inviter sur une mission' : 'Placer sur une mission'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposing((c) => !c)}
                    aria-pressed={composing}
                    className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                      composing ? 'text-se-blue' : 'text-se-blue-ink hover:text-se-blue'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" aria-hidden="true" /> Message
                  </button>
                </>
              )}
            </div>
            {feedback && (
              <p className="mt-3 inline-flex items-start gap-1.5 text-sm text-se-success bg-se-success-wash rounded-se-sm px-3 py-2 text-left">
                <Check className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{feedback}</span>
              </p>
            )}
            {composing && (
              <div className="mt-4 text-left">
                <MessageComposer name={person.name} onClose={() => setComposing(false)} />
              </div>
            )}
          </header>

          {/* ── Blocs ── */}
          {data.sections.map((s) => (
            <Section key={s.key} section={s} data={data} person={person} onOpenMission={openMission} />
          ))}

          {/* ── Gestes rares, en bas ── */}
          <Footer person={person} data={data} blocked={blocked} decide={decide} />
        </div>
      </div>

      {picking && (
        <MissionPicker
          person={person}
          roles={data.roles}
          onClose={() => setPicking(false)}
          onDone={(m) => {
            setPicking(false);
            if (person.kind === 'freelance') {
              setFeedback(
                `Invitation envoyée pour ${m.poste} · ${fmtShort(m.date)} · ${m.start}–${m.end}. ${person.name} postule depuis son application, puis vous validez.`,
              );
            } else {
              openMission(m.id);
            }
          }}
        />
      )}
    </div>
  );
}

/* ── Un bloc : titre, aparté, contenu selon son genre ─────── */
function Section({
  section: s,
  data,
  person,
  onOpenMission,
}: {
  section: ProfileSection;
  data: ProfileData;
  person: PersonRef;
  onOpenMission: (id: string) => void;
}) {
  return (
    <section className="px-6 py-4 border-t border-se-line-soft">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="se-eyebrow">{s.title}</h3>
        {s.aside && <span className="text-xs text-se-muted">{s.aside}</span>}
      </div>
      {s.kind === 'rows' && (
        <>
          <dl className="space-y-1.5">
            {s.rows.map((r) => (
              <div key={r.label} className="flex items-baseline gap-3 text-sm">
                <dt className="w-28 shrink-0 text-se-muted">{r.label}</dt>
                <dd className={`min-w-0 flex-1 font-semibold ${r.tone ? TEXT_TONE[r.tone] : 'text-se-ink'}`}>
                  {r.href ? (
                    <a href={r.href} className="hover:text-se-blue-ink">
                      {r.value}
                    </a>
                  ) : (
                    r.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {s.text && <p className="text-xs text-se-muted mt-2">{s.text}</p>}
          {s.key === 'contact' && data.profile && <VigilanceRequest name={person.name} />}
        </>
      )}
      {s.kind === 'chips' && (
        <p className="flex flex-wrap gap-1.5">
          {s.chips.map((c) => (
            <span
              key={c.text}
              className={`inline-flex items-center h-7 px-2.5 rounded-full text-xs font-semibold ${
                c.tone ? TONE[c.tone] : 'bg-se-surface-2 text-se-ink'
              }`}
            >
              {c.text}
            </span>
          ))}
        </p>
      )}
      {s.kind === 'list' && s.key === 'absences' && <Absences items={s.items} empty={s.empty} name={person.name} />}
      {s.kind === 'list' && s.key !== 'absences' && (
        <List items={s.items} empty={s.empty} onOpenMission={onOpenMission} collapsible={s.key === 'experiences'} />
      )}
      {s.kind === 'quotes' && (
        <div>
          {s.average !== undefined && (
            <p className="flex items-center gap-2 mb-2">
              <span className="text-2xl font-extrabold font-display text-se-ink leading-none">
                {s.average.toFixed(1)}
              </span>
              <Stars rating={s.average} size="w-4 h-4" />
            </p>
          )}
          {s.quotes.length === 0 ? (
            <p className="text-sm text-se-muted">Pas encore d'avis.</p>
          ) : (
            <ul className="space-y-2.5">
              {s.quotes.slice(0, 3).map((q, i) => (
                <li key={`${q.when}-${i}`} className="text-sm">
                  <p className="text-se-ink leading-snug">« {q.text} »</p>
                  <p className="text-xs text-se-muted mt-0.5">
                    {q.rating.toFixed(1)} ★ · {q.by} · {fmtShort(q.when)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {s.kind === 'gauge' && (
        <div>
          <p className="text-sm font-semibold text-se-ink">{s.gauge.label}</p>
          {s.gauge.max !== null && (
            <div className="h-2 rounded-full bg-se-line mt-2 overflow-hidden" role="presentation">
              <div
                className={`h-full ${
                  s.gauge.value > s.gauge.max
                    ? 'bg-se-danger'
                    : s.gauge.value / s.gauge.max >= 0.9
                      ? 'bg-se-cascade'
                      : 'bg-se-blue'
                }`}
                style={{ width: `${Math.min((s.gauge.value / s.gauge.max) * 100, 100)}%` }}
              />
            </div>
          )}
          <p className="text-xs text-se-muted mt-1.5">{s.gauge.hint}</p>
        </div>
      )}
      {s.kind === 'text' && s.key === 'note' && <PrivateNote storeKey={data.key} initial={s.text} />}
    </section>
  );
}

/* ── Liste de missions / d'expériences : lignes cliquables si elles mènent à une mission ── */
function List({
  items,
  empty,
  onOpenMission,
  collapsible,
}: {
  items: ProfileItem[];
  empty: string;
  onOpenMission: (id: string) => void;
  collapsible?: boolean;
}) {
  const [all, setAll] = useState(false);
  const shown = collapsible && !all ? items.slice(0, 4) : items;
  if (items.length === 0) return <p className="text-sm text-se-muted">{empty}</p>;
  return (
    <>
      <ul className="divide-y divide-se-line-soft">
        {shown.map((it) => {
          const inner = (
            <>
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-semibold text-se-ink">{it.title}</span>
                {it.detail && <span className="text-se-muted"> · {it.detail}</span>}
              </span>
              {it.badge && (
                <span className={`se-badge ${TONE[it.badge.tone]}`} style={{ height: 18 }}>
                  {it.badge.text}
                </span>
              )}
              {it.when && <span className="text-xs text-se-muted whitespace-nowrap tabular-nums">{it.when}</span>}
              {it.missionId && <ChevronRight className="w-4 h-4 text-se-muted shrink-0" aria-hidden="true" />}
            </>
          );
          return (
            <li key={it.id}>
              {it.missionId ? (
                <button
                  type="button"
                  onClick={() => onOpenMission(it.missionId!)}
                  className="w-full flex items-center gap-3 py-2 text-left hover:bg-se-surface-2 rounded-se-sm px-1 -mx-1"
                >
                  {inner}
                </button>
              ) : (
                <div className="flex items-center gap-3 py-2">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
      {collapsible && items.length > 4 && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="mt-1.5 text-xs font-semibold text-se-blue-ink hover:text-se-blue"
        >
          {all ? 'Voir moins' : `Voir tout (${items.length})`}
        </button>
      )}
    </>
  );
}

/* ── Absences : liste avec retrait, et « Déclarer une absence » replié ── */
function Absences({
  items,
  empty,
  name,
}: {
  items: { id: string; title: string; when?: string }[];
  empty: string;
  name: string;
}) {
  const addAbsence = useV2People((s) => s.addAbsence);
  const removeAbsence = useV2People((s) => s.removeAbsence);
  const log = useV2Ui((s) => s.log);
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState('2026-11-09');
  const [to, setTo] = useState('2026-11-13');
  const [reason, setReason] = useState<AbsenceReason>('Congés payés');
  const ok = !!from && !!to && to >= from;
  const [released, setReleased] = useState<number | null>(null);
  const save = () => {
    if (!ok) return;
    addAbsence({ name, from, to, reason });
    // Déjà placé·e sur ces jours : chaque créneau à venir est relâché, à remplacer
    // (la cloche et la fenêtre de mission proposent qui peut le prendre).
    const hit = releaseForAbsence(name, from, to, reason, MOCK_TODAY);
    setReleased(hit.length);
    log({
      kind: 'personne',
      label: `Absence déclarée · ${reason}`,
      detail: `${name} · du ${fmtShort(from)} au ${fmtShort(to)}${
        hit.length > 0 ? ` · ${hit.length} créneau${hit.length > 1 ? 'x' : ''} à remplacer` : ''
      }`,
    });
    setAdding(false);
  };
  return (
    <>
      {items.length === 0 ? (
        <p className="text-sm text-se-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-se-line-soft">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="font-semibold text-se-ink">{a.title}</span>
              <span className="text-se-muted">{a.when}</span>
              <button
                type="button"
                onClick={() => removeAbsence(a.id)}
                aria-label="Retirer cette absence"
                className="ml-auto w-7 h-7 grid place-items-center rounded-se-sm text-se-muted hover:text-se-danger hover:bg-se-danger-wash"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {released !== null && released > 0 && (
        <p className="mt-2 text-xs text-se-danger bg-se-danger-wash rounded-se-sm px-3 py-2">
          {released} créneau{released > 1 ? 'x' : ''} à venir à remplacer : ouvrez la cloche, un remplaçant est proposé
          pour chacun.
        </p>
      )}
      {adding ? (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="se-eyebrow block mb-1">Du</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="se-eyebrow block mb-1">Au</span>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputCls} />
            </label>
          </div>
          <label className="block">
            <span className="se-eyebrow block mb-1">Motif</span>
            <select value={reason} onChange={(e) => setReason(e.target.value as AbsenceReason)} className={inputCls}>
              {ABSENCE_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="flex-1 h-9 rounded-se-sm text-sm font-semibold border border-se-line text-se-ink hover:bg-se-surface-2"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!ok}
              className="flex-1 h-9 rounded-se-sm text-sm font-semibold text-white bg-se-blue hover:bg-se-blue-ink disabled:opacity-40"
            >
              Déclarer
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-se-blue-ink hover:text-se-blue"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Déclarer une absence
        </button>
      )}
    </>
  );
}

/* ── Attestation URSSAF : demander (une ligne) ── */
function VigilanceRequest({ name }: { name: string }) {
  const requested = useV2People((s) => s.vigilanceRequests[name]);
  const requestVigilance = useV2People((s) => s.requestVigilance);
  const log = useV2Ui((s) => s.log);
  return requested ? (
    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-se-blue-ink">
      <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Attestation demandée le{' '}
      {new Date(requested).toLocaleDateString('fr-FR')} · en attente
    </p>
  ) : (
    <button
      type="button"
      onClick={() => {
        requestVigilance(name);
        log({ kind: 'personne', label: 'Attestation de vigilance demandée', detail: name });
      }}
      className="mt-2 text-xs font-semibold text-se-blue-ink hover:text-se-blue"
    >
      Demander l’attestation à jour ›
    </button>
  );
}

/* ── Note privée : repliée tant qu'elle est vide ── */
function PrivateNote({ storeKey, initial }: { storeKey: string; initial: string }) {
  const note = useV2People((s) => s.notes[storeKey]);
  const setNote = useV2People((s) => s.setNote);
  const value = note ?? initial;
  const [open, setOpen] = useState(value.length > 0);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-se-blue-ink hover:text-se-blue"
      >
        <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Ajouter une note privée
      </button>
    );
  }
  return (
    <textarea
      value={value}
      autoFocus={value.length === 0}
      onChange={(e) => setNote(storeKey, e.target.value)}
      rows={2}
      placeholder="Ponctualité, préférences, points d'attention…"
      className="w-full rounded-se-sm border border-se-line bg-se-surface-2 px-3 py-2 text-sm text-se-ink focus:outline-none focus:border-se-blue focus:bg-se-surface resize-none"
    />
  );
}

/* ── Gestes rares : signaler (auto-entrepreneur) · bloquer (salarié, extra) ── */
function Footer({
  person,
  data,
  blocked,
  decide,
}: {
  person: PersonRef;
  data: ProfileData;
  blocked: boolean;
  decide: (next: PersonStatus, label: string) => void;
}) {
  const reportedAt = useV2People((s) => s.personReports[person.name]);
  const reportPerson = useV2People((s) => s.reportPerson);
  const log = useV2Ui((s) => s.log);
  if (person.kind === 'freelance') {
    return (
      <p className="px-6 py-4 border-t border-se-line-soft text-center text-xs text-se-muted">
        {reportedAt ? (
          <>Signalement transmis à Shift Express le {new Date(reportedAt).toLocaleDateString('fr-FR')}.</>
        ) : (
          <button
            type="button"
            onClick={() => {
              reportPerson(person.name);
              log({
                kind: 'personne',
                label: 'Problème signalé à Shift Express',
                detail: `${person.name} · auto-entrepreneur`,
              });
            }}
            className="inline-flex items-center gap-1 font-semibold hover:text-se-danger"
          >
            <Flag className="w-3.5 h-3.5" aria-hidden="true" /> Signaler un problème avec cette personne
          </button>
        )}
      </p>
    );
  }
  if (data.status === 'candidat') return null;
  return (
    <p className="px-6 py-4 border-t border-se-line-soft text-center text-xs">
      <button
        type="button"
        onClick={() => (blocked ? decide('actif', 'Personne débloquée') : decide('bloque', 'Personne bloquée'))}
        className={`inline-flex items-center gap-1 font-semibold ${blocked ? 'text-se-danger' : 'text-se-muted hover:text-se-danger'}`}
      >
        <ShieldOff className="w-3.5 h-3.5" aria-hidden="true" />
        {blocked ? 'Débloquer cette personne' : 'Bloquer cette personne'}
      </button>
    </p>
  );
}
