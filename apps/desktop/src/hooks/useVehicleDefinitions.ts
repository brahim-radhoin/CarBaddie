import { useQuery } from "@tanstack/react-query";
import axios from "axios";

// Assume BASE_URL is defined somewhere or use relative path if proxy is set up.
// For now, hardcoding based on existing patterns or using the same base as other api calls.
const API_BASE_URL = "http://localhost:8000";

export const useGetMakes = (year?: number) => {
  return useQuery({
    queryKey: ["makes", year],
    queryFn: async () => {
      const params = year ? { year } : {};
      const { data } = await axios.get(`${API_BASE_URL}/vehicle-definitions/makes`, { params });
      return data as string[];
    },
  });
};

export const useGetModels = (make: string, year?: number) => {
  return useQuery({
    queryKey: ["models", make, year],
    queryFn: async () => {
      const params = { make, ...(year ? { year } : {}) };
      const { data } = await axios.get(`${API_BASE_URL}/vehicle-definitions/models`, { params });
      return data as string[];
    },
    enabled: !!make, // Only fetch if make is selected
  });
};

export const useGetYears = (make?: string, model?: string) => {
  return useQuery({
    queryKey: ["years", make, model],
    queryFn: async () => {
      const params = {
        ...(make ? { make } : {}),
        ...(model ? { model } : {}),
      };
      const { data } = await axios.get(`${API_BASE_URL}/vehicle-definitions/years`, { params });
      return data as number[];
    },
  });
};
