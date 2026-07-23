export function initTheme(): void {
  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;

  const saved = localStorage.getItem("theme");
  if (saved === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    toggle.textContent = "\u2600\uFE0F";
  }

  toggle.addEventListener("click", () => {
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) {
      document.documentElement.removeAttribute("data-theme");
      toggle.textContent = "\uD83C\uDF19";
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      toggle.textContent = "\u2600\uFE0F";
      localStorage.setItem("theme", "dark");
    }
  });
}
