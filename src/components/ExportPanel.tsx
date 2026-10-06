import { btn, btnGhost } from "./ui";

/**
 * The two hand-over downloads. Plain HTML form posts (no JavaScript needed) so the browser saves the file directly.
 * Excel = the agreed IT format (one row per student-course). PDF = one page per student with courses and sections.
 */
export function ExportPanel({ studentId, counts }: { studentId?: number; counts?: { all: number; fresh: number } }) {
  return (
    <form method="post" className="space-y-3">
      {studentId ? <input type="hidden" name="studentId" value={studentId} /> : null}
      {counts && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Which registrations</span>
          <select name="scope" defaultValue={counts.fresh > 0 ? "new" : "all"} className="w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="new">New or changed since the last Excel export ({counts.fresh})</option>
            <option value="all">All finalized registrations ({counts.all})</option>
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button formAction="/api/export/excel" className={btn}>⬇ Excel for IT (.xlsx)</button>
        <button formAction="/api/export/pdf" className={btn}>⬇ {studentId ? "PDF slip" : "Combined PDF (one page per student)"}</button>
        {!studentId && <button formAction="/api/export" className={btnGhost}>CSV</button>}
      </div>
    </form>
  );
}
