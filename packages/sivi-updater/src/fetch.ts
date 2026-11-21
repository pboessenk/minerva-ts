import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeCodelistWrapper, decodeDatacatWrapper, decodeText } from './decode.ts';
import type { Catalogue, ClItem, DcEntity } from './types.ts';

export const CODELIST_URL = 'https://www.sivi.org/afd-online/assets/codelist.json';
export const DATACAT_URL = 'https://www.sivi.org/afd-online/assets/datacat.json';

export const CODELIST_FILE = 'codelist.json';
export const DATACAT_FILE = 'datacat.json';

/** Where the upstream catalogue comes from; injectable so tests never use the network. */
export interface Source {
  codelists(): Promise<ClItem[]>;
  datacat(): Promise<DcEntity[]>;
}

const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });

async function fetchText(url: string): Promise<string> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (resp.status !== 200) throw new Error(`HTTP ${resp.status} from ${url}`);
  return decoder.decode(await resp.arrayBuffer());
}

/** The public SIVI site. */
export function networkSource(): Source {
  return {
    codelists: async () => decodeText(await fetchText(CODELIST_URL), decodeCodelistWrapper),
    datacat: async () => decodeText(await fetchText(DATACAT_URL), decodeDatacatWrapper),
  };
}

/** A directory holding `codelist.json` and `datacat.json`. */
export function directorySource(dir: string): Source {
  const read = async (file: string): Promise<string> => decoder.decode(await readFile(join(dir, file)));
  return {
    codelists: async () => decodeText(await read(CODELIST_FILE), decodeCodelistWrapper),
    datacat: async () => decodeText(await read(DATACAT_FILE), decodeDatacatWrapper),
  };
}

export class FetchError extends Error {
  readonly what: 'codelists' | 'datacat';
  constructor(what: 'codelists' | 'datacat', cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.what = what;
  }
}

/** Fetches both files. Throws {@link FetchError} naming the one that failed. */
export async function fetchCatalogue(source: Source): Promise<Catalogue> {
  let codelists: ClItem[];
  try {
    codelists = await source.codelists();
  } catch (e) {
    throw new FetchError('codelists', e);
  }
  let datacat: DcEntity[];
  try {
    datacat = await source.datacat();
  } catch (e) {
    throw new FetchError('datacat', e);
  }
  return { codelists, datacat };
}
