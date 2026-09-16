import {
  initiateOAuth,
  handleOAuthCallback,
  fetchAccountInfo,
  logout,
  getStoredToken,
  uploadMediaFile,
  postStatus,
  updateStatus,
  deleteStatus,
  fetchMyStatuses,
  REDIRECT_URI
} from "../components/mastodon_oauth.js";

import { parseMastodonStatus } from "../components/mastodon.js";
import { ensureMarkdown, normalizeMarkdownMath } from "../components/content-dependencies.js";

let selectedCategory = "blog"; // "blog" | "research" | "tmp"
let uploadedMediaIds = [];
let autoSaveTimer = null;
let previewDebounceTimer = null;
let previewRenderVersion = 0;
let currentEditingPost = null; // null: 신규 작성 모드, object: 수정 모드
let postsCache = [];
let activeFilter = "all";
let searchKeyword = "";

async function initAdminStudio() {
  // OAuth 콜백 처리
  const isCallback = await handleOAuthCallback();
  if (isCallback) {
    window.location.href = REDIRECT_URI;
    return;
  }

  // 사용자 정보 및 Auth UI 초기화
  await initAuth();

  // 입력 폼 & 툴바 & 이벤트 리스너 세팅
  setupCategorySelector();
  setupToolbar();
  setupEditorAndPreview();
  setupDragAndDrop();
  setupPublishing();
  setupShortcuts();
  setupSidebar();

  // 이전 임시저장(Draft) 복원
  loadDraft();

  // 로그인 상태라면 포스트 목록 로드
  const token = getStoredToken();
  if (token) {
    loadPostsList();
  }
}

async function initAuth() {
  const userChipContainer = document.getElementById("user-chip-container");
  const token = getStoredToken();

  if (!token) {
    userChipContainer.innerHTML = `
      <div style="display:flex; gap:0.5rem; align-items:center;">
        <button type="button" id="btn-login" class="btn btn-primary" style="padding:0.35rem 0.85rem; font-size:0.8rem;">
          <span class="material-symbols-outlined" style="font-size:16px;">lock_open</span> Login with Mastodon
        </button>
      </div>
    `;

    document.getElementById("btn-login").addEventListener("click", async () => {
      try {
        showToast("마스토돈 인증 페이지로 이동합니다...", "sync");
        await initiateOAuth();
      } catch (err) {
        showToast(`인증 시작 실패: ${err.message}`, "error");
      }
    });

    const postsList = document.getElementById("posts-list");
    if (postsList) {
      postsList.innerHTML = `
        <div class="posts-empty">
          로그인 후 게시글 목록을 확인할 수 있습니다.
        </div>
      `;
    }

    return;
  }

  const user = await fetchAccountInfo();
  if (user) {
    userChipContainer.innerHTML = `
      <div class="user-chip">
        <img src="${user.avatar}" alt="avatar" />
        <span><strong>@${user.acct}</strong></span>
        <span id="btn-logout" style="cursor:pointer; margin-left:0.4rem; color:var(--accent-red);" title="로그아웃">✕</span>
      </div>
    `;
    document.getElementById("btn-logout").addEventListener("click", logout);
  } else {
    logout();
  }
}

function setupCategorySelector() {
  const opts = document.querySelectorAll(".cat-opt");
  opts.forEach(opt => {
    opt.addEventListener("click", (e) => {
      opts.forEach(o => o.classList.remove("active"));
      e.target.classList.add("active");
      selectedCategory = e.target.getAttribute("data-cat");
      updatePublishButtonState();
      updatePreview();
      triggerAutoSave();
    });
  });
}

function updatePublishButtonState() {
  const btnIcon = document.getElementById("btn-publish-icon");
  const btnLabel = document.getElementById("btn-publish-label");

  if (currentEditingPost) {
    if (btnIcon) btnIcon.innerText = "save";
    if (btnLabel) {
      if (selectedCategory === "tmp") {
        btnLabel.innerText = "저장";
      } else {
        btnLabel.innerText = "수정사항 저장";
      }
    }
  } else {
    if (btnIcon) btnIcon.innerText = selectedCategory === "tmp" ? "visibility_off" : "send";
    if (btnLabel) {
      if (selectedCategory === "tmp") {
        btnLabel.innerText = "발행하기";
      } else {
        btnLabel.innerText = "발행하기";
      }
    }
  }
}

function setupToolbar() {
  const toolBtns = document.querySelectorAll(".tool-btn[data-cmd]");
  const textarea = document.getElementById("editor-textarea");

  toolBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const cmd = btn.getAttribute("data-cmd");
      applyFormat(textarea, cmd);
    });
  });
}

function applyFormat(textarea, cmd) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.substring(start, end);
  let replacement = "";
  let cursorOffset = 0;

  switch (cmd) {
    case "bold":
      replacement = `**${selectedText || "bold text"}**`;
      cursorOffset = selectedText ? replacement.length : 2;
      break;
    case "italic":
      replacement = `*${selectedText || "italic text"}*`;
      cursorOffset = selectedText ? replacement.length : 1;
      break;
    case "strike":
      replacement = `~~${selectedText || "strikethrough"}~~`;
      cursorOffset = selectedText ? replacement.length : 2;
      break;
    case "highlight":
      replacement = `==${selectedText || "highlight text"}==`;
      cursorOffset = selectedText ? replacement.length : 2;
      break;
    case "h1":
      replacement = `# ${selectedText || "Heading 1"}\n`;
      cursorOffset = replacement.length;
      break;
    case "h2":
      replacement = `## ${selectedText || "Heading 2"}\n`;
      cursorOffset = replacement.length;
      break;
    case "h3":
      replacement = `### ${selectedText || "Heading 3"}\n`;
      cursorOffset = replacement.length;
      break;
    case "code":
      replacement = `\n\`\`\`python\n${selectedText || "# code here"}\n\`\`\`\n`;
      cursorOffset = replacement.length;
      break;
    case "quote":
      replacement = `\n> ${selectedText || "quote text"}\n`;
      cursorOffset = replacement.length;
      break;
    case "math":
      replacement = `\n$$\n${selectedText || "f(x) = \\int x dx"}\n$$\n`;
      cursorOffset = replacement.length;
      break;
    case "link":
      replacement = `[${selectedText || "link text"}](https://example.com)`;
      cursorOffset = replacement.length;
      break;
  }

  textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
  textarea.focus();
  textarea.setSelectionRange(start + cursorOffset, start + cursorOffset);
  updatePreview();
  triggerAutoSave();
}

function setupEditorAndPreview() {
  const titleInput = document.getElementById("input-title");
  const tagsInput = document.getElementById("input-tags");
  const textarea = document.getElementById("editor-textarea");

  titleInput.addEventListener("input", () => { triggerPreviewUpdate(); triggerAutoSave(); });
  tagsInput.addEventListener("input", () => { triggerPreviewUpdate(); triggerAutoSave(); });
  textarea.addEventListener("input", () => { triggerPreviewUpdate(); triggerAutoSave(); });
  document.addEventListener("sulog:editor-mode-change", () => updatePreview());

  updatePreview();
}

function triggerPreviewUpdate() {
  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(() => {
    updatePreview();
  }, 250);
}

async function updatePreview({ force = false } = {}) {
  const renderVersion = ++previewRenderVersion;
  const titleVal = document.getElementById("input-title").value.trim();
  const tagsVal = document.getElementById("input-tags").value.trim();
  const markdownVal = document.getElementById("editor-textarea").value;

  const previewTitle = document.getElementById("preview-title");
  const previewTags = document.getElementById("preview-tags");
  const previewBody = document.getElementById("preview-markdown-content");
  const metaInfo = document.getElementById("preview-meta-info");

  previewTitle.innerText = titleVal || "제목 프리뷰...";
  previewTitle.style.color = titleVal ? "var(--text-main)" : "var(--text-muted)";

  let tagsArray = [];
  if (tagsVal) {
    tagsArray = tagsVal.split(",").map(t => t.trim()).filter(t => t.length > 0);
  }

  let tagHtml = tagsArray.map(t => `#${t.replace(/^#/, '')}`).join(" / ");
  if (selectedCategory === "tmp") {
    tagHtml = `<span style="background:rgba(245,158,11,0.2); color:#fbbf24; padding:0.15rem 0.5rem; border-radius:4px; font-weight:bold; margin-right:0.5rem; font-size:0.75rem;">#tmp</span> ` + tagHtml;
  } else {
    tagHtml = `<span style="background:rgba(56,189,248,0.15); color:var(--accent-blue); padding:0.15rem 0.5rem; border-radius:4px; font-weight:bold; margin-right:0.5rem; font-size:0.75rem;">#${selectedCategory}</span> ` + tagHtml;
  }
  previewTags.innerHTML = tagHtml;

  const charCount = markdownVal.length;
  const wordCount = markdownVal.trim() ? markdownVal.trim().split(/\s+/).length : 0;
  const readTime = Math.ceil(wordCount / 200);
  metaInfo.innerText = `${wordCount} 단어 | ${charCount} 자 | 약 ${readTime}분 읽기`;

  // write의 텍스트/라이브 모드에서는 우측 프리뷰가 보이지 않는다. 숨겨진 상태에서
  // marked + KaTeX DOM을 계속 만들면 같은 문서를 두 번 렌더해 메모리와 CPU를 낭비한다.
  const previewHidden = document.body.classList.contains("write-mode-source")
    || document.body.classList.contains("write-mode-live");
  if (previewHidden && !force) {
    if (previewBody.childNodes.length) previewBody.replaceChildren();
    return;
  }

  let text = normalizeMarkdownMath(markdownVal);

  try {
    if (typeof ensureMarkdown !== "undefined") {
      await ensureMarkdown(text);
    }

    // 느린 CDN 로드 중 더 최신 입력이 들어왔으면 오래된 결과를 DOM에 쓰지 않는다.
    if (renderVersion !== previewRenderVersion) return;

    if (typeof marked !== "undefined") {
      previewBody.innerHTML = marked.parse(text);
      previewBody.querySelectorAll('pre code').forEach((block) => {
        const pre = block.parentElement;
        const langMatch = block.className.match(/language-(\w+)/);
        if (langMatch && langMatch[1]) {
          pre.setAttribute('data-lang', langMatch[1].toUpperCase());
        }
        if (typeof hljs !== 'undefined') hljs.highlightElement(block);
      });
      previewBody.querySelectorAll('table').forEach(table => {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrapper';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      });
    } else {
      previewBody.innerText = text;
    }
  } catch (err) {
    console.warn("Markdown/KaTeX parse fallback:", err);
    if (typeof marked !== "undefined") {
      try {
        previewBody.innerHTML = marked.parse(text);
      } catch (_) {
        previewBody.innerText = text;
      }
    } else {
      previewBody.innerText = text;
    }
  }

}

window.sulogRenderPreview = () => updatePreview({ force: true });

function setupDragAndDrop() {
  const textarea = document.getElementById("editor-textarea");
  const overlay = document.getElementById("drag-overlay");

  textarea.addEventListener("dragover", (e) => {
    e.preventDefault();
    overlay.classList.add("active");
  });

  textarea.addEventListener("dragleave", (e) => {
    if (e.relatedTarget !== overlay) {
      overlay.classList.remove("active");
    }
  });

  textarea.addEventListener("drop", async (e) => {
    e.preventDefault();
    overlay.classList.remove("active");

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    showToast("파일을 업로드하는 중입니다...", "cloud_upload");

    try {
      for (const file of files) {
        const mediaData = await uploadMediaFile(file);
        uploadedMediaIds.push(mediaData.id);

        const insertText = mediaData.type === 'image' 
          ? `\n![${file.name}](${mediaData.url})\n`
          : `\n[첨부파일: ${file.name}](${mediaData.url})\n`;

        textarea.value += insertText;
      }
      showToast("미디어가 성공적으로 업로드되었습니다!", "check_circle");
      updatePreview();
      triggerAutoSave();
    } catch (err) {
      showToast(`업로드 실패: ${err.message}`, "error");
    }
  });
}

function setupPublishing() {
  const btnPublish = document.getElementById("btn-publish");

  btnPublish.addEventListener("click", async () => {
    const token = getStoredToken();
    if (!token) {
      showToast("로그인이 필요합니다. 상단 Login 버튼을 눌러주세요.", "lock");
      return;
    }

    const titleVal = document.getElementById("input-title").value.trim();
    const tagsVal = document.getElementById("input-tags").value.trim();
    const markdownVal = document.getElementById("editor-textarea").value.trim();

    if (!titleVal) {
      showToast("글 제목을 입력해 주세요.", "warning");
      document.getElementById("input-title").focus();
      return;
    }

    if (!markdownVal) {
      showToast("본문 내용을 입력해 주세요.", "warning");
      document.getElementById("editor-textarea").focus();
      return;
    }

    // 태그 빌드 (#blog, #research, #tmp)
    let formattedTags = `#${selectedCategory}`;

    if (tagsVal) {
      const parsedTags = tagsVal.split(",").map(t => t.trim()).filter(t => t.length > 0);
      const customTags = parsedTags.filter(t => !["blog", "research", "tmp", "draft", "임시", "temp"].includes(t.toLowerCase().replace(/^#/, '')));
      if (customTags.length > 0) {
        formattedTags += " " + customTags.map(t => t.startsWith("#") ? t : `#${t}`).join(" ");
      }
    }

    const fullStatusText = `${markdownVal}\n\n${formattedTags}`;

    btnPublish.disabled = true;

    try {
      if (currentEditingPost) {
        // 기존 포스트 수정 모드
        showToast("마스토돈에서 글을 수정하는 중...", "sync");

        const updated = await updateStatus({
          id: currentEditingPost.id,
          statusText: fullStatusText,
          spoilerText: titleVal,
          mediaIds: uploadedMediaIds
        });

        const successMsg = selectedCategory === "tmp"
          ? "글이 #tmp 임시 상태로 수정 저장되었습니다. (사이트 미노출)"
          : `글이 #${selectedCategory} 정식 게시글로 수정되어 사이트에 반영되었습니다!`;

        showToast(successMsg, "task_alt");

        // 캐시 업데이트 및 목록 갱신
        await loadPostsList();

        // 수정 상태 갱신
        const parsed = parseMastodonStatus(updated);
        currentEditingPost = parsed;
        document.getElementById("editing-post-title").innerText = parsed.title;
        updatePublishButtonState();

      } else {
        // 신규 포스트 발행 모드
        showToast(
          selectedCategory === "tmp"
            ? "마스토돈으로 #tmp 임시 글을 발행하는 중..."
            : "마스토돈으로 글을 발행하는 중...",
          "sync"
        );

        const result = await postStatus({
          statusText: fullStatusText,
          spoilerText: titleVal,
          mediaIds: uploadedMediaIds
        });

        showToast(
          selectedCategory === "tmp"
            ? "발행되었습니다!"
            : "글이 성공적으로 발행되었습니다!", 
          "task_alt"
        );
        
        // 임시저장 데이터 초기화
        clearDraft();

        // 목록 새로고침
        await loadPostsList();

        setTimeout(() => {
          if (selectedCategory === "tmp") {
            showToast("임시 글(#tmp)이 목록에 추가되었습니다. 나중에 태그를 바꿔 게시할 수 있습니다.", "info");
          } else {
            if (confirm("글이 성공적으로 발행되었습니다! 발행된 페이지로 이동하시겠습니까?")) {
              window.location.href = `/${selectedCategory}/?id=${result.id}`;
            }
          }
        }, 500);
      }

    } catch (err) {
      showToast(`처리 실패: ${err.message}`, "error");
    } finally {
      btnPublish.disabled = false;
    }
  });
}

function setupSidebar() {
  const sidebar = document.getElementById("posts-sidebar");
  const btnToggle = document.getElementById("btn-toggle-sidebar");
  const iconToggle = document.getElementById("icon-toggle-sidebar");
  const btnRefresh = document.getElementById("btn-refresh-posts");
  const searchInput = document.getElementById("posts-search");
  const filterTabs = document.querySelectorAll(".filter-tab");
  const btnNewPost = document.getElementById("btn-new-post");
  const btnCancelEdit = document.getElementById("btn-cancel-edit");
  const btnDeleteCurrent = document.getElementById("btn-delete-current");

  // 사이드바 기본 열림/닫힘 상태 복원 (기본값: 열림)
  const savedState = localStorage.getItem("sulog_admin_sidebar_open");
  if (savedState === "false") {
    sidebar.classList.add("collapsed");
    if (iconToggle) iconToggle.innerText = "menu";
  }

  // 토글 버튼
  if (btnToggle) {
    btnToggle.addEventListener("click", () => {
      const isCollapsed = sidebar.classList.toggle("collapsed");
      if (iconToggle) {
        iconToggle.innerText = isCollapsed ? "menu" : "menu_open";
      }
      localStorage.setItem("sulog_admin_sidebar_open", isCollapsed ? "false" : "true");
    });
  }

  // 새로고침 버튼
  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      loadPostsList();
    });
  }

  // 검색창 입력 이벤트
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchKeyword = e.target.value.trim().toLowerCase();
      renderPostsList();
    });
  }

  // 필터 탭 클릭 이벤트
  filterTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      filterTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      activeFilter = tab.getAttribute("data-filter");
      renderPostsList();
    });
  });

  // 새 글 쓰기 버튼
  if (btnNewPost) {
    btnNewPost.addEventListener("click", () => {
      startNewPost();
    });
  }

  // 수정 취소 버튼
  if (btnCancelEdit) {
    btnCancelEdit.addEventListener("click", () => {
      startNewPost();
    });
  }

  // 현재 수정 중인 글 삭제 버튼
  if (btnDeleteCurrent) {
    btnDeleteCurrent.addEventListener("click", () => {
      if (currentEditingPost) {
        deletePost(currentEditingPost.id, currentEditingPost.title);
      }
    });
  }
}

async function loadPostsList() {
  const postsListEl = document.getElementById("posts-list");
  if (!postsListEl) return;

  const token = getStoredToken();
  if (!token) {
    postsListEl.innerHTML = `<div class="posts-empty">로그인이 필요합니다.</div>`;
    return;
  }

  postsListEl.innerHTML = `<div class="posts-loading">게시글 목록을 불러오는 중...</div>`;

  try {
    const rawStatuses = await fetchMyStatuses({ limit: 40 });
    postsCache = rawStatuses.map(st => {
      const parsed = parseMastodonStatus(st);
      parsed.rawStatus = st;
      return parsed;
    });

    const badge = document.getElementById("posts-count-badge");
    if (badge) {
      badge.innerText = postsCache.length;
      badge.style.display = "inline-block";
    }

    renderPostsList();
  } catch (err) {
    postsListEl.innerHTML = `
      <div class="posts-empty" style="color:var(--accent-red);">
        목록 불러오기 실패: ${err.message}
      </div>
    `;
  }
}

function renderPostsList() {
  const postsListEl = document.getElementById("posts-list");
  if (!postsListEl) return;

  let filtered = postsCache;

  // 1. 카테고리 필터링 (all | blog | research | tmp)
  if (activeFilter === "blog") {
    filtered = filtered.filter(p => p.category === "blog");
  } else if (activeFilter === "research") {
    filtered = filtered.filter(p => p.category === "research");
  } else if (activeFilter === "tmp") {
    filtered = filtered.filter(p => p.category === "tmp" || p.isDraft);
  }

  // 2. 검색어 필터링
  if (searchKeyword) {
    filtered = filtered.filter(p => {
      const titleMatch = (p.title || "").toLowerCase().includes(searchKeyword);
      const tagMatch = (p.tags || []).some(t => t.toLowerCase().includes(searchKeyword));
      return titleMatch || tagMatch;
    });
  }

  if (filtered.length === 0) {
    postsListEl.innerHTML = `
      <div class="posts-empty">
        해당하는 게시글이 없습니다.
      </div>
    `;
    return;
  }

  postsListEl.innerHTML = "";

  filtered.forEach(post => {
    const card = document.createElement("div");
    card.className = "post-card";
    if (currentEditingPost && currentEditingPost.id === post.id) {
      card.classList.add("active-editing");
    }

    let catBadgeHtml = "";
    if (post.category === "tmp" || post.isDraft) {
      catBadgeHtml = `<span class="badge-tag badge-draft">#tmp</span>`;
    } else if (post.category === "research") {
      catBadgeHtml = `<span class="badge-tag badge-research">#research</span>`;
    } else {
      catBadgeHtml = `<span class="badge-tag">#blog</span>`;
    }

    const tagSummary = (post.tags && post.tags.length > 0)
      ? post.tags.map(t => `#${t}`).join(" ")
      : "";

    const viewUrl = (post.category === "tmp" || post.isDraft)
      ? post.url // 임시글은 마스토돈 원본 링크로
      : `/${post.category}/?id=${post.id}`; // 정식 글은 사이트 링크

    card.innerHTML = `
      <div class="post-card-meta">
        <div class="post-badge-group">
          ${catBadgeHtml}
        </div>
        <span>${post.date || ""}</span>
      </div>

      <div class="post-card-title">${escapeHtml(post.title)}</div>

      <div class="post-card-footer">
        <div class="post-card-tags" title="${escapeHtml(tagSummary)}">${escapeHtml(tagSummary)}</div>
        <div class="post-card-actions">
          <button type="button" class="card-action-btn edit-btn" title="에디터에서 수정/태그변경 하기">
            <span class="material-symbols-outlined" style="font-size: 13px;">edit</span> 수정
          </button>
          <button type="button" class="card-action-btn delete-btn" title="게시글 삭제하기">
            <span class="material-symbols-outlined" style="font-size: 13px;">delete</span>
          </button>
          <a href="${viewUrl}" target="_blank" class="card-action-btn view-btn" title="${post.category === 'tmp' ? '마스토돈에서 보기' : '사이트에서 보기'}">
            <span class="material-symbols-outlined" style="font-size: 13px;">open_in_new</span>
          </a>
        </div>
      </div>
    `;

    // 카드 전체 클릭 또는 수정 버튼 클릭 시 수정 모드로 진입
    card.addEventListener("click", (e) => {
      if (e.target.closest(".delete-btn") || e.target.closest(".view-btn")) {
        return;
      }
      startEditingPost(post);
    });

    const editBtn = card.querySelector(".edit-btn");
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startEditingPost(post);
    });

    const deleteBtn = card.querySelector(".delete-btn");
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deletePost(post.id, post.title);
    });

    postsListEl.appendChild(card);
  });
}

function startEditingPost(post) {
  currentEditingPost = post;

  // 제목, 본문, 태그 채우기
  document.getElementById("input-title").value = post.title || "";
  document.getElementById("editor-textarea").value = post.markdown || "";
  document.getElementById("input-tags").value = (post.tags || []).join(", ");

  // 카테고리 동기화 (blog, research, tmp)
  selectedCategory = (post.category === "tmp" || post.isDraft) ? "tmp" : (post.category || "blog");
  document.querySelectorAll(".cat-opt").forEach(opt => {
    opt.classList.toggle("active", opt.getAttribute("data-cat") === selectedCategory);
  });

  // 첨부 미디어 ID 복원
  uploadedMediaIds = (post.media || []).map(m => m.id).filter(Boolean);

  // 수정 모드 배너 활성화
  const editBanner = document.getElementById("edit-mode-banner");
  const editingTitle = document.getElementById("editing-post-title");
  const editingId = document.getElementById("editing-post-id");
  const btnNewPost = document.getElementById("btn-new-post");

  if (editBanner) editBanner.style.display = "flex";
  if (editingTitle) editingTitle.innerText = post.title || "무제 포스트";
  if (editingId) editingId.innerText = post.id;
  if (btnNewPost) btnNewPost.style.display = "inline-flex";

  // 버튼 라벨 갱신
  updatePublishButtonState();

  // 프리뷰 갱신
  updatePreview();

  // 사이드바 카드 하이라이트
  document.querySelectorAll(".post-card").forEach(c => c.classList.remove("active-editing"));
  renderPostsList();

  // 에디터로 포커스
  document.getElementById("input-title").focus();

  showToast(`'${post.title}' 포스트를 수정 모드로 불러왔습니다. 카테고리를 변경할 수 있습니다.`, "edit_note");
}

function startNewPost() {
  currentEditingPost = null;

  // 배너 및 새 글 버튼 숨김
  const editBanner = document.getElementById("edit-mode-banner");
  const btnNewPost = document.getElementById("btn-new-post");
  if (editBanner) editBanner.style.display = "none";
  if (btnNewPost) btnNewPost.style.display = "none";

  // 폼 비우기
  document.getElementById("input-title").value = "";
  document.getElementById("editor-textarea").value = "";
  document.getElementById("input-tags").value = "";
  
  uploadedMediaIds = [];

  // 기본 카테고리: blog
  selectedCategory = "blog";
  document.querySelectorAll(".cat-opt").forEach(opt => {
    opt.classList.toggle("active", opt.getAttribute("data-cat") === "blog");
  });

  // 버튼 라벨 갱신
  updatePublishButtonState();

  // 이전 드래프트 복원 시도
  loadDraft();

  updatePreview();
  renderPostsList();

  document.getElementById("input-title").focus();
  showToast("새 글 작성 모드로 전환되었습니다.", "add");
}

async function deletePost(postId, postTitle) {
  const displayTitle = postTitle || "이 게시글";
  const ok = confirm(`'${displayTitle}'을(를) 정말 삭제하시겠습니까?\n마스토돈 서버에서도 영구적으로 삭제됩니다.`);
  if (!ok) return;

  showToast("게시글을 삭제하는 중...", "delete");

  try {
    await deleteStatus(postId);
    showToast("게시글이 성공적으로 삭제되었습니다.", "check_circle");

    // 만약 현재 수정 중이던 글이 삭제된 경우 신규 모드로 전환
    if (currentEditingPost && currentEditingPost.id === postId) {
      startNewPost();
    }

    // 목록 갱신
    await loadPostsList();
  } catch (err) {
    showToast(`삭제 실패: ${err.message}`, "error");
  }
}

function setupShortcuts() {
  const textarea = document.getElementById("editor-textarea");
  textarea.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        applyFormat(textarea, "bold");
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        applyFormat(textarea, "italic");
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        applyFormat(textarea, "link");
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        saveDraft();
        showToast("임시 로컬 저장되었습니다.", "save");
      }
    }
  });
}

function triggerAutoSave() {
  if (currentEditingPost) {
    document.getElementById("status-draft").innerText = `수정 중: ${currentEditingPost.title}`;
    return;
  }

  clearTimeout(autoSaveTimer);
  document.getElementById("status-draft").innerText = "저장 중...";
  autoSaveTimer = setTimeout(() => {
    saveDraft();
  }, 1000);
}

function saveDraft() {
  if (currentEditingPost) return;

  const draftData = {
    category: selectedCategory,
    title: document.getElementById("input-title").value,
    tags: document.getElementById("input-tags").value,
    markdown: document.getElementById("editor-textarea").value,
    updatedAt: new Date().toLocaleTimeString()
  };
  localStorage.setItem("sulog_admin_draft", JSON.stringify(draftData));
  document.getElementById("status-draft").innerText = `자동 저장됨 (${draftData.updatedAt})`;
}

function loadDraft() {
  if (currentEditingPost) return;

  const saved = localStorage.getItem("sulog_admin_draft");
  if (!saved) return;

  try {
    const draft = JSON.parse(saved);
    if (draft.title || draft.markdown) {
      document.getElementById("input-title").value = draft.title || "";
      document.getElementById("input-tags").value = draft.tags || "";
      document.getElementById("editor-textarea").value = draft.markdown || "";
      
      if (draft.category) {
        selectedCategory = draft.category;
        document.querySelectorAll(".cat-opt").forEach(opt => {
          opt.classList.toggle("active", opt.getAttribute("data-cat") === draft.category);
        });
      }

      updatePublishButtonState();
      updatePreview();
      document.getElementById("status-draft").innerText = `임시 저장 복원됨 (${draft.updatedAt || ''})`;
    }
  } catch (e) {}
}

function clearDraft() {
  localStorage.removeItem("sulog_admin_draft");
  document.getElementById("input-title").value = "";
  document.getElementById("input-tags").value = "";
  document.getElementById("editor-textarea").value = "";
  selectedCategory = "blog";
  document.querySelectorAll(".cat-opt").forEach(opt => {
    opt.classList.toggle("active", opt.getAttribute("data-cat") === "blog");
  });
  uploadedMediaIds = [];
  updatePublishButtonState();
  updatePreview();
  document.getElementById("status-draft").innerText = "자동 저장 준비됨";
}

function showToast(message, iconName = "info") {
  const toast = document.getElementById("toast");
  const icon = document.getElementById("toast-icon");
  const msg = document.getElementById("toast-message");

  if (!toast || !icon || !msg) return;

  icon.innerText = iconName;
  msg.innerText = message;

  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.innerText = text;
  return div.innerHTML;
}

initAdminStudio();
