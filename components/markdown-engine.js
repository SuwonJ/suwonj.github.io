import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import katex from 'katex';
import { normalizeMarkdownMath, renderDisplayMath } from './content-dependencies.js';
const engine = new Marked(markedKatex({ throwOnError: false, nonStandard: true }));
function prepareMath(text) {
  return renderDisplayMath(normalizeMarkdownMath(text), tex =>
    katex.renderToString(tex, { throwOnError: false, displayMode: true }));
}
export function renderMarkdown(text) { return engine.parse(prepareMath(text)); }

export function renderMarkdownBlocks(text) {
  const tokens = engine.lexer(prepareMath(text));
  return tokens.map(token => engine.parser(Object.assign([token], { links: tokens.links }))).filter(Boolean);
}
