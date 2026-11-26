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
type Settings = {
  wake?: string; sleep?: string; meals?: MealSlot[]; water?: { on?: boolean; every?: number };
  wakeToday?: { date: string; time: string };   // tatsächlich aufgestanden (Signal von Tasker/Automate oder "Bin wach")
};

// Heute später/früher aufgestanden? Dann alle Essenszeiten und das Wasser für heute mitverschieben
function shiftedForToday(s: Settings, day: string): Settings {
  const w = s.wakeToday;
  const planned = toMin(s.wake) ?? 7 * 60, actual = toMin(w?.time);
  if (!w || w.date !== day || actual === null || actual === planned) return s;
  const shift = actual - planned;
  const sleep = sleepMin(s);
  return {
    ...s,
    wake: w.time,
    meals: (s.meals || []).map((m) => {
      const t = toMin(m.time);
      return t === null ? m : { ...m, time: hhmm(Math.min(sleep - 30, Math.max(actual + 15, t + shift))) };
    }),
  };
}
type Msg = { title: string; body: string; tag: string; url?: string };

// ---------- Sprache (user_prefs.prefs.lang, gesetzt von der App) ----------
type Lang = "de" | "en";
const asLang = (v: unknown): Lang => (v === "en" ? "en" : "de");
const MEAL_EN: Record<string, string> = { fruehstueck: "Breakfast", mittag: "Lunch", abend: "Dinner", snack: "Snack" };
const mealLabel = (m: MealSlot, lang: Lang) =>
  lang === "en" ? (/schlaf/i.test(m.label) ? "Snack before bed" : MEAL_EN[m.meal] || m.label) : m.label;
const num = (lang: Lang, n: number, digits = 0) =>
  n.toLocaleString(lang === "en" ? "en-GB" : "de-DE", { maximumFractionDigits: digits });
const TXT = {
  de: {
    mealTitle: (l: string) => `🍽️ Zeit für: ${l}`,
    noGoal: "Nicht vergessen zu essen – und danach kurz eintragen.",
    goalReached: "Dein Kalorienziel für heute ist schon erreicht. Falls du Hunger hast: etwas Leichtes mit viel Eiweiß.",
    left: (k: string, p: string) => `Heute noch offen: ${k} kcal · ${p} g Eiweiß. `,
    perMeal: (k: string) => `Für diese Mahlzeit ca. ${k} kcal`,
    withProtein: (p: string) => ` mit ${p} g Eiweiß.`,
    planned: (list: string) => `Geplant: ${list}. `,
    cookToday: "heute kochen",
    fridge: (list: string) => ` 🍲 Im Kühlschrank: ${list}.`,
    port: "Port.",
    waterTitle: "💧 Zeit für ein Glas Wasser",
    waterBody: (a: string, b: string) => `Heute ${a} von ${b} l getrunken.`,
    weeklyTitle: "🗓️ Dein Wochenrückblick",
    weeklyBody: "Eine ruhige Zusammenfassung deiner Woche – tippe zum Ansehen.",
    testTitle: "🔔 Test-Erinnerung",
    testBody: "So sehen deine Erinnerungen aus. Funktioniert!",
  },
  en: {
    mealTitle: (l: string) => `🍽️ Time for: ${l}`,
    noGoal: "Don't forget to eat – and log it briefly afterwards.",
    goalReached: "You have already reached today's calorie goal. If you are hungry: something light with plenty of protein.",
    left: (k: string, p: string) => `Left today: ${k} kcal · ${p} g protein. `,
    perMeal: (k: string) => `For this meal about ${k} kcal`,
    withProtein: (p: string) => ` with ${p} g protein.`,
    planned: (list: string) => `Planned: ${list}. `,
    cookToday: "cook today",
    fridge: (list: string) => ` 🍲 In the fridge: ${list}.`,
    port: "port.",
    waterTitle: "💧 Time for a glass of water",
    waterBody: (a: string, b: string) => `${a} of ${b} l drunk today.`,
    weeklyTitle: "🗓️ Your weekly review",
    weeklyBody: "A calm summary of your week – tap to view.",
    testTitle: "🔔 Test reminder",
    testBody: "This is what your reminders look like. It works!",
  },
};

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
  const { day, min } = localNow(row.tz);
  const s = shiftedForToday(row.settings || {}, day);
  const meals = (s.meals || []).filter((m) => m.on !== false && toMin(m.time) !== null);
  const dueMeal = meals.find((m) => isDue(toMin(m.time)!, min));
  const dueWater = s.water?.on ? waterSlots(s).find((t) => isDue(t, min)) : undefined;
  if (!dueMeal && dueWater === undefined) return null;

  const subs: Sub[] = await rest(`push_subscriptions?user_id=eq.${row.user_id}&select=*`);
  if (!subs.length) return null;

  const [profiles, entries, water, prefRows] = await Promise.all([
    rest(`profiles?user_id=eq.${row.user_id}&select=kcal_goal,protein_goal,weight_kg`),
    rest(`entries?user_id=eq.${row.user_id}&day=eq.${day}&select=kcal,protein_g,meal,created_at`),
    rest(`water?user_id=eq.${row.user_id}&day=eq.${day}&select=ml`),
    rest(`user_prefs?user_id=eq.${row.user_id}&select=prefs`).catch(() => []),
  ]);
  const p = profiles[0] || {};
  const prefs = prefRows[0]?.prefs || {};
  const lang = asLang(prefs.lang);
  const tx = TXT[lang];
  const f = (n: number) => num(lang, Math.round(n));
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
        body = tx.noGoal;
      } else if (kcalLeft <= 100) {
        body = tx.goalReached;
      } else {
        const perKcal = kcalLeft / mealsLeft;
        const perP = Math.max(0, proteinLeft) / mealsLeft;
        body = tx.left(f(kcalLeft), f(Math.max(0, proteinLeft))) +
          tx.perMeal(f(Math.round(perKcal / 10) * 10)) +
          (perP >= 5 ? tx.withProtein(f(perP)) : ".");
      }
      // Küche eingeschaltet: Reste im Kühlschrank nennen (die ältesten zuerst)
      try {
        const k = prefs.kitchen;
        if (k?.on && k.inReminders !== false) {
          // Geplantes Gericht für diese Mahlzeit zuerst nennen
          const planned: { name: string; cook: boolean }[] = await rest(
            `meal_plan?user_id=eq.${row.user_id}&day=eq.${day}&meal=eq.${dueMeal.meal}&status=eq.geplant&select=name,cook`,
          );
          if (planned.length) {
            body = tx.planned(planned.map((p) => p.cook ? `${p.name} (${tx.cookToday})` : p.name).join(", ")) + body;
          }
          const left: { name: string; portions_left: number }[] = await rest(
            `leftovers?user_id=eq.${row.user_id}&done_at=is.null&portions_left=gt.0&select=name,portions_left&order=cooked_on.asc&limit=3`,
          );
          if (left.length) {
            body += tx.fridge(left.map((l) => `${l.name} (${num(lang, Number(l.portions_left), 1)} ${tx.port})`).join(", "));
          }
        }
      } catch { /* Reste sind nur ein Zusatz */ }
      // Tippen öffnet in der App "Was soll ich essen?" (nur mit KI sichtbar, sonst einfach die App)
      msgs.push({ title: tx.mealTitle(mealLabel(dueMeal, lang)), body, tag: `meal-${day}-${meals.indexOf(dueMeal)}-${dueMeal.meal}`, url: "./?ideen=1" });
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
        title: tx.waterTitle,
        body: tx.waterBody(num(lang, ml / 1000, 1), num(lang, goal / 1000, 1)),
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

// Wochenrückblick: sonntags um 18 Uhr (Ortszeit) eine kurze Nachricht ohne Zahlen – die Details stehen in der App
async function weeklyPush() {
  const prefs: { user_id: string; lang: string | null }[] = await rest("user_prefs?prefs->weekly->>on=eq.true&select=user_id,lang:prefs->>lang");
  if (!prefs.length) return 0;
  const ids = prefs.map((p) => p.user_id).join(",");
  const tzRows: { user_id: string; tz: string }[] = await rest(`reminder_settings?user_id=in.(${ids})&select=user_id,tz`);
  let sent = 0;
  for (const { user_id, lang } of prefs) {
    const tz = tzRows.find((t) => t.user_id === user_id)?.tz || "Europe/Berlin";
    const { day, min } = localNow(tz);
    const weekday = new Date(day + "T12:00:00Z").getUTCDay();
    if (weekday !== 0 || !isDue(18 * 60, min)) continue;
    const subs: Sub[] = await rest(`push_subscriptions?user_id=eq.${user_id}&select=*`);
    if (!subs.length) continue;
    const inserted = await rest("push_log?on_conflict=user_id,slot", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ user_id, slot: `weekly-${day}` }),
    });
    if (!inserted?.length) continue;
    const res = await sendTo(subs, {
      title: TXT[asLang(lang)].weeklyTitle,
      body: TXT[asLang(lang)].weeklyBody,
      tag: `weekly-${day}`,
      url: "./?rueckblick=1",
    });
    sent += res.sent;
  }
  return sent;
}

// Neue Meldungen aus der App (Fehler/Ideen): Push an die Admins, jede Meldung nur einmal
async function feedbackPush() {
  const rows: { id: number; kind: string; message: string }[] =
    await rest("feedback?notified_at=is.null&select=id,kind,message&order=created_at.asc&limit=20");
  if (!rows.length) return 0;
  // zuerst vermerken, damit ein paralleler Lauf nichts doppelt schickt
  await rest(`feedback?id=in.(${rows.map((r) => r.id).join(",")})`, {
    method: "PATCH", body: JSON.stringify({ notified_at: new Date().toISOString() }),
  });
  const admins: { user_id: string }[] = await rest("app_admins?select=user_id");
  if (!admins.length) return 0;
  const subs: Sub[] = await rest(`push_subscriptions?user_id=in.(${admins.map((a) => a.user_id).join(",")})&select=*`);
  if (!subs.length) return 0;
  const bugs = rows.filter((r) => r.kind === "bug").length;
  const first = rows[0];
  const res = await sendTo(subs, {
    title: rows.length === 1
      ? (first.kind === "bug" ? "🐞 Neue Fehlermeldung" : "💡 Neue Idee")
      : `📬 ${rows.length} neue Meldungen (${bugs} Fehler)`,
    body: first.message.slice(0, 140),
    tag: "feedback",
    url: "./?meldungen=1",
  });
  return res.sent;
}

// "Bin wach": erstes Signal des Tages zwischen 3 und 14 Uhr zählt (Schlummern/Entsperren ändern nichts mehr)
async function setWake(filter: string) {
  const rows: { user_id: string; settings: Settings; tz: string }[] = await rest(`reminder_settings?${filter}&select=user_id,settings,tz`);
  if (!rows.length) return { ok: false, error: "Unbekannter Schlüssel." };
  const r = rows[0];
  const { day, min } = localNow(r.tz);
  const s = r.settings || {};
  if (s.wakeToday?.date === day) return { ok: true, wake: s.wakeToday.time, already: true };
  if (min < 3 * 60 || min > 14 * 60) return { ok: false, error: "Nur zwischen 3 und 14 Uhr." };
  const wakeToday = { date: day, time: hhmm(min) };
  await rest(`reminder_settings?user_id=eq.${r.user_id}`, {
    method: "PATCH", body: JSON.stringify({ settings: { ...s, wakeToday } }),
  });
  return { ok: true, wake: wakeToday.time };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // Tasker/Automate: GET oder POST .../remind?wake=<persönlicher Schlüssel>
    const wakeToken = new URL(req.url).searchParams.get("wake");
    if (wakeToken) {
      if (!/^[a-f0-9]{32,64}$/.test(wakeToken)) return out({ ok: false, error: "Ungültiger Schlüssel." }, 400);
      return out(await setWake(`wake_token=eq.${wakeToken}`));
    }
    const body = await req.json().catch(() => ({}));

    // "Bin wach" aus der App (mit Login)
    if (body.wake_me) {
      const auth = await fetch(`${SB}/auth/v1/user`, {
        headers: { apikey: req.headers.get("apikey") || "", Authorization: req.headers.get("Authorization") || "" },
      });
      if (!auth.ok) return out({ error: "Nicht angemeldet." }, 401);
      const user = await auth.json();
      return out(await setWake(`user_id=eq.${user.id}`));
    }

    // Testnachricht an die eigenen Geräte
    if (body.test) {
      const auth = await fetch(`${SB}/auth/v1/user`, {
        headers: { apikey: req.headers.get("apikey") || "", Authorization: req.headers.get("Authorization") || "" },
      });
      if (!auth.ok) return out({ error: "Nicht angemeldet." }, 401);
      const user = await auth.json();
      const subs: Sub[] = await rest(`push_subscriptions?user_id=eq.${user.id}&select=*`);
      if (!subs.length) return out({ error: "Für dieses Konto ist noch kein Gerät angemeldet." });
      const pr = await rest(`user_prefs?user_id=eq.${user.id}&select=lang:prefs->>lang`).catch(() => []);
      const tt = TXT[asLang(pr[0]?.lang)];
      const res = await sendTo(subs, {
        title: tt.testTitle,
        body: tt.testBody,
        tag: "test",
      });
      return out(res);
    }

    // Cron: alle Nutzer mit eingeschalteten Erinnerungen
    const rows = await rest("reminder_settings?enabled=eq.true&select=user_id,settings,tz");
    const results = await Promise.all(rows.map((r: { user_id: string; settings: Settings; tz: string }) =>
      remindUser(r).catch((e) => ({ error: (e as Error).message }))
    ));
    const weekly = await weeklyPush().catch((e) => ({ error: (e as Error).message }));
    const feedback = await feedbackPush().catch((e) => ({ error: (e as Error).message }));
    return out({ users: rows.length, results: results.filter(Boolean), weekly, feedback });
  } catch (e) {
    console.error(e);
    return out({ error: (e as Error).message }, 500);
  }
});
