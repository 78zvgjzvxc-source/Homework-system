/* Kin prototype — local-first shared task and memory space. */
(function () {
  "use strict";

  const STORAGE_KEY = "kin-workspace-v1";
  const PEOPLE = { name: "Aiman Firdaus", partner: "Abyadina Irisha" };
  const DAY = 86400000;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const iso = (date) => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  const today = () => iso(new Date());
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
  const dateFromIso = (value) => new Date(`${value}T12:00:00`);
  const startOfWeek = (date = new Date()) => {
    const d = new Date(date);
    const day = d.getDay() || 7;
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - day + 1);
    return d;
  };

  function initialState() {
    const base = startOfWeek();
    const dateAt = (offset) => iso(new Date(base.getTime() + offset * DAY));
    const now = new Date().toISOString();
    return {
      profile: { ...PEOPLE },
      tasks: [
        { id: uid(), title: "Finish database assignment", details: "Complete the ERD and final query examples.", date: today(), owner: "me", category: "study", priority: "high", completed: false, createdAt: now },
        { id: uid(), title: "Plan our weekend dinner", details: "Choose somewhere quiet and make a reservation.", date: today(), owner: "both", category: "plans", priority: "normal", completed: false, createdAt: now },
        { id: uid(), title: "Send the utility payment", details: "Electricity bill is due this week.", date: dateAt(2), owner: "partner", category: "home", priority: "normal", completed: false, createdAt: now },
        { id: uid(), title: "Review lecture notes", details: "Focus on chapters 4 and 5.", date: dateAt(3), owner: "me", category: "study", priority: "normal", completed: false, createdAt: now },
        { id: uid(), title: "Morning walk together", details: "Thirty minutes before breakfast.", date: dateAt(5), owner: "both", category: "personal", priority: "low", completed: false, createdAt: now },
        { id: uid(), title: "Buy groceries", details: "Fruit, coffee, milk, and pasta.", date: dateAt(0), owner: "me", category: "home", priority: "normal", completed: true, createdAt: now }
      ],
      notes: [
        { id: uid(), title: "Our travel wishlist", content: "Japan during autumn, a quiet beach trip to Redang, and a long weekend exploring Penang food together.", category: "plans", tags: ["travel", "together"], visibility: "shared", createdAt: new Date(Date.now() - DAY).toISOString(), updatedAt: new Date(Date.now() - DAY).toISOString() },
        { id: uid(), title: "How she likes her coffee", content: "Iced latte, less sweet, with oat milk when it is available. No whipped cream.", category: "personal", tags: ["little things", "coffee"], visibility: "shared", createdAt: new Date(Date.now() - 2 * DAY).toISOString(), updatedAt: new Date(Date.now() - 2 * DAY).toISOString() },
        { id: uid(), title: "ISP568 project direction", content: "Build a useful shared system with a calm interface. The main idea is a personal knowledge vault connected to daily tasks and an assistant.", category: "study", tags: ["project", "ai", "idea"], visibility: "private", createdAt: new Date(Date.now() - 4 * DAY).toISOString(), updatedAt: new Date(Date.now() - 4 * DAY).toISOString() }
      ],
      timetables: []
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !saved.tasks || !saved.notes) return initialState();
      saved.profile = { ...PEOPLE };
      saved.notes = saved.notes.map((note) => ({ visibility: "shared", ...note }));
      saved.timetables ||= [];
      return saved;
    } catch (_) { return initialState(); }
  }

  let state = loadState();
  let activeTaskFilter = "all";
  let activeVaultFilter = "all";
  let activeTimetableFilter = "all";
  let cloudStatus = { configured: false, signedIn: false, workspace: null };
  let cloudTimer = null;
  let graphData = { nodes: [], edges: [] };
  let graphZoom = 1;

  function scheduleCloudSync() {
    if (!cloudStatus.workspace || !window.KinCloud) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => window.KinCloud.syncState(state).catch((error) => {
      toast(`Cloud sync paused: ${error.message}`);
      updateCloudUI();
    }), 350);
  }

  function saveState(message) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAll();
    scheduleCloudSync();
    if (message) toast(message);
  }

  function ownerLabel(owner) {
    if (owner === "me") return state.profile.name;
    if (owner === "partner") return state.profile.partner;
    return "Together";
  }

  function relativeDate(value) {
    const diff = Math.round((dateFromIso(value) - dateFromIso(today())) / DAY);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    return dateFromIso(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function noteAge(value) {
    const days = Math.max(0, Math.floor((Date.now() - new Date(value)) / DAY));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function renderAll() {
    renderHeader();
    renderPeopleDashboard();
    renderFocus();
    renderWeekStrip();
    renderRecentNotes();
    renderTaskBoard();
    renderPlanner();
    renderTimetable();
    renderVault();
    renderGraph();
  }

  function renderHeader() {
    const now = new Date();
    $("#todayLabel").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
    const slot = currentSlot();
    $("#welcomeName").textContent = ownerLabel(slot);
    $("#profileName").textContent = ownerLabel(slot);
    $$(".avatar:not(.second)").forEach((el) => el.textContent = state.profile.name.charAt(0).toUpperCase());
    $$(".avatar.second").forEach((el) => el.textContent = state.profile.partner.charAt(0).toUpperCase());
    $("#taskNavCount").textContent = state.tasks.filter((task) => !task.completed).length;
    $("#vaultNavCount").textContent = state.notes.length;
    $("#overviewNameOne").textContent = state.profile.name;
    $("#overviewNameTwo").textContent = state.profile.partner;
    $("#scheduleKeyOne").textContent = state.profile.name;
    $("#scheduleKeyTwo").textContent = state.profile.partner;
    $("#aimanTaskFilter").textContent = state.profile.name.split(" ")[0];
    $("#abyadinaTaskFilter").textContent = state.profile.partner.split(" ")[0];
    $("#timetablePersonOne").textContent = state.profile.name.split(" ")[0];
    $("#timetablePersonTwo").textContent = state.profile.partner.split(" ")[0];
    $("#taskOwner").options[0].textContent = state.profile.name;
    $("#taskOwner").options[1].textContent = state.profile.partner;
    $("#classOwner").options[0].textContent = state.profile.name;
    $("#classOwner").options[1].textContent = state.profile.partner;
    $("#identityLabel").textContent = cloudStatus.signedIn ? `${ownerLabel(slot)} · personal view` : "Shared preview";
    $("#myTaskFilter").textContent = `${ownerLabel(slot).split(" ")[0]}'s tasks`;
  }

  function currentSlot() { return cloudStatus.workspace?.currentMember?.slot || "me"; }

  function renderPeopleDashboard() {
    const todayDay = new Date().getDay() || 7;
    [["me", "One"], ["partner", "Two"]].forEach(([owner, suffix]) => {
      const tasks = state.tasks.filter((task) => !task.completed && (task.owner === owner || task.owner === "both"));
      const classes = state.timetables.filter((item) => item.owner === owner && item.day === todayDay).sort((a, b) => a.start.localeCompare(b.start));
      $(`#overviewTasks${suffix}`).textContent = tasks.length;
      $(`#overviewClasses${suffix}`).textContent = classes.length;
      $(`#overviewNext${suffix}`).textContent = classes.length ? `Next: ${classes[0].start} · ${classes[0].courseCode || classes[0].title}${classes[0].location ? ` · ${classes[0].location}` : ""}` : "No classes scheduled today";
    });
  }

  function taskRow(task, editable = true) {
    const initial = task.owner === "partner" ? state.profile.partner[0] : task.owner === "both" ? "♥" : state.profile.name[0];
    const ownerClass = task.owner === "partner" ? "partner" : "";
    return `<div class="task-row ${task.completed ? "done" : ""}" data-task-id="${task.id}" ${editable ? 'role="button" tabindex="0"' : ""}>
      <button class="check-button ${task.completed ? "completed" : ""}" data-toggle-task="${task.id}" aria-label="${task.completed ? "Mark incomplete" : "Mark complete"}"></button>
      <div class="task-copy"><strong>${escapeHtml(task.title)}</strong><span>${relativeDate(task.date)} <i></i> ${escapeHtml(task.category)}${task.details ? ` <i></i> <span class="task-details-preview">${escapeHtml(task.details)}</span>` : ""}</span></div>
      <span class="owner-chip ${ownerClass}"><span class="avatar">${escapeHtml(initial.toUpperCase())}</span>${escapeHtml(ownerLabel(task.owner))}</span>
    </div>`;
  }

  function renderFocus() {
    const tasks = state.tasks.filter((task) => task.date === today() && !task.completed && [currentSlot(), "both"].includes(task.owner)).slice(0, 4);
    $("#focusList").innerHTML = tasks.length ? tasks.map((task) => taskRow(task)).join("") : `<div class="empty-inline"><strong>Your day is clear.</strong>Add one meaningful thing when you’re ready.</div>`;
  }

  function renderWeekStrip() {
    const start = startOfWeek();
    const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY));
    $("#weekStrip").innerHTML = days.map((date) => {
      const value = iso(date);
      const count = state.tasks.filter((task) => task.date === value).length;
      return `<div class="day-pill ${value === today() ? "today" : ""}"><span class="dow">${date.toLocaleDateString(undefined, { weekday: "short" })}</span><span class="date">${date.getDate()}</span><span class="day-dots">${Array.from({ length: Math.min(count, 4) }, () => "<i></i>").join("")}</span></div>`;
    }).join("");
    const end = new Date(start.getTime() + 6 * DAY);
    $("#weekDateRange").textContent = `${start.toLocaleDateString(undefined, { month: "long", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`;
    const weekTasks = state.tasks.filter((task) => dateFromIso(task.date) >= start && dateFromIso(task.date) <= end);
    const completed = weekTasks.filter((task) => task.completed).length;
    $("#weeklyProgressLabel").textContent = `${completed} of ${weekTasks.length} complete`;
    $("#weeklyProgressBar").style.width = `${weekTasks.length ? (completed / weekTasks.length) * 100 : 0}%`;
  }

  function renderRecentNotes() {
    const notes = [...state.notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 3);
    $("#recentNotes").innerHTML = notes.length ? notes.map((note) => `<button class="recent-note" data-note-id="${note.id}"><span class="note-icon ${note.category}"><svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg></span><span><strong>${escapeHtml(note.title)}</strong><span>${escapeHtml(note.content)}</span></span><time>${noteAge(note.updatedAt)}</time></button>`).join("") : `<div class="empty-inline">Your saved thoughts will appear here.</div>`;
  }

  function filteredTasks() {
    const query = $("#taskSearch")?.value.trim().toLowerCase() || "";
    return state.tasks.filter((task) => {
      const matchQuery = !query || `${task.title} ${task.details} ${task.category}`.toLowerCase().includes(query);
      const personSlot = activeTaskFilter === "aiman" ? "me" : activeTaskFilter === "abyadina" ? "partner" : currentSlot();
      const matchFilter = activeTaskFilter === "all" || (activeTaskFilter === "today" && task.date === today()) || (activeTaskFilter === "mine" && [personSlot, "both"].includes(task.owner)) || (activeTaskFilter === "aiman" && ["me", "both"].includes(task.owner)) || (activeTaskFilter === "abyadina" && ["partner", "both"].includes(task.owner)) || (activeTaskFilter === "completed" && task.completed);
      return matchQuery && matchFilter && (activeTaskFilter === "completed" || !task.completed);
    }).sort((a, b) => a.date.localeCompare(b.date));
  }

  function renderTaskBoard() {
    const tasks = filteredTasks();
    if (!tasks.length) {
      $("#taskBoard").innerHTML = `<div class="empty-state"><span>✓</span><h3>Nothing here right now</h3><p>A little breathing room is a good thing.</p></div>`;
      return;
    }
    const groups = {};
    tasks.forEach((task) => { const label = relativeDate(task.date); (groups[label] ||= []).push(task); });
    $("#taskBoard").innerHTML = Object.entries(groups).map(([label, items]) => `<section class="task-group"><div class="task-group-header"><h3>${escapeHtml(label)}</h3><span>${items.length} ${items.length === 1 ? "task" : "tasks"}</span></div>${items.map((task) => taskRow(task)).join("")}</section>`).join("");
  }

  function renderPlanner() {
    const start = startOfWeek();
    $("#plannerGrid").innerHTML = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start.getTime() + index * DAY);
      const value = iso(date);
      const tasks = state.tasks.filter((task) => task.date === value);
      return `<section class="planner-day ${value === today() ? "today" : ""}"><div class="planner-day-head"><span>${date.toLocaleDateString(undefined, { weekday: "short" })}</span><strong>${date.getDate()}</strong></div><div class="planner-items">${tasks.map((task) => `<button class="planner-task ${task.category} ${task.completed ? "done" : ""}" data-task-id="${task.id}"><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(ownerLabel(task.owner))}</small></button>`).join("")}<button class="planner-add" data-add-date="${value}" aria-label="Add task"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button></div></section>`;
    }).join("");
  }

  function renderTimetable() {
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const todayDay = new Date().getDay() || 7;
    $("#timetableGrid").innerHTML = dayNames.map((name, index) => {
      const day = index + 1;
      const items = state.timetables.filter((item) => item.day === day && (activeTimetableFilter === "all" || item.owner === activeTimetableFilter)).sort((a, b) => a.start.localeCompare(b.start));
      return `<section class="timetable-day ${day === todayDay ? "today" : ""}"><div class="timetable-day-head">${name}</div><div class="class-list">${items.length ? items.map((item) => `<button class="class-card ${item.owner} ${item.color}" data-class-id="${item.id}"><time>${escapeHtml(item.start)} – ${escapeHtml(item.end)}</time><strong>${escapeHtml(item.courseCode || item.title)}</strong>${item.courseCode ? `<span>${escapeHtml(item.title)}</span>` : ""}<small>${escapeHtml(ownerLabel(item.owner))}${item.location ? ` · ${escapeHtml(item.location)}` : ""}</small></button>`).join("") : `<div class="empty-day">No classes</div>`}</div></section>`;
    }).join("");
  }

  function filteredNotes() {
    const query = $("#vaultSearch")?.value.trim().toLowerCase() || "";
    return state.notes.filter((note) => {
      const matchFilter = activeVaultFilter === "all" || note.category === activeVaultFilter || note.visibility === activeVaultFilter;
      const matchQuery = !query || `${note.title} ${note.content} ${note.tags.join(" ")}`.toLowerCase().includes(query);
      return matchFilter && matchQuery;
    }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  function renderVault() {
    const notes = filteredNotes();
    $("#notesGrid").innerHTML = notes.length ? notes.map((note) => `<button class="note-card" data-note-id="${note.id}"><span class="note-card-top"><span class="category-pill ${note.category}">${note.visibility === "private" ? "private brain" : "shared brain"}</span><time>${noteAge(note.updatedAt)}</time></span><h3>${escapeHtml(note.title)}</h3><p>${escapeHtml(note.content)}</p><span class="note-tags">${note.tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}</span></button>`).join("") : `<div class="empty-state"><span>✦</span><h3>No memories found</h3><p>Capture a thought or try a different search.</p></div>`;
    const allTags = state.notes.flatMap((note) => note.tags);
    const counts = allTags.reduce((acc, tag) => ((acc[tag] = (acc[tag] || 0) + 1), acc), {});
    $("#tagCloud").innerHTML = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag]) => `<span>#${escapeHtml(tag)}</span>`).join("") || "<span>No tags yet</span>";
    $("#brainStats").textContent = `${state.notes.length} memories and ${state.tasks.length} tasks indexed and ready to help.`;
  }

  function buildGraphData() {
    const nodes = [{ id: "root", type: "root", label: "Our Kin", body: "Your shared second brain" }];
    const edges = [];
    const known = new Set(["root"]);
    const edgeKeys = new Set();
    const addNode = (node) => { if (!known.has(node.id)) { known.add(node.id); nodes.push(node); } };
    const addEdge = (source, target, relation) => { const key = `${source}|${target}|${relation}`; if (!edgeKeys.has(key)) { edgeKeys.add(key); edges.push({ source, target, relation }); } };
    const categories = new Set([...state.notes.map((note) => note.category), ...state.tasks.map((task) => task.category)]);
    categories.forEach((category) => {
      const id = `space:${category}`;
      addNode({ id, type: "space", label: category === "plans" ? "Plans & dreams" : category, body: "Shared space" });
      addEdge("root", id, "contains");
    });
    state.notes.forEach((note) => {
      const noteId = `note:${note.id}`;
      addNode({ id: noteId, sourceId: note.id, type: "memory", label: note.title, body: note.content, tags: note.tags });
      addEdge(noteId, `space:${note.category}`, "belongs to");
      note.tags.forEach((tag) => {
        const clean = tag.trim().toLowerCase();
        if (!clean) return;
        const tagId = `tag:${clean}`;
        addNode({ id: tagId, type: "tag", label: `#${clean}`, body: "Connects related memories" });
        addEdge(noteId, tagId, "tagged");
      });
    });
    state.tasks.filter((task) => !task.completed).slice(0, 24).forEach((task) => {
      const taskId = `task:${task.id}`;
      addNode({ id: taskId, sourceId: task.id, type: "task", label: task.title, body: `${relativeDate(task.date)} · ${ownerLabel(task.owner)}` });
      addEdge(taskId, `space:${task.category}`, "belongs to");
    });
    const rings = { root: 0, space: 105, tag: 190, memory: 270, task: 330 };
    Object.keys(rings).forEach((type) => {
      const group = nodes.filter((node) => node.type === type);
      group.forEach((node, index) => {
        if (type === "root") { node.x = 450; node.y = 300; return; }
        const offset = type === "tag" ? .35 : type === "memory" ? .1 : -.2;
        const angle = (Math.PI * 2 * index / Math.max(group.length, 1)) + offset;
        node.x = 450 + Math.cos(angle) * rings[type];
        node.y = 300 + Math.sin(angle) * rings[type] * .78;
      });
    });
    return { nodes, edges };
  }

  function renderGraph() {
    graphData = buildGraphData();
    const nodeMap = new Map(graphData.nodes.map((node) => [node.id, node]));
    const radius = { root: 21, space: 14, tag: 11, memory: 12, task: 10 };
    const lines = graphData.edges.map((edge, index) => {
      const a = nodeMap.get(edge.source), b = nodeMap.get(edge.target);
      return `<line class="graph-edge" data-edge-index="${index}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"><title>${escapeHtml(edge.relation)}</title></line>`;
    }).join("");
    const groups = graphData.nodes.map((node) => `<g class="graph-node ${node.type}" data-graph-id="${escapeHtml(node.id)}" transform="translate(${node.x} ${node.y})"><circle r="${radius[node.type]}"></circle><text y="${radius[node.type] + 15}">${escapeHtml(node.label.length > 24 ? `${node.label.slice(0, 22)}…` : node.label)}</text><title>${escapeHtml(node.label)}</title></g>`).join("");
    $("#knowledgeGraph").innerHTML = `<g class="graph-world">${lines}${groups}</g>`;
    $("#graphStats").innerHTML = [
      [state.notes.length, "memories"],
      [new Set(state.notes.flatMap((note) => note.tags.map((tag) => tag.toLowerCase()))).size, "connected tags"],
      [state.tasks.filter((task) => !task.completed).length, "open tasks"],
      [graphData.edges.length, "relationships"]
    ].map(([number, label]) => `<div class="graph-stat"><strong>${number}</strong><span>${label}</span></div>`).join("");
    applyGraphSearch();
  }

  function applyGraphSearch() {
    const query = $("#graphSearch")?.value.trim().toLowerCase() || "";
    const matches = new Set(graphData.nodes.filter((node) => !query || `${node.label} ${node.body}`.toLowerCase().includes(query)).map((node) => node.id));
    if (query) graphData.edges.forEach((edge) => { if (matches.has(edge.source)) matches.add(edge.target); if (matches.has(edge.target)) matches.add(edge.source); });
    $$(".graph-node").forEach((node) => node.classList.toggle("dimmed", Boolean(query) && !matches.has(node.dataset.graphId)));
  }

  function inspectGraphNode(id) {
    const node = graphData.nodes.find((item) => item.id === id);
    if (!node) return;
    $$(".graph-node").forEach((el) => el.classList.toggle("selected", el.dataset.graphId === id));
    const connections = graphData.edges.filter((edge) => edge.source === id || edge.target === id);
    const connectedNames = connections.map((edge) => graphData.nodes.find((item) => item.id === (edge.source === id ? edge.target : edge.source))?.label).filter(Boolean);
    $("#graphInspector").innerHTML = `<span class="insight-mark">${node.type === "task" ? "✓" : "✦"}</span><span class="category-pill ${node.type === "memory" ? "personal" : node.type === "tag" ? "study" : "plans"}">${escapeHtml(node.type)}</span><h3>${escapeHtml(node.label)}</h3><p>${escapeHtml(node.body || "Connected knowledge")}</p><div class="insight-rule"></div><span class="tiny-label">${connections.length} CONNECTION${connections.length === 1 ? "" : "S"}</span><div class="inspector-tags">${connectedNames.slice(0, 10).map((name) => `<span>${escapeHtml(name)}</span>`).join("") || "<span>No direct links</span>"}</div>${node.sourceId ? `<button class="secondary-button full graph-open-source" data-graph-source="${node.type}" data-source-id="${node.sourceId}">Open source</button>` : ""}`;
  }

  function downloadFile(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function exportGraphJson() {
    const clean = { generatedAt: new Date().toISOString(), nodes: graphData.nodes.map(({ x, y, ...node }) => node), edges: graphData.edges };
    downloadFile("kin-knowledge-graph.json", JSON.stringify(clean, null, 2), "application/json");
    toast("Knowledge graph exported as JSON.");
  }

  function exportGraphSvg() {
    const clone = $("#knowledgeGraph").cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = `.graph-edge{stroke:#d8d4ca;stroke-width:1.2}.graph-node circle{stroke:#fff;stroke-width:2.5}.graph-node text{fill:#5e5b53;font:500 9px sans-serif;text-anchor:middle}.memory circle{fill:#e88469}.tag circle{fill:#8ca0b7}.task circle{fill:#c49d66}.space circle{fill:#8da58f}.root circle{fill:#1b1c18}`;
    clone.prepend(style);
    downloadFile("kin-knowledge-graph.svg", new XMLSerializer().serializeToString(clone), "image/svg+xml");
    toast("Knowledge graph exported as SVG.");
  }

  function navigate(view) {
    $$(".view").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
    $$(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.viewTarget === view));
    closeSidebar();
    if (history.replaceState) history.replaceState(null, "", `#${view}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openTask(task = null, presetDate = null) {
    $("#taskForm").reset();
    $("#taskId").value = task?.id || "";
    $("#taskTitle").value = task?.title || "";
    $("#taskDate").value = task?.date || presetDate || today();
    $("#taskOwner").value = task?.owner || currentSlot();
    $("#taskCategory").value = task?.category || "personal";
    $("#taskPriority").value = task?.priority || "normal";
    $("#taskDetails").value = task?.details || "";
    $("#taskModalTitle").textContent = task ? "Edit this task" : "Add something to do";
    $("#deleteTaskBtn").classList.toggle("hidden", !task);
    $("#taskModal").showModal();
    setTimeout(() => $("#taskTitle").focus(), 60);
  }

  function openNote(note = null) {
    $("#noteForm").reset();
    $("#noteId").value = note?.id || "";
    $("#noteTitle").value = note?.title || "";
    $("#noteContent").value = note?.content || "";
    $("#noteCategory").value = note?.category || "personal";
    $("#noteTags").value = note?.tags.join(", ") || "";
    $("#noteVisibility").value = note?.visibility || "private";
    $("#noteModalTitle").textContent = note ? "Edit this memory" : "Capture a thought";
    $("#deleteNoteBtn").classList.toggle("hidden", !note);
    $("#noteModal").showModal();
    setTimeout(() => $("#noteTitle").focus(), 60);
  }

  function openTimetable(item = null) {
    $("#timetableForm").reset();
    $("#timetableId").value = item?.id || "";
    $("#classCode").value = item?.courseCode || "";
    $("#classTitle").value = item?.title || "";
    $("#classOwner").value = item?.owner || currentSlot();
    $("#classDay").value = String(item?.day || 1);
    $("#classStart").value = item?.start || "09:00";
    $("#classEnd").value = item?.end || "10:00";
    $("#classLocation").value = item?.location || "";
    $("#classColor").value = item?.color || (currentSlot() === "me" ? "blue" : "sage");
    $("#timetableModalTitle").textContent = item ? "Edit this class" : "Add a class";
    $("#deleteClassBtn").classList.toggle("hidden", !item);
    $("#timetableModal").showModal();
    setTimeout(() => $("#classCode").focus(), 60);
  }

  function toggleTask(id) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return;
    task.completed = !task.completed;
    saveState(task.completed ? "Nice — one less thing to carry." : "Task moved back to your list.");
  }

  function tokenize(text) {
    const stop = new Set(["the","a","an","and","or","to","of","in","on","for","is","are","we","our","i","me","my","what","how","do","can","you","about","this","that"]);
    return String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 1 && !stop.has(word));
  }

  function answerFromBrain(question) {
    const words = tokenize(question);
    const documents = [
      ...state.notes.map((note) => ({ type: "memory", title: note.title, text: note.content, meta: note.tags.join(", "), date: note.updatedAt })),
      ...state.tasks.filter((task) => [currentSlot(), "both"].includes(task.owner)).map((task) => ({ type: "task", title: task.title, text: task.details, meta: `${task.category} ${ownerLabel(task.owner)} ${task.completed ? "completed" : "unfinished"}`, date: task.date, completed: task.completed }))
    ];
    const scored = documents.map((doc) => {
      const haystack = tokenize(`${doc.title} ${doc.text} ${doc.meta}`);
      const overlap = words.reduce((sum, word) => sum + haystack.filter((item) => item.includes(word) || word.includes(item)).length, 0);
      return { ...doc, score: overlap };
    }).sort((a, b) => b.score - a.score);
    const q = question.toLowerCase();
    const unfinishedIntent = /unfinished|left|pending|need to do|focus|week/.test(q);
    const planIntent = /plan|week|focus|priority/.test(q);
    let sources = scored.filter((doc) => doc.score > 0).slice(0, 4);
    if (!sources.length && unfinishedIntent) sources = documents.filter((doc) => doc.type === "task" && !doc.completed).slice(0, 5);
    if (!sources.length) return "I couldn’t find a close match in your shared space yet. Try mentioning a person, project, tag, or saved idea—or add more detail to the vault first.";
    if (planIntent) {
      const open = state.tasks.filter((task) => !task.completed && [currentSlot(), "both"].includes(task.owner)).sort((a, b) => (a.priority === "high" ? -1 : 1) || a.date.localeCompare(b.date)).slice(0, 4);
      if (open.length) return `Based on ${ownerLabel(currentSlot())}'s tasks and accessible memories, I’d focus on:\n\n${open.map((task, i) => `${i + 1}. ${task.title} — ${relativeDate(task.date)}, for ${ownerLabel(task.owner)}`).join("\n")}\n\nI found ${state.tasks.filter((task) => !task.completed && [currentSlot(), "both"].includes(task.owner)).length} unfinished personal or shared tasks. This answer is generated locally from your accessible workspace.`;
    }
    return `I found ${sources.length} relevant ${sources.length === 1 ? "item" : "items"} in your shared brain:\n\n${sources.map((doc) => `• ${doc.title}: ${doc.text || doc.meta}`).join("\n")}\n\nThis is a local retrieval summary, so it only uses what you’ve saved here.`;
  }

  function askBrain(question) {
    const clean = question.trim();
    if (!clean) return;
    $("#brainModal").showModal();
    const stream = $("#chatStream");
    stream.insertAdjacentHTML("beforeend", `<div class="user-message"><p>${escapeHtml(clean)}</p></div>`);
    const answer = answerFromBrain(clean);
    stream.insertAdjacentHTML("beforeend", `<div class="assistant-message"><span class="assistant-avatar">✦</span><div><p>${escapeHtml(answer)}</p><small>Grounded in ${state.notes.length} memories and ${state.tasks.length} tasks</small></div></div>`);
    stream.scrollTop = stream.scrollHeight;
    $("#chatInput").value = "";
  }

  function openGlobalSearch() {
    $("#searchModal").showModal();
    setTimeout(() => $("#globalSearch").focus(), 50);
  }

  function renderGlobalSearch() {
    const query = $("#globalSearch").value.trim().toLowerCase();
    if (!query) { $("#searchResults").innerHTML = `<div class="search-empty">Start typing to search your whole shared space.</div>`; return; }
    const tasks = state.tasks.filter((task) => `${task.title} ${task.details} ${task.category}`.toLowerCase().includes(query)).map((task) => ({ ...task, kind: "task", body: task.details || relativeDate(task.date) }));
    const notes = state.notes.filter((note) => `${note.title} ${note.content} ${note.tags.join(" ")}`.toLowerCase().includes(query)).map((note) => ({ ...note, kind: "note", body: note.content }));
    const results = [...tasks, ...notes].slice(0, 12);
    $("#searchResults").innerHTML = results.length ? results.map((item) => `<button class="search-result" data-search-kind="${item.kind}" data-search-id="${item.id}"><span class="note-icon ${item.category}">${item.kind === "task" ? "✓" : "✦"}</span><span><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body)}</span></span><small>${item.kind}</small></button>`).join("") : `<div class="search-empty">Nothing matched “${escapeHtml(query)}”.</div>`;
  }

  function toast(message) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    $("#toastRegion").append(el);
    setTimeout(() => { el.classList.add("removing"); setTimeout(() => el.remove(), 220); }, 2600);
  }

  function closeSidebar() { $("#sidebar").classList.remove("open"); $("#sidebarScrim").classList.remove("visible"); }

  function cloudError(error = "") {
    $("#cloudError").textContent = error;
    $("#cloudError").classList.toggle("hidden", !error);
  }

  function updateCloudUI() {
    const configured = Boolean(cloudStatus.configured);
    $("#cloudNotConfigured").classList.toggle("hidden", configured);
    $("#cloudAuthForm").classList.toggle("hidden", !configured || cloudStatus.signedIn);
    $("#cloudWorkspace").classList.toggle("hidden", !configured || !cloudStatus.signedIn);
    $("#workspaceSetup").classList.toggle("hidden", Boolean(cloudStatus.workspace));
    $("#workspaceConnected").classList.toggle("hidden", !cloudStatus.workspace);
    $("#cloudUserEmail").textContent = cloudStatus.email || "Signed in";
    $("#workspaceInviteCode").textContent = cloudStatus.workspace?.invite_code || "——————";
    $("#syncCardTitle").textContent = cloudStatus.workspace ? "Synced together" : cloudStatus.signedIn ? "Finish cloud setup" : "Invite your person";
    $("#syncCardStatus").textContent = cloudStatus.workspace ? "Supabase live" : configured ? "Sign in to connect" : "Add Supabase keys";
  }

  async function loadCloudWorkspace() {
    const remote = await window.KinCloud.loadState();
    if (remote) {
      state = remote;
      state.profile = { ...PEOPLE };
      state.timetables ||= [];
      state.notes = state.notes.map((note) => ({ visibility: "shared", ...note }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderAll();
      window.KinCloud.syncState(state).catch(() => {});
    }
  }

  function subscribeCloud() {
    let refreshTimer;
    window.KinCloud.subscribe(() => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => loadCloudWorkspace().catch((error) => toast(`Realtime refresh failed: ${error.message}`)), 180);
    });
  }

  async function initCloud() {
    try {
      cloudStatus = await window.KinCloud.init();
      updateCloudUI();
      if (cloudStatus.workspace) { await loadCloudWorkspace(); subscribeCloud(); }
    } catch (error) {
      cloudError(error.message);
      toast(`Supabase connection failed: ${error.message}`);
    }
  }

  document.addEventListener("click", (event) => {
    const view = event.target.closest("[data-view-target]");
    if (view) navigate(view.dataset.viewTarget);
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "new-task") openTask();
    if (action === "new-note") openNote();
    if (action === "new-class") openTimetable();
    if (action === "open-brain") $("#brainModal").showModal();
    const toggle = event.target.closest("[data-toggle-task]");
    if (toggle) { event.stopPropagation(); toggleTask(toggle.dataset.toggleTask); return; }
    const taskEl = event.target.closest("[data-task-id]");
    if (taskEl) openTask(state.tasks.find((task) => task.id === taskEl.dataset.taskId));
    const noteEl = event.target.closest("[data-note-id]");
    if (noteEl) openNote(state.notes.find((note) => note.id === noteEl.dataset.noteId));
    const classEl = event.target.closest("[data-class-id]");
    if (classEl) openTimetable(state.timetables.find((item) => item.id === classEl.dataset.classId));
    const addDate = event.target.closest("[data-add-date]")?.dataset.addDate;
    if (addDate) openTask(null, addDate);
    const suggestion = event.target.closest("[data-prompt]")?.dataset.prompt;
    if (suggestion) askBrain(suggestion);
    const taskFilter = event.target.closest("[data-task-filter]")?.dataset.taskFilter;
    if (taskFilter) { activeTaskFilter = taskFilter; $$("[data-task-filter]").forEach((el) => el.classList.toggle("active", el.dataset.taskFilter === taskFilter)); renderTaskBoard(); }
    const personTasks = event.target.closest("[data-person-tasks]")?.dataset.personTasks;
    if (personTasks) {
      activeTaskFilter = personTasks === "me" ? "aiman" : "abyadina";
      $$("[data-task-filter]").forEach((el) => el.classList.toggle("active", el.dataset.taskFilter === activeTaskFilter));
      navigate("tasks"); renderTaskBoard();
    }
    const timetableFilter = event.target.closest("[data-timetable-filter]")?.dataset.timetableFilter;
    if (timetableFilter) { activeTimetableFilter = timetableFilter; $$("[data-timetable-filter]").forEach((el) => el.classList.toggle("active", el.dataset.timetableFilter === timetableFilter)); renderTimetable(); }
    const vaultFilter = event.target.closest("[data-vault-filter]")?.dataset.vaultFilter;
    if (vaultFilter) { activeVaultFilter = vaultFilter; navigate("vault"); $$("[data-vault-filter]").forEach((el) => el.classList.toggle("active", el.dataset.vaultFilter === vaultFilter)); renderVault(); }
    const result = event.target.closest("[data-search-kind]");
    if (result) { $("#searchModal").close(); result.dataset.searchKind === "task" ? openTask(state.tasks.find((task) => task.id === result.dataset.searchId)) : openNote(state.notes.find((note) => note.id === result.dataset.searchId)); }
    const graphNode = event.target.closest("[data-graph-id]");
    if (graphNode) inspectGraphNode(graphNode.dataset.graphId);
    const graphSource = event.target.closest("[data-graph-source]");
    if (graphSource) {
      if (graphSource.dataset.graphSource === "memory") openNote(state.notes.find((note) => note.id === graphSource.dataset.sourceId));
      if (graphSource.dataset.graphSource === "task") openTask(state.tasks.find((task) => task.id === graphSource.dataset.sourceId));
    }
  });

  $("#taskForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = $("#taskId").value;
    const data = { title: $("#taskTitle").value.trim(), date: $("#taskDate").value, owner: $("#taskOwner").value, category: $("#taskCategory").value, priority: $("#taskPriority").value, details: $("#taskDetails").value.trim() };
    if (!data.title || !data.date) return;
    if (id) Object.assign(state.tasks.find((task) => task.id === id), data);
    else state.tasks.push({ id: uid(), ...data, completed: false, createdAt: new Date().toISOString() });
    $("#taskModal").close();
    saveState(id ? "Task updated." : "Task added to your shared space.");
  });

  $("#noteForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = $("#noteId").value;
    const data = { title: $("#noteTitle").value.trim(), content: $("#noteContent").value.trim(), category: $("#noteCategory").value, tags: $("#noteTags").value.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean), visibility: $("#noteVisibility").value, updatedAt: new Date().toISOString() };
    if (!data.title || !data.content) return;
    if (id) Object.assign(state.notes.find((note) => note.id === id), data);
    else state.notes.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
    $("#noteModal").close();
    saveState(id ? "Memory updated." : data.visibility === "private" ? `Saved to ${ownerLabel(currentSlot())}'s private Brain.` : "Saved to your shared Brain.");
  });

  $("#timetableForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = $("#timetableId").value;
    const data = { courseCode: $("#classCode").value.trim(), title: $("#classTitle").value.trim(), owner: $("#classOwner").value, day: Number($("#classDay").value), start: $("#classStart").value, end: $("#classEnd").value, location: $("#classLocation").value.trim(), color: $("#classColor").value };
    if (!data.title || !data.start || !data.end) return;
    if (data.end <= data.start) { toast("The class end time must be after its start time."); return; }
    if (id) Object.assign(state.timetables.find((item) => item.id === id), data);
    else state.timetables.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
    $("#timetableModal").close();
    saveState(id ? "Class updated." : `Class added to ${ownerLabel(data.owner)}'s timetable.`);
  });

  $("#deleteTaskBtn").addEventListener("click", () => { const id = $("#taskId").value; if (cloudStatus.workspace) window.KinCloud.remove("tasks", id).catch((error) => toast(error.message)); state.tasks = state.tasks.filter((task) => task.id !== id); $("#taskModal").close(); saveState("Task deleted."); });
  $("#deleteNoteBtn").addEventListener("click", () => { const id = $("#noteId").value; if (cloudStatus.workspace) window.KinCloud.remove("notes", id).catch((error) => toast(error.message)); state.notes = state.notes.filter((note) => note.id !== id); $("#noteModal").close(); saveState("Memory removed from the vault."); });
  $("#deleteClassBtn").addEventListener("click", () => { const id = $("#timetableId").value; if (cloudStatus.workspace) window.KinCloud.remove("timetables", id).catch((error) => toast(error.message)); state.timetables = state.timetables.filter((item) => item.id !== id); $("#timetableModal").close(); saveState("Class removed from the timetable."); });
  $("#taskSearch").addEventListener("input", renderTaskBoard);
  $("#vaultSearch").addEventListener("input", renderVault);
  $("#globalSearch").addEventListener("input", renderGlobalSearch);
  $("#graphSearch").addEventListener("input", applyGraphSearch);
  $("#exportGraphJson").addEventListener("click", exportGraphJson);
  $("#exportGraphSvg").addEventListener("click", exportGraphSvg);
  $("#graphZoomIn").addEventListener("click", () => { graphZoom = Math.min(1.5, graphZoom + .1); $("#knowledgeGraph").style.transform = `scale(${graphZoom})`; $("#graphZoomLabel").textContent = `${Math.round(graphZoom * 100)}%`; });
  $("#graphZoomOut").addEventListener("click", () => { graphZoom = Math.max(.6, graphZoom - .1); $("#knowledgeGraph").style.transform = `scale(${graphZoom})`; $("#graphZoomLabel").textContent = `${Math.round(graphZoom * 100)}%`; });
  $("#searchTrigger").addEventListener("click", openGlobalSearch);
  $("#searchClose").addEventListener("click", () => $("#searchModal").close());
  $("#brainClose").addEventListener("click", () => $("#brainModal").close());
  $("#chatForm").addEventListener("submit", (event) => { event.preventDefault(); askBrain($("#chatInput").value); });
  $("#homeBrainForm").addEventListener("submit", (event) => { event.preventDefault(); const input = $("#homeBrainInput"); askBrain(input.value); input.value = ""; });
  $("#menuButton").addEventListener("click", () => { $("#sidebar").classList.add("open"); $("#sidebarScrim").classList.add("visible"); });
  $("#sidebarClose").addEventListener("click", closeSidebar);
  $("#sidebarScrim").addEventListener("click", closeSidebar);
  $("#settingsBtn").addEventListener("click", () => { $("#settingsName").value = state.profile.name; $("#settingsPartner").value = state.profile.partner; $("#settingsModal").showModal(); });
  $("#inviteBtn").addEventListener("click", () => { cloudError(); updateCloudUI(); $("#cloudModal").showModal(); });
  $("#settingsForm").addEventListener("submit", (event) => { event.preventDefault(); state.profile.name = $("#settingsName").value.trim(); state.profile.partner = $("#settingsPartner").value.trim(); $("#settingsModal").close(); saveState("Workspace updated."); });
  $("#cloudClose").addEventListener("click", () => $("#cloudModal").close());
  $("#cloudAuthForm").addEventListener("submit", async (event) => {
    event.preventDefault(); cloudError();
    try {
      cloudStatus = await window.KinCloud.signIn($("#cloudEmail").value.trim(), $("#cloudPassword").value);
      updateCloudUI();
      if (cloudStatus.workspace) { await loadCloudWorkspace(); subscribeCloud(); }
      toast("Signed in to Supabase.");
    } catch (error) { cloudError(error.message); }
  });
  $("#cloudSignUp").addEventListener("click", async () => {
    cloudError();
    try {
      const result = await window.KinCloud.signUp($("#cloudEmail").value.trim(), $("#cloudPassword").value);
      cloudStatus = result; updateCloudUI();
      toast(result.confirmationRequired ? "Check your email to confirm the account, then sign in." : "Account created. You can create your shared workspace now.");
    } catch (error) { cloudError(error.message); }
  });
  $("#cloudSignOut").addEventListener("click", async () => {
    try { cloudStatus = await window.KinCloud.signOut(); updateCloudUI(); toast("Signed out. Local data remains on this device."); } catch (error) { cloudError(error.message); }
  });
  $("#createWorkspaceBtn").addEventListener("click", async () => {
    cloudError();
    try {
      await window.KinCloud.createWorkspace(state.profile);
      cloudStatus = window.KinCloud.status();
      await window.KinCloud.syncState(state);
      updateCloudUI(); subscribeCloud();
      toast("Shared workspace created and local data uploaded.");
    } catch (error) { cloudError(error.message); }
  });
  $("#joinWorkspaceBtn").addEventListener("click", async () => {
    cloudError();
    try {
      await window.KinCloud.joinWorkspace($("#inviteCodeInput").value);
      cloudStatus = window.KinCloud.status();
      await loadCloudWorkspace(); updateCloudUI(); subscribeCloud();
      toast("Joined your shared workspace.");
    } catch (error) { cloudError(error.message); }
  });
  $("#copyInviteCode").addEventListener("click", async () => {
    const code = cloudStatus.workspace?.invite_code;
    if (!code) return;
    try { await navigator.clipboard.writeText(code); toast("Invite code copied."); } catch (_) { window.prompt("Copy this invite code:", code); }
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openGlobalSearch(); }
    if (!event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "n" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) { event.preventDefault(); openNote(); }
  });

  $$("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
  renderAll();
  const initialView = location.hash.slice(1);
  if (["home", "tasks", "week", "timetable", "vault", "graph"].includes(initialView)) navigate(initialView);
  initCloud();
})();
