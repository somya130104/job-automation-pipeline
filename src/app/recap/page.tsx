import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { buildRecap } from "@/lib/recap";
import { AppNav } from "@/components/chrome/AppNav";
import { RecapCard } from "@/components/recap/RecapCard";

export const dynamic = "force-dynamic";

export default async function RecapPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!user.onboarded) redirect("/onboarding");

  const recap = await buildRecap(user.id);

  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p className="label-mono mb-1.5 !text-accent">Weekly recap</p>
        <h1 className="display mb-2 text-4xl sm:text-5xl">Your week</h1>
        <p className="mb-8 max-w-[52ch] text-sm text-paper/70">
          Screenshot the card and post it. Nothing identifying, just the
          numbers — the job-hunt version of a workout-streak share.
        </p>

        <RecapCard recap={recap} userName={user.name} />

        <Link href="/insights" className="btn btn-ghost mt-6">
          Full insights
        </Link>
      </main>
    </>
  );
}
