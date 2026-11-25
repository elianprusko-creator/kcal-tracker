// Supabase Edge Function "remind": verschickt Push-Erinnerungen (Essen, Wasser).
// - Ohne Login, alle 5 Minuten von pg_cron aufgerufen: sendet, was in den letzten 10 Minuten fällig wurde.
//   Jede Erinnerung wird in push_log vermerkt und dadurch höchstens einmal gesendet; ein zusätzlicher
//   Aufruf von außen kann also nichts auslösen, was nicht ohnehin fällig ist.
// - Mit Login und {"test": true}: Testnachricht an die eigenen Geräte.
import webpush from "npm:web-push@3.6.7";

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

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: { ...serviceHeaders(), "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`DB ${path.split("?")[0]}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const out = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") || "https://example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string };
type MealSlot = { time: string; meal: string; label: string; on?: boolean };
type Settings = { wake?: string; sleep?: string; meals?: MealSlot[]; water?: { on?: boolean; every?: number } };
type Msg = { title: string; body: string; tag: string; url?: string };

async function sendTo(subs: Sub[], msg: Msg) {
  let sent = 0;
  const errors: string[] = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ url: "./", ...msg }),
        { TTL: 30 * 60, urgency: "high" },
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // Gerät hat das Abo beendet (App gelöscht, Erlaubnis entzogen) -> entfernen
      if (code === 404 || code === 410) {
        await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" }).catch(() => {});
      }
      errors.push(`${code || ""} ${(e as Error).message}`.trim().slice(0, 200));
    }
  }
  return { sent, errors };
}

// "07:30" -> 450
const toMin = (t?: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// Ortszeit des Nutzers: Datum (YYYY-MM-DD) und Minuten seit Mitternacht
function localNow(tz: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date());
  } catch {
    return localNow("Europe/Berlin");
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, min: Number(get("hour")) * 60 + Number(get("minute")) };
}

const fmt = (n: number) => Math.round(n).toLocaleString("de-DE");
const liter = (ml: number) => (ml / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 });

// Fällig = Zeitpunkt in den letzten 10 Minuten (Cron läuft alle 5 Minuten, so geht keiner verloren)
const isDue = (at: number, now: number) => at <= now && at > now - 10;

// Schlafenszeit nach Mitternacht -> Tag endet für die Erinnerungen um 23:59
const wakeMin = (s: Settings) => toMin(s.wake) ?? 7 * 60;
const sleepMin = (s: Settings) => {
  const v = toMin(s.sleep) ?? 23 * 60;
  return v <= wakeMin(s) ? 24 * 60 - 1 : v;
};

function waterSlots(s: Settings): number[] {
  const wake = wakeMin(s);
  const sleep = sleepMin(s);
  const every = Math.max(30, Math.min(360, Number(s.water?.every) || 120));
  const list: number[] = [];
  for (let t = wake + 60; t <= sleep - 60; t += every) list.push(t);
  return list;
}

async function remindUser(row: { user_id: string; settings: Settings; tz: string }) {
  const s = row.settings || {};
  const { day, min } = localNow(row.tz);
  const meals = (s.meals || []).filter((m) => m.on !== false && toMin(m.time) !== null);
  const dueMeal = meals.find((m) => isDue(toMin(m.time)!, min));
  const dueWater = s.water?.on ? waterSlots(s).find((t) => isDue(t, min)) : undefined;
  if (!dueMeal && dueWater === undefined) return null;

  const subs: Sub[] = await rest(`push_subscriptions?user_id=eq.${row.user_id}&select=*`);
  if (!subs.length) return null;

  const [profiles, entries, water] = await Promise.all([
    rest(`profiles?user_id=eq.${row.user_id}&select=kcal_goal,protein_goal,weight_kg`),
    rest(`entries?user_id=eq.${row.user_id}&day=eq.${day}&select=kcal,protein_g,meal,created_at`),
    rest(`water?user_id=eq.${row.user_id}&day=eq.${day}&select=ml`),
  ]);
  const p = profiles[0] || {};
  type E = { kcal: number; protein_g: number; meal: string | null; created_at: string };
  const eaten = (entries as E[]).reduce((a, e) => ({ kcal: a.kcal + Number(e.kcal || 0), p: a.p + Number(e.protein_g || 0) }), { kcal: 0, p: 0 });
  const lastEntry = Math.max(0, ...(entries as E[]).map((e) => Date.parse(e.created_at) || 0));

  const msgs: Msg[] = [];

  if (dueMeal) {
    const minutesSinceEntry = lastEntry ? (Date.now() - lastEntry) / 60000 : Infinity;
    const alreadyLogged = dueMeal.meal !== "snack" && (entries as E[]).some((e) => e.meal === dueMeal.meal);
    // Gerade erst gegessen/eingetragen oder diese Mahlzeit schon erledigt -> nicht nerven
    if (!alreadyLogged && minutesSinceEntry > (dueMeal.meal === "snack" ? 90 : 45)) {
      const kcalLeft = Number(p.kcal_goal || 0) - eaten.kcal;
      const proteinLeft = Number(p.protein_goal || 0) - eaten.p;
      const mealsLeft = meals.filter((m) => toMin(m.time)! >= toMin(dueMeal.time)!).length || 1;
      let body: string;
      if (!p.kcal_goal) {
        body = "Nicht vergessen zu essen – und danach kurz eintragen.";
      } else if (kcalLeft <= 100) {
        body = "Dein Kalorienziel für heute ist schon erreicht. Falls du Hunger hast: etwas Leichtes mit viel Eiweiß.";
      } else {
        const perKcal = kcalLeft / mealsLeft;
        const perP = Math.max(0, proteinLeft) / mealsLeft;
        body = `Heute noch offen: ${fmt(kcalLeft)} kcal · ${fmt(Math.max(0, proteinLeft))} g Eiweiß. ` +
          `Für diese Mahlzeit ca. ${fmt(Math.round(perKcal / 10) * 10)} kcal` +
          (perP >= 5 ? ` mit ${fmt(perP)} g Eiweiß.` : ".");
      }
      // Küche eingeschaltet: Reste im Kühlschrank nennen (die ältesten zuerst)
      try {
        const prefs = await rest(`user_prefs?user_id=eq.${row.user_id}&select=prefs`);
        const k = prefs[0]?.prefs?.kitchen;
        if (k?.on && k.inReminders !== false) {
          // Geplantes Gericht für diese Mahlzeit zuerst nennen
          const planned: { name: string; cook: boolean }[] = await rest(
            `meal_plan?user_id=eq.${row.user_id}&day=eq.${day}&meal=eq.${dueMeal.meal}&status=eq.geplant&select=name,cook`,
          );
          if (planned.length) {
            body = `Geplant: ${planned.map((p) => p.cook ? `${p.name} (heute kochen)` : p.name).join(", ")}. ` + body;
          }
          const left: { name: string; portions_left: number }[] = await rest(
            `leftovers?user_id=eq.${row.user_id}&done_at=is.null&portions_left=gt.0&select=name,portions_left&order=cooked_on.asc&limit=3`,
          );
          if (left.length) {
            const n = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");
            body += ` 🍲 Im Kühlschrank: ${left.map((l) => `${l.name} (${n(Number(l.portions_left))} Port.)`).join(", ")}.`;
          }
        }
      } catch { /* Reste sind nur ein Zusatz */ }
      // Tippen öffnet in der App "Was soll ich essen?" (nur mit KI sichtbar, sonst einfach die App)
      msgs.push({ title: `🍽️ Zeit für: ${dueMeal.label}`, body, tag: `meal-${day}-${dueMeal.time}`, url: "./?ideen=1" });
    }
  }

  if (dueWater !== undefined) {
    const ml = Number(water[0]?.ml || 0);
    const kg = Number(p.weight_kg) || 0;
    const goal = kg ? Math.min(4000, Math.max(1500, Math.round(kg * 35 / 250) * 250)) : 2500;
    // Nur erinnern, wenn du hinter dem Tagesplan liegst (Ziel gleichmäßig über den Tag verteilt)
    const wake = wakeMin(s);
    const end = sleepMin(s) - 60;
    const share = Math.min(1, Math.max(0, (min - wake) / Math.max(60, end - wake)));
    if (ml < goal && ml < goal * share) {
      msgs.push({
        title: "💧 Zeit für ein Glas Wasser",
        body: `Heute ${liter(ml)} von ${liter(goal)} l getrunken.`,
        tag: `water-${day}-${hhmm(dueWater)}`,
      });
    }
  }

  const results = [];
  for (const msg of msgs) {
    // nur senden, wenn diese Erinnerung noch nicht im Protokoll steht
    const inserted = await rest("push_log?on_conflict=user_id,slot", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ user_id: row.user_id, slot: msg.tag }),
    });
    if (!inserted?.length) continue;
    results.push({ tag: msg.tag, ...(await sendTo(subs, msg)) });
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));

    // Testnachricht an die eigenen Geräte
    if (body.test) {
      const auth = await fetch(`${SB}/auth/v1/user`, {
        headers: { apikey: req.headers.get("apikey") || "", Authorization: req.headers.get("Authorization") || "" },
      });
      if (!auth.ok) return out({ error: "Nicht angemeldet." }, 401);
      const user = await auth.json();
      const subs: Sub[] = await rest(`push_subscriptions?user_id=eq.${user.id}&select=*`);
      if (!subs.length) return out({ error: "Für dieses Konto ist noch kein Gerät angemeldet." });
      const res = await sendTo(subs, {
        title: "🔔 Test-Erinnerung",
        body: "So sehen deine Erinnerungen aus. Funktioniert!",
        tag: "test",
      });
      return out(res);
    }

    // Cron: alle Nutzer mit eingeschalteten Erinnerungen
    const rows = await rest("reminder_settings?enabled=eq.true&select=user_id,settings,tz");
    const results = await Promise.all(rows.map((r: { user_id: string; settings: Settings; tz: string }) =>
      remindUser(r).catch((e) => ({ error: (e as Error).message }))
    ));
    return out({ users: rows.length, results: results.filter(Boolean) });
  } catch (e) {
    console.error(e);
    return out({ error: (e as Error).message }, 500);
  }
});
