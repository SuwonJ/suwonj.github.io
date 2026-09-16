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

export async function fetchPostById(id) {
  try {
    const res = await fetch(`${INSTANCE_URL}/api/v1/statuses/${id}`);
    if (!res.ok) throw new Error("Failed to fetch status");
    const status = await res.json();
    return parseMastodonStatus(status);
  } catch (err) {
    console.error(`Failed to fetch post ${id}:`, err);
    return null;
  }
}

export async function fetchPostComments(id) {
  try {
    const res = await fetch(`${INSTANCE_URL}/api/v1/statuses/${id}/context`);
    if (!res.ok) throw new Error("Failed to fetch status context");
    const context = await res.json();
    const descendants = context.descendants || [];
    return descendants.map(reply => ({
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
 * 마스토돈 툿을 블로그/연구/링크 페이지용 마크다운 및 메타데이터로 정제하는 함수
 */
export function parseMastodonStatus(status) {
  const rawHtml = status.content || "";
  const allTags = (status.tags || []).map(t => t.name);

  // 카테고리 태그 식별 (#blog, #research, #page, #tmp)
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

  // 화면 표시용 순수 주제 태그 (카테고리 및 임시 태그 제외)
  const displayTags = allTags.filter(
    t => !categoryTags.includes(t.toLowerCase())
  );

  // DOMParser로 HTML 본문 텍스트 복원
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

  // 본문 안의 모든 해시태그 <a> 태그 완전히 제거 (본문에서 태그 문구 노출 방지)
  doc.querySelectorAll('a.hashtag').forEach(a => a.remove());

  // <br> -> \n, <p> -> \n\n 처리로 줄바꿈 복원
  doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  doc.querySelectorAll('p').forEach(p => {
    p.insertAdjacentText('afterend', '\n\n');
  });

  let plainText = doc.body.textContent || "";

  // HTML 엔티티 복원
  const txtDecoder = document.createElement("textarea");
  txtDecoder.innerHTML = plainText;
  let markdownText = txtDecoder.value.trim();

  // 본문 텍스트 내에 쌩 텍스트로 남아있는 해시태그(#tag) 패턴 제거
  markdownText = markdownText.replace(/(^|\s)#[^\s#]+/g, '').trim();

  // ----------------------------------------------------
  // 제목(Title) 추출 스키마
  // ----------------------------------------------------
  let title = "";

  // 1순위: 마스토돈 CW (Content Warning / 내용 경고 입력란)
  if (status.spoiler_text && status.spoiler_text.trim().length > 0) {
    title = status.spoiler_text.trim();
  }

  const lines = markdownText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // 2순위: 본문 첫 줄에서 "Title: 제목" 또는 "[제목]" 형식
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

  if (!title) {
    title = "무제 포스트";
  }

  return {
    id: status.id,
    title: title,
    markdown: markdownText,
    date: status.created_at ? status.created_at.split("T")[0] : "",
    tags: displayTags,
    allTags: allTags,
    isDraft: isDraft,
    category: category,
    visibility: status.visibility || "public",
    media: status.media_attachments || [],
    url: status.url,
    favouritesCount: status.favourites_count || 0,
    reblogsCount: status.reblogs_count || 0,
    repliesCount: status.replies_count || 0,
  };
}
