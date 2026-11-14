import { useMemo, useState } from "react";
import { MaintenanceLogRead } from "../types";
import { format, parseISO } from "date-fns";
import { Gauge, Search, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUnits } from "../hooks/useUnits";

interface ActivityTimelineProps {
  logs: MaintenanceLogRead[];
  onSelectDate?: (date: string) => void;
}

export function ActivityTimeline({ logs, onSelectDate }: ActivityTimelineProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const units = useUnits();

  const filteredLogs = useMemo(() => {
    let result = [...logs];

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(
        (log) =>
          log.notes?.toLowerCase().includes(lower) ||
          log.service_type?.name.toLowerCase().includes(lower)
      );
    }

    result.sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      return sortOrder === "desc" ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [logs, searchTerm, sortOrder]);

  const groupedLogs = useMemo(() => {
    return filteredLogs.reduce((groups, log) => {
      const monthYear = format(parseISO(log.date), "MMMM yyyy");
      if (!groups[monthYear]) {
        groups[monthYear] = [];
      }
      groups[monthYear].push(log);
      return groups;
    }, {} as Record<string, MaintenanceLogRead[]>);
  }, [filteredLogs]);

  return (
    <div className="space-y-5">
      {/* Search and Sort Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground opacity-60" />
          <Input
            type="search"
            placeholder="Search records by category or notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-xs bg-background"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5 self-start sm:self-auto"
          onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
        >
          <ArrowUpDown className="h-3 w-3 opacity-60" />
          {sortOrder === "desc" ? "Newest First" : "Oldest First"}
        </Button>
      </div>

      {/* Timeline Stream */}
      <div className="space-y-6">
        {Object.keys(groupedLogs).length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
            No activity matches your search criteria.
          </div>
        ) : (
          Object.entries(groupedLogs).map(([month, monthLogs]) => (
            <div key={month} className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground tracking-tight">{month}</span>
                <span className="h-px flex-1 bg-border/60" />
                <span className="font-mono text-[10px] text-muted-foreground">{monthLogs.length} events</span>
              </div>

              <div className="space-y-2 pl-2 border-l border-border/80 ml-1">
                {monthLogs.map((log) => (
                  <div
                    key={log.id}
                    onClick={() => onSelectDate?.(log.date)}
                    className="p-3 rounded border border-border bg-card/60 hover:bg-accent/20 transition-colors text-xs"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {log.service_type?.name ?? "Maintenance"}
                      </span>
                      <span className="font-mono text-[11px] font-medium text-foreground">
                        {units.money(log.cost_cents)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 font-mono text-[11px] text-muted-foreground">
                      <span>{log.date}</span>
                      <span className="opacity-30">/</span>
                      <span className="flex items-center gap-1">
                        <Gauge className="h-3 w-3 opacity-60" />
                        {units.distance(log.mileage)}
                      </span>
                    </div>

                    {log.notes && (
                      <p className="mt-2 text-[11px] text-muted-foreground/90 leading-relaxed pt-1.5 border-t border-border/40">
                        {log.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
