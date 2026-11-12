import { Sidebar } from "./Sidebar";
import { Toaster } from "sonner";
import { Outlet } from "react-router-dom";
import { useTheme } from "next-themes";

export function Layout() {
  const { resolvedTheme } = useTheme();

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell-content">
        <Toaster richColors theme={resolvedTheme === "dark" ? "dark" : "light"} />
        <main className="flex-1 p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
