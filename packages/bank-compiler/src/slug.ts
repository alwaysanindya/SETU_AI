/**
 * Stable ids from spreadsheet text: "Where did it start?" -> "where-did-it-start", "Upper(R)" -> "upper-r".
 * Ids appear in red-flag rules and stored answers, so this function must not change behaviour casually.
 */
export function slug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Returns `base`, or `base-2`, `base-3`... if it is already taken. Records the id as taken. */
export function uniqueId(base: string, taken: Set<string>): string {
  let id = base || "item";
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id);
  return id;
}
