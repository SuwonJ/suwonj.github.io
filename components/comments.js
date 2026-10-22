import { fetchPostComments } from "./mastodon.js?v=27";
import { sanitizeUntrustedHtml } from './content-dependencies.js';
import { escapeHtml, safeHttpUrl } from './safe-html.js';

export function commentsPlaceholder() {
  return `
    <div class="mastodon-comments-section" data-comments-root style="margin-top:4rem; padding-top:1.8rem; border-top:1px solid var(--toc-border, #333);">
      <div style="padding:1rem 0; font-family:monospace; font-size:0.85rem; color:var(--breadcrumb-color, #888);">
        댓글 불러오는 중...
      </div>
    </div>
  `;
}

export async function renderComments(postId, post, target) {
  const comments = await fetchPostComments(postId);

  target.innerHTML = await sanitizeUntrustedHtml(`
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; font-family:monospace;">
      <div style="display:flex; align-items:center; gap:0.8rem;">
        <span style="font-size:0.9rem; font-weight:bold; color:var(--text-color); display:inline-flex; align-items:center; gap:0.4rem;">
          <span class="material-symbols-outlined" style="font-size:18px;">chat_bubble</span>
          <span>${comments.length}</span>
        </span>
        <a href="${escapeHtml(safeHttpUrl(post.url))}" target="_blank" rel="noopener noreferrer" title="Maximux에서 댓글 작성" style="font-size:0.85rem; color:var(--breadcrumb-color, #aaa); text-decoration:none; display:inline-flex; align-items:center;">
          <span class="material-symbols-outlined" style="font-size:18px;">add</span>
        </a>
      </div>
    </div>

    ${comments.length === 0 ? `
      <div style="padding:1rem 0; font-family:monospace; font-size:0.85rem; color:var(--breadcrumb-color, #888);">
        아직 작성된 댓글이 없습니다. <a href="${escapeHtml(safeHttpUrl(post.url))}" target="_blank" rel="noopener noreferrer" style="color:var(--text-color); text-decoration:underline;">+ 첫 댓글 작성하기 ↗</a>
      </div>
    ` : `
      <div class="comments-list" style="display:flex; flex-direction:column;">
        ${comments.map((comment, index) => {
          const fullAccount = comment.account.acct.includes("@")
            ? `@${comment.account.acct}`
            : `@${comment.account.acct}@maximux.suwonmars.com`;

          return `
            <div class="thread-connector-line" style="width:2px; height:24px; background:var(--toc-border, #333); margin-left:17px; margin-top:${index === 0 ? "0.2rem" : "0.6rem"}; margin-bottom:0.6rem;"></div>
            <div class="comment-item">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.6rem;">
                <div style="display:flex; align-items:center; gap:0.75rem;">
                  <img src="${escapeHtml(safeHttpUrl(comment.account.avatar))}" alt="${escapeHtml(comment.account.displayName)}" loading="lazy" decoding="async" style="width:36px; height:36px; border-radius:50%; object-fit:cover; flex-shrink:0;" />
                  <div style="display:flex; flex-direction:column; line-height:1.3; font-family:monospace;">
                    <a href="${escapeHtml(safeHttpUrl(comment.account.url))}" target="_blank" rel="noopener noreferrer" style="color:var(--text-color); font-weight:bold; text-decoration:none; font-size:0.9rem;">
                      ${escapeHtml(comment.account.displayName)}
                    </a>
                    <span style="color:var(--breadcrumb-color, #888); font-size:0.78rem;">${escapeHtml(fullAccount)}</span>
                  </div>
                </div>
                <span style="color:var(--breadcrumb-color, #888); font-size:0.75rem; font-family:monospace;">${escapeHtml(comment.createdAt)}</span>
              </div>
              <div class="comment-body" style="line-height:1.6; color:var(--text-color); font-size:0.92rem; padding-left:2.85rem;">
                ${comment.contentHtml}
              </div>
              ${comment.media.length > 0 ? `
                <div style="display:flex; gap:0.5rem; margin-top:0.6rem; padding-left:2.85rem;">
                  ${comment.media.map(media => `<img src="${escapeHtml(safeHttpUrl(media.url))}" alt="${escapeHtml(media.description || "")}" loading="lazy" decoding="async" style="max-width:160px; max-height:160px; border-radius:6px;" />`).join("")}
                </div>
              ` : ""}
            </div>
          `;
        }).join("")}
      </div>
    `}
  `);
}
