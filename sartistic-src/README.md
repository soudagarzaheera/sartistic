# SARTISTIC

Storefront for SARTISTIC, built with TanStack Start, React, Tailwind CSS and Supabase.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in your Supabase and Razorpay keys.
3. Start the dev server: `npm run dev` (http://localhost:8080)

## Build and run

```sh
npm run build
node .output/server/index.mjs
```

The build targets a Node server by default. Set `NITRO_PRESET` (for example `vercel`,
`netlify` or `cloudflare-module`) before building to target another host.
