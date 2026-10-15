# Set up shared complaints and administrator access

The website is static, so it needs a hosted database and authentication service to share complaints across visitors. This project uses Supabase. Follow these steps once you have created a Supabase project:

1. In the Supabase project, open **SQL Editor** and run the contents of `supabase-setup.sql`.
2. In **Project Settings → API**, copy the Project URL and the publishable key (or legacy anon key) into `supabase-config.js`. Do not put a `service_role` or secret key in this file. The browser key is public; the database Row Level Security policies protect the data.
3. In **Authentication → Providers**, enable Email/password sign-in. Invite the administrator’s real email address from **Authentication → Users** and complete email verification.
4. In SQL Editor, add that invited account to the administrator allowlist, replacing the placeholder with the invited email:

   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'ADMIN_EMAIL_HERE'
   on conflict (user_id) do nothing;
   ```

   The query must insert one row. If it inserts none, invite and verify the address first.
5. Publish the updated site. Open **Admin login**, then sign in with the invited account’s email and password.

Public complaint details are visible in the community list. Reporter email addresses are stored in a separate table and can only be read by an administrator. Uploaded photos are kept in a private storage bucket; only an administrator can open them. Photos must be JPG, PNG, or WebP and are limited to 5 MB. Only an administrator can change complaint status. Existing demo entries and browser-local submissions are not transferred to the shared database.

Until the project URL and key are configured, the site stays in local demo mode and the admin login remains unavailable.
