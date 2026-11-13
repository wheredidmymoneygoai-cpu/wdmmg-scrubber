/**
 * Keeps the visitor's own details out of a CSV statement before anything is sent, whatever the layout.
 *
 * - Columns named for the visitor's own details (cardholder, account number, IBAN, email, phone,
 *   address and similar) are never kept.
 * - Lines above the table ("Account Name: Jane Doe", "Account No: 0011...") are never kept, and a name
 *   found in them is returned as an "Account Holder: NAME" line, so the redactor learns it and removes
 *   it anywhere else it appears (a self-transfer narration, for example).
 * - In a layout nobody recognises, a column with the same value on every row (a cardholder, an
 *   account number) is dropped too: it says nothing about where the money went.
 *
 * Run the result through scrubStatementText, which removes the holder lines and the name everywhere.
 */
import { looksLikePersonName } from './statement-blocks';

export type Row = string[];

/** Column names compared without underscores or dots: "Cust_Name" reads as "cust name". */
export const norm = (h: string) => h.replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Columns that hold the visitor's own details. They are never sent. */
export const SENSITIVE_HEADER =
  /card\s*member|card\s*holder|cardholder|holder|cust(?:omer)?\s*(?:name|id|no|number)|name\s*on\s*card|member\s*name|primary\s*name|^(?:acct|account|a\/c)\b|card\s*(?:no|number|#|id)|iban|sort\s*code|routing|ifsc|swift|bic|ssn|tax\s*id|e-?mail|phone|mobile|address|zip|postcode|pin\s*code|date\s*of\s*birth|dob/i;
/** Of those, the ones that name the visitor. */
export const HOLDER_HEADER = /card\s*member|card\s*holder|cardholder|holder|cust(?:omer)?\s*name|name\s*on\s*card|member\s*name|primary\s*name|account\s*name/i;
/** "Account Name: Jane Doe" in the lines above the columns. */
const HOLDER_PREAMBLE = /^\s*(?:account\s*holder(?:\s*name)?|account\s*name|cust(?:omer)?\s*name|card\s*member|card\s*holder|cardholder(?:\s*name)?|name(?:\s*on\s*card)?|prepared\s*for|statement\s*for)\s*[:\-]?\s*(?:mr|mrs|ms|miss|dr|shri|smt)?\.?\s*(.+?)\s*$/i;

/** The visitor's name from the lines above the columns, passed on as holder lines. The lines themselves are never sent. */
export function preambleHolderLines(rows: Row[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const cells = r.map((c) => c.trim()).filter(Boolean);
    const line = cells.length === 2 ? `${cells[0]}: ${cells[1]}` : cells.join(' ');
    const m = line.match(HOLDER_PREAMBLE);
    const v = m?.[1]?.replace(/\s+/g, ' ');
    if (v && /[A-Za-z]/.test(v) && v.length <= 60 && !/\d{3,}/.test(v)) out.push(`Account Holder: ${v}`);
  }
  return out;
}

export function holderLinesFromColumns(header: Row, data: Row[]): string[] {
  const names = new Set<string>();
  header.forEach((h, i) => {
    if (!HOLDER_HEADER.test(norm(h))) return;
    for (const r of data) {
      const v = (r[i] || '').trim().replace(/\s+/g, ' ');
      if (v && /[A-Za-z]/.test(v) && v.length <= 60 && !/\d{3,}/.test(v)) names.add(v);
      if (names.size >= 4) break;
    }
  });
  return Array.from(names).map((n) => `Account Holder: ${n}`);
}

/** Short codes worth keeping even when every row has the same one (currency, DR/CR). */
const KEEP_CONSTANT = /^(?:[A-Z]{3}|dr|cr|debit|credit)$/i;

/**
 * A layout we don't recognise: keep the cells, but never the visitor's own details. A first row with no
 * digits is read as column names, and sensitive columns are dropped. A column with the same value on every
 * row (a cardholder, an account number) is dropped too: it says nothing about where the money went. When
 * such a value looks like a person's name, it is passed on as a holder line so the redactor removes it
 * wherever else it appears.
 */
export function safeFallbackLines(rows: Row[]): string[] {
  // Only rows as wide as the table are kept. "Account No: 0011…" and "Branch: MG Road" above it are one or
  // two cells wide: they are never sent, and a name among them is passed on as a holder line.
  const widthOf = (r: Row) => r.filter((c) => c.trim()).length;
  const counts = new Map<number, number>();
  rows.forEach((r) => counts.set(widthOf(r), (counts.get(widthOf(r)) || 0) + 1));
  const tableWidth = [...counts.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0]?.[0] || 0;
  const wide = (r: Row) => widthOf(r) >= Math.max(2, tableWidth - 1);
  const first = rows.findIndex(wide);
  if (first < 0) return [];
  const holders = new Set<string>(preambleHolderLines(rows.slice(0, first)));
  let header: Row | null = null;
  let data = rows.slice(first).filter(wide);
  if (data.length > 1 && data[0].every((c) => !/\d/.test(c)) && data[0].some((c) => /[A-Za-z]/.test(c))) {
    header = data[0];
    data = data.slice(1);
  }
  const width = Math.max(0, ...data.map((r) => r.length));
  const drop = new Set<number>();
  for (let i = 0; i < width; i++) {
    const h = norm(header?.[i] || '');
    if (h && SENSITIVE_HEADER.test(h)) {
      drop.add(i);
      if (HOLDER_HEADER.test(h)) holderLinesFromColumns([h], data.map((r) => [r[i] || ''])).forEach((l) => holders.add(l));
      continue;
    }
    const values = data.map((r) => (r[i] || '').trim()).filter(Boolean);
    if (data.length >= 2 && values.length === data.length && values.every((v) => v === values[0]) && !KEEP_CONSTANT.test(values[0])) {
      drop.add(i);
      const v = values[0].replace(/\s+/g, ' ');
      if (looksLikePersonName(v)) holders.add(`Account Holder: ${v}`);
    }
  }
  const lines = data.map((r) => r.filter((c, i) => !drop.has(i) && c.trim()).join(' | ')).filter(Boolean);
  return lines.length ? [...holders, ...lines] : [];
}

