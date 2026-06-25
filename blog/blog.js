import { renderNavbar } from "/components/navbar.js";
import { HalftoneBackground } from "../components/halftone.js";

async function init() {
  if (typeof window.markedKatex === "function") {
    marked.use(window.markedKatex({ throwOnError: false, nonStandard: true }));
  }

  renderNavbar();
  const blogBg = new HalftoneBackground("halftone-canvas", {
    iconSrc: null,
    boundarySelectors: [".navbar", "hr"],
  });
  blogBg.init();

  const urlParams = new URLSearchParams(window.location.search);
  const postId = urlParams.get("id");
  const contentArea = document.getElementById("content");

  if (postId) {
    try {
      const res = await fetch("../content/blog/list.json");
      if (res.ok) {
        const listData = await res.json();
        const postMeta = listData.find((p) => p.id === postId);
        if (postMeta) {
          const titleEl = document.getElementById("page-title");
          if (titleEl) titleEl.innerText = postMeta.title;
        }
      }
    } catch (e) {}
    // 본문 렌더
    await renderPost(postId, contentArea);
  } else {
    // 목록 보이기
    await renderPostList(contentArea);
  }

  // 본문 또는 목록 렌더링 후 변경된 위치 재스캔
  blogBg.scanTargets();
  setTimeout(() => blogBg.scanTargets(), 300); // 폰트/이미지 등 비동기 렌더링 대비
}

async function renderPost(id, container) {
  try {
    const response = await fetch(`../content/blog/${id}.md`);
    if (!response.ok) throw new Error("문서를 찾을 수 없습니다.");

    const markdownText = await response.text();
    const tagHtml = `
        <div class="tag-list">
            <span class="tag">Tech</span> / 
            <span class="tag">Math</span>
        </div>
    `;
    const tagContainer = document.getElementById("tag-container");
    if (tagContainer) tagContainer.innerHTML = tagHtml;
    let text = markdownText;

    // 옵시디언 전용 문법 처리 (Pre-processing)
    // 1. 형광펜 문법 (==내용==) -> <mark> 태그로 변환
    text = text.replace(/==([^=]+)==/g, "<mark>$1</mark>");
    
    // 2. 수식 블록 줄바꿈 강제 (marked-katex-extension 호환용)
    // 텍스트와 $$가 같은 줄에 있으면 확장 기능이 인식하지 못하므로, $$ 앞뒤로 줄바꿈을 삽입합니다.
    text = text.replace(/([^\n])\s*\$\$/g, "$1\n$$$$"); // $$ 앞에 글자가 있으면 줄바꿈 추가
    text = text.replace(/\$\$\s*([^\n])/g, "$$$$\n$1"); // $$ 뒤에 글자가 있으면 줄바꿈 추가
    
    container.innerHTML = marked.parse(text);
  } catch (error) {
    container.innerHTML = `<p style="color:#fc5c65;">${error.message}</p>`;
  }
}

async function renderPostList(container) {
  try {
    const response = await fetch("../content/blog/list.json");
    if (!response.ok) throw new Error("목록을 불러올 수 없습니다.");

    const listData = await response.json();

    const tagHtml = `
        <div class="tag-list">
            <span class="tag active">All</span> / 
            <span class="tag">Tech</span> / 
            <span class="tag">Math</span> / 
            <span class="tag">Life</span>
        </div>
    `;
    const tagContainer = document.getElementById("tag-container");
    if (tagContainer) tagContainer.innerHTML = tagHtml;

    container.innerHTML = `
        <ul class="blog-list">
            ${listData
              .map(
                (post) => `
                <li>
                    <a href="/blog/?id=${post.id}">${post.title}</a>
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
window.addEventListener("scroll", () => {
  const mainEl = document.querySelector("main");
  if (mainEl) mainEl.style.setProperty("--scroll-y", `${window.scrollY}px`);
});
init();
