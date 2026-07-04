export function renderNavbar() {
  const navbarHTML = `
        <nav class="navbar">
          <a href="/" class="nav-logo">
            <img src="/assets/suwonjicon.svg" alt="SuwonJ" class="suwonj-nav-icon"/>
          </a>
          <div id="nav-breadcrumb" class="nav-breadcrumb"></div>
          <div class="nav-links">
              <a href="/profile/">소개</a>
              <a href="/blog/">블로그</a>
              <a href="/research/">연구/실험</a>
              <button id="theme-toggle" class="theme-toggle-btn" aria-label="Toggle theme">
                <span class="theme-text-dark" style="display:none;">DARK</span>
                <span class="theme-text-light" style="display:inline;">LIGHT</span>
              </button>
          </div>
        </nav>
    `;

  document.body.insertAdjacentHTML("afterbegin", navbarHTML);

  const toggleBtn = document.getElementById("theme-toggle");
  const darkText = toggleBtn.querySelector(".theme-text-dark");
  const lightText = toggleBtn.querySelector(".theme-text-light");

  function applyTheme(theme) {
    if (theme === "light") {
      document.body.classList.add("light-mode");
      document.documentElement.classList.add("light-mode");
      darkText.style.display = "inline";
      lightText.style.display = "none";
    } else {
      document.body.classList.remove("light-mode");
      document.documentElement.classList.remove("light-mode");
      darkText.style.display = "none";
      lightText.style.display = "inline";
    }
  }

  // 초기 테마 로드
  const savedTheme = localStorage.getItem("theme") || "dark";
  applyTheme(savedTheme);

  toggleBtn.addEventListener("click", () => {
    const isLight = document.body.classList.contains("light-mode");
    const newTheme = isLight ? "dark" : "light";
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  });
}
