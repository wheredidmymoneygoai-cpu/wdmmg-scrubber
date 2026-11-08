# wdmmg-scrubber

**Your money is your business. Your financial details should be too.**

Free, open-source redaction code that cleans your financial statement **on your device**, before any app or AI reads it. It is the same code [Where Did My Money Go?](https://wdmmg.app) runs before it reads yours.

It works on any financial statement you can export as a PDF or CSV: bank accounts, credit and debit cards, prepaid and forex cards, and payment apps like Venmo, Cash App, PayPal, Google Pay and PhonePe.

When you drop a statement on wdmmg.app, your browser reads the PDF or CSV and runs this code on it. Only the cleaned text is sent to us. This repository is that cleaning step, published so you don't have to take our word for it.

## What it removes

Redact, mask, hide, anonymise: whatever you call it, these details are taken out before anything else reads the statement.


| Removed | Example before | After |
|---|---|---|
| The statement header: your name, address, ZIP or PIN code, customer details (everything above the first payment, except the title, period and totals) | `JOHN DOE` / `123 Main Street, Apt 4B` / `Austin, TX 78701` | line dropped, also when it repeats on later pages |
| Your own name anywhere else (read from the header, plus any name you type in) | `TRANSFER TO JOHN DOE SAVINGS` | `TRANSFER TO [REDACTED_NAME] SAVINGS` |
| The account holder in ACH lines | `INDN:JOHN DOE CO ID:1234567890` | `INDN:[REDACTED_NAME] CO ID:[REDACTED_NUM]` |
| Card numbers (16-digit and Amex) | `CARD 4111 1111 1111 1111` | `CARD [REDACTED_CARD]` |
| Account numbers and other long numbers, 9 to 18 digits (this also covers many national IDs: Germany, Japan, South Africa, Indonesia, Saudi Arabia and others) | `000123456789` | `[REDACTED_NUM]` |
| Tax and national ID numbers from many countries: US SSN, ITIN and EIN, UK National Insurance, Canada SIN, Australia TFN, New Zealand IRD, India Aadhaar, PAN and GSTIN, Brazil CPF and CNPJ, Mexico CURP and RFC, Spain DNI and NIE, Italy codice fiscale, France NIR, Ireland PPS, Singapore NRIC, Hong Kong ID, China resident ID, South Korea RRN, UAE Emirates ID | `123-45-6789`, `AB 12 34 56 C`, `123.456.789-09` | `[REDACTED_ID]` |
| Any value written after an ID label, whatever the country: TIN, tax ID, tax file no, VAT no, passport no, driver's licence, national ID, SWIFT/BIC, routing, BSB, sort code | `Passport No: K1234567` | `[REDACTED_ID]` |
| Bank account numbers in IBAN form | `DE89 3704 0044 0532 0130 00` | `[REDACTED_ACCOUNT]` |
| A labelled date of birth | `DOB: 03/14/1996` | `[REDACTED_DOB]` |
| Phone numbers | `512-555-0147` | `[REDACTED_PHONE]` |
| Email addresses | `john.doe@gmail.com` | `[REDACTED_VPA_OR_EMAIL]` |
| UK sort code and account | `20-32-06 12345678` | `[REDACTED_ACCOUNT]` |
| India: bank codes (IFSC), PAN, and UPI IDs made from a phone number | `HDFC0001234`, `9876543210@ybl` | `[REDACTED_IFSC]`, `[REDACTED_VPA_OR_EMAIL]` |

## What it keeps, and why

- **Shops and places you paid** (Starbucks, Uber, Netflix). The report is about where your money went, so it needs them.
- **Other people's names** in transfers (`ZELLE TO JANE SMITH`). Hiding them made reports wrong: money sent to a friend looked like a shop. If you want a name hidden, type it in the "names to hide" box on the site and it is removed like your own.
- **Dates and amounts.** The report is built from them.

A stricter mode (`scrub: true`) also hides other people's names and transaction references. The site doesn't use it by default because reports came out less accurate.

## Try it

```bash
npm install
npm run example   # a made-up statement, before and after
npm test
```

Output of `npm run example` (a made-up US checking account):

```
Statement Period 10/01/2026 to 10/31/2026
10/05/2026 POS PURCHASE STARBUCKS #1234 AUSTIN TX CARD [REDACTED_CARD] 6.45
10/06/2026 ZELLE TO JANE SMITH 50.00
10/07/2026 UBER *TRIP HELP.UBER.COM 18.20
10/08/2026 ACH DEPOSIT ACME CORP PAYROLL INDN:[REDACTED_NAME] CO ID:[REDACTED_NUM] 3,200.00
10/09/2026 TRANSFER TO [REDACTED_NAME] SAVINGS 500.00
10/10/2026 PAYPAL *NETFLIX [REDACTED_VPA_OR_EMAIL] 15.49
10/11/2026 T-MOBILE AUTOPAY [REDACTED_PHONE] 85.00

10 details removed
```

## Use it in your own project

It's MIT licensed: use it anywhere, including commercial projects and other AI tools. A good use is cleaning any statement before you paste it into a chatbot.

```ts
import { scrubStatementText } from './src/scrubber';

const { scrubbedLines, redactionCount } = scrubStatementText(statementText, ['Names To Hide'], { scrub: false });
// scrubbedLines: the statement with your personal details removed, one transaction per line
```

- `statementText`: the statement as plain text (from a PDF or CSV reader of your choice).
- Second argument: extra names to remove (yours, a partner's).
- `scrub: true`: also removes other people's names and transaction references (more private, less detail).

This repository is only the cleaning step. The report itself (how spending is read, scored and explained) is not part of it.

## Check it on the live site

You can watch what leaves your browser:

1. Open [wdmmg.app](https://wdmmg.app) and open your browser's developer tools (Network tab).
2. Drop a statement.
3. Look at the request to `/api/audit`. It carries the cleaned lines, not your file.

## Honest limits

- **These are rules, not magic.** They are written to work for statements from anywhere in the world, but statements come in thousands of layouts. A detail written in an unusual way can slip through. If you find one, please open an issue (with made-up data).
- **On your device, where possible.** If your browser can't read a PDF (an old browser, an unusual PDF), the site sends small files to our server instead and runs this same code there. The file is cleaned in memory and never stored. Large files are never sent: you get an error instead.
- **What we do next with the cleaned text:** it goes to Google Gemini (paid API, not used for training) to sort the payments into groups. Our own code does every sum. Reports delete themselves after 48 hours. Details: [Privacy Policy](https://wdmmg.app/privacy).

## This is the code the site runs

wdmmg.app doesn't keep its own copy. The site includes this repository directly (as a git submodule pinned to one commit on `main`) and runs it unchanged. A check on the site's side fails if it ever points at a commit that isn't public here. So any change to how your details are redacted has to be published here first.

## License

MIT
