export function renderNavbar() {
  if (!document.getElementById("material-symbols-link")) {
    const iconLink = document.createElement("link");
    iconLink.id = "material-symbols-link";
    iconLink.rel = "stylesheet";
    iconLink.href =
      "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=dark_mode,light_mode";
    document.head.appendChild(iconLink);
  }

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
                <span class="material-symbols-outlined theme-icon-dark" style="display:none;">dark_mode</span>
                <span class="material-symbols-outlined theme-icon-light" style="display:none;">light_mode</span>
              </button>
          </div>
        </nav>
    `;

  document.body.insertAdjacentHTML("afterbegin", navbarHTML);

  const toggleBtn = document.getElementById("theme-toggle");
  const darkIcon = toggleBtn.querySelector(".theme-icon-dark");
  const lightIcon = toggleBtn.querySelector(".theme-icon-light");

  function applyTheme(theme) {
    if (theme === "light") {
      document.body.classList.add("light-mode");
      document.documentElement.classList.add("light-mode");
      darkIcon.style.display = "none";
      lightIcon.style.display = "inline-block";
    } else {
      document.body.classList.remove("light-mode");
      document.documentElement.classList.remove("light-mode");
      darkIcon.style.display = "inline-block";
      lightIcon.style.display = "none";
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
