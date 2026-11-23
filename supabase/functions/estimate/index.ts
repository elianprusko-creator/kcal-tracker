// Supabase Edge Function "estimate": Nährwerte schätzen.
// Reihenfolge, um KI-Aufrufe zu sparen:
//   1. Einfache Eingaben ("2 Bananen, 250 g Skyr") direkt aus der Tabelle (foods.ts), ohne KI –
//      aber nur, wenn die Tabelle JEDEN Teil versteht (sonst geht der Zusammenhang verloren)
//   2. Sonst: Gemini zerlegt die ganze Eingabe (ein Aufruf ohne Suche), bekannte Lebensmittel trotzdem aus der Tabelle
//   3. Markenprodukte: Open Food Facts
//   4. Nur was dann noch unsicher ist: Gemini mit Google-Suche (ein gemeinsamer Aufruf)
import { findFood, fromTable, type Item, parseLocal, splitInput } from "./parse.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const out = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const r1 = (n: unknown) => Math.round((Number(n) || 0) * 10) / 10;

const PARSE_PROMPT = `Du bist ein präziser Ernährungsassistent. Zerlege die Eingabe in einzelne Lebensmittel bzw. Zutaten.
Zusammengesetzte Gerichte (z. B. Lasagne, Döner, Pizza) bleiben ein Eintrag, außer die Zutaten werden einzeln genannt.
Lies die Eingabe als ganzen Satz: Wörter wie "dazwischen", "darauf", "drauf", "mit", "dazu" beziehen sich auf das vorher Genannte.
Mengen ohne Zahl passend zum Zusammenhang schätzen, z. B. Aufstrich auf Brot: Butter ca. 5 g pro Scheibe,
Erdnussbutter/Nuss-Nougat-Creme/Marmelade ca. 10–15 g pro Scheibe; zwischen 2 Scheiben (Sandwich) zählt eine Schicht.
Felder pro Eintrag:
- name: kurzer deutscher Name, wie gemeint (mit Marke, falls genannt)
- generic: allgemeiner deutscher Lebensmittelname ohne Marke im Singular, z. B. "Banane", "Reis gekocht", "Hähnchenbrust", "Milch"
- brand: Marke, Händler oder Restaurant (z. B. "Milbona", "Ehrmann", "McDonald's"), sonst null
- grams: Menge in Gramm (Getränke in ml) als Zahl
- amount: Mengenangabe als kurzer Text, z. B. "2 Stück", "250 g", "1 dünne Schicht"
- kcal, protein_g, carbs_g, fat_g: Werte für die gesamte Menge aus deinem Wissen
- confidence: "hoch", "mittel" oder "niedrig"
- note: kurz, welche Annahme du getroffen hast
- needs_search: true bei Markenprodukten, Fertiggerichten, Restaurant-/Fastfood-Gerichten oder wenn du die Werte nicht sicher kennst, sonst false
Ohne Mengenangabe: übliche Portion annehmen und in note nennen.
Antwort als JSON: {"items":[{"name":"","generic":"","brand":null,"grams":0,"amount":"","kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"confidence":"","note":"","needs_search":false}]}`;

const SEARCH_PROMPT = `Recherchiere per Google die Nährwerte der folgenden Lebensmittel beim Hersteller, Händler oder Restaurant
(pro 100 g oder pro Portion) und rechne auf die angegebene Menge in Gramm um.
Antworte NUR mit JSON, ohne Markdown und ohne Text davor oder danach, in derselben Reihenfolge:
{"items":[{"name":"","amount":"","grams":0,"kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"confidence":"hoch|mittel|niedrig","note":"kurz: Quelle"}]}
Alle Zahlen gelten für die gesamte Menge, nicht pro 100 g.`;

type AiItem = {
  name?: string;
  generic?: string;
  brand?: string | null;
  grams?: number;
  amount?: string;
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  confidence?: string;
  note?: string;
  needs_search?: boolean;
};

type Source = { title?: string; url?: string };

// Möglichst wenig "Nachdenken" = schnellere Antwort. Nicht jedes Modell kennt jede Stufe;
// lehnt das Modell eine Stufe ab, wird die nächste probiert (gemerkt, solange die Function warm ist).
const THINKING_LEVELS = ["minimal", "low", null];
let thinkingIdx = 0;

const RETRY_STATUS = new Set([429, 500, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function friendlyError(status: number, message: string): string {
  if (status === 503 || /overload|high demand|spikes/i.test(message)) {
    return "Die KI ist gerade überlastet. Bitte in ein paar Sekunden nochmal versuchen.";
  }
  if (status === 429) return "KI-Limit erreicht (zu viele Anfragen). Kurz warten und nochmal versuchen.";
  return `Gemini: ${message || status}`;
}

async function callGemini(model: string, parts: unknown[], search: boolean, timeoutMs: number) {
  const level = THINKING_LEVELS[thinkingIdx];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")! },
    body: JSON.stringify({
      contents: [{ parts }],
      ...(search ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: {
        temperature: 0.2,
        // JSON-Modus geht nicht zusammen mit der Google-Suche
        ...(search ? {} : { responseMimeType: "application/json" }),
        ...(level ? { thinkingConfig: { thinkingLevel: level } } : {}),
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 400 && level && /thinking/i.test(d?.error?.message || "")) {
    thinkingIdx++;
    return callGemini(model, parts, search, timeoutMs);
  }
  return { r, d };
}

async function gemini(parts: unknown[], search: boolean): Promise<{ items: AiItem[]; sources: Source[] }> {
  if (!Deno.env.get("GEMINI_API_KEY")) throw new Error("GEMINI_API_KEY fehlt in den Supabase-Secrets.");
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
  const fallback = Deno.env.get("GEMINI_FALLBACK_MODEL") || "gemini-flash-lite-latest";

  // Bei Überlastung: kurz warten und nochmal, dann auf das kleinere Modell ausweichen.
  // Die Suche bekommt nur einen Versuch, weil es ohne sie eine Schätzung als Ersatz gibt.
  const attempts = search ? [model] : [model, model, fallback].filter((m, i, a) => i < 2 || m !== a[0]);
  // deno-lint-ignore no-explicit-any
  let d: any = null;
  let lastError = "";
  for (let i = 0; i < attempts.length; i++) {
    try {
      const res = await callGemini(attempts[i], parts, search, search ? 30000 : 20000);
      if (res.r.ok) {
        d = res.d;
        break;
      }
      lastError = friendlyError(res.r.status, res.d?.error?.message || "");
      if (!RETRY_STATUS.has(res.r.status)) break;
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "TimeoutError")) throw e;
      lastError = "Die KI antwortet gerade nicht (Zeitüberschreitung). Bitte nochmal versuchen.";
    }
    if (i === 0) await sleep(1500);
  }
  if (!d) throw new Error(lastError);

  const c = d.candidates?.[0];
  const raw = (c?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("");
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Antwort nicht lesbar. Versuche es nochmal.");
  const sources = (c?.groundingMetadata?.groundingChunks || [])
    .map((g: { web?: { title?: string; uri?: string } }) => g.web)
    .filter(Boolean)
    .map((w: { title?: string; uri?: string }) => ({ title: w.title, url: w.uri }));
  return { items: JSON.parse(m[0]).items || [], sources };
}

// "2 Stück" -> "2 Stück (≈ 240 g)", damit die Grammzahl immer sichtbar ist
function withGrams(amount: string | undefined, grams: number): string {
  if (!grams) return amount || "";
  if (!amount) return `${Math.round(grams)} g`;
  return /\d\s*(g|ml)\b/i.test(amount) ? amount : `${amount} (≈ ${Math.round(grams)} g)`;
}

function fromAi(a: AiItem, source: "ki" | "ki_suche"): Item {
  return {
    name: a.name || a.generic || "Unbenannt",
    amount: withGrams(a.amount, Number(a.grams) || 0),
    grams: Number(a.grams) || null,
    kcal: Math.round(Number(a.kcal) || 0),
    protein_g: r1(a.protein_g),
    carbs_g: r1(a.carbs_g),
    fat_g: r1(a.fat_g),
    confidence: a.confidence || "mittel",
    note: [a.note, source === "ki" ? "KI-Schätzung" : ""].filter(Boolean).join(" · "),
    source,
  };
}

// Markenprodukt bei Open Food Facts suchen (nur Produkte aus Deutschland)
async function openFoodFacts(a: AiItem): Promise<Item | null> {
  const grams = Number(a.grams);
  if (!a.brand || !grams) return null;
  const base = (a.generic || a.name || "").toLowerCase();
  const query = `${a.brand} ${base}`.trim();

  try {
    const url = "https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=10" +
      "&countries_tags_en=germany&fields=code,product_name,brands,nutriments&search_terms=" + encodeURIComponent(query);
    const r = await fetch(url, {
      headers: { "User-Agent": "KcalTracker/0.1 (Supabase Edge Function)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const d = await r.json();

    const brand = a.brand.toLowerCase();
    const words = base.split(/[\s-]+/).filter((w) => w.length > 2);
    type Product = { code?: string; product_name?: string; brands?: string; nutriments?: Record<string, number> };
    let best: Product | null = null;
    let bestScore = 0;
    for (const p of (d.products || []) as Product[]) {
      if (p.nutriments?.["energy-kcal_100g"] == null) continue;
      const pname = (p.product_name || "").toLowerCase();
      const pbrand = (p.brands || "").toLowerCase();
      const brandHit = pbrand.includes(brand) || brand.includes(pbrand.split(",")[0].trim() || "§");
      const wordHits = words.filter((w) => pname.includes(w)).length;
      // Marke passt und mindestens ein Wort vom Produkt, sonst verwerfen
      const score = (brandHit ? 2 : 0) + wordHits;
      if (brandHit && (wordHits > 0 || words.length === 0) && score > bestScore) {
        best = p;
        bestScore = score;
      }
    }
    if (!best) return null;

    const n = best.nutriments!;
    const k = grams / 100;
    return {
      name: a.name || best.product_name || "Produkt",
      amount: withGrams(a.amount, grams),
      grams: Math.round(grams),
      kcal: Math.round(Number(n["energy-kcal_100g"]) * k),
      protein_g: r1(Number(n.proteins_100g || 0) * k),
      carbs_g: r1(Number(n.carbohydrates_100g || 0) * k),
      fat_g: r1(Number(n.fat_100g || 0) * k),
      confidence: "hoch",
      note: `Open Food Facts: ${best.product_name || "?"} (${best.brands || "?"})`,
      source: "off",
      source_url: best.code ? `https://world.openfoodfacts.org/product/${best.code}` : undefined,
    };
  } catch {
    return null; // Open Food Facts nicht erreichbar -> weiter mit KI
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const started = Date.now();
  try {
    // Nur eingeloggte Nutzer (der publishable Key allein reicht nicht)
    const apikey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    const auth = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
      headers: { apikey, Authorization: req.headers.get("Authorization") || "" },
    });
    if (!auth.ok) return out({ error: "Nicht angemeldet." }, 401);

    const { text, image } = await req.json();
    if (!text && !image) return out({ error: "Leere Eingabe." });

    const items: Item[] = [];
    let sources: Source[] = [];
    let aiCalls = 0;

    // 1. Tabelle – nur wenn alle Teile erkannt werden (bei Bildern immer KI)
    const local = image ? [] : splitInput(String(text)).map(parseLocal);
    const allLocal = local.length > 0 && local.every(Boolean);
    if (allLocal) items.push(...(local as Item[]));

    if (!allLocal) {
      // 2. KI zerlegt die ganze Eingabe
      const parts: unknown[] = [{ text: `${PARSE_PROMPT}\n\nEingabe: ${text || "(siehe Bild)"}` }];
      if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } });
      aiCalls++;
      const parsed = await gemini(parts, false);

      // 3. Markenprodukte bei Open Food Facts – alle gleichzeitig abfragen
      const offResults = await Promise.all(
        parsed.items.map((a) => (a.brand ? openFoodFacts(a) : Promise.resolve(null))),
      );

      const toSearch: AiItem[] = [];
      parsed.items.forEach((a, i) => {
        const grams = Number(a.grams) || 0;
        const food = !a.brand && grams ? findFood(a.generic) || findFood(a.name) : null;
        if (food) items.push(fromTable(food, grams, withGrams(a.amount, grams), a.note || ""));
        else if (offResults[i]) items.push(offResults[i]!);
        else if (a.needs_search || a.brand) toSearch.push(a);
        else items.push(fromAi(a, "ki"));
      });

      // 4. Google-Suche nur für den unsicheren Rest
      if (toSearch.length) {
        const list = toSearch.map((a) => ({ name: a.name, brand: a.brand, grams: a.grams, amount: a.amount }));
        try {
          aiCalls++;
          const found = await gemini([{ text: `${SEARCH_PROMPT}\n\n${JSON.stringify(list)}` }], true);
          toSearch.forEach((a, i) => {
            const f = found.items[i];
            items.push(f ? fromAi({ ...f, name: f.name || a.name }, "ki_suche") : fromAi(a, "ki"));
          });
          sources = found.sources.slice(0, 4);
        } catch {
          // Suche nicht verfügbar (z. B. Free-Tier-Limit) -> Schätzungen aus Schritt 2 behalten
          toSearch.forEach((a) => items.push(fromAi({ ...a, note: `${a.note || ""} (Suche nicht verfügbar)` }, "ki")));
        }
      }
    }

    return out({ items, sources, ai_calls: aiCalls, ms: Date.now() - started });
  } catch (e) {
    return out({ error: e instanceof Error ? e.message : String(e) });
  }
});
