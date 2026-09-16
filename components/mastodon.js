const INSTANCE_URL = "https://maximux.suwonmars.com";
const ACCOUNT_ID = "116979319977947616";
const THREAD_MARKER = "\u2063\u2063";
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

function rawStatusText(status) {
  const doc = new DOMParser().parseFromString(status?.content || '', 'text/html');
  return doc.body.textContent || '';
}

function isDocumentChunk(status) {
  return rawStatusText(status).trimStart().startsWith(THREAD_MARKER);
}

function statusContentToMarkdown(status, { removeTags = true } = {}) {
  const rawHtml = status?.content || "";
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

  if (removeTags) {
    doc.querySelectorAll('a.hashtag').forEach(a => a.remove());
  }

  doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  doc.querySelectorAll('p').forEach(p => {
    p.insertAdjacentText('afterend', '\n\n');
  });

  let plainText = doc.body.textContent || "";
  plainText = plainText.split(THREAD_MARKER).join('');

  const txtDecoder = document.createElement("textarea");
  txtDecoder.innerHTML = plainText;
  let markdownText = txtDecoder.value.trim();

  if (removeTags) {
    markdownText = markdownText.replace(/(^|\s)#[^\s#]+/g, '').trim();
  }

  return markdownText;
}

function buildDocumentThreadChain(rootStatus, descendants = []) {
  const accountId = String(rootStatus?.account?.id || '');
  const chain = [];
  const used = new Set();
  let parentId = String(rootStatus?.id || '');

  while (parentId) {
    const candidates = descendants
      .filter(status => !used.has(String(status.id)))
      .filter(status => String(status.in_reply_to_id || '') === parentId)
      .filter(status => String(status.account?.id || '') === accountId)
      .filter(isDocumentChunk)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    if (!candidates.length) break;
    const next = candidates[0];
    chain.push(next);
    used.add(String(next.id));
    parentId = String(next.id);
  }

  return chain;
}

async function fetchRawStatusAndContext(id) {
  const [statusRes, contextRes] = await Promise.all([
    fetch(`${INSTANCE_URL}/api/v1/statuses/${id}`),
    fetch(`${INSTANCE_URL}/api/v1/statuses/${id}/context`)
  ]);

  if (!statusRes.ok) throw new Error("Failed to fetch status");
  const status = await statusRes.json();
  const context = contextRes.ok ? await contextRes.json() : { descendants: [] };
  return { status, context };
}

export async function fetchPostById(id) {
  try {
    const { status, context } = await fetchRawStatusAndContext(id);
    const post = parseMastodonStatus(status);
    const thread = buildDocumentThreadChain(status, context.descendants || []);

    if (thread.length > 0) {
      const chunks = thread
        .map(reply => statusContentToMarkdown(reply, { removeTags: false }))
        .filter(Boolean);
      if (chunks.length > 0) {
        post.markdown = [post.markdown, ...chunks].filter(Boolean).join('\n\n');
      }
      post.threadChunkIds = thread.map(reply => reply.id);
      post.threadLength = thread.length + 1;
    } else {
      post.threadChunkIds = [];
      post.threadLength = 1;
    }

    return post;
  } catch (err) {
    console.error(`Failed to fetch post ${id}:`, err);
    return null;
  }
}

export async function fetchPostComments(id) {
  try {
    const { status, context } = await fetchRawStatusAndContext(id);
    const descendants = context.descendants || [];
    const documentThread = buildDocumentThreadChain(status, descendants);
    const chunkIds = new Set(documentThread.map(reply => String(reply.id)));

    return descendants
      .filter(reply => !chunkIds.has(String(reply.id)))
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
    "blog", "research", "page", "link", "tmp", "draft",
    "블로그", "연구", "페이지", "링크", "임시", "temp"
  ];
  const tmpTags = ["tmp", "draft", "임시", "temp"];
  const pageTags = ["page", "link", "페이지", "링크"];

  let category = "blog";
  if (allTags.some(t => tmpTags.includes(t.toLowerCase()))) {
    category = "tmp";
  } else if (allTags.some(t => pageTags.includes(t.toLowerCase()))) {
    category = "page";
  } else if (allTags.some(t => ["research", "연구"].includes(t.toLowerCase()))) {
    category = "research";
  } else if (allTags.some(t => ["blog", "블로그"].includes(t.toLowerCase()))) {
    category = "blog";
  }

  const isDraft = category === "tmp" || allTags.some(t => tmpTags.includes(t.toLowerCase()));
  const displayTags = allTags.filter(t => !categoryTags.includes(t.toLowerCase()));
  let markdownText = statusContentToMarkdown(status, { removeTags: true });

  let title = "";
  if (status.spoiler_text && status.spoiler_text.trim().length > 0) {
    title = status.spoiler_text.trim();
  }

  const lines = markdownText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (!title && lines.length > 0) {
    const firstLine = lines[0];

    if (/^title\s*:\s*/i.test(firstLine)) {
      title = firstLine.replace(/^title\s*:\s*/i, '').trim();
      lines.shift();
      markdownText = lines.join('\n').trim();
    } else if (/^\[.+\]$/.test(firstLine)) {
      title = firstLine.substring(1, firstLine.length - 1).trim();
      lines.shift();
      markdownText = lines.join('\n').trim();
    } else if (!firstLine.startsWith('#')) {
      title = firstLine;
      if (title.length > 50) {
        title = title.substring(0, 50) + "...";
      } else {
        lines.shift();
        markdownText = lines.join('\n').trim();
      }
    }
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
