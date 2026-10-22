let worker, pending, sequence = 0;
// Serialize calls; terminate runaway user programs without freezing the page.
let queue = Promise.resolve();
export function renderTypst(source) {
  const task = queue.catch(() => {}).then(() => new Promise((resolve, reject) => {
    if (!worker) {
      worker = new Worker('/assets/typst-worker.js?v=27', { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (data.id !== pending?.id) return;
        clearTimeout(pending.timer);
        const request = pending; pending = null;
        if (data.error) request.reject(new Error(data.error)); else request.resolve(data.html);
      };
      worker.onerror = () => fail('Typst 컴파일러를 시작하지 못했습니다.');
    }
    function fail(message) {
      worker?.terminate(); worker = null;
      if (pending) { clearTimeout(pending.timer); pending.reject(new Error(message)); pending = null; }
    }
    const id = ++sequence;
    pending = { id, resolve, reject, timer: setTimeout(() => fail('Typst 렌더링 제한 시간(30초)을 초과했습니다.'), 30000) };
    worker.postMessage({ id, source });
  }));
  queue = task;
  return task;
}
