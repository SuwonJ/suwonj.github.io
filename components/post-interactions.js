import { ensureCodeHighlighting } from './content-dependencies.js';
import { escapeHtml } from './safe-html.js';

// Reading pages share the same code highlighting, breadcrumb TOC and lightbox.
// The route-specific wrappers own the content and optional research PDF viewer.
export async function initializePostInteractions(container, post, {
  route,
  sectionTitle,
  sectionInitial
}) {
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
        <a href="${route}">
          <span class="desktop-text">${escapeHtml(sectionTitle)}</span>
          <span class="mobile-text">${escapeHtml(sectionInitial)}</span>
        </a> 
        <span style="margin:0 0.3rem">/</span> 
        <a href="#" id="bc-title">
          <span class="desktop-text">${escapeHtml(post.title || "문서")}</span>
          <span class="mobile-text">${escapeHtml((post.title || "문서").charAt(0))}</span>
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
            const activeA = [...floatingTocContainer.querySelectorAll('a[data-toc-id]')]
              .find(a => a.dataset.tocId === activeHeading.id);
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

}
