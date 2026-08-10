import { useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import type { Timesheets } from "./useTimesheets";

/** The staff list the timesheet is filled in against. Read-only for now. */
export function EmployeesTab({ sheets }: { sheets: Timesheets }) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sheets.employees.filter((e) => {
      if (department !== "all" && e.department !== department) return false;
      return !q || `${e.id} ${e.name} ${e.position}`.toLowerCase().includes(q);
    });
  }, [sheets.employees, query, department]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[190px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Employee ID, name or position…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {sheets.departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {rows.length} of {sheets.employees.length}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Emp ID</TableHead>
                  <TableHead className="min-w-[180px]">Name</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-mono text-xs">{employee.id}</TableCell>
                    <TableCell className="font-medium">{employee.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {employee.department}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {employee.position}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={employee.active ? "success" : "secondary"}>
                        {employee.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No employees match that search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
