import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/auth";
import { SideNav } from "@/components/dashboard/side-nav";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-muted">
        <SideNav />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-end border-b border-border bg-background px-6">
            <div className="flex items-center gap-4">
              <span className="max-w-[200px] truncate text-sm text-muted-foreground">
                {user.email ?? "usuario"}
              </span>
              <SignOutButton />
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-6 md:p-8">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
