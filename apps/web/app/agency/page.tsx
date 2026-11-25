import type { Metadata } from "next";
import { RequireRole } from "../../components/RoleRouting";
import { AgencyView } from "../../views/agency/AgencyView";

export const metadata: Metadata = { title: "Agency" };

export default function AgencyPage() {
  return (
    <RequireRole role="agency">
      <AgencyView />
    </RequireRole>
  );
}
