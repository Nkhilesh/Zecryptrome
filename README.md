# Zecryptrome

## Supabase setup

1. Run `supabase-schema.sql` in the SQL Editor of the project configured in `supabase-config.js`. No existing tables are modified.
2. Enable email/password authentication in Supabase Auth. Configure the site URL and allowed redirect URLs for your hosted site or local HTTP server.
3. Serve the app over HTTP (for example `python -m http.server 8000` from this directory). Open the homepage and create an account, confirm the email if required, then sign in.
4. On an empty account, use **Import browser data** to copy existing local records into that account. Nothing is automatically assigned to an account. Existing rows in a `transactions` table are not migrated by this import.

All existing save/edit/delete/undo actions now write through `AppStorage` to the `zecryptrome_data` table: income and recurring income, expenses, subscriptions, limits, quick buttons, savings and goals, loans and repayment history, scanned receipt/bill records, fuel presets, homepage cards, calendar filters, and theme changes. Navigation, calculators, OCR, search and filters retain their existing behavior. Scan history includes any thumbnails already stored in the history records.

Each dataset is a text JSON document keyed by account and dataset name; amounts retain their existing integer-cent representation. Supabase RLS limits reads and writes to the signed-in owner. The browser uses only the public publishable key; never add a service-role key to frontend code.

Pages load cloud data before running page scripts. Writes update a per-account local cache and a persistent pending queue, then upsert to Supabase. The account panel reports pending writes and errors; Retry sync or reconnecting retries them. Reloading restores pending writes. Do not clear browser storage with unsynced changes. Signing out waits for successful sync. A failed initial cloud load keeps the page inactive instead of saving empty defaults over existing records.

Sync is document-level and last-write-wins. Avoid editing the same dataset in multiple tabs/devices simultaneously. This implementation does not merge concurrent edits or automatically refresh already-open pages. Reload to fetch changes made elsewhere. The account panel distinguishes successful cloud saves from changes waiting on the device.

Verify with two test accounts: create/edit/delete/undo records on each feature, wait for the saved status, then reload and check the other related pages. Confirm that the second account cannot see the first account's data. Test pending writes with the network disabled and Retry sync after reconnecting.
