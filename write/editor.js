import { EditorView, basicSetup } from 'codemirror';
import { Decoration, WidgetType, ViewPlugin, keymap, placeholder } from '@codemirror/view';
import { Compartment, EditorState, StateField, StateEffect, EditorSelection } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import katex from 'katex';
import { formatText } from '../components/editor-tools.js';
import { mathMarkdown } from './math-parser.js';
const MODE_KEY = 'sulog_write_editor_mode';
const VALID_MODES = new Set(['split', 'source', 'live', 'preview']);
function injectStyles() {
  if (document.getElementById('sulog-codemirror-style')) return;
  const style = document.createElement('style');
  style.id = 'sulog-codemirror-style';
  style.textContent = `
    #editor-textarea { display: none !important; }
    .editor-container { padding: 0 !important; min-height: 0; cursor: text; }
    #cm-editor-host { height: 100%; min-height: 0; overflow: hidden; cursor: text; }
    #cm-editor-host .cm-editor { height: 100%; background: var(--bg-main); color: var(--text-main); }
    #cm-editor-host .cm-scroller { overflow: auto; font-family: var(--font-code); line-height: 1.62; cursor: text; }
    #cm-editor-host .cm-content { padding: 1.35rem 1.4rem 8rem; caret-color: var(--accent-blue); min-height: 100%; }
    #cm-editor-host .cm-line { padding: 0 2px; }
    #cm-editor-host .cm-gutters { background: #111827; color: #64748b; border-right: 1px solid var(--border-color); }
    #cm-editor-host .cm-selectionBackground,
    #cm-editor-host .cm-editor.cm-focused .cm-selectionBackground,
    #cm-editor-host .cm-selectionLayer .cm-selectionBackground,
    #cm-editor-host ::selection { background: rgba(56,189,248,.38) !important; }
    #cm-editor-host .cm-cursor { border-left-color: var(--accent-blue); }
    #cm-editor-host .cm-focused { outline: none; }

    .write-mode-switch { margin-left: auto; display: inline-flex; gap: 2px; padding: 2px; flex-shrink: 0; background: var(--bg-main); border: 1px solid var(--border-color); border-radius: 6px; }
    .write-mode-btn { border: 0; background: transparent; color: var(--text-muted); padding: .25rem .55rem; border-radius: 4px; font: inherit; font-size: .74rem; cursor: pointer; }
    .write-mode-btn:hover { color: var(--text-main); background: var(--bg-hover); }
    .write-mode-btn.active { color: #0f172a; background: var(--accent-blue); font-weight: 700; }

    body.write-mode-preview .workspace > .pane:nth-of-type(1) { display: none !important; }
    body.write-mode-preview .workspace > .pane:last-child { display: flex !important; }
    body.write-mode-source .workspace > .pane:last-child,
    body.write-mode-live .workspace > .pane:last-child { display: none !important; }
    body.write-mode-source .workspace > .pane:nth-of-type(1),
    body.write-mode-live .workspace > .pane:nth-of-type(1) { border-right: 0; }

    body.write-mode-live .workspace > .pane:nth-of-type(1),
    body.write-mode-live #cm-editor-host .cm-editor,
    body.write-mode-live #cm-editor-host .cm-scroller { background: #121212; }
    body.write-mode-live #cm-editor-host .cm-content {
      width: calc(100% - 3rem);
      max-width: 800px;
      margin: 0 auto;
      padding: 3rem 0 8rem;
      font-family: var(--font-gothic);
      font-size: 17px;
      line-height: 1.8;
      color: #e0e0e0;
    }
    body.write-mode-live #cm-editor-host .cm-gutters { display: none; }
    body.write-mode-live .config-bar { background: #121212; }
    body.write-mode-live .config-bar > * { width: min(800px, calc(100% - 3rem)); margin-left: auto; margin-right: auto; }
    body.write-mode-live .input-title { font-size: 2rem; line-height: 1.2; }
    .cm-live-h1 { font-size: 2.5rem; line-height: 1.2; font-weight: 750; color: #fff;  }
    .cm-live-h2 { font-size: 1.65rem; line-height: 1.35; font-weight: 720; color: #fff;  }
    .cm-live-h3 { font-size: 1.3rem; line-height: 1.35; font-weight: 700; color: #fff;  }
    .cm-live-h4 { font-size: 1.12em; line-height: 1.4; font-weight: 680; color: #fff; }
    .cm-live-strong { font-weight: 750; color: #fff; }
    .cm-live-em { font-style: italic; }
    .cm-live-code { font-family: var(--font-code); background: #2a2a2a; border-radius: 4px; padding: .2rem .4rem; font-size: .9em; }
    .cm-live-markup { opacity: .26; }
    .cm-live-quote { border-left: 1px solid #555; color: #a0a0a0; padding-left: 1rem !important; }
    .cm-live-math-inline { display: inline-block; padding: 0 .12rem; vertical-align: middle; }
    .cm-live-math-block { display: block; width: 100%; box-sizing: border-box; margin: 1.5rem 0; overflow-x: auto; text-align: center; }
    .cm-live-math-error { color: #fca5a5; font-family: var(--font-code); font-size: .9em; }
  `;
  document.head.appendChild(style);
}

const compositionState = StateEffect.define();
const composing = StateField.define({
  create: () => false,
  update(value, tr) { for (const effect of tr.effects) if (effect.is(compositionState)) value = effect.value; return value; }
});
function active(state, from, to) {
  return state.field(composing) || state.selection.ranges.some(range => range.from <= to && range.to >= from);
}
const mathCache = new Map();
class MathWidget extends WidgetType {
  constructor(tex, displayMode, from) { super(); this.tex = tex; this.displayMode = displayMode; this.from = from; }
  eq(other) { return this.tex === other.tex && this.displayMode === other.displayMode && this.from === other.from; }
  toDOM(view) {
    const wrap = document.createElement(this.displayMode ? 'div' : 'span');
    wrap.className = this.displayMode ? 'cm-live-math-block' : 'cm-live-math-inline';
    const key = `${this.displayMode}:${this.tex}`;
    let html = mathCache.get(key);
    if (!html) {
      html = katex.renderToString(this.tex, { displayMode: this.displayMode, throwOnError: false, strict: false });
      if (mathCache.size >= 128) mathCache.delete(mathCache.keys().next().value);
      mathCache.set(key, html);
    }
    wrap.innerHTML = html;
    wrap.addEventListener('mousedown', event => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.from + 2 }, scrollIntoView: true });
      view.focus();
    });
    return wrap;
  }
  ignoreEvent() { return true; }
}
function mathDecorations(state, nodes) {
  const result = [];
  for (const node of nodes) {
    if (active(state, node.from, node.to)) continue;
    const raw = state.doc.sliceString(node.from, node.to);
    const block = node.name === 'BlockMath';
    const size = block || raw.startsWith('$$') ? 2 : 1;
    if (!raw.endsWith('$'.repeat(size)) || raw.length <= size * 2) continue;
    result.push(Decoration.replace({ widget: new MathWidget(raw.slice(size, -size).trim(), block, node.from), block,
      inclusive: false }).range(node.from, node.to));
  }
  return Decoration.set(result, true);
}
// Direct state decorations may replace line breaks. Viewport plugins may not.
const mathField = StateField.define({
  create(state) { return buildMathState(state); },
  update(value, tr) {
    const tree = syntaxTree(tr.state);
    if (tree !== value.tree) return buildMathState(tr.state);
    if (tr.effects.some(effect => effect.is(compositionState)) || (tr.selection && value.nodes.some(node => active(tr.startState, node.from, node.to) !== active(tr.state, node.from, node.to))))
      return { ...value, decorations: mathDecorations(tr.state, value.nodes) };
    return value;
  },
  provide: field => [EditorView.decorations.from(field, value => value.decorations),
    EditorView.atomicRanges.of(view => view.state.field(field).decorations)]
});
function buildMathState(state) {
  const nodes = [], tree = syntaxTree(state);
  tree.iterate({ enter(node) {
    if (['FencedCode', 'CodeBlock', 'InlineCode'].includes(node.name)) return false;
    if (node.name === 'BlockMath' || node.name === 'InlineMath') {
      nodes.push({ from: node.from, to: node.to, name: node.name }); return false;
    }
  }});
  return { tree, nodes, decorations: mathDecorations(state, nodes) };
}
function liveDecorations(view) {
  const ranges = [], state = view.state;
  for (const visible of view.visibleRanges) {
    syntaxTree(state).iterate({ from: visible.from, to: visible.to, enter(node) {
      if (['FencedCode', 'CodeBlock', 'BlockMath', 'InlineMath'].includes(node.name)) return false;
      const line = state.doc.lineAt(node.from);
      const editing = active(state, line.from, state.doc.lineAt(node.to).to);
      const heading = /^ATXHeading([1-6])$/.exec(node.name);
      if (heading) ranges.push(Decoration.line({ class: `cm-live-h${Math.min(4, Number(heading[1]))}` }).range(line.from));
      const styles = { StrongEmphasis: 'cm-live-strong', Emphasis: 'cm-live-em', InlineCode: 'cm-live-code' };
      if (styles[node.name]) ranges.push(Decoration.mark({ class: styles[node.name] }).range(node.from, node.to));
      // Preserve all characters on active lines. No atomic ranges for ordinary markup.
      if (!editing && ['HeaderMark', 'EmphasisMark', 'CodeMark', 'QuoteMark'].includes(node.name)) {
        ranges.push(Decoration.replace({}).range(node.from, node.to));
      }
      if (node.name === 'QuoteMark') ranges.push(Decoration.line({ class: 'cm-live-quote' }).range(line.from));
    }});
  }
  return Decoration.set(ranges, true);
}
const livePlugin = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = liveDecorations(view); }
  update(update) {
    const lineKey = state => state.selection.ranges.map(r => `${state.doc.lineAt(r.from).number}:${state.doc.lineAt(r.to).number}`).join(',');
    if (update.docChanged || update.viewportChanged || syntaxTree(update.state) !== syntaxTree(update.startState) ||
        lineKey(update.state) !== lineKey(update.startState) || update.transactions.some(tr => tr.effects.some(e => e.is(compositionState))))
      this.decorations = liveDecorations(update.view);
  }
}, { decorations: value => value.decorations });

export function installWriteEditor() {
  const textarea = document.getElementById('editor-textarea'), container = document.querySelector('.editor-container');
  if (!textarea || !container || document.getElementById('cm-editor-host')) return null;
  const host = document.createElement('div'); host.id = 'cm-editor-host'; container.prepend(host);
  const live = new Compartment();
  let mode = localStorage.getItem(MODE_KEY) || 'split', snapshot, snapshotDoc;
  let bookmarks = new Set();
  const notify = () => textarea.dispatchEvent(new Event('input', { bubbles: true }));
  const applyFormat = cmd => {
    const change = view.state.changeByRange(range => {
      const format = formatText(cmd, view.state.sliceDoc(range.from, range.to));
      if (!format) return { range };
      return { changes: { from: range.from, to: range.to, insert: format.insert },
        range: EditorSelection.range(range.from + format.from, range.from + format.to) };
    });
    view.dispatch({ ...change, scrollIntoView: true, userEvent: 'input' }); view.focus(); return true;
  };
  const extensions = () => [basicSetup, markdown({ extensions: [mathMarkdown] }), EditorView.lineWrapping, composing,
    placeholder(textarea.placeholder), EditorView.theme({ '&': { fontSize: '14px', height: '100%' }, '.cm-scroller': { overflow: 'auto' } }, { dark: true }),
    keymap.of([{ key: 'Mod-b', run: () => applyFormat('bold') }, { key: 'Mod-i', run: () => applyFormat('italic') },
      { key: 'Mod-k', run: () => applyFormat('link') }, { key: 'Mod-s', run: () => { document.dispatchEvent(new Event('sulog:save')); return true; } }]),
    EditorView.domEventHandlers({
      compositionstart: () => { view.dispatch({ effects: compositionState.of(true) }); return false; },
      compositionend: () => { setTimeout(() => { view.dispatch({ effects: compositionState.of(false) }); document.dispatchEvent(new Event('sulog:composition-end')); }, 0); return false; },
      dragover: event => { if (!event.dataTransfer?.types.includes('Files')) return false;
        event.preventDefault(); document.getElementById('drag-overlay')?.classList.add('active'); return true; },
      dragleave: () => { document.getElementById('drag-overlay')?.classList.remove('active'); return false; },
      drop: event => {
        if (!event.dataTransfer?.files.length) return false;
        event.preventDefault(); document.getElementById('drag-overlay')?.classList.remove('active');
        document.dispatchEvent(new CustomEvent('sulog:media-drop', { detail: {
          files: Array.from(event.dataTransfer.files), position: view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head
        }})); return true;
      }
    }),
    EditorView.updateListener.of(update => {
      if (!update.docChanged) return;
      for (const mark of bookmarks) mark.position = update.changes.mapPos(mark.position, 1);
      snapshotDoc = null; notify();
    }), live.of(mode === 'live' ? [mathField, livePlugin] : [])];
  const view = new EditorView({ parent: host, state: EditorState.create({ doc: textarea.value, extensions: extensions() }) });
  window.sulogWriteEditor = view;
  window.sulogEditor = {
    get value() { if (snapshotDoc !== view.state.doc) { snapshotDoc = view.state.doc; snapshot = snapshotDoc.toString(); } return snapshot; },
    get length() { return view.state.doc.length; },
    format: applyFormat,
    replaceDocument(text) { bookmarks.clear(); view.setState(EditorState.create({ doc: text, extensions: extensions() })); snapshotDoc = null; },
    bookmark(position = view.state.selection.main.head) {
      const mark = { position }; bookmarks.add(mark);
      return { insert(text) { view.dispatch({ changes: { from: mark.position, insert: text }, userEvent: 'input' }); },
        release() { bookmarks.delete(mark); } };
    },
    focus: () => view.focus()
  };
  // Legacy callers read on demand, rather than copying the whole document per keystroke.
  Object.defineProperty(textarea, 'value', { configurable: true, get: () => window.sulogEditor.value,
    set: value => window.sulogEditor.replaceDocument(String(value)) });
  injectStyles();
  const toolbar = document.querySelector('.toolbar');
  const switcher = document.createElement('div'); switcher.className = 'write-mode-switch';
  switcher.setAttribute('aria-label', '에디터 보기 모드');
  for (const [value, label] of [['split', '분할'], ['source', '텍스트'], ['live', '라이브'], ['preview', '미리보기']]) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'write-mode-btn';
    button.textContent = label; button.dataset.writeMode = value; switcher.append(button);
  }
  toolbar.prepend(switcher);
  const setMode = requested => {
    mode = VALID_MODES.has(requested) ? requested : 'split'; localStorage.setItem(MODE_KEY, mode);
    document.body.classList.remove('write-mode-split', 'write-mode-source', 'write-mode-live', 'write-mode-preview'); document.body.classList.add(`write-mode-${mode}`);
    for (const button of switcher.children) { button.classList.toggle('active', button.dataset.writeMode === mode); button.setAttribute('aria-pressed', button.dataset.writeMode === mode); }
    view.dispatch({ effects: live.reconfigure(mode === 'live' ? [mathField, livePlugin] : []) });
    document.getElementById('btn-preview-edit').hidden = mode !== 'preview';
    document.dispatchEvent(new CustomEvent('sulog:editor-mode-change', { detail: { mode } })); view.requestMeasure();
    if (mode !== 'preview') view.focus(); else document.getElementById('btn-preview-edit').focus();
  };
  switcher.addEventListener('click', event => { const button = event.target.closest('[data-write-mode]'); if (button) setMode(button.dataset.writeMode); });
  document.getElementById('btn-preview-edit').addEventListener('click', () => setMode('source'));
  setMode(mode);
  document.fonts?.ready.then(() => view.requestMeasure());
  view.focus(); return view;
}
