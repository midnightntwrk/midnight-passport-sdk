import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BINDINGS, type BindingRow } from '@midnight-ntwrk/mn-passport-contract';

interface Manifest {
  source: { commit: string };
  toolchain: { compiler: string; language: string; runtime: string; zkir: string };
  originLength: number;
}

const GENERATED = new URL('../generated/', import.meta.url);
export const DOC: URL = new URL('../../../docs/compatibility.md', import.meta.url);
const START =
  '<!-- Generated from BINDINGS. After a build, run: node packages/contract/dist-test/binding-rows.js -->';
const END = '<!-- End of the generated rows. -->';

export async function renderRows(table: readonly BindingRow[] = BINDINGS): Promise<string> {
  const manifests = new Map<string, Manifest>();
  for (const name of await readdir(GENERATED)) {
    const bytes = await readFile(new URL(name, GENERATED));
    manifests.set(
      createHash('sha256').update(bytes).digest('hex'),
      JSON.parse(bytes.toString()) as Manifest,
    );
  }
  const rows = table.map(({ manifestHash, status }) => {
    const m = manifests.get(manifestHash);
    if (!m) throw new Error(`no manifest in generated/ hashes to ${manifestHash}`);
    const cells = [
      'dev (unreleased)',
      `passport \`${m.source.commit.slice(0, 7)}\``,
      '—',
      m.toolchain.compiler,
      `\`${manifestHash.slice(0, 8)}…\``,
      String(m.originLength),
      m.toolchain.language,
      m.toolchain.runtime,
      m.toolchain.zkir,
      status,
    ];
    return `| ${cells.join(' | ')} |`;
  });
  return [
    '| SDK | ACC binding | Compact CLI | Compiler | Manifest hash | Origin length | Language | Runtime (`@midnight-ntwrk/compact-runtime`) | zkir | Status |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

/** Throws when the doc does not have the two markers in order. */
export function withRows(doc: string, rows: string): string {
  const start = doc.indexOf(START);
  const end = doc.indexOf(END, start);
  if (start < 0 || end < 0) throw new Error('docs/compatibility.md has no generated-rows markers');
  return `${doc.slice(0, start)}${START}\n${rows}\n${doc.slice(end)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeFile(DOC, withRows(await readFile(DOC, 'utf8'), await renderRows()));
}
