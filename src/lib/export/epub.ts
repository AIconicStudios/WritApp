import JSZip from "jszip";
import { typographic } from "./model";
import type { MsData } from "./docx";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** EPUB 3 for Kindle (KDP accepts EPUB) and other e-book stores, with a navigable table of contents. */
export async function manuscriptEpub(ms: MsData, lang = "en"): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  const css = `body{font-family:serif;line-height:1.5;margin:0 5%}h1{text-align:center;font-size:1.5em;margin:3em 0 1.5em;page-break-before:always}p{margin:0;text-indent:1.5em;text-align:justify}p.first,p.center{text-indent:0}p.center{text-align:center;margin:.5em 0}p.break{text-align:center;text-indent:0;margin:1em 0}blockquote{margin:1em 2em;font-style:italic}.title{text-align:center;margin-top:30%}.title h1{page-break-before:avoid;font-size:2em}.author{text-align:center;text-indent:0;font-size:1.2em;margin-top:2em}`;
  zip.file("OEBPS/style.css", css);
  const items: { id: string; href: string; title: string; nav: boolean }[] = [];
  items.push({ id: "titlepage", href: "title.xhtml", title: "Title Page", nav: false });
  zip.file("OEBPS/title.xhtml", page(ms.title, `<div class="title"><h1>${esc(ms.title)}</h1><p class="author">${esc(ms.author)}</p></div>`, lang));
  let n = 0;
  for (const ch of ms.chapters) {
    if (ch.matterType === "title_page" || ch.matterType === "toc") continue;
    n++;
    const id = `s${String(n).padStart(3, "0")}`;
    const title = ch.kind === "chapter" ? ch.title : ch.heading ?? ch.title;
    let body = ch.kind === "chapter" || ch.kind === "part" || ch.heading ? `<h1 id="${id}">${esc(typographic(title))}</h1>\n` : "";
    let first = true;
    for (const p of ch.paragraphs) {
      if (p.style === "scene_break") {
        body += `<p class="break">* * *</p>\n`;
        first = true;
        continue;
      }
      const centered = p.style === "center" || ch.matterType === "copyright" || ch.matterType === "dedication";
      if (p.style === "quote") body += `<blockquote><p class="first">${esc(typographic(p.text))}</p></blockquote>\n`;
      else body += `<p${centered ? ' class="center"' : first ? ' class="first"' : ""}>${esc(typographic(p.text))}</p>\n`;
      first = false;
    }
    zip.file(`OEBPS/${id}.xhtml`, page(title, body, lang));
    items.push({ id, href: `${id}.xhtml`, title, nav: true });
  }
  const nav = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}"><head><title>Contents</title><link rel="stylesheet" href="style.css"/></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${items.filter((i) => i.nav).map((i) => `<li><a href="${i.href}">${esc(typographic(i.title))}</a></li>`).join("")}</ol></nav></body></html>`;
  zip.file("OEBPS/nav.xhtml", nav);
  const uidv = "urn:uuid:" + crypto.randomUUID();
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const opf = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${uidv}</dc:identifier><dc:title>${esc(ms.title)}</dc:title><dc:creator>${esc(ms.author)}</dc:creator><dc:language>${lang}</dc:language><meta property="dcterms:modified">${modified}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${items.map((i) => `<item id="${i.id}" href="${i.href}" media-type="application/xhtml+xml"/>`).join("")}</manifest><spine>${items.map((i) => `<itemref idref="${i.id}"/>`).join("")}</spine></package>`;
  zip.file("OEBPS/content.opf", opf);
  return zip.generateAsync({ type: "nodebuffer", mimeType: "application/epub+zip", compression: "DEFLATE" });
}

function page(title: string, body: string, lang: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}"><head><title>${esc(title)}</title><link rel="stylesheet" href="style.css"/></head><body>${body}</body></html>`;
}
