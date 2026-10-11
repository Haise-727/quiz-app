import { useMemo, useRef, useState } from 'react';
import { PiCheckCircleFill, PiDownloadSimpleBold, PiFileTextBold, PiWarningCircleFill } from 'react-icons/pi';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { downloadCsv } from '@/utils/csv';
import { IMPORT_TEMPLATE, MAX_CHARS, importQuestions, parseTable } from '@/utils/questionImport';

const TYPE_NAME = { MCQ: 'multiple choice', TRUE_FALSE: 'true or false', FILL_IN_THE_BLANK: 'fill in the blank', NUMERIC: 'number', PARAGRAPH: 'paragraph' };

/**
 * Adds many questions at once from a table: paste rows copied from a spreadsheet, or pick a
 * CSV file. It shows what it understood before anything is added, with the rows it could not
 * read and why, so a teacher can fix the sheet and paste again. Nothing is added until the
 * button is pressed. The reading itself lives in utils/questionImport.js.
 *
 * @param onImport  (questions) => void, called with questions in the editor's own shape
 */
export default function ImportQuestionsDialog({ open, onClose, onImport }) {
  const [text, setText] = useState('');
  const [fileError, setFileError] = useState('');
  const fileRef = useRef(null);

  const result = useMemo(() => (text.trim() ? importQuestions(text) : null), [text]);
  const counts = useMemo(() => {
    const c = {};
    (result?.questions || []).forEach((q) => { c[q.type] = (c[q.type] || 0) + 1; });
    return Object.entries(c).map(([type, n]) => `${n} ${TYPE_NAME[type] || type}`).join(', ');
  }, [result]);

  const close = () => { setText(''); setFileError(''); onClose(); };

  const readFile = async (file) => {
    setFileError('');
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) { setFileError('That is an Excel file. In Excel or Sheets choose Save as CSV, then pick that file.'); return; }
    if (file.size > MAX_CHARS * 2) { setFileError('That file is too big. Split it into smaller files.'); return; }
    try { setText(await file.text()); } catch { setFileError('We could not read that file.'); }
  };

  const add = () => { onImport(result.questions); close(); };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) close(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import questions</DialogTitle>
          <DialogDescription>
            Paste rows from a spreadsheet, or choose a CSV file. The first row names the columns. Multiple choice, true or false, fill in the blank, number and paragraph questions can be imported.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="sr-only" aria-label="Choose a CSV file" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}><PiFileTextBold /> Choose a file</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => downloadCsv('quizlike-question-template.csv', parseTable(IMPORT_TEMPLATE, ','))}><PiDownloadSimpleBold /> Download a template</Button>
          </div>
          {fileError && <p role="alert" className="mt-2 text-sm text-[hsl(var(--destructive))]">{fileError}</p>}

          <label htmlFor="import-text" className="eyebrow mt-4 block">Or paste here</label>
          <textarea
            id="import-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={'type,question,correct,option1,option2,option3,option4\nmcq,Which planet is closest to the Sun?,A,Mercury,Venus,Earth,Mars'}
            className="mt-1.5 w-full resize-y rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--card))] p-3 font-mono text-xs leading-relaxed outline-none placeholder:text-[hsl(var(--muted-foreground))]/60 focus:border-[hsl(var(--ink))]"
          />

          {result && (
            <div className="mt-3 text-sm" aria-live="polite">
              {result.questions.length > 0 && (
                <p className="flex items-start gap-2 font-medium text-[hsl(var(--tint-green-fg))]"><PiCheckCircleFill className="mt-0.5 h-4 w-4 shrink-0" /><span>{result.questions.length} {result.questions.length === 1 ? 'question is' : 'questions are'} ready: {counts}.</span></p>
              )}
              {result.errors.length > 0 && (
                <div className="mt-2">
                  <p className="flex items-center gap-2 font-medium text-[hsl(var(--tint-red-fg))]"><PiWarningCircleFill className="h-4 w-4 shrink-0" /> {result.errors.length} {result.errors.length === 1 ? 'problem' : 'problems'} to fix</p>
                  <ul className="mt-1.5 max-h-36 space-y-1 overflow-y-auto pl-6 text-[hsl(var(--muted-foreground))]">
                    {result.errors.map((e, i) => <li key={i}>{e.row > 0 ? `Row ${e.row}: ` : ''}{e.message}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
          <Button type="button" variant="brand" disabled={!result || result.questions.length === 0} onClick={add}>
            {result?.questions.length ? `Add ${result.questions.length} ${result.questions.length === 1 ? 'question' : 'questions'}` : 'Add questions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
