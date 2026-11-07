/**
 * Onglet Compteurs — par personne, sur la période : heures faites face au
 * contrat, heures supplémentaires, absences, congés, brut estimé. Une ligne par
 * salarié puis par extra ; un clic sur la ligne déplie la semaine par semaine
 * (c'est à la semaine que les heures sup se comptent). En haut à droite, un
 * seul bouton : l'export paie (Excel), qui reprend exactement ces lignes.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, Download, Check } from 'lucide-react';
import { useV2Settings } from '@/stores/v2SettingsStore';
import { useV2People } from '@/stores/v2PeopleStore';
import { useV2Ui } from '@/stores/v2UiStore';
import { Avatar } from '../Avatar';
import { personKindStyle } from '../coverage';
import { useMissionStore, effMissions } from '../mission/missionStore';
import { exportPaie } from '../export';
import { addDays, parseISO } from '../time';
import { buildCounters, absencesPhrase, LEAVE_DAYS_PER_YEAR, OVERTIME_RATE } from './counters';
import type { Counter } from './counters';
import type { DateRange } from './PeriodPicker';

interface Props {
  range: DateRange;
  today: string;
  periode: string;
}

const fmtDay = (iso: string) => parseISO(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const h = (n: number) => `${n} h`;

export function CountersTab({ range, today, periode }: Props) {
  const version = useMissionStore();
  const staff = useV2Settings((s) => s.staff);
  const pool = useV2Settings((s) => s.pool);
  const absences = useV2People((s) => s.absences);
  const log = useV2Ui((s) => s.log);
  const [open, setOpen] = useState<string | null>(null);
  const [exported, setExported] = useState<number | null>(null);

  const counters = useMemo(() => {
    void version;
    return buildCounters({ range, today, staff, pool, absences, missions: effMissions() });
  }, [range, today, staff, pool, absences, version]);

  const totals = counters.reduce(
    (t, c) => ({ hours: t.hours + c.hours, overtime: t.overtime + c.overtime, gross: t.gross + c.gross }),
    { hours: 0, overtime: 0, gross: 0 },
  );
  const withOvertime = counters.filter((c) => c.overtime > 0).length;

  const doExport = () => {
    const n = exportPaie(counters, periode);
    setExported(n);
    log({ kind: 'paie', label: 'Export paie téléchargé (Excel)', detail: `${periode} · ${n} personnes` });
  };

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div>
          <p className="se-eyebrow">Compteurs par personne</p>
          <p className="text-sm text-se-muted">
            {counters.length} personne{counters.length > 1 ? 's' : ''} · {Math.round(totals.hours * 10) / 10} h faites
            {totals.overtime > 0 ? (
              <span className="text-se-cascade-ink font-semibold">
                {' '}
                · {Math.round(totals.overtime * 10) / 10} h sup chez {withOvertime} personne
                {withOvertime > 1 ? 's' : ''}
              </span>
            ) : (
              ' · aucune heure sup'
            )}{' '}
            · {totals.gross} € brut estimé
          </p>
        </div>
        <button
          type="button"
          onClick={doExport}
          className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
        >
          <Download className="w-4 h-4" aria-hidden="true" /> Export paie (Excel)
        </button>
      </div>

      {exported !== null && (
        <p className="mb-3 text-sm text-se-success bg-se-success-wash rounded-se-sm px-3 py-2 inline-flex items-center gap-1.5">
          <Check className="w-4 h-4" aria-hidden="true" />
          Fichier paie téléchargé · {exported} ligne{exported > 1 ? 's' : ''} · {periode}. Le fichier reste sur votre
          poste.
        </p>
      )}

      <div className="bg-se-surface border border-se-line rounded-se shadow-se overflow-hidden">
        <table className="w-full table-fixed text-[13px]">
          <colgroup>
            <col style={{ width: '26%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '12%' }} />
          </colgroup>
          <thead>
            <tr className="border-b border-se-line se-eyebrow text-left align-bottom">
              <th className="px-3 py-2.5">Personne</th>
              <th className="px-2 py-2.5">Heures faites / contrat</th>
              <th className="px-2 py-2.5">Heures sup</th>
              <th className="px-2 py-2.5">Absences</th>
              <th className="px-2 py-2.5">Congés payés</th>
              <th className="px-2 py-2.5 text-right">Brut estimé</th>
            </tr>
          </thead>
          <tbody>
            {counters.map((c) => (
              <CounterRow key={c.id} c={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} />
            ))}
            {counters.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-se-muted">
                  Aucun salarié ni extra dans Réglages › Personnel.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-se-muted">
        Heures sup : ce qui dépasse les heures hebdo du contrat, semaine par semaine (majorées{' '}
        {Math.round((OVERTIME_RATE - 1) * 100)} % dans le brut estimé). Absences : jours ouvrés de la personne sur la
        période. Congés : {LEAVE_DAYS_PER_YEAR} j acquis par an depuis le 1er juin, moins les jours pris. Cliquez une
        ligne pour voir la semaine par semaine.
      </p>
    </section>
  );
}

function CounterRow({ c, open, onToggle }: { c: Counter; open: boolean; onToggle: () => void }) {
  const k = personKindStyle[c.kind];
  const under = c.kind === 'salarie' && c.hours < c.contractHours;
  const abs = absencesPhrase(c.absences);
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-se-line-soft cursor-pointer hover:bg-se-surface-2/60 ${open ? 'bg-se-surface-2/40' : ''}`}
      >
        <td className="px-3 py-2.5">
          <span className="flex items-center gap-2.5 min-w-0">
            <Avatar person={c} size={28} />
            <span className="min-w-0">
              <span className="block font-semibold text-se-ink truncate">{c.name}</span>
              <span className={`block text-[11px] ${k.text}`}>
                {k.label} <span className="text-se-muted">· {c.contract}</span>
              </span>
            </span>
            <ChevronDown
              className={`w-4 h-4 ml-auto shrink-0 text-se-muted transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </span>
        </td>
        <td className="px-2 py-2.5 tabular-nums">
          <span className={`font-semibold ${under ? 'text-se-cascade-ink' : 'text-se-ink'}`}>{h(c.hours)}</span>
          {c.kind === 'salarie' && <span className="text-se-muted"> / {h(c.contractHours)}</span>}
        </td>
        <td className="px-2 py-2.5 tabular-nums">
          {c.overtime > 0 ? (
            <span className="font-semibold text-se-cascade-ink">+{h(c.overtime)}</span>
          ) : (
            <span className="text-se-muted">—</span>
          )}
        </td>
        <td className="px-2 py-2.5 text-se-ink truncate" title={abs}>
          {abs || <span className="text-se-muted">—</span>}
        </td>
        <td className="px-2 py-2.5 tabular-nums">
          {c.kind === 'salarie' ? (
            <>
              <span className="font-semibold text-se-ink">{c.leaveLeft} j</span>
              <span className="text-se-muted"> restants · {c.leaveTaken} pris</span>
            </>
          ) : (
            <span className="text-se-muted">—</span>
          )}
        </td>
        <td className="px-2 py-2.5 text-right tabular-nums font-semibold text-se-ink">{c.gross} €</td>
      </tr>
      {open && (
        <tr className="border-b border-se-line-soft bg-se-surface-2/30">
          <td colSpan={6} className="px-3 py-2.5">
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 text-xs">
              {c.weeks.map((w) => (
                <li key={w.weekStart} className="flex items-baseline gap-2 tabular-nums">
                  <span className="text-se-muted w-32 shrink-0">
                    du {fmtDay(w.weekStart)} au {fmtDay(addDays(w.weekStart, 6))}
                  </span>
                  <span className="text-se-ink font-semibold">{h(w.hours)}</span>
                  {c.kind === 'salarie' && <span className="text-se-muted">/ {h(w.contract)}</span>}
                  {w.overtime > 0 && <span className="text-se-cascade-ink font-semibold">+{h(w.overtime)} sup</span>}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-se-muted">
              Taux horaire {c.hourlyRate} € brut · {c.normalHours} h normales
              {c.overtime > 0 ? ` + ${c.overtime} h sup majorées` : ''} = {c.gross} € brut estimé.
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
