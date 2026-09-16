const PLACEHOLDER = '여기에 마크다운 문법으로 자유롭게 내용을 작성하세요... (이미지/파일 드래그 앤 드롭 지원)';

function injectGuardStyles() {
  if (document.getElementById('sulog-editor-guard-style')) return;
  const style = document.createElement('style');
  style.id = 'sulog-editor-guard-style';
  style.textContent = `
    .editor-container {
      min-height: 320px !important;
    }
    #cm-editor-host {
      position: relative;
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      min-height: 320px !important;
    }
    #cm-editor-host .cm-editor,
    #cm-editor-host .cm-scroller,
    #cm-editor-host .cm-content {
      min-height: 320px !important;
    }
    #cm-editor-placeholder {
      position: absolute;
      top: 1.35rem;
      left: 3.4rem;
      right: 1.4rem;
      z-index: 3;
      color: var(--text-muted, #64748b);
      opacity: .72;
      font-family: var(--font-code, monospace);
      font-size: 14px;
      line-height: 1.62;
      pointer-events: none;
      user-select: none;
      white-space: normal;
    }
    body.write-mode-live #cm-editor-placeholder {
      font-family: var(--font-gothic, sans-serif);
      font-size: 16px;
      line-height: 1.78;
    }
    body.sulog-cm-fallback #cm-editor-host { display: none !important; }
    body.sulog-cm-fallback #editor-textarea {
      display: block !important;
      min-height: 320px !important;
    }
  `;
  document.head.appendChild(style);
}

function attachPlaceholder() {
  const host = document.getElementById('cm-editor-host');
  const textarea = document.getElementById('editor-textarea');
  if (!host || !textarea || !host.querySelector('.cm-editor')) return false;

  let placeholder = document.getElementById('cm-editor-placeholder');
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.id = 'cm-editor-placeholder';
    placeholder.textContent = PLACEHOLDER;
    host.appendChild(placeholder);
  }

  const sync = () => {
    placeholder.hidden = textarea.value.length > 0;
  };

  textarea.addEventListener('input', sync);
  const observer = new MutationObserver(sync);
  observer.observe(host, { subtree: true, childList: true, characterData: true });
  sync();
  return true;
}

function installGuard() {
  injectGuardStyles();

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (attachPlaceholder()) {
      clearInterval(timer);
      return;
    }

    // CodeMirror가 로드되지 못했는데 editor.js가 textarea를 숨긴 경우 안전하게 원복한다.
    if (attempts >= 80) {
      clearInterval(timer);
      const textarea = document.getElementById('editor-textarea');
      const host = document.getElementById('cm-editor-host');
      if (textarea && (!host || !host.querySelector('.cm-editor'))) {
        document.body.classList.add('sulog-cm-fallback');
        textarea.focus();
      }
    }
  }, 100);
}

installGuard();
