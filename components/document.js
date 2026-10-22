// Source is the single stored value; title/body are derived without rewriting it.
export function inspectDocument(source = '', legacyTitle = '') {
  const first = /\S[^\r\n]*/.exec(source);
  const line = first?.[0] || '';
  const typst = /^=\s+(.+?)\s*$/.exec(line);
  const markdown = /^#[ \t]+(.+?)\s*$/.exec(line);
  if (markdown) markdown[1] = markdown[1].replace(/[ \t]+#+[ \t]*$/, '').trim();
  const heading = typst || markdown;
  return {
    source, hasTitleHeading: Boolean(heading), format: typst ? 'typst' : 'markdown',
    title: heading?.[1] || legacyTitle || (line && !line.startsWith('#') ? line.slice(0, 80) : ''),
    // Typst title is displayed by the page. Markdown headings retain normal semantics.
    body: typst ? source.slice(first.index + line.length).replace(/^\r?\n/, '') : source
  };
}

