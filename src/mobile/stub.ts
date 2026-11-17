/** Web build stand-in for phone-only modules (never executed on the web). */
export async function ready() {}
export async function localFetch(): Promise<Response> {
  throw new Error("Phone-only module");
}
export async function saveAndShare() {
  throw new Error("Phone-only module");
}
