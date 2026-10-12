const IS_PERSONAL = window.location.pathname.startsWith('/log/');
const BLOG_ROUTE = IS_PERSONAL ? '/log/' : '/blog/';

import { renderNavbar } from "/components/navbar.js";
import { HalftoneBackground } from "../components/halftone.js";
import { fetchPostById } from "../components/mastodon.js";
import { renderPostList } from "../components/post-list.js";
import { ensureMarkdown, normalizeMarkdownMath } from "../components/content-dependencies.js";
import { initializePostInteractions } from "../components/post-interactions.js";
import { commentsPlaceholder, renderComments } from "../components/comments.js";
import { sanitizeUntrustedHtml } from "../components/content-dependencies.js";
import { escapeHtml, safeHttpUrl } from "../components/safe-html.js";

async function init() {
  renderNavbar();
  const blogBg = new HalftoneBackground("halftone-canvas", {
    iconSrc: null,
    boundarySelectors: [".navbar", "hr"],
    maxFps: 24
  });
  window.blogBg = blogBg;
  blogBg.init();

  const urlParams = new URLSearchParams(window.location.search);
  const postId = urlParams.get("id");
  const contentArea = document.getElementById("content");

  if (postId) {
    await renderPost(postId, contentArea);
  } else {
    await renderPostList(contentArea, {
      tag: IS_PERSONAL ? 'personal' : 'blog',
      route: BLOG_ROUTE,
      title: IS_PERSONAL ? '개인 기록' : '블로그',
      emptyText: '등록된 글이 없습니다.'
    });
  }

  blogBg.scanTargets();
  setTimeout(() => blogBg.scanTargets(), 300);
}

async function renderPost(id, container) {
  try {
    const post = await fetchPostById(id);
    if (!post) throw new Error("포스트를 찾을 수 없습니다.");

    // 1. 페이지 상단 제목 (순수 제목만 정돈)
    const titleEl = document.getElementById("page-title");
    if (titleEl) {
      titleEl.innerText = post.title;
    }

    // 2. 제목 바로 아래 메타 바 (날짜 • 태그 • 마스토돈로고 · 막시무스로고 maximux 뱃지)
    const dateHtml = post.date ? `<span>${escapeHtml(post.date)}</span>` : "";
    const tags = post.tags || [];
    const tagHtml = tags.length > 0 
      ? tags.map(t => `<a href="${BLOG_ROUTE}?tags=${encodeURIComponent(t)}" class="tag" style="text-decoration:none;">#${escapeHtml(t)}</a>`).join(" ")
      : "";

    const maximuxBadgeHtml = `
      <a href="${escapeHtml(safeHttpUrl(post.url))}" target="_blank" rel="noopener noreferrer" class="maximux-title-badge" title="Maximux (Mastodon Federation) 원본 글 보기 및 댓글 작성" style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; font-family: monospace; font-weight: normal; color: var(--text-color, #fff); background: rgba(103, 133, 233, 0.12); border: 1px solid rgba(103, 133, 233, 0.3); padding: 0.15rem 0.55rem; border-radius: 5px; text-decoration: none; vertical-align: middle; transition: all 0.2s;">
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

    // 미디어 첨부파일 렌더링 (사진/영상)
    if (post.media && post.media.length > 0) {
      const mediaHtml = `
        <div class="post-media-gallery" style="display:grid; gap:1rem; margin:1.5rem 0;">
          ${post.media.map(m => {
            if (m.type === 'image') {
              return `<img src="${escapeHtml(safeHttpUrl(m.url))}" alt="${escapeHtml(m.description || '')}" loading="lazy" decoding="async" style="max-width:100%; border-radius:8px; cursor:zoom-in;" />`;
            } else if (m.type === 'video' || m.type === 'gifv') {
              return `<video src="${escapeHtml(safeHttpUrl(m.url))}" controls preload="metadata" style="max-width:100%; border-radius:8px;"></video>`;
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

    container.innerHTML = await sanitizeUntrustedHtml(parsedHtml);
    const commentsRoot = container.querySelector("[data-comments-root]");
    if (commentsRoot) {
      void renderComments(id, post, commentsRoot)
        .then(() => window.blogBg?.scanTargets())
        .catch(error => console.error("Failed to render comments:", error));
    }

    // 첫 본문 이미지는 즉시 표시하고, 나머지는 스크롤 직전에만 디코딩한다.
    container.querySelectorAll("img").forEach((image, index) => {
      image.decoding = "async";
      image.loading = index === 0 ? "eager" : "lazy";
      if (index === 0) image.fetchPriority = "high";
    });

    // 테이블 반응형 래핑
    container.querySelectorAll('table').forEach(table => {
      const wrapper = document.createElement('div');
      wrapper.className = 'table-wrapper';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });

    await initializePostInteractions(container, post, {
      route: BLOG_ROUTE,
      sectionTitle: '블로그',
      sectionInitial: '블'
    });
  } catch (error) {
    container.innerHTML = `<p style="color:#fc5c65;">${escapeHtml(error.message)}</p>`;
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
