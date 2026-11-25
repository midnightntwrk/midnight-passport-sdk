import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { LocalStore } from '@midnight-ntwrk/mn-passport-core';

const ENTRY = 'mnp-';
const TEMP = '.tmp-';
// A file name has at most 255 bytes, and a key byte takes two hex digits.
const MAX_KEY_BYTES = 120;
// Windows has no such flag, so there a planted link is not refused.
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

const isMissing = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

function fileName(key: string): string {
  // A lone surrogate encodes as U+FFFD, so two keys would share one file.
  if (/\p{Cs}/u.test(key)) throw new TypeError('A store key must be well-formed UTF-16.');
  const bytes = Buffer.from(key, 'utf8');
  if (bytes.length > MAX_KEY_BYTES) {
    throw new TypeError(`A store key has at most ${MAX_KEY_BYTES} UTF-8 bytes.`);
  }
  return ENTRY + bytes.toString('hex');
}

function keyOf(name: string): string | undefined {
  if (!name.startsWith(ENTRY)) return undefined;
  const hex = name.slice(ENTRY.length);
  if (!/^(?:[0-9a-f]{2})*$/.test(hex)) return undefined;
  return Buffer.from(hex, 'hex').toString('utf8');
}

const ownFile = (name: string): boolean =>
  keyOf(name) !== undefined || /^\.tmp-[0-9a-f]{16}$/.test(name);

// Another user who can write to the folder can plant or swap entries.
async function checkDir(dir: string): Promise<void> {
  const info = await stat(dir).catch((error: unknown) => {
    if (isMissing(error)) return undefined;
    throw error;
  });
  const uid = process.getuid?.();
  if (info && uid !== undefined && (info.uid !== uid || (info.mode & 0o022) !== 0)) {
    throw new Error('storeDir must belong to this user, and only this user can write to it.');
  }
}

async function syncDir(dir: string): Promise<void> {
  // Windows cannot open a folder to sync it.
  if (process.platform === 'win32') return;
  const handle = await open(dir, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export function fileStore(storeDir: string): LocalStore {
  const dir = resolve(storeDir);
  const names = async (): Promise<string[]> => {
    try {
      return await readdir(dir);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  };
  const remove = async (name: string): Promise<void> => {
    try {
      await unlink(join(dir, name));
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  };

  return {
    async get(key) {
      const path = join(dir, fileName(key));
      await checkDir(dir);
      const handle = await open(path, constants.O_RDONLY | NO_FOLLOW).catch((error: unknown) => {
        if (isMissing(error)) return undefined;
        throw error;
      });
      if (!handle) return undefined;
      try {
        return new Uint8Array(await handle.readFile());
      } finally {
        await handle.close();
      }
    },
    async set(key, value) {
      const target = join(dir, fileName(key));
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await checkDir(dir);
      const temp = TEMP + randomBytes(8).toString('hex');
      try {
        await writeFile(join(dir, temp), value, { mode: 0o600, flag: 'wx', flush: true });
        await rename(join(dir, temp), target);
        // Without this, a set that resolved can roll back after a power loss.
        await syncDir(dir);
      } catch (error) {
        await remove(temp);
        throw error;
      }
    },
    async delete(key) {
      const name = fileName(key);
      await checkDir(dir);
      await remove(name);
    },
    async keys() {
      await checkDir(dir);
      return (await names()).flatMap((name) => keyOf(name) ?? []);
    },
    async wipe() {
      await checkDir(dir);
      const errors: unknown[] = [];
      for (const name of await names()) {
        if (ownFile(name)) await remove(name).catch((error: unknown) => errors.push(error));
      }
      if (errors.length > 0) throw new AggregateError(errors, 'wipe could not remove each entry.');
    },
  };
}
