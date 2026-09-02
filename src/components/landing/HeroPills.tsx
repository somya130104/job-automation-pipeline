"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { FileText, Sparkles, Target } from "lucide-react";

/**
 * The floating utility row from the reference ("Baarish? / Part Time Earning
 * / Share"), reskinned for job hunting. Staggered in so they feel like they
 * settle onto the photo rather than being part of the layout.
 */
export function HeroPills({
  jobCount,
  companyCount,
}: {
  jobCount: number;
  companyCount: number;
}) {
  const pills = [
    {
      href: "/dashboard",
      icon: Target,
      label: "Today's matches",
      value: jobCount.toLocaleString("en-IN"),
    },
    {
      href: "/onboarding",
      icon: FileText,
      label: "Resume score",
      value: "ATS check",
    },
    {
      href: "/insights",
      icon: Sparkles,
      label: "Companies",
      value: String(companyCount),
    },
  ];

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: 0.09, delayChildren: 0.45 } },
      }}
      className="mt-12 flex flex-wrap items-center justify-center gap-2.5"
    >
      {pills.map(({ href, icon: Icon, label, value }) => (
        <motion.div
          key={label}
          variants={{
            hidden: { opacity: 0, y: 14, scale: 0.94 },
            visible: { opacity: 1, y: 0, scale: 1 },
          }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
        >
          <Link href={href} className="pill">
            <Icon className="h-3.5 w-3.5 text-accent" aria-hidden />
            <span className="text-paper/80">{label}</span>
            <span className="font-mono font-bold text-accent">{value}</span>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
