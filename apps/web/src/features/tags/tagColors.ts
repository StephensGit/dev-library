// Tags have no colour in the database, so each name maps to a stable colour here.
const knownColors: Record<string, string> = {
  docker: '#6f9cff',
  git: '#f0916a',
  postgres: '#a48bf5',
  postgresql: '#a48bf5',
  pnpm: '#f2cf5b',
  shell: '#7fdcb3',
};

const palette = ['#6f9cff', '#f0916a', '#a48bf5', '#f2cf5b', '#7fdcb3', '#f27fae', '#5fcde4', '#c3d96b'];

export function tagColor(name: string) {
  const key = name.toLowerCase();

  if (knownColors[key]) {
    return knownColors[key];
  }

  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return palette[hash % palette.length];
}
