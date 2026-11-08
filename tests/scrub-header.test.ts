import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrubStatementText } from '../src/scrubber';

const STATEMENT = [
  'HDFC BANK LTD   Statement of Account 01/10/2026 to 31/10/2026',
  'MR RAHUL SHARMA',
  'Flat 402, Sunrise Apartments, Baner Road',
  'Pune 411045 Maharashtra',
  'Customer ID: 88123456   Date of Birth: 14/03/1996',
  '742 Evergreen Terrace, Springfield, IL 62704',
  'Opening Balance 12,000.00',
  '05/10/2026 UPI-BLINKIT-blinkit@ybl 435.00 DR',
  // The header again on page 2
  'Flat 402, Sunrise Apartments, Baner Road',
  'Pune 411045 Maharashtra',
  '06/10/2026 POS STARBUCKS 310.00 DR',
].join('\n');

for (const full of [false, true]) {
  test(`header is dropped (address, PIN/ZIP, date of birth), title and totals kept${full ? ' (full mode)' : ''}`, () => {
    const out = scrubStatementText(STATEMENT, [], { scrub: full }).scrubbedLines.join('\n');
    assert.doesNotMatch(out, /Sunrise|411045|Evergreen|62704|1996|88123456/);
    assert.match(out, /Statement of Account 01\/10\/2026 to 31\/10\/2026/);
    assert.match(out, /Opening Balance 12,000\.00/);
    assert.match(out, /BLINKIT/);
    assert.match(out, /STARBUCKS 310\.00 DR/);
  });
}

test('Aadhaar, SSN and a labelled date of birth are removed anywhere, amounts untouched', () => {
  const lines = [
    '05/10/2026 KYC Aadhaar 1234 5678 9012 verified 10.00 DR',
    '06/10/2026 TAX REFUND SSN 123-45-6789 250.00 CR',
    '07/10/2026 INSURANCE DOB: 14-03-1996 1,500.00 DR',
  ].join('\n');
  const out = scrubStatementText(lines, [], { scrub: false }).scrubbedLines.join('\n');
  assert.doesNotMatch(out, /1234 5678 9012|123-45-6789|14-03-1996/);
  assert.match(out, /10\.00 DR/);
  assert.match(out, /250\.00 CR/);
  assert.match(out, /1,500\.00 DR/);
});

test('a layout with no recognisable payment line is never emptied', () => {
  const odd = ['Some Bank', 'Txn 1 BLINKIT 435', 'Txn 2 STARBUCKS 310'].join('\n');
  const out = scrubStatementText(odd, [], { scrub: false }).scrubbedLines.join('\n');
  assert.match(out, /BLINKIT/);
});

test('a dated line above the first recognised payment is kept (it may be a payment)', () => {
  const s = ['MR RAHUL SHARMA', 'Flat 402, Baner Road', '04/10/2026 BLINKIT 435 DR', '05/10/2026 UPI-ZEPTO 210.00 DR'].join('\n');
  const out = scrubStatementText(s, [], { scrub: false }).scrubbedLines.join('\n');
  assert.match(out, /BLINKIT 435 DR/);
  assert.doesNotMatch(out, /Flat 402/);
});

test('an unlabelled name at the top (common on US statements) is treated as the holder', () => {
  const s = [
    'Statement Period 10/01/2026 to 10/31/2026',
    'JOHN DOE',
    '123 Main Street, Apt 4B',
    'Austin, TX 78701',
    '10/06/2026 ZELLE TO JANE SMITH 50.00',
    '10/09/2026 TRANSFER TO JOHN DOE SAVINGS 500.00',
  ].join('\n');
  const out = scrubStatementText(s, [], { scrub: false }).scrubbedLines.join('\n');
  assert.doesNotMatch(out, /JOHN DOE|Main Street|78701/);
  assert.match(out, /ZELLE TO JANE SMITH 50\.00/);
  assert.match(out, /TRANSFER TO \[REDACTED_NAME\] SAVINGS 500\.00/);
});
