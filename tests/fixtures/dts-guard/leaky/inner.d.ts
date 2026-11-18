import type { Effect } from 'effect';
import type { HttpClient } from '@effect/platform';
import type { Observable } from 'rxjs';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js/types';
import type { WalletFacade } from '@midnightntwrk/wallet-sdk-facade';

export declare const run: Effect.Effect<number>;
export declare const client: HttpClient.HttpClient;
export declare const state: Observable<MidnightProviders>;
export declare const wallet: WalletFacade;
