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
    if (!data || !type) throw new Error("A supported file is required");
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    let text = "";
    if (String(type).startsWith("audio/")) {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type }), name || "recording");
      form.append("model", "gpt-4o-mini-transcribe");
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Transcription failed");
      text = result.text || "";
    } else if (String(type).startsWith("image/")) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-5.6-luna", max_output_tokens: 3000, input: [{ role: "user", content: [{ type: "input_text", text: "Extract all readable text from this image, preserving headings and lists. Then add a short factual summary. Do not invent obscured text." }, { type: "input_image", image_url: `data:${type};base64,${data}` }] }] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Image extraction failed");
      text = result.output_text || result.output?.flatMap((item: any) => item.content || []).map((item: any) => item.text || "").join("") || "";
    } else throw new Error("Use the browser importer for PDF and text files");
    return Response.json({ text }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "File ingestion failed" }, { status: 400, headers: cors });
  }
});
