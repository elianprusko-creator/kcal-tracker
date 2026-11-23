// Erkennt einfache Eingaben wie "2 Bananen", "250g Skyr", "1 Scheibe Brot" ohne KI
// und berechnet die Nährwerte aus der Tabelle (foods.ts).
import { type Food, FOODS } from "./foods.ts";

export type Item = {
  name: string;
  amount: string;
  grams: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: string;
  note: string;
  source: "tabelle" | "off" | "ki" | "ki_suche";
  source_url?: string;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

// Name/Alias -> Lebensmittel
const INDEX = new Map<string, Food>();
for (const food of FOODS) {
  for (const n of [food.name, ...(food.alias || [])]) INDEX.set(n.toLowerCase(), food);
}

export function findFood(name?: string | null): Food | null {
  if (!name) return null;
  const n = name.toLowerCase().trim().replace(/\s+/g, " ");
  if (INDEX.has(n)) return INDEX.get(n)!;
  // einfache Pluralformen: bananen -> banane, eier -> ei, toasts -> toast
  for (const cut of ["n", "en", "s", "e", "er"]) {
    if (n.endsWith(cut) && INDEX.has(n.slice(0, -cut.length))) return INDEX.get(n.slice(0, -cut.length))!;
  }
  return null;
}

export function fromTable(food: Food, grams: number, amount: string, extraNote = ""): Item {
  const k = grams / 100;
  return {
    name: food.name,
    amount,
    grams: Math.round(grams),
    kcal: Math.round(food.kcal * k),
    protein_g: r1(food.p * k),
    carbs_g: r1(food.c * k),
    fat_g: r1(food.f * k),
    confidence: "hoch",
    note: [extraNote, food.note, "Standardwert aus Tabelle"].filter(Boolean).join(" · "),
    source: "tabelle",
  };
}

// "2 Bananen, 250g Skyr und 1 Brötchen" -> einzelne Teile
// (Komma nur trennen, wenn keine Ziffer folgt, damit "1,5 %" erhalten bleibt)
export function splitInput(text: string): string[] {
  return text
    .split(/\s*(?:,(?!\d)|;|\+|\n|&|\bund\b|\bsowie\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

const NUMBER_WORDS: Record<string, number> = {
  ein: 1, eine: 1, einen: 1, einem: 1, einer: 1, eins: 1,
  zwei: 2, drei: 3, vier: 4, "fünf": 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  halb: 0.5, halbe: 0.5, halben: 0.5, halber: 0.5, "½": 0.5, anderthalb: 1.5, eineinhalb: 1.5,
};

const UNITS: Record<string, string> = {
  g: "g", gr: "g", gramm: "g", kg: "kg", ml: "ml", l: "l", liter: "l",
  "stück": "stück", stueck: "stück", stk: "stück", st: "stück",
  scheibe: "scheibe", scheiben: "scheibe",
  el: "el", "esslöffel": "el", essloeffel: "el", tl: "tl", "teelöffel": "tl", teeloeffel: "tl",
  glas: "glas", "gläser": "glas", glaeser: "glas", tasse: "tasse", tassen: "tasse",
  dose: "dose", dosen: "dose", flasche: "flasche", flaschen: "flasche", becher: "becher",
  portion: "portion", portionen: "portion", handvoll: "handvoll",
  packung: "packung", packungen: "packung", pck: "packung",
  "messlöffel": "messlöffel", scoop: "messlöffel", scoops: "messlöffel",
  kugel: "kugel", kugeln: "kugel", tafel: "tafel", rippe: "rippe", rippen: "rippe", "tüte": "tüte",
};

const UNIT_LABEL: Record<string, string> = {
  "stück": "Stück", scheibe: "Scheibe(n)", el: "EL", tl: "TL", glas: "Glas", tasse: "Tasse(n)",
  dose: "Dose(n)", flasche: "Flasche(n)", becher: "Becher", portion: "Portion(en)", handvoll: "Handvoll",
  packung: "Packung(en)", "messlöffel": "Messlöffel", kugel: "Kugel(n)", tafel: "Tafel(n)", rippe: "Rippe(n)", "tüte": "Tüte(n)",
};

// Standard-Grammwerte, falls das Lebensmittel keine eigenen hat
const GENERIC_UNITS: Record<string, number> = { el: 15, tl: 5, glas: 200, tasse: 150, becher: 150, handvoll: 30 };

const SIZES: Record<string, number> = {
  "groß": 1.3, "große": 1.3, "großer": 1.3, "großes": 1.3, "großen": 1.3, gross: 1.3, grosse: 1.3,
  klein: 0.7, kleine: 0.7, kleiner: 0.7, kleines: 0.7, kleinen: 0.7,
  mittel: 1, mittlere: 1, "mittelgroße": 1, "mittelgroßer": 1, "mittelgroßes": 1,
};

const FILLER = new Set(["von", "vom", "an", "frisch", "frische", "frischer", "frisches", "frischen", "normale", "normaler", "normales", "ca", "ca.", "etwa"]);

function readNumber(token: string): number | null {
  if (token in NUMBER_WORDS) return NUMBER_WORDS[token];
  if (/^\d+\/\d+$/.test(token)) {
    const [a, b] = token.split("/").map(Number);
    return b ? a / b : null;
  }
  if (/^\d+(?:[.,]\d+)?$/.test(token)) return Number(token.replace(",", "."));
  return null;
}

function fmtNum(n: number): string {
  return String(r1(n)).replace(".", ",");
}

export function parseLocal(part: string): Item | null {
  const s = part.toLowerCase().replace(/[.!?]+$/, "").replace(/(\d)([a-zäöü])/g, "$1 $2").trim();
  let tokens = s.split(/\s+/).filter(Boolean);

  let qty: number | null = null;
  let unit: string | null = null;

  // Menge vorne: "2 Bananen", "250 g Skyr", "eine Scheibe Brot"
  const lead = tokens.length > 1 ? readNumber(tokens[0]) : null;
  if (lead !== null) {
    qty = lead;
    tokens = tokens.slice(1);
    if (tokens.length > 1 && UNITS[tokens[0].replace(/\.$/, "")]) {
      unit = UNITS[tokens[0].replace(/\.$/, "")];
      tokens = tokens.slice(1);
    }
  } else if (tokens.length > 1 && UNITS[tokens[0]] && tokens[0] !== "st") {
    // "Scheibe Brot" ohne Zahl
    unit = UNITS[tokens[0]];
    qty = 1;
    tokens = tokens.slice(1);
  } else if (tokens.length > 2 && UNITS[tokens[tokens.length - 1]] && readNumber(tokens[tokens.length - 2]) !== null) {
    // Menge hinten: "Skyr 250 g"
    unit = UNITS[tokens[tokens.length - 1]];
    qty = readNumber(tokens[tokens.length - 2]);
    tokens = tokens.slice(0, -2);
  } else if (tokens.length > 1 && readNumber(tokens[tokens.length - 1]) !== null) {
    qty = readNumber(tokens[tokens.length - 1]);
    tokens = tokens.slice(0, -1);
  }

  let size = 1;
  tokens = tokens.filter((t) => {
    if (t in SIZES) { size = SIZES[t]; return false; }
    return !FILLER.has(t);
  });

  const food = findFood(tokens.join(" "));
  if (!food || qty === 0) return null;

  let grams: number;
  let amount: string;
  let note = "";

  if (unit === "g" || unit === "ml") {
    grams = qty!;
    amount = `${fmtNum(grams)} ${unit}`;
  } else if (unit === "kg" || unit === "l") {
    grams = qty! * 1000;
    amount = `${fmtNum(qty!)} ${unit}`;
  } else if (unit) {
    const per = food.units?.[unit] ??
      (unit === "stück" ? food.piece : unit === "portion" ? food.portion : GENERIC_UNITS[unit]);
    if (!per) return null; // z. B. "1 Dose Banane" -> lieber die KI fragen
    grams = qty! * per * size;
    amount = `${fmtNum(qty!)} ${UNIT_LABEL[unit] || unit} (≈ ${Math.round(grams)} g)`;
  } else if (qty !== null) {
    if (food.piece) {
      grams = qty * food.piece * size;
      amount = `${fmtNum(qty)} Stück (≈ ${Math.round(grams)} g)`;
    } else if (qty >= 20) {
      grams = qty; // "200 Reis" -> Gramm
      amount = `${fmtNum(grams)} g`;
    } else {
      return null; // "2 Reis" ist unklar -> KI
    }
  } else if (food.piece) {
    grams = food.piece * size;
    amount = `1 Stück (≈ ${Math.round(grams)} g)`;
  } else {
    grams = food.portion;
    amount = `${grams} g`;
    note = "Annahme: übliche Portion";
  }

  return fromTable(food, grams, amount, note);
}
