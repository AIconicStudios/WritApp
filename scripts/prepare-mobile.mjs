// Copies the on-device engine's assets (SQLite WebAssembly, PDF reader worker, spelling dictionary) into public/.
import fs from "node:fs";
const copies = [
  ["node_modules/sql.js/dist/sql-wasm.wasm", "public/sql-wasm.wasm"],
  ["node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs"],
  ["node_modules/dictionary-en/index.aff", "public/dict/en.aff"],
  ["node_modules/dictionary-en/index.dic", "public/dict/en.dic"],
];
fs.mkdirSync("public/dict", { recursive: true });
for (const [a, b] of copies) fs.copyFileSync(a, b);
console.log("Mobile assets copied.");
