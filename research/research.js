import { renderBody } from '../assets/preview.js?v=27';
import { renderNavbar } from "/components/navbar.js";
import { HalftoneBackground } from "../components/halftone.js";
import { fetchPostById } from "../components/mastodon.js?v=27";
import { renderPostList } from "../components/post-list.js";
import { ensurePdfJs, sanitizeUntrustedHtml } from "../components/content-dependencies.js";
import { initializePostInteractions } from "../components/post-interactions.js";
import { commentsPlaceholder, renderComments } from "../components/comments.js";
import { escapeHtml, safeHttpUrl } from "../components/safe-html.js";

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
    await renderPostList(contentArea, {
      tag: 'research',
      route: '/research/',
      title: '연구 기록',
      emptyText: '등록된 연구 기록이 없습니다.',
      showAll: false
    });
  }

  researchBg.scanTargets();
  setTimeout(() => researchBg.scanTargets(), 300);
}

async function renderPost(id, container) {
  try {
    const post = await fetchPostById(id);
    if (!post) throw new Error("연구 문서를 찾을 수 없습니다.");

    const titleEl = document.getElementById("page-title");
    if (titleEl) {
      titleEl.innerText = post.title;
    }

    const dateHtml = post.date ? `<span>${escapeHtml(post.date)}</span>` : "";
    const tags = post.tags || [];
    const tagHtml = tags.length > 0 
      ? tags.map(t => `<a href="/research/?tags=${encodeURIComponent(t)}" class="tag" style="text-decoration:none;">#${escapeHtml(t)}</a>`).join(" ")
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

    const bodyRoot = document.createElement('div');
    await renderBody(bodyRoot, post.source ?? post.markdown ?? '');
    let parsedHtml = '<div data-document-body></div>';

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

    if (imageAndVideoMedia.length > 0) {
      const mediaHtml = `
        <div class="post-media-gallery" style="display:grid; gap:1rem; margin:1.5rem 0;">
          ${imageAndVideoMedia.map(m => {
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
    container.querySelector("[data-document-body]").replaceWith(bodyRoot);
    const commentsRoot = container.querySelector("[data-comments-root]");
    if (commentsRoot) {
      void renderComments(id, post, commentsRoot)
        .then(() => window.researchBg?.scanTargets())
        .catch(error => console.error("Failed to render comments:", error));
    }

    container.querySelectorAll("img").forEach((image, index) => {
      image.decoding = "async";
      image.loading = index === 0 ? "eager" : "lazy";
      if (index === 0) image.fetchPriority = "high";
    });

    if (pdfMedia.length > 0) {
      for (const pdfItem of pdfMedia) {
        const pdfWrapper = document.createElement("div");
        pdfWrapper.className = "pdf-wrapper";
        pdfWrapper.style.margin = "2rem 0";
        pdfWrapper.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem; font-family:monospace; font-size:0.9rem;">
            <span>📄 첨부 PDF 문서</span>
            <a href="${escapeHtml(safeHttpUrl(pdfItem.url))}" target="_blank" download style="color:var(--nav-text); text-decoration:underline;">PDF 다운로드 ↗</a>
          </div>
        `;
        container.appendChild(pdfWrapper);
        void renderPdf(safeHttpUrl(pdfItem.url), pdfWrapper)
          .then(() => window.researchBg?.scanTargets())
          .catch(error => console.error("Failed to render PDF:", error));
      }
    }

    await initializePostInteractions(container, post, {
      route: '/research/',
      sectionTitle: '연구기록',
      sectionInitial: '연'
    });
  } catch (error) {
    container.innerHTML = `<p style="color:#fc5c65;">${escapeHtml(error.message)}</p>`;
  }
}

async function renderPdf(fileUrl, targetContainer) {
  if (!fileUrl) throw new Error('유효하지 않은 PDF 주소입니다.');
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
    pdfContainer.innerHTML = `<p><a href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener noreferrer">PDF 문서 보기 ↗</a></p>`;
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
