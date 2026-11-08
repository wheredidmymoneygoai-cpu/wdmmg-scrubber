import type { CurrencyCode } from './currency';
import { joinTransactionBlocks, looksLikePersonName } from './statement-blocks';

/**
 * Order matters: more specific patterns first.
 * These are rules of thumb, not a guarantee — the UI never promises "100% removed".
 */
const PII_PATTERNS = [
  // Emails and UPI IDs (name@okaxis, name@ybl, name@paytm ...). A dot after the @ is not required.
  // No hyphens on either side: bank narrations use "-" between fields (UPI-BLINKIT-blinkit@ybl-YESB0001-...),
  // and a hyphen-hungry pattern used to swallow the merchant name and everything after the UPI id.
  { regex: /\b[A-Za-z0-9._%+]+@[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*\b/g, replacement: '[REDACTED_VPA_OR_EMAIL]' },
  { regex: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, replacement: '[REDACTED_IFSC]' },
  // UK sort code + account number (20-32-06 12345678), or a labelled sort code
  { regex: /\b\d{2}-\d{2}-\d{2}\s+\d{8}\b/g, replacement: '[REDACTED_ACCOUNT]' },
  { regex: /\bsort\s*code:?\s*\d{2}-?\d{2}-?\d{2}\b/gi, replacement: '[REDACTED_SORTCODE]' },
  // US ACH narrations carry the account holder: "INDN:JOHN DOE CO ID:..."
  { regex: /\bINDN:\s*[A-Za-z][A-Za-z .,'-]*?(?=\s+CO\s*ID|\s{2,}|$)/g, replacement: 'INDN:[REDACTED_NAME]' },
  { regex: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g, replacement: '[REDACTED_PAN]' },
  // Aadhaar (1234 5678 9012) and US Social Security numbers (123-45-6789). Never followed by an amount.
  { regex: /(?<!\d[ -])\b\d{4} \d{4} \d{4}\b(?![.,]\d| \d)/g, replacement: '[REDACTED_ID]' },
  { regex: /(?<!\d[ -])\b\d{3}-\d{2}-\d{4}\b(?![.,\-]\d)/g, replacement: '[REDACTED_ID]' },
  // A date of birth, when it is labelled as one.
  { regex: /\b(?:date\s*of\s*birth|d\.?o\.?b\.?)\s*[:\-]?\s*\d{1,4}[/.\- ]\w{1,9}[/.\- ]\d{2,4}/gi, replacement: '[REDACTED_DOB]' },
  // Card numbers: four groups with the SAME separator (none, space or hyphen), never running into an
  // amount. A loose pattern used to read "427812345678 435.00" (a reference, then the amount) as a card
  // and wipe out part of the amount.
  { regex: /\b\d{4}([ -]?)\d{4}\1\d{4}\1\d{1,4}\b(?![.,]\d)/g, replacement: '[REDACTED_CARD]' },
  // American Express: 15 digits written 4-6-5.
  { regex: /\b3[47]\d{2}([ -]?)\d{6}\1\d{5}\b(?![.,]\d)/g, replacement: '[REDACTED_CARD]' },
  { regex: /(?<!\.)\b\d{9,18}\b(?!\.\d)/g, replacement: '[REDACTED_NUM]' },
  // Transaction / UTR / reference ids: 10+ letters-and-digits mixed (for example AXIS2509123456, T2509121234567)
  {
    regex: /\b(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{10,}\b/g,
    replacement: '[REDACTED_REF]',
  },
  { regex: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[REDACTED_PHONE]' },
  // Indian mobile numbers written as 5+5 digits (98765 43210)
  { regex: /\b[6-9]\d{4}[ -]\d{5}\b/g, replacement: '[REDACTED_PHONE]' },
];

/** The email / UPI ID pattern (the first entry above), used on its own in the default mode. */
const VPA_OR_EMAIL = PII_PATTERNS[0].regex;

/**
 * Removed in every mode: bank codes, account, card, PAN and phone numbers. Not names (the default mode
 * keeps them) and not transaction references, which are not personal and can carry a shop's name.
 */
const NUMBER_PATTERNS = PII_PATTERNS.filter((p) =>
  ['[REDACTED_IFSC]', '[REDACTED_ACCOUNT]', '[REDACTED_SORTCODE]', '[REDACTED_PAN]', '[REDACTED_ID]', '[REDACTED_DOB]', '[REDACTED_CARD]', '[REDACTED_NUM]', '[REDACTED_PHONE]'].includes(
    p.replacement
  )
);

const HEADER_NOISE_PREFIXES = [
  /^account\s*holder/i,
  /^customer\s*name/i,
  /^customer\s*(id|no)/i,
  /^address\s*:/i,
  /^branch\s*:/i,
  /^nominee/i,
  /^cif\s*no/i,
  /^cust\s*id/i,
  /^statement\s*of\s*account/i,
  /^(a\/c|account)\s*(no|number|#)/i,
  /^ifsc/i,
  /^micr/i,
  /^(mobile|phone|contact)\s*(no|number)?\s*:/i,
  /^e-?mail\s*:/i,
  /^pan\s*(no|number)?\s*:/i,
  /^name\s*:/i,
];

/** A line that reads like a payment: a date and an amount. */
const DATE_IN_LINE =
  /\b\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[ \-][A-Za-z]{3,9}[ \-,]+\d{2,4}\b|\b[A-Za-z]{3,9}\.? \d{1,2},? \d{4}\b/;
const AMOUNT_IN_LINE = /\d[\d,]*\.\d{2}\b|[₹$€£¥]\s?\d|\b(?:Rs\.?|INR|USD|GBP|EUR)\s?\d/i;
/** Header lines worth keeping: the statement title and period, and the statement's own totals. */
const HEADER_KEEP = /statement|period|opening\s*balance|closing\s*balance|total|currency|summary/i;

function looksLikePaymentLine(line: string): boolean {
  return DATE_IN_LINE.test(line) && AMOUNT_IN_LINE.test(line);
}

/**
 * Everything above the first payment is the statement header: name, address, PIN or ZIP code, customer
 * and account details. Undated lines there are dropped; the title, period and totals lines and any dated
 * line are kept (a date of birth is removed by its own rule). A header
 * repeated on later pages is dropped there too. If no line looks like a payment, nothing is dropped, so
 * an unusual layout is never emptied.
 */
function dropHeaderZone(lines: string[]): { kept: string[]; dropped: number } {
  const first = lines.findIndex((l) => looksLikePaymentLine(l));
  if (first <= 0) return { kept: lines, dropped: 0 };
  const header = new Set<string>();
  const kept: string[] = [];
  let dropped = 0;
  lines.forEach((line, i) => {
    const t = line.trim();
    if (i < first) {
      if (!t) return;
      // A dated line is kept even here: it may be a payment written in a way we did not recognise.
      if (HEADER_KEEP.test(t) || DATE_IN_LINE.test(t)) kept.push(line);
      else {
        header.add(t);
        dropped++;
      }
      return;
    }
    if (t && header.has(t)) {
      dropped++;
      return;
    }
    kept.push(line);
  });
  return { kept, dropped };
}

/** Header lines that carry the visitor's own details. Dropped in every mode (the statement title line is kept). */
const OWN_DETAIL_PREFIXES = HEADER_NOISE_PREFIXES.filter((rx) => !/statement/.test(rx.source));

/** "Account holder: MR RAHUL SHARMA", "Dear Rahul Sharma", "Prepared for ...", "Name : ..." */
const HOLDER_LINE =
  /^(?:account\s*holder(?:'?s)?(?:\s*name)?|customer\s*name|account\s*name|name\s*of\s*(?:the\s*)?(?:account\s*holder|customer)|primary\s*account\s*holder|prepared\s*for|statement\s*for|issued\s*to|card\s*member|cardholder(?:\s*name)?|dear|name)\s*[:\-,]?\s+(.+)$/i;

/**
 * The visitor's own name, read from the top of the statement (the header block). Only that name is
 * returned: other people and shops are left alone, because the report needs them to be accurate.
 */
export function findHolderNames(rawText: string): string[] {
  const found = new Set<string>();
  const head = rawText.split(/\r?\n/).slice(0, 80);
  for (const raw of head) {
    const line = raw.trim().replace(/\s+/g, ' ');
    const m = HOLDER_LINE.exec(line);
    if (!m) continue;
    let who = m[1].replace(/^(?:mr|mrs|ms|miss|mx|dr|shri|smt|sri|prof)\.?\s+/i, '').replace(/[,.;:]+$/, '').trim();
    who = who.split(/\s+(?:a\/c|account|branch|address|customer|id|no)\b/i)[0].trim();
    if (who.length < 3 || who.length > 50 || /\d|@/.test(who)) continue;
    if (!looksLikePersonName(who)) continue;
    found.add(who);
  }
  // Many statements (most US ones) print the holder's name on its own line at the top, with no label:
  // "JOHN DOE". A line above the first payment that is only a person's name counts as the holder.
  const firstPayment = head.findIndex((l) => looksLikePaymentLine(l));
  const top = firstPayment > 0 ? head.slice(0, Math.min(firstPayment, 25)) : [];
  for (const raw of top) {
    const line = raw.trim().replace(/\s+/g, ' ');
    if (!line || /[\d@:]/.test(line)) continue;
    const who = line.replace(/^(?:mr|mrs|ms|miss|mx|dr|shri|smt|sri|prof)\.?\s+/i, '').replace(/[,.;]+$/, '').trim();
    const words = who.split(' ');
    if (words.length < 2 || words.length > 4 || who.length > 50) continue;
    if (!looksLikePersonName(who)) continue;
    found.add(who);
  }
  return Array.from(found);
}

/** Ordered: more specific tests first. Only codes we support are returned. */
const CURRENCY_HINTS: [CurrencyCode, RegExp][] = [
  ['INR', /₹|\bINR\b|\bUPI\b|\bIMPS\b|\bNEFT\b/i],
  ['EUR', /€|\bEUR\b/i],
  // A UK sort code followed by an 8-digit account number also means pounds.
  ['GBP', /£|\bGBP\b|\b\d{2}-\d{2}-\d{2}\s+\d{8}\b/i],
  ['JPY', /¥|\bJPY\b/i],
  ['KRW', /₩|\bKRW\b/i],
  ['CNY', /\bCNY\b|\bRMB\b|CN¥/i],
  ['AUD', /\bAUD\b|A\$/i],
  ['CAD', /\bCAD\b|CA\$/i],
  ['NZD', /\bNZD\b|NZ\$/i],
  ['CHF', /\bCHF\b/i],
  ['SGD', /\bSGD\b/i],
  ['HKD', /\bHKD\b|HK\$/i],
  ['AED', /\bAED\b|\bDHS?\b/i],
  ['SAR', /\bSAR\b/i],
  ['ZAR', /\bZAR\b|\bR\s?\d/i],
  ['BRL', /R\$|\bBRL\b/i],
  ['MXN', /\bMXN\b|MX\$/i],
  ['SEK', /\bSEK\b/i],
  ['IDR', /\bIDR\b|\bRp\b/i],
];

/** How many lines mention each currency. */
export function countCurrencyLines(rawText: string): Partial<Record<CurrencyCode, number>> {
  const counts: Partial<Record<CurrencyCode, number>> = {};
  for (const line of rawText.split(/\r?\n/)) {
    let found: CurrencyCode | null = null;
    for (const [code, re] of CURRENCY_HINTS) {
      if (re.test(line)) {
        found = code;
        break;
      }
    }
    // A plain "$" with no other currency marker is US dollars.
    if (!found && /\$/.test(line)) found = 'USD';
    if (found) counts[found] = (counts[found] || 0) + 1;
  }
  return counts;
}

/** The currency mentioned on the most lines wins (ties keep the earlier one in the list). */
export function detectCurrency(rawText: string): CurrencyCode {
  const counts = countCurrencyLines(rawText);
  let best: CurrencyCode = 'USD';
  let bestCount = 0;
  for (const [code] of CURRENCY_HINTS) {
    const n = counts[code] || 0;
    if (n > bestCount) {
      best = code;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Identifiers that UPI app statements (PhonePe, Google Pay, Paytm...) print around each payment:
 * transaction IDs, UTR numbers, masked account numbers and the phone number in the title. The app reader
 * keeps only date, payee, direction and amount, so these never leave the device. Counted here so the
 * "details hidden" number tells the truth instead of saying 0.
 */
const APP_DETAIL_PATTERNS: RegExp[] = [
  /\btransaction\s*id\b\s*[:|]?\s*[A-Za-z0-9]{6,}/gi,
  /\butr\b(?:\s*no\.?)?\s*[:|]?\s*\d{6,}/gi,
  /\b[Xx*]{2,}\d{2,6}\b/g,
  /(?:\+91[-\s]?)?\b[6-9]\d{9}\b/g,
  VPA_OR_EMAIL,
];

function countMatches(text: string): number {
  return APP_DETAIL_PATTERNS.reduce((n, rx) => n + (text.match(new RegExp(rx.source, rx.flags)) || []).length, 0);
}

/** How many personal identifiers were in `rawText` but are not in `keptText` (what we send). */
export function countDetailsLeftOut(rawText: string, keptText: string): number {
  return Math.max(0, countMatches(rawText) - countMatches(keptText));
}

/** "+91 [REDACTED_PHONE]" -> "[REDACTED_PHONE]": the country code alone says nothing, but looks untidy. */
function dropDialCodes(line: string): string {
  return line.replace(/\+\d{1,3}[-.\s]?(?=\[REDACTED_(?:PHONE|NUM)\])/g, '');
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "Rahul Sharma" -> the full name plus each part ("Rahul", "Sharma"), so either form is removed. */
function expandNames(names: string[]): string[] {
  const out = new Set<string>();
  // Capped so a long list cannot tie up the device or the server (each name is a search over every line).
  for (const raw of names.slice(0, 30)) {
    const full = raw.slice(0, 80).trim().replace(/\s+/g, ' ');
    if (full.length > 2) out.add(full);
    for (const part of full.split(' ')) {
      if (part.length > 2) out.add(part);
    }
  }
  return Array.from(out)
    .sort((a, b) => b.length - a.length)
    .slice(0, 60);
}

/**
 * Full privacy scrubbing switch. Off by default (owner's request, 28 Oct 2026: hiding names made
 * reports wrong). Off still removes account, card and phone numbers, bank codes and email addresses,
 * and keeps names (30 Oct 2026). SCRUB_PII=1 also hides people's names and transaction references.
 */
export function scrubbingEnabled(): boolean {
  return process.env.SCRUB_PII === '1';
}

export function scrubStatementText(
  rawText: string,
  userExcludeNames: string[] = [],
  opts: { scrub?: boolean } = {}
) {
  const scrub = opts.scrub !== false;
  const detectedCurrency = detectCurrency(rawText);
  // Multi-line transaction blocks (UPI apps) become one line each; with scrubbing on, person names in them are hidden.
  const zone = dropHeaderZone(joinTransactionBlocks(rawText, { mask: scrub }).split(/\r?\n/));
  const lines = zone.kept;
  const scrubbedLines: string[] = [];
  let redactionCount = zone.dropped;

  // The visitor's own name from the statement header goes the same way as a name they typed in. Only the
  // full name is matched (and its parts of 4+ letters), so a shop that shares a first name is not hit.
  const holderFull = findHolderNames(rawText);
  const holderNames = holderFull.flatMap((full) => [full, ...full.split(' ').filter((p) => p.length > 3)]);
  const customNameRegexes = expandNames([...userExcludeNames, ...holderNames]).map(
    (name) => new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi')
  );

  if (!scrub) {
    // Default mode: only the visitor's own name and personal details are hidden. Other people and
    // businesses keep their names (hiding them made reports wrong). Numbers and contact details are
    // always removed: account and card numbers, bank codes, phone
    // numbers, email addresses and UPI IDs made from a phone number. Names the visitor typed in to
    // hide are hidden too, because they asked for that themselves.
    for (let line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !/\d/.test(trimmed)) continue;
      // Address, customer id, branch, phone and name lines at the top are the visitor's own details.
      if (OWN_DETAIL_PREFIXES.some((rx) => rx.test(trimmed))) {
        redactionCount++;
        continue;
      }
      line = line.replace(/\bINDN:\s*[A-Za-z][A-Za-z .,'-]*?(?=\s+CO\s*ID|\s{2,}|$)/g, () => {
        redactionCount++;
        return 'INDN:[REDACTED_NAME]';
      });
      line = line.replace(VPA_OR_EMAIL, (match: string) => {
        const [local, domain = ''] = match.split('@');
        // Emails (a dot in the domain) and UPI IDs that contain a phone number are personal.
        // Name- or shop-based UPI IDs (blinkit@ybl, rahul.s@okaxis) only show a name, which is kept.
        if (domain.includes('.') || /\d{10}/.test(local)) {
          redactionCount++;
          return '[REDACTED_VPA_OR_EMAIL]';
        }
        return match;
      });
      for (const nameRx of customNameRegexes) {
        const matches = line.match(nameRx);
        if (matches) {
          redactionCount += matches.length;
          line = line.replace(nameRx, '[REDACTED_NAME]');
        }
      }
      for (const pattern of NUMBER_PATTERNS) {
        const matches = line.match(pattern.regex);
        if (matches) {
          redactionCount += matches.length;
          line = line.replace(pattern.regex, pattern.replacement);
        }
      }
      scrubbedLines.push(dropDialCodes(line).trim());
    }
    return { scrubbedLines, redactionCount, detectedCurrency, holderNames: holderFull };
  }

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (HEADER_NOISE_PREFIXES.some((rx) => rx.test(trimmed))) {
      redactionCount++;
      continue;
    }
    // 1) emails / UPI ids first so a typed name inside one does not leave half an address behind
    const [vpaPattern, ...otherPatterns] = PII_PATTERNS;
    const vpaMatches = line.match(vpaPattern.regex);
    if (vpaMatches) {
      redactionCount += vpaMatches.length;
      line = line.replace(vpaPattern.regex, vpaPattern.replacement);
    }
    // 1b) person names inside UPI narrations (UPI-RAHUL SHARMA-..., UPI/DR/123/RAHUL SHARMA/...).
    //     Shops and brands are kept; a field that looks like a person's name is hidden.
    if (/\bUPI\b/i.test(line)) {
      line = line.replace(/(^|[-/|])([^-/|@\d]{3,40})(?=$|[-/|])/g, (whole, sep: string, field: string) => {
        if (/REDACTED/.test(field) || !looksLikePersonName(field.trim())) return whole;
        redactionCount++;
        return `${sep}[REDACTED_NAME]`;
      });
    }
    // 1c) "ZELLE TO JANE SMITH", "VENMO PAYMENT FROM ...", "TRANSFER TO ..." (US / UK)
    line = line.replace(
      /\b(ZELLE|VENMO|CASH APP|TRANSFER|FASTER PAYMENT|BANK TRANSFER)(\s+(?:PAYMENT\s+)?(?:TO|FROM))\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){1,3})/gi,
      (whole, kind: string, dir: string, who: string) => {
        if (!looksLikePersonName(who.trim())) return whole;
        redactionCount++;
        return `${kind}${dir} [REDACTED_NAME]`;
      }
    );
    // 2) names the user typed in
    for (const nameRx of customNameRegexes) {
      const matches = line.match(nameRx);
      if (matches) {
        redactionCount += matches.length;
        line = line.replace(nameRx, '[REDACTED_NAME]');
      }
    }
    // 3) numbers, ids, cards, phones
    for (const pattern of otherPatterns) {
      const matches = line.match(pattern.regex);
      if (matches) {
        redactionCount += matches.length;
        line = line.replace(pattern.regex, pattern.replacement);
      }
    }
    if (/\d/.test(line)) {
      scrubbedLines.push(dropDialCodes(line).trim());
    }
  }
  return { scrubbedLines, redactionCount, detectedCurrency, holderNames: holderFull };
}
