/**
 * Canonical skill taxonomy.
 *
 * Phase 1 scoring is keyword-overlap based, which lives or dies on aliasing:
 * a JD says "Node.js", a resume says "NodeJS", and a naive string match scores
 * that as a gap. Every skill therefore has one canonical label plus the
 * surface forms we expect to see in the wild.
 *
 * Phase 2 swaps the *similarity* half of the score for embeddings, but this
 * table stays — the missing-keywords feature is a set-difference problem, not
 * a similarity problem, and needs explicit entities either way.
 */

export type SkillCategory =
  | "language"
  | "frontend"
  | "backend"
  | "data"
  | "cloud"
  | "devops"
  | "mobile"
  | "practice"
  | "soft";

export interface SkillDef {
  canonical: string;
  category: SkillCategory;
  aliases: string[];
}

const S = (
  canonical: string,
  category: SkillCategory,
  aliases: string[] = [],
): SkillDef => ({ canonical, category, aliases });

export const SKILLS: SkillDef[] = [
  // languages
  S("JavaScript", "language", ["js", "ecmascript", "es6", "es2015"]),
  S("TypeScript", "language", ["ts"]),
  S("Python", "language", ["python3", "py"]),
  S("Java", "language", ["java8", "java11", "java17"]),
  S("Go", "language", ["golang"]),
  S("Rust", "language"),
  S("C++", "language", ["cpp", "c plus plus"]),
  S("C#", "language", ["csharp", "c sharp", ".net"]),
  S("Ruby", "language"),
  S("PHP", "language"),
  S("Kotlin", "language"),
  S("Swift", "language"),
  S("Scala", "language"),
  S("SQL", "language"),
  S("Bash", "language", ["shell scripting", "shell", "zsh"]),
  S("R", "language"),

  // frontend
  S("React", "frontend", ["reactjs", "react.js", "react js"]),
  S("Next.js", "frontend", ["nextjs", "next js"]),
  S("Vue", "frontend", ["vuejs", "vue.js", "vue3"]),
  S("Angular", "frontend", ["angularjs", "angular2"]),
  S("Svelte", "frontend", ["sveltekit"]),
  S("Redux", "frontend", ["redux toolkit", "rtk"]),
  S("Tailwind CSS", "frontend", ["tailwind", "tailwindcss"]),
  S("HTML", "frontend", ["html5"]),
  S("CSS", "frontend", ["css3", "scss", "sass", "less"]),
  S("Webpack", "frontend"),
  S("Vite", "frontend"),
  S("Accessibility", "frontend", ["a11y", "wcag", "aria"]),
  S("Responsive Design", "frontend", ["mobile-first", "responsive"]),

  // backend
  S("Node.js", "backend", ["nodejs", "node", "node js"]),
  S("Express", "backend", ["expressjs", "express.js"]),
  S("NestJS", "backend", ["nest.js", "nest"]),
  S("Django", "backend"),
  S("Flask", "backend"),
  S("FastAPI", "backend"),
  S("Spring Boot", "backend", ["spring", "springboot"]),
  S("Rails", "backend", ["ruby on rails", "ror"]),
  S("GraphQL", "backend", ["apollo", "gql"]),
  S("REST API", "backend", ["rest", "restful", "restful api", "rest apis"]),
  S("gRPC", "backend"),
  S("Microservices", "backend", ["microservice", "micro-services"]),
  S("WebSockets", "backend", ["websocket", "socket.io", "socketio"]),
  S("Prisma", "backend"),

  // data
  S("PostgreSQL", "data", ["postgres", "psql", "postgresql"]),
  S("MySQL", "data", ["mariadb"]),
  S("MongoDB", "data", ["mongo", "mongoose"]),
  S("Redis", "data"),
  S("Elasticsearch", "data", ["elastic search", "opensearch"]),
  S("Kafka", "data", ["apache kafka"]),
  S("Spark", "data", ["apache spark", "pyspark"]),
  S("Airflow", "data", ["apache airflow"]),
  S("dbt", "data"),
  S("Snowflake", "data"),
  S("Pandas", "data"),
  S("NumPy", "data", ["numpy"]),
  S("Machine Learning", "data", ["ml", "deep learning", "neural networks"]),
  S("PyTorch", "data", ["torch"]),
  S("TensorFlow", "data", ["tf", "keras"]),
  S("NLP", "data", ["natural language processing"]),
  S("LLM", "data", ["large language model", "llms", "genai", "generative ai"]),
  S("Data Visualization", "data", ["dataviz", "tableau", "power bi", "powerbi"]),
  S("ETL", "data", ["elt", "data pipeline", "data pipelines"]),

  // cloud
  S("AWS", "cloud", ["amazon web services", "ec2", "s3", "lambda"]),
  S("GCP", "cloud", ["google cloud", "google cloud platform", "bigquery"]),
  S("Azure", "cloud", ["microsoft azure"]),
  S("Vercel", "cloud"),
  S("Cloudflare", "cloud", ["cloudflare workers"]),
  S("Supabase", "cloud"),
  S("Firebase", "cloud"),

  // devops
  S("Docker", "devops", ["containerization", "containers"]),
  S("Kubernetes", "devops", ["k8s", "eks", "gke"]),
  S("Terraform", "devops", ["iac", "infrastructure as code"]),
  S("CI/CD", "devops", ["ci cd", "continuous integration", "continuous delivery"]),
  S("GitHub Actions", "devops", ["gh actions"]),
  S("Jenkins", "devops"),
  S("Linux", "devops", ["unix"]),
  S("Git", "devops", ["version control", "github", "gitlab"]),
  S("Observability", "devops", ["monitoring", "datadog", "grafana", "prometheus", "sentry"]),
  S("Nginx", "devops"),

  // mobile
  S("React Native", "mobile", ["react-native", "rn"]),
  S("Flutter", "mobile", ["dart"]),
  S("iOS", "mobile", ["swiftui", "uikit"]),
  S("Android", "mobile", ["jetpack compose"]),

  // engineering practice
  S("Testing", "practice", [
    "unit testing", "unit tests", "jest", "vitest", "pytest",
    "cypress", "playwright", "test automation", "tdd",
  ]),
  S("System Design", "practice", ["distributed systems", "scalability", "architecture"]),
  S("Agile", "practice", ["scrum", "kanban", "sprint"]),
  S("Code Review", "practice", ["peer review"]),
  S("Security", "practice", ["appsec", "owasp", "authentication", "authorization", "oauth"]),
  S("Performance Optimization", "practice", ["performance tuning", "profiling", "caching"]),

  // soft
  S("Communication", "soft", ["written communication", "verbal communication"]),
  S("Collaboration", "soft", ["cross-functional", "teamwork", "stakeholder management"]),
  S("Mentoring", "soft", ["coaching", "mentorship"]),
  S("Ownership", "soft", ["self-starter", "autonomy", "self starter"]),
  S("Problem Solving", "soft", ["analytical", "critical thinking"]),
];

/**
 * Lookup table: every surface form -> canonical label.
 * Longest-first so "react native" wins over "react" during matching.
 */
const surfaceForms: Array<{ form: string; canonical: string }> = SKILLS.flatMap(
  (skill) =>
    [skill.canonical, ...skill.aliases].map((form) => ({
      form: form.toLowerCase(),
      canonical: skill.canonical,
    })),
).sort((a, b) => b.form.length - a.form.length);

export const SKILL_BY_CANONICAL = new Map(SKILLS.map((s) => [s.canonical, s]));

/**
 * Escape regex metacharacters — "C++", "C#" and ".NET" all contain them and
 * would otherwise compile into garbage patterns.
 */
function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `\b` does not fire next to non-word characters, so "C++" at end of line
 * never matches with a plain \b...\b wrapper. Use lookarounds keyed on the
 * characters that may legitimately touch a skill token instead.
 */
function buildPattern(form: string): RegExp {
  return new RegExp(`(?<![a-z0-9])${escapeRe(form)}(?![a-z0-9])`, "i");
}

const compiled = surfaceForms.map(({ form, canonical }) => ({
  canonical,
  re: buildPattern(form),
}));

/** Extract the canonical skills mentioned anywhere in a block of text. */
export function extractSkills(text: string): string[] {
  if (!text) return [];
  const haystack = text.toLowerCase();
  const found = new Set<string>();
  for (const { canonical, re } of compiled) {
    if (re.test(haystack)) found.add(canonical);
  }
  return [...found];
}

/** Normalise a free-text skill the user typed into a canonical label. */
export function canonicalizeSkill(raw: string): string {
  const needle = raw.trim().toLowerCase();
  const hit = surfaceForms.find((s) => s.form === needle);
  return hit ? hit.canonical : raw.trim();
}
