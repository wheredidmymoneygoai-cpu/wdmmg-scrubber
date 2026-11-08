/**
 * Default scrubbing mode (30 Oct 2026): names are kept so reports stay accurate, but numbers and contact
 * details are always removed. Full mode (SCRUB_PII=1) also hides names. All data here is made up.
 *
 * Run: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrubStatementText } from '../src/scrubber';

const LINES = [
  '2026-09-01 11:18 AM | Received from Mr Ashutosh Tiwari | CREDIT 32000.00 INR',
  '02/09/2026 UPI-BLINKIT-blinkit@ybl-YESB0001234-123456789012 Rs 473.00',
  '03/09/2026 UPI-9876543210@ybl-PAYMENT Rs 250.00',
  '04/09/2026 Card 4111 1111 1111 1111 AMAZON Rs 1,299.00',
  '05/09/2026 Refund call +91 98765 43210 or help@example.com Rs 99.00',
  '06/09/2026 UPI-rahul.s@okaxis-Dinner Rs 600.00',
].join('\n');

function clean(scrub: boolean, hide: string[] = []) {
  return scrubStatementText(LINES, hide, { scrub }).scrubbedLines.join('\n');
}

test('default mode keeps names of people and shops', () => {
  const out = clean(false);
  assert.match(out, /Received from Mr Ashutosh Tiwari/);
  assert.match(out, /BLINKIT/);
  assert.match(out, /AMAZON/);
  // A UPI ID made from a name only shows the name, which is kept.
  assert.match(out, /rahul\.s@okaxis/);
  assert.match(out, /blinkit@ybl/);
});

test('default mode removes account, card and phone numbers, bank codes and emails', () => {
  const out = clean(false);
  assert.doesNotMatch(out, /4111/, 'card number left in');
  assert.doesNotMatch(out, /123456789012/, 'account number left in');
  assert.doesNotMatch(out, /YESB0001234/, 'IFSC left in');
  assert.doesNotMatch(out, /98765 43210/, 'phone number left in');
  assert.doesNotMatch(out, /9876543210@ybl/, 'phone-based UPI ID left in');
  assert.doesNotMatch(out, /help@example\.com/, 'email left in');
});

test('default mode keeps amounts and dates readable', () => {
  const out = clean(false);
  for (const s of ['32000.00', '473.00', '250.00', '1,299.00', '99.00', '600.00', '2026-09-01', '06/09/2026']) {
    assert.ok(out.includes(s), `lost ${s}`);
  }
});

test('names the visitor asks to hide are hidden in default mode', () => {
  const out = clean(false, ['Ashutosh Tiwari']);
  assert.doesNotMatch(out, /Ashutosh|Tiwari/);
});

test('full mode (SCRUB_PII=1) still removes the numbers', () => {
  const out = clean(true);
  assert.doesNotMatch(out, /4111|123456789012|YESB0001234|98765 43210|help@example\.com/);
});
