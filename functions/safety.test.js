import assert from 'node:assert/strict';
import test from 'node:test';

import { isCaptionAllowed, validateReportInput } from './safety.js';

test('caption safety rejects configured abusive patterns but permits ordinary captions', () => {
  assert.equal(isCaptionAllowed('good morning ☕'), true);
  assert.equal(isCaptionAllowed('i will kill you'), false);
});

test('report input requires a supported reason and photo id', () => {
  assert.doesNotThrow(() => validateReportInput({ photoId: 'p1', reason: 'abuse' }));
  assert.throws(() => validateReportInput({ photoId: '', reason: 'abuse' }), /photo/i);
  assert.throws(() => validateReportInput({ photoId: 'p1', reason: 'made-up' }), /reason/i);
});
