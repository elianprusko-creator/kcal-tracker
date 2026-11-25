// Supabase Edge Function "delete-account": löscht das eigene Konto endgültig.
// Alle Nutzertabellen hängen per "on delete cascade" an auth.users, d. h. mit dem Nutzer
// verschwinden auch Einträge, Gewicht, Wasser, Profil, Rezepte, Pläne, Erinnerungen usw.
// Aufruf nur mit Login; gelöscht wird immer nur der Nutzer, dem das Login gehört.

const SB = Deno.env.get("SUPABASE_URL")!;

// Server-Schlüssel: neuer "sb_secret_…" (nur als apikey) oder alter service_role-JWT
function serviceHeaders(): Record<string, string> {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const k = keys.default || Object.values(keys)[0];
    if (k) return { apikey: String(k) };
  } catch { /* weiter mit dem alten Schlüssel */ }
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return { apikey: k, Authorization: `Bearer ${k}` };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const out = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return out({ error: "Nur POST." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    if (body.confirm !== "delete-my-account") return out({ error: "Bestätigung fehlt." }, 400);

    // Wer ruft auf? Das Login des Aufrufers entscheidet, nie ein Wert aus dem Body.
    const auth = await fetch(`${SB}/auth/v1/user`, {
      headers: { apikey: req.headers.get("apikey") || "", Authorization: req.headers.get("Authorization") || "" },
      signal: AbortSignal.timeout(10000),
    });
    if (!auth.ok) return out({ error: "Nicht angemeldet." }, 401);
    const user = await auth.json();
    if (!user?.id) return out({ error: "Nicht angemeldet." }, 401);

    const del = await fetch(`${SB}/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      headers: serviceHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (!del.ok) {
      console.error("delete-account", del.status, await del.text());
      return out({ error: "Löschen ist fehlgeschlagen. Bitte später nochmal versuchen." }, 500);
    }
    return out({ ok: true });
  } catch (e) {
    console.error("delete-account", e);
    return out({ error: "Löschen ist fehlgeschlagen. Bitte später nochmal versuchen." }, 500);
  }
});
