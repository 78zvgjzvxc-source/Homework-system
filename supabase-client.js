/* Supabase data adapter. The rest of Kin keeps working locally when unconfigured. */
(function () {
  "use strict";
  const config = window.KIN_SUPABASE_CONFIG || {};
  const configured = Boolean(config.url && config.publishableKey && !config.url.startsWith("YOUR_") && !config.publishableKey.startsWith("YOUR_"));
  let client = null;
  let session = null;
  let workspace = null;
  let channel = null;

  const check = ({ data, error }) => { if (error) throw error; return data; };
  const taskToRow = (task) => ({ id: task.id, workspace_id: workspace.id, title: task.title, details: task.details || "", due_date: task.date, owner_key: task.owner, category: task.category, priority: task.priority, completed: task.completed, created_at: task.createdAt });
  const noteToRow = (note) => ({ id: note.id, workspace_id: workspace.id, title: note.title, content: note.content, category: note.category, tags: note.tags || [], created_at: note.createdAt, updated_at: note.updatedAt });
  const rowToTask = (row) => ({ id: row.id, title: row.title, details: row.details || "", date: row.due_date, owner: row.owner_key, category: row.category, priority: row.priority, completed: row.completed, createdAt: row.created_at });
  const rowToNote = (row) => ({ id: row.id, title: row.title, content: row.content, category: row.category, tags: row.tags || [], createdAt: row.created_at, updatedAt: row.updated_at });

  async function findWorkspace() {
    if (!session) return null;
    const memberships = check(await client.from("workspace_members").select("workspace_id").eq("user_id", session.user.id).limit(1));
    if (!memberships.length) { workspace = null; return null; }
    workspace = check(await client.from("workspaces").select("id,name,invite_code,name_one,name_two").eq("id", memberships[0].workspace_id).single());
    return workspace;
  }

  async function init() {
    if (!configured || !window.supabase?.createClient) return { configured: false };
    client = window.supabase.createClient(config.url, config.publishableKey);
    const result = await client.auth.getSession();
    if (result.error) throw result.error;
    session = result.data.session;
    if (session) await findWorkspace();
    return status();
  }

  function status() { return { configured, signedIn: Boolean(session), email: session?.user?.email || "", workspace }; }

  async function signIn(email, password) {
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    session = result.data.session;
    await findWorkspace();
    return status();
  }

  async function signUp(email, password) {
    const result = await client.auth.signUp({ email, password });
    if (result.error) throw result.error;
    session = result.data.session;
    return { ...status(), confirmationRequired: !session };
  }

  async function signOut() {
    if (channel) await client.removeChannel(channel);
    check(await client.auth.signOut());
    session = null; workspace = null; channel = null;
    return status();
  }

  async function createWorkspace(profile) {
    const data = check(await client.rpc("create_kin_workspace", { workspace_name: "Our Kin", first_name: profile.name, second_name: profile.partner }));
    await findWorkspace();
    return data;
  }

  async function joinWorkspace(code) {
    check(await client.rpc("join_kin_workspace", { code: code.trim().toUpperCase() }));
    await findWorkspace();
    return workspace;
  }

  async function loadState() {
    if (!workspace) return null;
    const [tasks, notes] = await Promise.all([
      client.from("tasks").select("*").eq("workspace_id", workspace.id).order("due_date"),
      client.from("notes").select("*").eq("workspace_id", workspace.id).order("updated_at", { ascending: false })
    ]);
    return { profile: { name: workspace.name_one, partner: workspace.name_two }, tasks: check(tasks).map(rowToTask), notes: check(notes).map(rowToNote) };
  }

  async function syncState(state) {
    if (!workspace) return;
    const operations = [];
    if (state.tasks.length) operations.push(client.from("tasks").upsert(state.tasks.map(taskToRow)));
    if (state.notes.length) operations.push(client.from("notes").upsert(state.notes.map(noteToRow)));
    operations.push(client.from("workspaces").update({ name_one: state.profile.name, name_two: state.profile.partner }).eq("id", workspace.id));
    const results = await Promise.all(operations);
    results.forEach(check);
  }

  async function remove(kind, id) {
    if (!workspace || !["tasks", "notes"].includes(kind)) return;
    check(await client.from(kind).delete().eq("workspace_id", workspace.id).eq("id", id));
  }

  function subscribe(onChange) {
    if (!workspace) return;
    if (channel) client.removeChannel(channel);
    channel = client.channel(`kin-${workspace.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `workspace_id=eq.${workspace.id}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "notes", filter: `workspace_id=eq.${workspace.id}` }, onChange)
      .subscribe();
  }

  window.KinCloud = { configured, init, status, signIn, signUp, signOut, createWorkspace, joinWorkspace, loadState, syncState, remove, subscribe };
})();
