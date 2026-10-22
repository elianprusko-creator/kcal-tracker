// Supabase Edge Function "estimate": Nährwerte per Gemini (mit Google-Suche) schätzen.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const out = (b: unknown) =>
  new Response(JSON.stringify(b), { headers: { ...CORS, "Content-Type": "application/json" } });

const PROMPT = `Du bist ein präziser Ernährungsassistent. Zerlege die Eingabe in einzelne Lebensmittel.
Bei Markenprodukten (z. B. Aldi, Lidl, Rewe, Hersteller) suche per Google die Nährwerte pro 100 g beim Hersteller oder Händler und rechne auf die genannte Menge um.
Ohne Mengenangabe: nimm eine übliche Portion an und nenne die Annahme in "note".
Antworte NUR mit JSON, ohne Markdown und ohne Text davor oder danach:
{"items":[{"name":"","amount":"z. B. 80 g","kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"confidence":"hoch|mittel|niedrig","note":"kurz: Quelle oder Annahme"}]}
Alle Zahlen gelten für die gesamte genannte Menge, nicht pro 100 g.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { text, image } = await req.json();
    if (!text && !image) return out({ error: "Leere Eingabe." });
    const key = Deno.env.get("GEMINI_API_KEY");
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
    if (!key) return out({ error: "GEMINI_API_KEY fehlt in den Supabase-Secrets." });

    const parts: unknown[] = [{ text: `${PROMPT}\n\nEingabe: ${text || "(siehe Bild)"}` }];
    if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } });

    const call = (search: boolean) =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts }],
          ...(search ? { tools: [{ google_search: {} }] } : {}),
          generationConfig: { temperature: 0.2 },
        }),
      });

    let searched = true;
    let r = await call(true);
    if (!r.ok) { searched = false; r = await call(false); } // Fallback ohne Websuche
    const d = await r.json();
    if (!r.ok) return out({ error: `Gemini: ${d?.error?.message || r.status}` });

    const c = d.candidates?.[0];
    const raw = (c?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("");
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return out({ error: "Antwort nicht lesbar. Versuche es nochmal." });
    const items = JSON.parse(m[0]).items || [];
    const sources = (c?.groundingMetadata?.groundingChunks || [])
      .map((g: { web?: { title?: string; uri?: string } }) => g.web)
      .filter(Boolean).slice(0, 4)
      .map((w: { title?: string; uri?: string }) => ({ title: w.title, url: w.uri }));
    return out({ items, sources, searched: searched && sources.length > 0 });
  } catch (e) {
    return out({ error: String(e) });
  }
});
