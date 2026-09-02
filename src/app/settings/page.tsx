import { redirect } from "next/navigation";
import { getCurrentUser, clerkEnabled } from "@/lib/auth";
import { db } from "@/lib/db";
import { readList } from "@/lib/json-list";
import { AppNav } from "@/components/chrome/AppNav";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { CompaniesManager } from "@/components/settings/CompaniesManager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const trackedCompanies = await db.trackedCompany.findMany({
    where: { userId: user.id },
    orderBy: [{ discoveryStatus: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, website: true, atsType: true, atsToken: true,
      discoveryStatus: true, ycBatch: true,
    },
  });

  const resumes = await db.resume.findMany({
    where: { userId: user.id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      label: true,
      fileName: true,
      isPrimary: true,
      atsScore: true,
      createdAt: true,
      skills: true,
    },
  });

  return (
    <>
      <AppNav />

      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="label-mono mb-1.5 !text-accent">Settings</p>
        <h1 className="display mb-8 text-4xl sm:text-5xl">Tune the feed</h1>

        <SettingsForm
          initial={{
            targetRoles: readList<string>(user.targetRoles),
            targetLocations: readList<string>(user.targetLocations),
            experienceYears: user.experienceYears,
            roleType: user.roleType === "internship" ? "internship" : "fulltime",
            remoteOnly: user.remoteOnly,
            digestFrequency: user.digestFrequency,
            matchThreshold: user.matchThreshold,
          }}
          resumes={resumes.map((r) => ({
            id: r.id,
            label: r.label,
            fileName: r.fileName,
            isPrimary: r.isPrimary,
            atsScore: r.atsScore,
            skillCount: readList<string>(r.skills).length,
            createdAt: r.createdAt.toISOString(),
          }))}
          authMode={clerkEnabled() ? "clerk" : "local"}
        />

        <div className="mt-5">
          <CompaniesManager initial={trackedCompanies} />
        </div>
      </main>
    </>
  );
}
