import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Search } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { calculateMonth, formatDuration } from "@/lib/attendance/calculations";
import type { MonthResult } from "@/types/attendance";
import type { AttendanceData } from "./useAttendance";
import { Balance, Hours, StatTile } from "./shared";

/**
 * Month-to-date totals, one row per employee.
 *
 * A month here is the weeks that *begin* in it. Overtime is settled weekly, so
 * a week split across two months would have to have its surplus either counted
 * twice or thrown away — see the Rules tab, where this is spelled out for the
 * people who will be checking these figures.
 */
export function MonthlyTab({ data }: { data: AttendanceData }) {
  const isMobile = useIsMobile();
  const [month, setMonth] = useState(data.months[0] ?? `${data.today.slice(0, 7)}-01`);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.employees
      .filter((e) => department === "all" || e.department === department)
      .filter((e) => !q || `${e.name} ${e.id}`.toLowerCase().includes(q))
      .map((employee) => ({
        employee,
        month: calculateMonth(employee.id, month, data.recordsFor(employee.id)),
      }));
  }, [data, month, query, department]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (t, { month: m }) => ({
          worked: t.worked + m.workedMinutes,
          normal: t.normal + m.normalMinutes,
          compensation: t.compensation + m.compensationMinutes,
          overtime: t.overtime + m.overtimeMinutes,
          shortfall: t.shortfall + m.shortfallMinutes,
        }),
        { worked: 0, normal: 0, compensation: 0, overtime: 0, shortfall: 0 },
      ),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Staff" value={String(rows.length)} />
        <StatTile label="Total worked" value={formatDuration(totals.worked)} />
        <StatTile label="Normal" value={formatDuration(totals.normal)} />
        <StatTile
          label="Compensation"
          value={formatDuration(totals.compensation)}
          tone="warning"
        />
        <StatTile label="Overtime" value={formatDuration(totals.overtime)} tone="primary" />
        <StatTile
          label="Shortfall"
          value={formatDuration(totals.shortfall)}
          tone={totals.shortfall > 0 ? "destructive" : "default"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.months.map((m) => (
              <SelectItem key={m} value={m}>
                {format(parseISO(m), "MMMM yyyy")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Name or staff number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {data.departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No employees match these filters.
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="space-y-2">
          {rows.map(({ employee, month: m }) => (
            <Card key={employee.id}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{employee.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {employee.id} · {employee.department}
                    </div>
                  </div>
                  <div className="shrink-0 font-semibold tabular-nums">
                    {formatDuration(m.workedMinutes)}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                  <Pair label="Normal" value={formatDuration(m.normalMinutes)} />
                  <Pair label="Compensation" value={formatDuration(m.compensationMinutes)} />
                  <Pair label="Overtime" value={formatDuration(m.overtimeMinutes)} />
                  <Pair label="Shortfall" value={formatDuration(m.shortfallMinutes)} />
                  <Pair label="Days worked" value={String(m.daysWorked)} />
                  <Pair label="Missing" value={String(m.daysMissing)} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[190px]">Employee</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead className="text-right">Normal</TableHead>
                    <TableHead className="text-right">Compensation</TableHead>
                    <TableHead className="text-right">Overtime</TableHead>
                    <TableHead className="text-right">Shortfall</TableHead>
                    <TableHead className="text-right">Total worked</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ employee, month: m }) => (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <div className="font-medium leading-tight">{employee.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {employee.id} · {employee.position}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {employee.department}
                      </TableCell>
                      <TableCell className="text-right">
                        <Hours minutes={m.normalMinutes} />
                      </TableCell>
                      <TableCell className="text-right">
                        {m.compensationMinutes > 0 ? (
                          <span className="tabular-nums text-warning">
                            {formatDuration(m.compensationMinutes)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.overtimeMinutes > 0 ? (
                          <span className="font-medium tabular-nums text-primary">
                            {formatDuration(m.overtimeMinutes)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.shortfallMinutes > 0 ? (
                          <span className="tabular-nums text-destructive">
                            {formatDuration(m.shortfallMinutes)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        <Hours minutes={m.workedMinutes} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.daysWorked}
                        {m.daysMissing > 0 && (
                          <span className="text-destructive"> ({m.daysMissing}!)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Balance minutes={m.workedMinutes - m.targetMinutes} />
                      </TableCell>
                    </TableRow>
                  ))}
                  <TotalsRow rows={rows.map((r) => r.month)} />
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground">
        A month covers the weeks that begin in it, because overtime is settled
        weekly and a week cannot be split across two months without counting its
        surplus twice.
      </p>
    </div>
  );
}

function TotalsRow({ rows }: { rows: MonthResult[] }) {
  const sum = (pick: (m: MonthResult) => number) =>
    rows.reduce((t, m) => t + pick(m), 0);
  return (
    <TableRow className="border-t-2 font-semibold">
      <TableCell colSpan={2}>Total</TableCell>
      <TableCell className="text-right">
        <Hours minutes={sum((m) => m.normalMinutes)} />
      </TableCell>
      <TableCell className="text-right">
        <Hours minutes={sum((m) => m.compensationMinutes)} />
      </TableCell>
      <TableCell className="text-right">
        <Hours minutes={sum((m) => m.overtimeMinutes)} />
      </TableCell>
      <TableCell className="text-right">
        <Hours minutes={sum((m) => m.shortfallMinutes)} />
      </TableCell>
      <TableCell className="text-right">
        <Hours minutes={sum((m) => m.workedMinutes)} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {sum((m) => m.daysWorked)}
      </TableCell>
      <TableCell className="text-right">
        <Balance minutes={sum((m) => m.workedMinutes - m.targetMinutes)} />
      </TableCell>
    </TableRow>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
