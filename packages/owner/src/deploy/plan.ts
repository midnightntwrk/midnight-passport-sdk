import type { AccArm, AccManifest } from '@midnight-ntwrk/mn-passport-contract';
import { PassportError } from '@midnight-ntwrk/mn-passport-core';

export type WaveKind = 'deploy' | 'update';

/** The largest share of any block limit that the wave's transaction uses. */
export type WavePrice = (kind: WaveKind, circuits: readonly string[]) => number;

export interface BirthPlan {
  /** From the manifest. It fixes the address, so it is never repacked. */
  readonly waveOne: readonly string[];
  /** One maintenance update each, in counter order. */
  readonly updates: readonly (readonly string[])[];
}

export class WaveTooLargeError extends PassportError {
  readonly _tag = 'WaveTooLargeError';
  readonly code = 'WAVE_TOO_LARGE';
  readonly circuits: readonly string[];

  constructor(circuits: readonly string[]) {
    super(`The wave [${circuits.join(', ')}] does not fit in a block within the headroom.`);
    this.name = 'WaveTooLargeError';
    this.circuits = circuits;
  }
}

/** Packs in the given order. Each wave is as large as fits. */
export function packWaves(
  circuits: readonly string[],
  price: WavePrice,
  headroom: number,
): (readonly string[])[] {
  const waves: string[][] = [];
  let current: string[] = [];
  for (const circuit of circuits) {
    const next = [...current, circuit];
    if (price('update', next) <= headroom) {
      current = next;
      continue;
    }
    if (current.length === 0) throw new WaveTooLargeError([circuit]);
    waves.push(current);
    current = [circuit];
    if (price('update', current) > headroom) throw new WaveTooLargeError(current);
  }
  if (current.length > 0) waves.push(current);
  return waves;
}

export interface BirthPlanOptions {
  readonly manifest: Pick<AccManifest, 'circuits' | 'waveOne'>;
  readonly arm: AccArm;
  readonly price: WavePrice;
  /** The rest of each block stays free for the sponsor's fee and other transactions. */
  readonly headroom?: number;
  /** Circuits to add right after the birth set, such as the grant-spend set. */
  readonly then?: readonly string[];
}

/** The birth set is the shared circuits and the circuits of one arm. */
export function planBirth(options: BirthPlanOptions): BirthPlan {
  const { manifest, arm, price } = options;
  const headroom = options.headroom ?? 0.5;
  if (!(headroom > 0 && headroom <= 1)) throw new RangeError('headroom must be in (0, 1].');
  const waveOne = manifest.waveOne[arm];
  if (price('deploy', waveOne) > headroom) throw new WaveTooLargeError(waveOne);
  const birth = [...manifest.circuits.shared, ...manifest.circuits[arm]];
  const rest = birth.filter(
    (circuit, i, all) => !waveOne.includes(circuit) && all.indexOf(circuit) === i,
  );
  const then = (options.then ?? []).filter((circuit) => !birth.includes(circuit));
  return {
    waveOne,
    updates: [...packWaves(rest, price, headroom), ...packWaves(then, price, headroom)],
  };
}
