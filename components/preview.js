import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { renderMarkdownBlocks } from './markdown-engine.js';
let worker, workerUnavailable = false, sequence = 0, pending = new Map();
export function parsePreview(text) {
  if (!window.Worker || workerUnavailable) return Promise.resolve(renderMarkdownBlocks(text));
  if (!worker) {
    try { worker = new Worker('/assets/preview-worker.js?v=20', { type: 'module' }); }
    catch { workerUnavailable = true; return Promise.resolve(renderMarkdownBlocks(text)); }
    worker.onmessage = ({ data }) => {
      const request = pending.get(data.id); if (!request) return;
      pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error)); else request.resolve(data.blocks);
    };
    worker.onerror = error => {
      worker.terminate(); worker = null; workerUnavailable = true;
      for (const request of pending.values()) { try { request.resolve(renderMarkdownBlocks(request.text)); } catch (error) { request.reject(error); } }
      pending.clear();
    };
  }
  return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject, text }); worker.postMessage({ id, text }); });
}
export async function commitPreview(root, blocks, isCurrent, { force = false } = {}) {
  let cursor = root.firstChild, sliceStart = performance.now();
  const highlightBlocks = [];
  for (const html of blocks) {
    if (!isCurrent()) return false;
    const template = document.createElement('template');
    template.innerHTML = DOMPurify.sanitize(html, { ADD_TAGS: ['annotation', 'semantics'], ADD_ATTR: ['encoding'] });
    for (const table of template.content.querySelectorAll('table')) {
      const wrapper = document.createElement('div'); wrapper.className = 'table-wrapper';
      table.replaceWith(wrapper); wrapper.append(table);
    }
    for (const img of template.content.querySelectorAll('img')) { img.loading = force ? 'eager' : 'lazy'; img.decoding = 'async'; }
    for (const block of template.content.querySelectorAll('pre code')) {
      const language = block.className.match(/language-([\w-]+)/)?.[1];
      if (language) block.parentElement.dataset.lang = language.toUpperCase();
    }
    for (const next of Array.from(template.content.childNodes)) {
      let kept = next;
      // Ignore syntax highlighter DOM when comparing unchanged code blocks.
      const equal = (old, desired) => old?.isEqualNode(desired) || (old?.nodeName === 'PRE' && desired.nodeName === 'PRE' &&
        old.textContent === desired.textContent && old.querySelector('code')?.className.replace(/\bhljs\b/g, '').trim() === desired.querySelector('code')?.className.trim());
      if (equal(cursor, next)) { kept = cursor; cursor = cursor.nextSibling; }
      else if (equal(cursor?.nextSibling, next)) { const old = cursor; kept = cursor.nextSibling; cursor = kept.nextSibling; old.remove(); }
      else { root.insertBefore(next, cursor); if (cursor) { const old = cursor; cursor = cursor.nextSibling; old.remove(); } }
      if (kept.nodeType === 1) highlightBlocks.push(...kept.querySelectorAll('pre code:not([data-highlighted])'));
    }
    if (performance.now() - sliceStart > 8) { await new Promise(resolve => setTimeout(resolve, 0)); sliceStart = performance.now(); }
  }
  if (!isCurrent()) return false;
  while (cursor) { const next = cursor.nextSibling; cursor.remove(); cursor = next; }
  const highlight = block => {
    if (!block.isConnected || !isCurrent()) return;
    // Only known languages: avoid expensive auto detection on huge code blocks.
    const language = block.className.match(/language-([\w-]+)/)?.[1];
    if (language && hljs.getLanguage(language)) hljs.highlightElement(block);
  };
  for (const block of highlightBlocks) {
    if (force) { highlight(block); await new Promise(resolve => setTimeout(resolve, 0)); continue; }
    if (window.IntersectionObserver) {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect(); setTimeout(() => highlight(block), 0);
      }, { root: document.getElementById('preview-body'), rootMargin: '200px' });
      observer.observe(block); setTimeout(() => observer.disconnect(), 10000);
    }
  }
  return true;
}
