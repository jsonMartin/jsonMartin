/** Self-contained contribution cards. --refresh fetches public GitHub metadata.
 * The README selects image size only; themes are resolved inside each SVG.
 * This avoids GitHub's theme handling activating a mobile source on desktop.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIR = resolve(ROOT, 'profile/contributions');
export const escapeXml = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function compact(n) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid star count');
  return n < 1000 ? String(n) : new Intl.NumberFormat('en', {notation:'compact', maximumFractionDigits:1}).format(n).toLowerCase();
}
export function wrap(text, max) {
  const lines = []; let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > max) throw new Error('Unbreakable card copy: ' + word);
    if (line && (line + ' ' + word).length > max) {lines.push(line); line = '';}
    line += (line ? ' ' : '') + word;
  }
  if (line) lines.push(line);
  return lines;
}
export function contributionParagraph(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Invalid contribution copy');
  const paragraph = text.replace(/\s+/g, ' ').trim();
  if (paragraph.length > 360) throw new Error('Summarize contributions in 360 characters or fewer');
  return paragraph;
}
export function validateFeatured(list) {
  if (!Array.isArray(list) || !list.length || list.length > 10) throw new Error('Invalid featured list');
  const ids = new Set();
  for (const c of list) {
    if (!/^[a-z0-9-]+$/.test(c.id) || ids.has(c.id)) throw new Error('Invalid/duplicate card id');
    ids.add(c.id);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(c.repo)) throw new Error('Invalid repository');
    for (const k of ['name', 'description']) {
      if (typeof c[k] !== 'string' || !c[k].trim() || c[k].length > 100) throw new Error('Invalid card copy');
    }
    contributionParagraph(c.contribution);
    if (!Array.isArray(c.evidence) || c.evidence.some(n => !Number.isSafeInteger(n) || n <= 0)) throw new Error('Invalid evidence');
  }
}
export function validateMetadata(data, cards) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.as_of ?? '')) throw new Error('Missing snapshot date');
  const wanted = new Set(cards.map(c => c.repo));
  if (Object.keys(data.repositories ?? {}).some(k => !wanted.has(k))) throw new Error('Unexpected repository in cache');
  for (const c of cards) {
    const m = data.repositories[c.repo];
    if (!m || typeof m.language !== 'string' || m.language.length > 32) throw new Error('Missing metadata');
    compact(m.stars);
  }
}
// Reviewed local artwork, never remote resources loaded inside an SVG image.
// Source details and attribution: profile/contributions/ICONS.md.
const ICONS = {
  codexbar: {viewBox:'0 0 64 64',body:'<rect x="3" y="3" width="58" height="58" rx="15" fill="#1b2335"/><path d="M22 18 10 32l12 14M42 18l12 14-12 14" fill="none" stroke="#a6c8ff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M28 40V27m8 13V20" stroke="#79dfbd" stroke-width="5" stroke-linecap="round"/>'},
  vscodevim: {viewBox:'45 42 478 478',body:'<polygon fill="#fff" points="50.9,280.7 283.7,47.9 516.6,280.8 283.7,513.6"/><g fill="#208ECD"><polygon points="50.9,280.7 108.6,223 108.6,338.5"/><polygon points="369.9,134.1 196.5,307.5 197.5,134.1 212,119.6 283.7,47.9"/><polygon points="516.6,280.8 283.7,513.6 195.8,425.7 253.6,367.9 342.5,279.1 357,264.6 377.1,244.5 428.8,192.9"/></g><g fill="#fff" opacity=".3"><polygon points="283.7,220.3 196.5,307.5 197.5,134.1"/><polygon points="430.3,366.8 341.3,455.7 253.6,367.9 342.5,279.1"/><rect x="250.9" y="91.7" transform="matrix(.7071 -.7071 .7071 .7071 -30.2983 232.2034)" width="28.5" height="121.9"/><polygon points="464.8,332.2 444.7,352.4 357,264.6 377.1,244.5"/></g><g fill="#D1D3D4"><polygon points="108.6,338.5 195.8,425.7 108.6,512.8"/><polygon points="108.6,134.1 197.5,134.1 108.6,223"/><polygon points="487.3,134.1 443.2,178.5 428.8,192.9 369.9,134.1"/></g>'},
  raycast: {viewBox:'0 0 24 24',body:'<path fill="#FF6363" d="M6.004 15.492v2.504L0 11.992l1.258-1.249Zm2.504 2.504H6.004L12.008 24l1.253-1.253zm14.24-4.747L24 11.997 12.003 0 10.75 1.251 15.491 6h-2.865L9.317 2.692 8.065 3.944l2.06 2.06H8.691v9.31H18v-1.432l2.06 2.06 1.252-1.252-3.312-3.32V8.506ZM6.63 5.372 5.38 6.625l1.342 1.343 1.251-1.253Zm10.655 10.655-1.247 1.251 1.342 1.343 1.253-1.251zM3.944 8.059 2.692 9.31l3.312 3.314v-2.506zm9.936 9.937h-2.504l3.314 3.312 1.25-1.252z"/>'},
  flowbite: {viewBox:'0 0 16 16',body:'<image width="16" height="16" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAClUlEQVQ4jWWTT4yeUxTGf+e8f+4776RTqiNaUUwTnZjRIdrRRiRNhESQ0KUF6UaQ2BARO7ZECIvqjo21nY2yMEKiUY3MpJXpEA2VUNp+Y2bu9373PhbzdUzrbM5ZPPd3znNyrnFNxINMquB54EHgNsAwviEzb84H4UsWNuvtSqFDNKuJN9eSHelELzjbG1MF/A1cP5Rl4P2whVftU+IGQIdozq35R5eST0fpzpiNKCPLliZC+mtnlfZdM+hn4Xces0WiAczPlm934iWALP0TZaNR65Aoo4Az+9r+TVtdWzdBjjVzPGfz+6u7EzqRoQDImVMRdvZl430ZURBl9GXd7pAW9oZu5oodH7DfK9cztakIJgw7vZiqqZ8H1fgy9oahb+2/RVVnYzHzZ+fnhwAflDztwfLDwUVt8Nug2JZEWZmQOD13sjvg6IjDeR++uoSfA1YAHKa8NnYFg2Cij8YqE62J0QJeh/zI992H/UG8o0BvVaalG4s0uyZrk0jA9jKYPAMyqA0qROtidNjx5Gz9REl6vLB0oEITy9kpTdRmcczy7WVj+iXBZMZoTcigdTHimeP3hhd7Se8VVlCaKLGNvKsaLBm4F/BJDYvB9EPjYtTXLfRS8Wgv2buXs9PLRi+t5zX5yi1VOlUZ0xifOwUfy9gN7Nni+WJr6xZqNLMq8142LmdnOZt2lPnE3rr/R22aBGSJYwawcj/vuPHUxWQ/rcrva1006MJ3se4uDHz85iotzDT9MYdbh+f7o+B4M8cLJcBIxWv9juvGTHvM1bXIa1N5cCTeMNzlXZvvWOLXkHn56s80RR238WzOPFTAhIxp/h8ZOBoSr9jXrF4F2AA9wI4oDguedLhHEICzwBeIo81XnNms/xeroiHeSLFzeQAAAABJRU5ErkJggg=="/>'}
};
export function iconSvg(id, x, y) {
  const icon = ICONS[id];
  if (icon) return `<svg data-project-icon="${id}" x="${x}" y="${y}" width="23" height="23" viewBox="${icon.viewBox}" aria-hidden="true">${icon.body}</svg>`;
  return `<g data-project-icon="monogram" aria-hidden="true"><rect x="${x}" y="${y}" width="23" height="23" rx="5" fill="var(--band)" stroke="var(--border)"/><text x="${x+11.5}" y="${y+16}" text-anchor="middle" font-size="13" font-weight="600" fill="var(--accent)">${escapeXml(id.slice(0,1).toUpperCase())}</text></g>`;
}
const LIGHT = '--bg:#fff;--top:#f2f7fa;--border:#cbd8e2;--title:#182d3b;--text:#455c6f;--mute:#566d80;--accent:#007c64;--band:#eef8f4;--starbg:#fff8e9;--starborder:#dfcc9c;--star:#815800';
const DARK = '--bg:#111820;--top:#16232d;--border:#2a3945;--title:#eef4fa;--text:#b5c4d2;--mute:#93a6b7;--accent:#58dfba;--band:#0f2223;--starbg:#28241b;--starborder:#50462c;--star:#eac777';
const FONT = 'system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
const tx = (x,y,size,color,text,weight=400,mono=false) => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="var(--${color})"${mono ? ` font-family="${MONO}"` : ''}>${escapeXml(text)}</text>`;
export const DESKTOP_WIDTH = 760;
export function cardSvg(card, meta, theme = 'auto', mobile = false, asOf = '') {
  if (!['auto','dark','light'].includes(theme)) throw new Error('Unknown theme');
  const w = mobile ? 400 : DESKTOP_WIDTH, pad = 16;
  const description = wrap(card.description, mobile ? 45 : 92);
  const paragraph = contributionParagraph(card.contribution);
  const note = wrap(paragraph, mobile ? 42 : 91);
  const descY = mobile ? 60 : 53, line = 18;
  const divider = descY + (description.length - 1) * line + 10;
  const noteY = divider + 20, h = noteY + (note.length - 1) * line + 13;
  const sx = w - pad - 100;
  const palette = theme === 'dark' ? DARK : LIGHT;
  const title = `${card.name} · ${meta.stars.toLocaleString('en-US')} repository stars`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc" font-family="${FONT}">`,
    `<title id="title">${escapeXml(title)}</title><desc id="desc">${escapeXml(`${card.repo}. ${card.description} My contribution: ${paragraph} Stars checked ${asOf}.`)}</desc>`,
    `<style>:root{${palette}}${theme === 'auto' ? `@media(prefers-color-scheme:dark){:root{${DARK}}}` : ''}</style>`,
    `<defs><linearGradient id="surface" x2="1" y2="1"><stop stop-color="var(--top)"/><stop offset="1" stop-color="var(--bg)"/></linearGradient><clipPath id="corners"><rect x=".5" y=".5" width="${w-1}" height="${h-1}" rx="9"/></clipPath></defs>`,
    `<rect x=".5" y=".5" width="${w-1}" height="${h-1}" rx="9" fill="url(#surface)" stroke="var(--border)"/>`,
    `<g clip-path="url(#corners)"><rect x="1" y="${divider}" width="${w-2}" height="${h-divider-1}" fill="var(--band)"/><path d="M2 18V39" stroke="var(--accent)" stroke-width="2"/></g>`,
    iconSvg(card.id,pad,14),
    tx(48,31,18,'title',card.name,650),
    tx(mobile ? 48 : 65+card.name.length*10.7,mobile ? 44 : 30,10.5,'mute',`${card.repo} · ${meta.language}`,400,true),
    `<g transform="translate(${sx} 14)"><rect x=".5" y=".5" width="99" height="23" rx="12" fill="var(--starbg)" stroke="var(--starborder)"/><path d="m16 4 2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8Z" fill="none" stroke="var(--star)" stroke-width="1.2" stroke-linejoin="round"/>${tx(30,16.5,12,'star',compact(meta.stars),600,true)}${tx(96,16,9,'mute','stars').replace('<text ', '<text text-anchor="end" ')}</g>`,
    ...description.map((d,i) => tx(pad,descY+i*line,14,'text',d)),
    `<path d="M${pad} ${divider}H${w-pad}" stroke="var(--border)"/>`,
    `<path data-contribution-arrow="true" d="M17 ${noteY-12}v8h11m-4-4 4 4-4 4" fill="none" stroke="var(--accent)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`,
    ...note.map((n,i) => tx(38,noteY+i*line,14,'accent',n,500)),
    '</svg>\n'
  ].join('');
}
export function readmeBlock(cards, data) {
  return '<!-- BEGIN CONTRIBUTION CARDS -->\n' + cards.map(c => {
    const src = `./profile/contributions/compact/${c.id}`;
    const alt = `${c.name} — ${c.description} ↳ ${contributionParagraph(c.contribution)}`;
    // Keep ONLY a size query here. Mixing size and theme in a source caused the
    // compact artwork to be selected at desktop width by GitHub's theme handling.
    // Do not force img width: each selected SVG supplies its own native width.
    return `<p>\n<a href="https://github.com/${c.repo}" title="${escapeXml(c.repo)} · stars checked ${escapeXml(data.as_of)}">\n<picture>\n  <source media="(max-width: 520px)" srcset="${src}-mobile.svg">\n  <img src="${src}.svg" alt="${escapeXml(alt)}">\n</picture>\n</a>\n</p>`;
  }).join('\n\n') + '\n<!-- END CONTRIBUTION CARDS -->';
}
export async function refreshMetadata(cards, previous, fetcher = fetch) {
  const repositories = {};
  for (const card of cards) {
    const headers = {Accept:'application/vnd.github+json', 'User-Agent':'jsonMartin-profile-cards', 'X-GitHub-Api-Version':'2022-11-28'};
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const response = await fetcher(`https://api.github.com/repos/${card.repo}`, {headers, signal:AbortSignal.timeout(15000), redirect:'error'});
    if (!response.ok) throw new Error(`Metadata unavailable for ${card.repo}: HTTP ${response.status}`);
    const value = await response.json();
    if (value.private !== false || value.full_name !== card.repo) throw new Error('Unexpected/private repository; refusing to publish metadata');
    repositories[card.repo] = {stars:value.stargazers_count, language:value.language ?? 'Code'};
  }
  const result = {as_of:new Date().toISOString().slice(0,10), repositories};
  validateMetadata(result, cards);
  return result;
}
export async function main() {
  const cards = JSON.parse(await readFile(resolve(DIR,'featured.json'),'utf8'));
  validateFeatured(cards);
  let data = JSON.parse(await readFile(resolve(DIR,'metadata.json'),'utf8'));
  validateMetadata(data, cards);
  if (process.argv.includes('--refresh')) {
    try {data = await refreshMetadata(cards, data);}
    catch (e) {console.warn(`Keeping dated snapshot ${data.as_of}: ${e.message}`);}
  }
  await mkdir(resolve(DIR,'compact'), {recursive:true});
  for (const c of cards) for (const mobile of [false,true]) {
    await writeFile(resolve(DIR,'compact',`${c.id}${mobile?'-mobile':''}.svg`), cardSvg(c,data.repositories[c.repo],'auto',mobile,data.as_of));
  }
  await writeFile(resolve(DIR,'metadata.json'),JSON.stringify(data,null,2)+'\n');
  const path = resolve(ROOT, 'README.md'), readme = await readFile(path,'utf8');
  const re = /<!-- BEGIN CONTRIBUTION CARDS -->[\s\S]*?<!-- END CONTRIBUTION CARDS -->/;
  if ((readme.match(/<!-- BEGIN CONTRIBUTION CARDS -->/g)||[]).length !== 1 || !re.test(readme)) throw new Error('Expected one card block in README');
  await writeFile(path, readme.replace(re, () => readmeBlock(cards, data)));
  console.log(`Rendered ${cards.length * 2} size-safe cards from ${data.as_of} metadata`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => {console.error(e.message); process.exitCode=1;});
}
