const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured in Supabase secrets");
    const { inputs } = await request.json();
    if (!Array.isArray(inputs) || !inputs.length || inputs.length > 40) throw new Error("Provide between 1 and 40 text inputs");
    const clean = inputs.map((item: unknown) => String(item || "").slice(0, 24000));
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: clean, encoding_format: "float" }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message || "Embedding request failed");
    return Response.json({ embeddings: result.data.map((item: any) => item.embedding) }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Embedding failed" }, { status: 400, headers: cors });
  }
});
