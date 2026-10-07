// Runs one compiled program. The page creates a fresh worker for every run
// and terminates it on Stop or timeout, so an infinite loop never hangs the
// page or the compiler.

self.importScripts('clang-api.js');

const OUTPUT_LIMIT = 200000;  // characters
let written = 0;

class OutputLimit extends Error {}

function hostWrite(s) {
  if (written >= OUTPUT_LIMIT) return;
  if (written + s.length > OUTPUT_LIMIT) {
    s = s.slice(0, OUTPUT_LIMIT - written);
  }
  written += s.length;
  self.postMessage({ type: 'output', text: s });
  if (written >= OUTPUT_LIMIT) throw new OutputLimit();
}

function describe(e) {
  const m = String(e && e.message || e);
  if (/out of bounds/i.test(m))
    return 'Runtime error: invalid memory access (bad pointer or array index out of range).';
  if (/divide by zero/i.test(m))
    return 'Runtime error: integer division by zero.';
  if (/call stack|stack size/i.test(m))
    return 'Runtime error: stack overflow (runaway recursion?).';
  if (/unreachable/i.test(m))
    return 'Runtime error: program aborted (abort() or a failed assert()).';
  if (/integer overflow/i.test(m))
    return 'Runtime error: integer overflow in conversion.';
  return 'Runtime error: ' + m;
}

self.onmessage = async (event) => {
  const { wasm, stdin } = event.data;
  try {
    const memfs = new API.MemFS({
      async compileStreaming(filename) {
        const response = await fetch(filename);
        return WebAssembly.compile(await response.arrayBuffer());
      },
      hostWrite,
      memfsFilename: 'wasm/memfs',
    });
    await memfs.ready;
    memfs.setStdinStr(stdin || '');

    const module = await WebAssembly.compile(wasm);
    const app = new API.App(module, memfs, 'main');
    await app.ready;
    try {
      app.exports._start();
      self.postMessage({ type: 'exit', code: 0 });
    } catch (e) {
      if (e instanceof API.ProcExit) {
        self.postMessage({ type: 'exit', code: e.code });
      } else if (e instanceof OutputLimit) {
        self.postMessage({ type: 'error', message:
          `Stopped: output limit reached (${OUTPUT_LIMIT.toLocaleString()} characters). Check for a runaway loop.` });
      } else {
        self.postMessage({ type: 'error', message: describe(e) });
      }
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: 'Could not start program: ' + (e && e.message || e) });
  }
};
