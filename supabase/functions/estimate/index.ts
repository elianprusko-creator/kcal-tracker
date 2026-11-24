// Supabase Edge Function "estimate": Nährwerte schätzen.
// Reihenfolge, um KI-Aufrufe zu sparen:
//   1. Einfache Eingaben ("2 Bananen, 250 g Skyr") direkt aus der Tabelle "foods" (Datenbank), ohne KI –
//      aber nur, wenn die Tabelle JEDEN Teil versteht (sonst geht der Zusammenhang verloren)
//   2. Sonst: Gemini zerlegt die ganze Eingabe (ein Aufruf ohne Suche), bekannte Lebensmittel trotzdem aus der Tabelle
//   3. Markenprodukte: Open Food Facts
//   4. Nur was dann noch unsicher ist: Gemini mit Google-Suche (ein gemeinsamer Aufruf)
import { findFood, type Food, fromTable, type Item, parseLocal, setFoods, splitInput } from "./parse.ts";

// Tabelle "foods" aus der Datenbank laden, 10 Minuten zwischenspeichern
let foodsLoadedAt = 0;

async function loadFoods(apikey: string, authorization: string) {
  if (Date.now() - foodsLoadedAt < 10 * 60 * 1000) return;
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/foods?select=*`, {
      headers: { apikey, Authorization: authorization },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return;
    type Row = {
      name: string; alias: string[]; kcal: number; protein_g: number; carbs_g: number; fat_g: number;
      piece_g: number | null; portion_g: number; units: Record<string, number>; note: string | null;
    };
    const rows: Row[] = await r.json();
    setFoods(rows.map((row): Food => ({
      name: row.name,
      alias: row.alias,
      kcal: Number(row.kcal),
      p: Number(row.protein_g),
      c: Number(row.carbs_g),
      f: Number(row.fat_g),
      piece: row.piece_g ? Number(row.piece_g) : undefined,
      portion: Number(row.portion_g),
      units: row.units,
      note: row.note || undefined,
    })));
    foodsLoadedAt = Date.now();
  } catch {
    // Tabelle nicht erreichbar -> alles geht an die KI
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-gemini-key",
};
const out = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const r1 = (n: unknown) => Math.round((Number(n) || 0) * 10) / 10;

const PARSE_PROMPT = `Du bist ein präziser Ernährungsassistent. Zerlege die Eingabe in einzelne Lebensmittel bzw. Zutaten.
Zusammengesetzte Gerichte (z. B. Lasagne, Döner, Pizza) bleiben ein Eintrag, außer die Zutaten werden einzeln genannt.
Lies die Eingabe als ganzen Satz: Wörter wie "dazwischen", "darauf", "drauf", "mit", "dazu" beziehen sich auf das vorher Genannte.
Mengen ohne Zahl passend zum Zusammenhang schätzen, z. B. Aufstrich auf Brot: Butter ca. 5 g pro Scheibe,
Erdnussbutter/Nuss-Nougat-Creme/Marmelade ca. 10–15 g pro Scheibe; zwischen 2 Scheiben (Sandwich) zählt eine Schicht.
Selbst zubereitete Gerichte: Öl, Butter, Marinade, Soße, Panade, Stärke/Mehl, Zucker usw., die zur Zubereitung gehören,
in den Eintrag des Gerichts EINRECHNEN (kcal und Makros vollständig, nichts weglassen) und in note kurz aufschlüsseln,
z. B. "inkl. ca. 10 g Öl (90 kcal) und 5 g Stärke". Name dann z. B. "Hähnchen mariniert (Airfryer)", generic z. B.
"Hähnchenbrust mariniert". Nur Lebensmittel, die eigenständig dazu gegessen werden (Reis, Brot, Beilage), als eigene Einträge.
Ohne Mengenangabe realistisch schätzen (z. B. Marinade für 400 g Fleisch ca. 2 EL = 20 g Öl, 1 EL Speisestärke = 10 g).
Wurde nur ein Teil gegessen ("die Hälfte", "ein Drittel"), ALLE Zutaten entsprechend anteilig ansetzen.
Rohgewicht vs. gegart: Packungsangaben und "roh" sind Rohgewicht – dann Werte für rohes Lebensmittel verwenden.
Wurde nach dem Garen gewogen (Airfryer, Pfanne, Grill, Ofen), Werte für das gegarte Lebensmittel verwenden.
Garverlust (Wasser) ca.: Hähnchen-/Putenbrust 25–30 %, Hackfleisch 25 %, Fisch 20 %, Kartoffeln/Gemüse im Airfryer 30–40 %.
Gegessene Menge aus Rest berechnen: Wird gesagt, wie viel (gegart) übrig ist, dann gegarte Gesamtmenge
= Rohgewicht × (1 − Garverlust), gegessen = gegarte Gesamtmenge − Rest, Anteil = gegessen / gegarte Gesamtmenge;
diesen Anteil auf alle Zutaten (auch Öl/Marinade) anwenden. Rechnung kurz in note nennen.
grams ist bei Gerichten die gegessene Menge im angegebenen Zustand (roh oder gegart), amount nennt den Zustand.
Felder pro Eintrag:
- name: kurzer deutscher Name, wie gemeint (mit Marke, falls genannt)
- generic: allgemeiner deutscher Lebensmittelname ohne Marke im Singular, z. B. "Banane", "Reis gekocht", "Hähnchenbrust", "Milch"
- brand: Marke, Händler oder Restaurant (z. B. "Milbona", "Ehrmann", "McDonald's"), sonst null
- grams: Menge in Gramm (Getränke in ml) als Zahl
- amount: Mengenangabe als kurzer Text, z. B. "2 Stück", "250 g", "1 dünne Schicht"
- kcal, protein_g, carbs_g, fat_g: Werte für die gesamte Menge aus deinem Wissen
- confidence: "hoch", "mittel" oder "niedrig"
- note: kurz, welche Annahme du getroffen hast
- needs_search: true NUR bei Markenprodukten, gekauften Fertiggerichten oder Restaurant-/Fastfood-Gerichten.
  Selbst gekochtes und einzelne Grundzutaten immer false (du kennst die Werte gut genug).
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

// 429 = Limit, 5xx = überlastet, 404 = Modellname unbekannt (dann gleich das andere Modell)
const RETRY_STATUS = new Set([404, 429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fehler, bei denen sich ein neuer Versuch lohnt (die App versucht es dann selbst noch einmal)
class RetryError extends Error {}

function friendlyError(status: number, message: string): string {
  if (status === 503 || /overload|high demand|spikes/i.test(message)) {
    return "Die KI ist gerade überlastet. Bitte in ein paar Sekunden nochmal versuchen.";
  }
  if (status === 429) return "KI-Limit erreicht (zu viele Anfragen). Kurz warten und nochmal versuchen.";
  return `Gemini: ${message || status}`;
}

async function callGemini(model: string, parts: unknown[], search: boolean, timeoutMs: number, key: string) {
  const level = THINKING_LEVELS[thinkingIdx];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
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
    return callGemini(model, parts, search, timeoutMs, key);
  }
  return { r, d };
}

type GeminiOpts = { key: string | null; search?: boolean; timeoutMs?: number; tries?: number; budgetMs?: number };

// Kein KI-Schlüssel für diesen Nutzer (Freunde ohne eigenen Schlüssel)
class NeedKeyError extends Error {}
// Schlüssel abgelehnt (gelöscht, gesperrt, falsch)
class KeyInvalidError extends Error {}

// deno-lint-ignore no-explicit-any
async function gemini(parts: unknown[], opts: GeminiOpts): Promise<{ json: any; sources: Source[] }> {
  const key = opts.key;
  if (!key) throw new NeedKeyError("Dafür brauchst du einen eigenen KI-Schlüssel (Einstellungen → KI-Schlüssel).");
  const search = !!opts.search;
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
  const fallback = Deno.env.get("GEMINI_FALLBACK_MODEL") || "gemini-flash-lite-latest";
  const timeoutMs = opts.timeoutMs ?? (search ? 30000 : 20000);

  // Überlastung dauert meist nur Sekunden und trifft selten beide Modelle gleichzeitig:
  // abwechselnd Haupt- und Ersatzmodell mit wachsender Pause, bis das Zeitbudget aufgebraucht ist.
  const order = [model, fallback, model, fallback, model, fallback];
  const pauses = [0, 300, 1500, 2500, 4000, 6000];
  const tries = Math.min(opts.tries ?? order.length, order.length);
  const deadline = Date.now() + (opts.budgetMs ?? 55000);
  // deno-lint-ignore no-explicit-any
  let d: any = null;
  let lastError = "";
  let retryable = true;
  for (let i = 0; i < tries; i++) {
    if (i > 0) {
      // nur weiter, wenn danach noch genug Zeit für eine Antwort bleibt
      if (Date.now() + pauses[i] + 8000 > deadline) break;
      await sleep(pauses[i]);
    }
    try {
      const res = await callGemini(order[i], parts, search, Math.min(timeoutMs, deadline - Date.now()), key);
      if (res.r.ok) {
        d = res.d;
        break;
      }
      lastError = friendlyError(res.r.status, res.d?.error?.message || "");
      console.log(`Gemini ${order[i]}: ${res.r.status} ${res.d?.error?.message || ""}`.slice(0, 300));
      if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(JSON.stringify(res.d?.error || ""))) {
        throw new KeyInvalidError("Der KI-Schlüssel ist ungültig oder gesperrt.");
      }
      if (!RETRY_STATUS.has(res.r.status)) {
        retryable = false;
        break;
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "TimeoutError")) throw e;
      console.log(`Gemini ${order[i]}: Zeitüberschreitung`);
      lastError = "Die KI antwortet gerade nicht (Zeitüberschreitung). Bitte nochmal versuchen.";
    }
  }
  if (!d) throw retryable ? new RetryError(lastError) : new Error(lastError);

  const c = d.candidates?.[0];
  const raw = (c?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("");
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new RetryError("Antwort nicht lesbar. Versuche es nochmal.");
  const sources = (c?.groundingMetadata?.groundingChunks || [])
    .map((g: { web?: { title?: string; uri?: string } }) => g.web)
    .filter(Boolean)
    .map((w: { title?: string; uri?: string }) => ({ title: w.title, url: w.uri }));
  try {
    return { json: JSON.parse(m[0]), sources };
  } catch {
    throw new RetryError("Antwort nicht lesbar. Versuche es nochmal.");
  }
}

// ---------- Beratung: "Was soll ich jetzt essen?" und Speisekarte ----------
// Ton bewusst neutral: keine Verbote, keine Wertung, kein schlechtes Gewissen (Essstörungen vorbeugen).

const ADVICE_RULES = `Ton: freundlich, sachlich, ohne Moral. Keine Verbote, keine Begriffe wie "Sünde", "schlecht", "verdient",
"Cheat", kein schlechtes Gewissen. Nie zu sehr wenig Essen raten. Ist das Kalorienziel schon erreicht und jemand hat Hunger,
dann eine leichte, sättigende, eiweißreiche Option vorschlagen – sachlich, ohne Vorwurf.
Training: 1–3 h vorher leicht verdaulich und kohlenhydratbetont (wenig Fett und Ballaststoffe); danach Eiweiß plus Kohlenhydrate.
Ist noch viel Eiweiß offen, eiweißreiche Optionen bevorzugen. Nährwerte realistisch schätzen, inkl. Öl/Soße.`;

const SUGGEST_PROMPT = `Du bist ein Ernährungscoach. Schlage genau 3 konkrete Mahlzeiten oder Snacks für JETZT vor, passend zum Kontext (JSON unten).
Richtwert pro Vorschlag: die offenen Werte geteilt durch die heute noch übrigen Mahlzeiten (mahlzeiten_uebrig).
Bevorzuge, was die Person ohnehin isst (haeufig) und was im Kühlschrank steht (reste, ganz oder als Portion);
mindestens ein Vorschlag mit Resten, falls welche passen. Sonst schnell zubereitet (unter 15 Minuten) oder unterwegs kaufbar.
${ADVICE_RULES}
Antwort als JSON: {"suggestions":[{"title":"kurzer Name","why":"ein kurzer Satz, warum es gerade passt",
"items":[{"name":"","amount":"z. B. 1 Portion / 200 g","grams":0,"kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0}]}]}`;

const MENU_PROMPT = `Du bist ein Ernährungscoach. Auf dem Bild ist eine Speisekarte. Lies alle Gerichte und wähle die 3, die am besten
zu Ziel und offenen Werten der Person passen (Kontext-JSON unten). Schätze die Nährwerte einer üblichen Restaurantportion
(inkl. Öl, Soße, Beilage). Gib zu jedem einen kurzen Grund und optional einen praktischen Tipp (z. B. "Soße extra",
"Pommes gegen Salat tauschen", "halbe Portion Reis").
Ist keine Speisekarte erkennbar, gib leere picks und schreibe das in note.
${ADVICE_RULES}
Antwort als JSON: {"picks":[{"name":"Name wie auf der Karte","why":"","tip":"","grams":0,"kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0}],
"note":"kurz, optional"}`;

type AdviceReq = { context?: Record<string, unknown>; image?: { mime: string; data: string } };

function cleanAdviceItem(i: Record<string, unknown>) {
  return {
    name: String(i?.name || "").slice(0, 80) || "Gericht",
    amount: String(i?.amount || "").slice(0, 40),
    grams: r1(i?.grams) || null,
    kcal: Math.round(Number(i?.kcal) || 0),
    protein_g: r1(i?.protein_g),
    carbs_g: r1(i?.carbs_g),
    fat_g: r1(i?.fat_g),
  };
}

async function suggest(req: AdviceReq, key: string | null) {
  const res = await gemini([{ text: `${SUGGEST_PROMPT}\n\nKontext: ${JSON.stringify(req.context || {})}` }], { key, timeoutMs: 25000 });
  const list = Array.isArray(res.json.suggestions) ? res.json.suggestions : [];
  return {
    suggestions: list.slice(0, 3).map((s: Record<string, unknown>) => ({
      title: String(s?.title || "Vorschlag").slice(0, 80),
      why: String(s?.why || "").slice(0, 200),
      items: (Array.isArray(s?.items) ? s.items : []).slice(0, 6).map(cleanAdviceItem),
    })).filter((s: { items: unknown[] }) => s.items.length),
  };
}

async function menu(req: AdviceReq, key: string | null) {
  if (!req.image?.data) throw new Error("Kein Foto der Speisekarte.");
  const parts = [
    { text: `${MENU_PROMPT}\n\nKontext: ${JSON.stringify(req.context || {})}` },
    { inline_data: { mime_type: req.image.mime || "image/jpeg", data: req.image.data } },
  ];
  const res = await gemini(parts, { key, timeoutMs: 30000 });
  const picks = Array.isArray(res.json.picks) ? res.json.picks : [];
  return {
    picks: picks.slice(0, 3).map((p: Record<string, unknown>) => ({
      ...cleanAdviceItem(p),
      why: String(p?.why || "").slice(0, 200),
      tip: String(p?.tip || "").slice(0, 160),
    })),
    note: String(res.json.note || "").slice(0, 200),
  };
}

// ---------- Barcode-Produkte ----------

const PORTION_RULES = `Mengen-Auswahl (portions): 3–5 sinnvolle Mengen, wie man genau dieses Produkt typischerweise isst/trinkt,
jeweils mit Gewicht in Gramm (Getränke in ml). Nutze die natürliche Einheit des Produkts, z. B.
Schokoladentafel: "1 Stück" (ein Rechteck), "1 Reihe", "½ Tafel"; Riegel/Kekse/Pralinen: "1 Riegel", "1 Keks", "3 Kekse";
Chips/Nüsse: "1 Handvoll", "1 kleine Schüssel"; Müsli/Cornflakes: "1 Schüssel"; Joghurt/Pudding: "1 Becher";
Getränke: "1 Glas (250 ml)", "1 Flasche"; Brot/Käse/Wurst: "1 Scheibe"; Aufstrich: "für 1 Brot"; Eis: "1 Kugel".
Stückgewicht wenn möglich aus Packungsgröße ÷ Stückzahl der Packung berechnen (z. B. 100-g-Tafel mit 24 Stücken = ca. 4 g).
Labels kurz und ohne Grammzahl. Genau ein Eintrag bekommt default:true: die Menge, die man üblicherweise auf einmal isst.`;

const PORTIONS_PROMPT = `Du bist ein präziser Ernährungsassistent. Zu einem Supermarkt-Produkt brauche ich sinnvolle Mengen-Auswahlen.
${PORTION_RULES}
Antwort als JSON: {"portions":[{"label":"","grams":0,"default":false}]}`;

const BARCODE_PROMPT = `Recherchiere per Google das Lebensmittel mit der Barcode-/EAN-Nummer unten (meist in Deutschland verkauft):
Produktname, Marke, Packungsgröße und Nährwerte pro 100 g (bzw. 100 ml) laut Hersteller oder Händler.
Setze found nur auf true, wenn du sicher bist, dass das Produkt zu GENAU dieser Nummer gehört; sonst found:false.
${PORTION_RULES}
Antworte NUR mit JSON, ohne Markdown und ohne Text davor oder danach:
{"found":true,"name":"","brand":"","package_g":0,"kcal_100g":0,"protein_100g":0,"carbs_100g":0,"fat_100g":0,
"portions":[{"label":"","grams":0,"default":false}],"note":"kurz: Quelle"}`;

type Portion = { label: string; grams: number; default?: boolean };

function cleanPortions(list: unknown): Portion[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((p) => ({ label: String(p?.label || "").trim().slice(0, 40), grams: r1(p?.grams), default: !!p?.default }))
    .filter((p) => p.label && p.grams > 0 && p.grams < 5000)
    .slice(0, 6);
}

type ProductReq = { code?: string; name?: string; brand?: string; quantity?: string; serving?: string; categories?: string };

async function product(req: ProductReq, key: string | null) {
  // Produkt bekannt (Open Food Facts) -> nur Portionen aus dem Wissen der KI, ohne Suche (schnell)
  if (req.name) {
    const info = [
      `Produkt: ${req.name}`,
      req.brand && `Marke: ${req.brand}`,
      req.quantity && `Packungsinhalt: ${req.quantity}`,
      req.serving && `Portionsangabe auf der Packung: ${req.serving}`,
      req.categories && `Kategorie: ${req.categories}`,
    ].filter(Boolean).join("\n");
    const res = await gemini([{ text: `${PORTIONS_PROMPT}\n\n${info}` }], { key, timeoutMs: 12000, budgetMs: 25000 });
    return { portions: cleanPortions(res.json.portions), sources: [] };
  }

  // Unbekannt -> Google-Suche nach der Nummer
  const code = String(req.code || "").replace(/\D/g, "");
  if (code.length < 8) throw new Error("Ungültige Barcode-Nummer.");
  const res = await gemini([{ text: `${BARCODE_PROMPT}\n\nNummer: ${code}` }], { key, search: true, tries: 2, budgetMs: 60000 });
  const j = res.json;
  if (!j.found || !(Number(j.kcal_100g) >= 0) || !j.name) return { product: null, sources: res.sources.slice(0, 4) };
  return {
    product: {
      name: String(j.name),
      brand: j.brand ? String(j.brand) : "",
      package_g: r1(j.package_g) || null,
      kcal_100g: r1(j.kcal_100g),
      protein_100g: r1(j.protein_100g),
      carbs_100g: r1(j.carbs_100g),
      fat_100g: r1(j.fat_100g),
      note: j.note ? String(j.note).slice(0, 200) : "",
    },
    portions: cleanPortions(j.portions),
    sources: res.sources.slice(0, 4),
  };
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
  let usedOwnKey = false;
  try {
    // Nur eingeloggte Nutzer (der publishable Key allein reicht nicht)
    const apikey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    const auth = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
      headers: { apikey, Authorization: req.headers.get("Authorization") || "" },
    });
    if (!auth.ok) return out({ error: "Nicht angemeldet." }, 401);
    const user = await auth.json();
    // KI-Schlüssel: eigener des Nutzers (kommt bei jeder Anfrage vom Handy, wird hier nie gespeichert
    // oder geloggt) – sonst der Server-Schlüssel, aber nur für die Besitzer der App
    const owners = (Deno.env.get("OWNER_USER_IDS") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const ownKey = (req.headers.get("x-gemini-key") || "").trim();
    usedOwnKey = !!ownKey;
    const key = ownKey || (owners.includes(user.id) ? Deno.env.get("GEMINI_API_KEY") || null : null);
    await loadFoods(apikey, req.headers.get("Authorization") || "");

    const body = await req.json();
    // Welche KI steht zur Verfügung? (für die Anzeige in der App)
    if (body.status) return out({ ai: ownKey ? "own" : key ? "server" : "none" });
    // Eigenen Schlüssel prüfen: Modellliste abrufen kostet nichts
    if (body.check_key) {
      if (!ownKey) return out({ ok: false, error: "Kein Schlüssel angegeben." });
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
        headers: { "x-goog-api-key": ownKey }, signal: AbortSignal.timeout(10000),
      });
      // 429 = Limit gerade erreicht, der Schlüssel selbst ist aber gültig
      return out(r.ok || r.status === 429 ? { ok: true } : { ok: false, error: "Schlüssel ungültig." });
    }
    if (body.product) return out({ ...(await product(body.product, key)), ms: Date.now() - started });
    if (body.suggest) return out({ ...(await suggest(body.suggest, key)), ms: Date.now() - started });
    if (body.menu) return out({ ...(await menu(body.menu, key)), ms: Date.now() - started });
    const { text, image } = body;
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
      // Bilder brauchen bei der KI länger als Text
      const res = await gemini(parts, { key, timeoutMs: image ? 28000 : 20000 });
      const parsed = { items: (res.json.items || []) as AiItem[] };

      // 3. Markenprodukte bei Open Food Facts – alle gleichzeitig abfragen
      const offResults = await Promise.all(
        parsed.items.map((a) => (a.brand ? openFoodFacts(a) : Promise.resolve(null))),
      );

      const toSearch: AiItem[] = [];
      parsed.items.forEach((a, i) => {
        const grams = Number(a.grams) || 0;
        const food = !a.brand && grams ? findFood(a.name) || findFood(a.generic) : null;
        // Tabelle nur übernehmen, wenn sie zur KI-Schätzung passt. Weicht die KI deutlich ab, hat sie meist
        // etwas mitgerechnet, das die Tabelle nicht kennt (Marinade, Zubereitung) -> dann der KI glauben.
        const tableKcal = food ? food.kcal * grams / 100 : 0;
        const aiKcal = Number(a.kcal) || 0;
        // Liegt die KI deutlich höher, hat sie wahrscheinlich Öl/Soße o. ä. eingerechnet -> schon ab 10 % / 15 kcal der KI glauben
        const diff = aiKcal - tableKcal;
        const fits = food && (!aiKcal || (diff <= Math.max(15, tableKcal * 0.1) && -diff <= Math.max(25, tableKcal * 0.2)));
        if (food && fits) items.push(fromTable(food, grams, withGrams(a.amount, grams), a.note || ""));
        else if (offResults[i]) items.push(offResults[i]!);
        else if (a.needs_search || a.brand) toSearch.push(a);
        else items.push(fromAi(a, "ki"));
      });

      // 4. Google-Suche nur für den unsicheren Rest
      if (toSearch.length) {
        const list = toSearch.map((a) => ({ name: a.name, brand: a.brand, grams: a.grams, amount: a.amount }));
        try {
          aiCalls++;
          // nur ein Versuch: ohne Suche gibt es die Schätzung aus Schritt 2 als Ersatz
          const res = await gemini([{ text: `${SEARCH_PROMPT}\n\n${JSON.stringify(list)}` }], { key, search: true, tries: 1 });
          const found = { items: (res.json.items || []) as AiItem[], sources: res.sources };
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
    return out({ error: e instanceof Error ? e.message : String(e), retry: e instanceof RetryError, need_key: e instanceof NeedKeyError,
      // nur der eigene Schlüssel des Nutzers -> App wechselt in den Suchmodus
      invalid_key: e instanceof KeyInvalidError && usedOwnKey });
  }
});
