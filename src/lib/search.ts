import type { PartInfo, SystemInfo } from '../core/types';

/** Edit distance (insert / delete / substitute), small strings only. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const SYNONYMS: Record<string, string> = {
  left: 'port',
  right: 'starboard',
  l: 'port',
  r: 'starboard',
  engine: 'turbine',
  engines: 'turbine',
  piston: 'actuator',
  pistons: 'actuator',
  hydraulics: 'hydraulic',
};

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

interface Indexed {
  part: PartInfo;
  nameTokens: string[];
  tokens: string[];
  name: string;
}

const INDEXES = new WeakMap<PartInfo[], Indexed[]>();

function indexFor(parts: PartInfo[], systems: SystemInfo[]): Indexed[] {
  let index = INDEXES.get(parts);
  if (!index) {
    index = parts.map((part) => {
      const sys = systems.find((s) => s.id === part.system)?.label ?? '';
      const nameTokens = tokenize(part.name);
      const tokens = Array.from(new Set([
        ...nameTokens,
        ...tokenize(part.id),
        ...tokenize(part.category),
        ...tokenize(sys),
        ...(part.aliases ?? []).flatMap(tokenize),
      ]));
      return { part, nameTokens, tokens, name: part.name.toLowerCase() };
    });
    INDEXES.set(parts, index);
  }
  return index;
}

/** Score one query token against a list of words; 0 = no match. */
function tokenScore(q: string, words: string[]): number {
  let best = 0;
  for (const w of words) {
    let s = 0;
    if (w === q) s = 3;
    else if (w.startsWith(q)) s = q.length >= 2 ? 2.2 : 1.2;
    else if (q.length >= 4 && w.includes(q)) s = 1.5;
    else if (q.length >= 4 && w.length >= 4) {
      const d = levenshtein(q, w.slice(0, Math.max(q.length, Math.min(w.length, q.length + 1))));
      const full = levenshtein(q, w);
      const dist = Math.min(d, full);
      if (dist <= (q.length >= 7 ? 2 : 1)) s = 1.1 - dist * 0.2;
    }
    if (s > best) best = s;
  }
  return best;
}

/** Ranked fuzzy search over every named part (exterior and internal). */
export function searchParts(query: string, parts: PartInfo[], systems: SystemInfo[], limit = 8): PartInfo[] {
  const q = tokenize(query).map((t) => SYNONYMS[t] ?? t);
  if (!q.length) return [];
  const phrase = query.trim().toLowerCase();

  const scored = indexFor(parts, systems).map((entry) => {
    let total = 0;
    let matched = 0;
    for (const t of q) {
      // Name hits count more than alias/category hits.
      const s = Math.max(tokenScore(t, entry.nameTokens) * 1.15, tokenScore(t, entry.tokens));
      if (s > 0) matched++;
      total += s;
    }
    if (phrase.length >= 3 && entry.name.includes(phrase)) total += 2;
    if (phrase.length >= 3 && entry.name.startsWith(phrase)) total += 1;
    return { entry, total, matched };
  }).filter((r) => r.total > 0);

  const all = scored.filter((r) => r.matched === q.length);
  const pool = all.length ? all : scored.filter((r) => r.matched >= Math.ceil(q.length / 2));
  return pool
    .sort((a, b) => b.total - a.total || a.entry.name.length - b.entry.name.length)
    .slice(0, limit)
    .map((r) => r.entry.part);
}
