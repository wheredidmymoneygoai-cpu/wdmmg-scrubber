import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrubStatementText } from '../src/scrubber';

const run = (t: string) => scrubStatementText(t, [], { scrub: false }).scrubbedLines.join('\n');

test('an account number after its label is removed, in any format', () => {
  const out = run(`01/10/2026 | TRANSFER acct 12345678 | DEBIT 50.00
04/10/2026 | acct# XXXX9921 fee | DEBIT 2.00
06/10/2026 | Account Number ACC-4421-0098 | DEBIT 1.00`);
  for (const leak of ['12345678', 'XXXX9921', 'ACC-4421-0098']) assert.ok(!out.includes(leak), leak);
  for (const kept of ['50.00', '2.00', '1.00', 'TRANSFER', 'fee']) assert.ok(out.includes(kept), kept);
});

test('amounts, last fours and ordinary words after "account" or "card" are kept', () => {
  const t = `05/10/2026 | Account 12.50 adjustment | DEBIT 12.50
07/10/2026 | ACCOUNT TRANSFER TO SAVINGS | DEBIT 100.00
08/10/2026 | CARD 4821 PURCHASE AMAZON | DEBIT 9.99
03/10/2026 | Account ending in 4821 refund | CREDIT 5.00`;
  assert.equal(run(t), t);
});
