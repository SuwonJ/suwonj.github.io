import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import { normalizeMarkdownMath } from './content-dependencies.js';
const engine = new Marked(markedKatex({ throwOnError: false, nonStandard: true }));
export function renderMarkdown(text) { return engine.parse(normalizeMarkdownMath(text)); }

export function renderMarkdownBlocks(text) {
  const tokens = engine.lexer(normalizeMarkdownMath(text));
  return tokens.map(token => engine.parser(Object.assign([token], { links: tokens.links }))).filter(Boolean);
}
