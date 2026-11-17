/** Phone replacement for pdf-parse, using Mozilla pdf.js. Same interface as pdf-parse/lib/pdf-parse.js. */
export default async function pdfParse(buf: Uint8Array, opts: { pagerender?: (page: any) => Promise<string> } = {}) {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    text += (opts.pagerender ? await opts.pagerender(page) : "") + "\n";
    page.cleanup();
  }
  return { text, numpages: doc.numPages };
}
