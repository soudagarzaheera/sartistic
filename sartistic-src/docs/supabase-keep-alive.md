# Supabase keep-alive (GitHub Actions)

Supabase pauses Free Plan projects after about a week without activity. The
workflow [`.github/workflows/supabase-keep-alive.yml`](../.github/workflows/supabase-keep-alive.yml)
stops that by running a small read-only query every 3 days.

## What it does

- Runs at 09:00 UTC on days 1, 4, 7, … of each month (`0 9 */3 * *`). It can also be run by hand.
- Runs [`.github/scripts/supabase-keep-alive.sh`](../.github/scripts/supabase-keep-alive.sh), which sends:

  ```
  GET {SUPABASE_URL}/rest/v1/site_settings?select=key&limit=1
  ```

  PostgREST runs this as a real `SELECT` on Postgres, so it counts as database activity.
- **Why `site_settings`:** the `anon` role can already read it (`GRANT SELECT ... TO anon` and the
  RLS policy `"public read settings"`, `USING (true)`). It holds no user data, and the storefront
  already reads it (`src/lib/catalog.ts`). No schema, RLS, auth or app changes are needed.
- Logs the HTTP status and fails the run with a clear `::error::` message in these cases:
  missing secrets, a malformed URL, a network error, 401/403 (wrong key), 404, 5xx (project
  paused), or a response that is not JSON. curl retries temporary failures 3 times.
- Refuses to run if the key is a `service_role` JWT or an `sb_secret_...` key.

## Setup: add the repository secrets

1. In the Supabase dashboard, open the project and go to **Project Settings → API** (or **API Keys**).
   Copy:
   - **Project URL**, for example `https://<project-ref>.supabase.co`
   - The **publishable** key (`sb_publishable_...`) or the legacy **anon** key (`eyJ...`).
     These are the same values as `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`.
2. On GitHub, open the repository and go to **Settings → Secrets and variables → Actions → New repository secret**.
3. Add two secrets:

   | Name                | Value                                  |
   | ------------------- | -------------------------------------- |
   | `SUPABASE_URL`      | Project URL (no trailing path)         |
   | `SUPABASE_ANON_KEY` | Publishable key **or** legacy anon key |

   ⚠️ Never add the `service_role` / secret key or the database password. The workflow does not need them.

## Test it

1. Go to the **Actions** tab and open **Supabase keep-alive**.
2. Click **Run workflow**.
3. Open the run. A successful log looks like this:

   ```
   HTTP status: 200
   Query succeeded: read 1 row from public.site_settings.
   Supabase keep-alive OK at 2026-...Z
   ```

To run it locally:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=sb_publishable_... \
  bash .github/scripts/supabase-keep-alive.sh
```

## Notes

- The `.github` folder must be at the **root of the Git repository** for GitHub to pick it up.
- GitHub turns off scheduled workflows in public repositories after 60 days with no commits.
  If that happens, re-enable the workflow from the Actions tab. Turn on failure email
  notifications in your GitHub settings so you hear about failed runs.
- Scheduled runs can start a few minutes late. A 3-day schedule leaves plenty of margin before
  Supabase's ~7-day pause.
