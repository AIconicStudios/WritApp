/** True in the Android app build. */
export const MOBILE = process.env.NEXT_PUBLIC_MOBILE === "1";

/**
 * Link to a manuscript workspace page. On the web: /app/m/<id>/report.
 * In the Android app (static files) the id travels in the query string: /app/m/_/report/?ms=<id>.
 */
export function mhref(id: string, rest = ""): string {
  if (!MOBILE) return `/app/m/${id}${rest}`;
  let hash = "";
  const h = rest.indexOf("#");
  if (h >= 0) [rest, hash] = [rest.slice(0, h), rest.slice(h)];
  const [path, q] = rest.split("?");
  return `/app/m/_${path.replace(/\/$/, "")}/?ms=${encodeURIComponent(id)}${q ? "&" + q : ""}${hash}`;
}
