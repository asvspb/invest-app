export function initTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".tab-btn");
  const panels = document.querySelectorAll<HTMLElement>(".tab-panel");

  if (!tabs.length || !panels.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      if (!target) return;

      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));

      tab.classList.add("active");

      const panel = document.querySelector<HTMLElement>(
        `.tab-panel[data-tab="${target}"]`,
      );
      if (panel) panel.classList.add("active");
    });
  });
}
