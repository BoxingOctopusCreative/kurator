import type { CategoryFormSlice } from "@/components/CategoryMetadataFields";

/** Merges a partial slice from catalog apply; `undefined` removes a key so switching sources can clear stale catalog ids. */
export function mergeCategoryFormSlice(
  prev: CategoryFormSlice,
  slice: Partial<CategoryFormSlice>
): CategoryFormSlice {
  const merged: CategoryFormSlice = { ...prev };
  for (const key of Object.keys(slice) as (keyof CategoryFormSlice)[]) {
    const raw = slice[key];
    if (raw === undefined) {
      delete (merged as Record<string, unknown>)[key];
      continue;
    }
    if (raw === null) continue;
    if (key === "single_issue") {
      if (typeof raw === "boolean") {
        merged.single_issue = raw;
        if (raw === false) merged.issue_number = "";
      }
      continue;
    }
    if (raw === "") continue;
    const str = typeof raw === "string" ? raw : String(raw);
    (merged as Record<string, string | boolean | undefined>)[key] = str;
  }
  return merged;
}
