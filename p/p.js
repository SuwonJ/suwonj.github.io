import { fetchPostById } from '../components/mastodon.js';

function showError(message) {
  const title = document.getElementById('page-title');
  const tagContainer = document.getElementById('tag-container');
  const content = document.getElementById('content');

  if (title) title.textContent = '페이지를 열 수 없습니다';
  if (tagContainer) tagContainer.innerHTML = '';
  if (content) content.innerHTML = `<p style="color:#fc5c65;">${message}</p>`;
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

    // 실제 렌더링은 기존 blog 상세 페이지 코드를 그대로 사용한다.
    // /p/?id=... 주소는 유지되며 blog.js가 현재 URL의 id를 읽어 렌더링한다.
    await import('/blog/blog.js');
  } catch (error) {
    console.error(error);
    showError('문서를 불러오는 중 오류가 발생했습니다.');
  }
}

init();
