# Apple Season Tracker

Track apple sales, orchard expenses and profit for each season. HTML, CSS and JavaScript with a Supabase (PostgreSQL) backend.

## Features
- Email and password login; each user sees only their own records
- Sales and expenses, profit or loss, reports by variety and category
- JSON backup and import, CSV export
- Mobile friendly, dark mode

## Setup
1. Create a free project at supabase.com.
2. **SQL Editor**: paste `schema.sql` and run it.
3. **Authentication > Sign In / Providers > Email**: turn off **Confirm email**
   (Supabase's built-in mailer only delivers to your project team).
4. **Project Settings > API Keys**: copy the project URL and publishable key into `config.js`.
5. Host with GitHub Pages.

## Notes
- The publishable key is meant to be public; Row Level Security protects the data.
  Never commit a secret or service_role key.
- Internet is needed to log in, view and save records.
- With email confirmation off, anyone can sign up with any address. For real use,
  add custom SMTP and turn confirmation back on.
- No password reset yet.
