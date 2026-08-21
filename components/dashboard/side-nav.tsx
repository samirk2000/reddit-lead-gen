"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, KeyRound, Settings, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof BarChart3;
  disabled?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Leads", icon: BarChart3 },
  { href: "/dashboard/keywords", label: "Keywords", icon: KeyRound },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-background">
      <div className="flex h-16 items-center gap-2 border-b border-border px-6 text-primary">
        <Search className="size-6" aria-hidden="true" />
        <span className="text-lg font-bold">Reddit LeadGen</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
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
    </aside>
  );
}
