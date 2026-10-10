/**
 * Safe CSV for results exports.
 *
 * Why this exists: a CSV opened in Excel, Numbers or Google Sheets treats a cell that starts
 * with = + - or @ as a FORMULA. Guests choose their own name, so a guest called
 * =HYPERLINK("http://example.com","Open results") put a live formula into the teacher's
 * spreadsheet. (This is called CSV injection.) Any text that starts that way is prefixed with
 * a single quote, which every spreadsheet reads as "this is plain text". Real numbers are left
 * alone, so a score is still a number.
 */

// Characters that make a spreadsheet read a cell as a formula, plus tab and return, which
// can be used to hide one.
const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell, quoted, with quotes doubled, and made harmless if it could be read as a formula. */
export function csvCell(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  let text = value == null ? '' : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Rows (arrays of cells) to CSV text. Lines end in CRLF, which is what the format specifies. */
export const toCsv = (rows) => rows.map((row) => row.map(csvCell).join(',')).join('\r\n');

/** Starts a browser download of a CSV file. The byte order mark makes Excel read accents right. */
export function downloadCsv(filename, rows) {
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** A file name from a title: letters and digits only, so it is safe on every system. */
export const safeFileName = (title, fallback = 'quiz') => (String(title || fallback).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || fallback);
