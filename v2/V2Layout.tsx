/**
 * Coquille de l'espace client v2 (refonte).
 * Écrans : Planning (accueil) · Tableau de bord · Messages · Factures & heures · Réglages.
 * Thème clair (jeu de tokens `se-*`), nav latérale sobre, un seul chemin par
 * fonction. Montée en parallèle de l'app actuelle sous `/:locale/v2` le temps
 * de la migration ; deviendra la racine à l'étape « suppressions ».
 */
import { NavLink, Outlet } from 'react-router-dom';
import { CalendarDays, LayoutDashboard, Receipt, Settings, MessageSquare } from 'lucide-react';
import { NotificationsBell } from '@/pages/v2/NotificationsPanel';
import { PendingReviewsDialog } from '@/pages/v2/people/PendingReviewsDialog';
import { MissionWindowHost } from '@/pages/v2/mission/MissionWindowHost';
import { cn } from '@/lib/utils';
import { useV2Ui } from '@/stores/v2UiStore';

interface NavEntry {
  to: string;
  label: string;
  icon: typeof CalendarDays;
  end?: boolean;
}

export function V2Layout() {
  const mode = useV2Ui((s) => s.mode);

  // En Freelance uniquement : même structure (Planning · Factures · Réglages),
  // sans Personnes ni relevé d'heures — pas de gestion d'équipe.
  const NAV: NavEntry[] = [
    { to: '', label: 'Planning', icon: CalendarDays, end: true },
    { to: 'tableau-de-bord', label: 'Tableau de bord', icon: LayoutDashboard },
    { to: 'messages', label: 'Messages', icon: MessageSquare },
    { to: 'factures', label: mode === 'freelance' ? 'Factures' : 'Factures & heures', icon: Receipt },
    { to: 'reglages', label: 'Réglages', icon: Settings },
  ];

  return (
    <div className="se-root min-h-screen flex">
      {/* ── Barre latérale ──────────────────────────────────── */}
      <aside className="hidden md:flex w-60 flex-col border-r border-se-line bg-se-surface">
        <div className="h-16 flex items-center px-5 border-b border-se-line">
          <span className="font-display font-extrabold text-lg tracking-tight text-se-ink">Shift Express</span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to || 'planning'}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-se-sm text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-se-blue-wash text-se-blue-ink'
                    : 'text-se-muted hover:bg-se-surface-2 hover:text-se-ink',
                )
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-se-line">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-se-blue text-white grid place-items-center text-xs font-bold">
              AM
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-se-ink truncate">Alex Martin</p>
              <p className="text-xs text-se-muted truncate">Brasserie du Centre</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Zone principale ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Barre mobile (nav condensée) */}
        <div className="md:hidden flex items-center gap-1 overflow-x-auto border-b border-se-line bg-se-surface px-2 py-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to || 'planning-m'}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-se-sm text-xs font-semibold whitespace-nowrap',
                  isActive ? 'bg-se-blue-wash text-se-blue-ink' : 'text-se-muted',
                )
              }
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Cloche notifications : candidatures, cascade, pointages, repos — ouvre la mission */}
      <NotificationsBell />
      {/* À la connexion : évaluer les auto-entrepreneurs des missions terminées */}
      <PendingReviewsDialog />
      {/* La fenêtre de mission s'ouvre ici, par-dessus n'importe quel écran */}
      <MissionWindowHost />
    </div>
  );
}
