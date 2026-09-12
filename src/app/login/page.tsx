import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const store = await cookies();
  if (await verifyAdminSession(store.get(ADMIN_COOKIE)?.value)) {
    redirect("/");
  }

  return (
    <main className="flex h-full items-center justify-center bg-[#141618] px-4">
      <AdminLoginForm />
    </main>
  );
}
