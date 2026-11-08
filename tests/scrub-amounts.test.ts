import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrubStatementText } from '../src/scrubber';

const scrub = (line: string, full = false) => scrubStatementText(line, [], { scrub: full }).scrubbedLines.join('\n');

test('a reference number followed by the amount keeps the amount', () => {
  for (const full of [false, true]) {
    const out = scrub('05/10/2026 UPI-BLINKIT-blinkit@ybl-HDFC0001234-427812345678 435.00 DR', full);
    assert.match(out, /\b435\.00 DR$/, out);
    assert.doesNotMatch(out, /427812345678/);
    assert.match(scrub('06/10/2026 NEFT 427812345678 1,200.00', full), /\b1,200\.00$/);
  }
});

test('card numbers are still removed in every common layout', () => {
  assert.match(scrub('07/10/2026 POS 4111 1111 1111 1111 STARBUCKS 310.00 DR'), /POS \[REDACTED_CARD\] STARBUCKS 310\.00 DR/);
  assert.match(scrub('07/10/2026 POS 4111-1111-1111-1111 STARBUCKS 310.00'), /\[REDACTED_CARD\] STARBUCKS 310\.00/);
  assert.doesNotMatch(scrub('07/10/2026 CARD 4111111111111111 AMAZON 99.00'), /4111111111111111/);
  // American Express, written 4-6-5.
  assert.doesNotMatch(scrub('07/10/2026 3782 822463 10005 UBER 12.00'), /822463\s*10005/);
});
