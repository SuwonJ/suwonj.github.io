import { fetchPostsByTag } from './mastodon.js';
import { escapeHtml } from './safe-html.js';

export async function renderPostList(container, { tag, route, title, emptyText, showAll = true }) {
  try {
    const breadcrumb = document.getElementById("nav-breadcrumb");
    if (breadcrumb) breadcrumb.innerHTML = "";

    const titleEl = document.getElementById("page-title");
    if (titleEl) titleEl.innerText = title;

    const allPosts = await fetchPostsByTag(tag);
    const posts = allPosts.filter(p => !p.isDraft);

    if (posts.length === 0) {
      container.innerHTML = `
        <div style="padding: 3rem 0; text-align: center; font-family: monospace; color: var(--breadcrumb-color, #888);">
          <p style="font-size: 1.1rem;">${escapeHtml(emptyText)}</p>
        </div>
      `;
      return;
    }

    const allTags = new Set();
    posts.forEach(p => p.tags.forEach(t => allTags.add(t)));
    const tagsArray = Array.from(allTags);

    const urlParams = new URLSearchParams(window.location.search);
    const activeTags = urlParams.get("tags") ? urlParams.get("tags").split(",") : [];

    const tagHtml = `
        <div class="tag-list">
            ${showAll ? `<span class="tag ${activeTags.length === 0 ? "active" : ""}" data-tag="">All</span> /` : ''} 
            ${tagsArray.map(tag => `
              <span class="tag ${activeTags.includes(tag) ? "active" : ""}" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</span>
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
          renderPostList(container, { tag, route, title, emptyText, showAll });
        });
      });
    }

    const filteredPosts = posts.filter(post => {
      if (activeTags.length === 0) return true;
      return activeTags.some(t => post.tags.includes(t));
    });

    const listItems = filteredPosts.map(post => `
      <li style="margin-bottom: 1.2rem; list-style: none;">
        <div style="display:flex; justify-content:space-between; align-items:baseline; gap:1rem;">
          <a href="${route}?id=${post.id}" style="color:var(--text-color); text-decoration:none; font-weight:bold; font-size:1.1rem;" class="blog-post-link">
            ${escapeHtml(post.title)}
          </a>
          <span style="font-size:0.85rem; color:var(--breadcrumb-color, #888); font-family:monospace; white-space:nowrap;">
            (${escapeHtml(post.date)})
          </span>
        </div>
      </li>
    `).join("");

    container.innerHTML = `
      <ul style="padding-left: 0; margin-top: 1.5rem;">
        ${listItems}
      </ul>
    `;

  } catch (error) {
    container.innerHTML = `<p style="color:#fc5c65;">${escapeHtml(error.message)}</p>`;
  }
}

