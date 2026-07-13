# HoneyButter — shared tasks and second brain

HoneyButter is a local-first prototype for a private shared workspace. It combines daily and weekly task planning with a searchable knowledge vault and a retrieval-based “Brain” chat.

## Run it

No build tools are required. Open `index.html` directly, or serve the folder locally:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000`.

The website automatically uses local storage until Supabase is configured. Once connected, Supabase becomes the shared source of truth and local storage remains a quick local cache.

## What works now

- Add, edit, complete, filter, search, and delete tasks
- Assign work to either partner or both people
- Daily focus and seven-day planning views
- Add, edit, tag, filter, search, and delete vault notes
- Ask the local Brain questions grounded in tasks and notes
- Global search with `Ctrl/Cmd + K`
- Quick-capture a note with `N`
- Responsive desktop and mobile layout
- Supabase email authentication and secure two-person workspaces
- A dedicated two-profile login page with safe on-device account switching
- Live updates between both users with Supabase Realtime
- Live presence showing whether each person is online and which HoneyButter section they are viewing
- Interactive knowledge graph generated from notes, tags, spaces, and tasks
- Knowledge graph export as JSON or SVG
- Identity-aware personal task views for Aiman Firdaus and Abyadina Irisha
- A combined dashboard showing both workloads and today's classes
- Separate weekly timetables with a shared comparison view
- Private personal-Brain memories protected by RLS, plus shared-Brain memories

## Signing in and switching people

Aiman and Abyadina each create and use a separate Supabase email/password account. Choosing a person on the login page changes the interface label only; it never bypasses authentication or stores the other person's password. Use the top-right account menu and **Switch account** to sign out locally and return to the two-person login page. Other signed-in devices remain connected.

Once both accounts belong to the same HoneyButter workspace, the shared dashboard shows online/offline presence and the section each person is viewing. Detailed changes also appear in Activity history. Private Brain note contents remain visible only to their owner.

## Upgrade an existing database to the two-person model

If the original HoneyButter schema was already run, open Supabase **SQL Editor**, paste the entire contents of `supabase/v2_two_people.sql`, and click **Run** once. This preserves existing tasks and notes while adding:

- Identity slots for Aiman Firdaus and Abyadina Irisha
- Private/shared note visibility and ownership
- The timetable table and its security policies
- Realtime updates for timetable changes

After the migration succeeds, refresh the deployed Render site. The account that originally created the workspace is assigned to Aiman's interface; the account that joins with the invite code is assigned to Abyadina's interface. Existing notes remain shared unless changed to private.

## V3 advanced upgrade

After `v2_two_people.sql`, run the entire `supabase/v3_advanced.sql` file once in Supabase SQL Editor. V3 adds:

- Course records and assignment-to-course links
- Estimated effort and smart workload ranking
- Shared activity history
- Document source metadata
- Realtime course and activity updates
- Clickable account and notification menus
- `.ics` timetable import/export for Google Calendar, Apple Calendar, and Outlook
- Local PDF/text extraction plus protected image OCR and audio transcription endpoints

### Activate the real AI Brain and media extraction

The public website never receives the OpenAI API key. The key belongs in Supabase Edge Function secrets.

1. Install and sign in to the Supabase CLI.
2. Link this repository to the existing Supabase project.
3. Store the secret and deploy both functions:

```powershell
supabase link --project-ref YOUR_PROJECT_REFERENCE
supabase secrets set OPENAI_API_KEY=YOUR_OPENAI_API_KEY
supabase functions deploy brain
supabase functions deploy ingest
```

The function source lives in `supabase/functions/brain/index.ts` and `supabase/functions/ingest/index.ts`. The Brain uses the OpenAI Responses API with only the notes, tasks, courses, and timetable rows already accessible to the signed-in person. If the function or key is unavailable, HoneyButter automatically falls back to its local grounded retrieval instead of breaking chat.

Image uploads use the protected ingestion function for OCR and factual summarization. Audio uploads use protected transcription. PDFs, Markdown, CSV, and text files are extracted in the browser and saved as private Brain memories by default.

### Calendar workflow

Use **Timetables → Import .ics** to read recurring calendar events into the signed-in person's timetable. Use **Export .ics** to create a calendar file that can be imported into Google Calendar. Live two-way Google Calendar synchronization would additionally require a Google Cloud OAuth client; no Google secret is placed in the static website.

## Connect Supabase

No plugin or local package installation is required. The Supabase browser client is loaded from a pinned CDN version.

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, create a new query, paste the complete contents of `supabase/schema.sql`, and click **Run**.
3. Open **Project Settings → API**. Copy the Project URL and the **publishable** key.
4. Open `supabase-config.js` and replace both placeholders:

```js
window.KIN_SUPABASE_CONFIG = {
  url: "https://your-project.supabase.co",
  publishableKey: "sb_publishable_your_key"
};
```

5. In **Authentication → URL Configuration**, set the Site URL to `http://localhost:8000` while developing. Add your eventual deployed URL to Redirect URLs.
6. Start the local server with `python -m http.server 8000`, then refresh the page.
7. Click **Invite your person** in the bottom-left corner.
8. Create your account and then click **Create our shared workspace**. Existing local tasks and notes are uploaded automatically.
9. Send the displayed invite code to your girlfriend. On her device, she creates her own account, signs in, enters that code, and clicks **Join**.

If email confirmation is enabled in Supabase, each person must click the confirmation link before signing in. For a quick private test, this setting can be changed under Authentication provider settings.

### Security notes

- A publishable key is designed for browser clients; the SQL file enables Row Level Security to protect every row.
- Never put a `service_role` key or secret key in this repository.
- Invite codes only work for an authenticated user, and each workspace is limited to two members.
- The SQL functions handle workspace creation and joining so the browser never receives privileged database access.

## Knowledge graph

Open **Knowledge graph** in the sidebar. HoneyButter creates nodes for:

- Vault memories
- Tags extracted from those memories
- Spaces such as Personal, Study, Plans, and Home
- Unfinished tasks

Select a node to inspect its relationships or open its source. Search highlights a connected subgraph. **Export JSON** produces machine-readable nodes and edges for Graphology, Neo4j, Gephi, or another graph system. **Export SVG** produces a portable visual.

The current graph uses explicit tags and categories, which makes every connection explainable. A more advanced version can add semantic connections by embedding each note and linking notes whose cosine similarity exceeds a chosen threshold.

## Upgrade the Brain

The current Brain uses local keyword retrieval, so it works without an API key. A production AI flow should be server-side:

1. Split vault notes into chunks.
2. Create embeddings for each chunk and store them using `pgvector`.
3. On each question, retrieve the most similar chunks plus relevant open tasks.
4. Send only that grounded context to the selected model.
5. Return citations that open the source note or task.

Never put an OpenAI or Anthropic API key in `app.js`; browser code is public. Put model calls in a Supabase Edge Function, Next.js API route, or another protected server endpoint.

## Suggested production structure

For the next phase, migrate the frontend to Next.js with TypeScript:

```text
app/
  (auth)/
  dashboard/
  tasks/
  week/
  vault/
  api/brain/
components/
lib/
  supabase/
  retrieval/
```

The current UI can be carried across component by component; its state operations are intentionally centralized in `app.js` to make that migration straightforward.

## Deploy on Render

This repository includes a `render.yaml` Blueprint for a free Render Static Site. No Node or Python server is needed in production because Supabase provides the backend.

1. Create a new GitHub repository specifically for the contents of this `Homework system` folder.
2. Push `index.html`, `styles.css`, `app.js`, `supabase-config.js`, `supabase-client.js`, `render.yaml`, and the other project files to that repository.
3. In Render, choose **New → Blueprint** and connect the repository. Render reads `render.yaml` and creates `kin-shared-workspace` as a Static Site.
4. Alternatively, choose **New → Static Site** and use these manual values:
   - Root Directory: leave empty when `index.html` is at the repository root
   - Build Command: `echo "No build required"`
   - Publish Directory: `.`
5. After deployment, copy the generated URL, such as `https://kin-shared-workspace.onrender.com`.
6. In Supabase, open **Authentication → URL Configuration**. Set **Site URL** to the Render URL and add both the Render URL and `http://localhost:8000` to the allowed Redirect URLs.
7. Open the Render URL on both devices. Each person creates their own account; the first creates the workspace and the second joins with its invite code.

The Supabase publishable key in `supabase-config.js` is browser configuration and can be deployed publicly because access is controlled by the included Row Level Security policies. Never commit a secret key, `sb_secret_...`, `service_role` key, database password, or deploy hook URL.
