/**
 * Cloche — les notifications, déduites de l'état réel des missions :
 *  · candidatures reçues (quelqu'un se propose) ;
 *  · shift relâché par un salarié / extra (place à republier) ;
 *  · cascade : bascule vers les auto-entrepreneurs programmée ;
 *  · pointage manquant sur une mission passée ;
 *  · salarié placé un jour de repos.
 * Un clic ouvre la mission concernée. En mode auto-entrepreneur, seules les
 * candidatures et publications d'auto-entrepreneurs apparaissent.
 */
import { useMemo, useState } from 'react';
import { MOCK_TODAY } from '@/mocks/v2Today';
import {
  Bell,
  UserPlus,
  UserMinus,
  GitBranch,
  Clock,
  BedDouble,
  Check,
  X,
  CalendarDays,
  User,
  Wallet,
  Send,
  AlertTriangle,
} from 'lucide-react';
import type { Mission } from '@/mocks/v2Missions';
import { useV2Ui } from '@/stores/v2UiStore';
import type { JournalEntry, JournalKind } from '@/stores/v2UiStore';
import { useV2Settings, restDaysOf } from '@/stores/v2SettingsStore';
import { useVisibleMissions, effPlaced, effRequired, pendingReleases, effMissions } from './mission/missionStore';
import { useV2People } from '@/stores/v2PeopleStore';
import { replacementsFor } from './planning/replacement';
import { buildAlerts } from './planning/alerts';
import type { AlertTarget } from './planning/alerts';
import { useNavigate, useParams } from 'react-router-dom';
import { parseISO } from './time';

type Kind = 'candidature' | 'desistement' | 'cascade' | 'pointage' | 'repos' | 'alerte';

interface Notif {
  id: string;
  kind: Kind;
  title: string;
  detail: string;
  /** mission à ouvrir (sinon `target` dit où aller sur le planning) */
  missionId?: string;
  target?: AlertTarget;
}

/** « Aujourd'hui » de la maquette. */
const TODAY = MOCK_TODAY;

const day = (iso: string) =>
  parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

const KIND_STYLE: Record<Kind, { icon: typeof Bell; cls: string }> = {
  candidature: { icon: UserPlus, cls: 'bg-se-blue-wash text-se-blue-ink' },
  desistement: { icon: UserMinus, cls: 'bg-se-danger-wash text-se-danger' },
  cascade: { icon: GitBranch, cls: 'bg-se-cascade-wash text-se-cascade-ink' },
  pointage: { icon: Clock, cls: 'bg-se-danger-wash text-se-danger' },
  repos: { icon: BedDouble, cls: 'bg-se-cascade-wash text-se-cascade-ink' },
  alerte: { icon: AlertTriangle, cls: 'bg-se-danger-wash text-se-danger' },
};

/** Historique : une icône par famille de décision. */
const JOURNAL_STYLE: Record<JournalKind, { icon: typeof Bell; cls: string }> = {
  mission: { icon: CalendarDays, cls: 'bg-se-surface-2 text-se-ink' },
  publication: { icon: Send, cls: 'bg-se-blue-wash text-se-blue-ink' },
  personne: { icon: User, cls: 'bg-se-freelance-wash text-se-freelance-ink' },
  paie: { icon: Wallet, cls: 'bg-se-success-wash text-se-success' },
};

/** « 14:32 » aujourd'hui, sinon « lun. 2 nov. 14:32 ». */
function journalTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? time
    : `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

/** Les notifications du moment, calculées depuis les missions. */
export function useNotifications(): Notif[] {
  const freelanceOnly = useV2Ui((s) => s.mode) === 'freelance';
  const missions = useVisibleMissions(freelanceOnly);
  const staff = useV2Settings((s) => s.staff);
  const notifyBeforeSwitch = useV2Settings((s) => s.cascade.notifyBeforeSwitch);
  const pool = useV2Settings((s) => s.pool);
  const needs = useV2Settings((s) => s.postes);
  const restRules = useV2Settings((s) => s.restRules);
  const statuses = useV2People((s) => s.statuses);
  const absences = useV2People((s) => s.absences);
  const exceptions = useV2Settings((s) => s.exceptions);
  const kinds = useV2Ui((s) => s.notifPrefs.kinds);

  return useMemo(() => {
    const list: Notif[] = [];
    // Alertes du planning (48 h, semaine pas envoyée, heures, repos, souhaits, jour fermé) : en tête.
    if (!freelanceOnly) {
      buildAlerts({ today: TODAY, staff, pool, restRules, absences, exceptions }).forEach((a) =>
        list.push({
          id: `alert:${a.key}:${a.count}`,
          kind: 'alerte',
          title: a.title,
          detail: a.detail,
          missionId: a.target.kind === 'mission' ? a.target.missionId : undefined,
          target: a.target,
        }),
      );
    }
    missions.forEach((m: Mission) => {
      const placed = effPlaced(m);
      // Candidatures : quelqu'un se propose et n'est pas encore placé.
      m.candidates
        .filter((c) => c.note === 'Se propose' && !placed.some((p) => p.id === c.id))
        .filter((c) => !freelanceOnly || c.kind === 'freelance')
        .forEach((c) =>
          list.push({
            id: `cand:${m.id}:${c.id}`,
            kind: 'candidature',
            title: `${c.name} se propose`,
            detail: `${m.poste} · ${day(m.date)} · ${m.start}–${m.end}`,
            missionId: m.id,
          }),
        );
      if (freelanceOnly) return;
      // Shift relâché : un salarié / extra s'est désisté, la place est à republier.
      pendingReleases(m).forEach((r) => {
        const left = Math.max(effRequired(m) - placed.filter((p) => !p.suggested).length, 0);
        // Qui peut remplacer tout de suite (fixes libres, puis extras) : on le dit dès la cloche.
        const { fixes, extras } = replacementsFor({
          mission: m,
          allMissions: effMissions(),
          needs,
          staff,
          pool,
          statuses,
          absences,
          restRules,
          exclude: [r.name],
        });
        const n = fixes.length + extras.length;
        list.push({
          id: `rel:${m.id}:${r.personId}`,
          kind: 'desistement',
          title: `${r.name} a relâché son shift${r.reason ? ` · ${r.reason.toLowerCase()}` : ''}`,
          detail: `${m.poste} · ${day(m.date)} · ${m.start}–${m.end} · ${left} place${left > 1 ? 's' : ''} · ${
            n > 0
              ? `${n} remplaçant${n > 1 ? 's' : ''} possible${n > 1 ? 's' : ''}${fixes[0] ? ` (${fixes[0].name}…)` : ''}`
              : 'personne de libre, à republier'
          }`,
          missionId: m.id,
        });
      });
      // Cascade : bascule programmée vers les auto-entrepreneurs (si Réglages › Cascade › « Me prévenir »).
      if (notifyBeforeSwitch && m.coverage === 'cascade' && m.cascadeFreelanceAt) {
        list.push({
          id: `casc:${m.id}`,
          kind: 'cascade',
          title: `Bascule vers les auto-entrepreneurs à ${m.cascadeFreelanceAt}`,
          detail: `${m.poste} · ${day(m.date)} · personne chez vos salariés ni extras`,
          missionId: m.id,
        });
      }
      // Pointage manquant sur une mission passée (salariés / extras).
      if (m.date < TODAY) {
        placed
          .filter((p) => !p.suggested && p.kind !== 'freelance' && !p.clockIn)
          .forEach((p) =>
            list.push({
              id: `pt:${m.id}:${p.id}`,
              kind: 'pointage',
              title: `Pointage manquant · ${p.name}`,
              detail: `${m.poste} · ${day(m.date)} · à compléter dans le relevé d'heures`,
              missionId: m.id,
            }),
          );
      }
      // Salarié placé un jour de repos.
      placed
        .filter((p) => !p.suggested && p.kind === 'salarie' && restDaysOf(staff, p).includes(parseISO(m.date).getDay()))
        .forEach((p) =>
          list.push({
            id: `rest:${m.id}:${p.id}`,
            kind: 'repos',
            title: `${p.name} placé·e un jour de repos`,
            detail: `${m.poste} · ${day(m.date)}`,
            missionId: m.id,
          }),
        );
    });
    // Les familles coupées dans Réglages › Notifications n'apparaissent pas.
    return list.filter((n) => kinds[n.kind]);
  }, [
    missions,
    staff,
    pool,
    needs,
    restRules,
    statuses,
    absences,
    exceptions,
    notifyBeforeSwitch,
    freelanceOnly,
    kinds,
  ]);
}

type BellTab = 'todo' | 'history';

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<BellTab>('todo');
  const notifs = useNotifications();
  const journal = useV2Ui((s) => s.journal);
  const read = useV2Ui((s) => s.readNotifications);
  const markRead = useV2Ui((s) => s.markNotificationsRead);
  const requestOpenMission = useV2Ui((s) => s.requestOpenMission);
  const requestPlanningAction = useV2Ui((s) => s.requestPlanningAction);
  const navigate = useNavigate();
  const { locale = 'fr' } = useParams<{ locale: string }>();

  const unread = notifs.filter((n) => !read.includes(n.id));

  // La fenêtre de mission s'ouvre par-dessus l'écran courant, où qu'on soit.
  const goToMission = (missionId: string) => {
    setOpen(false);
    requestOpenMission(missionId);
  };
  const openMission = (n: Notif) => {
    markRead([n.id]);
    if (n.missionId) return goToMission(n.missionId);
    // Une alerte sans mission : le planning s'ouvre sur la bonne fenêtre ou la bonne vue.
    setOpen(false);
    const kind = n.target?.kind;
    if (kind === 'send') requestPlanningAction('send-next');
    else if (kind === 'optimize' || kind === 'personnel') requestPlanningAction(kind);
    navigate(`/${locale}/v2`);
  };
  const openEntry = (e: JournalEntry) => {
    if (e.missionId) goToMission(e.missionId);
  };

  return (
    <>
      <button
        type="button"
        aria-label={unread.length ? `Notifications · ${unread.length} non lues` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="fixed top-4 right-4 z-40 w-10 h-10 rounded-full bg-se-surface border border-se-line grid place-items-center text-se-muted hover:text-se-ink shadow-se"
      >
        <Bell className="w-5 h-5" aria-hidden="true" />
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-se-danger text-white text-[10px] font-bold grid place-items-center">
            {unread.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="dialog"
            aria-label="Notifications"
            className="se-root fixed top-16 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] bg-se-surface border border-se-line rounded-se shadow-se-md overflow-hidden"
          >
            <header className="flex items-center gap-2 px-4 py-3 border-b border-se-line">
              <p className="font-extrabold text-se-ink">Notifications</p>
              {tab === 'todo' && (
                <span className="text-xs text-se-muted">
                  {unread.length === 0 ? 'tout est lu' : `${unread.length} non lue${unread.length > 1 ? 's' : ''}`}
                </span>
              )}
              {tab === 'todo' && unread.length > 0 && (
                <button
                  type="button"
                  onClick={() => markRead(unread.map((n) => n.id))}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-se-blue-ink hover:text-se-blue"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" /> Tout marquer comme lu
                </button>
              )}
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setOpen(false)}
                className={`${tab === 'todo' && unread.length > 0 ? '' : 'ml-auto'} w-7 h-7 grid place-items-center rounded-se-sm hover:bg-se-surface-2 text-se-muted`}
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            {/* À traiter (ce qui attend une action) · Historique (ce que vous avez décidé) */}
            <div role="tablist" aria-label="Notifications" className="flex gap-1 px-3 pt-2 border-b border-se-line">
              {(
                [
                  { key: 'todo', label: 'À traiter', count: unread.length },
                  { key: 'history', label: 'Historique', count: journal.length },
                ] as { key: BellTab; label: string; count: number }[]
              ).map((t) => {
                const on = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setTab(t.key)}
                    className={`px-3 py-2 -mb-px text-sm font-semibold border-b-2 transition-colors ${
                      on ? 'border-se-blue text-se-ink' : 'border-transparent text-se-muted hover:text-se-ink'
                    }`}
                  >
                    {t.label}
                    {t.count > 0 && <span className="ml-1.5 text-xs font-normal text-se-muted">{t.count}</span>}
                  </button>
                );
              })}
            </div>

            {tab === 'history' ? (
              journal.length === 0 ? (
                <p className="px-4 py-8 text-sm text-se-muted text-center">
                  Aucune décision pour l'instant. Vos actions (placements, annulations, candidatures, exports)
                  apparaîtront ici.
                </p>
              ) : (
                <ul className="max-h-[70vh] overflow-y-auto divide-y divide-se-line">
                  {journal.map((e) => {
                    const { icon: Icon, cls } = JOURNAL_STYLE[e.kind];
                    const Row = e.missionId ? 'button' : 'div';
                    return (
                      <li key={e.id}>
                        <Row
                          {...(e.missionId ? { type: 'button' as const, onClick: () => openEntry(e) } : {})}
                          className={`w-full flex items-start gap-3 px-4 py-3 text-left ${
                            e.missionId ? 'hover:bg-se-surface-2' : ''
                          }`}
                        >
                          <span className={`w-8 h-8 rounded-se-sm grid place-items-center shrink-0 ${cls}`}>
                            <Icon className="w-4 h-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-se-ink truncate">{e.label}</span>
                            {e.detail && <span className="block text-xs text-se-muted truncate">{e.detail}</span>}
                          </span>
                          <span className="text-[11px] text-se-muted whitespace-nowrap mt-0.5">
                            {journalTime(e.at)}
                          </span>
                        </Row>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : notifs.length === 0 ? (
              <p className="px-4 py-8 text-sm text-se-muted text-center">Rien à signaler. Tout est en ordre.</p>
            ) : (
              <ul className="max-h-[70vh] overflow-y-auto divide-y divide-se-line">
                {notifs.map((n) => {
                  const { icon: Icon, cls } = KIND_STYLE[n.kind];
                  const isRead = read.includes(n.id);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openMission(n)}
                        className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-se-surface-2 ${isRead ? 'opacity-60' : ''}`}
                      >
                        <span className={`w-8 h-8 rounded-se-sm grid place-items-center shrink-0 ${cls}`}>
                          <Icon className="w-4 h-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-se-ink truncate">{n.title}</span>
                          <span className="block text-xs text-se-muted truncate">{n.detail}</span>
                        </span>
                        {!isRead && (
                          <span className="mt-1.5 w-2 h-2 rounded-full bg-se-blue shrink-0" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}
