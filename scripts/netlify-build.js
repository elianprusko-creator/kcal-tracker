// Baut die Netlify-Seite in dist/:
//   /            Website (aus website/)
//   /app/        die App (alle App-Dateien aus dem Hauptordner)
// Auf GitHub Pages bleibt alles wie es ist (Website unter /website/, App unter /).
// Lokal testen: node scripts/netlify-build.js  ->  dist/
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const SKIP = new Set(['website', 'supabase', 'scripts', 'node_modules', 'dist', '.git', '.github', '.claude', '.netlify',
    'package.json', 'package-lock.json', 'netlify.toml', '.gitignore']);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'app'), { recursive: true });

// App
for (const name of fs.readdirSync(root)) {
    if (SKIP.has(name) || name.endsWith('.md') || name.startsWith('.')) continue;
    fs.cpSync(path.join(root, name), path.join(dist, 'app', name), { recursive: true });
}

// Website: Links "../xyz" zeigen auf GitHub Pages in den Hauptordner, hier auf /app/xyz
fs.cpSync(path.join(root, 'website'), dist, { recursive: true });
const page = path.join(dist, 'index.html');
fs.writeFileSync(page, fs.readFileSync(page, 'utf8').replaceAll('"../', '"app/'));

// Später für die Play-Store-App (TWA): assetlinks.json muss unter /.well-known/ liegen
const wk = path.join(root, 'website', '.well-known');
if (fs.existsSync(wk)) fs.cpSync(wk, path.join(dist, '.well-known'), { recursive: true });

console.log('dist/ gebaut:', fs.readdirSync(dist).join(', '), '| app/:', fs.readdirSync(path.join(dist, 'app')).length, 'Dateien');
