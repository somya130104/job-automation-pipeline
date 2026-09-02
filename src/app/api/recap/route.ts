import { requireUser } from "@/lib/auth";
import { ok, route } from "@/lib/api";
import { buildRecap } from "@/lib/recap";

export const runtime = "nodejs";

export const GET = route(async () => {
  const user = await requireUser();
  return ok(await buildRecap(user.id));
});
