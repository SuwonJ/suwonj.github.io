import { renderNavbar } from "/components/navbar.js";
import { HalftoneBackground } from "../components/halftone.js";
import { fetchPostsByTag, fetchPostById } from "../components/mastodon.js";
import { ensureCodeHighlighting, ensureMarkdown, ensurePdfJs, normalizeMarkdownMath } from "../components/content-dependencies.js";
import { commentsPlaceholder, renderComments } from "../components/comments.js";

async function init() {
  renderNavbar();
  const researchBg = new HalftoneBackground("halftone-canvas", {
    iconSrc: null,
    boundarySelectors: [".navbar", "hr"],
    maxFps: 24
  });
  window.researchBg = researchBg;
  researchBg.init();

  const urlParams = new URLSearchParams(window.location.search);
  const postId = urlParams.get("id");
  const contentArea = document.getElementById("content");

  if (postId) {
    await renderPost(postId, contentArea);
  } else {
    await renderPostList(contentArea);
  }

  researchBg.scanTargets();
  setTimeout(() => researchBg.scanTargets(), 300);
}

async function renderPost(id, container) {
  try {
    const post = await fetchPostById(id);
    if (!post) throw new Error("연구 문서를 찾을 수 없습니다.");

    // 1. 페이지 상단 제목 (순수 제목만 정돈)
    const titleEl = document.getElementById("page-title");
    if (titleEl) {
      titleEl.innerText = post.title;
    }

    // 2. 제목 바로 아래 메타 바 (날짜 • 태그 • 마스토돈로고 · 막시무스로고 maximux 뱃지)
    const dateHtml = post.date ? `<span>${post.date}</span>` : "";
    const tags = post.tags || [];
    const tagHtml = tags.length > 0 
      ? tags.map(t => `<a href="/research/?tags=${t}" class="tag" style="text-decoration:none;">#${t}</a>`).join(" ")
      : "";

    const maximuxBadgeHtml = `
      <a href="${post.url}" target="_blank" rel="noopener noreferrer" class="maximux-title-badge" title="Maximux (Mastodon Federation) 원본 글 보기 및 댓글 작성" style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; font-family: monospace; font-weight: normal; color: var(--text-color, #fff); background: rgba(103, 133, 233, 0.12); border: 1px solid rgba(103, 133, 233, 0.3); padding: 0.15rem 0.55rem; border-radius: 5px; text-decoration: none; vertical-align: middle; transition: all 0.2s;">
        <img src="/assets/mastodon_logo.svg" alt="Mastodon" style="width:13px; height:13px; vertical-align:middle;" />
        <span style="opacity:0.5;">•</span>
        <img src="/assets/maximux_logo.svg" alt="Maximux" style="width:13px; height:13px; vertical-align:middle;" />
        <span>maximux</span>
      </a>
    `;

    const metaBarHtml = `
      <div class="post-meta-bar" style="display:flex; align-items:center; flex-wrap:wrap; gap:0.6rem; margin-top:0.6rem; margin-bottom:1.8rem; font-family:monospace; font-size:0.85rem; color:var(--breadcrumb-color, #888);">
        ${dateHtml}
        ${dateHtml && (tagHtml || maximuxBadgeHtml) ? `<span>•</span>` : ""}
        ${tagHtml}
        ${tagHtml && maximuxBadgeHtml ? `<span>•</span>` : ""}
        ${maximuxBadgeHtml}
      </div>
    `;

    const tagContainer = document.getElementById("tag-container");
    if (tagContainer) tagContainer.innerHTML = metaBarHtml;

    // 마크다운 파싱 및 렌더링
    let markdownText = normalizeMarkdownMath(post.markdown || "");

    await ensureMarkdown(markdownText);
    let parsedHtml = window.marked.parse(markdownText);

    // 미디어 첨부파일 파싱 (이미지, 비디오, PDF)
    const imageAndVideoMedia = [];
    const pdfMedia = [];

    if (post.media && post.media.length > 0) {
      post.media.forEach(m => {
        if (m.url && m.url.toLowerCase().includes('.pdf')) {
          pdfMedia.push(m);
        } else {
          imageAndVideoMedia.push(m);
        }
      });
    }

    // 일반 사진/동영상 미디어 갤러리
    if (imageAndVideoMedia.length > 0) {
      const mediaHtml = `
        <div class="post-media-gallery" style="display:grid; gap:1rem; margin:1.5rem 0;">
          ${imageAndVideoMedia.map(m => {
            if (m.type === 'image') {
              return `<img src="${m.url}" alt="${m.description || ''}" loading="lazy" decoding="async" style="max-width:100%; border-radius:8px; cursor:zoom-in;" />`;
            } else if (m.type === 'video' || m.type === 'gifv') {
              return `<video src="${m.url}" controls preload="metadata" style="max-width:100%; border-radius:8px;"></video>`;
            }
            return '';
          }).join('')}
        </div>
      `;
      parsedHtml += mediaHtml;
    }

    parsedHtml += commentsPlaceholder();

    if (post.isDraft) {
      const draftNoticeHtml = `
        <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); color: #fbbf24; padding: 0.65rem 1rem; border-radius: 6px; margin-bottom: 1.5rem; font-family: monospace; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem;">
          <span>⚠️</span>
          <span><strong>임시 발행(Draft) 문서:</strong> 마스토돈에만 게시되어 있으며, 사이트 공개 목록에는 노출되지 않습니다.</span>
        </div>
      `;
      parsedHtml = draftNoticeHtml + parsedHtml;
    }

    container.innerHTML = parsedHtml;
    const commentsRoot = container.querySelector("[data-comments-root]");
    if (commentsRoot) {
      void renderComments(id, post, commentsRoot)
        .then(() => window.researchBg?.scanTargets())
        .catch(error => console.error("Failed to render comments:", error));
    }

    // 첫 본문 이미지는 즉시 표시하고, 나머지는 스크롤 직전에만 디코딩한다.
    container.querySelectorAll("img").forEach((image, index) => {
      image.decoding = "async";
      image.loading = index === 0 ? "eager" : "lazy";
      if (index === 0) image.fetchPriority = "high";
    });

    // PDF 첨부파일이 존재하는 경우 PDF.js로 전면 렌더링
    if (pdfMedia.length > 0) {
      for (const pdfItem of pdfMedia) {
        const pdfWrapper = document.createElement("div");
        pdfWrapper.className = "pdf-wrapper";
        pdfWrapper.style.margin = "2rem 0";
        pdfWrapper.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem; font-family:monospace; font-size:0.9rem;">
            <span>📄 첨부 PDF 문서</span>
            <a href="${pdfItem.url}" target="_blank" download style="color:var(--nav-text); text-decoration:underline;">PDF 다운로드 ↗</a>
          </div>
        `;
        container.appendChild(pdfWrapper);
        void renderPdf(pdfItem.url, pdfWrapper)
          .then(() => window.researchBg?.scanTargets())
          .catch(error => console.error("Failed to render PDF:", error));
      }
    }

    // 테이블 반응형 래핑
    container.querySelectorAll('table').forEach(table => {
      const wrapper = document.createElement('div');
      wrapper.className = 'table-wrapper';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });

    // 코드가 있는 문서에서만 Highlight.js와 코드 폰트 로드
    const codeBlocks = Array.from(container.querySelectorAll('pre code'));
    if (codeBlocks.length > 0) await ensureCodeHighlighting();
    codeBlocks.forEach((block) => {
      const pre = block.parentElement;
      const langMatch = block.className.match(/language-(\w+)/);
      if (langMatch && langMatch[1]) {
        pre.setAttribute('data-lang', langMatch[1].toUpperCase());
      }
      if (window.hljs) window.hljs.highlightElement(block);
    });

    container.querySelectorAll('pre').forEach(pre => {
      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.className = 'code-copy-btn';
      copyButton.textContent = 'COPY';
      copyButton.setAttribute('aria-label', '코드 복사');
      pre.appendChild(copyButton);

      copyButton.addEventListener('click', async () => {
        const codeText = pre.querySelector('code')?.innerText || pre.innerText;
        try {
          await navigator.clipboard.writeText(codeText);
          const originalLang = pre.getAttribute('data-lang') || '';
          pre.setAttribute('data-lang', 'COPIED!');
          pre.classList.add('copied');
          copyButton.textContent = 'COPIED';
          setTimeout(() => {
            pre.setAttribute('data-lang', originalLang);
            pre.classList.remove('copied');
            copyButton.textContent = 'COPY';
          }, 1500);
        } catch (err) {
          console.error('Failed to copy', err);
        }
      });
    });

    // Breadcrumb TOC 로직
    const headings = container.querySelectorAll("h1, h2, h3");
    headings.forEach((h, i) => {
      if (!h.id) h.id = "heading-" + i;
    });

    const breadcrumb = document.getElementById("nav-breadcrumb");
    if (breadcrumb) {
      let breadcrumbHtml = `
        <a href="/research/">
          <span class="desktop-text">연구기록</span>
          <span class="mobile-text">연</span>
        </a> 
        <span style="margin:0 0.3rem">/</span> 
        <a href="#" id="bc-title">
          <span class="desktop-text">${post.title || "문서"}</span>
          <span class="mobile-text">${(post.title || "문서").charAt(0)}</span>
        </a> 
        <span id="bc-toc-container"></span>
      `;

      breadcrumb.innerHTML = breadcrumbHtml;

      const bcTitle = document.getElementById("bc-title");
      if (bcTitle) {
        bcTitle.addEventListener("click", (e) => {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }

      const bcTocContainer = document.getElementById("bc-toc-container");
      const floatingTocContainer = document.getElementById("floating-toc");

      if (headings.length > 0) {
        let activeHeading = headings[0];
        if (floatingTocContainer) {
          floatingTocContainer.innerHTML = '';
          const rootUl = document.createElement("ul");
          headings.forEach(heading => {
            const li = document.createElement("li");
            const a = document.createElement("a");
            a.href = "#" + heading.id;
            a.innerText = heading.innerText;
            a.setAttribute("data-toc-id", heading.id);
            li.appendChild(a);
            rootUl.appendChild(li);
          });
          floatingTocContainer.appendChild(rootUl);
        }

        const updateToc = () => {
          if (floatingTocContainer) {
            floatingTocContainer.querySelectorAll('a').forEach(a => a.classList.remove('active'));
            const activeA = floatingTocContainer.querySelector(`a[data-toc-id="${activeHeading.id}"]`);
            if (activeA) activeA.classList.add('active');
          }
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
      }
    }

    // Image Lightbox
    let lightbox = document.getElementById("lightbox");
    if (!lightbox) {
      lightbox = document.createElement("div");
      lightbox.id = "lightbox";
      const img = document.createElement("img");
      lightbox.appendChild(img);
      document.body.appendChild(lightbox);
      lightbox.addEventListener("click", () => lightbox.classList.remove("active"));
    }
    container.addEventListener("click", event => {
      const image = event.target.closest("img");
      if (!image || !container.contains(image)) return;
      const lightboxImg = lightbox.querySelector("img");
      lightboxImg.src = image.currentSrc || image.src;
      lightbox.classList.add("active");
    });

  } catch (error) {
    container.innerHTML = `<p style="color:#fc5c65;">${error.message}</p>`;
  }
}

async function renderPdf(fileUrl, targetContainer) {
  const pdfContainer = document.createElement('div');
  pdfContainer.className = 'pdf-container';
  targetContainer.appendChild(pdfContainer);

  try {
    const pdfjsLib = await ensurePdfJs();
    const loadingTask = pdfjsLib.getDocument(fileUrl);
    const pdf = await loadingTask.promise;
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      pdfContainer.appendChild(canvas);
      await page.render({ canvasContext: context, viewport }).promise;
    }
  } catch (e) {
    pdfContainer.innerHTML = `<p><a href="${fileUrl}" target="_blank">PDF 문서 보기 ↗</a></p>`;
  }
}

async function renderPostList(container) {
  try {
    const breadcrumb = document.getElementById("nav-breadcrumb");
    if (breadcrumb) breadcrumb.innerHTML = "";

    const titleEl = document.getElementById("page-title");
    if (titleEl) titleEl.innerText = "연구 기록";

    const allPosts = await fetchPostsByTag("research");
    const posts = allPosts.filter(p => !p.isDraft);

    if (posts.length === 0) {
      container.innerHTML = `
        <div style="padding: 3rem 0; text-align: center; font-family: monospace; color: var(--breadcrumb-color, #888);">
          <p style="font-size: 1.1rem;">등록된 연구 기록이 없습니다.</p>
        </div>
      `;
      return;
    }

    const allTags = new Set();
    posts.forEach(p => p.tags.forEach(t => allTags.add(t)));
    const tagsArray = Array.from(allTags);

    const urlParams = new URLSearchParams(window.location.search);
    const activeTags = urlParams.get("tags") ? urlParams.get("tags").split(",") : [];

    const tagHtml = `
        <div class="tag-list">
            ${tagsArray.map(tag => `
              <span class="tag ${activeTags.includes(tag) ? "active" : ""}" data-tag="${tag}">#${tag}</span>
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

    const filteredPosts = posts.filter(post => {
      if (activeTags.length === 0) return true;
      return activeTags.some(t => post.tags.includes(t));
    });

    const listItems = filteredPosts.map(post => `
      <li style="margin-bottom: 1.2rem; list-style: none;">
        <div style="display:flex; justify-content:space-between; align-items:baseline; gap:1rem;">
          <a href="/research/?id=${post.id}" style="color:var(--text-color); text-decoration:none; font-weight:bold; font-size:1.1rem;" class="blog-post-link">
            ${post.title}
          </a>
          <span style="font-size:0.85rem; color:var(--breadcrumb-color, #888); font-family:monospace; white-space:nowrap;">
            (${post.date})
          </span>
        </div>
      </li>
    `).join("");

    container.innerHTML = `
      <ul style="padding-left: 0; margin-top: 1.5rem;">
        ${listItems}
      </ul>
    `;

  } catch (error) {
    container.innerHTML = `<p style="color:#fc5c65;">${error.message}</p>`;
  }
}

const updateScrollMask = () => {
  const scrollY = window.scrollY;
  const mainEl = document.querySelector("main");
  if (mainEl) {
    mainEl.style.setProperty("--scroll-y", `${scrollY}px`);
    const fadeEnd = Math.min(180, 80 + scrollY);
    mainEl.style.setProperty("--mask-fade-end", `${fadeEnd}px`);
  }
};
window.addEventListener("scroll", updateScrollMask, { passive: true });
updateScrollMask();

init();
