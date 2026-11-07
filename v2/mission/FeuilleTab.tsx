/**
 * Onglet Relevé d'heures de la fenêtre de mission.
 *   Gauche  — une ligne par personne : prévu · pointé · écart.
 *             Salariés & extras : heures POINTÉES modifiables (le gestionnaire
 *             ajuste l'arrivée / le départ, l'écart se recalcule).
 *             Auto-entrepreneurs : lecture seule, facturés au devis.
 *   Droite  — total prévu vs réel + facture de la mission.
 *
 * Les lignes sont celles du relevé partagé (missionStore) : ce qu'on saisit ou
 * valide ici se retrouve tel quel dans Factures & heures, et inversement.
 *
 * Garde-fou : valider des heures qui s'écartent de plus de 30 min du prévu
 * engage de l'argent (paie / facture) → on confirme d'abord.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, Clock, Lock, FileText } from 'lucide-react';
import type { Mission, MissionPlaced } from '@/mocks/v2Missions';
import { personKindStyle } from '../coverage';
import { minutesBetween, formatDuration, formatDelta, missionMinutes, missionTimeLabel } from '../time';
import { ConfirmGuard } from '../publish/ConfirmGuard';
import { effPlaced, effTimesheet, writeTimesheet, useMissionStore } from './missionStore';

/** Au-delà, l'écart doit être confirmé avant de valider les heures. */
const ECART_MAX_MIN = 30;

interface Row {
  person: MissionPlaced;
  /** salarié / extra : heures saisissables ; auto-entrepreneur : non */
  editable: boolean;
  plannedMin: number;
  clockIn: string;
  clockOut: string;
  /** minutes réellement comptées (null si éditable et incomplet) */
  workedMin: number | null;
  ecartMin: number | null;
  /** auto-entrepreneur : facturé au devis, ne bloque pas la validation */
  billedOnQuote: boolean;
  /** ligne validée (relevé partagé) → verrouillée */
  approved: boolean;
}

function buildRows(mission: Mission): Row[] {
  // Coupure comprise : la durée prévue est celle de toute la mission.
  const plannedMin = missionMinutes(mission);
  return effPlaced(mission)
    .filter((p) => !p.suggested)
    .map((person) => {
      const line = effTimesheet(mission, person);
      const clockIn = line.in ?? '';
      const clockOut = line.out ?? '';
      if (person.kind === 'freelance') {
        // Facturé au devis : on compte le prévu, pas d'écart, ne bloque rien.
        return {
          person,
          editable: false,
          plannedMin,
          clockIn,
          clockOut,
          workedMin: plannedMin,
          ecartMin: null,
          billedOnQuote: true,
          approved: line.approved,
        };
      }
      const workedMin = clockIn && clockOut ? minutesBetween(clockIn, clockOut) : null;
      return {
        person,
        editable: true,
        plannedMin,
        clockIn,
        clockOut,
        workedMin,
        ecartMin: workedMin === null ? null : workedMin - plannedMin,
        billedOnQuote: false,
        approved: line.approved,
      };
    });
}

export function FeuilleTab({ mission }: { mission: Mission }) {
  useMissionStore(); // les lignes suivent le relevé partagé en direct
  const [guard, setGuard] = useState(false);

  const rows = buildRows(mission);
  const toAccount = rows.filter((r) => !r.billedOnQuote); // salariés & extras
  const pointed = toAccount.filter((r) => r.workedMin !== null);
  const flagged = pointed.filter((r) => Math.abs(r.ecartMin ?? 0) > ECART_MAX_MIN && !r.approved);
  const allPointed = rows.length > 0 && pointed.length === toAccount.length;
  // Validé = toutes les lignes du relevé sont validées (ici ou dans Factures & heures).
  const validated = rows.length > 0 && rows.every((r) => r.approved);

  const setTime = (person: MissionPlaced, field: 'in' | 'out', value: string) =>
    writeTimesheet(mission, person, { [field]: value || undefined });

  const approveAll = () => rows.forEach((r) => !r.approved && writeTimesheet(mission, r.person, { approved: true }));
  const validate = () => {
    if (flagged.length > 0) {
      setGuard(true);
      return;
    }
    approveAll();
  };

  const prevuTotal = rows.reduce((s, r) => s + r.plannedMin, 0);
  const reelTotal = rows.reduce((s, r) => s + (r.billedOnQuote ? r.plannedMin : (r.workedMin ?? 0)), 0);

  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-se-line min-h-[480px]">
      {/* ── Lignes ───────────────────────────────────────────── */}
      <section className="p-4">
        <p className="se-eyebrow mb-3">Prévu · pointé · écart</p>

        {rows.length === 0 ? (
          <p className="text-sm text-se-muted">Personne de placé sur ce créneau.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <TimesheetRow
                key={r.person.id}
                row={r}
                planned={missionTimeLabel(mission)}
                onChange={(field, value) => setTime(r.person, field, value)}
              />
            ))}
          </ul>
        )}

        {/* Validation des heures — une seule action */}
        {rows.length > 0 && (
          <div className="mt-4 pt-3 border-t border-se-line">
            {validated ? (
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-se-success">
                <Check className="w-4 h-4" aria-hidden="true" /> Heures validées
              </p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={validate}
                  disabled={!allPointed}
                  className="w-full py-2.5 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Valider les heures
                </button>
                {!allPointed && (
                  <p className="text-xs text-se-muted mt-2">
                    En attente du pointage de {toAccount.length - pointed.length} personne
                    {toAccount.length - pointed.length > 1 ? 's' : ''}.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {/* ── Totaux + facture ────────────────────────────────── */}
      <section className="p-4 bg-se-surface-2/50">
        <p className="se-eyebrow mb-3">Relevé d'heures</p>
        <dl className="text-sm space-y-2">
          <Line label="Prévu">{formatDuration(prevuTotal)}</Line>
          <Line label="Réel">
            {formatDuration(reelTotal)}
            {pointed.length < toAccount.length && (
              <span className="text-xs text-se-muted">
                {' '}
                ({pointed.length}/{toAccount.length} pointés)
              </span>
            )}
          </Line>
        </dl>

        <p className="se-eyebrow mt-5 mb-3">Facture</p>
        <div className="rounded-se border border-se-line bg-se-surface p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-se-muted">
              {typeof mission.quote === 'number' ? 'Auto-entrepreneur engagé' : 'Coût de la mission'}
            </span>
            <span className="text-xl font-extrabold font-display text-se-ink">
              {typeof mission.quote === 'number' ? `${mission.quote} € TTC` : `${mission.estimatedCost} €`}
            </span>
          </div>
          <p className="text-xs text-se-muted mt-1">
            {validated ? 'Heures validées — à exporter depuis Factures & heures.' : 'Facturé sur les heures validées.'}
          </p>
        </div>
      </section>

      {/* Garde-fou écart > 30 min */}
      {guard && (
        <ConfirmGuard
          title="Écart avec le prévu"
          tone="warning"
          confirmLabel="Valider ces heures"
          onCancel={() => setGuard(false)}
          onConfirm={() => {
            approveAll();
            setGuard(false);
          }}
        >
          <p>Des heures pointées s'écartent de plus de 30 min du prévu :</p>
          <ul className="list-disc pl-5 text-se-ink">
            {flagged.map((r) => (
              <li key={r.person.id}>
                <strong>{r.person.name}</strong> — {formatDelta(r.ecartMin ?? 0)}
              </li>
            ))}
          </ul>
          <p className="text-se-muted">Valider engage la paie et la facture sur ces heures.</p>
        </ConfirmGuard>
      )}
    </div>
  );
}

function TimesheetRow({
  row,
  planned,
  onChange,
}: {
  row: Row;
  planned: string;
  onChange: (field: 'in' | 'out', value: string) => void;
}) {
  const k = personKindStyle[row.person.kind];
  const { locale = 'fr' } = useParams<{ locale: string }>();

  return (
    <li className="rounded-se-sm border border-se-line p-3">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${k.dot}`} aria-hidden="true" />
        <span className="font-semibold text-se-ink">{row.person.name}</span>
        <span className={`se-badge ${k.wash} ${k.text} ml-1`} style={{ height: 18 }}>
          {k.label}
        </span>
        <span className="ml-auto">
          <StatusBadge row={row} />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-2.5 text-sm">
        <div>
          <p className="text-xs text-se-muted mb-0.5">Prévu</p>
          <p className="text-se-ink inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-se-muted" aria-hidden="true" />
            {planned}
          </p>
        </div>
        <div>
          <p className="text-xs text-se-muted mb-0.5">Pointé</p>
          {row.editable ? (
            <div className="flex items-center gap-1">
              <input
                type="time"
                value={row.clockIn}
                disabled={row.approved}
                onChange={(e) => onChange('in', e.target.value)}
                aria-label={`Arrivée de ${row.person.name}`}
                className={timeCls}
              />
              <span className="text-se-muted" aria-hidden="true">
                –
              </span>
              <input
                type="time"
                value={row.clockOut}
                disabled={row.approved}
                onChange={(e) => onChange('out', e.target.value)}
                aria-label={`Départ de ${row.person.name}`}
                className={timeCls}
              />
              {row.approved && <Lock className="w-3.5 h-3.5 text-se-muted" aria-hidden="true" />}
            </div>
          ) : (
            <div className="space-y-1">
              <p className="inline-flex items-center gap-1 text-se-ink">
                <Lock className="w-3.5 h-3.5 text-se-muted" aria-hidden="true" /> au devis
                {typeof row.person.cost === 'number' && (
                  <>
                    {' · '}
                    <span className="font-semibold">{row.person.cost} € TTC</span>
                  </>
                )}
              </p>
              <Link
                to={`/${locale}/v2/factures`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-se-blue-ink hover:text-se-blue"
              >
                <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Voir la facture
              </Link>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function StatusBadge({ row }: { row: Row }) {
  if (row.approved) {
    return (
      <span className="se-badge bg-se-success-wash text-se-success" style={{ height: 18 }}>
        validé
      </span>
    );
  }
  if (row.billedOnQuote) {
    return (
      <span className="se-badge bg-se-freelance-wash text-se-freelance-ink" style={{ height: 18 }}>
        au devis
      </span>
    );
  }
  if (row.workedMin === null) {
    return (
      <span className="se-badge bg-se-surface-2 text-se-muted" style={{ height: 18 }}>
        à saisir
      </span>
    );
  }
  const flagged = Math.abs(row.ecartMin ?? 0) > ECART_MAX_MIN;
  return (
    <span
      className={`se-badge ${
        flagged
          ? 'bg-se-cascade-wash text-se-cascade-ink'
          : row.ecartMin === 0
            ? 'bg-se-success-wash text-se-success'
            : 'bg-se-surface-2 text-se-muted'
      }`}
      style={{ height: 18 }}
    >
      {formatDelta(row.ecartMin ?? 0)}
    </span>
  );
}

const timeCls =
  'h-8 w-[84px] rounded-se-sm border border-se-line bg-se-surface px-2 text-sm text-se-ink focus:outline-none focus:border-se-blue disabled:opacity-60 disabled:cursor-not-allowed';

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-se-muted">{label}</dt>
      <dd className="font-semibold text-se-ink">{children}</dd>
    </div>
  );
}
