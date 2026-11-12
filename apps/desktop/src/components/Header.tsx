import { useNavigate, Link, useLocation } from "react-router-dom";
import { Settings, ChevronLeft, CarIcon, Wrench, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { ModeToggle } from "./ModeToggle";

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const pathSegments = location.pathname.split("/").filter(Boolean);
  const isTopLevelSection = location.pathname === "/vehicles" || location.pathname === "/service-types/manage"; // Add other top-level paths
  const isNestedPage = !isTopLevelSection && pathSegments.length > 0; // Simpler check: any path not top-level is nested

  const commonLinkClasses = "transition-colors hover:text-foreground/80";
  const activeLinkClasses = "text-foreground font-semibold";

  const navLinks = [
    { href: "/vehicles", label: "My Vehicles" },
    // { href: "/reports", label: "Reports" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        {/* Left Section: Logo and Desktop Navigation */}
        <div className="flex items-center">
          <Link to="/vehicles" className="mr-6 flex items-center space-x-2">
            <CarIcon className="h-7 w-7 text-primary" />
            <span className="hidden font-bold sm:inline-block text-lg">CarBaddie</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`${commonLinkClasses} ${location.pathname.startsWith(link.href) ? activeLinkClasses : "text-foreground/60"}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Right Section: Actions and Mobile Navigation Trigger */}
        <div className="flex items-center gap-2 md:gap-3">
          {" "}
          {/* Adjusted gap slightly for desktop */}
          {/* Desktop "Back" Button for nested pages */}
          {isNestedPage && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(-1)}
                    className={cn("hidden md:inline-flex", "hover:bg-secondary hover:text-secondary-foreground")}
                  >
                    <ChevronLeft className="mr-1.5 h-4 w-4" /> Back
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Go to previous page</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {/* ModeToggle for Desktop - Placed before Settings */}
          <div className="hidden md:flex">
            {" "}
            {/* Only show on medium screens and up */}
            <ModeToggle />
          </div>
          {/* Settings Dropdown */}
          <DropdownMenu>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Settings className="h-5 w-5" />
                      <span className="sr-only">Settings & Management</span>
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Settings & Management</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Management</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate("/service-types/manage")}>
                <Wrench className="mr-2 h-4 w-4" />
                <span>Manage Service Types</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate("/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Application Settings</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Mobile Navigation: Hamburger Menu using Sheet */}
          <div className="md:hidden">
            {" "}
            {/* Only show on screens smaller than medium */}
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SheetTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <Menu className="h-6 w-6" />
                        <span className="sr-only">Open navigation menu</span>
                      </Button>
                    </SheetTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Menu</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <SheetContent side="right" className="w-[280px] p-0 pt-10">
                {/* Optional: Back button inside sheet if nested */}
                {isNestedPage && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      navigate(-1);
                      setIsMobileMenuOpen(false);
                    }}
                    className="absolute top-3 left-3 px-2" // Use SheetClose instead if preferred
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" /> Back
                  </Button>
                )}

                {/* Mobile Menu Header Area (e.g., for close button or ModeToggle) */}
                <div className="flex items-center justify-between px-4 mb-4">
                  <span className="font-semibold text-lg">Menu</span>
                  {/* ModeToggle for Mobile - Placed within the SheetContent */}
                  <ModeToggle />
                </div>

                <nav className="flex flex-col gap-1 px-4">
                  {" "}
                  {/* Reduced gap slightly */}
                  {navLinks.map((link) => (
                    <Button
                      key={link.href}
                      variant="ghost" // Use ghost for menu items
                      asChild
                      className={`justify-start text-base py-3 ${
                        // Increased py for better touch target
                        location.pathname.startsWith(link.href) ? "bg-accent text-accent-foreground" : ""
                      }`}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <Link to={link.href}>{link.label}</Link>
                    </Button>
                  ))}
                  {/* You can add a separator and management links here too for mobile */}
                  <DropdownMenuSeparator className="my-2" />
                  <Button
                    variant="ghost"
                    className="justify-start text-base py-3"
                    onClick={() => {
                      navigate("/service-types/manage");
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    <Wrench className="mr-2 h-4 w-4" /> Manage Service Types
                  </Button>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
