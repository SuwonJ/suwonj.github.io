function installPdfExport() {
  const toolbar = document.querySelector('.toolbar');
  if (!toolbar || document.getElementById('btn-export-pdf')) return false;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'btn-export-pdf';
  button.className = 'tool-btn';
  button.title = '렌더된 문서를 인쇄하거나 PDF로 저장';
  button.setAttribute('aria-label', 'PDF');
  button.innerHTML = '<span class="material-symbols-outlined">picture_as_pdf</span>';
  toolbar.appendChild(button);

  if (!document.getElementById('write-print-style')) {
    const style = document.createElement('style');
    style.id = 'write-print-style';
    style.textContent = `
      #write-print-root { display: none; }
      @page { size: A4; margin: 16mm 18mm 18mm; }
      @media print {
        html, body {
          background: #fff !important;
          color: #111 !important;
          height: auto !important;
          min-height: 0 !important;
          overflow: visible !important;
        }
        body > *:not(#write-print-root) { display: none !important; }
        #write-print-root {
          display: block !important;
          background: #fff !important;
          color: #111 !important;
          width: auto !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          font-family: var(--font-gothic), system-ui, sans-serif;
          font-size: 10.5pt;
          line-height: 1.65;
          word-break: keep-all;
          overflow-wrap: break-word;
        }
        #write-print-root * {
          color: #111 !important;
          box-shadow: none !important;
          text-shadow: none !important;
        }
        #write-print-root h1 { font-size: 23pt !important; margin: 0 0 10mm !important; }
        #write-print-root h2 { font-size: 17pt !important; margin: 8mm 0 3mm !important; }
        #write-print-root h3 { font-size: 13.5pt !important; margin: 6mm 0 2.5mm !important; }
        #write-print-root h1,
        #write-print-root h2,
        #write-print-root h3,
        #write-print-root h4 { break-after: avoid-page; page-break-after: avoid; }
        #write-print-root p,
        #write-print-root li { orphans: 3; widows: 3; }
        #write-print-root a { color: #111 !important; text-decoration: underline; }
        #write-print-root pre {
          background: #f6f7f8 !important;
          border: 1px solid #d8dadd !important;
          border-radius: 4px !important;
          padding: 9mm 4mm 4mm !important;
          margin: 5mm 0 !important;
          white-space: pre-wrap !important;
          overflow-wrap: anywhere !important;
          break-inside: avoid;
        }
        #write-print-root code {
          background: #f2f3f4 !important;
          border: 0 !important;
        }
        #write-print-root blockquote {
          border-left: 2px solid #999 !important;
          color: #444 !important;
        }
        #write-print-root table {
          width: 100% !important;
          border-collapse: collapse !important;
          break-inside: avoid;
        }
        #write-print-root th,
        #write-print-root td {
          border: 1px solid #bbb !important;
          background: transparent !important;
        }
        #write-print-root img {
          max-width: 100% !important;
          height: auto !important;
          break-inside: avoid;
        }
        #write-print-root .katex-display {
          overflow: visible !important;
          break-inside: avoid;
        }
        #write-print-root #preview-tags {
          color: #666 !important;
          margin-bottom: 8mm !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      if (typeof window.sulogRenderPreview === 'function') {
        await window.sulogRenderPreview();
      } else {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      const preview = document.getElementById('preview-body');
      if (!preview) throw new Error('렌더 프리뷰를 찾을 수 없습니다.');

      document.getElementById('write-print-root')?.remove();
      const root = document.createElement('article');
      root.id = 'write-print-root';
      root.innerHTML = preview.innerHTML;
      document.body.appendChild(root);

      if (document.body.classList.contains('write-mode-live') || document.body.classList.contains('write-mode-source')) {
        document.getElementById('preview-markdown-content')?.replaceChildren();
      }

      const oldTitle = document.title;
      const title = document.getElementById('input-title')?.value.trim();
      if (title) document.title = title;

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        root.remove();
        document.title = oldTitle;
        button.disabled = false;
      };

      window.addEventListener('afterprint', cleanup, { once: true });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.print();

      // afterprint를 보내지 않는 브라우저용 안전장치.
      setTimeout(cleanup, 1500);
    } catch (error) {
      console.error('PDF export failed:', error);
      button.disabled = false;
      alert(`PDF 출력 준비 실패: ${error.message}`);
    }
  });

  return true;
}

function bootPdfExport(attempt = 0) {
  if (installPdfExport()) return;
  if (attempt < 30) setTimeout(() => bootPdfExport(attempt + 1), 50);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => bootPdfExport(), { once: true });
} else {
  bootPdfExport();
}
