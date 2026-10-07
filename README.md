# C Workspace

A C editor, compiler and runner that works entirely in the browser, made to be
embedded in Canvas quiz questions taken in Respondus LockDown Browser.

**Live:** https://stevenmcarr.github.io/c-ide/

- Compiles with real **clang 8** and links with **lld**, both compiled to
  WebAssembly ([binji/wasm-clang](https://github.com/binji/wasm-clang)).
  `-std=gnu11 -Wall -O0`, against wasi-libc.
- Nothing is sent to a server. After the page loads, all compiling and running
  happens in the student's browser.
- No AI features, no accounts, no sharing and no links to other sites.
- The page can be framed by other sites (GitHub Pages sends no
  `X-Frame-Options`), and it needs no `SharedArrayBuffer` or cross-origin
  isolation, so it runs inside a Canvas iframe.

## Using it in a Canvas quiz

1. In LockDown Browser settings for the quiz, go to **Advanced Settings →
   Allow access to specific external web domains** and add
   `stevenmcarr.github.io`.
2. Make each coding problem an **Essay** question. In the question text,
   switch to the HTML editor (`</>`) and add:

   ```html
   <p><strong>Problem 1.</strong> ...problem statement...</p>
   <p>Write and test your program below, then click <em>Copy my code</em>
   and paste it into the answer box.</p>
   <iframe src="https://stevenmcarr.github.io/c-ide/?q=p1" width="100%" height="650"
           style="border:1px solid #ccc;" allow="clipboard-write"></iframe>
   ```

   Canvas shows the answer box below the question text, so students see the
   problem, then the workspace, then the answer box.

## URL options

| Parameter     | Meaning |
|---------------|---------|
| `q=NAME`      | Load starter code from `starters/NAME.c`, and starter input from `starters/NAME.in` if that file exists. Each `q` also gets its own autosave slot. |
| `timeout=SEC` | Stop a run after this many seconds (default 10). |

To add starter code, commit `starters/p1.c` (and optionally `starters/p1.in`)
to this repo. With no `q`, the page starts with Hello World.

## Behavior notes

- **Input** is given ahead of time in the Input box. `scanf`, `getchar` and
  `fgets` read from it and see end-of-file when it runs out. Input isn't
  echoed into the output.
- **Output** is unbuffered, so text printed before a crash still appears.
  Output is capped at 200,000 characters.
- **Runtime errors** are reported in plain language: bad memory access,
  integer division by zero, stack overflow, and `abort()`/`assert()`. Programs
  run as 32-bit WebAssembly, so `sizeof(void *)` and `sizeof(long)` are 4, and
  writing through a NULL pointer does **not** crash.
- **Autosave**: the code is saved in the browser per question, so a reload
  doesn't lose work. This works only where the browser allows storage, so
  students should still paste into Canvas often.
- **First load** downloads about 19 MB (clang, lld and the C library, gzipped
  by GitHub Pages) and takes a few seconds. After that, each compile takes
  well under a second.

## Files

- `index.html`: the page (editor, toolbar, input and output panels)
- `compile-worker.js`: long-lived worker that runs clang and wasm-ld
- `run-worker.js`: worker that runs one program; replaced on every run, and
  terminated on Stop or timeout
- `clang-api.js`: `shared.js` from binji/wasm-clang, changed only to expose
  `App`, `MemFS` and `ProcExit`
- `wasm/`: clang, lld, memfs and sysroot from binji/wasm-clang
- `vendor/codemirror/`: CodeMirror 5.65.16 editor

## Licenses

wasm-clang and its JavaScript are Apache-2.0 (`wasm/LICENSE.wasm-clang`).
LLVM/clang/lld are Apache-2.0 with LLVM exceptions (`wasm/LICENSE.llvm`).
CodeMirror is MIT (`vendor/codemirror/LICENSE`).
