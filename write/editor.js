// 모든 패키지가 같은 state/view 인스턴스를 공유해야 한다. 버전이 갈리면
// "Unrecognized extension value"로 EditorView 생성 자체가 실패한다.
const CODEMIRROR_DEPS = '?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11';
const { EditorView, basicSetup } = await import(`https://esm.sh/codemirror@6.0.2${CODEMIRROR_DEPS}`);
const { Decoration, WidgetType, ViewPlugin } = await import(`https://esm.sh/@codemirror/view@6.43.11?deps=@codemirror/state@6.7.4`);
const { Compartment } = await import('https://esm.sh/@codemirror/state@6.7.4');
const { markdown } = await import(`https://esm.sh/@codemirror/lang-markdown@6.5.2${CODEMIRROR_DEPS}`);

const MODE_KEY = 'sulog_write_editor_mode';
const VALID_MODES = new Set(['split', 'source', 'live']);

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
    #cm-editor-host .cm-selectionLayer { z-index: 1 !important; }
    #cm-editor-host .cm-cursor { border-left-color: var(--accent-blue); }
    #cm-editor-host .cm-focused { outline: none; }

    .write-mode-switch { margin-left: auto; display: inline-flex; gap: 2px; padding: 2px; background: var(--bg-main); border: 1px solid var(--border-color); border-radius: 6px; }
    .write-mode-btn { border: 0; background: transparent; color: var(--text-muted); padding: .25rem .55rem; border-radius: 4px; font: inherit; font-size: .74rem; cursor: pointer; }
    .write-mode-btn:hover { color: var(--text-main); background: var(--bg-hover); }
    .write-mode-btn.active { color: #0f172a; background: var(--accent-blue); font-weight: 700; }

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
    .cm-live-h1 { font-size: 2.5rem; line-height: 1.2; font-weight: 750; color: #fff; margin-top: 1.5rem; }
    .cm-live-h2 { font-size: 1.65rem; line-height: 1.35; font-weight: 720; color: #fff; margin-top: 2.75rem; }
    .cm-live-h3 { font-size: 1.3rem; line-height: 1.35; font-weight: 700; color: #fff; margin-top: 2.25rem; }
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

class MathWidget extends WidgetType {
  constructor(tex, displayMode) {
    super();
    this.tex = tex;
    this.displayMode = displayMode;
  }

  eq(other) {
    return other.tex === this.tex && other.displayMode === this.displayMode;
  }

  toDOM() {
    // ViewPlugin이 제공하는 decoration은 CodeMirror의 block decoration이 될 수 없다.
    // span을 CSS block으로 표시하면 같은 레이아웃을 유지하면서 해당 제약을 피한다.
    const wrap = document.createElement('span');
    wrap.className = this.displayMode ? 'cm-live-math-block' : 'cm-live-math-inline';
    try {
      if (window.katex) {
        window.katex.render(this.tex, wrap, {
          displayMode: this.displayMode,
          throwOnError: false,
          strict: false
        });
      } else {
        wrap.textContent = this.tex;
        wrap.classList.add('cm-live-math-error');
      }
    } catch (error) {
      wrap.textContent = this.tex;
      wrap.classList.add('cm-live-math-error');
    }
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

function overlapsAny(from, to, ranges) {
  return ranges.some(range => from < range.to && to > range.from);
}

function pushRange(ranges, decoration, from, to = from) {
  if (to < from) return;
  ranges.push(decoration.range(from, to));
}

function findCodeRanges(text, offset = 0) {
  const ranges = [];
  let cursor = 0;

  while (cursor < text.length) {
    const lineStart = cursor === 0 || text[cursor - 1] === '\n';
    if (lineStart) {
      const lineEnd = text.indexOf('\n', cursor);
      const end = lineEnd === -1 ? text.length : lineEnd;
      const opener = /^( {0,3})(`{3,}|~{3,})/.exec(text.slice(cursor, end));
      if (opener) {
        const marker = opener[2][0];
        const minLength = opener[2].length;
        let fenceEnd = lineEnd === -1 ? text.length : lineEnd + 1;
        let search = fenceEnd;
        while (search < text.length) {
          const closeLineEnd = text.indexOf('\n', search);
          const closeEnd = closeLineEnd === -1 ? text.length : closeLineEnd;
          const closer = new RegExp(`^ {0,3}${marker}{${minLength},}[ \\t]*$`);
          if (closer.test(text.slice(search, closeEnd))) {
            fenceEnd = closeLineEnd === -1 ? text.length : closeLineEnd + 1;
            break;
          }
          if (closeLineEnd === -1) {
            fenceEnd = text.length;
            break;
          }
          search = closeLineEnd + 1;
          fenceEnd = search;
        }
        ranges.push({ from: offset + cursor, to: offset + fenceEnd, type: 'fence' });
        cursor = fenceEnd;
        continue;
      }
    }

    if (text[cursor] === '`') {
      let runEnd = cursor + 1;
      while (text[runEnd] === '`') runEnd += 1;
      const ticks = text.slice(cursor, runEnd);
      const close = text.indexOf(ticks, runEnd);
      if (close !== -1) {
        const codeEnd = close + ticks.length;
        ranges.push({ from: offset + cursor, to: offset + codeEnd, type: 'span' });
        cursor = codeEnd;
        continue;
      }
      cursor = runEnd;
      continue;
    }
    cursor += 1;
  }

  return ranges;
}

function buildLiveDecorations(view) {
  const ranges = [];
  const atomicRanges = [];
  const doc = view.state.doc;

  // 화면 근처만 다시 계산한다. 큰 강의노트에서도 매 키 입력마다 전체 문서를 훑지 않는다.
  const visible = view.visibleRanges.length ? view.visibleRanges : [{ from: 0, to: doc.length }];
  const scanFrom = Math.max(0, visible[0].from - 5000);
  const scanTo = Math.min(doc.length, visible[visible.length - 1].to + 5000);
  const text = doc.sliceString(scanFrom, scanTo);
  const codeRanges = findCodeRanges(text, scanFrom);
  const mathRanges = [];

  // Display math: $$ ... $$ . Closing $$ 뒤의 공백/개행은 수식 범위에 포함하지 않는다.
  const blockMath = /\$\$([\s\S]*?)\$\$/g;
  for (const match of text.matchAll(blockMath)) {
    const from = scanFrom + match.index;
    const to = from + match[0].length;
    if (overlapsAny(from, to, codeRanges)) continue;
    mathRanges.push({ from, to });
    const firstLine = doc.lineAt(from);
    const lastLine = doc.lineAt(Math.max(from, to - 1));
    const before = doc.sliceString(firstLine.from, from).trim();
    const afterRaw = doc.sliceString(to, lastLine.to);
    const after = afterRaw.trim();
    const tex = match[1].trim();

    // 완전히 독립된 블록이고 닫는 $$가 실제 줄 끝일 때만 block decoration을 쓴다.
    // trailing space가 있으면 그 공백과 caret까지 replace하지 않도록 정확한 $$ 범위만 치환한다.
    if (!before && !after && to === lastLine.to) {
      const decoration = Decoration.replace({ widget: new MathWidget(tex, true) });
      pushRange(ranges, decoration, from, to);
      pushRange(atomicRanges, decoration, from, to);
    } else {
      const decoration = Decoration.replace({ widget: new MathWidget(tex, false) });
      pushRange(ranges, decoration, from, to);
      pushRange(atomicRanges, decoration, from, to);
    }
  }

  // Inline math: $ ... $
  const inlineMath = /(^|[^$\\])\$([^$\n]+?)\$(?!\$)/gm;
  for (const match of text.matchAll(inlineMath)) {
    const prefix = match[1] || '';
    const from = scanFrom + match.index + prefix.length;
    const to = from + match[0].length - prefix.length;
    if (overlapsAny(from, to, codeRanges)) continue;
    if (overlapsAny(from, to, mathRanges)) continue;
    mathRanges.push({ from, to });
    const decoration = Decoration.replace({ widget: new MathWidget(match[2].trim(), false) });
    pushRange(ranges, decoration, from, to);
    pushRange(atomicRanges, decoration, from, to);
  }

  // Line-oriented Markdown: headings / blockquotes.
  let line = doc.lineAt(scanFrom);
  while (line.from <= scanTo) {
    const lineText = line.text;
    const heading = /^(#{1,6})\s+/.exec(lineText);
    if (heading) {
      const level = Math.min(4, heading[1].length);
      pushRange(ranges, Decoration.line({ class: `cm-live-h${level}` }), line.from);
      const decoration = Decoration.replace({});
      pushRange(ranges, decoration, line.from, line.from + heading[0].length);
      pushRange(atomicRanges, decoration, line.from, line.from + heading[0].length);
    } else {
      const quote = /^>\s?/.exec(lineText);
      if (quote) {
        pushRange(ranges, Decoration.line({ class: 'cm-live-quote' }), line.from);
        const decoration = Decoration.replace({});
        pushRange(ranges, decoration, line.from, line.from + quote[0].length);
        pushRange(atomicRanges, decoration, line.from, line.from + quote[0].length);
      }
    }

    if (line.to >= doc.length) break;
    line = doc.line(line.number + 1);
  }

  // Inline markup. Math ranges are excluded so formulas are not styled twice.
  const inlineRules = [
    { re: /\*\*([^*\n]+?)\*\*/g, cls: 'cm-live-strong', open: 2, close: 2 },
    { re: /__([^_\n]+?)__/g, cls: 'cm-live-strong', open: 2, close: 2 },
    { re: /`([^`\n]+?)`/g, cls: 'cm-live-code', open: 1, close: 1 },
    { re: /(^|[^*])\*([^*\n]+?)\*(?!\*)/gm, cls: 'cm-live-em', open: 1, close: 1, prefixGroup: true },
    { re: /(^|[^_])_([^_\n]+?)_(?!_)/gm, cls: 'cm-live-em', open: 1, close: 1, prefixGroup: true }
  ];

  for (const rule of inlineRules) {
    for (const match of text.matchAll(rule.re)) {
      const prefix = rule.prefixGroup ? (match[1] || '').length : 0;
      const from = scanFrom + match.index + prefix;
      const to = scanFrom + match.index + match[0].length;
      if (overlapsAny(from, to, mathRanges)) continue;
      if (rule.cls !== 'cm-live-code' && overlapsAny(from, to, codeRanges)) continue;
      if (rule.cls === 'cm-live-code' && codeRanges.some(range => range.type === 'fence' && from < range.to && to > range.from)) continue;
      const innerFrom = from + rule.open;
      const innerTo = to - rule.close;
      if (innerTo <= innerFrom) continue;

      pushRange(ranges, Decoration.mark({ class: rule.cls }), innerFrom, innerTo);
      const openDecoration = Decoration.replace({});
      const closeDecoration = Decoration.replace({});
      pushRange(ranges, openDecoration, from, innerFrom);
      pushRange(ranges, closeDecoration, innerTo, to);
      pushRange(atomicRanges, openDecoration, from, innerFrom);
      pushRange(atomicRanges, closeDecoration, innerTo, to);
    }
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  atomicRanges.sort((a, b) => a.from - b.from || a.to - b.to);
  return {
    decorations: Decoration.set(ranges, true),
    atomicRanges: Decoration.set(atomicRanges, true)
  };
}

const livePreviewPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    const live = buildLiveDecorations(view);
    this.decorations = live.decorations;
    this.atomicRanges = live.atomicRanges;
  }

  update(update) {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      const live = buildLiveDecorations(update.view);
      this.decorations = live.decorations;
      this.atomicRanges = live.atomicRanges;
    }
  }
}, {
  decorations: value => value.decorations,
  provide: plugin => EditorView.atomicRanges.of(view => view.plugin(plugin)?.atomicRanges || Decoration.none)
});

function replaceSelection(view, before, after = before, placeholder = '') {
  const selection = view.state.selection.main;
  const selected = view.state.sliceDoc(selection.from, selection.to);
  const body = selected || placeholder;
  const insert = `${before}${body}${after}`;
  const anchor = selected
    ? selection.from + insert.length
    : selection.from + before.length + body.length;

  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: { anchor },
    scrollIntoView: true
  });
  view.focus();
}

function installModeSwitch(view, liveCompartment) {
  const toolbar = document.querySelector('.toolbar');
  if (!toolbar) return () => {};

  const switcher = document.createElement('div');
  switcher.className = 'write-mode-switch';
  switcher.setAttribute('aria-label', '에디터 보기 모드');
  switcher.innerHTML = `
    <button type="button" class="write-mode-btn" data-write-mode="split" title="Markdown 원문과 렌더 프리뷰를 함께 표시">분할</button>
    <button type="button" class="write-mode-btn" data-write-mode="source" title="Markdown 원문만 표시">텍스트</button>
    <button type="button" class="write-mode-btn" data-write-mode="live" title="Obsidian Live Preview처럼 현재 위치 외 문법과 수식을 렌더">라이브</button>
  `;
  toolbar.appendChild(switcher);

  const setMode = requested => {
    const mode = VALID_MODES.has(requested) ? requested : 'split';
    localStorage.setItem(MODE_KEY, mode);
    document.body.classList.remove('write-mode-split', 'write-mode-source', 'write-mode-live');
    document.body.classList.add(`write-mode-${mode}`);
    switcher.querySelectorAll('[data-write-mode]').forEach(button => {
      button.classList.toggle('active', button.dataset.writeMode === mode);
    });
    view.dispatch({
      effects: liveCompartment.reconfigure(mode === 'live' ? livePreviewPlugin : [])
    });
    document.dispatchEvent(new CustomEvent('sulog:editor-mode-change', {
      detail: { mode }
    }));
    requestAnimationFrame(() => view.requestMeasure());
  };

  switcher.addEventListener('click', event => {
    const button = event.target.closest('[data-write-mode]');
    if (button) setMode(button.dataset.writeMode);
  });

  setMode(localStorage.getItem(MODE_KEY) || 'split');
  return setMode;
}

export async function installWriteEditor() {
  const textarea = document.getElementById('editor-textarea');
  const container = document.querySelector('.editor-container');
  if (!textarea || !container || document.getElementById('cm-editor-host')) return null;

  injectStyles();

  const host = document.createElement('div');
  host.id = 'cm-editor-host';
  container.insertBefore(host, textarea);

  const liveCompartment = new Compartment();
  const originalValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  let view = null;
  let syncingFromCodeMirror = false;
  let externalSyncQueued = false;

  const syncFromTextarea = () => {
    if (!view || syncingFromCodeMirror) return;
    const next = originalValue.get.call(textarea);
    const current = view.state.doc.toString();
    if (next === current) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
  };

  // 기존 admin.js가 textarea.value를 직접 바꾸는 부분(포스트 열기/새 글/업로드)을 그대로 살린다.
  Object.defineProperty(textarea, 'value', {
    configurable: true,
    get() {
      return originalValue.get.call(textarea);
    },
    set(value) {
      originalValue.set.call(textarea, value);
      if (!syncingFromCodeMirror && !externalSyncQueued) {
        externalSyncQueued = true;
        queueMicrotask(() => {
          externalSyncQueued = false;
          syncFromTextarea();
        });
      }
    }
  });

  const theme = EditorView.theme({
    '&': { fontSize: '14px', height: '100%' },
    '.cm-scroller': { minHeight: '100%' },
    '.cm-content': { minHeight: '100%' },
    '.cm-line': { caretColor: 'var(--accent-blue)' }
  }, { dark: true });

  const syncExtension = EditorView.updateListener.of(update => {
    if (!update.docChanged) return;
    syncingFromCodeMirror = true;
    originalValue.set.call(textarea, update.state.doc.toString());
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    syncingFromCodeMirror = false;
  });

  view = new EditorView({
    parent: host,
    doc: originalValue.get.call(textarea),
    extensions: [
      basicSetup,
      markdown(),
      EditorView.lineWrapping,
      theme,
      syncExtension,
      liveCompartment.of([])
    ]
  });

  window.sulogWriteEditor = view;
  installModeSwitch(view, liveCompartment);

  // 편집기 아래쪽 빈 공간 클릭 시 포커스 및 문서 끝으로 caret 이동
  host.addEventListener('mousedown', event => {
    if (event.button !== 0 || event.target.closest('.cm-gutterElement') || event.target.closest('.cm-content')) return;
    const rect = view.contentDOM.getBoundingClientRect();
    if (event.clientY > rect.bottom) {
      event.preventDefault();
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      view.focus();
    }
  });

  // 기존 toolbar의 익명 handler를 유지하기 위해 클릭 직전에 textarea selection을 CM selection과 맞춘다.
  const toolbar = document.querySelector('.toolbar');
  if (toolbar) {
    toolbar.addEventListener('click', event => {
      const button = event.target.closest('.tool-btn[data-cmd]');
      if (!button) return;
      const selection = view.state.selection.main;
      textarea.setSelectionRange(selection.from, selection.to);
      queueMicrotask(() => {
        syncFromTextarea();
        const pos = Math.min(textarea.selectionStart, view.state.doc.length);
        view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
        view.focus();
      });
    }, true);
  }

  // CodeMirror에서 기존 단축키 UX를 유지한다.
  view.dom.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'a') {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        selection: { anchor: 0, head: view.state.doc.length }
      });
      view.focus();
      try {
        textarea.setSelectionRange(0, textarea.value.length);
      } catch (_) {}
    } else if (key === 'b') {
      event.preventDefault();
      replaceSelection(view, '**', '**', 'bold text');
    } else if (key === 'i') {
      event.preventDefault();
      replaceSelection(view, '*', '*', 'italic text');
    } else if (key === 'k') {
      event.preventDefault();
      const selection = view.state.selection.main;
      const selected = view.state.sliceDoc(selection.from, selection.to) || 'link text';
      const insert = `[${selected}](https://example.com)`;
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert },
        selection: { anchor: selection.from + insert.length },
        scrollIntoView: true
      });
    } else if (key === 's') {
      event.preventDefault();
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 's', ctrlKey: true, metaKey: event.metaKey, bubbles: true, cancelable: true
      }));
    }
  }, true);

  // 기존 Mastodon media drag/drop 로직도 hidden textarea로 전달한다.
  const overlay = document.getElementById('drag-overlay');
  view.dom.addEventListener('dragover', event => {
    event.preventDefault();
    overlay?.classList.add('active');
  });
  view.dom.addEventListener('dragleave', event => {
    if (!view.dom.contains(event.relatedTarget)) overlay?.classList.remove('active');
  });
  view.dom.addEventListener('drop', event => {
    event.preventDefault();
    overlay?.classList.remove('active');
    try {
      const forwarded = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: event.dataTransfer
      });
      textarea.dispatchEvent(forwarded);
    } catch (error) {
      console.warn('Could not forward media drop to legacy editor:', error);
    }
  });

  view.focus();
  return view;
}
