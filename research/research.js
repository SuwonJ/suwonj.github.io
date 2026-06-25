import { renderNavbar } from "/components/navbar.js";
import { HalftoneBackground } from "../components/halftone.js";

async function init() {
  if (typeof window.markedKatex === "function") {
    marked.use(window.markedKatex({ throwOnError: false, nonStandard: true }));
  }

  renderNavbar();
  const researchBg = new HalftoneBackground("halftone-canvas", {
    iconSrc: null,
    boundarySelectors: [".navbar", "hr"],
    buttonSelectors: ["#content pre"]
  });
  window.researchBg = researchBg; // 전역 스코프 등록
  researchBg.init();

  const urlParams = new URLSearchParams(window.location.search);
  const postId = urlParams.get("id");
  const contentArea = document.getElementById("content");

  if (postId) {
    try {
      const res = await fetch("../content/research/list.json");
      if (res.ok) {
        const listData = await res.json();
        const postMeta = listData.find((p) => p.id === postId);
        if (postMeta) {
          const titleEl = document.getElementById("page-title");
          if (titleEl) {
            if (postMeta.date) {
              titleEl.innerHTML = `${postMeta.title} <span class="post-title-date" style="font-size: 1.1rem; color: #888; margin-left: 1rem; font-weight: normal; font-family: monospace;">(${postMeta.date})</span>`;
            } else {
              titleEl.innerText = postMeta.title;
            }
          }
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
  researchBg.scanTargets();
  setTimeout(() => researchBg.scanTargets(), 300); // 폰트/이미지 등 비동기 렌더링 대비
}

async function renderPost(id, container) {
  try {
    let postMeta = {};
    const res = await fetch("../content/research/list.json");
    if (res.ok) {
      const listData = await res.json();
      postMeta = listData.find(p => p.id === id) || {};
    }

    const breadcrumb = document.getElementById("nav-breadcrumb");
    if (breadcrumb) {
      let breadcrumbHtml = `
        <a href="/research/">
          <span class="desktop-text">연구기록</span>
          <span class="mobile-text">연</span>
        </a> 
      `;

      if (postMeta && postMeta.id) {
          const parts = postMeta.id.split('/');
          let accumulatedPath = "";
          for (let i = 0; i < parts.length - 1; i++) {
              accumulatedPath = accumulatedPath ? accumulatedPath + "/" + parts[i] : parts[i];
              breadcrumbHtml += `
                  <span class="desktop-text" style="margin:0 0.3rem">/</span>
                  <a href="/research/?path=${encodeURIComponent(accumulatedPath)}" class="desktop-text bc-path-link" style="color:#aaa; text-decoration:none;">${parts[i]}</a>
              `;
          }
      }

      breadcrumbHtml += `
        <span style="margin:0 0.3rem">/</span> 
        <a href="#" id="bc-title">
          <span class="desktop-text">${postMeta.title || "문서"}</span>
          <span class="mobile-text">${(postMeta.title || "문서").charAt(0)}</span>
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
    }

    const tagContainer = document.getElementById("tag-container");
    const tabs = postMeta.tabs;

    if (tabs && tabs.length > 0) {
      // 탭 네비게이션 생성
      const tabHtml = `
          <div class="tab-list">
              ${tabs.map((t, idx) => `<button class="tab-btn ${idx === 0 ? 'active' : ''}" data-idx="${idx}">${t.label}</button>`).join("")}
          </div>
      `;
      if (tagContainer) tagContainer.innerHTML = tabHtml;

      // 탭 전환 이벤트 리스너
      if (tagContainer) {
          tagContainer.querySelectorAll('.tab-btn').forEach(btn => {
              btn.addEventListener('click', async (e) => {
                  tagContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                  e.target.classList.add('active');
                  const idx = parseInt(e.target.getAttribute('data-idx'));
                  await loadTabContent(tabs[idx], container, postMeta);
                  if (window.researchBg) window.researchBg.scanTargets();
              });
          });
      }
      
      // 첫 번째 탭 로드
      await loadTabContent(tabs[0], container, postMeta);

    } else {
      // 하위 호환성: tabs가 없는 경우 기본 {id}.md 로드
      if (tagContainer) tagContainer.innerHTML = '';
      const response = await fetch(`../content/research/${id}.md`);
      if (!response.ok) throw new Error("문서를 찾을 수 없습니다.");
      const markdownText = await response.text();
      await renderMarkdownTab(markdownText, container, postMeta);
    }

  } catch (error) {
    container.innerHTML = `<p style="color:#fc5c65;">${error.message}</p>`;
  }
}

async function loadTabContent(tabInfo, container, postMeta) {
    const bcTocContainer = document.getElementById("bc-toc-container");
    if (bcTocContainer) bcTocContainer.innerHTML = "";

    container.innerHTML = '<p>로딩 중...</p>';
    try {
        if (tabInfo.type === 'markdown') {
            const response = await fetch(`../content/research/${tabInfo.file}`);
            if (!response.ok) throw new Error(`${tabInfo.file} 문서를 찾을 수 없습니다.`);
            const markdownText = await response.text();
            await renderMarkdownTab(markdownText, container, postMeta);
        } else if (tabInfo.type === 'pdf') {
            await renderPdfTab(`../content/research/${tabInfo.file}`, container);
        } else {
            container.innerHTML = `<p>지원하지 않는 탭 타입입니다: ${tabInfo.type}</p>`;
        }
    } catch (err) {
        container.innerHTML = `<p style="color:#fc5c65;">${err.message}</p>`;
    }
}

async function renderPdfTab(fileUrl, container) {
    container.innerHTML = '<p>PDF 로딩 중...</p>';
    try {
        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        
        container.innerHTML = '';
        const pdfContainer = document.createElement('div');
        pdfContainer.className = 'pdf-container';
        container.appendChild(pdfContainer);

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            // 캔버스 크기를 위해 viewport 가져오기 (scale은 화질을 위해 2배)
            const viewport = page.getViewport({scale: 2.0});
            
            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-page-canvas';
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // 화면에 꽉 차게 보이도록 설정, 최대 너비는 100%
            canvas.style.width = "100%";
            canvas.style.height = "auto";
            
            pdfContainer.appendChild(canvas);
            
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            await page.render(renderContext).promise;
        }
    } catch (e) {
        container.innerHTML = `<p style="color:#fc5c65;">PDF 로딩 실패: ${e.message}</p>`;
    }
}

async function renderMarkdownTab(markdownText, container, postMeta) {
    let text = markdownText;

    // 옵시디언 전용 문법 처리 (Pre-processing)
    text = text.replace(/==([^=]+)==/g, "<mark>$1</mark>");
    text = text.replace(/([^\n])\s*\$\$/g, "$1\n\n$$$$");
    text = text.replace(/\$\$\s*([^\n])/g, "$$$$\n\n$1");
    
    container.innerHTML = marked.parse(text);

    // 테이블 반응형 래핑
    container.querySelectorAll('table').forEach(table => {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrapper';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
    });

    // Highlight.js 적용, 언어 태그 추가 및 복사/펄스 기능 연결
    container.querySelectorAll('pre code').forEach((block) => {
        const pre = block.parentElement;
        const langMatch = block.className.match(/language-(\w+)/);
        if (langMatch && langMatch[1]) {
            pre.setAttribute('data-lang', langMatch[1].toUpperCase());
        }
        if (typeof hljs !== 'undefined') hljs.highlightElement(block);
    });
    
    container.querySelectorAll('pre').forEach(pre => {
        pre.addEventListener('click', async () => {
            const selection = window.getSelection().toString();
            if (selection && selection.length > 0) return; // 드래그 선택 중이면 복사 방지
            
            const codeText = pre.querySelector('code').innerText;
            try {
                await navigator.clipboard.writeText(codeText);
                if (window.researchBg) window.researchBg.pulseButton(pre);
                
                // 복사 피드백 애니메이션
                const originalLang = pre.getAttribute('data-lang') || '';
                pre.setAttribute('data-lang', 'COPIED!');
                pre.classList.add('copied');
                setTimeout(() => {
                    pre.setAttribute('data-lang', originalLang);
                    pre.classList.remove('copied');
                }, 1500);
            } catch (err) {
                console.error('Failed to copy', err);
            }
        });
    });

    // Breadcrumb TOC 로직 (TOC 사이드바)
    const headings = container.querySelectorAll("h1, h2, h3");
    headings.forEach((h, i) => {
      if (!h.id) h.id = "heading-" + i;
    });

    if (headings.length > 0) {
      let activeHeading = headings[0];
      
      const floatingTocContainer = document.getElementById("floating-toc");
      if (floatingTocContainer) {
          floatingTocContainer.style.display = 'block';
          floatingTocContainer.innerHTML = '';
          const rootUl = document.createElement("ul");
          const stack = [{ level: 0, element: rootUl }];
          
          headings.forEach(heading => {
              const level = parseInt(heading.tagName.substring(1));
              
              while (stack.length > 1 && stack[stack.length - 1].level >= level) {
                  stack.pop();
              }
              
              const parent = stack[stack.length - 1];
              const li = document.createElement("li");
              const a = document.createElement("a");
              a.href = "#" + heading.id;
              a.innerText = heading.innerText;
              a.setAttribute("data-toc-id", heading.id);
              li.appendChild(a);
              
              if (level > parent.level) {
                  if (parent.level === 0) {
                      parent.element.appendChild(li);
                      stack.push({ level, element: parent.element });
                  } else {
                      const newUl = document.createElement("ul");
                      newUl.appendChild(li);
                      if (parent.element.lastElementChild) {
                          parent.element.lastElementChild.appendChild(newUl);
                      } else {
                          parent.element.appendChild(newUl);
                      }
                      stack.push({ level, element: newUl });
                  }
              } else {
                  parent.element.appendChild(li);
              }
          });
          floatingTocContainer.appendChild(rootUl);
      }

      const bcTocContainer = document.getElementById("bc-toc-container");

      const updateToc = () => {
        let activeA = null;
        if (floatingTocContainer) {
            floatingTocContainer.querySelectorAll('a').forEach(a => a.classList.remove('active'));
            activeA = floatingTocContainer.querySelector(`a[data-toc-id="${activeHeading.id}"]`);
            if (activeA) activeA.classList.add('active');
        }
        
        if (bcTocContainer && activeA) {
            let pathElements = [];
            let currentLi = activeA.closest('li');
            while (currentLi) {
                const a = currentLi.querySelector(':scope > a');
                if (a) pathElements.unshift({ text: a.innerText, id: a.getAttribute('data-toc-id') });
                const parentUl = currentLi.parentElement;
                if (!parentUl || parentUl.parentElement.tagName !== 'LI') break;
                currentLi = parentUl.parentElement;
            }

            let html = "";
            pathElements.forEach(item => {
                html += `
                    <span class="desktop-text" style="margin:0 0.3rem">/</span> 
                    <a href="#${item.id}" class="desktop-text bc-toc-link" style="color:#aaa; text-decoration:none;" data-target="${item.id}">
                      ${item.text}
                    </a>
                `;
            });
            bcTocContainer.innerHTML = html;
            
            bcTocContainer.querySelectorAll('.bc-toc-link').forEach(link => {
                link.onclick = (e) => {
                    e.preventDefault();
                    const targetId = link.getAttribute('data-target');
                    const targetEl = document.getElementById(targetId);
                    if (targetEl) {
                        const targetY = targetEl.getBoundingClientRect().top + window.scrollY - 100;
                        window.scrollTo({ top: targetY, behavior: "smooth" });
                    }
                };
            });
        } else if (bcTocContainer) {
            bcTocContainer.innerHTML = "";
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
    } else {
        const floatingTocContainer = document.getElementById("floating-toc");
        if (floatingTocContainer) floatingTocContainer.style.display = 'none';
    }

    // Image Lightbox
    let lightbox = document.getElementById("lightbox");
    if (!lightbox) {
        lightbox = document.createElement("div");
        lightbox.id = "lightbox";
        const img = document.createElement("img");
        lightbox.appendChild(img);
        document.body.appendChild(lightbox);
        
        lightbox.addEventListener("click", () => {
            lightbox.classList.remove("active");
        });
    }
    
    container.querySelectorAll("img").forEach(img => {
        img.addEventListener("click", (e) => {
            const lightboxImg = lightbox.querySelector("img");
            lightboxImg.src = img.src;
            lightbox.classList.add("active");
        });
    });
}

async function renderPostList(container) {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const activePath = urlParams.get("path") || "";

    const breadcrumb = document.getElementById("nav-breadcrumb");
    if (breadcrumb) {
        if (activePath) {
            const parts = activePath.split('/');
            let breadcrumbHtml = `
              <a href="/research/">
                <span class="desktop-text">연구기록</span>
                <span class="mobile-text">연</span>
              </a> 
            `;
            let acc = "";
            for(let i=0; i<parts.length; i++) {
                acc = acc ? acc + "/" + parts[i] : parts[i];
                breadcrumbHtml += `
                   <span class="desktop-text" style="margin:0 0.3rem">/</span>
                   <a href="/research/?path=${encodeURIComponent(acc)}" class="desktop-text bc-path-link" style="color:#aaa; text-decoration:none;">${parts[i]}</a>
                `;
            }
            breadcrumb.innerHTML = breadcrumbHtml;
        } else {
            breadcrumb.innerHTML = "";
        }
    }

    const response = await fetch("../content/research/list.json");
    if (!response.ok) throw new Error("목록을 불러올 수 없습니다.");

    const listData = await response.json();

    const filteredList = listData.filter(post => {
      if (activePath) {
        if (!post.id.startsWith(activePath + "/") && post.id !== activePath) {
          return false;
        }
      }
      return true;
    });

    container.innerHTML = `
        <ul class="research-list blog-list">
            ${filteredList
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

let researchBgInstance = null;

async function bootstrap() {
    researchBgInstance = await init();
}

bootstrap();
