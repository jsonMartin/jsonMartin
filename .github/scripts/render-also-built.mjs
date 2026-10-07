import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const META=resolve(ROOT,'profile/also-built/metadata.json');
const OUT=resolve(ROOT,'profile/visual/portfolio');

export const projects=[
  {
    id:'readwise-mirror',
    name:'Readwise Mirror',
    repo:'jsonMartin/readwise-mirror',
    kicker:'OBSIDIAN PLUGIN',
    description:['Sync Readwise highlights and edits into Obsidian.','Includes templates and file tracking.'],
    action:['INSTALL','Obsidian → Community plugins → Readwise Mirror'],
    icon:'obsidian'
  },
  {
    id:'astronot',
    name:'AstroNot',
    repo:'jsonMartin/AstroNot',
    kicker:'ASTRO + NOTION',
    description:['Use Notion as a CMS for an Astro site.','Edit the frontend and host it yourself.'],
    action:['SETUP','clone → pnpm install → .env → pnpm sync'],
    icon:'none'
  }
];

const OBSIDIAN='M19.355 18.538a68.967 68.959 0 0 0 1.858-2.954.81.81 0 0 0-.062-.9c-.516-.685-1.504-2.075-2.042-3.362-.553-1.321-.636-3.375-.64-4.377a1.707 1.707 0 0 0-.358-1.05l-3.198-4.064a3.744 3.744 0 0 1-.076.543c-.106.503-.307 1.004-.536 1.5-.134.29-.29.6-.446.914l-.31.626c-.516 1.068-.997 2.227-1.132 3.59-.124 1.26.046 2.73.815 4.481.128.011.257.025.386.044a6.363 6.363 0 0 1 3.326 1.505c.916.79 1.744 1.922 2.415 3.5zM8.199 22.569c.073.012.146.02.22.02.78.024 2.095.092 3.16.29.87.16 2.593.64 4.01 1.055 1.083.316 2.198-.548 2.355-1.664.114-.814.33-1.735.725-2.58l-.01.005c-.67-1.87-1.522-3.078-2.416-3.849a5.295 5.295 0 0 0-2.778-1.257c-1.54-.216-2.952.19-3.84.45.532 2.218.368 4.829-1.425 7.531zM5.533 9.938c-.023.1-.056.197-.098.29L2.82 16.059a1.602 1.602 0 0 0 .313 1.772l4.116 4.24c2.103-3.101 1.796-6.02.836-8.3-.728-1.73-1.832-3.081-2.55-3.831zM9.32 14.01c.615-.183 1.606-.465 2.745-.534-.683-1.725-.848-3.233-.716-4.577.154-1.552.7-2.847 1.235-3.95.113-.235.223-.454.328-.664.149-.297.288-.577.419-.86.217-.47.379-.885.46-1.27.08-.38.08-.72-.014-1.043-.095-.325-.297-.675-.68-1.06a1.6 1.6 0 0 0-1.475.36l-4.95 4.452a1.602 1.602 0 0 0-.513.952l-.427 2.83c.672.59 2.328 2.316 3.335 4.711.09.21.175.43.253.653z';
const STAR='M10 1.6 12.55 6.75 18.25 7.58 14.13 11.6 15.1 17.28 10 14.6 4.9 17.28 5.87 11.6 1.75 7.58 7.45 6.75Z';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function icon(project){
  if(project.icon==='obsidian') return `<g transform="translate(21 19) scale(1.55)" fill="#8b5cf6"><path d="${OBSIDIAN}"/></g>`;
  return '';
}

export function render(project,stars){
  const titleX=project.icon==='none'?20:76;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="210" viewBox="0 0 480 210" role="img"><title>${esc(project.name)} — ${stars} GitHub stars</title><style>:root{--panel:#111c24;--line:#293e4b;--text:#eef4fa;--muted:#9caebe;--accent:#36e6b5;--band:#102923;--starbg:#28241b;--starline:#50462c;--star:#eac777}@media(prefers-color-scheme:light){:root{--panel:#f2f6fa;--line:#c9d7e1;--text:#152b36;--muted:#526777;--accent:#007e63;--band:#e8f5ef;--starbg:#fff8e9;--starline:#dfcc9c;--star:#815800}}text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.panel{fill:var(--panel)}.line{stroke:var(--line)}.text{fill:var(--text)}.muted{fill:var(--muted)}.accent{fill:var(--accent)}.band{fill:var(--band)}</style><rect x=".5" y=".5" width="479" height="209" rx="11" class="panel line"/>${icon(project)}<text x="${titleX}" y="34" font-size="23" class="text" font-weight="700">${esc(project.name)}</text><text x="${titleX}" y="51" font-size="10.5" class="muted">${esc(project.repo)}</text><rect x="374" y="17" width="86" height="27" rx="13.5" fill="var(--starbg)" stroke="var(--starline)"/><path transform="translate(384 22) scale(.8)" d="${STAR}" fill="none" stroke="var(--star)" stroke-width="1.4"/><text x="409" y="35" font-size="12" fill="var(--star)" font-weight="700">${stars}</text><rect x="20" y="68" width="122" height="22" rx="11" class="band"/><text x="31" y="83" font-size="9.5" class="accent">${esc(project.kicker)}</text><text x="20" y="117" font-size="13.5" class="text">${esc(project.description[0])}</text><text x="20" y="137" font-size="13.5" class="text">${esc(project.description[1])}</text><rect x="20" y="153" width="440" height="48" rx="7" class="band"/><text x="33" y="174" font-size="10" class="muted">${esc(project.action[0])}</text><text x="33" y="190" font-size="11.5" class="accent">${esc(project.action[1])}</text></svg>\n`;
}

export function validate(data){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(data.as_of||''))throw new Error('Invalid date');
  for(const project of projects){const v=data.repositories?.[project.repo];if(!v||!Number.isSafeInteger(v.stars)||v.stars<0)throw new Error('Missing stars '+project.repo);}
}

export async function refresh(fetcher=fetch){
  const out={as_of:new Date().toISOString().slice(0,10),repositories:{}};
  for(const project of projects){
    const headers={Accept:'application/vnd.github+json','User-Agent':'jsonMartin-profile-cards','X-GitHub-Api-Version':'2022-11-28'};
    if(process.env.GITHUB_TOKEN)headers.Authorization=`Bearer ${process.env.GITHUB_TOKEN}`;
    const response=await fetcher(`https://api.github.com/repos/${project.repo}`,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});
    if(!response.ok)throw new Error(`Metadata unavailable for ${project.repo}: HTTP ${response.status}`);
    const value=await response.json();
    if(value.private!==false||value.full_name!==project.repo)throw new Error('Unexpected/private repository');
    out.repositories[project.repo]={stars:value.stargazers_count};
  }
  validate(out);return out;
}

// Importing the renderer for tests must not rewrite tracked images.
async function main() {
  let data = JSON.parse(await readFile(META, 'utf8'));
  validate(data);
  if (process.argv.includes('--refresh')) {
    try {
      data = await refresh();
      await writeFile(META, JSON.stringify(data, null, 2) + '\n');
    } catch (error) {
      console.warn(`Keeping Also Built snapshot ${data.as_of}: ${error.message}`);
    }
  }
  for (const project of projects) {
    await writeFile(resolve(OUT, `${project.id}.svg`), render(project, data.repositories[project.repo].stars));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
