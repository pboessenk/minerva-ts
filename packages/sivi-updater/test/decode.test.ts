import { describe, expect, it } from 'vitest';
import { decodeCodelistWrapper, decodeDatacatWrapper, decodeText } from '../src/decode.ts';

function decodeError(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  return '(no error)';
}

describe('catalogue decoding', () => {
  it('names the field and both types when a value has the wrong type', () => {
    expect(decodeError(() => decodeText('{"Items": [{"Name": 5}]}', decodeCodelistWrapper))).toBe(
      'codelist.Name: expected string, found number',
    );
    expect(decodeError(() => decodeText('{"Items": [{"Code": [{"CodeValue": true}]}]}', decodeCodelistWrapper))).toBe(
      'code.CodeValue: expected string, found boolean',
    );
    expect(decodeError(() => decodeText('{"Entity": [{"EntityType": {}}]}', decodeDatacatWrapper))).toBe(
      'entity.EntityType: expected array, found object',
    );
    expect(decodeError(() => decodeText('[]', decodeDatacatWrapper))).toBe('datacat file: expected object, found array');
  });

  it('ignores unknown keys, matches names case-insensitively and skips null', () => {
    expect(decodeText('{"items": [{"NAME": "A", "Extra": 1, "Description": null}]}', decodeCodelistWrapper)).toEqual([
      { Name: 'A', Description: '', Code: null },
    ]);
  });
});
