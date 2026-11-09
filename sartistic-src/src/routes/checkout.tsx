import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import {
  createCheckoutOrder,
  markCheckoutFailed,
  verifyCheckoutPayment,
} from "@/lib/checkout.functions";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Secure Checkout | SARTISTIC" },
      { name: "description", content: "Complete your SARTISTIC order with secure payment." },
      { property: "og:title", content: "Secure Checkout | SARTISTIC" },
      { property: "og:description", content: "Complete your order securely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Checkout,
});

const formSchema = z.object({
  full_name: z.string().trim().min(1, "Please enter your full name").max(100),
  email: z.string().trim().email("Enter a valid email address").max(255),
  phone: z.string().trim().min(6, "Enter a valid phone number").max(20),
  address: z.string().trim().min(1, "Please enter your address").max(300),
  address_line_2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().min(1, "Please enter your city").max(100),
  state: z.string().trim().min(1, "Please enter your state").max(100),
  postal_code: z.string().trim().min(4, "Enter a valid PIN code").max(12),
});

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpay() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function Checkout() {
  const navigate = useNavigate();
  const { items, subtotal, clear } = useCart();
  const { user, loading } = useAuth();
  const createOrder = useServerFn(createCheckoutOrder);
  const verifyPayment = useServerFn(verifyCheckoutPayment);
  const markFailed = useServerFn(markCheckoutFailed);

  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  const shipping = subtotal >= 999 || subtotal === 0 ? 0 : 79;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }
    const parsed = formSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your details");
      return;
    }

    setBusy(true);
    try {
      const fullAddress = [parsed.data.address, parsed.data.address_line_2]
        .filter(Boolean)
        .join(", ");

      const order = await createOrder({
        data: {
          items: items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
          shipping: {
            full_name: parsed.data.full_name,
            email: parsed.data.email,
            phone: parsed.data.phone,
            address: fullAddress,
            city: parsed.data.city,
            state: parsed.data.state,
            postal_code: parsed.data.postal_code,
            country: "India",
          },
          couponCode: coupon.trim() ? coupon.trim() : null,
        },
      });

      if (order.paymentUnavailable || !order.razorpay) {
        toast.error(
          "Online payment isn't switched on yet. Your order was saved as pending — our team will be in touch.",
        );
        clear();
        void navigate({ to: "/account/orders" });
        return;
      }

      const ready = await loadRazorpay();
      if (!ready) {
        toast.error("The payment window couldn't load. Please check your connection.");
        return;
      }

      const razorpay = new window.Razorpay!({
        key: order.razorpay.keyId,
        amount: Math.round(order.amount * 100),
        currency: "INR",
        name: "SARTISTIC",
        description: `Order ${order.orderNumber}`,
        order_id: order.razorpay.orderId,
        prefill: {
          name: parsed.data.full_name,
          email: parsed.data.email,
          contact: parsed.data.phone,
        },
        theme: { color: "#6b4226" },
        modal: {
          ondismiss: () => {
            void markFailed({ data: { orderId: order.orderId } });
            toast("Payment cancelled. Your order was not placed.");
          },
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            await verifyPayment({
              data: {
                orderId: order.orderId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
            });
            clear();
            toast.success("Payment received. Thank you!");
            void navigate({ to: "/account/orders" });
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "We couldn't confirm your payment.",
            );
          }
        },
      });
      razorpay.open();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong at checkout.");
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-32 text-center">
        <h1 className="text-4xl">Nothing to check out</h1>
        <p className="mt-3 text-muted-foreground">Add something beautiful to your cart first.</p>
        <Button asChild className="mt-8 rounded-none">
          <Link to="/shop">Shop Mehndi</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-16 lg:px-10">
      <p className="eyebrow">Checkout</p>
      <h1 className="mt-3 text-4xl md:text-5xl">Shipping &amp; Payment</h1>

      <form onSubmit={submit} className="mt-12 grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" name="full_name" required />
            <Field label="Email" name="email" type="email" required defaultValue={user?.email} />
            <Field label="Phone" name="phone" required />
            <Field label="PIN code" name="postal_code" required />
          </div>
          <Field label="Address" name="address" required />
          <Field label="Apartment / Area (optional)" name="address_line_2" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="City" name="city" required />
            <Field label="State" name="state" required />
          </div>
        </div>

        <aside className="h-fit border border-border bg-card p-8">
          <p className="eyebrow">Order summary</p>
          <ul className="mt-6 space-y-4">
            {items.map((item) => (
              <li key={`${item.productId}-${item.variantId}`} className="flex gap-3 text-sm">
                <img src={item.imageUrl} alt="" className="size-14 bg-secondary object-cover" />
                <div className="flex-1">
                  <p>{item.name}</p>
                  <p className="text-muted-foreground">
                    {item.variantName ? `${item.variantName} · ` : ""}Qty {item.quantity}
                  </p>
                </div>
                <span>{formatPrice(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex gap-2">
            <Input
              value={coupon}
              onChange={(e) => setCoupon(e.target.value.toUpperCase())}
              placeholder="Coupon code"
              className="rounded-none"
            />
          </div>

          <dl className="mt-6 space-y-3 border-t border-border pt-4 text-sm">
            <Row label="Subtotal" value={formatPrice(subtotal)} />
            <Row label="Shipping" value={shipping ? formatPrice(shipping) : "Free"} />
          </dl>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <span className="eyebrow">Total</span>
            <span className="font-display text-2xl">{formatPrice(subtotal + shipping)}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Coupon discounts are applied and verified securely when your order is created.
          </p>

          <Button type="submit" disabled={busy} className="mt-6 h-12 w-full rounded-none">
            {busy ? "Preparing payment…" : "Pay Securely"}
          </Button>
        </aside>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | undefined;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        className="rounded-none"
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
