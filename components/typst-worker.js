import { createTypstCompiler, supportsJspiBackend } from 'typst-wasm';
let compiler;
async function initialize() {
  if (!supportsJspiBackend()) throw new Error('이 브라우저는 Typst HTML에 필요한 WebAssembly JSPI를 지원하지 않습니다. 최신 Chrome/Edge를 사용해 주세요.');
  const base = '/assets/vendor/typst/';
  const names = ['engine.core.wasm', 'engine.core2.wasm', 'engine.core3.wasm'];
  const coreModules = Object.fromEntries(await Promise.all(names.map(async name => {
    const response = await fetch(base + name);
    if (!response.ok) throw new Error('Typst WASM 리소스를 불러오지 못했습니다.');
    return [name, await WebAssembly.compile(await response.arrayBuffer())];
  })));
  const instance = await createTypstCompiler({ backend: 'jspi', coreModules,
    // Documents cannot fetch packages, URLs or arbitrary files through the compiler.
    fetch: async () => { throw new Error('외부 Typst 파일과 패키지는 아직 지원하지 않습니다.'); }
  });
  await instance.addFonts(new Uint8Array(await (await fetch(base + 'NewCMMath-Regular.otf')).arrayBuffer()));
  return instance;
}
// Fixed template is never saved into the user's source. Math is exported as MathML.
const TEMPLATE = '#set text(lang: "ko")\n#show heading: it => html.elem("h" + str(calc.min(6, it.level)), it.body)\n';
self.onmessage = async ({ data: { id, source } }) => {
  try {
    compiler ||= initialize().catch(error => { compiler = null; throw error; });
    const instance = await compiler;
    await instance.clearFiles();
    await instance.addSource('main.typ', TEMPLATE + source);
    const result = await instance.compile({ main: 'main.typ', format: 'html' });
    self.postMessage({ id, html: result.output });
  } catch (error) {
    self.postMessage({ id, error: error.diagnostics?.map(d => d.formatted || d.message).join('\n') || error.message });
  }
};
