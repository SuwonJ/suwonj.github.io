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
  fetchEditableStatus,
  REDIRECT_URI
} from "../components/mastodon_oauth.js?v=20";

import { parseMastodonStatus } from "../components/mastodon.js?v=20";
import { parsePreview, commitPreview } from '../assets/preview.js?v=20';
import { dbGet, dbSet, draftKey, readDraft, removeDraft } from '../components/drafts.js?v=20';
import { formatText } from '../components/editor-tools.js?v=20';

const initialMode = localStorage.getItem('sulog_write_editor_mode') || 'split';
document.body.classList.add(`write-mode-${['split', 'source', 'live', 'preview'].includes(initialMode) ? initialMode : 'split'}`);
let selectedCategory = "blog"; // "blog" | "research" | "tmp"
let uploadedMediaIds = [];
let autoSaveTimer = null;
let previewDebounceTimer = null;
let previewRenderVersion = 0;
let currentEditingPost = null; // null: 신규 작성 모드, object: 수정 모드
let postsCache = [];
let activeFilter = "all";
let searchKeyword = "";
let documentSession = 0;
let openRequest = 0;
let revision = 0;
let dirty = false;
let saveChain = Promise.resolve();
let renderedMarkdown = null;
let previewTask = Promise.resolve();
let composing = false;
const bodyValue = () => document.getElementById('editor-textarea').value;
function changed() { revision++; dirty = true; previewRenderVersion++; }
function replaceBody(text) {
  document.getElementById('editor-textarea').value = text;
  renderedMarkdown = null; previewRenderVersion++; revision++;
}

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
  await loadDraft({ resume: true });

  document.addEventListener('sulog:save', async () => {
    if (await saveDraft()) showToast('임시 로컬 저장되었습니다.', 'save');
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveDraft(); });
  window.addEventListener('pagehide', () => { saveDraft(); });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  try {
    const { installWriteEditor } = await import('../assets/editor.js?v=20');
    installWriteEditor();
  } catch (error) {
    console.error('Editor initialization failed:', error);
    const textarea = document.getElementById('editor-textarea');
    const text = window.sulogEditor?.value;
    delete textarea.value;
    if (text != null) textarea.value = text;
    window.sulogWriteEditor?.destroy();
    window.sulogEditor = null; window.sulogWriteEditor = null;
    document.body.classList.add('sulog-cm-fallback');
    document.body.classList.remove('write-mode-source', 'write-mode-live', 'write-mode-preview');
    updatePreview();
  }

  document.getElementById('input-title').disabled = false;
  document.getElementById('input-tags').disabled = false;
  document.getElementById('editor-textarea').readOnly = false;

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
    opt.setAttribute('role', 'button'); opt.tabIndex = 0;
    opt.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); opt.click(); } });
    opt.addEventListener("click", (e) => {
      opts.forEach(o => o.classList.remove("active"));
      e.currentTarget.classList.add("active");
      selectedCategory = e.currentTarget.getAttribute("data-cat");
      updatePublishButtonState();
      changed();
      triggerPreviewUpdate();
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
  if (window.sulogEditor) return window.sulogEditor.format(cmd);
  const start = textarea.selectionStart, end = textarea.selectionEnd;
  const format = formatText(cmd, textarea.value.slice(start, end));
  if (!format) return;
  textarea.focus();
  // Native insertText preserves the browser undo stack. setRangeText is the fallback.
  if (!document.execCommand('insertText', false, format.insert)) {
    textarea.setRangeText(format.insert, start, end, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
  textarea.setSelectionRange(start + format.from, start + format.to);
}

function setupEditorAndPreview() {
  const title = document.getElementById('input-title'), tags = document.getElementById('input-tags');
  const textarea = document.getElementById('editor-textarea');
  for (const input of [title, tags]) input.addEventListener('input', () => { changed(); updatePreviewMeta(); triggerPreviewUpdate(); triggerAutoSave(); });
  textarea.addEventListener('input', () => { changed(); triggerPreviewUpdate(); triggerAutoSave(); });
  textarea.addEventListener('compositionstart', () => { composing = true; clearTimeout(previewDebounceTimer); });
  textarea.addEventListener('compositionend', () => { composing = false; triggerPreviewUpdate(); });
  document.addEventListener('sulog:composition-end', () => { triggerPreviewUpdate(); triggerAutoSave(); });
  document.addEventListener('sulog:editor-mode-change', () => { previewRenderVersion++; triggerPreviewUpdate(); });
  updatePreview();
}
function updatePreviewMeta() {
  const title = document.getElementById('input-title').value.trim();
  const titleEl = document.getElementById('preview-title');
  titleEl.textContent = title || '제목 프리뷰...'; titleEl.style.color = title ? 'var(--text-main)' : 'var(--text-muted)';
  const tags = document.getElementById('input-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  document.getElementById('preview-tags').textContent = [selectedCategory, ...tags].map(t => '#' + t.replace(/^#/, '')).join(' / ');
}
function triggerPreviewUpdate() {
  clearTimeout(previewDebounceTimer);
  if (composing || window.sulogWriteEditor?.composing) return;
  const length = window.sulogEditor?.length ?? document.getElementById('editor-textarea').textLength;
  previewDebounceTimer = setTimeout(() => { updatePreview(); }, length > 50000 ? 650 : 300);
}
async function updatePreview({ force = false } = {}) {
  updatePreviewMeta();
  const hidden = document.body.classList.contains('write-mode-source') || document.body.classList.contains('write-mode-live');
  const root = document.getElementById('preview-markdown-content');
  if (hidden && !force) { root.replaceChildren(); renderedMarkdown = null; document.getElementById('preview-meta-info').textContent = `${window.sulogEditor?.length ?? document.getElementById('editor-textarea').textLength} 자`; return; }
  const version = previewRenderVersion, text = bodyValue();
  if (text === renderedMarkdown && !force) return;
  const run = async () => {
    if (version !== previewRenderVersion) return false;
    const html = await parsePreview(text);
    if (version !== previewRenderVersion) return false;
    const complete = await commitPreview(root, html, () => version === previewRenderVersion, { force });
    if (complete) {
      renderedMarkdown = text;
      const words = text.match(/\S+/g)?.length || 0;
      document.getElementById('preview-meta-info').textContent = `${words} 단어 | ${text.length} 자 | 약 ${Math.ceil(words / 200)}분 읽기`;
    }
    return complete;
  };
  previewTask = previewTask.catch(() => {}).then(run);
  try {
    const complete = await previewTask;
    if (force && !complete) throw new Error('출력 준비 중 본문이 변경되었습니다. 다시 시도해 주세요.');
  } catch (error) {
    if (force) throw error;
    if (version === previewRenderVersion) document.getElementById('preview-meta-info').textContent = '미리보기 실패 · 보기 모드를 전환해 다시 시도하세요';
    console.error('Preview failed:', error);
  }
}
window.sulogRenderPreview = () => updatePreview({ force: true });

function setupDragAndDrop() {
  const textarea = document.getElementById('editor-textarea'), overlay = document.getElementById('drag-overlay');
  textarea.addEventListener('dragover', event => { if (!event.dataTransfer?.types.includes('Files')) return; event.preventDefault(); overlay.classList.add('active'); });
  textarea.addEventListener('dragleave', () => overlay.classList.remove('active'));
  textarea.addEventListener('drop', event => {
    overlay.classList.remove('active'); if (!event.dataTransfer?.files.length) return;
    event.preventDefault(); uploadFiles(Array.from(event.dataTransfer.files));
  });
  document.addEventListener('sulog:media-drop', event => uploadFiles(event.detail.files, event.detail.position));
  async function uploadFiles(files, position) {
    const session = documentSession;
    let offset = position ?? textarea.selectionStart;
    const bookmark = window.sulogEditor?.bookmark(position);
    showToast('파일을 업로드하는 중입니다...', 'cloud_upload');
    try {
      for (const file of files) {
        const media = await uploadMediaFile(file);
        if (session !== documentSession) { showToast('이전 문서의 업로드가 완료되었습니다. 현재 글에는 삽입하지 않았습니다.', 'info'); return; }
        const name = file.name.replace(/[\[\]\(\)\\]/g, '\\$&');
        const text = media.type === 'image' ? `\n![${name}](${media.url})\n` : `\n[첨부파일: ${name}](${media.url})\n`;
        uploadedMediaIds.push(media.id);
        if (bookmark) bookmark.insert(text);
        else { textarea.setRangeText(text, Math.min(offset, textarea.value.length), Math.min(offset, textarea.value.length), 'end'); offset = textarea.selectionEnd; textarea.dispatchEvent(new Event('input', { bubbles: true })); }
      }
      showToast('미디어가 업로드되었습니다.', 'check_circle');
    } catch (error) { showToast(`업로드 실패: ${error.message}`, 'error'); }
    finally { bookmark?.release(); }
  }
}

function setupPublishing() {
  const btnPublish = document.getElementById("btn-publish");

  btnPublish.addEventListener("click", async () => {
    const token = getStoredToken();
    if (!token) {
      showToast("로그인이 필요합니다. 상단 Login 버튼을 눌러주세요.", "lock");
      return;
    }

    if (btnPublish.disabled) return;
    const inputSession = documentSession, inputRevision = revision;
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

    btnPublish.disabled = true;
    if (!(await saveDraft()) || inputSession !== documentSession || inputRevision !== revision) {
      btnPublish.disabled = false;
      if (inputSession !== documentSession || inputRevision !== revision) showToast('본문이 변경되었습니다. 현재 글을 확인하고 다시 발행해 주세요.', 'info');
      return;
    }
    const publishingSession = documentSession, publishingRevision = revision;
    const publishingPost = currentEditingPost;
    const publishingMedia = [...uploadedMediaIds];
    const publishingCategory = selectedCategory;
    const fullStatusText = `${markdownVal}\n\n${formattedTags}`;

    btnPublish.disabled = true;

    try {
      if (publishingPost) {
        // 기존 포스트 수정 모드
        showToast("마스토돈에서 글을 수정하는 중...", "sync");

        const updated = await updateStatus({
          id: publishingPost.id,
          statusText: fullStatusText,
          spoilerText: titleVal,
          mediaIds: publishingMedia,
          existingThread: publishingPost.threadChecked
            ? (publishingPost.threadChunks || [])
            : null
        });

        const successMsg = selectedCategory === "tmp"
          ? "글이 #tmp 임시 상태로 수정 저장되었습니다. (사이트 미노출)"
          : `글이 #${selectedCategory} 정식 게시글로 수정되어 사이트에 반영되었습니다!`;

        showToast(successMsg, "task_alt");

        // 캐시 업데이트 및 목록 갱신
        await loadPostsList();

        if (publishingSession !== documentSession) return;
        if (publishingRevision === revision) { clearTimeout(autoSaveTimer); await saveChain; await removeDraft(publishingPost.id); if (publishingSession === documentSession && publishingRevision === revision) { dirty = false; document.getElementById('status-draft').textContent = '수정사항 서버 저장됨'; } }
        // 수정 상태 갱신
        const parsed = parseMastodonStatus(updated);
        currentEditingPost = {
          ...parsed,
          rawStatus: updated,
          threadChunks: updated.sulog_thread_chunks || [],
          threadChecked: true
        };
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
          mediaIds: publishingMedia
        });

        showToast(
          selectedCategory === "tmp"
            ? "발행되었습니다!"
            : "글이 성공적으로 발행되었습니다!", 
          "task_alt"
        );
        
        // 임시저장 데이터 초기화
        const cleared = publishingSession === documentSession && publishingRevision === revision && await clearDraft(publishingSession, publishingRevision);
        if (!cleared && publishingSession === documentSession) {
          currentEditingPost = { ...parseMastodonStatus(result), rawStatus: result, threadChunks: result.sulog_thread_chunks || [], threadChecked: true };
          document.getElementById('edit-mode-banner').style.display = 'flex';
          document.getElementById('editing-post-title').textContent = titleVal;
          document.getElementById('editing-post-id').textContent = result.id;
          document.getElementById('btn-new-post').style.display = 'inline-flex';
          dirty = true; await saveDraft(); await removeDraft(null); updatePublishButtonState();
          showToast('발행 중 추가한 변경사항을 수정 초안에 보존했습니다.', 'info');
        }

        // 목록 새로고침
        await loadPostsList();

        setTimeout(() => {
          if (publishingSession !== documentSession || dirty) return;
          if (publishingCategory === "tmp") {
            showToast("임시 글(#tmp)이 목록에 추가되었습니다. 나중에 태그를 바꿔 게시할 수 있습니다.", "info");
          } else {
            if (confirm("글이 성공적으로 발행되었습니다! 발행된 페이지로 이동하시겠습니까?")) {
              window.location.href = `/${publishingCategory}/?id=${result.id}`;
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
  if (savedState === "false" || (savedState == null && matchMedia("(max-width: 1000px)").matches)) {
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
    } else if (post.category === "page") {
      catBadgeHtml = `<span class="badge-tag" style="background:rgba(52,211,153,.12);color:#a7f3d0;">#page</span>`;
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

async function startEditingPost(post) {
  const request = ++openRequest;
  if (!(await flushBeforeSwitch()) || request !== openRequest) return;
  try {
    const rawStatus = await fetchEditableStatus(post.rawStatus);
    if (request !== openRequest) return;
    Object.assign(post, parseMastodonStatus(rawStatus), { rawStatus,
      threadChunks: rawStatus.sulog_thread_chunks || [], threadChecked: true });
  } catch (error) { if (request === openRequest) showToast(`본문을 불러오지 못했습니다: ${error.message}`, 'error'); return; }
  const draft = await readDraft(post.id).catch(() => null);
  if (request !== openRequest || !(await flushBeforeSwitch()) || request !== openRequest) return;
  documentSession++;
  currentEditingPost = post;

  // 제목, 본문, 태그 채우기
  document.getElementById("input-title").value = post.title || "";
  replaceBody(post.markdown || "");
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

  if (draft) applyDraft(draft);
  if (matchMedia('(max-width: 1000px)').matches) { document.getElementById('posts-sidebar').classList.add('collapsed'); document.getElementById('icon-toggle-sidebar').textContent = 'menu'; }
  dirty = Boolean(draft);
  await dbSet('active-draft', post.id).catch(() => {});
  // 프리뷰 갱신
  updatePreview();

  // 사이드바 카드 하이라이트
  document.querySelectorAll(".post-card").forEach(c => c.classList.remove("active-editing"));
  renderPostsList();

  // 에디터로 포커스
  document.getElementById("input-title").focus();

  const threadMessage = post.threadChunks?.length
    ? ` 타래 ${post.threadChunks.length + 1}개를 하나의 문서로 합쳤습니다.`
    : "";
  showToast(`'${post.title}' 포스트를 수정 모드로 불러왔습니다.${threadMessage}`, "edit_note");
}

async function startNewPost({ skipSave = false } = {}) {
  const request = ++openRequest;
  if (!skipSave && (!(await flushBeforeSwitch()) || request !== openRequest)) return;
  const draft = await readDraft(null).catch(() => null);
  if (request !== openRequest || (!skipSave && !(await flushBeforeSwitch())) || request !== openRequest) return;
  documentSession++;
  currentEditingPost = null;

  // 배너 및 새 글 버튼 숨김
  const editBanner = document.getElementById("edit-mode-banner");
  const btnNewPost = document.getElementById("btn-new-post");
  if (editBanner) editBanner.style.display = "none";
  if (btnNewPost) btnNewPost.style.display = "none";

  // 폼 비우기
  document.getElementById("input-title").value = "";
  replaceBody("");
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
  dirty = false;
  if (draft) applyDraft(draft);
  await dbSet("active-draft", null).catch(() => {});

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
      dirty = false;
      await removeDraft(postId);
      await startNewPost({ skipSave: true });
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
        saveDraft().then(ok => { if (ok) showToast('임시 로컬 저장되었습니다.', 'save'); });
      }
    }
  });
}

function triggerAutoSave() {
  clearTimeout(autoSaveTimer);
  document.getElementById('status-draft').textContent = '변경사항 저장 대기 중...';
  autoSaveTimer = setTimeout(() => saveDraft(), 1000);
}
async function saveDraft() {
  clearTimeout(autoSaveTimer);
  if (!dirty) return true;
  const session = documentSession, version = revision, id = currentEditingPost?.id || null;
  const draft = { id, category: selectedCategory, title: document.getElementById('input-title').value,
    tags: document.getElementById('input-tags').value, markdown: bodyValue(), mediaIds: [...uploadedMediaIds],
    editingPost: currentEditingPost ? { id, title: currentEditingPost.title, category: selectedCategory, threadChecked: false } : null,
    savedAt: Date.now(), revision: version };
  saveChain = saveChain.catch(() => {}).then(async () => {
    await dbSet(draftKey(id), draft); await dbSet('active-draft', id);
  });
  try {
    await saveChain;
    if (session === documentSession && version === revision) {
      dirty = false;
      document.getElementById('status-draft').textContent = `로컬 저장됨 (${new Date(draft.savedAt).toLocaleTimeString()})`;
    }
    return true;
  } catch (error) {
    if (session === documentSession) document.getElementById('status-draft').textContent = '저장 실패 · 변경사항을 보존하고 다시 시도하세요';
    showToast(`초안 저장 실패: ${error.message}`, 'error'); return false;
  }
}
async function flushBeforeSwitch() { while (dirty) { if (!(await saveDraft())) return false; } return true; }
function applyDraft(draft) {
  document.getElementById('input-title').value = draft.title || '';
  document.getElementById('input-tags').value = draft.tags || '';
  replaceBody(draft.markdown || '');
  uploadedMediaIds = draft.mediaIds || uploadedMediaIds;
  selectedCategory = draft.category || 'blog';
  document.querySelectorAll('.cat-opt').forEach(opt => opt.classList.toggle('active', opt.dataset.cat === selectedCategory));
  updatePublishButtonState();
}
async function loadDraft({ resume = false } = {}) {
  try {
    const id = resume ? await dbGet('active-draft') : null;
    const draft = await readDraft(id);
    if (!draft) return;
    currentEditingPost = draft.editingPost || null;
    applyDraft(draft); dirty = false;
    if (currentEditingPost) {
      document.getElementById('edit-mode-banner').style.display = 'flex';
      document.getElementById('editing-post-title').textContent = draft.title || '무제 포스트';
      document.getElementById('editing-post-id').textContent = currentEditingPost.id;
      document.getElementById('btn-new-post').style.display = 'inline-flex';
    }
    updatePreview();
    document.getElementById('status-draft').textContent = '로컬 초안 복원됨';
  } catch (error) { showToast(`초안 복원 실패: ${error.message}`, 'error'); }
}
async function clearDraft(expectedSession = documentSession, expectedRevision = revision) {
  clearTimeout(autoSaveTimer); await saveChain.catch(() => {}); await removeDraft(currentEditingPost?.id);
  if (expectedSession !== documentSession || expectedRevision !== revision) return false;
  dirty = false; documentSession++;
  document.getElementById('input-title').value = '';
  document.getElementById('input-tags').value = ''; replaceBody(''); uploadedMediaIds = [];
  updatePublishButtonState(); updatePreview();
  document.getElementById('status-draft').textContent = '자동 저장 준비됨';
  return true;
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

export const adminReady = initAdminStudio();
