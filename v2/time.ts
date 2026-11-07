/** Petits utilitaires de dates et d'horaires partagés par tous les écrans v2. */

/* ── Dates ISO (AAAA-MM-JJ), en heure locale ───────────────── */

/** "2026-10-31" → Date locale à minuit (jamais de décalage UTC). */
export const parseISO = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
/** Date locale → "2026-10-31". */
export const toISO = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Jour ISO décalé de n jours (négatif accepté). */
export const addDays = (iso: string, n: number): string => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

/* ── Horaires "HH:MM" ──────────────────────────────────────── */

/** Minutes entre deux "HH:MM", en gérant le passage de minuit. */
export function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins;
}

export function hoursBetween(start: string, end: string): number {
  return Math.round((minutesBetween(start, end) / 60) * 10) / 10;
}

/** Un créneau avec, éventuellement, une coupure (seconde partie le même jour). */
export interface Timed {
  start: string;
  end: string;
  split?: { start: string; end: string };
}

/** Minutes travaillées sur le créneau, coupure comprise (un seul shift). */
export function missionMinutes(m: Timed): number {
  return minutesBetween(m.start, m.end) + (m.split ? minutesBetween(m.split.start, m.split.end) : 0);
}
export function missionHours(m: Timed): number {
  return Math.round((missionMinutes(m) / 60) * 10) / 10;
}
/** « 11:00–15:00 · 18:00–23:00 » avec coupure, sinon « 18:00–23:30 ». */
export function missionTimeLabel(m: Timed): string {
  return m.split ? `${m.start}–${m.end} · ${m.split.start}–${m.split.end}` : `${m.start}–${m.end}`;
}

/** "5 h 36" à partir d'un nombre de minutes. */
export function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** "+37 min" / "−12 min" / "à l'heure". */
export function formatDelta(mins: number): string {
  if (mins === 0) return "à l'heure";
  return `${mins > 0 ? '+' : '−'}${Math.abs(mins)} min`;
}
