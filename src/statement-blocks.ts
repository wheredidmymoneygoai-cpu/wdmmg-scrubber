/**
 * Some statements (PhonePe, Google Pay, Paytm and many bank apps) print each transaction as a
 * block of several lines:
 *
 *   Oct 21, 2026
 *   07:09 pm
 *   DEBIT ₹435
 *   Paid to Some Shop
 *   Transaction ID ...
 *   UTR No. ...
 *   Paid by XXXXXX1234
 *
 * The readers expect one transaction per line, so this joins each block into one line:
 *
 *   Oct 21, 2026 07:09 pm | Paid to Some Shop | DEBIT ₹435
 *
 * Reference lines (transaction id, UTR, "paid by" account) are dropped, and a counterparty that
 * looks like a person's name is replaced with [REDACTED_NAME] before anything else sees it.
 */

const DATE_ONLY =
  /^(?:[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{2,4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})(?:\s+\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?)?$/i;
const TIME_ONLY = /^\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?$/i;
const AMOUNT_ONLY =
  /^(?:(?:DEBIT|CREDIT|DR|CR|PAID|RECEIVED)\s*)?(?:₹|Rs\.?|INR|\$|€|£|¥)?\s?\d[\d,]*(?:\.\d{1,2})?\s*(?:DR|CR)?$/i;
const NOISE =
  /^(?:Transaction\s*ID|UPI\s*(?:Transaction\s*)?ID|UTR(?:\s*No\.?)?|Ref(?:erence)?\.?\s*(?:No|ID)|Paid\s+by|Credited\s+to|Debited\s+from|Page\s+\d+\s+of\s+\d+|Date\s+Transaction|This\s+is\s+(?:a|an)\s|For\s+any\s+queries|Disclaimer)/i;
const COUNTERPARTY = /^(Paid\s+to|Payment\s+to|Received\s+from|Sent\s+to|Transfer\s+to|Transfer\s+from)\s+(.+)$/i;

/** Words that mark a business rather than a person. Lower-case, matched as whole words. */
export const BUSINESS_WORDS =
  /\b(store|stores|mart|shop|shoppe|retail|pvt|private|ltd|limited|llp|inc|co|company|corp|corporation|enterprise|enterprises|trader|traders|trading|service|services|solutions|food|foods|cafe|café|coffee|restaurant|kitchen|dhaba|hotel|bakery|bakers|sweets|medical|medicals|medico|medicos|pharma|pharmacy|chemist|chemists|clinic|hospital|diagnostics|petrol|petroleum|fuel|fuels|filling|station|motors|automobiles|auto|bank|insurance|recharge|electricity|power|gas|water|broadband|telecom|airtel|jio|bsnl|bill|bills|payment|payments|wallet|technologies|tech|labs|online|india|international|global|agency|agencies|centre|center|salon|parlour|spa|gym|fitness|school|college|academy|travels|tours|cab|cabs|taxi|parking|toll|fastag|metro|railway|irctc|bazaar|bazar|super|market|supermarket|hypermarket|kirana|general|provision|provisions|dairy|milk|fruits|vegetables|paan|tea|chai|juice|bar|pub|wines|liquor|pizza|burger|biryani|momos|cinema|cinemas|multiplex|pvr|inox|bookmyshow|zomato|swiggy|blinkit|zepto|instamart|bigbasket|dmart|amazon|flipkart|myntra|nykaa|ajio|meesho|uber|ola|rapido|google|apple|netflix|spotify|hotstar|youtube|phonepe|paytm|razorpay|cred|lic|mutual|fund|funds|securities|broking|zerodha|groww|upstox|ipo|asba|foundation|trust|society|hostel|pg|rent|rentals|associates|industries|exports|distributors|hardware|electronics|mobiles|mobile|optics|opticals|jewellers|textiles|garments|fashion|boutique|footwear|stationery|books|printers|courier|logistics|laundry|cleaners|tailors|studio|photo|games|gaming|sports|club|transfer|transfers|refund|mandate|charge|charges|interest|salary|payroll|cash|deposit|withdrawal|debit|credit|neft|imps|rtgs|upi|ach|pos|atm|autopay|emi|loan|fee|fees|tax|gst|reversal|cashback|balance|statement|opening|closing|bhandar|bhog|kabab|kebab|paratha|stall|sons|chaat|mithai|halwai|sweet|rewards|reward|hpcl|bpcl|iocl|petroleum|broking|salon|saloon|unisex|enterprises)\b/i;

/** True when the text looks like an individual's name (two or more plain words, no business signs). */
export function looksLikePersonName(text: string): boolean {
  const cleaned = text.replace(/[^\p{L}\s.'-]/gu, ' ').trim();
  if (!cleaned) return false;
  if (/\d/.test(text)) return false; // "Shop 2", "Store 4413"
  if (BUSINESS_WORDS.test(text)) return false;
  const words = cleaned.split(/\s+/).filter((w) => w.replace(/[.'-]/g, '').length > 0);
  // One word is usually a brand or shop display name ("Zomato", "Blinkit").
  if (words.length < 2 || words.length > 4) return false;
  // Initials like "R K Sharma" or "Rahul S" still count as a name.
  return words.every((w) => /^[\p{L}][\p{L}.'-]*$/u.test(w));
}

/** "Paid to X" anywhere in a line (row layouts). X ends at a column gap, a "|", DEBIT/CREDIT or an amount. */
const INLINE_COUNTERPARTY =
  /\b(Paid\s+to|Payment\s+to|Received\s+from|Sent\s+to|Transfer\s+to|Transfer\s+from)\s+(.+?)(?=\s{2,}|\s*\||\s+(?:DEBIT|CREDIT|DR|CR)\b|\s+(?:₹|Rs\.?|INR|\$|€|£)|$)/gi;

export function maskCounterpartiesInline(line: string): string {
  return line.replace(INLINE_COUNTERPARTY, (whole, verb: string, who: string) =>
    looksLikePersonName(who.trim()) ? `${verb} [REDACTED_NAME]` : whole
  );
}

function maskCounterparty(line: string): string {
  const m = line.match(COUNTERPARTY);
  if (!m) return line;
  const who = m[2].trim();
  return looksLikePersonName(who) ? `${m[1]} [REDACTED_NAME]` : `${m[1]} ${who}`;
}

/**
 * Returns the text with multi-line transaction blocks joined into one line each.
 * Statements that already have one transaction per line are returned unchanged.
 */
export function joinTransactionBlocks(rawText: string, opts: { mask?: boolean } = {}): string {
  // With mask: false, people's names are left as they are (privacy scrubbing switched off).
  const mask = opts.mask !== false;
  const maskInline = (l: string) => (mask ? maskCounterpartiesInline(l) : l);
  const maskBlock = (l: string) => (mask ? maskCounterparty(l) : l);
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const dateLines = lines.filter((l) => DATE_ONLY.test(l)).length;
  const amountLines = lines.filter((l) => AMOUNT_ONLY.test(l)).length;

  // Only switch on when dates and amounts clearly live on separate lines.
  const isBlockLayout = dateLines >= 3 && amountLines >= 3 && dateLines >= lines.length * 0.05;
  if (!isBlockLayout) return lines.map(maskInline).join('\n');

  const out: string[] = [];
  let block: string[] | null = null;

  const flush = () => {
    if (!block) return;
    const [date, ...rest] = block;
    const time = rest.filter((l) => TIME_ONLY.test(l));
    const amount = rest.filter((l) => AMOUNT_ONLY.test(l));
    const details = rest
      .filter((l) => !TIME_ONLY.test(l) && !AMOUNT_ONLY.test(l) && !NOISE.test(l))
      .map(maskBlock);
    // Amount goes last, so numbers inside a shop name are never mistaken for the amount.
    const parts = [[date, ...time].join(' '), ...details, ...amount];
    if (amount.length) out.push(parts.join(' | '));
    block = null;
  };

  for (const line of lines) {
    if (DATE_ONLY.test(line)) {
      flush();
      block = [line];
    } else if (block) {
      if (NOISE.test(line)) continue;
      block.push(line);
    } else {
      out.push(maskInline(line)); // header text before the first transaction
    }
  }
  flush();
  return out.join('\n');
}
