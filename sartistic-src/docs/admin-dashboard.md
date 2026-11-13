# Admin Dashboard — setup & operations

Admin URL: **`https://<your-domain>/admin`** (sign-in page: `/admin/login`).

## 1. Apply the database migrations

Run these in order (Supabase CLI `supabase db push`, or paste each file into
Supabase Dashboard → SQL Editor → Run):

1. `supabase/migrations/20261113000000_cone_packs_only.sql` — the 4 / 8 / 12 cone packs.
2. `supabase/migrations/20261114000000_admin_dashboard.sql` — everything the dashboard needs:
   - `collections` + `collection_products` (seeded from existing categories)
   - `homepage_sections` (seeded with the current homepage wording)
   - `order_status_history` + trigger
   - trigger `orders_protect_payment_fields` — payment status, Razorpay references and
     amounts can only be changed by server code (service role), never by an admin or
     customer through the API
   - public Storage buckets `product-images`, `gallery-images`, `homepage-banners`,
     `collection-images` (10 MB limit, image types only) and admin-only write/list policies

Both files are idempotent — safe to run again.

## 2. Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Where used | Notes |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | browser | public |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | server | same values |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | **required** for payment confirmation, webhook and adding/removing admins. Never prefix with `VITE_`. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | server | unchanged |

No new variables were added.

In Supabase → Authentication → URL Configuration, make sure
`https://<your-domain>/reset-password` is in **Redirect URLs** (used by "Forgot password").

## 3. Create the first (owner) admin — securely

There is no public admin sign-up. Admin rights live in `public.user_roles`, which
browsers can't write to.

1. Create the owner's account: sign up normally at `https://<your-domain>/auth`
   (or Supabase Dashboard → Authentication → Users → Add user, with "Auto confirm").
2. In Supabase Dashboard → SQL Editor, run (replace the email):

   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'admin' FROM auth.users WHERE email = 'owner@example.com'
   ON CONFLICT (user_id, role) DO NOTHING;
   ```

3. Sign in at `/admin/login`.

Further admins: the person signs up on the store, then an existing admin adds their email
under **Admin → Settings → Admin team**. Admins can remove others but not themselves,
and the last admin can't be removed.

## 4. How security is enforced

- **Sign-in**: Supabase Auth (email + password).
- **Authorization**: `/admin` asks the server (`verifyAdminSession` server function),
  which checks `has_role(auth.uid(), 'admin')` in the database. Nothing from
  localStorage or React state is trusted.
- **Data**: every admin read/write goes through Supabase RLS policies that require
  `has_role(auth.uid(), 'admin')`. A customer calling the API directly gets nothing.
- **Payments**: payment status is written only by `verifyCheckoutPayment` (HMAC-verified)
  and the Razorpay webhook. A database trigger rejects any other change.
- **Storage**: only admins can upload/replace/delete in the four image buckets; files are
  served by public URL.

## 5. Content changes are live immediately

All storefront content (products, prices, stock, collections, categories, homepage
banner/text/sections, featured items) is read from Supabase on each page view —
no GitHub commit or Vercel deployment needed. Storefront queries are never treated
as fresh in the browser, so visitors see changes on their next page load.

## 6. Manual test checklist (after the migration)

1. `/admin` while signed out → redirected to `/admin/login`.
2. Sign in as a normal customer at `/admin/login` → "doesn't have admin access".
3. Sign in as owner → dashboard loads.
4. Products → New product with 2+ images → appears on `/shop`.
5. Change its price → product page shows the new price after refresh.
6. Reorder images / make another image main → product card updates.
7. Hide it → it disappears from `/shop`; delete it → gone from admin list.
8. Collections → create one with a cover image and products → visible on `/collections`.
9. Homepage → replace hero image and heading → `/` shows them.
10. Image Library → uploaded files listed, refresh keeps them.
11. Orders → payment status is read-only; change fulfilment status → History shows it.
12. Complete a Razorpay test payment → order shows Paid (verification still works).
13. In the browser console as a customer:
    `await supabase.from('orders').update({payment_status:'paid'}).eq('id', '<own order>')`
    → error / no rows changed.
