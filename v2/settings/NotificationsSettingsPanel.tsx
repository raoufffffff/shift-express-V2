/**
 * Notifications — de quoi veut-on être prévenu, et par quel canal.
 * Cinq familles (candidatures, désistements, cascade, pointage, repos), deux canaux
 * (push, e-mail) et le silence la nuit. Ce qu'on coupe disparaît de la cloche.
 */
import {
  UserPlus,
  UserMinus,
  GitBranch,
  Clock,
  BedDouble,
  Smartphone,
  Mail,
  MoonStar,
  AlertTriangle,
} from 'lucide-react';
import { useV2Ui } from '@/stores/v2UiStore';
import type { NotifKind } from '@/stores/v2UiStore';
import { Drawer } from './Drawer';
import { SettingRow, Toggle } from './controls';

const KINDS: { key: NotifKind; icon: typeof UserPlus; label: string; hint: string; freelance: boolean }[] = [
  {
    key: 'candidature',
    icon: UserPlus,
    label: 'Candidatures',
    hint: 'Quelqu’un se propose sur un créneau',
    freelance: true,
  },
  {
    key: 'desistement',
    icon: UserMinus,
    label: 'Shifts relâchés',
    hint: 'Un salarié ou un extra se désiste : la place est à republier',
    freelance: false,
  },
  {
    key: 'cascade',
    icon: GitBranch,
    label: 'Cascade',
    hint: 'Bascule vers les auto-entrepreneurs, 1 h avant',
    freelance: false,
  },
  {
    key: 'pointage',
    icon: Clock,
    label: 'Pointages manquants',
    hint: 'Une arrivée ou une sortie non renseignée sur une mission passée',
    freelance: false,
  },
  {
    key: 'repos',
    icon: BedDouble,
    label: 'Jours de repos',
    hint: 'Un salarié placé un de ses jours de repos',
    freelance: false,
  },
  {
    key: 'alerte',
    icon: AlertTriangle,
    label: 'Alertes du planning',
    hint: 'Places à pourvoir sous 48 h, semaine pas envoyée, heures dépassées, souhaits non respectés',
    freelance: false,
  },
];

export function NotificationsSettingsPanel({ onClose }: { onClose: () => void }) {
  const prefs = useV2Ui((s) => s.notifPrefs);
  const setPrefs = useV2Ui((s) => s.setNotifPrefs);
  const setKind = useV2Ui((s) => s.setNotifKind);
  const freelanceOnly = useV2Ui((s) => s.mode) === 'freelance';
  const kinds = KINDS.filter((k) => !freelanceOnly || k.freelance);

  return (
    <Drawer title="Notifications" subtitle="Ce dont vous voulez être prévenu·e, et par quel canal." onClose={onClose}>
      <p className="se-eyebrow mb-2">Me prévenir pour</p>
      <div className="rounded-se border border-se-line px-4 mb-5">
        {kinds.map(({ key, icon: Icon, label, hint }) => (
          <SettingRow
            key={key}
            label={
              <span className="inline-flex items-center gap-2">
                <Icon className="w-4 h-4 text-se-muted" aria-hidden="true" /> {label}
              </span>
            }
            hint={hint}
          >
            <Toggle on={prefs.kinds[key]} onChange={(on) => setKind(key, on)} label={label} />
          </SettingRow>
        ))}
      </div>

      <p className="se-eyebrow mb-2">Par quel canal</p>
      <div className="rounded-se border border-se-line px-4">
        <SettingRow
          label={
            <span className="inline-flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-se-muted" aria-hidden="true" /> Notification push
            </span>
          }
          hint="Sur votre téléphone, tout de suite"
        >
          <Toggle on={prefs.push} onChange={(push) => setPrefs({ push })} label="Push" />
        </SettingRow>
        <SettingRow
          label={
            <span className="inline-flex items-center gap-2">
              <Mail className="w-4 h-4 text-se-muted" aria-hidden="true" /> E-mail
            </span>
          }
          hint="Un récapitulatif à chaque événement"
        >
          <Toggle on={prefs.email} onChange={(email) => setPrefs({ email })} label="E-mail" />
        </SettingRow>
        <SettingRow
          label={
            <span className="inline-flex items-center gap-2">
              <MoonStar className="w-4 h-4 text-se-muted" aria-hidden="true" /> Silence la nuit
            </span>
          }
          hint="Pas de push entre 22 h et 7 h, sauf cascade"
        >
          <Toggle on={prefs.quietNight} onChange={(quietNight) => setPrefs({ quietNight })} label="Silence la nuit" />
        </SettingRow>
      </div>

      <p className="text-xs text-se-muted mt-4 leading-relaxed">
        La cloche en haut à droite montre les mêmes familles. Ce que vous coupez ici n'y apparaît plus.
      </p>
    </Drawer>
  );
}
