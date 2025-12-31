import { useQuery } from "@tanstack/react-query";
import { checkBackendHealth } from "../api";
import { Skeleton } from "./ui/skeleton";

export function BackendStatusProvider({ children }: { children: React.ReactNode }) {
  const { data: isBackendOnline } = useQuery({
    queryKey: ["backend-health"],
    queryFn: checkBackendHealth,
    refetchInterval: (query) => (query.state.data ? false : 2000),
    refetchOnWindowFocus: false,
    retry: true,
  });

  if (!isBackendOnline) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
        <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl mb-4">CarBaddie</h1>
            <p className="text-muted-foreground md:text-xl mb-8">Connecting to backend...</p>
            <div className="w-full max-w-md mx-auto">
                <Skeleton className="h-4 w-full rounded-full" />
            </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
