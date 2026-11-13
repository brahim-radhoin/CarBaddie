import { useQuery } from "@tanstack/react-query";

// The make/model/year catalog (19.7k rows) is a read-only asset bundled with the app, not part of
// the user's database. It is loaded on first use as a separate chunk.
interface CatalogEntry {
  year: number;
  make: string;
  model: string;
}

let catalog: Promise<CatalogEntry[]> | null = null;
const loadCatalog = () => (catalog ??= import("../data/vehicle-catalog.json").then((m) => m.default as CatalogEntry[]));

const distinct = <T,>(values: T[]) => [...new Set(values)];

export const useGetMakes = (year?: number) => {
  return useQuery({
    queryKey: ["makes", year],
    queryFn: async () => {
      const rows = (await loadCatalog()).filter((r) => !year || r.year === year);
      return distinct(rows.map((r) => r.make)).sort();
    },
    staleTime: Infinity,
  });
};

export const useGetModels = (make: string, year?: number) => {
  return useQuery({
    queryKey: ["models", make, year],
    queryFn: async () => {
      const rows = (await loadCatalog()).filter((r) => r.make === make && (!year || r.year === year));
      return distinct(rows.map((r) => r.model)).sort();
    },
    enabled: !!make,
    staleTime: Infinity,
  });
};

export const useGetYears = (make?: string, model?: string) => {
  return useQuery({
    queryKey: ["years", make, model],
    queryFn: async () => {
      const rows = (await loadCatalog()).filter((r) => (!make || r.make === make) && (!model || r.model === model));
      return distinct(rows.map((r) => r.year)).sort((a, b) => b - a);
    },
    staleTime: Infinity,
  });
};
