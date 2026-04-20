import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { DashboardClient } from "./_components/dashboard-client";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <DashboardClient
      userName={session.user?.name ?? null}
      userEmail={session.user?.email ?? null}
    >
      {children}
    </DashboardClient>
  );
}
