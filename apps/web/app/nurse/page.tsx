import type { Metadata } from "next";
import { RequireRole } from "../../components/RoleRouting";
import { NurseView } from "../../views/nurse/NurseView";

export const metadata: Metadata = { title: "Find shifts" };

export default function NursePage() {
  return (
    <RequireRole role="nurse">
      <NurseView />
    </RequireRole>
  );
}
