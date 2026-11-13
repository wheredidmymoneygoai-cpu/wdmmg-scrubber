import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeFallbackLines, preambleHolderLines, SENSITIVE_HEADER } from '../src/csv-columns';
import { findHolderNames, scrubStatementText } from '../src/scrubber';

const rows = (csv: string) => csv.split('\n').map((l) => l.split(','));
const sent = (lines: string[]) => {
  const text = lines.join('\n');
  return scrubStatementText(text, findHolderNames(text), { scrub: false }).scrubbedLines.join('\n');
};

test('a layout nobody recognises never keeps a cardholder or account number column', () => {
  const out = sent(safeFallbackLines(rows(`when,what,howmuch,who,acct
1 Oct,coffee,4.00,Bruce Wayne,ACC-4421-0098
2 Oct,books,12.00,Bruce Wayne,ACC-4421-0098`)));
  for (const gone of ['Bruce Wayne', 'ACC-4421-0098']) assert.ok(!out.includes(gone), `${gone} was kept:\n${out}`);
  for (const kept of ['coffee', '4.00', 'books', '12.00']) assert.ok(out.includes(kept), `${kept} went missing`);
});

test('lines above the table are dropped, and the name in them is removed everywhere', () => {
  const out = sent(safeFallbackLines(rows(`Account Name: Jane Doe
Account No: 00112233445566
Txn,Cust_Name,Acct_Identifier,Narration,Debits
01/10/2026,Jane Doe,00112233445566,UPI-SWIGGY,450.00
02/10/2026,Jane Doe,00112233445566,UPI/DR/123/JANE DOE/SELF,2000.00`)));
  for (const gone of ['Jane Doe', 'JANE DOE', '00112233445566']) assert.ok(!out.includes(gone), `${gone} was kept:\n${out}`);
  for (const kept of ['UPI-SWIGGY', '450.00', '2000.00']) assert.ok(out.includes(kept), `${kept} went missing`);
});

test('the holder is read from "Account Name: …" style lines', () => {
  assert.deepEqual(preambleHolderLines([['Account Name: Jane Doe'], ['Branch: MG Road']]), ['Account Holder: Jane Doe']);
});

test('sensitive column names are recognised, a payee "Name" column is not', () => {
  for (const h of ['Card Member', 'Account Number', 'IBAN', 'Email', 'cust name']) assert.ok(SENSITIVE_HEADER.test(h), h);
  assert.ok(!SENSITIVE_HEADER.test('Name'));
});
