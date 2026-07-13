const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured in Supabase secrets");
    const { question, context } = await request.json();
    if (!question || !context) throw new Error("Question and grounded context are required");
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        reasoning: { effort: "low" },
        max_output_tokens: 1400,
        instructions: "You are HoneyButter, a private study and life assistant for a two-person workspace. Answer only from the supplied accessible context. Separate facts from suggestions, never invent deadlines or course details, and cite source titles in square brackets. If context is insufficient, say what should be saved next.",
        input: `QUESTION:\n${String(question).slice(0, 4000)}\n\nACCESSIBLE CONTEXT:\n${JSON.stringify(context).slice(0, 350000)}`,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "OpenAI request failed");
    const answer = data.output_text || data.output?.flatMap((item: any) => item.content || []).map((item: any) => item.text || "").join("") || "";
    if (!answer) throw new Error("The model returned no text");
    return Response.json({ answer }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Brain request failed" }, { status: 400, headers: cors });
  }
});
