import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { resolveHome } from "@/lib/workspace";

export default async function Root() {
  const user = await requireUser();
  redirect(await resolveHome(user.id));
}
