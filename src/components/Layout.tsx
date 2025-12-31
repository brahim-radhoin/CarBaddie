// src/components/Layout.tsx
import { Header } from "./Header";
import { Footer } from "./Footer";
import { Toaster } from "sonner";
import { Outlet } from "react-router-dom";
import { useTheme } from "next-themes"; 

export function Layout() {
  const headerPaddingTop = "pt-6";
  const { resolvedTheme } = useTheme();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <Toaster richColors theme={resolvedTheme === "dark" ? "dark" : "light" } />
      <main className={`container flex-1 ${headerPaddingTop} pb-10 md:pb-12 lg:pb-16`}><Outlet /> </main>
      <Footer />
    </div>
  );
}
