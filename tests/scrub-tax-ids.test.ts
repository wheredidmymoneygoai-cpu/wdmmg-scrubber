import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrubStatementText } from '../src/scrubber';

const scrub = (line: string, full = false) => scrubStatementText(line, [], { scrub: full }).scrubbedLines.join('\n');

test('tax and national ID numbers are removed, amounts and shops untouched', () => {
  for (const full of [false, true]) {
    const cases: [string, RegExp, RegExp][] = [
      ['05/10/2026 IRS TREAS 310 TAX REF EIN 12-3456789 250.00 CR', /12-3456789/, /IRS TREAS 310 .*250\.00 CR/],
      ['05/10/2026 HMRC NI AB 12 34 56 C 120.00 CR', /AB 12 34 56 C/, /HMRC .*120\.00 CR/],
      ['05/10/2026 RELIANCE RETAIL GSTIN 27AAACR5055K1Z5 1,499.00 DR', /27AAACR5055K1Z5/, /RELIANCE RETAIL .*1,499\.00 DR/],
      ['05/10/2026 CRA DEPOSIT 123-456-789 300.00 CR', /123-456-789/, /CRA DEPOSIT .*300\.00 CR/],
      ['05/10/2026 VISA FEE Passport No: K1234567 160.00 DR', /K1234567/, /VISA FEE .*160\.00 DR/],
      ['05/10/2026 DMV RENEWAL DL No: D123-4567-8901 45.00 DR', /D123-4567-8901/, /DMV RENEWAL .*45\.00 DR/],
    ];
    for (const [line, gone, kept] of cases) {
      const out = scrub(line, full);
      assert.doesNotMatch(out, gone, out);
      assert.match(out, kept, out);
    }
  }
});

test('phone numbers and dates are not mistaken for IDs in a way that breaks amounts', () => {
  assert.match(scrub('05/10/2026 T-MOBILE 512-555-0147 85.00'), /T-MOBILE \[REDACTED_PHONE\] 85\.00/);
  assert.match(scrub('2026-10-05 STARBUCKS 6.45'), /^2026-10-05 STARBUCKS 6\.45$/);
});
