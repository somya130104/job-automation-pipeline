export const THEMES = [
  { id: "midnight-amber", label: "Midnight Amber", swatch: "#f5a623" },
  { id: "blueprint", label: "Blueprint", swatch: "#56c8f5" },
  { id: "terminal", label: "Terminal", swatch: "#6ae882" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const THEME_STORAGE_KEY = "jap:theme";

/**
 * Applies the saved theme before first paint. Without this the page renders in
 * the default skin and then visibly snaps to the user's choice on hydration.
 * Inlined via dangerouslySetInnerHTML because it must run synchronously in
 * <head>, ahead of React.
 */
export function ThemeScript() {
  const js = `
(function(){
  try {
    var t = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var allowed = ${JSON.stringify(THEMES.map((t) => t.id))};
    if (t && allowed.indexOf(t) !== -1) {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {
    /* private mode / storage disabled — the default skin is fine */
  }
})();`.trim();

  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
