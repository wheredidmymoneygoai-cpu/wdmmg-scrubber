import test from 'node:test';
import assert from 'node:assert/strict';
import { findHolderNames, scrubStatementText } from '../src/scrubber';

const STATEMENT = [
  'Account Holder: MR RAHUL SHARMA',
  'Address: 12 MG Road, Pune 411001',
  'Customer ID: 88123456',
  'Statement of Account 01/09/2026 to 30/09/2026',
  '03/09/2026 UPI-SWIGGY-swiggy@ybl-HDFC0001234-9876 DEBIT 450.00',
  '05/09/2026 UPI-ANKITA VERMA-ankita@okaxis-SBIN0001 DEBIT 1200.00',
  '07/09/2026 NEFT CR RAHUL SHARMA SALARY CREDIT 55000.00',
  '09/09/2026 Rahul Sharma ATM WITHDRAWAL DEBIT 2000.00',
].join('\n');

test('finds the account holder from the header, without the title', () => {
  assert.deepEqual(findHolderNames(STATEMENT), ['RAHUL SHARMA']);
});

test('hides only the visitor name and personal header details', () => {
  const { scrubbedLines } = scrubStatementText(STATEMENT, [], { scrub: false });
  const text = scrubbedLines.join('\n');
  assert.ok(!/RAHUL|Rahul|Sharma|SHARMA/.test(text), text);
  assert.ok(!/MG Road|88123456/.test(text), text);
  assert.ok(/SWIGGY/i.test(text), 'shops stay');
  assert.ok(/ANKITA VERMA/i.test(text), 'other people stay');
  assert.ok(/450\.00/.test(text) && /55000\.00/.test(text), 'amounts stay');
});

test('a statement with no header name is left as it was', () => {
  const { scrubbedLines } = scrubStatementText('03/09/2026 Zomato DEBIT 300.00', [], { scrub: false });
  assert.deepEqual(scrubbedLines, ['03/09/2026 Zomato DEBIT 300.00']);
});

test('the US ACH account holder is hidden in the default mode', () => {
  const { scrubbedLines } = scrubStatementText('09/03/2026 ACH CREDIT ACME INDN:JOHN DOE CO ID:123 500.00', [], { scrub: false });
  assert.ok(!/JOHN DOE/.test(scrubbedLines.join('')));
});
