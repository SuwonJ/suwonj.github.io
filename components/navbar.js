// The public pages include the shared header in their initial HTML.
export function renderNavbar() {
  // Older standalone pages still request their header at runtime.
  if (!document.querySelector(".navbar")) {
    document.body.insertAdjacentHTML("afterbegin", `<nav class="navbar">
            <a href="/" class="nav-logo"><img src="/assets/suwonjicon.svg" alt="SuwonJ" class="suwonj-nav-icon" width="35" height="30" /></a>
            <div id="nav-breadcrumb" class="nav-breadcrumb"></div>
            <div class="nav-links">
                <a href="/profile/">소개</a><a href="/blog/">블로그</a><a href="/research/">연구/실험</a>
                <button id="theme-toggle" type="button" class="theme-toggle-btn" aria-label="라이트 모드로 전환">
                    <svg class="theme-icon-dark" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" /></svg>
                    <svg class="theme-icon-light" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>
                </button>
            </div>
        </nav>`);
  }
  const toggleBtn = document.getElementById("theme-toggle");
  if (!toggleBtn || toggleBtn.dataset.bound) return;
  toggleBtn.dataset.bound = "true";

  function applyTheme(theme) {
    const light = theme === "light";
    document.documentElement.classList.toggle("light-mode", light);
    document.body.classList.toggle("light-mode", light);
    toggleBtn.setAttribute("aria-label", light ? "다크 모드로 전환" : "라이트 모드로 전환");
  }

  applyTheme(document.documentElement.classList.contains("light-mode") ? "light" : "dark");
  toggleBtn.addEventListener("click", () => {
    const theme = document.documentElement.classList.contains("light-mode") ? "dark" : "light";
    try { localStorage.setItem("theme", theme); } catch {}
    applyTheme(theme);
  });
}

renderNavbar();
