import type { Metadata } from "next";
import { RequireRole } from "../../components/RoleRouting";
import { AdminView } from "../../views/admin/AdminView";

export const metadata: Metadata = { title: "Operations" };

export default function AdminPage() {
  return (
    <RequireRole role="admin">
      <AdminView />
    </RequireRole>
  );
}
