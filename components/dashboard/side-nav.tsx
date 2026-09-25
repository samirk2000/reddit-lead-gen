"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, KeyRound, MapPin, Settings, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

type NavItem = {
  href: string;
  label: string;
  icon: typeof BarChart3;
  disabled?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Leads", icon: BarChart3 },
  { href: "/dashboard/keywords", label: "Keywords", icon: KeyRound },
  { href: "/dashboard/maps", label: "Negocios sin web", icon: MapPin },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-border bg-background md:w-64 md:border-b-0 md:border-r">
      <div className="flex h-14 items-center justify-between gap-2 border-b border-border px-4 text-primary md:h-16 md:px-6">
        <div className="flex items-center gap-2">
          <Search className="size-6" aria-hidden="true" />
          <span className="text-lg font-bold">Reddit LeadGen</span>
        </div>
        <ThemeToggle className="md:hidden" />
      </div>

      <nav className="flex flex-wrap gap-1 p-2 md:block md:flex-1 md:space-y-1 md:p-3">
        {NAV_ITEMS.map((item) => {
          const active = isItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="hidden border-t border-border p-3 md:block">
        <ThemeToggle className="w-full justify-start gap-2" />
      </div>
    </aside>
  );
}
