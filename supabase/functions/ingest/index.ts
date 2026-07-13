const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured in Supabase secrets");
    const { name, type, data } = await request.json();
    if (!data || !name) throw new Error("A supported file is required");
    const extension = String(name).toLowerCase().split(".").pop() || "";
    const mimeByExtension: Record<string, string> = {
      pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      csv: "text/csv", txt: "text/plain", md: "text/markdown", json: "application/json", html: "text/html",
      js: "text/javascript", ts: "text/typescript", py: "text/x-python", sql: "text/x-sql", xml: "text/xml", rtf: "application/rtf"
    };
    const mime = String(type || mimeByExtension[extension] || "application/octet-stream");
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    let text = "";
    if (mime.startsWith("audio/")) {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mime }), name || "recording");
      form.append("model", "gpt-4o-mini-transcribe");
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Transcription failed");
      text = result.text || "";
    } else if (mime.startsWith("image/")) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-5.6-luna", max_output_tokens: 3000, input: [{ role: "user", content: [{ type: "input_text", text: "Extract all readable text from this image, preserving headings and lists. Then add a short factual summary. Do not invent obscured text." }, { type: "input_image", image_url: `data:${mime};base64,${data}` }] }] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Image extraction failed");
      text = result.output_text || result.output?.flatMap((item: any) => item.content || []).map((item: any) => item.text || "").join("") || "";
    } else {
      const supported = new Set(["pdf","doc","docx","rtf","odt","ppt","pptx","xls","xlsx","csv","tsv","txt","md","json","html","htm","xml","css","js","mjs","ts","tsx","jsx","py","java","c","cpp","h","sql","yaml","yml","toml"]);
      if (!supported.has(extension)) throw new Error(`.${extension || "unknown"} files are not supported yet`);
      const prompt = extension === "ppt" || extension === "pptx"
        ? "Extract the presentation slide by slide. Preserve slide numbers, headings, bullet hierarchy, speaker notes when available, and factual table content. End with a short presentation summary."
        : extension === "xls" || extension === "xlsx" || extension === "csv" || extension === "tsv"
          ? "Extract sheet names, headers, key rows, formulas when visible, and important patterns. Preserve tabular meaning and end with a concise factual summary."
          : "Extract all document text faithfully. Preserve headings, lists, code blocks and page or section boundaries when available. End with a short factual summary. Do not invent missing content.";
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          max_output_tokens: 8000,
          input: [{ role: "user", content: [
            { type: "input_file", filename: name, file_data: `data:${mime};base64,${data}`, ...(extension === "pdf" ? { detail: "high" } : {}) },
            { type: "input_text", text: prompt }
          ] }]
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Document extraction failed");
      text = result.output_text || result.output?.flatMap((item: any) => item.content || []).map((item: any) => item.text || "").join("") || "";
    }
    return Response.json({ text }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "File ingestion failed" }, { status: 400, headers: cors });
  }
});
