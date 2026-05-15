import { apiUrl } from "./apiUrl";
import {
  exportCollectionItemsCsv,
  exportListItemsCsv,
  exportWishlistEntriesCsv,
  fetchCollections,
  fetchLists,
  fetchWishlists,
} from "./api";

export type SharedShelfMemberOption = {
  user_id: number;
  username: string;
  display_name: string;
};

export type SharedShelfForDeletion = {
  kind: "collection" | "list" | "wishlist";
  id: string;
  name: string;
  members: SharedShelfMemberOption[];
};

export type ShelfOwnershipTransfer = {
  kind: string;
  shelf_id: string;
  new_owner_id: number;
};

async function readApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (typeof j.message === "string") return j.message;
  } catch {
    /* ignore */
  }
  return text || `request failed (${res.status})`;
}

export async function fetchAccountDeletionContext(): Promise<SharedShelfForDeletion[]> {
  const res = await fetch(apiUrl("/me/account/deletion-context"), { credentials: "include" });
  if (res.status === 401) throw new Error("Sign in to continue.");
  if (!res.ok) throw new Error(await readApiError(res));
  const data = (await res.json()) as { shared_shelves?: SharedShelfForDeletion[] };
  return data.shared_shelves ?? [];
}

export async function deactivateAccount(transfers: ShelfOwnershipTransfer[]): Promise<void> {
  const res = await fetch(apiUrl("/me/account"), {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ transfers }),
  });
  if (res.status === 401) throw new Error("Sign in to continue.");
  if (!res.ok) throw new Error(await readApiError(res));
}

export async function reactivateAccount(token: string): Promise<void> {
  const res = await fetch(apiUrl("/auth/reactivate-account"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token: token.trim() }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
}

export async function acceptShelfOwnershipTakeover(successionId: number): Promise<void> {
  const res = await fetch(apiUrl(`/me/shelf-ownership-successions/${successionId}/accept`), {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(await readApiError(res));
}

export async function voteShelfOwnershipElection(
  successionId: number,
  candidateId: number,
): Promise<void> {
  const res = await fetch(apiUrl(`/me/shelf-ownership-successions/${successionId}/vote`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ candidate_id: candidateId }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Downloads CSV exports for all collections and wishlists owned by the signed-in user. */
export async function exportAllOwnedShelvesCsv(userId: number): Promise<{ files: number; errors: string[] }> {
  const errors: string[] = [];
  let files = 0;
  const [collRes, lists, wishlists] = await Promise.all([
    fetchCollections({ owner_user_id: userId, limit: 500, page: 1 }),
    fetchLists(),
    fetchWishlists(),
  ]);
  for (const c of collRes.items) {
    try {
      const blob = await exportCollectionItemsCsv(c.id);
      triggerBlobDownload(blob, `collection-${c.id}-items.csv`);
      files += 1;
    } catch (e) {
      errors.push(`${c.name}: ${e instanceof Error ? e.message : "export failed"}`);
    }
  }
  for (const l of lists) {
    try {
      const blob = await exportListItemsCsv(l.id);
      triggerBlobDownload(blob, `list-${l.id}-items.csv`);
      files += 1;
    } catch (e) {
      errors.push(`${l.name}: ${e instanceof Error ? e.message : "export failed"}`);
    }
  }
  for (const w of wishlists) {
    try {
      const blob = await exportWishlistEntriesCsv(w.id);
      triggerBlobDownload(blob, `wishlist-${w.id}-entries.csv`);
      files += 1;
    } catch (e) {
      errors.push(`${w.name}: ${e instanceof Error ? e.message : "export failed"}`);
    }
  }
  return { files, errors };
}
