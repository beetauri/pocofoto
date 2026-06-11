import assert from 'node:assert/strict';
import test from 'node:test';

import { withTimeout } from './promiseTimeout.js';

test('withTimeout resolves when the wrapped promise settles in time', async () => {
  const result = await withTimeout(Promise.resolve('sent'), 50);

  assert.equal(result, 'sent');
});

test('withTimeout rejects when the wrapped promise stays pending', async () => {
  await assert.rejects(
    () => withTimeout(new Promise(() => {}), 5, () => new Error('send timed out')),
    /send timed out/
  );
});
