import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useTheme } from "next-themes"; // Import useTheme
import React, { useEffect, useMemo, useState } from "react"; // Added useEffect
import ActivityCalendar, { type Contribution, type ExplicitBlock } from "react-activity-calendar";
import { Tooltip as ReactTooltip } from "react-tooltip";
import { MaintenanceLogRead } from "../types";

// Helper to get all years present in logs, plus current and next/prev
const getAvailableYears = (logs: MaintenanceLogRead[]): number[] => {
  if (!logs || logs.length === 0) return [new Date().getFullYear()];
  const years = new Set<number>([new Date().getFullYear()]);
  logs.forEach((log) => years.add(new Date(log.date).getFullYear()));
  return Array.from(years).sort((a, b) => a - b);
};

/**
 * Generates a complete dataset for a given year, merging log counts.
 * This ensures the heatmap always displays a full year.
 */
const generateFullYearData = (year: number, logsForYear: Record<string, { count: number }>): Contribution[] => {
  const fullYearData: Contribution[] = [];
  const startDate = new Date(year, 0, 1);
  const today = new Date();
  const currentYear = today.getFullYear();
  today.setDate(today.getDate() + 1);
  // If the selected year is the current year, end the loop at today. Otherwise, end at Dec 31st.
  const endDate = (year === currentYear) ? today : new Date(year, 11, 31);

  for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateString = d.toISOString().split("T")[0];
    const logData = logsForYear[dateString];

    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (logData) {
      if (logData.count >= 5) level = 4;
      else if (logData.count >= 3) level = 3;
      else if (logData.count >= 2) level = 2;
      else if (logData.count >= 1) level = 1;
    }

    fullYearData.push({
      date: dateString,
      count: logData?.count || 0,
      level: level,
    });
  }
  return fullYearData;
};

interface MaintenanceHeatmapProps {
  logs: MaintenanceLogRead[];
  initialYear?: number;
  onDayClick?: (date: string, count: number, logsForDay: MaintenanceLogRead[]) => void;
}

export function MaintenanceHeatmap({ logs, initialYear, onDayClick }: MaintenanceHeatmapProps) {
  const { resolvedTheme } = useTheme(); // Get the resolved theme
  const availableYears = useMemo(() => getAvailableYears(logs), [logs]);
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const currentYear = new Date().getFullYear();
    return initialYear && availableYears.includes(initialYear) ? initialYear : currentYear;
  });

  // State to manage ActivityCalendar re-render on theme change if needed
  // Usually, passing resolvedTheme to colorScheme prop is enough
  const [calendarKey, setCalendarKey] = useState(0);
  useEffect(() => {
    setCalendarKey((prev) => prev + 1); // Force re-render if ActivityCalendar doesn't pick up colorScheme change immediately
  }, [resolvedTheme]);

  const dataForYear = useMemo(() => {
    return logs
      .filter((log) => log.date && new Date(log.date).getFullYear() === selectedYear)
      .reduce<Record<string, { count: number; logs: MaintenanceLogRead[] }>>((acc, log) => {
        const dateStr = log.date.split("T")[0];
        if (!acc[dateStr]) acc[dateStr] = { count: 0, logs: [] };
        acc[dateStr].count += 1;
        acc[dateStr].logs.push(log);
        return acc;
      }, {});
  }, [logs, selectedYear]);

  const calendarData = useMemo(() => {
    return generateFullYearData(selectedYear, dataForYear);
  }, [selectedYear, dataForYear]);

  const handleYearChange = (direction: "prev" | "next") => {
    const currentIndex = availableYears.indexOf(selectedYear);
    if (direction === "prev" && currentIndex > 0) {
      setSelectedYear(availableYears[currentIndex - 1]);
    } else if (direction === "next" && currentIndex < availableYears.length - 1) {
      setSelectedYear(availableYears[currentIndex + 1]);
    }
  };

  const currentYearIndex = availableYears.indexOf(selectedYear);

  // Define theme colors. The level 0 colors are reasonable defaults.
  // You could also use shadcn/ui CSS variables for level 0 if desired, e.g.,
  // light: [ `hsl(var(--accent))`, ... ], dark: [ `hsl(var(--accent))`, ... ]
  // but ensure the dark mode --accent provides enough contrast if it's very dark.
  // The current hardcoded ones are typical for heatmaps.
  const calendarThemes = {
    light: [
      "hsl(0, 0%, 92%)", // level 0 - light gray
      "oklch(from var(--primary) l c h / 0.4)", // Use oklch relative color syntax
      "oklch(from var(--primary) l c h / 0.6)",
      "oklch(from var(--primary) l c h / 0.8)", // Level 3
      "oklch(from var(--primary) l c h / 1.0)",
    ],
    dark: [
      "hsl(0, 0%, 15%)", // level 0 - dark gray
      "oklch(from var(--primary) l c h / 0.4)", // Use oklch relative color syntax
      "oklch(from var(--primary) l c h / 0.6)",
      "oklch(from var(--primary) l c h / 0.8)", // Level 3
      "oklch(from var(--primary) l c h / 1.0)",
    ],
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
          <CardTitle className="text-xl flex items-center">
            <CalendarDays className="mr-2 h-5 w-5 text-primary" />
            Maintenance Activity ({selectedYear})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleYearChange("prev")}
              disabled={currentYearIndex <= 0}
              aria-label="Previous year"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select value={String(selectedYear)} onValueChange={(yearStr) => setSelectedYear(Number(yearStr))}>
              <SelectTrigger className="w-[120px] h-9 text-sm">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={String(year)} className="text-sm">
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleYearChange("next")}
              disabled={currentYearIndex >= availableYears.length - 1}
              aria-label="Next year"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto py-4">
        {calendarData.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No maintenance activity recorded for {selectedYear}.</p>
        )}
        {calendarData.length > 0 && (
          <ActivityCalendar
            key={calendarKey} // Add key to help React re-render if internal state doesn't catch theme change
            data={calendarData}
            theme={calendarThemes}
            colorScheme={resolvedTheme as "light" | "dark" | undefined} // Pass resolvedTheme
            labels={{
              months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
              weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
              totalCount: `{{count}} maintenance activities in ${selectedYear}`,
              legend: {
                less: "Less",
                more: "More",
              },
            }}
            showWeekdayLabels
            weekStart={0}
            renderBlock={(block, activity) => {
              return React.cloneElement(block, {
                "data-tooltip-id": "activity-tooltip",
                "data-tooltip-html":
                  activity.count > 0
                    ? `${activity.count} log${activity.count > 1 ? "s" : ""} on ${new Date(
                        activity.date + "T00:00:00" // Ensure date is parsed as local
                      ).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`
                    : `No logs on ${new Date(activity.date + "T00:00:00").toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}`,
              });
            }}
            eventHandlers={{
              onClick: (_event) => (activity) => {
                if (activity.count > 0 && onDayClick) {
                  const logsForClickedDay = dataForYear[activity.date]?.logs || [];
                  onDayClick(activity.date, activity.count, logsForClickedDay);
                }
              },
            }}
            blockSize={13}
            blockMargin={3}
            fontSize={12}
          />
        )}
        <ReactTooltip
          id="activity-tooltip"
          className="z-50 !bg-popover !text-popover-foreground !p-2 !rounded-md !shadow-lg !text-xs !opacity-100" // Ensure opacity
          // place="top" // Optional: adjust placement
        />
      </CardContent>
    </Card>
  );
}
