/** Phone replacement for mammoth's Node entry point (uses the browser build). */
// @ts-expect-error - browser bundle has no types
import m from "mammoth/mammoth.browser.js";
export function convertToHtml(input: { buffer?: Uint8Array; arrayBuffer?: ArrayBuffer }, options?: unknown) {
  const ab = input.arrayBuffer ?? input.buffer!.buffer.slice(input.buffer!.byteOffset, input.buffer!.byteOffset + input.buffer!.byteLength);
  return m.convertToHtml({ arrayBuffer: ab }, options);
}
export default { convertToHtml };
