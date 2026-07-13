/* HoneyButter V4 feature module. Keeps the original app core small and stable. */
(function () {
  "use strict";
  const App = window.HoneyButterApp;
  if (!App) return;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = () => App.getState();
  const cloud = () => App.getCloudStatus();
  const save = (message) => App.saveState(message);
  const esc = App.escapeHtml;
  const uid = App.uid;
  const today = App.today;
  const moodIcons = { great: "😊", good: "🙂", tired: "😴", stressed: "😵", low: "🌧️" };
  const codeExtensions = new Set(["txt","md","json","html","htm","css","js","mjs","ts","tsx","jsx","py","java","c","cpp","h","sql","xml","yaml","yml","toml","log","csv"]);
  let activeFileId = null;
  let openFileIds = [];
  let fileFilter = "all";
  let editorMode = "read";
  let focusMinutes = 25;
  let focusTimer = null;
  let activeFocus = null;
  const runtimeUrls = new Map();

  function minutes(value) {
    const [hour = 0, minute = 0] = String(value || "00:00").split(":").map(Number);
    return hour * 60 + minute;
  }
  function formatMinutes(value) { return `${String(Math.floor(value / 60)).padStart(2,"0")}:${String(value % 60).padStart(2,"0")}`; }
  function sizeLabel(bytes = 0) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1048576).toFixed(1)} MB`; }
  function latestCheckin(owner) { return (state().checkins || []).filter((item) => item.owner === owner && item.date === today()).sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0]; }

  function renderLiving() {
    const now = new Date();
    $("#liveClock").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const day = now.getDay() || 7;
    const nowMinute = now.getHours() * 60 + now.getMinutes();
    const todayClasses = state().timetables.filter((item) => item.day === day);
    const mine = todayClasses.filter((item) => item.owner === App.currentSlot()).sort((a,b) => a.start.localeCompare(b.start));
    const current = mine.find((item) => minutes(item.start) <= nowMinute && minutes(item.end) > nowMinute);
    const next = mine.find((item) => minutes(item.start) > nowMinute);
    $("#nowCard").innerHTML = `<span class="now-pulse"></span><div><strong>${esc(current ? current.courseCode || current.title : next ? `Next: ${next.courseCode || next.title}` : "Your schedule is clear")}</strong><small>${current ? `${current.start}–${current.end}${current.location ? ` · ${esc(current.location)}` : ""}` : next ? `${next.start}${next.location ? ` · ${esc(next.location)}` : ""}` : "Nothing else scheduled today"}</small></div>`;
    const start = 8 * 60, end = 22 * 60, span = end - start;
    $("#dayRail").innerHTML = todayClasses.map((item) => {
      const left = Math.max(0, (minutes(item.start) - start) / span * 100);
      const width = Math.max(1, (minutes(item.end) - minutes(item.start)) / span * 100);
      return `<span class="rail-event ${item.owner}" style="left:${left}%;width:${Math.min(width,100-left)}%" title="${esc(item.title)}"></span>`;
    }).join("") + `<span class="rail-now" style="left:${Math.max(0,Math.min(100,(nowMinute-start)/span*100))}%"></span>`;

    const isBusy = (owner, value) => todayClasses.some((item) => item.owner === owner && minutes(item.start) < value + 30 && minutes(item.end) > value);
    let freeStart = null, freeEnd = null;
    for (let value = Math.max(start, Math.ceil(nowMinute / 30) * 30); value < end; value += 30) {
      if (!isBusy("me", value) && !isBusy("partner", value)) { if (freeStart === null) freeStart = value; freeEnd = value + 30; }
      else if (freeStart !== null && freeEnd - freeStart >= 60) break;
      else { freeStart = null; freeEnd = null; }
    }
    $("#freeTimeTitle").textContent = freeStart !== null ? `${formatMinutes(freeStart)}–${formatMinutes(freeEnd)} together` : "A full day for both of you";
    $("#freeTimeCopy").textContent = freeStart !== null ? `You are both free for about ${Math.round((freeEnd-freeStart)/60*10)/10} hours today.` : "No shared one-hour window remains on today's timetables.";

    $("#checkinPeople").innerHTML = [["me", state().profile.name, ""], ["partner", state().profile.partner, "second"]].map(([owner,name,klass]) => {
      const checkin = latestCheckin(owner);
      return `<div class="checkin-person"><span class="avatar ${klass}">${esc(name[0])}</span><span><strong>${esc(name.split(" ")[0])} · ${esc(checkin?.availability?.replace("-"," ") || "No check-in")}</strong><small>${esc(checkin?.message || "Hasn’t checked in today")}</small></span><span class="checkin-mood">${moodIcons[checkin?.mood] || "○"}</span></div>`;
    }).join("");
  }

  function renderFocus() {
    const members = App.getPresenceMembers();
    const focusing = members.filter((member) => member.focusActive);
    const focusCount = new Set([...focusing.map((item) => item.slot), ...(activeFocus ? [App.currentSlot()] : [])]).size;
    $("#focusRoomStatus").textContent = focusCount ? `${focusCount} focusing now` : "Room is quiet";
    $(".focus-live-pill").classList.toggle("active", focusCount > 0);
    $("#focusNavDot").classList.toggle("hidden", focusCount === 0);
    $("#focusPeople").innerHTML = [["me", state().profile.name, ""], ["partner", state().profile.partner, "second"]].map(([slot,name,klass]) => {
      const member = members.find((item) => item.slot === slot) || (slot === App.currentSlot() && activeFocus ? { focusActive: true, focusLabel: activeFocus.label, view: "focus" } : null);
      const label = member?.focusActive ? member.focusLabel || "Deep work" : member ? `Viewing ${member.view || "HoneyButter"}` : "Offline";
      return `<div class="focus-person"><span class="avatar ${klass}">${esc(name[0])}</span><span><strong>${esc(name)}</strong><small>${esc(label)}</small></span><span class="status">${member?.focusActive ? "Focusing" : member ? "Online" : "Offline"}</span></div>`;
    }).join("");
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 6); weekStart.setHours(0,0,0,0);
    const sessions = (state().focusSessions || []).filter((item) => new Date(item.startedAt) >= weekStart);
    const mine = sessions.filter((item) => item.owner === App.currentSlot());
    $("#focusStats").innerHTML = `<div class="focus-stat"><strong>${mine.reduce((sum,item) => sum + Number(item.completedMinutes || 0),0)}</strong><span>minutes focused</span></div><div class="focus-stat"><strong>${mine.length}</strong><span>sessions completed</span></div>`;
    $("#focusHistory").innerHTML = sessions.slice(0,8).map((item) => `<div class="focus-history-row"><strong>${esc(item.label)}</strong><span>${esc(App.ownerLabel(item.owner))} · ${item.completedMinutes} min</span></div>`).join("") || `<div class="notification-empty">Completed sessions appear here.</div>`;
  }

  function tickFocus() {
    if (!activeFocus) return;
    const remaining = Math.max(0, Math.ceil((activeFocus.endAt - Date.now()) / 1000));
    $("#focusClock").textContent = `${String(Math.floor(remaining/60)).padStart(2,"0")}:${String(remaining%60).padStart(2,"0")}`;
    if (remaining <= 0) finishFocus(false);
  }
  function startFocus() {
    if (activeFocus) return;
    const label = $("#focusLabel").value.trim() || "Deep work";
    activeFocus = { label, plannedMinutes: focusMinutes, startedAt: Date.now(), endAt: Date.now() + focusMinutes * 60000 };
    localStorage.setItem("honeybutter-active-focus", JSON.stringify(activeFocus));
    $("#focusStartBtn").classList.add("hidden"); $("#focusFinishBtn").classList.remove("hidden");
    window.KinCloud?.updatePresence?.("focus", { focusActive: true, focusLabel: label, focusEndAt: new Date(activeFocus.endAt).toISOString() }).catch(() => {});
    focusTimer = setInterval(tickFocus, 1000); tickFocus(); renderFocus(); App.toast("Focus session started. Your partner can see that you are studying.");
  }
  function finishFocus(cancelled = true) {
    if (!activeFocus) return;
    const elapsed = Math.max(1, Math.min(activeFocus.plannedMinutes, Math.round((Date.now() - activeFocus.startedAt) / 60000)));
    state().focusSessions.unshift({ id: uid(), userId: cloud().userId || "local", owner: App.currentSlot(), label: activeFocus.label, plannedMinutes: activeFocus.plannedMinutes, completedMinutes: elapsed, status: cancelled ? "cancelled" : "completed", startedAt: new Date(activeFocus.startedAt).toISOString(), endedAt: new Date().toISOString() });
    clearInterval(focusTimer); focusTimer = null; activeFocus = null; localStorage.removeItem("honeybutter-active-focus");
    $("#focusStartBtn").classList.remove("hidden"); $("#focusFinishBtn").classList.add("hidden"); $("#focusClock").textContent = `${focusMinutes}:00`;
    window.KinCloud?.updatePresence?.("focus", { focusActive: false, focusLabel: null, focusEndAt: null }).catch(() => {});
    save(cancelled ? "Focus session saved." : "Focus session complete — beautiful work.");
  }

  async function extractPdf(file) {
    if (!window.pdfjsLib) throw new Error("PDF reader is still loading");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(`--- Page ${pageNumber} ---\n${content.items.map((item) => item.str).join(" ")}`);
    }
    return pages.join("\n\n");
  }
  async function extractPptx(file) {
    if (!window.JSZip) throw new Error("Presentation reader is still loading");
    const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
    const slideNames = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a,b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    const slides = [];
    for (let index = 0; index < slideNames.length; index++) {
      const xml = await zip.file(slideNames[index]).async("text");
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      const text = [...doc.getElementsByTagName("a:t")].map((node) => node.textContent).filter(Boolean).join("\n");
      slides.push(`--- Slide ${index + 1} ---\n${text}`);
    }
    return slides.join("\n\n");
  }
  async function extractSpreadsheet(file) {
    if (!window.XLSX) throw new Error("Spreadsheet reader is still loading");
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellFormula: true });
    return workbook.SheetNames.map((name) => `--- Sheet: ${name} ---\n${window.XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join("\n\n");
  }
  async function extractStudioFile(file) {
    const extension = file.name.split(".").pop().toLowerCase();
    if (extension === "pdf") return extractPdf(file);
    if (extension === "docx" && window.mammoth) return (await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
    if (extension === "pptx") return extractPptx(file);
    if (["xlsx","xls"].includes(extension)) return extractSpreadsheet(file);
    if (file.type.startsWith("text/") || codeExtensions.has(extension)) return file.text();
    if (cloud().workspace && window.KinCloud?.ingestFile) return window.KinCloud.ingestFile(file);
    throw new Error(`${extension.toUpperCase()} extraction needs the deployed Supabase ingest function`);
  }

  async function uploadFiles(fileList) {
    const files = [...fileList];
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) { App.toast(`${file.name} is larger than the 50 MB workspace limit.`); continue; }
      App.toast(`Opening ${file.name}…`);
      try {
        const id = uid();
        const extension = (file.name.split(".").pop() || "file").toLowerCase();
        const extractedContent = (await extractStudioFile(file)).slice(0, 500000);
        let storagePath = null;
        if (cloud().workspace && window.KinCloud?.uploadWorkspaceFile) {
          try { storagePath = await window.KinCloud.uploadWorkspaceFile(file, id); }
          catch (error) { App.toast(`Original kept on this device only: ${error.message}`); }
        }
        runtimeUrls.set(id, URL.createObjectURL(file));
        state().files.unshift({ id, ownerId: cloud().userId || "local", owner: App.currentSlot(), name: file.name, mimeType: file.type || "application/octet-stream", extension, size: file.size, storagePath, extractedContent, editedContent: null, visibility: "shared", courseId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        if (!openFileIds.includes(id)) openFileIds.push(id);
        activeFileId = id;
        save(`${file.name} added to the File Studio.`);
      } catch (error) { App.toast(`${file.name}: ${error.message}`); }
    }
    renderFiles();
  }

  function filteredFiles() {
    const query = $("#fileSearch").value.trim().toLowerCase();
    return (state().files || []).filter((file) => {
      const matchesFilter = fileFilter === "all" || (fileFilter === "mine" && file.owner === App.currentSlot()) || (fileFilter === "shared" && file.visibility === "shared");
      return matchesFilter && (!query || `${file.name} ${file.extractedContent || ""}`.toLowerCase().includes(query));
    });
  }
  function fileContent(file) { return file?.editedContent ?? file?.extractedContent ?? ""; }
  function highlightedHtml(file) {
    let html = esc(fileContent(file));
    (state().highlights || []).filter((item) => item.fileId === file.id).forEach((item) => {
      const needle = esc(item.selectedText);
      if (needle && html.includes(needle)) html = html.replace(needle, `<mark title="${esc(item.note || "Highlight")}">${needle}</mark>`);
    });
    return html;
  }
  function renderFiles() {
    const files = filteredFiles();
    $("#fileTree").innerHTML = files.length ? `<span class="file-group-label">FILES · ${files.length}</span>${files.map((file) => `<button class="file-tree-item ${file.id === activeFileId ? "active" : ""}" data-open-file="${file.id}"><span class="file-icon ${esc(file.extension)}">${esc(file.extension.slice(0,4) || "file")}</span><span><strong>${esc(file.name)}</strong><small>${esc(App.ownerLabel(file.owner))} · ${sizeLabel(file.size)}</small></span><time>${new Date(file.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</time></button>`).join("")}` : `<div class="notification-empty">Upload a document, slide deck, spreadsheet or code file.</div>`;
    openFileIds = openFileIds.filter((id) => state().files.some((file) => file.id === id));
    $("#editorTabs").innerHTML = openFileIds.length ? openFileIds.map((id) => { const file = state().files.find((item) => item.id === id); return `<button class="editor-tab ${id === activeFileId ? "active" : ""}" data-open-file="${id}"><span class="file-icon ${esc(file.extension)}">${esc(file.extension.slice(0,3))}</span>${esc(file.name)}<span data-close-file="${id}">×</span></button>`; }).join("") : `<div class="empty-tab">No file open</div>`;
    renderActiveFile();
  }

  async function ensureFileUrl(file) {
    if (runtimeUrls.has(file.id)) return runtimeUrls.get(file.id);
    if (file.storagePath && window.KinCloud?.getWorkspaceFileUrl) {
      const url = await window.KinCloud.getWorkspaceFileUrl(file.storagePath);
      runtimeUrls.set(file.id, url); return url;
    }
    return "";
  }
  function renderActiveFile() {
    const file = state().files.find((item) => item.id === activeFileId);
    if (!file) {
      $("#fileCanvas").innerHTML = `<div class="file-empty-state"><span>⌘</span><h2>Open a file to begin</h2><p>DOCX, PDF, PPTX, spreadsheets, text and code are supported.</p></div>`;
      $("#fileDetails").innerHTML = `<p>Select a file to inspect it.</p>`; $("#highlightList").innerHTML = ""; $("#highlightCount").textContent = "0"; return;
    }
    const content = fileContent(file);
    const isCode = codeExtensions.has(file.extension) && !["csv","md","txt"].includes(file.extension);
    const editable = editorMode === "edit";
    let body = isCode
      ? `<textarea class="code-editor" id="studioEditor" spellcheck="false" ${editable ? "" : "readonly"}>${esc(content)}</textarea>`
      : `<article class="document-reader ${editable ? "editing" : ""}" id="studioEditor" contenteditable="${editable}" spellcheck="true">${editable ? esc(content) : highlightedHtml(file)}</article>`;
    if (file.extension === "pptx" && !editable) {
      const slides = content.split(/--- Slide \d+ ---/).slice(1);
      body = `<div class="slide-preview">${slides.map((slide,index) => `<article class="slide-card" data-slide="SLIDE ${index+1}">${esc(slide.trim())}</article>`).join("")}</div>`;
    }
    if (["xlsx","xls","csv"].includes(file.extension) && !editable) body = `<div class="spreadsheet-preview"><pre class="document-reader">${highlightedHtml(file)}</pre></div>`;
    $("#fileCanvas").innerHTML = body;
    if (file.extension === "pdf" && !editable) ensureFileUrl(file).then((url) => { if (url && activeFileId === file.id) $("#fileCanvas").insertAdjacentHTML("afterbegin", `<iframe class="pdf-preview" src="${esc(url)}#toolbar=0" title="${esc(file.name)}"></iframe>`); }).catch(() => {});
    $("#editorFileType").textContent = `${file.extension.toUpperCase()} · ${file.visibility}`;
    $("#editorWordCount").textContent = `${content.trim() ? content.trim().split(/\s+/).length : 0} words`;
    $("#editorSaveStatus").textContent = "All changes saved";
    $("#fileDetails").innerHTML = `<div class="file-detail-row"><span>Name</span><strong>${esc(file.name)}</strong></div><div class="file-detail-row"><span>Owner</span><strong>${esc(App.ownerLabel(file.owner))}</strong></div><div class="file-detail-row"><span>Size</span><strong>${sizeLabel(file.size)}</strong></div><label class="field compact-field"><span>Visibility</span><select id="fileVisibilitySelect" ${file.owner !== App.currentSlot() ? "disabled" : ""}><option value="shared" ${file.visibility === "shared" ? "selected" : ""}>Shared</option><option value="private" ${file.visibility === "private" ? "selected" : ""}>Private</option></select></label>${file.owner === App.currentSlot() ? `<button class="danger-link" data-delete-studio-file="${file.id}">Delete file</button>` : ""}`;
    const highlights = (state().highlights || []).filter((item) => item.fileId === file.id);
    $("#highlightCount").textContent = String(highlights.length);
    $("#highlightList").innerHTML = highlights.map((item) => `<div class="highlight-item"><strong>“${esc(item.selectedText)}”</strong><small>${esc(item.note || "Highlighted passage")}</small></div>`).join("") || `<p class="notification-empty">Select text and press Highlight.</p>`;
    $$("[data-editor-mode]").forEach((button) => button.classList.toggle("active", button.dataset.editorMode === editorMode));
  }

  function openFile(id) {
    if (!state().files.some((file) => file.id === id)) return;
    activeFileId = id; if (!openFileIds.includes(id)) openFileIds.push(id); renderFiles();
    const file = state().files.find((item) => item.id === id);
    window.KinCloud?.updatePresence?.("files", { editingFile: file.name }).catch(() => {});
  }
  async function saveFileEdits() {
    const file = state().files.find((item) => item.id === activeFileId);
    const editor = $("#studioEditor");
    if (!file || !editor) return;
    file.editedContent = editor.tagName === "TEXTAREA" ? editor.value : editor.innerText;
    file.updatedAt = new Date().toISOString();
    $("#editorSaveStatus").textContent = "Saving…";
    save(`${file.name} changes saved.`);
    if (cloud().workspace && cloud().v4Available && window.KinCloud?.saveWorkspaceFileContent) {
      try { await window.KinCloud.saveWorkspaceFileContent(file.id, file.editedContent); }
      catch (error) { App.toast(`Saved on this device; cloud edit failed: ${error.message}`); }
    }
    renderFiles();
  }
  function highlightSelection() {
    const file = state().files.find((item) => item.id === activeFileId);
    const editor = $("#studioEditor");
    if (!file || !editor) return;
    let selectedText = "", startOffset = null, endOffset = null;
    if (editor.tagName === "TEXTAREA") { startOffset = editor.selectionStart; endOffset = editor.selectionEnd; selectedText = editor.value.slice(startOffset, endOffset); }
    else selectedText = window.getSelection()?.toString() || "";
    selectedText = selectedText.trim();
    if (!selectedText) { App.toast("Select a passage in the open file first."); return; }
    const note = window.prompt("Optional note for this highlight:", "") || "";
    state().highlights.unshift({ id: uid(), fileId: file.id, userId: cloud().userId || "local", selectedText: selectedText.slice(0,2000), note: note.slice(0,500), color: "yellow", startOffset, endOffset, createdAt: new Date().toISOString() });
    save(`Highlighted a passage in ${file.name}.`); renderActiveFile();
  }
  async function downloadActiveFile() {
    const file = state().files.find((item) => item.id === activeFileId);
    if (!file) return;
    try {
      let blob;
      if (file.storagePath && window.KinCloud?.downloadWorkspaceFile) blob = await window.KinCloud.downloadWorkspaceFile(file.storagePath);
      else blob = new Blob([fileContent(file)], { type: file.mimeType || "text/plain" });
      const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = file.storagePath ? file.name : file.name.replace(/\.[^.]+$/, "") + "-edited.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
    } catch (error) { App.toast(error.message); }
  }
  async function deleteFile(id) {
    const file = state().files.find((item) => item.id === id); if (!file || file.owner !== App.currentSlot()) return;
    if (!window.confirm(`Delete ${file.name}? This also removes its saved highlights.`)) return;
    try { if (cloud().workspace && window.KinCloud?.deleteWorkspaceFile) await window.KinCloud.deleteWorkspaceFile(file.storagePath, file.id); } catch (error) { App.toast(error.message); return; }
    state().files = state().files.filter((item) => item.id !== id); state().highlights = state().highlights.filter((item) => item.fileId !== id); openFileIds = openFileIds.filter((item) => item !== id); activeFileId = openFileIds.at(-1) || null; save(`${file.name} deleted.`); renderFiles();
  }
  function newTextFile() {
    const name = window.prompt("File name:", "untitled.md")?.trim(); if (!name) return;
    const extension = (name.split(".").pop() || "txt").toLowerCase(); const id = uid();
    state().files.unshift({ id, ownerId: cloud().userId || "local", owner: App.currentSlot(), name, mimeType: "text/plain", extension, size: 0, storagePath: null, extractedContent: "", editedContent: "# New file\n\nStart writing here…", visibility: "shared", courseId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    activeFileId = id; openFileIds.push(id); editorMode = "edit"; save(`${name} created.`); renderFiles();
  }

  function openCheckin() {
    const existing = latestCheckin(App.currentSlot());
    const mood = existing?.mood || "good";
    $$("[data-mood]").forEach((button) => button.classList.toggle("active", button.dataset.mood === mood));
    $("#checkinAvailability").value = existing?.availability || "available"; $("#checkinMessage").value = existing?.message || ""; $("#checkinModal").showModal();
  }
  function saveCheckin() {
    const current = latestCheckin(App.currentSlot());
    const data = { mood: $("[data-mood].active")?.dataset.mood || "good", availability: $("#checkinAvailability").value, message: $("#checkinMessage").value.trim(), updatedAt: new Date().toISOString() };
    if (current) Object.assign(current, data);
    else state().checkins.unshift({ id: uid(), userId: cloud().userId || "local", owner: App.currentSlot(), date: today(), createdAt: new Date().toISOString(), ...data });
    $("#checkinModal").close(); window.KinCloud?.updatePresence?.("home", { availability: data.availability, mood: data.mood }).catch(() => {}); save("Daily check-in shared.");
  }

  function renderCommandSuggestions() {
    const input = $("#globalSearch"); if (!input) return;
    const query = input.value.trim(); if (!query) return;
    const lower = query.toLowerCase();
    const commands = [];
    if (lower.startsWith("/task ") || lower.startsWith("add task ")) commands.push({ action: "task", label: `Create task “${query.replace(/^\/task\s+|^add task\s+/i, "")}"`, hint: "Review details before saving" });
    if (lower === "/focus" || lower.includes("start focus")) commands.push({ action: "focus", label: "Start a 25-minute focus session", hint: "Open Focus Room" });
    if (lower === "/files" || lower.includes("open file studio")) commands.push({ action: "files", label: "Open File Studio", hint: "Documents, slides and code" });
    if (!commands.length && query.length > 4) commands.push({ action: "ask", label: `Ask HoneyButter: “${query}”`, hint: "Grounded in your accessible Brain" });
    const current = $("#searchResults").innerHTML;
    $("#searchResults").innerHTML = commands.map((item) => `<button class="search-result command-result" data-v4-command="${item.action}" data-command-value="${esc(query)}"><span class="note-icon plans">⌘</span><span><strong>${esc(item.label)}</strong><span>${esc(item.hint)}</span></span><small>command</small></button>`).join("") + current;
  }
  function runCommand(action, value) {
    $("#searchModal").close();
    if (action === "task") { App.openTask(); setTimeout(() => { $("#taskTitle").value = value.replace(/^\/task\s+|^add task\s+/i, ""); }, 30); }
    if (action === "focus") App.navigate("focus");
    if (action === "files") App.navigate("files");
    if (action === "ask") App.askBrain(value);
  }

  function applyGraphTypeFilter(type) {
    $$("[data-graph-filter]").forEach((button) => button.classList.toggle("active", button.dataset.graphFilter === type));
    $$(".graph-node").forEach((node) => node.classList.toggle("dimmed", type !== "all" && !node.classList.contains(type) && !node.classList.contains("root")));
    $$(".graph-edge").forEach((edge) => edge.style.opacity = type === "all" ? "" : ".16");
  }

  function updateBrowserAlertButton() {
    const button = $("#enableBrowserAlerts");
    if (!button) return;
    if (!("Notification" in window)) { button.textContent = "Alerts unavailable"; button.disabled = true; return; }
    button.textContent = Notification.permission === "granted" ? "Alerts enabled" : Notification.permission === "denied" ? "Alerts blocked" : "Enable alerts";
    button.disabled = Notification.permission === "denied";
  }

  async function enableBrowserAlerts() {
    if (!("Notification" in window)) { App.toast("This browser does not support desktop notifications."); return; }
    const permission = await Notification.requestPermission();
    updateBrowserAlertButton();
    if (permission === "granted") { App.toast("Browser alerts enabled while HoneyButter is open."); maybeSendBrowserAlerts(true); }
    else App.toast("Notifications were not enabled. You can change this in your browser site settings.");
  }

  function maybeSendBrowserAlerts(force = false) {
    if (!("Notification" in window) || Notification.permission !== "granted" || document.visibilityState === "hidden") return;
    const now = new Date();
    const day = now.getDay() || 7;
    const minute = now.getHours() * 60 + now.getMinutes();
    const stamp = today();
    const sentKey = "honeybutter-browser-alerts";
    let sent = [];
    try { sent = JSON.parse(localStorage.getItem(sentKey) || "[]").filter((key) => key.startsWith(`${stamp}:`)); } catch (_) { sent = []; }
    const notify = (key, title, body) => {
      const fullKey = `${stamp}:${key}`;
      if (!force && sent.includes(fullKey)) return;
      new Notification(title, { body, tag: fullKey });
      sent.push(fullKey);
    };
    const due = state().tasks.filter((task) => !task.completed && task.date === stamp && [App.currentSlot(), "both"].includes(task.owner));
    if (due.length) notify("due-tasks", `HoneyButter · ${due.length} task${due.length === 1 ? "" : "s"} due today`, due.slice(0, 3).map((task) => task.title).join(" · "));
    state().timetables.filter((item) => item.owner === App.currentSlot() && item.day === day && minutes(item.start) >= minute && minutes(item.start) <= minute + 15).forEach((item) => notify(`class-${item.id}-${item.start}`, `HoneyButter · ${item.title} starts soon`, `${item.start}${item.location ? ` · ${item.location}` : ""}`));
    localStorage.setItem(sentKey, JSON.stringify([...new Set(sent)].slice(-80)));
  }

  function renderAll() { renderLiving(); renderFocus(); renderFiles(); updateBrowserAlertButton(); document.body.classList.toggle("dark-theme", (state().preferences?.theme || localStorage.getItem("honeybutter-theme")) === "dark"); }

  $("#themeButton").addEventListener("click", () => {
    state().preferences ||= {};
    state().preferences.theme = document.body.classList.contains("dark-theme") ? "light" : "dark";
    localStorage.setItem("honeybutter-theme", state().preferences.theme); document.body.classList.toggle("dark-theme", state().preferences.theme === "dark");
  });
  $("#enableBrowserAlerts")?.addEventListener("click", enableBrowserAlerts);
  $("#openCheckinBtn").addEventListener("click", openCheckin);
  $$("[data-mood]").forEach((button) => button.addEventListener("click", () => $$("[data-mood]").forEach((item) => item.classList.toggle("active", item === button))));
  $("#checkinForm").addEventListener("submit", (event) => { event.preventDefault(); saveCheckin(); });
  $$("[data-focus-minutes]").forEach((button) => button.addEventListener("click", () => {
    if (activeFocus) return; focusMinutes = Number(button.dataset.focusMinutes); $$("[data-focus-minutes]").forEach((item) => item.classList.toggle("active", item === button)); $("#focusClock").textContent = `${focusMinutes}:00`;
  }));
  $("#focusStartBtn").addEventListener("click", startFocus); $("#focusFinishBtn").addEventListener("click", () => finishFocus(true));
  $("#studioUploadBtn").addEventListener("click", () => $("#studioFileInput").click()); $("#explorerUploadBtn").addEventListener("click", () => $("#studioFileInput").click());
  $("#studioFileInput").addEventListener("change", async (event) => { await uploadFiles(event.target.files); event.target.value = ""; });
  $("#newTextFileBtn").addEventListener("click", newTextFile); $("#fileSearch").addEventListener("input", renderFiles);
  $("#highlightSelectionBtn").addEventListener("click", highlightSelection); $("#saveFileEditsBtn").addEventListener("click", saveFileEdits); $("#downloadStudioFileBtn").addEventListener("click", downloadActiveFile);
  $("#fileAskForm").addEventListener("submit", (event) => { event.preventDefault(); const file = state().files.find((item) => item.id === activeFileId); const question = $("#fileAskInput").value.trim(); if (!file || !question) return; App.askBrain(`Using the workspace file “${file.name}”, ${question}`); $("#fileAskInput").value = ""; });
  $("#globalSearch").addEventListener("input", () => setTimeout(renderCommandSuggestions, 0));
  $("#studioEditor")?.addEventListener?.("input", () => { $("#editorSaveStatus").textContent = "Unsaved changes"; });

  document.addEventListener("input", (event) => { if (event.target.closest("#studioEditor")) $("#editorSaveStatus").textContent = "Unsaved changes"; });
  document.addEventListener("change", (event) => {
    if (event.target.id === "fileVisibilitySelect") { const file = state().files.find((item) => item.id === activeFileId); if (file && file.owner === App.currentSlot()) { file.visibility = event.target.value; file.updatedAt = new Date().toISOString(); save(`${file.name} is now ${file.visibility}.`); } }
  });
  document.addEventListener("click", (event) => {
    const close = event.target.closest("[data-close-file]");
    if (close) { event.stopPropagation(); openFileIds = openFileIds.filter((id) => id !== close.dataset.closeFile); if (activeFileId === close.dataset.closeFile) activeFileId = openFileIds.at(-1) || null; renderFiles(); return; }
    const open = event.target.closest("[data-open-file]"); if (open) { openFile(open.dataset.openFile); return; }
    const filter = event.target.closest("[data-file-filter]"); if (filter) { fileFilter = filter.dataset.fileFilter; $$("[data-file-filter]").forEach((button) => button.classList.toggle("active", button === filter)); renderFiles(); }
    const mode = event.target.closest("[data-editor-mode]"); if (mode) { editorMode = mode.dataset.editorMode; renderActiveFile(); }
    const remove = event.target.closest("[data-delete-studio-file]"); if (remove) deleteFile(remove.dataset.deleteStudioFile);
    const command = event.target.closest("[data-v4-command]"); if (command) runCommand(command.dataset.v4Command, command.dataset.commandValue);
    const graphFilter = event.target.closest("[data-graph-filter]"); if (graphFilter) applyGraphTypeFilter(graphFilter.dataset.graphFilter);
  });
  document.addEventListener("dragstart", (event) => {
    const card = event.target.closest("[data-class-id]"); if (!card) return; card.classList.add("dragging"); event.dataTransfer.setData("text/honeybutter-class", card.dataset.classId); event.dataTransfer.effectAllowed = "move";
  });
  document.addEventListener("dragend", (event) => event.target.closest("[data-class-id]")?.classList.remove("dragging"));
  document.addEventListener("dragover", (event) => { const day = event.target.closest("[data-timetable-day]"); if (!day) return; event.preventDefault(); day.classList.add("drag-over"); });
  document.addEventListener("dragleave", (event) => event.target.closest("[data-timetable-day]")?.classList.remove("drag-over"));
  document.addEventListener("drop", (event) => {
    const day = event.target.closest("[data-timetable-day]"); if (!day) return; event.preventDefault(); day.classList.remove("drag-over"); const id = event.dataTransfer.getData("text/honeybutter-class"); const item = state().timetables.find((entry) => entry.id === id); if (item && item.day !== Number(day.dataset.timetableDay)) { item.day = Number(day.dataset.timetableDay); save(`${item.title} moved to ${day.querySelector(".timetable-day-head").textContent}.`); }
  });

  try {
    const storedFocus = JSON.parse(localStorage.getItem("honeybutter-active-focus"));
    if (storedFocus?.endAt > Date.now()) { activeFocus = storedFocus; focusMinutes = storedFocus.plannedMinutes || 25; $("#focusStartBtn").classList.add("hidden"); $("#focusFinishBtn").classList.remove("hidden"); focusTimer = setInterval(tickFocus, 1000); tickFocus(); }
    else localStorage.removeItem("honeybutter-active-focus");
  } catch (_) { localStorage.removeItem("honeybutter-active-focus"); }
  state().preferences ||= { theme: localStorage.getItem("honeybutter-theme") || "light" };
  window.HoneyButterV4 = { renderAll, renderFocus, openFile, uploadFiles };
  renderAll(); maybeSendBrowserAlerts(); setInterval(() => { renderLiving(); maybeSendBrowserAlerts(); }, 30000);
})();
