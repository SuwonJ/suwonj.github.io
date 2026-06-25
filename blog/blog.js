import { renderNavbar } from "/components/navbar.js";
import { HalftoneBackground } from "../components/halftone.js";

function buildTree(list) {
  const root = { name: "root", children: {}, files: [], path: "" };
  list.forEach(post => {
    const parts = post.id.split('/');
    let current = root;
    let path = "";
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      path = path ? path + "/" + part : part;
      if (!current.children[part]) {
        current.children[part] = { name: part, children: {}, files: [], path: path };
      }
      current = current.children[part];
    }
    current.files.push(post);
  });
  return root;
}

function renderTreeHtml(node, currentId = null) {
  let html = '<ul>';
  
  const folders = Object.values(node.children);
  const files = node.files;
  
  folders.forEach((folder) => {
    let isOpen = false;
    if (!currentId) {
      isOpen = true; // on main page, all open (if rendered at all)
    } else if (currentId.startsWith(folder.path + "/")) {
      isOpen = true;
    }

    html += `
      <li>
        <details ${isOpen ? "open" : ""}>
          <summary>${folder.name}</summary>
          ${renderTreeHtml(folder, currentId)}
        </details>
      </li>
    `;
  });
  
  files.forEach((file) => {
    const isActive = currentId === file.id;
    const dateHtml = !currentId ? ` <span class="post-date" style="font-size:0.85em;color:#888;">(${file.date})</span>` : '';
    html += `
      <li>
        <a href="/blog/?id=${file.id}" ${isActive ? 'class="active" style="color:#fff;font-weight:bold;"' : ''}>${file.title}</a>${dateHtml}
      </li>
    `;
  });
  
  html += `</ul>`;
  return html;
}

async function init() {
  if (typeof window.markedKatex === "function") {
    marked.use(window.markedKatex({ throwOnError: false, nonStandard: true }));
  }

  renderNavbar();
  const blogBg = new HalftoneBackground("halftone-canvas", {
    iconSrc: null,
    boundarySelectors: [".navbar", "hr"],
    buttonSelectors: ["#content pre"]
  });
  window.blogBg = blogBg; // 전역 스코프 등록
  blogBg.init();

  const urlParams = new URLSearchParams(window.location.search);
  const postId = urlParams.get("id");
  const contentArea = document.getElementById("content");

  try {
    const res = await fetch("../content/blog/list.json");
    if (res.ok) {
      const listData = await res.json();
      
      const treeRoot = buildTree(listData);
      const floatingTree = document.getElementById("floating-tree");
      if (floatingTree) {
          if (postId) {
              floatingTree.innerHTML = `<div class="tree-view">${renderTreeHtml(treeRoot, postId)}</div>`;
          } else {
              floatingTree.innerHTML = '';
          }
      }

      if (postId) {
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
    }
  } catch (e) {}

  if (postId) {
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
                if (window.blogBg) window.blogBg.pulseButton(pre);
                
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

    // Breadcrumb TOC 로직
    const titleEl = document.getElementById("page-title");
    if (titleEl && postMeta.title) {
      if (postMeta.date) {
        titleEl.innerHTML = `${postMeta.title} <span class="post-title-date" style="font-size: 1.1rem; color: #888; margin-left: 1rem; font-weight: normal; font-family: monospace;">(${postMeta.date})</span>`;
      } else {
        titleEl.innerText = postMeta.title;
      }
    }

    const headings = container.querySelectorAll("h1, h2, h3");
    headings.forEach((h, i) => {
      if (!h.id) h.id = "heading-" + i;
    });

    const breadcrumb = document.getElementById("nav-breadcrumb");
    if (breadcrumb) {
      let breadcrumbHtml = `
        <a href="/blog/">
          <span class="desktop-text">블로그</span>
          <span class="mobile-text">블</span>
        </a> 
      `;

      if (postMeta && postMeta.id) {
          const parts = postMeta.id.split('/');
          let accumulatedPath = "";
          for (let i = 0; i < parts.length - 1; i++) {
              accumulatedPath = accumulatedPath ? accumulatedPath + "/" + parts[i] : parts[i];
              breadcrumbHtml += `
                  <span class="desktop-text" style="margin:0 0.3rem">/</span>
                  <a href="/blog/?path=${encodeURIComponent(accumulatedPath)}" class="desktop-text bc-path-link" style="color:#aaa; text-decoration:none;">${parts[i]}</a>
              `;
          }
      }

      breadcrumbHtml += `
        <span style="margin:0 0.3rem">/</span> 
        <a href="#" id="bc-title">
          <span class="desktop-text">${postMeta.title || "문서"}</span>
          <span class="mobile-text">${(postMeta.title || "문서").charAt(0)}</span>
        </a> 
        <span id="bc-separator" style="display:none;margin:0 0.3rem">/</span> 
        <a href="#" id="bc-toc" style="display:none;">
          <span class="desktop-text"></span>
          <span class="mobile-text"></span>
        </a>
      `;

      breadcrumb.innerHTML = breadcrumbHtml;

      const bcTitle = document.getElementById("bc-title");
      bcTitle.addEventListener("click", (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      const bcToc = document.getElementById("bc-toc");
      const bcSeparator = document.getElementById("bc-separator");

      if (headings.length > 0 && bcToc) {
        let activeHeading = headings[0];
        
        const floatingTocContainer = document.getElementById("floating-toc");
        if (floatingTocContainer) {
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

        const updateToc = () => {
          const tocText = activeHeading.innerText;
          const dt = bcToc.querySelector('.desktop-text');
          const mt = bcToc.querySelector('.mobile-text');
          if (dt) dt.innerText = tocText;
          if (mt) mt.innerText = tocText.charAt(0);
          bcToc.href = "#" + activeHeading.id;
          bcToc.style.display = "inline";
          bcSeparator.style.display = "inline";

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
        
        bcToc.addEventListener("click", (e) => {
          e.preventDefault();
          const targetY = activeHeading.getBoundingClientRect().top + window.scrollY - 100;
          window.scrollTo({ top: targetY, behavior: "smooth" });
        });
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
    const activePath = urlParams.get("path") || "";

    if (activePath) {
        if (breadcrumb) {
            const parts = activePath.split('/');
            let breadcrumbHtml = `
              <a href="/blog/">
                <span class="desktop-text">블로그</span>
                <span class="mobile-text">블</span>
              </a> 
            `;
            let acc = "";
            for(let i=0; i<parts.length; i++) {
                acc = acc ? acc + "/" + parts[i] : parts[i];
                breadcrumbHtml += `
                   <span class="desktop-text" style="margin:0 0.3rem">/</span>
                   <a href="/blog/?path=${encodeURIComponent(acc)}" class="desktop-text bc-path-link" style="color:#aaa; text-decoration:none;">${parts[i]}</a>
                `;
            }
            breadcrumb.innerHTML = breadcrumbHtml;
        }
    }

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
      if (activePath) {
        if (!post.id.startsWith(activePath + "/") && post.id !== activePath) {
          return false;
        }
      }
      if (activeTags.length === 0) return true;
      if (!post.tags) return false;
      // OR 검색
      return activeTags.some(t => post.tags.includes(t));
    });

    const treeRoot = buildTree(filteredList);
    container.innerHTML = `
        <div class="tree-view">
            ${renderTreeHtml(treeRoot)}
        </div>
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

// blogBg를 전역으로 노출하여 click 이벤트에서 접근 가능하게 함
let blogBgInstance = null;

async function bootstrap() {
    blogBgInstance = await init();
}

bootstrap();
