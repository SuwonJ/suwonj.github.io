import { renderMarkdownBlocks } from './markdown-engine.js';
self.onmessage = ({ data: { id, text } }) => {
  try { self.postMessage({ id, blocks: renderMarkdownBlocks(text) }); }
  catch (error) { self.postMessage({ id, error: error.message }); }
};
