import type { QueryClient } from "@tanstack/react-query";

/**
 * Refreshes every storefront query after an admin change, so the store shows
 * the update immediately in this browser. Other visitors get fresh data on
 * their next page load (storefront queries are never cached as fresh).
 */
export function invalidateStorefront(queryClient: QueryClient) {
  for (const key of [
    ["products"],
    ["product"],
    ["collections"],
    ["collection"],
    ["categories"],
    ["homepage-sections"],
    ["site-settings"],
    ["gallery-images"],
    ["gallery-categories"],
  ]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}
