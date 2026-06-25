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
    
    let postMeta = {};
    const res = await fetch("../content/blog/list.json");
    if (res.ok) {
      const listData = await res.json();
      postMeta = listData.find(p => p.id === id) || {};
    }

    const tags = postMeta.tags || [];
    const tagHtml = tags.length > 0 ? `
        <div class="tag-list">
            ${tags.map(t => `<a href="/blog/?tags=${t}" class="tag" style="text-decoration:none;">${t}</a>`).join(" / ")}
        </div>
    ` : "";
    const tagContainer = document.getElementById("tag-container");
    if (tagContainer) tagContainer.innerHTML = tagHtml;
    
    let text = markdownText;

    // 옵시디언 전용 문법 처리 (Pre-processing)
    text = text.replace(/==([^=]+)==/g, "<mark>$1</mark>");
    text = text.replace(/([^\n])\s*\$\$/g, "$1\n\n$$$$");
    text = text.replace(/\$\$\s*([^\n])/g, "$$$$\n\n$1");
    
    container.innerHTML = marked.parse(text);

    // Breadcrumb TOC 로직
    const titleEl = document.getElementById("page-title");
    if (titleEl && postMeta.title) titleEl.innerText = postMeta.title;

    const headings = container.querySelectorAll("h1, h2, h3");
    headings.forEach((h, i) => {
      if (!h.id) h.id = "heading-" + i;
    });

    const breadcrumb = document.getElementById("nav-breadcrumb");
    if (breadcrumb) {
      breadcrumb.innerHTML = `
        <a href="/blog/">블로그</a> <span style="margin:0 0.3rem">/</span> 
        <a href="#" id="bc-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${postMeta.title || "문서"}</a> 
        <span id="bc-separator" style="display:none;margin:0 0.3rem">/</span> 
        <a href="#" id="bc-toc" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:none;"></a>
      `;

      const bcTitle = document.getElementById("bc-title");
      bcTitle.addEventListener("click", (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      const bcToc = document.getElementById("bc-toc");
      const bcSeparator = document.getElementById("bc-separator");

      if (headings.length > 0 && bcToc) {
        let activeHeading = headings[0];
        const updateToc = () => {
          bcToc.innerText = activeHeading.innerText;
          bcToc.href = "#" + activeHeading.id;
          bcToc.style.display = "inline";
          bcSeparator.style.display = "inline";
        };

        const observer = new IntersectionObserver((entries) => {
          let visibleEntries = entries.filter(e => e.isIntersecting);
          if (visibleEntries.length > 0) {
            visibleEntries.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
            activeHeading = visibleEntries[0].target;
            updateToc();
          }
        }, { rootMargin: "-80px 0px -80% 0px", threshold: 0 });

        headings.forEach(h => observer.observe(h));
        
        bcToc.addEventListener("click", (e) => {
          e.preventDefault();
          const targetY = activeHeading.getBoundingClientRect().top + window.scrollY - 100;
          window.scrollTo({ top: targetY, behavior: "smooth" });
        });
      }
    }
  } catch (error) {
    container.innerHTML = `<p style="color:#fc5c65;">${error.message}</p>`;
  }
}

async function renderPostList(container) {
  try {
    const breadcrumb = document.getElementById("nav-breadcrumb");
    if (breadcrumb) breadcrumb.innerHTML = ""; // 목록에서는 경로 숨김

    const response = await fetch("../content/blog/list.json");
    if (!response.ok) throw new Error("목록을 불러올 수 없습니다.");

    const listData = await response.json();

    const allTags = new Set();
    listData.forEach(p => {
      if (p.tags) p.tags.forEach(t => allTags.add(t));
    });
    const tagsArray = Array.from(allTags);

    const urlParams = new URLSearchParams(window.location.search);
    const activeTags = urlParams.get("tags") ? urlParams.get("tags").split(",") : [];

    const tagHtml = `
        <div class="tag-list">
            <span class="tag ${activeTags.length === 0 ? "active" : ""}" data-tag="">All</span> / 
            ${tagsArray.map(tag => `
              <span class="tag ${activeTags.includes(tag) ? "active" : ""}" data-tag="${tag}">${tag}</span>
            `).join(" / ")}
        </div>
    `;
    const tagContainer = document.getElementById("tag-container");
    if (tagContainer) {
      tagContainer.innerHTML = tagHtml;
      
      tagContainer.querySelectorAll(".tag").forEach(el => {
        el.addEventListener("click", (e) => {
          const clickedTag = e.target.getAttribute("data-tag");
          let newTags = [...activeTags];
          if (!clickedTag) {
            newTags = [];
          } else {
            if (newTags.includes(clickedTag)) {
              newTags = newTags.filter(t => t !== clickedTag);
            } else {
              newTags.push(clickedTag);
            }
          }
          
          const newUrl = new URL(window.location);
          if (newTags.length > 0) {
            newUrl.searchParams.set("tags", newTags.join(","));
          } else {
            newUrl.searchParams.delete("tags");
          }
          window.history.pushState({}, "", newUrl);
          renderPostList(container);
        });
      });
    }

    const filteredList = listData.filter(post => {
      if (activeTags.length === 0) return true;
      if (!post.tags) return false;
      // OR 검색
      return activeTags.some(t => post.tags.includes(t));
    });

    container.innerHTML = `
        <ul class="blog-list">
            ${filteredList
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
