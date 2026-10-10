import { stripMetadataTags } from './editor-tools.js?v=20';
import { fetchDocumentStructure, internalStatusKind, removeInternalMarker } from './mastodon_document.js?v=21';

const INSTANCE_URL = "https://maximux.suwonmars.com";
const ACCOUNT_ID = "116979319977947616";
const postsByTag = new Map();

export async function fetchPostsByTag(tag) {
  if (postsByTag.has(tag)) return postsByTag.get(tag);

  const url = `${INSTANCE_URL}/api/v1/accounts/${ACCOUNT_ID}/statuses?exclude_reblogs=true&limit=40&tagged=${encodeURIComponent(tag)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch statuses");
    const statuses = await res.json();
    const posts = statuses.map(parseMastodonStatus);
    postsByTag.set(tag, posts);
    return posts;
  } catch (err) {
    console.error(`Failed to fetch posts for tag ${tag}:`, err);
    return [];
  }
}

function statusContentToMarkdown(status, { removeTags = true } = {}) {
  if (status.sulog_source_text == null && status.sulog_root_content != null) {
    const root = statusContentToMarkdown(
      { ...status, content: status.sulog_root_content, sulog_root_content: null },
      { removeTags }
    );
    return [root, ...(status.sulog_thread_chunks || []).map(chunk => chunk.text)].join('\n\n');
  }
  const doc = new DOMParser().parseFromString(status?.content || '', 'text/html');
  doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  doc.querySelectorAll('p').forEach(p => p.insertAdjacentText('afterend', '\n\n'));

  let markdown = status.sulog_source_text ?? removeInternalMarker(doc.body.textContent || '');
  // Only remove the final system metadata paragraph. Inline hashtags and code
  // are authored content and must never be stripped with a broad regex.
  if (removeTags && status.sulog_source_text == null) {
    markdown = stripMetadataTags(markdown, (status.tags || []).map(tag => tag.name));
  }
  return markdown;
}

async function fetchRawStatus(id) {
  const res = await fetch(`${INSTANCE_URL}/api/v1/statuses/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch status (${res.status})`);
  return res.json();
}

export async function fetchPostById(id) {
  try {
    const status = await fetchRawStatus(id);
    const post = parseMastodonStatus(status);
    const { textStatuses } = await fetchDocumentStructure(id, {
      instanceUrl: INSTANCE_URL,
      accountId: status.account?.id
    });
    const chunks = textStatuses.map(reply => statusContentToMarkdown(reply, { removeTags: false }));
    post.markdown = [post.markdown, ...chunks].filter(Boolean).join('\n\n');
    post.threadChunkIds = textStatuses.map(reply => reply.id);
    post.threadLength = textStatuses.length + 1;
    return post;
  } catch (err) {
    console.error(`Failed to fetch post ${id}:`, err);
    return null;
  }
}

export async function fetchPostComments(id) {
  try {
    const status = await fetchRawStatus(id);
    const contextRes = await fetch(`${INSTANCE_URL}/api/v1/statuses/${id}/context`);
    if (!contextRes.ok) throw new Error('Failed to fetch comments');
    const context = await contextRes.json();
    return (context.descendants || [])
      .filter(reply => !(
        String(reply.account?.id || '') === String(status.account?.id || '')
        && internalStatusKind(reply)
      ))
      .map(reply => ({
        id: reply.id,
        url: reply.url,
        createdAt: new Date(reply.created_at).toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        }),
        account: {
          username: reply.account.username,
          acct: reply.account.acct,
          displayName: reply.account.display_name || reply.account.username,
          avatar: reply.account.avatar_static || reply.account.avatar,
          url: reply.account.url
        },
        contentHtml: reply.content || "",
        media: (reply.media_attachments || []).map(m => ({
          type: m.type,
          url: m.url || m.preview_url,
          description: m.description
        }))
      }));
  } catch (err) {
    console.error(`Failed to fetch comments for ${id}:`, err);
    return [];
  }
}

/**
 * 마스토돈 root 툿을 블로그/연구/링크 페이지용 마크다운 및 메타데이터로 정제하는 함수.
 * 긴 문서의 reply chunk 결합은 fetchPostById()가 담당한다.
 */
export function parseMastodonStatus(status) {
  const allTags = (status.tags || []).map(t => t.name);

  const categoryTags = [
    "blog", "research", "page", "link", "personal", "개인", "tmp", "draft",
    "블로그", "연구", "페이지", "링크", "임시", "temp"
  ];
  const tmpTags = ["tmp", "draft", "임시", "temp"];
  const pageTags = ["page", "link", "페이지", "링크"];
  const personalTags = ["personal", "개인"];

  let category = "blog";
  if (allTags.some(t => tmpTags.includes(t.toLowerCase()))) {
    category = "tmp";
  } else if (allTags.some(t => pageTags.includes(t.toLowerCase()))) {
    category = "page";
  } else if (allTags.some(t => personalTags.includes(t.toLowerCase()))) {
    category = "personal";
  } else if (allTags.some(t => ["research", "연구"].includes(t.toLowerCase()))) {
    category = "research";
  } else if (allTags.some(t => ["blog", "블로그"].includes(t.toLowerCase()))) {
    category = "blog";
  }

  const isDraft = category === "tmp" || allTags.some(t => tmpTags.includes(t.toLowerCase()));
  const displayTags = allTags.filter(t => !categoryTags.includes(t.toLowerCase()));
  // OAuth editing supplies raw Mastodon /source Markdown; display HTML is lossy.
  let markdownText = typeof status.sulog_source_text === 'string'
    ? status.sulog_source_text
    : statusContentToMarkdown(status, { removeTags: true });

  let title = "";
  if (status.spoiler_text && status.spoiler_text.trim().length > 0) {
    title = status.spoiler_text.trim();
  }

  // Extract a legacy title without trimming/rebuilding the remaining document.
  const first = /^(?:[ \t]*\n)*([^\n]+)(?:\n|$)/.exec(markdownText);
  if (!title && first) {
    const line = first[1].trim();
    const explicit = /^title\s*:\s*/i.test(line) || /^\[.+\]$/.test(line);
    if (explicit) {
      title = /^title\s*:/i.test(line) ? line.replace(/^title\s*:\s*/i, '') : line.slice(1, -1);
      markdownText = markdownText.slice(first[0].length);
    } else if (!line.startsWith('#')) title = line.length > 50 ? line.slice(0, 50) + '...' : line;
  }

  if (!title) title = "무제 포스트";

  return {
    id: status.id,
    title,
    markdown: markdownText,
    date: status.created_at ? status.created_at.split("T")[0] : "",
    tags: displayTags,
    allTags,
    isDraft,
    category,
    visibility: status.visibility || "public",
    media: status.media_attachments || [],
    url: status.url,
    accountId: status.account?.id || null,
    favouritesCount: status.favourites_count || 0,
    reblogsCount: status.reblogs_count || 0,
    repliesCount: status.replies_count || 0,
  };
}
