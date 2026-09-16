import { fetchPostById } from '../components/mastodon.js';
import { ensureCodeHighlighting, ensureMarkdown } from '../components/content-dependencies.js';

function showError(message) {
  const title = document.getElementById('page-title');
  const meta = document.getElementById('page-meta');
  const content = document.getElementById('content');
  if (title) title.textContent = '페이지를 열 수 없습니다';
  if (meta) meta.innerHTML = '';
  if (content) content.innerHTML = `<div class="page-error">${message}</div>`;
}

function escapeHtml(text = '') {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function copyCurrentLink(button) {
  try {
    await navigator.clipboard.writeText(window.location.href);
    const original = button.textContent;
    button.textContent = 'COPIED';
    setTimeout(() => { button.textContent = original; }, 1300);
  } catch {
    window.prompt('링크 복사', window.location.href);
  }
}

async function renderPage(post) {
  const titleEl = document.getElementById('page-title');
  const metaEl = document.getElementById('page-meta');
  const contentEl = document.getElementById('content');

  document.title = post.title || '링크 페이지';
  titleEl.textContent = post.title || '무제 페이지';

  const tagHtml = (post.tags || []).map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join(' ');
  metaEl.innerHTML = `
    ${post.date ? `<span>${escapeHtml(post.date)}</span>` : ''}
    ${post.date && tagHtml ? '<span>·</span>' : ''}
    ${tagHtml}
    ${(post.date || tagHtml) ? '<span>·</span>' : ''}
    <span>링크 전용</span>
    <button type="button" class="copy-link" id="copy-link">COPY LINK</button>
  `;
  document.getElementById('copy-link')?.addEventListener('click', event => copyCurrentLink(event.currentTarget));

  let markdownText = post.markdown || '';
  markdownText = markdownText.replace(/==([^=]+)==/g, '<mark>$1</mark>');
  markdownText = markdownText.replace(/([^\n])\s*\$\$/g, '$1\n\n$$$$');
  markdownText = markdownText.replace(/\$\$\s*([^\n])/g, '$$$$\n\n$1');

  await ensureMarkdown(markdownText);
  contentEl.innerHTML = window.marked.parse(markdownText);

  if (post.media?.length) {
    const gallery = document.createElement('div');
    gallery.className = 'media-gallery';
    post.media.forEach(media => {
      if (media.type === 'image') {
        const img = document.createElement('img');
        img.src = media.url;
        img.alt = media.description || '';
        img.loading = 'lazy';
        img.decoding = 'async';
        gallery.appendChild(img);
      } else if (media.type === 'video' || media.type === 'gifv') {
        const video = document.createElement('video');
        video.src = media.url;
        video.controls = true;
        video.preload = 'metadata';
        gallery.appendChild(video);
      }
    });
    contentEl.appendChild(gallery);
  }

  contentEl.querySelectorAll('table').forEach(table => {
    if (table.parentElement?.classList.contains('table-wrapper')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });

  const codeBlocks = Array.from(contentEl.querySelectorAll('pre code'));
  if (codeBlocks.length) await ensureCodeHighlighting();
  codeBlocks.forEach(block => {
    if (window.hljs) window.hljs.highlightElement(block);
    const pre = block.parentElement;
    if (!pre) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-copy-btn';
    button.textContent = 'COPY';
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(block.innerText);
        button.textContent = 'COPIED';
        setTimeout(() => { button.textContent = 'COPY'; }, 1200);
      } catch {}
    });
    pre.appendChild(button);
  });
}

async function init() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) {
    showError('이 페이지는 고유 링크가 있어야 열 수 있습니다.');
    return;
  }

  try {
    const post = await fetchPostById(id);
    if (!post || post.category !== 'page') {
      showError('유효한 링크 페이지가 아니거나 삭제된 문서입니다.');
      return;
    }
    await renderPage(post);
  } catch (error) {
    console.error(error);
    showError('문서를 불러오는 중 오류가 발생했습니다.');
  }
}

init();
