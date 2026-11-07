/**
 * Fiches PDF des personnes VALIDÉES sur une mission (jamais les suggestions ni
 * les postulants) : une page par personne, ou toutes celles d'une mission,
 * ou toutes celles d'une semaine, mission par mission.
 * Même gabarit que la fiche dans l'app (profileModel.ts) : photo, nom,
 * sous-ligne, étiquettes, trois chiffres clés, puis les blocs dans le même
 * ordre. Coordonnées d'auto-entrepreneur en clair parce que validé·e chez
 * vous ; jamais le tarif horaire d'un salarié.
 */
import type { Mission, MissionPlaced } from '@/mocks/v2Missions';
import { effPlaced } from './missionStore';
import { profileForPrint } from '../people/profileModel';
import type { ProfileData, ProfileSection, Tone } from '../people/profileModel';
import { openPrint, escHtml as esc } from '../printFrame';
import { parseISO } from '../time';

/** Les validés d'une mission : placés pour de bon (pas en pointillé). */
export const validatedOf = (m: Mission): MissionPlaced[] => effPlaced(m).filter((p) => !p.suggested);

const fmtShort = (iso: string) =>
  parseISO(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const photoOf = (p: MissionPlaced) => p.photo ?? `https://i.pravatar.cc/192?u=${encodeURIComponent(p.id)}`;
const stars = (n: number) => `${'★'.repeat(Math.round(n))}${'☆'.repeat(5 - Math.round(n))}`;
const TONE: Record<Tone, string> = {
  ok: '#136c36',
  warn: '#b85c00',
  danger: '#a3123c',
  blue: '#2250f4',
  pink: '#c2004a',
  muted: '#5a6473',
};
const KIND_COLOR = { salarie: '#2250f4', extra: '#6b4fe0', freelance: '#c2004a' } as const;

function sectionHtml(s: ProfileSection): string {
  const head = `<h3>${esc(s.title)}${s.aside ? `<span class="aside">${esc(s.aside)}</span>` : ''}</h3>`;
  switch (s.kind) {
    case 'rows':
      return `${head}<dl>${s.rows
        .map(
          (r) =>
            `<div class="row"><dt>${esc(r.label)}</dt><dd${r.tone ? ` style="color:${TONE[r.tone]}"` : ''}>${esc(r.value)}</dd></div>`,
        )
        .join('')}</dl>${s.text ? `<p class="hint">${esc(s.text)}</p>` : ''}`;
    case 'chips':
      return `${head}<p class="chips">${s.chips
        .map((c) => `<span class="chip${c.tone ? ` ${c.tone}` : ''}">${esc(c.text)}</span>`)
        .join('')}</p>`;
    case 'list':
      if (s.items.length === 0) return `${head}<p class="hint">${esc(s.empty)}</p>`;
      return `${head}<ul class="list">${s.items
        .map(
          (it) =>
            `<li><span class="t"><b>${esc(it.title)}</b>${it.detail ? ` · ${esc(it.detail)}` : ''}</span>${
              it.badge ? `<span class="badge" style="color:${TONE[it.badge.tone]}">${esc(it.badge.text)}</span>` : ''
            }${it.when ? `<span class="when">${esc(it.when)}</span>` : ''}</li>`,
        )
        .join('')}</ul>`;
    case 'quotes':
      return `${head}${
        s.average !== undefined
          ? `<p class="avg"><b>${s.average.toFixed(1)}</b> <span class="stars">${stars(s.average)}</span></p>`
          : ''
      }${
        s.quotes.length === 0
          ? '<p class="hint">Pas encore d’avis.</p>'
          : `<ul class="quotes">${s.quotes
              .slice(0, 3)
              .map(
                (q) =>
                  `<li>« ${esc(q.text)} »<span class="by">${q.rating.toFixed(1)} ★ · ${esc(q.by)} · ${fmtShort(q.when)}</span></li>`,
              )
              .join('')}</ul>`
      }`;
    case 'gauge': {
      const pct = s.gauge.max ? Math.min((s.gauge.value / s.gauge.max) * 100, 100) : 0;
      const color = s.gauge.max && s.gauge.value > s.gauge.max ? TONE.danger : TONE.blue;
      return `${head}<p class="gl">${esc(s.gauge.label)}</p>${
        s.gauge.max ? `<div class="bar"><div style="width:${pct}%;background:${color}"></div></div>` : ''
      }<p class="hint">${esc(s.gauge.hint)}</p>`;
    }
    case 'text':
      return s.text ? `${head}<p>${esc(s.text)}</p>` : '';
  }
}

/** Une page : la carte d'identité, puis les blocs. */
function sheet(p: MissionPlaced, data: ProfileData): string {
  const { hero } = data;
  return `<article class="sheet">
    <div class="head">
      <img src="${photoOf(p)}" alt="" width="84" height="84" />
      <h2>${esc(hero.name)}</h2>
      <p class="sub" style="color:${KIND_COLOR[hero.kind]}">${esc(hero.subline)}</p>
      ${hero.tags.length ? `<p class="tags">${hero.tags.map((t) => `<span style="color:${TONE[t.tone]}">${esc(t.text)}</span>`).join('')}</p>` : ''}
      <dl class="stats">${hero.stats.map((s) => `<div><dd>${esc(s.value)}</dd><dt>${esc(s.label)}</dt></div>`).join('')}</dl>
    </div>
    ${data.sections.map(sectionHtml).join('')}
  </article>`;
}

export interface ProfileGroup {
  mission: Mission;
  /** personnes à imprimer (toutes validées) ; par défaut : les validés de la mission */
  people?: MissionPlaced[];
}

/** Imprime (→ PDF) les fiches : une page par personne. Renvoie le nombre de fiches. */
export function printProfiles(groups: ProfileGroup[], title: string): number {
  const sheets = groups.flatMap(({ mission, people: who }) =>
    (who ?? validatedOf(mission)).filter((p) => !p.suggested).map((p) => sheet(p, profileForPrint(p, mission))),
  );
  if (sheets.length === 0) return 0;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Plus Jakarta Sans', -apple-system, 'Segoe UI', sans-serif; color: #121417; margin: 0; font-size: 12px; line-height: 1.45; }
  header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6px; }
  h1 { font-size: 14px; margin: 0; }
  .brand { font-weight: 800; color: #2250f4; }
  .sub-title { color: #5a6473; font-size: 11px; }
  .sheet { break-after: page; max-width: 560px; margin: 0 auto; }
  .sheet:last-child { break-after: auto; }
  .head { text-align: center; padding: 14px 0 10px; }
  .head img { width: 84px; height: 84px; border-radius: 50%; object-fit: cover; background: #e7e5df; }
  h2 { font-size: 22px; margin: 8px 0 0; letter-spacing: -0.02em; }
  .sub { margin: 2px 0 0; font-weight: 600; }
  .tags { margin: 6px 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
  .tags span + span::before { content: ' · '; color: #9aa3b2; }
  .stats { display: grid; grid-template-columns: 1fr 1fr 1fr; margin: 14px 0 0; padding: 0; }
  .stats div + div { border-left: 1px solid #efede8; }
  .stats dd { margin: 0; font-size: 20px; font-weight: 800; }
  .stats dt { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #5a6473; font-weight: 700; margin-top: 2px; }
  h3 { display: flex; justify-content: space-between; align-items: baseline; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: #5a6473; margin: 14px 0 6px; padding-top: 10px; border-top: 1px solid #efede8; }
  h3 .aside { text-transform: none; letter-spacing: 0; font-weight: 500; }
  dl { margin: 0; }
  .row { display: flex; gap: 10px; padding: 2px 0; }
  dt { width: 112px; color: #5a6473; flex-shrink: 0; }
  dd { margin: 0; font-weight: 600; }
  .chips { margin: 0; }
  .chip { display: inline-block; border-radius: 999px; padding: 2px 9px; margin: 0 4px 4px 0; font-size: 11px; font-weight: 600; background: #f3f1ec; }
  .chip.blue { background: #e9eeff; color: #2250f4; }
  .list, .quotes { margin: 0; padding: 0; list-style: none; }
  .list li { display: flex; gap: 10px; align-items: baseline; padding: 4px 0; border-bottom: 1px solid #f3f1ec; }
  .list .t { flex: 1; min-width: 0; }
  .list .badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .list .when { color: #5a6473; white-space: nowrap; font-size: 11px; }
  .avg { margin: 0 0 6px; } .avg b { font-size: 20px; } .stars { color: #f59e0b; letter-spacing: 1px; }
  .quotes li { padding: 4px 0; } .quotes .by { display: block; color: #5a6473; font-size: 11px; }
  .gl { margin: 0; font-weight: 600; }
  .bar { height: 7px; border-radius: 999px; background: #e7e5df; overflow: hidden; margin: 6px 0; } .bar div { height: 100%; }
  .hint { color: #5a6473; font-size: 11px; margin: 4px 0 0; }
  footer { margin-top: 12px; color: #5a6473; font-size: 10px; display: flex; justify-content: space-between; }
</style></head><body>
  <header><div><h1>${esc(title)}</h1><div class="sub-title">${sheets.length} fiche${sheets.length > 1 ? 's' : ''} · personnes validées seulement</div></div><div class="brand">Shift Express</div></header>
  ${sheets.join('')}
  <footer><span>Document interne à l'établissement · coordonnées d'auto-entrepreneurs visibles parce que validé·e·s chez vous</span><span>Imprimé le ${new Date().toLocaleDateString('fr-FR')}</span></footer>
</body></html>`;
  openPrint(html, title);
  return sheets.length;
}

/** Titre prêt à l'emploi pour une mission. */
export const missionProfilesTitle = (m: Mission, who?: MissionPlaced) =>
  who
    ? `Fiche · ${who.name} · ${m.poste} · ${fmtShort(m.date)}`
    : `Profils validés · ${m.poste} · ${fmtShort(m.date)} · ${m.establishment}`;
