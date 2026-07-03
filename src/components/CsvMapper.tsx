import { extractRows, type ColumnMapping, type DateFormat, type RawCsv } from '../lib/csv'
import { formatINRExact } from '../lib/money'

interface Props {
  raw: RawCsv
  mapping: ColumnMapping
  onChange: (mapping: ColumnMapping) => void
}

const DATE_FORMATS: DateFormat[] = ['DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD']

export default function CsvMapper({ raw, mapping, onChange }: Props) {
  const preview = extractRows({ ...raw, rows: raw.rows.slice(0, 20) }, mapping).slice(0, 5)

  function columnSelect(
    label: string,
    value: number | undefined,
    onSelect: (col: number | undefined) => void,
    allowNone = false,
  ) {
    return (
      <label className="block text-sm">
        <span className="font-medium">{label}</span>
        <select
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          value={value ?? -1}
          onChange={(e) => {
            const v = Number(e.target.value)
            onSelect(v < 0 ? undefined : v)
          }}
        >
          {allowNone && <option value={-1}>— none —</option>}
          {raw.headers.map((h, i) => (
            <option key={i} value={i}>
              {h || `column ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {columnSelect('Date column', mapping.dateCol, (c) => onChange({ ...mapping, dateCol: c ?? 0 }))}
        {columnSelect('Description column', mapping.descCol, (c) => onChange({ ...mapping, descCol: c ?? 0 }))}
        <label className="block text-sm">
          <span className="font-medium">Date format</span>
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            value={mapping.dateFormat}
            onChange={(e) => onChange({ ...mapping, dateFormat: e.target.value as DateFormat })}
          >
            {DATE_FORMATS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm md:col-span-3">
          <span className="font-medium">Amount layout</span>
          <div className="mt-1 flex gap-2">
            {(
              [
                ['debitCredit', 'Separate withdrawal & deposit columns'],
                ['single', 'One amount column'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChange({ ...mapping, mode })}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  mapping.mode === mode ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </label>
        {mapping.mode === 'debitCredit' ? (
          <>
            {columnSelect('Withdrawal (debit) column', mapping.debitCol, (c) => onChange({ ...mapping, debitCol: c }))}
            {columnSelect('Deposit (credit) column', mapping.creditCol, (c) => onChange({ ...mapping, creditCol: c }))}
          </>
        ) : (
          <>
            {columnSelect('Amount column', mapping.amountCol, (c) => onChange({ ...mapping, amountCol: c }))}
            {columnSelect('Dr/Cr column (optional)', mapping.drcrCol, (c) => onChange({ ...mapping, drcrCol: c }), true)}
          </>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">Preview ({preview.length ? 'first rows parsed with this mapping' : 'nothing parses — adjust the mapping'})</p>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-1.5">Date</th>
                <th className="px-3 py-1.5">Description</th>
                <th className="px-3 py-1.5">Type</th>
                <th className="px-3 py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {preview.map((row, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 whitespace-nowrap">{row.date}</td>
                  <td className="max-w-64 truncate px-3 py-1.5">{row.description}</td>
                  <td className="px-3 py-1.5">{row.type}</td>
                  <td className="px-3 py-1.5 text-right">{formatINRExact(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
