import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ArtifactIntegrityError,
  ArtifactManifestError,
  ArtifactPinError,
  MANIFEST_FILE,
  openAccArtifact,
} from '@midnight-ntwrk/mn-passport-contract';

const hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

const FILES = new Map([
  ['contract/index.js', ascii('export const x = 1;\n')],
  ['keys/a.verifier', Uint8Array.of(1, 2, 3)],
  ['zkir/a.bzkir', Uint8Array.of(9, 8)],
  ['keys/a.prover', Uint8Array.of(5)],
]);

const BASE = {
  schema: 1,
  source: { repository: 'midnightntwrk/passport', commit: 'c', path: 'account.compact' },
  toolchain: { compiler: '0.36.1', compilerCommit: 'a', language: 'l', runtime: 'r', zkir: 'z' },
  originLength: 21,
  circuits: { shared: ['a'], jubjub: [], k256: [], p256: [] },
  waveOne: { jubjub: ['a'], k256: ['a'], p256: ['a'] },
  files: Object.fromEntries(
    [...FILES].map(([path, bytes]) => [path, { size: bytes.length, sha256: hex(bytes) }]),
  ),
};

function fakeArtifact(manifest = JSON.stringify(BASE), files = FILES) {
  const reads: string[] = [];
  const all = new Map([[MANIFEST_FILE, ascii(manifest)], ...files]);
  const read = async (path: string): Promise<Uint8Array> => {
    reads.push(path);
    return all.get(path) ?? assert.fail(`no file ${path}`);
  };
  return { read, reads, pin: hex(ascii(manifest)) };
}

const refusal =
  (file: string, reason: ArtifactIntegrityError['reason']) =>
  (e: unknown): boolean =>
    e instanceof ArtifactIntegrityError && e.file === file && e.reason === reason;

test('open reads the manifest only, and derives the binding version from it', async () => {
  const { read, reads, pin } = fakeArtifact();
  const artifact = await openAccArtifact(read, pin);
  assert.deepEqual(reads, [MANIFEST_FILE]);
  assert.deepEqual(artifact.binding, { compiler: '0.36.1', manifestHash: pin, originLength: 21 });
});

test('a manifest with the same content in another layout is refused', async () => {
  const { pin } = fakeArtifact();
  const { read } = fakeArtifact(JSON.stringify(BASE, null, 2));
  await assert.rejects(
    openAccArtifact(read, pin),
    (e: unknown) => e instanceof ArtifactPinError && e.expected === pin,
  );
});

test('one changed byte in any listed file is refused, and the error names the file', async () => {
  for (const [path, bytes] of FILES) {
    if (path.endsWith('.prover')) continue;
    const intact = fakeArtifact();
    assert.deepEqual(await (await openAccArtifact(intact.read, intact.pin)).read(path), bytes);
    const changed = new Map(FILES).set(
      path,
      bytes.map((b, i) => (i === 0 ? b ^ 1 : b)),
    );
    const { read, pin } = fakeArtifact(JSON.stringify(BASE), changed);
    await assert.rejects((await openAccArtifact(read, pin)).read(path), refusal(path, 'hash'));
  }
});

test('a proving key or an unlisted path is refused before the reader is called', async () => {
  const { read, reads, pin } = fakeArtifact();
  const artifact = await openAccArtifact(read, pin);
  await assert.rejects(artifact.read('keys/a.prover'), refusal('keys/a.prover', 'proving-key'));
  for (const path of ['contract/other.js', '__proto__', 'constructor', `../${MANIFEST_FILE}`]) {
    await assert.rejects(artifact.read(path), refusal(path, 'unlisted'));
  }
  assert.deepEqual(reads, [MANIFEST_FILE]);
});

test('a pinned manifest with a bad shape is refused and names the field', async () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ schema: 2 }, 'schema'],
    [{ originLength: -1 }, 'originLength'],
    [{ files: { 'a.js': { size: 1, sha256: 'ABC' } } }, 'files.a.js.sha256'],
    [{ waveOne: { jubjub: [], k256: [] } }, 'waveOne.p256'],
  ];
  for (const [patch, field] of cases) {
    const { read, pin } = fakeArtifact(JSON.stringify({ ...BASE, ...patch }));
    await assert.rejects(
      openAccArtifact(read, pin),
      (e: unknown) => e instanceof ArtifactManifestError && e.field === field,
    );
  }
});
