import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const javascript = ["app.js", "v4.js"].map((name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8")).join("\n");
const delegatedAttributes = ["data-view-target", "data-action", "data-login-person", "data-task-filter", "data-timetable-filter", "data-vault-filter", "data-focus-minutes", "data-file-filter", "data-editor-mode", "data-graph-filter", "data-prompt", "data-person-tasks", "data-mood"];
const missing = [];

for (const match of html.matchAll(/<button\b([^>]*)>/gi)) {
  const attributes = match[1];
  const id = attributes.match(/\bid="([^"]+)"/i)?.[1];
  const isNative = /\btype="submit"/i.test(attributes) || /\bvalue="cancel"/i.test(attributes);
  const isDelegated = delegatedAttributes.some((attribute) => new RegExp(`\\b${attribute}=`).test(attributes));
  const hasIdHandler = id && (javascript.includes(`\"#${id}\"`) || javascript.includes(`closest(\"#${id}\")`));
  if (!isNative && !isDelegated && !hasIdHandler) missing.push(id || attributes.trim().slice(0, 100));
}

if (missing.length) {
  console.error("Buttons without a detectable handler:");
  missing.forEach((item) => console.error(`- ${item}`));
  process.exitCode = 1;
} else {
  console.log("Button audit passed: every static button has a native, direct, or delegated action.");
}
