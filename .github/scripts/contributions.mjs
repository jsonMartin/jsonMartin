#!/usr/bin/env node
// Renders a markdown table of merged PRs to repositories the user does not own.
// Zero dependencies on purpose: no bundling step and no committed node_modules,
// which is what makes this cheap to lift out into a standalone Action later.
// Inputs come from env + a YAML-ish config so the eventual action.yml maps 1:1.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const API = "https://api.github.com";

/** Strip a trailing ` # comment`, matching YAML: a hash only opens a comment
 *  when preceded by whitespace and outside quotes. Quote the value to keep one
 *  (a description citing " #1234" must be quoted or it is cut here). */
function scalar(raw) {
  const s = raw.trim();
  const q = s[0];
  if (q === '"' || q === "'") {
    const end = s.indexOf(q, 1);
    if (end > 0) return s.slice(1, end);
  }
  return s.replace(/\s+#.*$/, "").trim();
}

/** Minimal parser for the flat `key: value` + `- repo:` shape this config uses.
 *  Avoids a YAML dependency; rejects anything more nested so it fails loudly
 *  rather than silently misreading a structure it does not support. */
export function parseConfig(text) {
  const cfg = { options: {}, repos: [] };
  let section = null;
  let current = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    const body = line.trim();

    if (indent === 0 && body.endsWith(":")) {
      section = body.slice(0, -1);
      current = null;
      continue;
    }
    if (body.startsWith("- ")) {
      if (section !== "repos") throw new Error(`list item outside repos: ${body}`);
      current = {};
      cfg.repos.push(current);
      const [k, ...rest] = body.slice(2).split(":");
      current[k.trim()] = scalar(rest.join(":"));
      continue;
    }
    const [k, ...rest] = body.split(":");
    const value = scalar(rest.join(":"));
    if (section === "options") cfg.options[k.trim()] = value;
    else if (current) current[k.trim()] = value;
  }
  return cfg;
}

const truthy = (v, dflt = false) =>
  v === undefined || v === "" ? dflt : /^(true|yes|1|on)$/i.test(v);

/** Keep repos the user does not own. `owners` are login prefixes to treat as theirs. */
export function isExternal(nameWithOwner, owners) {
  const org = nameWithOwner.split("/")[0].toLowerCase();
  return !owners.some((o) => o.toLowerCase() === org);
}

/** Group PRs by repo, newest first, within an optional merge-date window.
 *  Grouping only — every exclusion lives in applyFilters so there is a single
 *  place that can explain why a repo is not on the list. */
export function summarise(prs, { since, until } = {}) {
  const byRepo = new Map();
  const seen = new Set();        // every repo, before the date window
  for (const pr of prs) {
    seen.add(pr.repo);
    if (since && pr.mergedAt < since) continue;
    if (until && pr.mergedAt > until) continue;
    const e = byRepo.get(pr.repo) ??
      { repo: pr.repo, count: 0, last: "", isPrivate: pr.isPrivate, stars: pr.stars,
        description: pr.description ?? "", language: pr.language ?? "" };
    e.count += 1;
    if (pr.mergedAt > e.last) e.last = pr.mergedAt;
    byRepo.set(pr.repo, e);
  }
  const rows = [...byRepo.values()]
    .sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));   // recency; see sortRows
  // Repos the window removed entirely, so the caller can say so rather than
  // letting them vanish between runs with no explanation anywhere.
  const droppedByDate = [...seen].filter((r) => !byRepo.has(r));
  return Object.assign(rows, { droppedByDate });
}

/** Apply every exclusion rule, returning what was dropped and why. Nothing is
 *  removed silently: a filter that quietly deletes your best contribution is
 *  the exact failure this tool already shipped once. */
export function applyFilters(rows, opts = {}) {
  const {
    minStars = 0, excludePattern = "", entries = new Map(),
    includeByDefault = true, onlyDescribed = false,
  } = opts;
  let re = null;
  if (excludePattern) {
    try { re = new RegExp(excludePattern, "i"); }
    catch (e) { throw new Error(`exclude_pattern is not a valid regex: ${e.message}`); }
  }
  const kept = [], dropped = [];
  for (const r of rows) {
    const entry = entries.get(r.repo);
    const described = Boolean(entry?.description);
    let reason = null;
    // An explicit include: wins over every rule below, so a pattern can never
    // eat a repo the user deliberately switched on.
    const explicit = entry && entry.include !== undefined
      ? truthy(entry.include, true) : null;
    // Backstop. dropPrivate already removed these; if one reaches here the
    // chokepoint was bypassed, so fail rather than quietly filter.
    if (r.isPrivate) throw new Error(`${r.repo} is private and reached applyFilters`);
    else if (explicit === false) reason = "include: false";
    else if (explicit !== true) {
      if (re && re.test(r.repo)) reason = `matched exclude_pattern /${excludePattern}/`;
      else if (minStars > 0 && r.stars < minStars) reason = `${r.stars}★ below min_stars ${minStars}`;
      else if (onlyDescribed && !described) reason = "no description and only_described is on";
      else if (!includeByDefault && !entry) reason = "not listed and include_by_default is off";
    }
    (reason ? dropped : kept).push(reason ? { repo: r.repo, reason } : r);
  }
  return { kept, dropped };
}

export function renderMarkdown(rows, descriptions, opts = {}) {
  const showCount = opts.showPrCount !== false;
  const showDate = opts.showDate !== false;
  const head = ["Repository"];
  if (showCount) head.push("Merged PRs");
  if (showDate) head.push("Last merged");
  head.push("What");
  const lines = [
    `| ${head.join(" | ")} |`,
    `|${head.map(() => " --- ").join("|")}|`,
  ];
  for (const r of rows) {
    const cells = [`[\`${r.repo}\`](https://github.com/${r.repo})`];
    if (showCount) cells.push(String(r.count));
    if (showDate) cells.push(r.last.slice(0, 7));
    cells.push(r.minor ? "" : descriptions.get(r.repo) ?? "");
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

/** Append repos the config has never seen, so the config always mirrors what the
 *  run actually found and the user only ever edits — never hunts for names.
 *  Append-only and text-based on purpose: re-serialising would drop the user's
 *  comments and formatting, and silently losing a hand-written description is
 *  worse than an untidy file. */
export function appendDiscovered(configText, repos, { include = true } = {}) {
  const known = new Set(
    [...configText.matchAll(/^\s*-\s*repo:\s*(\S+)/gm)].map((m) => m[1].replace(/["']/g, "")),
  );
  const fresh = repos.filter((r) => !known.has(r));
  if (!fresh.length) return { text: configText, added: [] };

  const block = fresh
    .map((r) => `  - repo: ${r}\n    include: ${include}\n    description: ""`)
    .join("\n");

  const text = /^repos:\s*$/m.test(configText)
    ? configText.replace(/^repos:\s*$/m, `repos:\n${block}`)
    : `${configText.replace(/\s*$/, "")}\n\nrepos:\n${block}\n`;
  return { text, added: fresh };
}

const BEGIN = "<!-- BEGIN CONTRIBUTIONS -->";
const END = "<!-- END CONTRIBUTIONS -->";

/** Replace the region between the markers. Markdown has no include directive,
 *  so the table is spliced into the README rather than written beside it.
 *  Throws if the markers are missing or reversed, so a silent no-op is
 *  impossible — a README that quietly stops updating is the failure to avoid. */
export function spliceInto(readme, table) {
  const a = readme.indexOf(BEGIN);
  const b = readme.indexOf(END);
  if (a === -1 || b === -1) throw new Error(`README is missing ${a === -1 ? BEGIN : END}`);
  if (b < a) throw new Error("CONTRIBUTIONS markers are out of order");
  return readme.slice(0, a + BEGIN.length) + "\n" + table + "\n" + readme.slice(b);
}

/** 481893 -> "481.9k". Stars are a scale signal, so round to what a reader scans. */
export function formatStars(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Repo descriptions arrive raw: GitHub emoji shortcodes (":star:") render
 *  literally inside HTML, and a long one breaks the card grid. */
export function cleanDescription(text, max = 110) {
  const t = String(text ?? "").replace(/:[a-z0-9_+-]+:/gi, "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

/** Rows flagged `minor` (docs-only or trivial PRs) always sort after the rest:
 *  the project still counts, it just does not lead. */
export function sortRows(rows, by = "stars") {
  if (by !== "stars" && by !== "recent") throw new Error(`sort must be "stars" or "recent", got "${by}"`);
  const cmp = by === "stars" ? (a, b) => (b.stars ?? 0) - (a.stars ?? 0) : () => 0;
  const major = rows.filter((r) => !r.minor).sort(cmp);
  const minor = rows.filter((r) => r.minor).sort(cmp);
  return [...major, ...minor];
}

/** Two-column card grid. Leads with the project's own scale — its stars and
 *  what it is — rather than how many PRs were merged and when: "1 PR, 2017"
 *  undersells a contribution to a 480k-star repository.
 *  Pure HTML with no markdown inside, so GitHub renders every cell the same. */
export function renderCards(rows, notes, opts = {}) {
  // One card per row by default: GitHub table columns do not reflow, so a
  // two-column grid clips its right-hand cell on a phone.
  const cols = Math.max(1, Number(opts.columns ?? 1));
  const showCount = opts.showPrCount === true;
  const showDate = opts.showDate === true;
  const cell = (r, width = 50) => {
    const meta = [`★ ${formatStars(r.stars ?? 0)}`];
    if (r.language) meta.push(esc(r.language));
    if (showCount) meta.push(`${r.count} merged PR${r.count === 1 ? "" : "s"}`);
    if (showDate) meta.push(esc(r.last.slice(0, 7)));
    const lines = [
      `<a href="https://github.com/${esc(r.repo)}"><b>${esc(r.repo)}</b></a><br>`,
      `<sub>${meta.join(" · ")}</sub>`,
    ];
    const desc = cleanDescription(r.description);
    if (desc) lines.push(`<br>${esc(desc)}`);
    const note = r.minor ? "" : notes.get(r.repo);
    if (note) lines.push(`<br><sub>↳ ${esc(note).replace(/`([^`]+)`/g, "<code>$1</code>")}</sub>`);
    return `<td width="${width}%" valign="top">\n${lines.join("\n")}\n</td>`;
  };
  const width = Math.round(100 / cols);
  const trs = [];
  for (let i = 0; i < rows.length; i += cols) {
    const group = rows.slice(i, i + cols).map((r) => cell(r, width));
    while (group.length < cols) group.push(`<td width="${width}%"></td>`);
    trs.push(`<tr>\n${group.join("\n")}\n</tr>`);
  }
  return `<table>\n${trs.join("\n")}\n</table>`;
}

async function fetchMergedPrs(user, token) {
  const query = `query($q:String!,$after:String){
    search(query:$q,type:ISSUE,first:100,after:$after){
      pageInfo{hasNextPage endCursor}
      nodes{... on PullRequest{ mergedAt title
        repository{ nameWithOwner isPrivate stargazerCount description primaryLanguage{name} } }}
    }}`;
  const out = [];
  let after = null;
  for (let page = 0; page < 10; page++) {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
                 "User-Agent": "profile-contributions" },
      body: JSON.stringify({ query, variables: { q: `is:pr author:${user} is:merged`, after } }),
    });
    if (!res.ok) throw new Error(`search failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    if (body.errors?.length) throw new Error(`search failed: ${body.errors[0].message}`);
    const s2 = body.data.search;
    for (const n of s2.nodes) {
      if (!n?.repository) continue;
      out.push({
        repo: n.repository.nameWithOwner,
        isPrivate: n.repository.isPrivate,
        stars: n.repository.stargazerCount,
        description: n.repository.description ?? "",
        language: n.repository.primaryLanguage?.name ?? "",
        mergedAt: (n.mergedAt ?? "").slice(0, 10),
        title: n.title,
      });
    }
    if (!s2.pageInfo.hasNextPage) break;
    after = s2.pageInfo.endCursor;
    if (page === 9) console.warn("hit the 1000-result search cap; counts may be low");
  }
  return out;
}

/** Drop private repositories at the boundary, before anything downstream can
 *  see them. This output is a public README and a committed config file, and a
 *  private repo name is not publishable in either — so it is removed once, here,
 *  rather than at each place that happens to write something out. */
export function dropPrivate(prs) {
  const kept = [], privateRepos = new Set();
  for (const pr of prs) {
    if (pr.isPrivate === undefined) throw new Error(`${pr.repo}: no privacy flag from the API`);
    if (pr.isPrivate) privateRepos.add(pr.repo);
    else kept.push(pr);
  }
  return { kept, privateRepos: [...privateRepos] };
}

async function main() {
  const user = process.env.PROFILE_USER;
  const token = process.env.GITHUB_TOKEN;
  const configPath = process.env.CONFIG_PATH ?? "contributions.yml";
  const readmePath = process.env.README_PATH ?? "README.md";
  if (!user || !token) throw new Error("PROFILE_USER and GITHUB_TOKEN are required");

  const cfg = existsSync(configPath)
    ? parseConfig(readFileSync(configPath, "utf8"))
    : { options: {}, repos: [] };
  const o = cfg.options;
  const owners = (o.exclude_owners ?? user).split(",").map((s) => s.trim()).filter(Boolean);

  const fetched = await fetchMergedPrs(user, token);
  const { kept: publicPrs, privateRepos } = dropPrivate(fetched);
  for (const repo of privateRepos) console.log(`excluded ${repo}: private repository`);
  const prs = publicPrs.filter((p) => isExternal(p.repo, owners));
  const window = { since: o.since || undefined, until: o.until || undefined };
  const rows = summarise(prs, window);
  for (const repo of rows.droppedByDate) {
    console.log(`excluded ${repo}: no merged PR within ${window.since || "…"}..${window.until || "…"}`);
  }


  const entries = new Map(cfg.repos.filter((r) => r.repo).map((r) => [r.repo, r]));
  const descriptions = new Map([...entries].map(([k, v]) => [k, v.description ?? ""]));

  // Mirror every discovered repo back into the config so the user edits a list
  // that already matches the run, rather than typing repo names by hand.
  if (truthy(o.autodiscover, true)) {
    const { text, added } = appendDiscovered(
      readFileSync(configPath, "utf8"),
      rows.map((r) => r.repo),   // public-only: dropPrivate ran at the fetch boundary
      { include: truthy(o.new_repos_included, true) },
    );
    if (added.length) {
      writeFileSync(configPath, text);
      console.log(`added ${added.length} newly discovered repo(s) to ${configPath}: ${added.join(", ")}`);
    }
  }

  const { kept, dropped } = applyFilters(rows, {
    minStars: Number(o.min_stars ?? 0),
    excludePattern: o.exclude_pattern ?? "",
    entries,
    includeByDefault: truthy(o.include_by_default, true),
    onlyDescribed: truthy(o.only_described, false),
  });
  for (const d of dropped) console.log(`excluded ${d.repo}: ${d.reason}`);
  for (const r of kept) r.minor = truthy(entries.get(r.repo)?.minor, false);
  const selected = sortRows(kept, o.sort || "stars");
  const limited = o.limit ? selected.slice(0, Number(o.limit)) : selected;

  const layout = o.layout || "cards";
  const render = { cards: renderCards, table: renderMarkdown }[layout];
  if (!render) throw new Error(`layout must be "cards" or "table", got "${layout}"`);
  // cards default to leaving PR count and date off; the table keeps them on
  const table = render(limited, descriptions, {
    showPrCount: truthy(o.show_pr_count, layout === "table"),
    showDate: truthy(o.show_date, layout === "table"),
    columns: Number(o.columns ?? 1),
  });
  writeFileSync(readmePath, spliceInto(readFileSync(readmePath, "utf8"), table));
  console.log(`spliced ${limited.length} repositories into ${readmePath}`);
}

// --- self-check: node contributions.mjs --check -------------------------------
if (process.argv.includes("--check")) {
  const { strict: assert } = await import("node:assert");

  assert.deepEqual(isExternal("torvalds/linux", ["jsonMartin"]), true);
  assert.deepEqual(isExternal("jsonMartin/thing", ["jsonMartin"]), false);
  assert.deepEqual(isExternal("JSONMARTIN/thing", ["jsonmartin"]), false, "owner match is case-insensitive");

  const prs = [
    { repo: "a/one", mergedAt: "2026-01-01", isPrivate: false, stars: 900 },
    { repo: "a/one", mergedAt: "2026-03-01", isPrivate: false, stars: 900 },
    { repo: "b/two", mergedAt: "2025-06-01", isPrivate: false, stars: 5 },
  ];
  const all = summarise(prs);
  assert.equal(all.length, 2);
  assert.equal(all[0].repo, "a/one", "newest last-merged sorts first");
  assert.equal(all[0].count, 2, "PRs to the same repo collapse into one row");
  const windowed = summarise(prs, { since: "2026-01-01" });
  assert.equal(windowed.length, 1, "since filters whole repos out");
  assert.deepEqual(windowed.droppedByDate, ["b/two"],
    "a repo removed by the date window is named, not silently gone");
  assert.equal(summarise(prs, { until: "2025-12-31" }).length, 1, "until filters the other way");
  assert.deepEqual(summarise(prs).droppedByDate, [], "no window, nothing dropped");
  assert.equal(all[0].stars, 900, "stars ride in from the search, not a second fetch");

  // --- exclusion rules, each one reporting its reason ---
  const pub = { isPrivate: false };
  const rows = [
    { repo: "big/one", stars: 900, count: 1, last: "2026-01-01", ...pub },
    { repo: "tiny/two", stars: 2, count: 1, last: "2025-01-01", ...pub },
    { repo: "old/thing-OLD", stars: 500, count: 1, last: "2024-01-01", ...pub },
  ];
  const plain = applyFilters(rows);
  assert.equal(plain.kept.length, 3, "include by default keeps everything");
  assert.equal(plain.dropped.length, 0);

  const byStars = applyFilters(rows, { minStars: 100 });
  assert.deepEqual(byStars.kept.map((r) => r.repo), ["big/one", "old/thing-OLD"]);
  assert.match(byStars.dropped[0].reason, /2★ below min_stars 100/, "the reason names the numbers");

  const byRe = applyFilters(rows, { excludePattern: "-old$" });
  assert.deepEqual(byRe.kept.map((r) => r.repo), ["big/one", "tiny/two"], "regex is case-insensitive");
  assert.match(byRe.dropped[0].reason, /exclude_pattern/);

  const rescued = applyFilters(rows, {
    excludePattern: "-old$",
    entries: new Map([["old/thing-OLD", { repo: "old/thing-OLD", include: "true" }]]),
  });
  assert.equal(rescued.kept.length, 3, "an explicit include: true beats the pattern");

  const off = applyFilters(rows, { entries: new Map([["big/one", { include: "false" }]]) });
  assert.deepEqual(off.dropped.map((d) => d.repo), ["big/one"]);

  assert.throws(() => applyFilters(rows, { excludePattern: "([" }), /not a valid regex/,
    "a broken pattern fails loudly instead of matching nothing");
  // --- privacy: removed at the boundary, unconditional, not configurable ---
  const mixed = [
    { repo: "pub/a", mergedAt: "2026-01-01", isPrivate: false, stars: 10 },
    { repo: "client/secret", mergedAt: "2026-02-01", isPrivate: true, stars: 0 },
  ];
  const cleaned = dropPrivate(mixed);
  assert.deepEqual(cleaned.kept.map((p) => p.repo), ["pub/a"], "private PRs never leave the fetch boundary");
  assert.deepEqual(cleaned.privateRepos, ["client/secret"], "and they are named in the log");
  assert.throws(() => dropPrivate([{ repo: "x/y", mergedAt: "2026-01-01" }]), /no privacy flag/,
    "a missing flag is an error, never an assumption that it is public");

  // the config write-back is a second publishing surface, so it gets the same guarantee
  const { text: writtenBack } = appendDiscovered("repos:\n", cleaned.kept.map((p) => p.repo));
  assert.ok(writtenBack.includes("pub/a"));
  assert.ok(!writtenBack.includes("client/secret"),
    "a private repo name never reaches contributions.yml either — that file is committed too");

  assert.throws(() => applyFilters([{ repo: "x/y", count: 1, last: "2026-01-01", stars: 1, isPrivate: true }]),
    /reached applyFilters/, "the backstop fails loudly if the chokepoint is ever bypassed");

  const cfg = parseConfig(`
options:
  limit: 8                 # inline comment must not become part of the value
  only_described: true     # this one silently broke the first real run
  exclude_owners: me, MyOrg   # so did this
  show_date: false
  note: "keeps a quoted # hash"
repos:
  - repo: VSCodeVim/Vim
    description: Added jumptoanywhere for easymotion
  - repo: public-apis/public-apis
`);
  assert.equal(cfg.options.limit, "8");
  assert.equal(cfg.options.only_described, "true", "inline comment stripped from a flag");
  assert.equal(cfg.options.exclude_owners, "me, MyOrg", "inline comment stripped from a list");
  assert.equal(cfg.options.note, "keeps a quoted # hash", "a quoted hash survives");
  assert.equal(truthy(cfg.options.only_described, false), true);
  assert.equal(cfg.repos.length, 2);
  assert.equal(cfg.repos[0].description, "Added jumptoanywhere for easymotion");
  assert.equal(cfg.repos[1].description, undefined, "description is optional");

  const md = renderMarkdown(all, new Map([["a/one", "Did a thing"]]), { showDate: false });
  assert.ok(md.includes("| [`a/one`](https://github.com/a/one) | 2 | Did a thing |"));
  assert.ok(!md.includes("Last merged"), "show_date=false drops the column");
  assert.ok(md.includes("| [`b/two`](https://github.com/b/two) | 1 |  |"), "undescribed repos still render");

  const readme = `intro\n${BEGIN}\nstale table\n${END}\noutro\n`;
  const out = spliceInto(readme, "| a |\n| - |");
  assert.ok(out.includes("| a |"), "new table lands between the markers");
  assert.ok(!out.includes("stale table"), "previous run's table is replaced, not appended");
  assert.ok(out.startsWith("intro") && out.trimEnd().endsWith("outro"), "surrounding README is untouched");
  assert.ok(spliceInto(out, "| b |").includes("| b |"), "splicing is idempotent across runs");
  assert.throws(() => spliceInto("no markers here", "x"), /missing/, "a README without markers fails loudly");

  const base = `options:\n  limit: 5\nrepos:\n  - repo: a/one\n    description: kept\n`;
  const grown = appendDiscovered(base, ["a/one", "b/two"]);
  assert.deepEqual(grown.added, ["b/two"], "only unseen repos are appended");
  assert.ok(grown.text.includes("description: kept"), "an existing description survives write-back");
  assert.ok(grown.text.includes("- repo: b/two"), "the new repo is written in");
  assert.ok(grown.text.includes("include: true"));
  assert.deepEqual(appendDiscovered(grown.text, ["a/one", "b/two"]).added, [], "write-back is idempotent");
  assert.ok(appendDiscovered("options:\n  limit: 5\n", ["x/y"]).text.includes("repos:"),
    "a config with no repos section gets one");

  const offCfg = parseConfig(`repos:\n  - repo: a/one\n    include: false\n`);
  assert.equal(truthy(offCfg.repos[0].include, true), false, "include: false parses as an off switch");

  // --- card layout ---
  assert.equal(formatStars(481893), "481.9k");
  assert.equal(formatStars(15209), "15.2k");
  assert.equal(formatStars(7000), "7k", "a round thousand drops the .0");
  assert.equal(formatStars(621), "621");
  assert.equal(formatStars(2_400_000), "2.4m");

  assert.equal(cleanDescription(":star: Vim for Visual Studio Code"), "Vim for Visual Studio Code",
    "emoji shortcodes render literally inside HTML, so they are stripped");
  assert.equal(cleanDescription(""), "");
  assert.equal(cleanDescription("x".repeat(200)).length, 110, "long descriptions are capped");
  assert.ok(cleanDescription("x".repeat(200)).endsWith("…"));

  const cards = [
    { repo: "small/lib", stars: 23, count: 1, last: "2017-10-01", language: "JavaScript", description: "" },
    { repo: "big/list", stars: 481893, count: 1, last: "2017-10-01", language: "Python",
      description: "A collective list of free APIs" },
    { repo: "mid/tool", stars: 7757, count: 2, last: "2026-09-01", language: "TypeScript",
      description: "Everything you need <script>" },
  ];
  assert.deepEqual(sortRows(cards).map((r) => r.repo), ["big/list", "mid/tool", "small/lib"],
    "stars sort leads with the biggest project, not the most recent PR");
  assert.deepEqual(sortRows(cards, "recent").map((r) => r.repo), ["small/lib", "big/list", "mid/tool"],
    "recent keeps the incoming order");
  assert.throws(() => sortRows(cards, "alphabetical"), /sort must be/);

  const html = renderCards(sortRows(cards), new Map([["big/list", "Renamed `API.AI` to Dialogflow"]]));
  assert.ok(html.includes('<a href="https://github.com/big/list"><b>big/list</b></a>'));
  assert.ok(html.includes("★ 481.9k · Python"));
  assert.ok(html.includes("A collective list of free APIs"), "the repo's own description is shown");
  assert.ok(html.includes("↳ Renamed <code>API.AI</code> to Dialogflow"), "your note sits under it");
  assert.ok(!/merged PR|2017-10/.test(html), "cards leave PR count and date off by default");
  assert.ok(html.includes("&lt;script&gt;") && !html.includes("<script>"),
    "a repo description is escaped, never injected");
  assert.equal((html.match(/<tr>/g) || []).length, 3, "one card per row by default");
  assert.ok(html.includes('<td width="100%" valign="top">'), "and that card spans the table");
  const two = renderCards(sortRows(cards), new Map(), { columns: 2 });
  assert.equal((two.match(/<tr>/g) || []).length, 2, "columns:2 packs three cards into two rows");
  assert.ok(two.includes('<td width="50%"></td>'), "an odd count is padded so the grid stays square");

  const withMeta = renderCards(cards.slice(0, 1), new Map(), { showPrCount: true, showDate: true });
  assert.ok(withMeta.includes("1 merged PR") && withMeta.includes("2017-10"), "both can be opted back in");

  // --- minor rows: listed last, no note ---
  const tiered = sortRows([
    { repo: "huge/docs", stars: 480000, minor: true },
    { repo: "small/code", stars: 20 },
    { repo: "mid/code", stars: 900 },
    { repo: "tiny/docs", stars: 5, minor: true },
  ]);
  assert.deepEqual(tiered.map((r) => r.repo), ["mid/code", "small/code", "huge/docs", "tiny/docs"],
    "a minor repo sorts below every real contribution, however many stars it has");
  const minorHtml = renderCards([{ repo: "huge/docs", stars: 480000, minor: true, last: "2017-01-01",
    description: "A big list" }], new Map([["huge/docs", "Renamed a thing"]]));
  assert.ok(minorHtml.includes("A big list"), "the project's own description still shows");
  assert.ok(!minorHtml.includes("Renamed a thing"), "but the note about what you did is dropped");
  const minorMd = renderMarkdown([{ repo: "a/b", count: 1, last: "2017-01-01", minor: true }],
    new Map([["a/b", "note"]]));
  assert.ok(!minorMd.includes("note"), "the table layout drops it too");

  console.log("contributions.mjs: all checks passed");
} else {
  await main();
}
