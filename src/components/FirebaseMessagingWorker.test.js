import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const worker = readFileSync(new URL('../../public/firebase-messaging-sw.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('../../public/firebase-messaging-sw-core.js', import.meta.url), 'utf8');

test('messaging worker uses data-only payloads and event-id deduplication', () => {
  assert.match(worker, /payload\.data/);
  assert.match(worker, /rememberEvent/);
  assert.doesNotMatch(worker, /payload\.notification/);
  assert.match(core, /pairing=requests/);
  assert.match(core, /photoId/);
});
