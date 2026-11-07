/**
 * Impression du planning de la semaine — une page A4 paysage, sept colonnes
 * (lun → dim), une carte par mission avec le poste, les horaires, le lieu et
 * les personnes placées (S salarié · E extra · A auto-entrepreneur).
 * Rendu dans un cadre invisible puis boîte d'impression → papier ou PDF.
 */
import type { Mission } from '@/mocks/v2Missions';
import { effPlaced, effPlacedCount, effRequired } from '../mission/missionStore';
import { missionTimeLabel, parseISO, toISO } from '../time';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LETTER = { salarie: 'S', extra: 'E', freelance: 'A' } as const;

export function printWeekPlanning({
  weekStart,
  missions,
  establishment,
}: {
  weekStart: string;
  missions: Mission[];
  establishment: string;
}) {
  const start = parseISO(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toISO(d);
  });
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => parseISO(iso).toLocaleDateString('fr-FR', opts);
  const title = `Planning · semaine du ${fmt(days[0], { day: 'numeric', month: 'long' })} au ${fmt(days[6], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`;

  const weekMissions = missions.filter((m) => days.includes(m.date));
  const placed = weekMissions.reduce((s, m) => s + effPlacedCount(m), 0);
  const required = weekMissions.reduce((s, m) => s + effRequired(m), 0);

  const card = (m: Mission) => {
    const p = effPlacedCount(m);
    const r = effRequired(m);
    const tone = p <= 0 ? '#a3123c' : p < r ? '#f28c28' : '#136c36';
    const people = effPlaced(m)
      .filter((x) => !x.suggested)
      .map((x) => `<li><b>${LETTER[x.kind]}</b> ${esc(x.name)}</li>`)
      .join('');
    return `<div class="card">
      <div class="band" style="background:${tone}"><span>${esc(m.poste)}</span><span>${p}/${r}</span></div>
      <div class="body">
        <div class="time">${missionTimeLabel(m)}</div>
        <div class="place">${esc(m.establishment)}</div>
        ${people ? `<ul>${people}</ul>` : '<div class="empty">Personne pour l’instant</div>'}
        ${r - p > 0 ? `<div class="missing">${r - p} place${r - p > 1 ? 's' : ''} à pourvoir</div>` : ''}
      </div>
    </div>`;
  };

  const columns = days
    .map((d) => {
      const list = weekMissions.filter((m) => m.date === d).sort((a, b) => a.start.localeCompare(b.start));
      return `<td>
        <div class="day"><span class="wd">${fmt(d, { weekday: 'short' })}</span> <span class="num">${parseISO(d).getDate()}</span></div>
        ${list.map(card).join('') || '<div class="none">—</div>'}
      </td>`;
    })
    .join('');

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Plus Jakarta Sans', -apple-system, 'Segoe UI', sans-serif; color: #121417; margin: 0; font-size: 11px; }
  header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
  h1 { font-size: 16px; margin: 0; }
  .sub { color: #5a6473; font-size: 11px; }
  .brand { font-weight: 800; color: #2250f4; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td { vertical-align: top; border: 1px solid #e7e5df; padding: 6px; width: 14.28%; }
  .day { display: flex; align-items: baseline; gap: 6px; margin-bottom: 6px; }
  .wd { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #5a6473; font-weight: 700; }
  .num { font-size: 16px; font-weight: 800; }
  .card { border: 1px solid #e7e5df; border-radius: 8px; overflow: hidden; margin-bottom: 6px; break-inside: avoid; }
  .band { display: flex; justify-content: space-between; padding: 3px 6px; color: #fff; font-weight: 700; font-size: 10.5px; }
  .body { padding: 5px 6px; }
  .time { font-weight: 600; }
  .place { color: #5a6473; font-size: 10px; margin-bottom: 3px; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { font-size: 10.5px; line-height: 1.5; }
  li b { display: inline-block; width: 13px; height: 13px; border-radius: 50%; background: #121417; color: #fff; font-size: 8px; text-align: center; line-height: 13px; margin-right: 3px; }
  .empty, .none { color: #9aa3b2; font-size: 10px; }
  .missing { color: #a3123c; font-weight: 700; font-size: 10px; margin-top: 3px; }
  footer { margin-top: 8px; color: #5a6473; font-size: 10px; display: flex; justify-content: space-between; }
</style></head><body>
  <header>
    <div><h1>${esc(title)}</h1><div class="sub">${esc(establishment)} · ${weekMissions.length} mission${weekMissions.length > 1 ? 's' : ''} · ${placed}/${required} placés</div></div>
    <div class="brand">Shift Express</div>
  </header>
  <table><tr>${columns}</tr></table>
  <footer><span>S salarié · E extra · A auto-entrepreneur · rouge = personne · orange = incomplet · vert = complet</span><span>Imprimé le ${new Date().toLocaleDateString('fr-FR')}</span></footer>
</body></html>`;

  const frame = document.createElement('iframe');
  frame.setAttribute('title', 'Impression du planning');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  frame.srcdoc = html;
  const cleanup = () => frame.remove();
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return cleanup();
    win.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      win.focus();
      win.print();
    }, 150);
    setTimeout(cleanup, 120_000);
  };
  document.body.appendChild(frame);
}
