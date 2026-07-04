import { cn } from '@/lib/utils'
import { extractRows, type ColumnMapping, type DateFormat, type RawCsv } from '../lib/csv'
import { formatINRExact } from '../lib/money'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface Props {
  raw: RawCsv
  mapping: ColumnMapping
  onChange: (mapping: ColumnMapping) => void
}

const DATE_FORMATS: DateFormat[] = ['DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD']

const selectClass =
  'h-8 w-full rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'

export default function CsvMapper({ raw, mapping, onChange }: Props) {
  const preview = extractRows({ ...raw, rows: raw.rows.slice(0, 20) }, mapping).slice(0, 5)

  function columnSelect(
    label: string,
    value: number | undefined,
    onSelect: (col: number | undefined) => void,
    allowNone = false,
  ) {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <select
          className={selectClass}
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
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {columnSelect('Date column', mapping.dateCol, (c) => onChange({ ...mapping, dateCol: c ?? 0 }))}
        {columnSelect('Description column', mapping.descCol, (c) => onChange({ ...mapping, descCol: c ?? 0 }))}
        <div className="space-y-1.5">
          <Label>Date format</Label>
          <select
            className={selectClass}
            value={mapping.dateFormat}
            onChange={(e) => onChange({ ...mapping, dateFormat: e.target.value as DateFormat })}
          >
            {DATE_FORMATS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label>Amount layout</Label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['debitCredit', 'Separate withdrawal & deposit columns'],
                ['single', 'One amount column'],
              ] as const
            ).map(([mode, label]) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={mapping.mode === mode ? 'default' : 'outline'}
                onClick={() => onChange({ ...mapping, mode })}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
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
        <p className={cn('mb-1.5 text-xs font-medium', preview.length ? 'text-muted-foreground' : 'text-red-600')}>
          {preview.length ? 'Preview — first rows parsed with this mapping' : 'Nothing parses — adjust the mapping'}
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-background">
              {preview.map((row, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap px-3 py-1.5">{row.date}</td>
                  <td className="max-w-64 truncate px-3 py-1.5">{row.description}</td>
                  <td className="px-3 py-1.5">{row.type}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatINRExact(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
