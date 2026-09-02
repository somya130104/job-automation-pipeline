import Image from "next/image";

/**
 * Full-bleed photo backdrop behind a section. The theme-aware `--hero-wash`
 * gradient sits on top of it — that's what tints the same photo amber /
 * blueprint-blue / terminal-green per skin, and carries the bottom vignette
 * that keeps a headline readable over it. Purely decorative, so aria-hidden.
 *
 * Put it as the first child of a `relative overflow-hidden` section, and give
 * the real content `relative z-10`.
 */
export function PhotoBackdrop({
  src,
  priority = false,
  imgClassName = "object-cover",
  className = "",
}: {
  src: string;
  priority?: boolean;
  imgClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}
      aria-hidden
    >
      <Image
        src={src}
        alt=""
        fill
        priority={priority}
        sizes="100vw"
        className={imgClassName}
      />
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "var(--hero-wash)" }}
      />
    </div>
  );
}
