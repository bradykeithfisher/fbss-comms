# FBSS Communication Calendar — Setup Guide

Your own communication calendar at **comms.fbss.church**: staff sign in with email and password, plan campaigns, assign destinations, write copy with AI, and post straight to Facebook and Instagram.

It runs on three services:

| Service | What it does | Cost |
|---|---|---|
| **Supabase** (supabase.com) | Logins, database, file storage | Free plan is plenty to start |
| **Netlify** (netlify.com) | Hosts the website and the small server functions (AI, posting, invites) | Free plan |
| **Anthropic API** (console.anthropic.com) | The "Write with AI" button | Pay per use, usually a few cents a day |
| **Resend** (resend.com) | Sends assignment, due-date, request and approval emails (and logins/invites through Supabase) | Free up to 3,000 emails a month |

Plan on about an hour for setup. Facebook/Instagram (step 6) can wait until later.

---

> **Already set up an earlier version?** Run `supabase/schema.sql` again in the SQL Editor after every update; it's safe to re-run and adds anything new. Then add any new environment variables in step 3 and redeploy.

## 1. Create the Supabase project

1. Sign up at **supabase.com** and click **New project**. Name it `fbss-comms`, pick a strong database password (save it somewhere safe), and choose the **Central US** region.
2. When it finishes, open **SQL Editor → New query**. Paste the whole contents of `supabase/schema.sql` and click **Run**. You should see "Success."
3. Go to **Authentication → Sign In / Providers**:
   - Leave **Email** on.
   - Turn **off** "Allow new users to sign up." Staff join only by invite.
4. Go to **Authentication → URL Configuration**:
   - **Site URL:** `https://comms.fbss.church` (use your Netlify address until the subdomain is live, then come back and change it).
   - **Redirect URLs:** add `https://comms.fbss.church/**` and your Netlify address, like `https://fbss-comms.netlify.app/**`.
5. **Set up email sending (important).** Supabase's built-in email only reaches people on your Supabase team and sends very few messages per hour, so invites and password resets won't reach staff without this. Use Resend for both Supabase and the app's own emails:
   1. Sign up at **resend.com** and go to **Domains → Add domain**. Enter `fbss.church` and add the DNS records it shows, at the same place you'll add the `comms` record in step 4. Wait until it says **Verified**.
   2. In Resend, go to **API Keys → Create API key** with **Sending access** and copy it. You'll use this key twice: here, and in Netlify (step 3).
   3. In Supabase, go to **Authentication → Emails → SMTP Settings** and turn on custom SMTP:
      - Host: `smtp.resend.com`
      - Port: `465`
      - Username: `resend`
      - Password: your Resend API key
      - Sender email: `comms@fbss.church`
      - Sender name: `FBSS Communications`
6. Optional: under **Authentication → Emails → Templates**, edit the **Invite user** email so it sounds like FBSS.
7. **Create your own admin login:**
   - **Authentication → Users → Add user → Create new user.** Enter your email and a password, and check **Auto Confirm User**.
   - Then in **SQL Editor**, run this with your email:
     ```sql
     update public.profiles set role = 'admin' where email = 'you@fbss.church';
     ```
8. Copy three values for step 3:
   - **Project URL:** click **Connect** at the top of your project's page. It looks like `https://abcd1234.supabase.co`. (Or take the **Reference ID** from **Project Settings → General** and use `https://REFERENCE-ID.supabase.co`.)
   - **Publishable key:** from **Project Settings → API Keys**. It starts with `sb_publishable_`.
   - **Secret key:** from the same page. It starts with `sb_secret_`. Click to reveal it, and keep it private; it only goes into Netlify.

   Use these new keys, not the legacy `anon` / `service_role` keys, which Supabase is retiring.

## 2. Put the code on GitHub

1. Create a free GitHub account if needed, then create a **new private repository** named `fbss-comms`.
2. On the empty repository page, click **uploading an existing file**. Drag in **everything inside** this folder (`netlify.toml`, `README.md`, `public`, `netlify`, `supabase`), then click **Commit changes**.

(If you'd rather not use GitHub, the Netlify CLI works too: `npx netlify-cli deploy --prod` from this folder.)

## 3. Deploy on Netlify

1. Sign up at **netlify.com**, then click **Add new site → Import an existing project → GitHub** and pick `fbss-comms`.
2. Netlify reads the settings from `netlify.toml`, so leave the build command empty. Click **Deploy**.
3. Go to **Site configuration → Environment variables** and add:

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | Project URL from step 1.8 |
   | `SUPABASE_PUBLISHABLE_KEY` | publishable key (`sb_publishable_…`) |
   | `SUPABASE_SECRET_KEY` | secret key (`sb_secret_…`) |
   | `ANTHROPIC_API_KEY` | from step 5 (you can add it later) |
   | `RESEND_API_KEY` | your Resend API key from step 1.5 |
   | `EMAIL_FROM` | `FBSS Communications <comms@fbss.church>` (must use your verified domain) |
   | `REQUEST_NOTIFY_EMAILS` | optional: who hears about new requests, comma separated. If blank, all admins are emailed. |
   | `CHURCH_TIMEZONE` | `America/Chicago` (optional; this is the default) |
   | `MAX_UPLOAD_MB` | optional: largest upload in MB (default `50`; see **Videos** below before raising it) |

4. Go to **Deploys → Trigger deploy → Deploy site** so the new variables take effect.
5. Open the `…netlify.app` address and sign in with the admin login from step 1.7.

## 4. Use comms.fbss.church

1. In Netlify, open **Domain management → Add a domain** and enter `comms.fbss.church`.
2. Netlify shows a DNS record to add. Whoever manages the **fbss.church** domain's DNS adds a **CNAME** record:
   - **Name/Host:** `comms`
   - **Value/Target:** your site's address, like `fbss-comms.netlify.app`

   That might be your website provider, domain registrar or Cloudflare. If you aren't sure, look up where fbss.church's nameservers point. This doesn't touch the main church website.
3. Netlify turns on HTTPS automatically once the record works, usually within an hour.
4. Go back to Supabase **Authentication → URL Configuration** and make sure the **Site URL** is `https://comms.fbss.church`.

## 5. Turn on "Write with AI"

1. Go to **console.anthropic.com**, create an account for the church, and add a payment method under **Billing**. You can set a monthly spending limit.
2. Under **API Keys**, click **Create Key**. Copy it into Netlify as `ANTHROPIC_API_KEY`, then trigger a deploy.

## 6. Connect Facebook and Instagram (direct posting)

Requirements:
- The church's Instagram must be a **professional (Business or Creator) account** linked to the church's **Facebook Page**. Set that up in the Instagram app under Settings → Account type and tools, and link it to the Page.
- The Page should be owned by the church's **Meta Business portfolio** (business.facebook.com).

Steps:
1. Go to **developers.facebook.com** → **My Apps → Create App**. Choose the **Business** type and connect it to the church's Business portfolio. Name it something like "FBSS Comms Calendar."
2. In **business.facebook.com → Settings → Users → System users**, click **Add**. Name it "Comms Calendar" and give it the **Admin** role.
3. With the system user selected, click **Assign assets**. Give it **full control** of the church's Facebook Page and Instagram account.
4. Click **Generate new token**:
   - Choose the app from step 1.
   - Set **Token expiration: Never**.
   - Tick these permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`.
   - Copy the token.
5. Find your **Page ID**: on the Facebook Page, go to **About → Page transparency** (or Page settings). It's a long number.
6. In the calendar, go to **Settings → Facebook & Instagram** (admins only), paste the Page ID and token, and click **Connect**. You should see the Page name and Instagram username.

Meta may ask you to complete **Business Verification** or **App Review** for these permissions. Apps used only by the business that owns them often work without review, but if posting fails with a permissions error, follow the instructions in the Meta developer dashboard.

**How posting works once connected:**
- Open any Facebook or Instagram destination. Click **Post now**, or tick **Post automatically**. Automatic posts go out at the destination's date and time, checked every 5 minutes, but **only after it's marked Approved or Scheduled**.
- When something posts, its status changes to **Posted** with a **View post** link.
- If something fails, the reason shows on the destination and under **My work → Needs attention**. Fix the problem and click **Try again**.
- Instagram needs at least one photo. Photos added in the app are converted to JPEG automatically, as Instagram requires. Multiple photos become a carousel (up to 10).

## 7. Assignments, auto-assign and email reminders

Each destination has an **Assigned to** person. **It's due on the day it's scheduled to go out**, so moving a destination to a new day moves its due date with it.
- When someone is assigned, they get an email right away with a link to the item. Assigning yourself doesn't send one.
- At **7 AM Central** (8 AM during daylight saving time) on the scheduled day, each person gets one email listing everything going out that day that hasn't been posted yet.
- **My work** is each person's task list, sorted by due date, with overdue items marked in red.

**Auto-assign:** in **Settings → Destinations**, set **Auto-assign to** for any destination type (for example Social goes to Sarah and the Weekly Update email goes to Brady).
- Every new destination of that type is assigned to that person automatically, whether it's added with **Add destinations**, dragged onto the calendar, or created from a request. They get the task and the email.
- In **Add destinations**, the owner is filled in for you. Change it, or pick **Unassigned**, before adding.
- Request plans that aren't approved yet don't send assignment emails. They all go out the moment you approve, so nobody gets tasks for a request you might decline.
- Changing an auto-assign setting only affects destinations created afterward. Existing assignments stay as they are.

## Dates and times

Only **Facebook, Instagram and Social** destinations have a time, because that's when they post automatically (9:00 AM unless you change it). Every other destination (email, slides, bulletin, announcements, text, website) is date-only, and emails to staff and requesters show just the date for those.

## One-off posts

Not everything needs a campaign. On the **Calendar** page, click **+ One-off post**, or click **+ Add** on any day and choose **One-off post**.
- A one-off post has its own **title** and **What's it about?** details, which the AI writer uses. It also has everything other destinations have: date, time, destination, owner, photos, copy, status, and Facebook/Instagram posting.
- One-off posts show on the calendars in slate blue and appear in **My work**, assignment emails and morning reminders like any other item.
- The **Campaign** dropdown on any destination moves it into a campaign, or out of one to make it a one-off.

## 8. Communication request form

Staff and ministry leaders request communications at **https://comms.fbss.church/request**. No login is needed. Share that link in your staff email, or put it on the church website.

- The form collects:
  - their name and email
  - the event name, start and end dates, start and end times, and location
  - a communication description
  - which destinations they want (or "Not sure")
  - any files: posters, photos, PDFs, up to 15 files of 50 MB each
- New requests appear under the **Requests** tab with a count badge, and admins get an email (or the addresses in `REQUEST_NOTIFY_EMAILS`).
- **Plan on calendar** creates a campaign from the request (event details, files and requested destinations) and opens its advertising calendar. Drag each destination to the day it should go out.
  - Until you approve, the campaign shows as **Pending approval**, with striped chips on the calendars, and a banner at the top of the page.
- **Approve & email** (on the banner or the request) shows the schedule. It then emails the requester a list of every destination with its date and time, plus your message if you add one.
  - If you approve without planning first, a campaign is still created, with destinations 3 days before the event.
- **Decline** emails them if you leave that checked, and can delete the planned campaign.
- **Only admins can approve, decline or delete requests.** Editors can view requests and plan them on the calendar. They see "Waiting for admin approval" until an admin approves. This is enforced on the server, not just hidden in the app.
- The form has a hidden spam trap. If spam ever becomes a problem, a CAPTCHA can be added.

## 9. Social destination (Facebook + Instagram together)

The **Social (Facebook + Instagram)** destination posts one caption and the same photos to both platforms. Keep using separate Facebook and Instagram destinations when you want different posts on each.
- If you set up an earlier version, go to **Settings → Destinations** and click **+ Add Social (Facebook + Instagram)**.
- The drawer shows a Facebook preview and an Instagram preview side by side.
- Before posting anything, Social checks both platforms' requirements: at least one photo, and a caption under 2,200 characters. That way it won't go out on just one platform because of a fixable problem.
- If one platform fails anyway (say Instagram is down), the other stays posted. The error shows on the destination, and **Try again** retries only the platform that failed, so nothing is posted twice.

### Videos

Facebook, Instagram and Social destinations can post a **video** instead of photos:
- On Facebook it posts as a Page video. On Instagram it posts as a **Reel**, shared to the main feed too.
- A video post has just the one video, with no photos alongside it. The app warns you if you mix them.
- MP4 or MOV, vertical (9:16) is best for Reels.

**Posting runs in the background.** Instagram takes anywhere from about 30 seconds to several minutes to process a video. When you click **Post now**, the app starts the post and shows **Processing**. You can close the window; the every-5-minute background job checks on it and finishes posting. **Check now** checks right away. Multi-photo posts work the same way, so they never time out.

**Video file size:** uploads are limited to **50 MB** by default, which is about a minute of 1080p phone video. Supabase's free plan doesn't allow bigger files. To go larger:
1. Upgrade Supabase to Pro and raise the upload limit under **Project Settings → Storage**.
2. Run this in the SQL Editor, using your new limit in bytes (this example is 500 MB):
   ```sql
   update storage.buckets set file_size_limit = 524288000 where id = 'files';
   ```
3. Add `MAX_UPLOAD_MB` (for example `500`) to the Netlify environment variables and redeploy.

## 10. Destination icons

In **Settings → Destinations**, click any destination's icon to choose a new one. You can search thousands of free icons from **Lucide**, plus brand logos (YouTube, TikTok, Spotify and more) from **Simple Icons**. Icons load from the free Iconify service (api.iconify.design). If it's ever unreachable, the two-letter labels show instead.

## 11. Invite your team

Go to **Settings → Team**, enter a name and email, and click **Send invite**. They get an email, click the link, choose a password, and they're in.

- **Admins** can invite or remove people, change roles, connect Facebook, and approve, decline or delete requests.
- **Editors** can do everything else.
- Anyone can reset their own password with **Forgot password?** on the sign-in page.

---

## Troubleshooting

- **"The site is missing SUPABASE_URL…"**: add the environment variables in Netlify, then trigger a deploy.
- **Sign-in or saving fails with a key error**: check that `SUPABASE_PUBLISHABLE_KEY` starts with `sb_publishable_` and `SUPABASE_SECRET_KEY` starts with `sb_secret_`, with no spaces before or after.
- **Invites or reset emails never arrive**: set up SMTP (step 1.5) and check spam folders.
- **The invite link says "expired"**: links last 24 hours. Send a new invite.
- **AI says it isn't set up**: add `ANTHROPIC_API_KEY` in Netlify and redeploy.
- **Assignment or request emails don't arrive**: check that `RESEND_API_KEY` and `EMAIL_FROM` are set in Netlify, that `EMAIL_FROM` uses your verified domain, and look in Resend → **Logs**.
- **Request form says it's unavailable**: the Netlify environment variables are missing, or `schema.sql` hasn't been re-run since this update.
- **"Facebook said: …" when connecting**: the token is missing a permission or isn't assigned to the Page. Regenerate it (step 6.4).

## Security notes

- Signups are off, so only invited staff can sign in.
- The Supabase secret key and the Facebook token stay on the server and are never sent to browsers.
- The public request form can only upload into its own new folder through one-time upload links, and can't read or change anything else.
- Uploaded files sit in a storage bucket with **public links**, because Instagram needs to fetch photos from a public address. Each link is long and unguessable, but anyone who has one can open the file. Don't upload private documents.

## What's in this folder

```
public/                 the staff app (index.html, app.js, styles.css, logo files)
public/request/         the public request form (with public/request.js)
netlify/functions/      server functions: config, ai-copy, team, social, publish-now,
                        publish-scheduled (every 5 min), notify-assigned, due-reminders (daily),
                        request-form, request-upload, request-submit, request-decision
netlify/lib/            shared helpers, email templates, and Facebook/Instagram posting code
supabase/schema.sql     database tables, security rules, storage bucket
netlify.toml            Netlify settings
```

Brand: colors and logo come from the FBSS Brand Guide (Kiest Creative). Hyogo, Mr Eaves XL Mod and Baskerville are shown on the web with the free Google Fonts Marcellus, Jost and Libre Baskerville. If the church licenses the original fonts for web use (for example through Adobe Fonts), they can be swapped in by editing the `--f-title`, `--f-ui` and `--f-body` lines at the top of `public/styles.css`.
