/** Which response of an operation an example's response body belongs to. */
import type { ApiOp } from './types.ts';
import { escapeHtml } from '../base/ui.ts';
export function defaultRespCode(op: ApiOp | undefined | null): string {
  if (!op || !op.responses) return '';
  for (const [code, resp] of Object.entries(op.responses)) {
    if (code.startsWith('2') && resp.schema) return code;
  }
  return '';
}

export function respSchemaForCode(op: ApiOp | undefined | null, code: string): { entity: string | null; isArray: boolean } {
  if (!op || !op.responses || !code) return { entity: null, isArray: false };
  const resp = op.responses[code];
  if (resp && resp.schema) {
    return { entity: resp.schema, isArray: !!resp.responseBodyArray };
  }
  return { entity: null, isArray: false };
}

export function buildRespCodeOptions(op: ApiOp | undefined | null, selectedCode: string): string {
  if (!op || !op.responses) return '';
  const codes = Object.entries(op.responses)
    .filter(([, resp]) => resp.schema)
    .map(([code, resp]) => {
      const label = `${code} \u2014 ${resp.schema}${resp.responseBodyArray ? '[]' : ''}`;
      const sel = code === selectedCode ? ' selected' : '';
      return `<option value="${escapeHtml(code)}"${sel}>${escapeHtml(label)}</option>`;
    });
  return codes.join('');
}
