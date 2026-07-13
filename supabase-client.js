/* Supabase data adapter. HoneyButter keeps working locally when unconfigured. */
(function () {
  "use strict";
  const config = window.KIN_SUPABASE_CONFIG || {};
  const configured = Boolean(config.url && config.publishableKey && !config.url.startsWith("YOUR_") && !config.publishableKey.startsWith("YOUR_"));
  let client = null;
  let session = null;
  let workspace = null;
  let channel = null;
  let presenceChannel = null;
  let presencePayload = null;
  let v4Available = false;

  const check = ({ data, error }) => { if (error) throw error; return data; };
  const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
  const authId = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "") ? value : session.user.id;
  const belongsToSession = (value) => !isUuid(value) || value === session?.user?.id;
  const taskToRow = (task) => ({ id: task.id, workspace_id: workspace.id, title: task.title, details: task.details || "", due_date: task.date, owner_key: task.owner, category: task.category, priority: task.priority, completed: task.completed, course_id: task.courseId || null, estimated_minutes: task.estimate || 60, created_at: task.createdAt });
  const noteToRow = (note) => ({ id: note.id, workspace_id: workspace.id, title: note.title, content: note.content, category: note.category, tags: note.tags || [], owner_id: note.visibility === "private" ? session.user.id : null, visibility: note.visibility || "shared", source_name: note.sourceName || null, created_at: note.createdAt, updated_at: note.updatedAt });
  const timetableToRow = (item) => ({ id: item.id, workspace_id: workspace.id, owner_key: item.owner, course_code: item.courseCode || "", title: item.title, day_of_week: item.day, start_time: item.start, end_time: item.end, location: item.location || "", color: item.color || "blue", created_at: item.createdAt });
  const courseToRow = (item) => ({ id: item.id, workspace_id: workspace.id, owner_key: item.owner, code: item.code, title: item.title, lecturer: item.lecturer || "", color: item.color || "blue", credits: item.credits || 0, created_at: item.createdAt });
  const activityToRow = (item) => ({ id: item.id, workspace_id: workspace.id, actor_name: item.actor, message: item.message, created_at: item.createdAt });
  const fileToRow = (item) => ({ id: item.id, workspace_id: workspace.id, owner_id: authId(item.ownerId), owner_key: item.owner || workspace.currentMember.slot, name: item.name, mime_type: item.mimeType || "application/octet-stream", extension: item.extension || "", size_bytes: item.size || 0, storage_path: item.storagePath || null, extracted_content: item.extractedContent || "", edited_content: item.editedContent ?? null, visibility: item.visibility || "shared", course_id: item.courseId || null, created_at: item.createdAt, updated_at: item.updatedAt });
  const highlightToRow = (item) => ({ id: item.id, workspace_id: workspace.id, file_id: item.fileId, user_id: authId(item.userId), selected_text: item.selectedText, note: item.note || "", color: item.color || "yellow", start_offset: item.startOffset ?? null, end_offset: item.endOffset ?? null, created_at: item.createdAt });
  const focusToRow = (item) => ({ id: item.id, workspace_id: workspace.id, user_id: authId(item.userId), owner_key: item.owner || workspace.currentMember.slot, label: item.label || "Focus session", course_id: item.courseId || null, planned_minutes: item.plannedMinutes || 25, completed_minutes: item.completedMinutes || 0, status: item.status || "completed", started_at: item.startedAt, ended_at: item.endedAt });
  const checkinToRow = (item) => ({ id: item.id, workspace_id: workspace.id, user_id: authId(item.userId), owner_key: item.owner || workspace.currentMember.slot, mood: item.mood || "good", availability: item.availability || "available", message: item.message || "", checkin_date: item.date, created_at: item.createdAt, updated_at: item.updatedAt });
  const rowToTask = (row) => ({ id: row.id, title: row.title, details: row.details || "", date: row.due_date, owner: row.owner_key, category: row.category, priority: row.priority, completed: row.completed, courseId: row.course_id, estimate: row.estimated_minutes || 60, createdAt: row.created_at });
  const rowToNote = (row) => ({ id: row.id, title: row.title, content: row.content, category: row.category, tags: row.tags || [], ownerId: row.owner_id, visibility: row.visibility || "shared", sourceName: row.source_name, createdAt: row.created_at, updatedAt: row.updated_at });
  const rowToTimetable = (row) => ({ id: row.id, owner: row.owner_key, courseCode: row.course_code || "", title: row.title, day: row.day_of_week, start: String(row.start_time).slice(0, 5), end: String(row.end_time).slice(0, 5), location: row.location || "", color: row.color || "blue", createdAt: row.created_at });
  const rowToCourse = (row) => ({ id: row.id, owner: row.owner_key, code: row.code, title: row.title, lecturer: row.lecturer || "", color: row.color || "blue", credits: row.credits || 0, createdAt: row.created_at });
  const rowToActivity = (row) => ({ id: row.id, actor: row.actor_name, message: row.message, createdAt: row.created_at });
  const rowToFile = (row) => ({ id: row.id, ownerId: row.owner_id, owner: row.owner_key, name: row.name, mimeType: row.mime_type, extension: row.extension, size: Number(row.size_bytes || 0), storagePath: row.storage_path, extractedContent: row.extracted_content || "", editedContent: row.edited_content, visibility: row.visibility, courseId: row.course_id, createdAt: row.created_at, updatedAt: row.updated_at });
  const rowToHighlight = (row) => ({ id: row.id, fileId: row.file_id, userId: row.user_id, selectedText: row.selected_text, note: row.note || "", color: row.color || "yellow", startOffset: row.start_offset, endOffset: row.end_offset, createdAt: row.created_at });
  const rowToFocus = (row) => ({ id: row.id, userId: row.user_id, owner: row.owner_key, label: row.label, courseId: row.course_id, plannedMinutes: row.planned_minutes, completedMinutes: row.completed_minutes, status: row.status, startedAt: row.started_at, endedAt: row.ended_at });
  const rowToCheckin = (row) => ({ id: row.id, userId: row.user_id, owner: row.owner_key, mood: row.mood, availability: row.availability, message: row.message || "", date: row.checkin_date, createdAt: row.created_at, updatedAt: row.updated_at });

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

  function status() { return { configured, signedIn: Boolean(session), email: session?.user?.email || "", userId: session?.user?.id || "", workspace, v4Available }; }

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
    if (presenceChannel) {
      try { await presenceChannel.untrack(); } catch (_) {}
      await client.removeChannel(presenceChannel);
    }
    check(await client.auth.signOut({ scope: "local" }));
    session = null; workspace = null; channel = null; presenceChannel = null; presencePayload = null;
    return status();
  }

  async function createWorkspace(profile) {
    const data = check(await client.rpc("create_kin_workspace", { workspace_name: "HoneyButter", first_name: profile.name, second_name: profile.partner }));
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
    let files = [], highlights = [], focusSessions = [], checkins = [];
    const v4Results = await Promise.all([
      client.from("workspace_files").select("*").eq("workspace_id", workspace.id).order("updated_at", { ascending: false }),
      client.from("file_highlights").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
      client.from("focus_sessions").select("*").eq("workspace_id", workspace.id).order("started_at", { ascending: false }).limit(200),
      client.from("checkins").select("*").eq("workspace_id", workspace.id).order("checkin_date", { ascending: false }).limit(60)
    ]);
    v4Available = v4Results.every((result) => !result.error);
    if (v4Available) {
      files = v4Results[0].data.map(rowToFile);
      highlights = v4Results[1].data.map(rowToHighlight);
      focusSessions = v4Results[2].data.map(rowToFocus);
      checkins = v4Results[3].data.map(rowToCheckin);
    }
    return { profile: { name: workspace.name_one, partner: workspace.name_two }, tasks: check(tasks).map(rowToTask), notes: check(notes).map(rowToNote), timetables: check(timetables).map(rowToTimetable), courses: check(courses).map(rowToCourse), activities: check(activities).map(rowToActivity), files, highlights, focusSessions, checkins };
  }

  async function syncState(state) {
    if (!workspace) return;
    const operations = [];
    if (state.tasks.length) operations.push(client.from("tasks").upsert(state.tasks.map(taskToRow)));
    if (state.notes.length) operations.push(client.from("notes").upsert(state.notes.map(noteToRow)));
    if (state.timetables?.length) operations.push(client.from("timetables").upsert(state.timetables.map(timetableToRow)));
    if (state.courses?.length) operations.push(client.from("courses").upsert(state.courses.map(courseToRow)));
    if (state.activities?.length) operations.push(client.from("activities").upsert(state.activities.slice(0, 100).map(activityToRow)));
    const ownedFiles = state.files?.filter((item) => belongsToSession(item.ownerId)) || [];
    const ownedHighlights = state.highlights?.filter((item) => belongsToSession(item.userId)) || [];
    const ownedFocus = state.focusSessions?.filter((item) => belongsToSession(item.userId)) || [];
    const ownedCheckins = state.checkins?.filter((item) => belongsToSession(item.userId)) || [];
    if (v4Available && ownedFiles.length) operations.push(client.from("workspace_files").upsert(ownedFiles.map(fileToRow)));
    if (v4Available && ownedHighlights.length) operations.push(client.from("file_highlights").upsert(ownedHighlights.map(highlightToRow)));
    if (v4Available && ownedFocus.length) operations.push(client.from("focus_sessions").upsert(ownedFocus.slice(0, 200).map(focusToRow)));
    if (v4Available && ownedCheckins.length) operations.push(client.from("checkins").upsert(ownedCheckins.slice(0, 60).map(checkinToRow), { onConflict: "workspace_id,user_id,checkin_date" }));
    operations.push(client.from("workspaces").update({ name_one: state.profile.name, name_two: state.profile.partner }).eq("id", workspace.id));
    const results = await Promise.all(operations);
    results.forEach(check);
  }

  async function remove(kind, id) {
    if (!workspace || !["tasks", "notes", "timetables", "courses", "activities", "workspace_files", "file_highlights", "focus_sessions", "checkins"].includes(kind)) return;
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activities", filter: `workspace_id=eq.${workspace.id}` }, onChange);
    if (v4Available) channel
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace_files", filter: `workspace_id=eq.${workspace.id}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "file_highlights", filter: `workspace_id=eq.${workspace.id}` }, onChange)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "focus_sessions", filter: `workspace_id=eq.${workspace.id}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "checkins", filter: `workspace_id=eq.${workspace.id}` }, onChange);
    channel.subscribe();
  }

  async function startPresence(view, onSync) {
    if (!workspace || !session) return;
    if (presenceChannel) await client.removeChannel(presenceChannel);
    presencePayload = {
      userId: session.user.id,
      slot: workspace.currentMember.slot,
      name: workspace.currentMember.displayName || (workspace.currentMember.slot === "me" ? workspace.name_one : workspace.name_two),
      view: view || "home",
      onlineAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    presenceChannel = client.channel(`kin-presence-${workspace.id}`, { config: { presence: { key: session.user.id } } });
    presenceChannel.on("presence", { event: "sync" }, () => {
      const members = Object.values(presenceChannel.presenceState()).flat().filter(Boolean);
      onSync?.(members);
    });
    presenceChannel.subscribe(async (statusValue) => {
      if (statusValue === "SUBSCRIBED") await presenceChannel.track(presencePayload);
    });
  }

  async function updatePresence(view, extra = {}) {
    if (!presenceChannel || !presencePayload) return;
    presencePayload = { ...presencePayload, view: view || presencePayload.view || "home", ...extra, updatedAt: new Date().toISOString() };
    await presenceChannel.track(presencePayload);
  }

  async function stopPresence() {
    if (!presenceChannel) return;
    try { await presenceChannel.untrack(); } catch (_) {}
    await client.removeChannel(presenceChannel);
    presenceChannel = null;
    presencePayload = null;
  }

  async function uploadWorkspaceFile(file, id) {
    if (!workspace || !session) throw new Error("Sign in to upload workspace files");
    if (!v4Available) throw new Error("Run supabase/v4_studio.sql before using cloud file storage");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-140);
    const path = `${workspace.id}/${session.user.id}/${id}-${safeName}`;
    const { error } = await client.storage.from("honeybutter-files").upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
    if (error) throw error;
    return path;
  }

  async function getWorkspaceFileUrl(path) {
    if (!path) return "";
    const { data, error } = await client.storage.from("honeybutter-files").createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  }

  async function downloadWorkspaceFile(path) {
    if (!path) throw new Error("This file has no stored original");
    const { data, error } = await client.storage.from("honeybutter-files").download(path);
    if (error) throw error;
    return data;
  }

  async function deleteWorkspaceFile(path, id) {
    if (path) {
      const { error } = await client.storage.from("honeybutter-files").remove([path]);
      if (error) throw error;
    }
    if (id) check(await client.from("workspace_files").delete().eq("workspace_id", workspace.id).eq("id", id));
  }

  async function saveWorkspaceFileContent(id, content) {
    if (!workspace || !session || !v4Available) throw new Error("Cloud File Studio is not available");
    check(await client.rpc("save_accessible_file_content", { file_key: id, new_content: String(content || "").slice(0, 500000) }));
  }

  async function indexMemories(notes) {
    if (!v4Available || !workspace || !session || !notes?.length) return;
    for (let start = 0; start < notes.length; start += 40) {
      const batch = notes.slice(start, start + 40);
      const { data, error } = await client.functions.invoke("embed", { body: { inputs: batch.map((note) => `${note.title}\n${note.content}`.slice(0, 24000)) } });
      if (error) throw error;
      if (!Array.isArray(data?.embeddings) || data.embeddings.length !== batch.length) throw new Error(data?.error || "Memory indexing failed");
      check(await client.from("memory_embeddings").upsert(batch.map((note, index) => ({ note_id: note.id, workspace_id: workspace.id, owner_id: note.visibility === "private" ? authId(note.ownerId) : null, embedding: data.embeddings[index], updated_at: note.updatedAt || new Date().toISOString() }))));
    }
  }

  async function semanticSearch(question, count = 8) {
    if (!v4Available || !workspace || !session) return [];
    const { data, error } = await client.functions.invoke("embed", { body: { inputs: [String(question).slice(0, 8000)] } });
    if (error) throw error;
    const embedding = data?.embeddings?.[0];
    if (!embedding) return [];
    return check(await client.rpc("match_accessible_memories", { query_embedding: embedding, match_workspace: workspace.id, match_count: count }));
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

  window.KinCloud = { configured, init, status, signIn, signUp, signOut, createWorkspace, joinWorkspace, loadState, syncState, remove, subscribe, startPresence, updatePresence, stopPresence, uploadWorkspaceFile, getWorkspaceFileUrl, downloadWorkspaceFile, deleteWorkspaceFile, saveWorkspaceFileContent, indexMemories, semanticSearch, askAI, ingestFile };
})();
