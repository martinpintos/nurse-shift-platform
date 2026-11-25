import { RoleRedirect } from "../components/RoleRouting";

/** `/` has no content of its own: it sends people to /login or their role's home. */
export default function Home() {
  return <RoleRedirect />;
}
