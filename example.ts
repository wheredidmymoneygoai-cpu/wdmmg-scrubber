import { scrubStatementText } from './src/scrubber';

// A made-up US checking account statement.
const statement = [
  'Statement Period 10/01/2026 to 10/31/2026',
  'JOHN DOE',
  '123 Main Street, Apt 4B',
  'Austin, TX 78701',
  'Account Number: 000123456789',
  '10/05/2026 POS PURCHASE STARBUCKS #1234 AUSTIN TX CARD 4111 1111 1111 1111 6.45',
  '10/06/2026 ZELLE TO JANE SMITH 50.00',
  '10/07/2026 UBER *TRIP HELP.UBER.COM 18.20',
  '10/08/2026 ACH DEPOSIT ACME CORP PAYROLL INDN:JOHN DOE CO ID:1234567890 3,200.00',
  '10/09/2026 TRANSFER TO JOHN DOE SAVINGS 500.00',
  '10/10/2026 PAYPAL *NETFLIX john.doe@gmail.com 15.49',
  '10/11/2026 T-MOBILE AUTOPAY 512-555-0147 85.00',
].join('\n');

const { scrubbedLines, redactionCount } = scrubStatementText(statement, [], { scrub: false });
console.log(scrubbedLines.join('\n'));
console.log(`\n${redactionCount} details removed`);
