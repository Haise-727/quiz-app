// Shared by both backends. Browser only, no database.

/** Save an export to the person's computer. */
export function downloadExport(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'quizlike-my-data.json';
  link.click();
  URL.revokeObjectURL(url);
}
