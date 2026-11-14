# Zecryptrome

A mobile-friendly personal budget app for Mauritius that tracks income, expenses, subscriptions, savings, loans and fuel, then rates your finances against national household statistics.

## Features
- **Dashboard**: available balance, monthly income and spending, customisable category cards and a spending breakdown.
- **Income and expenses**: one-off and recurring income; expenses with automatic categories (English, French and Mauritian keywords), quick-add buttons and spending limits.
- **Subscriptions**: a catalogue of common services with prices in rupees, plus billing reminders.
- **Savings goals**: deposits, withdrawals and progress toward goals such as a car, wedding or emergency fund.
- **Loans**: repayment schedules for reducing-balance, flat-rate and interest-only loans (monthly, fortnightly or weekly).
- **Fuel and vehicle**: trip fuel cost from the Google Maps driving distance between two places (with saved home/work places), using consumption figures for 75 common car models.
- **Scan**: read grocery receipts and bills from a photo (Google Cloud Vision, with Tesseract.js as an on-device fallback).
- **Calendar**: all income, payments, bills and loan instalments by day.
- **Insights**: a financial health score, month-to-month comparisons, unusual spending, a next-month forecast and ways to save.
- **Mauritius insights**: an A–E rating of your money situation based on Statistics Mauritius' Household Budget Survey 2023. It compares your income, the money you keep, the cost of essentials and your savings cushion with the average Mauritian household.
- **Accounts and sync**: email sign-in, cloud sync across devices, offline changes queued until reconnect, and a shared joint budget with a partner.
- Light, dark and system themes; installable as a web app on phones.

## Getting Started

### Prerequisites
- A modern web browser
- A [Supabase](https://supabase.com) project (database and authentication)
- A local HTTP server to run it on your computer, for example Python 3 (`python -m http.server`)
- A Google Maps API key with the Maps JavaScript API and Routes API enabled, for the fuel cost calculator
- Optional: a Google Cloud Vision API key for receipt scanning

### Installation
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd Zecryptrome
   ```
2. In `supabase-config.js`, set `SUPABASE_URL` and `SUPABASE_KEY` to your project's URL and **publishable** key. Never put a service-role key in frontend code.
3. Run `supabase-schema.sql` in the Supabase SQL Editor. It creates the app's tables and row-level security policies, and does not modify existing tables.
4. In Supabase Auth, enable email/password sign-in and add your site URL (and `http://localhost:8000` for local use) to the allowed redirect URLs.
5. Put your Google Maps API key in the Maps loader near the bottom of `fuel.html`. Restrict the key to your site's domain in Google Cloud Console, because it is visible in the browser.
6. Optional, for receipt scanning: deploy a Supabase Edge Function named `hyper-worker` that calls Google Cloud Vision, and store the key as the `GOOGLE_VISION_API_KEY` secret. Without it, scanning falls back to Tesseract.js on the device.
7. Start a local server from the project folder:
   ```bash
   python -m http.server 8000
   ```
   Then open <http://localhost:8000>.

There is no build step. Pushing to `main` deploys the folder to GitHub Pages (`.github/workflows/deploy.yml`).

## Usage
1. Create an account, confirm your email if asked, and sign in.
2. Add your income on the **Income** page and record spending on **Expenses**, or photograph a receipt on **Scan**.
3. Add subscriptions, savings goals and loans so they appear in the calendar, forecasts and insights.
4. Open **Insights** for your health score and forecasts. Tap the **Insights** tile on the home page to see your Mauritius rating, and set how many people live in your household for a fair comparison.

Notes on syncing:
- Each change is saved to the device first, then to Supabase. Unsynced changes are kept through reloads and retried with **Retry sync** in Account settings.
- Sync is last-write-wins per dataset, so avoid editing the same data in two tabs or devices at once. Reload to see changes made elsewhere.
- Don't clear browser storage while changes are still waiting to sync.

## Tech Stack
- JavaScript, HTML, CSS
- [Tailwind CSS](https://tailwindcss.com) (CDN)
- [Supabase](https://supabase.com): Postgres database, authentication, row-level security, Edge Functions
- [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript) (Routes library): driving distance between two addresses for the fuel cost calculator
- [Google Cloud Vision](https://cloud.google.com/vision) and [Tesseract.js](https://tesseract.projectnaptha.com): receipt text recognition
- GitHub Pages: hosting

## Datasets
- **Statistics Mauritius, [Household Budget Survey 2023](https://statsmauritius.govmu.org/Pages/Statistics/ESI/Household_Surveys/HBS_2023.aspx)** (preliminary results, 30 April 2024). Used for the Mauritius insights rating: average and median household disposable income (Rs 55,600 and Rs 45,000), average household consumption (Rs 41,870), household size (3.2), sources of income, the distribution of households by income class (Table 4), and spending by category (Table 6). The figures are in 2023 prices and are not adjusted for inflation since.
- **`mauritius_cars_fuel.json`**: a starter catalogue of fuel consumption (L/100 km) for 75 vehicle models common in Mauritius. The values are indicative estimates, not measured Mauritius averages; calibrate them with your own fill-ups.
- **`subscriptions-catalog.js`**: subscription plans and prices, checked in November 2026. Services billed in US dollars are converted at Rs 47.30 per USD.

## Built with Claude
This project was built with the help of [Claude](https://www.anthropic.com/claude), Anthropic's AI assistant, through [Claude Code](https://claude.com/claude-code). Claude helped write and review code and analyse the Household Budget Survey 2023 data for the Mauritius insights feature.

## License
MIT
