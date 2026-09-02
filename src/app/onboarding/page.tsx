import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { readList } from "@/lib/json-list";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { PhotoBackdrop } from "@/components/landing/PhotoBackdrop";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  return (
    <main className="grain relative min-h-[100svh] overflow-hidden">
      <PhotoBackdrop src="/images/hero.jpg" priority className="opacity-70" />
      <div className="relative z-10 mx-auto max-w-2xl px-4 py-12 sm:py-16">
        <OnboardingFlow
          initial={{
            targetRoles: readList<string>(user.targetRoles),
            targetLocations: readList<string>(user.targetLocations),
            experienceYears: user.experienceYears,
            roleType: user.roleType === "internship" ? "internship" : "fulltime",
            remoteOnly: user.remoteOnly,
          }}
        />
      </div>
    </main>
  );
}
