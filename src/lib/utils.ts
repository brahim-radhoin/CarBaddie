import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface CustomField {
  id: number;
  name: string;
  field_type: "text" | "number";
  service_type_id: number;
}

export interface CustomFieldValue {
  field_id: number;
  value: string | number;
}
export interface VehicleStatsData {
  currentMileage: number | "N/A";
  lastServiceDate: string | null;
  daysSinceLastSvc: number | null;
  totalLogs: number;
  totalCost: number;
  averageCostPerService: number;
  vehicleAge: number | null;
}

/**
 * Formats a number into a currency string.
 * @param amount The number to format.
 * @returns A string representing the currency, e.g., "TND 90.000", or "N/A" if input is invalid.
 */
export const formatCurrency = (amount?: number): string => {
  if (typeof amount !== "number" || isNaN(amount)) {
    return "N/A";
  }
  // You can customize the locale and currency as needed
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "TND", // Changed to Tunisian Dinar as per previous code
  }).format(amount);
};

/**
 * Formats a date string or Date object into a readable format.
 * @param dateInput The date to format.
 * @returns A string like "May 21, 2025", or "N/A" if input is invalid.
 */
export const formatDate = (dateInput?: Date | string | null): string => {
  if (!dateInput) return "N/A";

  let dateObj: Date;
  if (typeof dateInput === 'string') {
    // Handle "YYYY-MM-DD" strings by ensuring local timezone interpretation
    if (dateInput.length === 10 && dateInput.includes('-')) {
      const parts = dateInput.split('-');
      // Note: Month is 0-indexed in JS Date constructor (0=Jan, 1=Feb, etc.)
      dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    } else {
      dateObj = new Date(dateInput); // For full ISO strings or other parsable formats
    }
  } else { // It's a Date object
    dateObj = dateInput;
  }

  if (isNaN(dateObj.getTime())) return "N/A"; // Check if the created date is valid

  return dateObj.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/**
 * A convenience wrapper for formatDate that returns "N/A" for null/undefined inputs.
 * @param dateStr The date string to format.
 * @returns Formatted date string or "N/A".
 */
export const getReadableDate = (dateStr?: string | null): string => (dateStr ? formatDate(dateStr) : "N/A");

// --- Shared Type Definitions ---
// It's good practice to keep types related to specific data models in types.ts,
// but utility types for components can live here.

// Type for the data used by the main statistics grid
export interface VehicleStatsData {
  currentMileage: number | "N/A";
  lastServiceDate: string | null;
  daysSinceLastSvc: number | null;
  totalLogs: number;
  totalCost: number;
  averageCostPerService: number;
  vehicleAge: number | null;
}

// Type for the data points in the cost breakdown chart
export interface CostChartData {
  name: string;
  cost: number;
}