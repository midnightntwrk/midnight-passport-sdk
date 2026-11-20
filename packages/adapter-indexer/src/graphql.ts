import { IndexerUnreachableError, type CallOptions } from '@midnight-ntwrk/mn-passport-core';
import { isRecord, postJson, type Data, type Endpoint } from './transport.js';

/** A caller abort rejects with `CancelledError`, also after the request started. */
export async function query(
  endpoint: Endpoint,
  document: string,
  variables: Data,
  options?: CallOptions,
): Promise<Data> {
  const parsed = await postJson(endpoint, { query: document, variables }, options);
  // A partial answer with errors could hide a field, so it is never "not found".
  if (parsed.errors !== undefined && parsed.errors !== null) {
    throw new IndexerUnreachableError('response');
  }
  if (!isRecord(parsed.data)) throw new IndexerUnreachableError('response');
  return parsed.data;
}
