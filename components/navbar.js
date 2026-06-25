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
          </div>
        </nav>
    `;

  document.body.insertAdjacentHTML("afterbegin", navbarHTML);
}
