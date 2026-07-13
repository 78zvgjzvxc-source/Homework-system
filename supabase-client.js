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
  const taskToRow = (task) => ({ id: task.id, workspace_id: workspace.id, title: task.title, details: task.details || "", due_date: task.date, owner_key: task.owner, category: task.category, priority: task.priority, completed: task.completed, course_id: task.courseId || null, estimated_minutes: task.estimate || 60, created_at: task.createdAt });
  const noteToRow = (note) => ({ id: note.id, workspace_id: workspace.id, title: note.title, content: note.content, category: note.category, tags: note.tags || [], owner_id: note.visibility === "private" ? session.user.id : null, visibility: note.visibility || "shared", source_name: note.sourceName || null, created_at: note.createdAt, updated_at: note.updatedAt });
  const timetableToRow = (item) => ({ id: item.id, workspace_id: workspace.id, owner_key: item.owner, course_code: item.courseCode || "", title: item.title, day_of_week: item.day, start_time: item.start, end_time: item.end, location: item.location || "", color: item.color || "blue", created_at: item.createdAt });
  const courseToRow = (item) => ({ id: item.id, workspace_id: workspace.id, owner_key: item.owner, code: item.code, title: item.title, lecturer: item.lecturer || "", color: item.color || "blue", credits: item.credits || 0, created_at: item.createdAt });
  const activityToRow = (item) => ({ id: item.id, workspace_id: workspace.id, actor_name: item.actor, message: item.message, created_at: item.createdAt });
  const rowToTask = (row) => ({ id: row.id, title: row.title, details: row.details || "", date: row.due_date, owner: row.owner_key, category: row.category, priority: row.priority, completed: row.completed, courseId: row.course_id, estimate: row.estimated_minutes || 60, createdAt: row.created_at });
  const rowToNote = (row) => ({ id: row.id, title: row.title, content: row.content, category: row.category, tags: row.tags || [], ownerId: row.owner_id, visibility: row.visibility || "shared", sourceName: row.source_name, createdAt: row.created_at, updatedAt: row.updated_at });
  const rowToTimetable = (row) => ({ id: row.id, owner: row.owner_key, courseCode: row.course_code || "", title: row.title, day: row.day_of_week, start: String(row.start_time).slice(0, 5), end: String(row.end_time).slice(0, 5), location: row.location || "", color: row.color || "blue", createdAt: row.created_at });
  const rowToCourse = (row) => ({ id: row.id, owner: row.owner_key, code: row.code, title: row.title, lecturer: row.lecturer || "", color: row.color || "blue", credits: row.credits || 0, createdAt: row.created_at });
  const rowToActivity = (row) => ({ id: row.id, actor: row.actor_name, message: row.message, createdAt: row.created_at });

  async function findWorkspace() {
    if (!session) return null;
    const memberships = check(await client.from("workspace_members").select("workspace_id,member_slot,display_name").eq("user_id", session.user.id).limit(1));
    if (!memberships.length) { workspace = null; return null; }
    workspace = check(await client.from("workspaces").select("id,name,invite_code,name_one,name_two").eq("id", memberships[0].workspace_id).single());
    workspace.currentMember = { slot: memberships[0].member_slot, displayName: memberships[0].display_name, userId: session.user.id };
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
    const [tasks, notes, timetables, courses, activities] = await Promise.all([
      client.from("tasks").select("*").eq("workspace_id", workspace.id).order("due_date"),
      client.from("notes").select("*").eq("workspace_id", workspace.id).order("updated_at", { ascending: false }),
      client.from("timetables").select("*").eq("workspace_id", workspace.id).order("day_of_week").order("start_time"),
      client.from("courses").select("*").eq("workspace_id", workspace.id).order("code"),
      client.from("activities").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(100)
    ]);
    return { profile: { name: workspace.name_one, partner: workspace.name_two }, tasks: check(tasks).map(rowToTask), notes: check(notes).map(rowToNote), timetables: check(timetables).map(rowToTimetable), courses: check(courses).map(rowToCourse), activities: check(activities).map(rowToActivity) };
  }

  async function syncState(state) {
    if (!workspace) return;
    const operations = [];
    if (state.tasks.length) operations.push(client.from("tasks").upsert(state.tasks.map(taskToRow)));
    if (state.notes.length) operations.push(client.from("notes").upsert(state.notes.map(noteToRow)));
    if (state.timetables?.length) operations.push(client.from("timetables").upsert(state.timetables.map(timetableToRow)));
    if (state.courses?.length) operations.push(client.from("courses").upsert(state.courses.map(courseToRow)));
    if (state.activities?.length) operations.push(client.from("activities").upsert(state.activities.slice(0, 100).map(activityToRow)));
    operations.push(client.from("workspaces").update({ name_one: state.profile.name, name_two: state.profile.partner }).eq("id", workspace.id));
    const results = await Promise.all(operations);
    results.forEach(check);
  }

  async function remove(kind, id) {
    if (!workspace || !["tasks", "notes", "timetables", "courses", "activities"].includes(kind)) return;
    check(await client.from(kind).delete().eq("workspace_id", workspace.id).eq("id", id));
  }

  function subscribe(onChange) {
    if (!workspace) return;
    if (channel) client.removeChannel(channel);
    channel = client.channel(`kin-${workspace.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `workspace_id=eq.${workspace.id}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "notes", filter: `workspace_id=eq.${workspace.id}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "timetables", filter: `workspace_id=eq.${workspace.id}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "courses", filter: `workspace_id=eq.${workspace.id}` }, onChange)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activities", filter: `workspace_id=eq.${workspace.id}` }, onChange)
      .subscribe();
  }

  async function askAI(question, context) {
    if (!client || !session) throw new Error("Sign in to use the cloud Brain");
    const { data, error } = await client.functions.invoke("brain", { body: { question, context } });
    if (error) throw error;
    if (!data?.answer) throw new Error(data?.error || "AI Brain is not configured yet");
    return data.answer;
  }

  async function ingestFile(file) {
    if (!client || !session) throw new Error("Sign in to process this file");
    if (file.size > 8 * 1024 * 1024) throw new Error("Keep AI files under 8 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    const { data, error } = await client.functions.invoke("ingest", { body: { name: file.name, type: file.type, data: btoa(binary) } });
    if (error) throw error;
    if (!data?.text) throw new Error(data?.error || "File extraction failed");
    return data.text;
  }

  window.KinCloud = { configured, init, status, signIn, signUp, signOut, createWorkspace, joinWorkspace, loadState, syncState, remove, subscribe, askAI, ingestFile };
})();
