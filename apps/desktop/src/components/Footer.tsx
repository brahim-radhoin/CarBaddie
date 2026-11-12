import { CarIcon } from "lucide-react"; // Or your preferred logo icon

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex flex-col items-center justify-between gap-2 py-6 md:h-16 md:flex-row md:py-0"> {/* Consistent with header height */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CarIcon className="h-4 w-4" />
          <span>
            © {currentYear} CarBaddie. All rights reserved.
          </span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground md:gap-6">
          {/* Optional: Add links like Privacy Policy, Terms, etc. */}
          {/* <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
          <a href="/terms" className="hover:text-foreground transition-colors">Terms</a> */}
        </nav>
      </div>
    </footer>
  );
}