/**
 * CSV mechanics — quoting, splitting, and handing a generated file to the
 * browser.
 *
 * Nothing here knows about reports, employees, or any other domain: those live
 * in the modules that describe their own columns (`reportCsv.ts`,
 * `attendance/employeeCsv.ts`). Splitting a quoted line correctly is the same
 * problem everywhere, and having two copies of it is how one of them ends up
 * with the escaped-quote case fixed and the other not.
 *
 * Hand-rolled rather than pulled from a library: these are the only CSVs the app
 * reads, and a dependency for sixty lines would be the larger cost.
 */

/** Excel opens UTF-8 correctly only when the file starts with this. */
export const BOM = "﻿";

/**
 * Excel does not split a double-clicked .csv on commas. It splits on whatever
 * Windows has set as the regional "List separator", which outside the US and UK
 * is usually a semicolon — so a correct comma file opens with every row crammed
 * into column A, and stays that way when the clerk saves it.
 *
 * This first line is the one thing that overrides it: Excel reads `sep=,` as an
 * instruction and splits on commas whatever the machine's locale says. It costs
 * a line other spreadsheet tools show as a stray row, which is much the smaller
 * problem — and `readCsv` strips it back off on the way in.
 */
export const SEPARATOR_DIRECTIVE = "sep=,";

/** Delimiters a file coming back from a spreadsheet might use, comma first. */
const DELIMITERS = [",", ";", "\t"];

/** Quote a field only when it needs it, so the file stays readable. */
export function escape(value: string | number): string {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toLine(cells: Array<string | number>): string {
  return cells.map(escape).join(",");
}

/** Assemble a complete file: BOM, separator directive, CRLF, trailing newline. */
export function toCsvFile(lines: string[]): string {
  return BOM + [SEPARATOR_DIRECTIVE, ...lines].join("\r\n") + "\r\n";
}

/** Split one CSV line, honouring quoted fields and escaped quotes. */
export function splitLine(line: string, delimiter = ","): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out;
}

/** Split a file into logical lines, ignoring newlines inside quoted fields. */
export function splitLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      quoted = !quoted;
      current += ch;
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      lines.push(current);
      current = "";
    } else current += ch;
  }
  if (current.length > 0) lines.push(current);
  return lines.filter((l) => l.trim().length > 0);
}

/** Count a character's unquoted occurrences — quoted ones are data, not structure. */
function countOutsideQuotes(line: string, ch: string): number {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (!quoted && line[i] === ch) count++;
  }
  return count;
}

/**
 * Work out what the file is actually delimited with.
 *
 * Writing `sep=,` gets the file *open* in Excel correctly, but when the clerk
 * saves it Excel writes it back out with the machine's own list separator — so
 * the file we get handed is often semicolon-delimited even though the one we
 * sent was not. Sniffing the header row settles it: it is the one line whose
 * content we chose, and it has more delimiters in it than anything else.
 *
 * Ties go to the comma, which is why it is first in the list.
 */
function detectDelimiter(headerLine: string, fallback: string): string {
  let best = fallback;
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const count = countOutsideQuotes(headerLine, d);
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

export interface CsvReader {
  /** Logical lines, header first, with the BOM and `sep=` directive removed. */
  lines: string[];
  /** What the file turned out to be delimited with. */
  delimiter: string;
  /** Split one of those lines into cells. */
  split: (line: string) => string[];
  /**
   * Find a column by header name, or -1. Matching by name rather than position
   * is what lets a clerk reorder or add columns in Excel without breaking the
   * import.
   */
  indexOf: (header: string) => number;
}

/** Open a file for reading: strip the front matter, settle the delimiter. */
export function readCsv(text: string): CsvReader {
  const lines = splitLines(text.replace(/^﻿/, ""));

  // Our own directive, or one Excel carried through from it.
  let declared = ",";
  const directive = /^sep=(.)$/i.exec(lines[0]?.trim() ?? "");
  if (directive) {
    declared = directive[1];
    lines.shift();
  }

  const delimiter = lines.length > 0 ? detectDelimiter(lines[0], declared) : declared;
  const split = (line: string) => splitLine(line, delimiter);
  const headers = lines.length > 0 ? split(lines[0]).map((h) => h.trim().toLowerCase()) : [];

  return {
    lines,
    delimiter,
    split,
    indexOf: (header) => headers.indexOf(header.trim().toLowerCase()),
  };
}

/** Trigger a browser download for generated text. */
export function downloadText(
  filename: string,
  text: string,
  mime = "text/csv;charset=utf-8",
): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
