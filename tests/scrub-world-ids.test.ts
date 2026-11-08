import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrubStatementText } from '../src/scrubber';

const scrub = (line: string) => scrubStatementText(line, [], { scrub: false }).scrubbedLines.join('\n');

test('IDs and account numbers from many countries are removed; shop and amount stay', () => {
  const cases: [string, string, RegExp][] = [
    ['05/10/2026 SEPA TRANSFER DE89 3704 0044 0532 0130 00 REWE 45.20', 'DE89 3704', /REWE 45\.20$/],
    ['05/10/2026 VIREMENT FR7630006000011234567890189 CARREFOUR 30.00', 'FR7630006000', /CARREFOUR 30\.00$/],
    ['05/10/2026 PIX CPF 123.456.789-09 MERCADO 50,00', '123.456.789-09', /MERCADO 50,00$/],
    ['05/10/2026 OXXO RFC GODE561231GR8 120.00', 'GODE561231GR8', /OXXO .*120\.00$/],
    ['05/10/2026 MERCADONA DNI 12345678Z 23.40', '12345678Z', /MERCADONA .*23\.40$/],
    ['05/10/2026 ESSELUNGA CF RSSMRA85T10A562S 18.90', 'RSSMRA85T10A562S', /ESSELUNGA .*18\.90$/],
    ['05/10/2026 NTUC FAIRPRICE S1234567D 12.30', 'S1234567D', /NTUC FAIRPRICE .*12\.30$/],
    ['05/10/2026 ALIPAY 11010519491231002X 88.00', '11010519491231002X', /ALIPAY .*88\.00$/],
    ['05/10/2026 KAKAO PAY 900101-1234567 15000', '900101-1234567', /KAKAO PAY/],
    ['05/10/2026 CARREFOUR UAE 784-1990-1234567-1 75.00', '784-1990-1234567-1', /75\.00$/],
    ['05/10/2026 IRD REFUND 123-456-789 300.00', '123-456-789', /300\.00$/],
    ['05/10/2026 ATO Tax File No: 123 456 782 410.00', '123 456 782', /410\.00$/],
    ['05/10/2026 WIRE SWIFT: DEUTDEFF500 1,000.00', 'DEUTDEFF500', /1,000\.00$/],
  ];
  for (const [line, gone, kept] of cases) {
    const out = scrub(line);
    assert.ok(!out.includes(gone), `${gone} left in: ${out}`);
    assert.match(out, kept, out);
  }
});

test('ordinary lines are left alone', () => {
  const lines = [
    '05/10/2026 BAJAJ FIN - EMI 2,499.00',
    '05/10/2026 POS PURCHASE STARBUCKS #1234 AUSTIN TX 6.45',
    '05/10/2026 AMAZON MKTP US 34.99',
    '05/10/2026 SHOP 100 250 300.00',
    '05/10/2026 FINANCE CHARGE 12.00',
  ];
  for (const l of lines) assert.equal(scrub(l), l);
});
