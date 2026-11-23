// Nährwerttabelle für gängige Lebensmittel, Werte pro 100 g (bzw. 100 ml).
// Richtwerte nach gängigen Nährwerttabellen (BLS/USDA), gerundet.
// piece   = Gramm pro Stück (falls zählbar)
// portion = übliche Portion in Gramm, wenn keine Menge genannt wird
// units   = eigene Grammwerte für Einheiten wie "scheibe", "el", "dose" (überschreibt die Standardwerte)
// Neue Lebensmittel einfach unten ergänzen. Alle Namen/Aliase kleingeschrieben.

export type Food = {
  name: string;
  alias?: string[];
  kcal: number;
  p: number;
  c: number;
  f: number;
  piece?: number;
  portion: number;
  units?: Record<string, number>;
  note?: string;
};

export const FOODS: Food[] = [
  // Obst
  { name: "Banane", alias: ["bananen"], kcal: 93, p: 1.1, c: 20, f: 0.2, piece: 120, portion: 120 },
  { name: "Apfel", alias: ["äpfel", "aepfel"], kcal: 52, p: 0.3, c: 14, f: 0.2, piece: 150, portion: 150 },
  { name: "Birne", alias: ["birnen"], kcal: 57, p: 0.4, c: 15, f: 0.1, piece: 160, portion: 160 },
  { name: "Orange", alias: ["orangen", "apfelsine"], kcal: 47, p: 0.9, c: 12, f: 0.1, piece: 150, portion: 150 },
  { name: "Mandarine", alias: ["mandarinen", "clementine", "clementinen"], kcal: 53, p: 0.8, c: 13, f: 0.3, piece: 70, portion: 70 },
  { name: "Kiwi", alias: ["kiwis"], kcal: 61, p: 1.1, c: 15, f: 0.5, piece: 75, portion: 75 },
  { name: "Erdbeeren", alias: ["erdbeere"], kcal: 32, p: 0.7, c: 7.7, f: 0.3, piece: 15, portion: 150 },
  { name: "Heidelbeeren", alias: ["heidelbeere", "blaubeeren", "blaubeere"], kcal: 57, p: 0.7, c: 14, f: 0.3, portion: 125 },
  { name: "Weintrauben", alias: ["trauben", "weintraube"], kcal: 69, p: 0.7, c: 18, f: 0.2, portion: 150 },
  { name: "Avocado", alias: ["avocados"], kcal: 160, p: 2, c: 9, f: 15, piece: 150, portion: 75 },
  { name: "Ananas", kcal: 50, p: 0.5, c: 13, f: 0.1, portion: 150 },
  { name: "Mango", alias: ["mangos"], kcal: 60, p: 0.8, c: 15, f: 0.4, piece: 250, portion: 150 },
  { name: "Wassermelone", kcal: 30, p: 0.6, c: 7.6, f: 0.2, portion: 300 },

  // Gemüse
  { name: "Tomate", alias: ["tomaten"], kcal: 18, p: 0.9, c: 3.9, f: 0.2, piece: 100, portion: 100 },
  { name: "Gurke", alias: ["gurken", "salatgurke"], kcal: 15, p: 0.7, c: 3.6, f: 0.1, piece: 400, portion: 150 },
  { name: "Paprika", alias: ["paprikas"], kcal: 31, p: 1, c: 6, f: 0.3, piece: 150, portion: 150 },
  { name: "Karotte", alias: ["karotten", "möhre", "möhren", "moehre", "moehren"], kcal: 41, p: 0.9, c: 10, f: 0.2, piece: 70, portion: 100 },
  { name: "Brokkoli", alias: ["broccoli"], kcal: 34, p: 2.8, c: 7, f: 0.4, portion: 200 },
  { name: "Blattsalat", alias: ["salat", "kopfsalat", "eisbergsalat", "rucola"], kcal: 15, p: 1.4, c: 2.9, f: 0.2, portion: 80 },
  { name: "Zwiebel", alias: ["zwiebeln"], kcal: 40, p: 1.1, c: 9.3, f: 0.1, piece: 80, portion: 80 },
  { name: "Spinat", kcal: 23, p: 2.9, c: 3.6, f: 0.4, portion: 150 },
  { name: "Champignons", alias: ["champignon", "pilze"], kcal: 22, p: 3.1, c: 3.3, f: 0.3, portion: 150 },
  { name: "Zucchini", kcal: 17, p: 1.2, c: 3.1, f: 0.3, piece: 200, portion: 200 },
  { name: "Mais (Dose)", alias: ["mais"], kcal: 86, p: 2.9, c: 16, f: 1.2, portion: 140, units: { dose: 140 } },
  { name: "Erbsen", kcal: 81, p: 5.4, c: 14, f: 0.4, portion: 150 },
  { name: "Kartoffeln gekocht", alias: ["kartoffel", "kartoffeln", "salzkartoffeln", "pellkartoffeln", "gekochte kartoffeln"], kcal: 86, p: 1.7, c: 20, f: 0.1, piece: 100, portion: 250 },
  { name: "Süßkartoffel", alias: ["süßkartoffeln", "suesskartoffel"], kcal: 86, p: 1.6, c: 20, f: 0.1, piece: 200, portion: 200 },
  { name: "Pommes frites", alias: ["pommes", "fritten"], kcal: 312, p: 3.4, c: 41, f: 15, portion: 150 },

  // Getreide, Brot, Beilagen
  { name: "Reis gekocht", alias: ["reis", "gekochter reis", "basmatireis", "basmati"], kcal: 130, p: 2.7, c: 28, f: 0.3, portion: 200, note: "Annahme: gekochter Reis" },
  { name: "Reis roh", alias: ["reis ungekocht", "roher reis", "trockener reis"], kcal: 360, p: 7, c: 79, f: 0.6, portion: 75 },
  { name: "Nudeln gekocht", alias: ["nudeln", "pasta", "spaghetti", "penne", "gekochte nudeln"], kcal: 158, p: 5.8, c: 31, f: 0.9, portion: 250, note: "Annahme: gekochte Nudeln" },
  { name: "Nudeln roh", alias: ["nudeln ungekocht", "rohe nudeln", "trockene nudeln"], kcal: 357, p: 12.5, c: 72, f: 1.5, portion: 100 },
  { name: "Couscous gekocht", alias: ["couscous"], kcal: 112, p: 3.8, c: 23, f: 0.2, portion: 200 },
  { name: "Quinoa gekocht", alias: ["quinoa"], kcal: 120, p: 4.4, c: 21, f: 1.9, portion: 200 },
  { name: "Haferflocken", alias: ["haferflocke", "oats"], kcal: 372, p: 13.5, c: 59, f: 7, portion: 50, units: { el: 10, tasse: 90 } },
  { name: "Müsli", alias: ["muesli", "musli"], kcal: 370, p: 9, c: 64, f: 6, portion: 60, units: { el: 12 } },
  { name: "Cornflakes", kcal: 357, p: 7, c: 84, f: 0.4, portion: 40 },
  { name: "Mischbrot", alias: ["brot", "graubrot"], kcal: 220, p: 6.5, c: 43, f: 1.3, piece: 50, portion: 50, units: { scheibe: 50 } },
  { name: "Vollkornbrot", alias: ["vollkorn brot"], kcal: 210, p: 7, c: 38, f: 1.5, piece: 50, portion: 50, units: { scheibe: 50 } },
  { name: "Toast", alias: ["toastbrot", "weizentoast"], kcal: 265, p: 8, c: 48, f: 4, piece: 25, portion: 50, units: { scheibe: 25 } },
  { name: "Brötchen", alias: ["broetchen", "semmel", "semmeln", "schrippe", "schrippen", "weizenbrötchen"], kcal: 270, p: 9, c: 53, f: 1.9, piece: 60, portion: 60 },
  { name: "Brezel", alias: ["brezeln", "laugenbrezel", "breze"], kcal: 270, p: 8.5, c: 54, f: 2, piece: 80, portion: 80 },
  { name: "Croissant", alias: ["croissants"], kcal: 406, p: 8.2, c: 45, f: 21, piece: 60, portion: 60 },
  { name: "Knäckebrot", alias: ["knaeckebrot"], kcal: 340, p: 9, c: 66, f: 1.5, piece: 10, portion: 20, units: { scheibe: 10 } },
  { name: "Reiswaffel", alias: ["reiswaffeln"], kcal: 387, p: 8, c: 81, f: 3, piece: 8, portion: 16 },

  // Milchprodukte, Ei
  { name: "Milch 3,5 %", alias: ["milch", "vollmilch"], kcal: 64, p: 3.3, c: 4.8, f: 3.5, portion: 200, units: { glas: 200, tasse: 150 }, note: "Annahme: Vollmilch 3,5 %" },
  { name: "Milch 1,5 %", alias: ["fettarme milch", "milch 1,5", "milch 1,5%"], kcal: 47, p: 3.4, c: 4.9, f: 1.5, portion: 200, units: { glas: 200, tasse: 150 } },
  { name: "Haferdrink", alias: ["hafermilch", "haferdrink"], kcal: 46, p: 0.8, c: 6.7, f: 1.5, portion: 200, units: { glas: 200 } },
  { name: "Naturjoghurt 3,5 %", alias: ["joghurt", "naturjoghurt", "jogurt"], kcal: 64, p: 3.6, c: 4.4, f: 3.5, portion: 150, units: { becher: 150 } },
  { name: "Joghurt 1,5 %", alias: ["fettarmer joghurt", "joghurt 1,5", "joghurt 1,5%"], kcal: 47, p: 4, c: 4.6, f: 1.5, portion: 150, units: { becher: 150 } },
  { name: "Griechischer Joghurt", alias: ["griechischer joghurt", "griechisch joghurt", "greek yogurt"], kcal: 120, p: 4.3, c: 3.5, f: 10, portion: 150 },
  { name: "Skyr", kcal: 63, p: 11, c: 4, f: 0.2, portion: 150, units: { becher: 450 } },
  { name: "Magerquark", alias: ["quark"], kcal: 67, p: 12, c: 4, f: 0.3, portion: 250, units: { becher: 250, packung: 500 }, note: "Annahme: Magerquark" },
  { name: "Hüttenkäse", alias: ["huettenkaese", "körniger frischkäse", "cottage cheese"], kcal: 98, p: 11, c: 3.4, f: 4.3, portion: 200, units: { becher: 200 } },
  { name: "Frischkäse", alias: ["frischkaese"], kcal: 260, p: 6, c: 3, f: 24, portion: 30, units: { el: 20 } },
  { name: "Gouda", alias: ["käse", "kaese", "scheibenkäse", "goudakäse"], kcal: 356, p: 25, c: 0, f: 28, piece: 20, portion: 30, units: { scheibe: 20 } },
  { name: "Mozzarella", kcal: 245, p: 18, c: 1, f: 19, piece: 125, portion: 125, units: { kugel: 125 } },
  { name: "Feta", alias: ["schafskäse", "hirtenkäse"], kcal: 264, p: 14, c: 4, f: 21, portion: 50 },
  { name: "Parmesan", kcal: 392, p: 33, c: 0, f: 28, portion: 10, units: { el: 6 } },
  { name: "Butter", kcal: 741, p: 0.7, c: 0.6, f: 83, portion: 10, units: { el: 12, tl: 5 } },
  { name: "Margarine", kcal: 715, p: 0.2, c: 0.4, f: 80, portion: 10, units: { el: 12, tl: 5 } },
  { name: "Schlagsahne", alias: ["sahne"], kcal: 292, p: 2.4, c: 3.2, f: 30, portion: 30, units: { el: 15 } },
  { name: "Ei", alias: ["eier", "hühnerei", "gekochtes ei", "spiegelei", "spiegeleier", "rührei"], kcal: 137, p: 12.5, c: 0.7, f: 9.5, piece: 55, portion: 55 },

  // Fleisch, Fisch, Eiweißquellen
  { name: "Hähnchenbrust", alias: ["haehnchenbrust", "hähnchenbrustfilet", "hühnerbrust", "hähnchen", "huhn", "chicken"], kcal: 110, p: 23, c: 0, f: 1.5, piece: 150, portion: 150, note: "Rohgewicht" },
  { name: "Putenbrust", alias: ["pute", "putenbrustfilet", "truthahn"], kcal: 107, p: 24, c: 0, f: 1, piece: 150, portion: 150, note: "Rohgewicht" },
  { name: "Rinderhack", alias: ["rinderhackfleisch", "hackfleisch rind"], kcal: 240, p: 19, c: 0, f: 18, portion: 125, note: "Rohgewicht" },
  { name: "Hackfleisch gemischt", alias: ["hackfleisch", "hack", "gemischtes hack"], kcal: 260, p: 18, c: 0, f: 21, portion: 125, note: "Rohgewicht" },
  { name: "Lachs", alias: ["lachsfilet"], kcal: 208, p: 20, c: 0, f: 13, piece: 125, portion: 125, note: "Rohgewicht" },
  { name: "Thunfisch (Dose, Saft)", alias: ["thunfisch"], kcal: 110, p: 25, c: 0, f: 1, portion: 140, units: { dose: 140 }, note: "Annahme: im eigenen Saft, abgetropft" },
  { name: "Kochschinken", alias: ["schinken", "gekochter schinken"], kcal: 125, p: 19, c: 1, f: 5, piece: 20, portion: 40, units: { scheibe: 20 } },
  { name: "Salami", kcal: 380, p: 21, c: 1, f: 32, piece: 10, portion: 30, units: { scheibe: 10 } },
  { name: "Wiener Würstchen", alias: ["wiener", "würstchen", "wuerstchen", "wienerle", "frankfurter"], kcal: 290, p: 13, c: 1, f: 26, piece: 50, portion: 100 },
  { name: "Bratwurst", alias: ["bratwürste", "rostbratwurst"], kcal: 300, p: 13, c: 1, f: 27, piece: 120, portion: 120 },
  { name: "Tofu", alias: ["tofu natur"], kcal: 135, p: 14, c: 1.5, f: 8, portion: 150 },
  { name: "Linsen gekocht", alias: ["linsen"], kcal: 116, p: 9, c: 20, f: 0.4, portion: 200 },
  { name: "Kichererbsen gekocht", alias: ["kichererbsen"], kcal: 164, p: 8.9, c: 27, f: 2.6, portion: 150, units: { dose: 240 } },
  { name: "Kidneybohnen", alias: ["kidney bohnen", "rote bohnen"], kcal: 100, p: 7, c: 14, f: 0.5, portion: 150, units: { dose: 250 } },
  { name: "Whey Protein", alias: ["whey", "proteinpulver", "eiweißpulver", "eiweisspulver", "proteinshake", "protein shake", "eiweißshake"], kcal: 380, p: 78, c: 7, f: 5, piece: 30, portion: 30, units: { messlöffel: 30, scoop: 30 }, note: "Pulver ohne Milch" },

  // Nüsse, Aufstriche, Fette, Süßes
  { name: "Mandeln", alias: ["mandel"], kcal: 590, p: 24, c: 6, f: 54, portion: 30, units: { handvoll: 30 } },
  { name: "Walnüsse", alias: ["walnuss", "walnuesse"], kcal: 670, p: 15, c: 11, f: 63, portion: 30, units: { handvoll: 30 } },
  { name: "Erdnüsse", alias: ["erdnuss", "erdnuesse"], kcal: 590, p: 26, c: 12, f: 49, portion: 30, units: { handvoll: 30 } },
  { name: "Cashews", alias: ["cashew", "cashewkerne"], kcal: 575, p: 18, c: 30, f: 44, portion: 30, units: { handvoll: 30 } },
  { name: "Erdnussbutter", alias: ["erdnussmus", "peanut butter"], kcal: 588, p: 25, c: 20, f: 50, portion: 15, units: { el: 15, tl: 6 } },
  { name: "Nuss-Nougat-Creme", alias: ["nutella", "nougatcreme"], kcal: 539, p: 6.3, c: 57, f: 31, portion: 20, units: { el: 20, tl: 7 } },
  { name: "Marmelade", alias: ["konfitüre", "konfituere", "marmelade", "fruchtaufstrich"], kcal: 250, p: 0.4, c: 60, f: 0.1, portion: 20, units: { el: 20, tl: 7 } },
  { name: "Honig", kcal: 304, p: 0.3, c: 82, f: 0, portion: 20, units: { el: 20, tl: 7 } },
  { name: "Zucker", kcal: 400, p: 0, c: 100, f: 0, portion: 5, units: { el: 12, tl: 4 } },
  { name: "Olivenöl", alias: ["öl", "oel", "olivenoel", "rapsöl", "rapsoel", "sonnenblumenöl", "pflanzenöl"], kcal: 884, p: 0, c: 0, f: 100, portion: 10, units: { el: 10, tl: 4 } },
  { name: "Ketchup", kcal: 110, p: 1.2, c: 25, f: 0.1, portion: 15, units: { el: 15, tl: 5 } },
  { name: "Mayonnaise", alias: ["mayo"], kcal: 700, p: 1.1, c: 1.5, f: 77, portion: 15, units: { el: 15, tl: 5 } },
  { name: "Vollmilchschokolade", alias: ["schokolade", "milchschokolade"], kcal: 535, p: 7, c: 56, f: 31, portion: 25, units: { tafel: 100, rippe: 12.5, stück: 6 } },
  { name: "Zartbitterschokolade", alias: ["zartbitter", "dunkle schokolade", "bitterschokolade"], kcal: 565, p: 9, c: 34, f: 41, portion: 25, units: { tafel: 100, rippe: 12.5, stück: 6 } },
  { name: "Gummibärchen", alias: ["gummibärchen", "gummibaerchen", "fruchtgummi"], kcal: 343, p: 6.9, c: 77, f: 0.1, portion: 50 },
  { name: "Kartoffelchips", alias: ["chips"], kcal: 535, p: 6, c: 50, f: 34, portion: 50, units: { tüte: 175, handvoll: 25 } },

  // Getränke (Werte pro 100 ml)
  { name: "Cola", alias: ["coca cola", "coca-cola"], kcal: 42, p: 0, c: 10.6, f: 0, portion: 330, units: { dose: 330, flasche: 500, glas: 250 } },
  { name: "Cola Zero", alias: ["coke zero", "cola light", "coca cola zero"], kcal: 0.3, p: 0, c: 0, f: 0, portion: 330, units: { dose: 330, flasche: 500, glas: 250 } },
  { name: "Orangensaft", alias: ["o-saft", "osaft"], kcal: 45, p: 0.7, c: 9, f: 0.2, portion: 200, units: { glas: 200 } },
  { name: "Apfelsaft", kcal: 46, p: 0.1, c: 11, f: 0.1, portion: 200, units: { glas: 200 } },
  { name: "Apfelschorle", kcal: 24, p: 0, c: 5.5, f: 0, portion: 330, units: { glas: 250, flasche: 500 } },
  { name: "Bier", alias: ["pils", "helles"], kcal: 43, p: 0.5, c: 3.1, f: 0, portion: 500, units: { flasche: 500, dose: 500, glas: 300 } },
  { name: "Rotwein", alias: ["wein", "weißwein", "weisswein"], kcal: 85, p: 0.1, c: 2.6, f: 0, portion: 200, units: { glas: 200, flasche: 750 } },
  { name: "Kaffee schwarz", alias: ["kaffee", "espresso", "americano"], kcal: 2, p: 0.1, c: 0, f: 0, portion: 200, units: { tasse: 200 } },
  { name: "Wasser", alias: ["mineralwasser", "sprudel", "leitungswasser"], kcal: 0, p: 0, c: 0, f: 0, portion: 250, units: { glas: 250, flasche: 500 } },
];
