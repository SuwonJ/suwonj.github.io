import { renderNavbar } from "/components/navbar.js";
import { HalftoneBackground } from "../components/halftone.js";

async function init() {
  renderNavbar();
  const researchBg = new HalftoneBackground("halftone-canvas", {
    iconSrc: null,
  });
  researchBg.init();

  const urlParams = new URLSearchParams(window.location.search);
  const postId = urlParams.get("id");
  const contentArea = document.getElementById("content");

  if (postId) {
    // 본문 렌더
    await renderPost(postId, contentArea);
  } else {
    // 목록 보이기
    await renderPostList(contentArea);
  }
}

async function renderPost(id, container) {
  try {
    const response = await fetch(`../content/research/${id}.md`);
    if (!response.ok) throw new Error("문서를 찾을 수 없습니다.");

    const markdownText = await response.text();
    container.innerHTML = marked.parse(markdownText);

    // 테이블 반응형 래핑
    container.querySelectorAll('table').forEach(table => {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrapper';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
    });

    if (typeof renderMathInElement === "function") {
      renderMathInElement(container, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
      });
    }
  } catch (error) {
    container.innerHTML = `<p style="color:#fc5c65;">${error.message}</p>`;
  }
}

async function renderPostList(container) {
  try {
    const response = await fetch("../content/research/list.json");
    if (!response.ok) throw new Error("목록을 불러올 수 없습니다.");

    const listData = await response.json();

    container.innerHTML = `
        <ul class="research-list">
            ${listData
              .map(
                (post) => `
                <li>
                    <a href="/research/?id=${post.id}">${post.title}</a>
                    <span class="post-date">(${post.date})</span>
                </li>
            `,
              )
              .join("")}
        </ul>
    `;
  } catch (error) {
    container.innerHTML = `<p style="color:#fc5c65;">${error.message}</p>`;
  }
}
init();

const updateScrollMask = () => {
  const scrollY = window.scrollY;
  const mainEl = document.querySelector("main");
  if (mainEl) {
    mainEl.style.setProperty("--scroll-y", `${scrollY}px`);
    // 스크롤이 0일 때는 모바일/데스크탑 모두 대제목이 온전히 선명하게 나오도록 페이드 끝점을 80px로 가깝게 하고,
    // 스크롤함에 따라 180px로 점진적으로 늘어남 (페이드 시작점이 80px이므로 스크롤 시 부드럽게 페이드 아웃)
    const fadeEnd = Math.min(180, 80 + scrollY);
    mainEl.style.setProperty("--mask-fade-end", `${fadeEnd}px`);
  }
};
window.addEventListener("scroll", updateScrollMask);
updateScrollMask();
