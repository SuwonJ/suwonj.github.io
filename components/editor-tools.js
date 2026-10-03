export function formatText(cmd, selected = '') {
  const pairs = {
    bold: ['**', '**', 'bold text'], italic: ['*', '*', 'italic text'],
    strike: ['~~', '~~', 'strikethrough'], highlight: ['==', '==', 'highlight text'],
    h1: ['# ', '\n', 'Heading 1'], h2: ['## ', '\n', 'Heading 2'], h3: ['### ', '\n', 'Heading 3'],
    code: ['\n```python\n', '\n```\n', '# code here'], quote: ['\n> ', '\n', 'quote text'],
    math: ['\n$$\n', '\n$$\n', 'f(x) = \\int x dx'], link: ['[', '](https://example.com)', 'link text']
  };
  const pair = pairs[cmd];
  if (!pair) return null;
  const [before, after, placeholder] = pair;
  return { insert: before + (selected || placeholder) + after,
    from: before.length, to: before.length + (selected || placeholder).length };
}
export function stripMetadataTags(text, tags = []) {
  const categories = new Set(['blog', 'research', 'page', 'link', 'tmp', 'draft', '블로그', '연구', '페이지', '링크', '임시', 'temp']);
  const allowed = new Set(tags.map(tag => String(tag).toLowerCase()));
  // Metadata is a final standalone hashtag paragraph, never comments inside code.
  return text.replace(/\n\s*\n(#[\p{L}\p{N}_]+(?:[ \t]+#[\p{L}\p{N}_]+)*)[ \t\n]*$/u, (match, block) => {
    const names = block.split(/\s+/).map(tag => tag.slice(1).toLowerCase());
    return names.some(name => categories.has(name)) && names.every(name => allowed.has(name)) ? '' : match;
  });
}
