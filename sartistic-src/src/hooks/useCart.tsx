import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type CartLine = {
  productId: string;
  variantId: string | null;
  quantity: number;
  name: string;
  variantName: string | null;
  slug: string;
  price: number;
  imageUrl: string;
  sku: string | null;
  stock: number;
};

type CartContextValue = {
  items: CartLine[];
  count: number;
  subtotal: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  addItem: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  removeItem: (productId: string, variantId: string | null) => void;
  setQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  clear: () => void;
};

const STORAGE_KEY = "sartistic.cart.v1";

const CartContext = createContext<CartContextValue | null>(null);

function sameLine(a: CartLine, productId: string, variantId: string | null) {
  return a.productId === productId && (a.variantId ?? null) === (variantId ?? null);
}

/**
 * Collapses repeated rows for the same product/variant into one line.
 * Duplicate cart_items rows were created by overlapping saves; each copy holds
 * the same quantity, so the copies are merged (largest quantity), not summed.
 */
function dedupeLines(lines: CartLine[]): CartLine[] {
  const out: CartLine[] = [];
  for (const line of lines) {
    const existing = out.find((m) => sameLine(m, line.productId, line.variantId));
    if (existing) existing.quantity = Math.max(existing.quantity, line.quantity);
    else out.push({ ...line });
  }
  return out;
}

/** Replaces the signed-in customer's saved cart with `lines`. */
async function writeRemoteCart(userId: string, lines: CartLine[]) {
  const { data: cart } = await supabase
    .from("carts")
    .upsert({ user_id: userId }, { onConflict: "user_id" })
    .select("id")
    .maybeSingle();
  if (!cart) return;
  await supabase.from("cart_items").delete().eq("cart_id", cart.id);
  if (lines.length) {
    await supabase.from("cart_items").insert(
      lines.map((m) => ({
        cart_id: cart.id,
        product_id: m.productId,
        variant_id: m.variantId,
        quantity: m.quantity,
      })),
    );
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // The user whose saved cart has been loaded and merged; only then is it safe
  // to write the cart back to Supabase.
  const [remoteReadyFor, setRemoteReadyFor] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(dedupeLines(JSON.parse(raw) as CartLine[]));
    } catch {
      /* ignore malformed local cart */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable */
    }
  }, [items, hydrated]);

  // Persist the cart for signed-in customers and merge the guest cart on login.
  useEffect(() => {
    if (!hydrated || !user) return;
    let cancelled = false;
    setRemoteReadyFor(null);

    (async () => {
      const { data: cart } = await supabase
        .from("carts")
        .upsert({ user_id: user.id }, { onConflict: "user_id" })
        .select("id")
        .maybeSingle();
      if (!cart || cancelled) return;

      const { data: remote } = await supabase
        .from("cart_items")
        .select(
          "product_id, variant_id, quantity, products(name, slug, price, sku, stock_quantity, product_images(image_url, is_primary, sort_order)), product_variants(name, price, stock_quantity)",
        )
        .eq("cart_id", cart.id);

      const remoteLines: CartLine[] = (remote ?? []).flatMap((row) => {
        const product = row.products as unknown as {
          name: string;
          slug: string;
          price: number;
          sku: string | null;
          stock_quantity: number;
          product_images: { image_url: string; is_primary: boolean; sort_order: number }[];
        } | null;
        if (!product) return [];
        const variant = row.product_variants as unknown as {
          name: string;
          price: number;
          stock_quantity: number;
        } | null;
        const image =
          [...(product.product_images ?? [])].sort(
            (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
          )[0]?.image_url ?? "/images/products/placeholder.jpg";
        return [
          {
            productId: row.product_id,
            variantId: row.variant_id,
            quantity: row.quantity,
            name: product.name,
            variantName: variant?.name ?? null,
            slug: product.slug,
            price: Number(variant?.price ?? product.price),
            imageUrl: image,
            sku: product.sku,
            stock: variant?.stock_quantity ?? product.stock_quantity,
          },
        ];
      });

      if (cancelled) return;
      // Pure merge (no side effects): the saved cart, then any lines from this
      // browser. The same line in both keeps the larger quantity, never the sum,
      // so the cart isn't doubled when localStorage already mirrors Supabase.
      setItems((local) => dedupeLines([...remoteLines, ...local]));
      // The save effect below then writes the merged, de-duplicated cart once.
      setRemoteReadyFor(user.id);
    })();

    return () => {
      cancelled = true;
    };
    // Runs once per signed-in user session.
  }, [user?.id, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  // On sign-out, start an empty guest cart; the customer's cart stays saved
  // in Supabase and is restored at their next sign-in.
  const previousUserId = useRef<string | null>(null);
  useEffect(() => {
    const id = user?.id ?? null;
    if (previousUserId.current && previousUserId.current !== id) {
      setRemoteReadyFor(null);
      setItems([]);
    }
    previousUserId.current = id;
  }, [user?.id]);

  // Saves to Supabase run one at a time and always write the latest cart, so
  // a delete+insert can never interleave with another (which duplicated rows).
  const saveQueue = useRef<{ running: boolean; next: { userId: string; lines: CartLine[] } | null }>(
    { running: false, next: null },
  );
  const scheduleRemoteSave = useCallback((userId: string, lines: CartLine[]) => {
    const queue = saveQueue.current;
    queue.next = { userId, lines };
    if (queue.running) return;
    queue.running = true;
    void (async () => {
      try {
        while (queue.next) {
          const job = queue.next;
          queue.next = null;
          await writeRemoteCart(job.userId, job.lines);
        }
      } finally {
        queue.running = false;
      }
    })();
  }, []);

  useEffect(() => {
    if (!user || remoteReadyFor !== user.id) return;
    scheduleRemoteSave(user.id, items);
  }, [items, user, remoteReadyFor, scheduleRemoteSave]);

  // State updaters stay pure: React may call them more than once.
  const update = useCallback((updater: (prev: CartLine[]) => CartLine[]) => {
    setItems(updater);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    return {
      items,
      count: items.reduce((sum, i) => sum + i.quantity, 0),
      subtotal,
      open,
      setOpen,
      addItem: (line, quantity = 1) =>
        update((prev) => {
          const existing = prev.find((p) => sameLine(p, line.productId, line.variantId));
          if (existing) {
            return prev.map((p) =>
              sameLine(p, line.productId, line.variantId)
                ? { ...p, quantity: p.quantity + quantity }
                : p,
            );
          }
          return [...prev, { ...line, quantity }];
        }),
      removeItem: (productId, variantId) =>
        update((prev) => prev.filter((p) => !sameLine(p, productId, variantId))),
      setQuantity: (productId, variantId, quantity) =>
        update((prev) =>
          quantity <= 0
            ? prev.filter((p) => !sameLine(p, productId, variantId))
            : prev.map((p) => (sameLine(p, productId, variantId) ? { ...p, quantity } : p)),
        ),
      clear: () => update(() => []),
    };
  }, [items, open, update]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
