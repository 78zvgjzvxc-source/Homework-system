# Kin — shared tasks and second brain

Kin is a local-first prototype for a private shared workspace. It combines daily and weekly task planning with a searchable knowledge vault and a retrieval-based “Brain” chat.

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
- Live updates between both users with Supabase Realtime
- Interactive knowledge graph generated from notes, tags, spaces, and tasks
- Knowledge graph export as JSON or SVG

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

Open **Knowledge graph** in the sidebar. Kin creates nodes for:

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
