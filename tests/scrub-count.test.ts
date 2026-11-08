import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countDetailsLeftOut, scrubStatementText } from '../src/scrubber';

const phonePe = [
  'Transaction Statement for 9876543210',
  'Oct 21, 2026 | Paid to Blinkit | DEBIT | ₹435',
  '07:09 pm | Transaction ID T2610211909123456789012',
  'UTR No. 123456789012',
  'Paid by | XXXXXX1234',
].join('\n');

test('app statements count the IDs, UTRs, masked accounts and phone they leave out', () => {
  const kept = '2026-10-21 07:09 PM | Paid to Blinkit | DEBIT 435.00 INR';
  assert.equal(countDetailsLeftOut(phonePe, kept), 4);
  assert.equal(countDetailsLeftOut(kept, kept), 0);
});

test('country codes are not left in front of a hidden phone number', () => {
  const r = scrubStatementText('06/10/2026 Phone +91 98765 43210 recharge AIRTEL 299.00', [], { scrub: false });
  assert.equal(r.scrubbedLines[0], '06/10/2026 Phone [REDACTED_PHONE] recharge AIRTEL 299.00');
});

test('the holder name found in the header is returned so the visitor can see it was hidden', () => {
  const r = scrubStatementText('Account Holder: MR RAHUL SHARMA\n01/10/2026 UPI/RAHUL SHARMA/self 500.00', [], { scrub: false });
  assert.deepEqual(r.holderNames, ['RAHUL SHARMA']);
  assert.ok(!r.scrubbedLines.join('\n').includes('RAHUL'));
});
