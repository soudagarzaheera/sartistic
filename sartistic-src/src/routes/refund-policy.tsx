import { createFileRoute, Link } from "@tanstack/react-router";
import { PolicyPage } from "@/components/site/PolicyPage";
import { WINDOW_EXPIRED_MESSAGE } from "@/lib/returns";

export const Route = createFileRoute("/refund-policy")({
  head: () => ({
    meta: [
      { title: "Refund Policy | SARTISTIC Mehndi" },
      {
        name: "description",
        content:
          "How refunds work at SARTISTIC: request within 3 days of delivery; refunds go back to your original payment method.",
      },
      { property: "og:title", content: "Refund Policy | SARTISTIC Mehndi" },
    ],
  }),
  component: RefundPolicy,
});

function RefundPolicy() {
  return (
    <PolicyPage
      eyebrow="Customer care"
      title="Refund Policy"
      updated="18 November 2026"
      intro={
        <p>
          If there's a problem with your order, you can request a refund within{" "}
          <strong className="text-foreground">3 days of delivery</strong>. Approved refunds are
          returned to your original payment method wherever possible.
        </p>
      }
      related={{ to: "/return-policy", label: "Return Policy" }}
      sections={[
        {
          id: "window",
          title: "The 3-day refund window",
          body: (
            <>
              <p>
                Refund requests are accepted from the moment your order is delivered until{" "}
                <strong>11:59 PM (India time) on the third day after the delivery date</strong>, as
                recorded by our courier partner. Your order page shows the delivery date and exactly
                how long you have left.
              </p>
              <p>
                After that, refund requests can no longer be made online and your order page will
                show: “{WINDOW_EXPIRED_MESSAGE}”
              </p>
            </>
          ),
        },
        {
          id: "eligible",
          title: "Who can request a refund",
          body: (
            <ul>
              <li>
                Orders that have been delivered and paid for — online payments, or Cash on Delivery
                orders once the courier has collected payment.
              </li>
              <li>
                Items that arrived damaged or leaking, were incorrect or missing, are past their
                expiry date, or that you've returned to us.
              </li>
              <li>Each item in an order can have one refund request.</li>
            </ul>
          ),
        },
        {
          id: "how",
          title: "How to request a refund",
          body: (
            <ol>
              <li>
                Sign in and open{" "}
                <Link to="/account/orders" className="underline underline-offset-4">
                  My Orders
                </Link>
                , then choose the order.
              </li>
              <li>Under “Returns &amp; refunds”, select “Request refund” next to the item.</li>
              <li>Choose a reason, add any details, and attach photos if you can.</li>
              <li>Submit, and follow the status on your order page.</li>
            </ol>
          ),
        },
        {
          id: "review",
          title: "Review and status",
          body: (
            <>
              <p>
                Refunds are only issued after our team has reviewed and verified your request —
                submitting a request doesn't refund it automatically. You'll see these stages:
              </p>
              <ul>
                <li>
                  <strong>Refund Requested</strong> — we've received your request.
                </li>
                <li>
                  <strong>Under Review</strong> — we're checking the details (and, where relevant,
                  the returned item).
                </li>
                <li>
                  <strong>Approved</strong> — your refund amount is confirmed.
                </li>
                <li>
                  <strong>Processing</strong> — the refund has been sent to the payment provider.
                </li>
                <li>
                  <strong>Refunded</strong> — the payment provider has completed the refund.
                </li>
                <li>
                  <strong>Rejected</strong> — if we can't approve it, we'll explain why on your
                  order page.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "amount",
          title: "How much is refunded",
          body: (
            <>
              <p>
                You'll be refunded what you paid for the item, including any discount applied to
                your order. Shipping charges are not normally refunded, except where the order
                arrived damaged, defective or incorrect.
              </p>
              <p>The confirmed amount is shown on your order page once your refund is approved.</p>
            </>
          ),
        },
        {
          id: "method",
          title: "How you'll receive it",
          body: (
            <ul>
              <li>
                <strong>Online payments</strong> (card, UPI, net banking, wallet) are refunded to
                the same account through our payment partner, Razorpay. Once processed, banks
                usually take 5–7 working days to show the refund.
              </li>
              <li>
                <strong>Cash on Delivery</strong> payments can't be returned in cash. We'll contact
                you to arrange a bank transfer or UPI refund.
              </li>
            </ul>
          ),
        },
      ]}
    />
  );
}
