// Compiles and links a C program with clang/lld (WebAssembly builds from
// binji/wasm-clang) and returns the resulting WASI module to the page.
// This worker stays alive between runs so clang is only loaded once.

self.importScripts('clang-api.js');

let diagnostics = '';

const api = new API({
  async readBuffer(filename) {
    const response = await fetch(filename);
    if (!response.ok) throw new Error(`could not load ${filename} (${response.status})`);
    return response.arrayBuffer();
  },
  async compileStreaming(filename) {
    const response = await fetch(filename);
    if (!response.ok) throw new Error(`could not load ${filename} (${response.status})`);
    return WebAssembly.compile(await response.arrayBuffer());
  },
  hostWrite(s) { diagnostics += s; },
  clang: 'wasm/clang',
  lld: 'wasm/lld',
  memfs: 'wasm/memfs',
  sysroot: 'wasm/sysroot.tar',
});

// Silence wasm-clang's progress log; the page shows its own status.
api.hostLog = () => {};
api.hostLogAsync = (message, promise) => promise;

const CLANG_ARGS = [
  '-cc1', '-emit-obj',
  '-disable-free',
  '-isysroot', '/',
  '-internal-isystem', '/include',
  '-internal-isystem', '/lib/clang/8.0.1/include',
  '-ferror-limit', '19',
  '-fmessage-length', '0',
  '-std=gnu11',
  '-Wall',
  '-O0',
  '-x', 'c',
];

// Linked into every program: make stdout/stderr unbuffered so output printed
// before a crash or an infinite loop still appears.
const PRELUDE = `#include <stdio.h>
__attribute__((constructor)) static void c_ide_unbuffer(void) {
  setvbuf(stdout, NULL, _IONBF, 0);
  setvbuf(stderr, NULL, _IONBF, 0);
}
`;

// Runs one tool (clang or wasm-ld) to completion and returns its exit code.
async function tool(module, ...argv) {
  const app = new API.App(module, api.memfs, ...argv);
  await app.ready;
  try {
    app.exports._start();
    return 0;
  } catch (e) {
    if (e instanceof API.ProcExit) return e.code;
    throw e;
  }
}

let clang, lld, preludeBuilt = false;

async function load() {
  await api.ready;
  clang = await api.getModule(api.clangFilename);
  lld = await api.getModule(api.lldFilename);
  if (!preludeBuilt) {
    api.memfs.addFile('prelude.c', PRELUDE);
    diagnostics = '';
    const code = await tool(clang, 'clang', ...CLANG_ARGS, '-o', 'prelude.o', 'prelude.c');
    if (code !== 0) throw new Error('internal prelude failed to compile:\n' + diagnostics);
    preludeBuilt = true;
  }
}

const loaded = load();

async function compile(source) {
  await loaded;
  diagnostics = '';
  api.memfs.addFile('main.c', source);
  let code = await tool(clang, 'clang', ...CLANG_ARGS, '-o', 'main.o', 'main.c');
  if (code !== 0) return { ok: false, diagnostics };

  const compileDiagnostics = diagnostics;
  diagnostics = '';
  code = await tool(lld, 'wasm-ld', '--no-threads', '--export-dynamic',
                    '-z', 'stack-size=1048576', '-Llib/wasm32-wasi',
                    'lib/wasm32-wasi/crt1.o', 'prelude.o', 'main.o', '-lc',
                    '-o', 'main.wasm');
  if (code !== 0) return { ok: false, diagnostics: compileDiagnostics + diagnostics };

  const wasm = api.memfs.getFileContents('main.wasm').slice().buffer;
  return { ok: true, diagnostics: compileDiagnostics + diagnostics, wasm };
}

self.onmessage = async (event) => {
  const msg = event.data;
  try {
    if (msg.type === 'load') {
      await loaded;
      self.postMessage({ type: 'loaded' });
    } else if (msg.type === 'compile') {
      const result = await compile(msg.source);
      self.postMessage({ type: 'compiled', id: msg.id, ...result },
                       result.wasm ? [result.wasm] : []);
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: msg.id, message: String(e && e.message || e) });
  }
};
