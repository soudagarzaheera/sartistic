import { createFileRoute, Link } from "@tanstack/react-router";
import { PolicyPage } from "@/components/site/PolicyPage";
import { WINDOW_EXPIRED_MESSAGE } from "@/lib/returns";

export const Route = createFileRoute("/return-policy")({
  head: () => ({
    meta: [
      { title: "Return Policy | SARTISTIC Mehndi" },
      {
        name: "description",
        content:
          "How to return a SARTISTIC order: request a return within 3 days of delivery from My Orders.",
      },
      { property: "og:title", content: "Return Policy | SARTISTIC Mehndi" },
    ],
  }),
  component: ReturnPolicy,
});

function ReturnPolicy() {
  return (
    <PolicyPage
      eyebrow="Customer care"
      title="Return Policy"
      updated="18 November 2026"
      intro={
        <p>
          We want every SARTISTIC order to arrive just as it should. If something isn't right, you
          can ask for a return within{" "}
          <strong className="text-foreground">3 days of delivery</strong>. Here's how it works.
        </p>
      }
      related={{ to: "/refund-policy", label: "Refund Policy" }}
      sections={[
        {
          id: "window",
          title: "The 3-day return window",
          body: (
            <>
              <p>
                You can request a return from the moment your order is delivered until{" "}
                <strong>11:59 PM (India time) on the third day after the delivery date</strong>. For
                example, if your parcel is delivered on 16 November, you can request a return until
                11:59 PM on 19 November.
              </p>
              <p>
                The delivery date is the one recorded by our courier partner when your parcel is
                delivered. You'll see it, along with the time you have left, on your order page.
              </p>
              <p>
                Once the window has closed, the return option is no longer available and your order
                page will show: “{WINDOW_EXPIRED_MESSAGE}”
              </p>
            </>
          ),
        },
        {
          id: "eligible",
          title: "What can be returned",
          body: (
            <>
              <p>
                Mehndi is a product applied to the skin, so for hygiene and safety we accept returns
                when an item:
              </p>
              <ul>
                <li>arrived damaged or leaking,</li>
                <li>is not the item you ordered,</li>
                <li>was missing from your package, or</li>
                <li>is past its expiry date or has a quality problem.</li>
              </ul>
              <p>
                Opened or used products can't be returned unless they're faulty. Please keep the
                item and its packaging until your return is complete.
              </p>
            </>
          ),
        },
        {
          id: "how",
          title: "How to request a return",
          body: (
            <ol>
              <li>
                Sign in and open{" "}
                <Link to="/account/orders" className="underline underline-offset-4">
                  My Orders
                </Link>
                , then choose the order.
              </li>
              <li>Under “Returns &amp; refunds”, select “Request return” next to the item.</li>
              <li>Choose the quantity and a reason, and add any details.</li>
              <li>
                Add photos if you can — of the item, the damage and the packaging. They help us
                resolve things faster.
              </li>
              <li>Submit. You can follow the status of your request on the same page.</li>
            </ol>
          ),
        },
        {
          id: "next",
          title: "What happens next",
          body: (
            <>
              <p>
                Every request is reviewed by our team — returns are never approved automatically.
                Your request will move through these stages:
              </p>
              <ul>
                <li>
                  <strong>Return Requested</strong> — we've received your request.
                </li>
                <li>
                  <strong>Approved</strong> — we'll arrange for the courier to collect the item.
                </li>
                <li>
                  <strong>Return Picked Up</strong> — the courier has collected it.
                </li>
                <li>
                  <strong>Returned</strong> — the item has reached us.
                </li>
                <li>
                  <strong>Rejected</strong> — if we can't accept the return, we'll explain why on
                  your order page.
                </li>
              </ul>
              <p>
                A return covers the item itself. If you'd also like your money back, request a
                refund for the item as well — see our{" "}
                <Link to="/refund-policy" className="underline underline-offset-4">
                  Refund Policy
                </Link>
                .
              </p>
            </>
          ),
        },
        {
          id: "notes",
          title: "Good to know",
          body: (
            <ul>
              <li>You need to be signed in to the account that placed the order.</li>
              <li>Each item in an order can have one return request.</li>
              <li>
                If your order page doesn't show a delivery date, we can't confirm the window online
                —{" "}
                <Link to="/contact" className="underline underline-offset-4">
                  contact us
                </Link>{" "}
                and we'll help.
              </li>
            </ul>
          ),
        },
      ]}
    />
  );
}
