// Offline-Modus: App-Dateien zwischenspeichern, damit die App auch ohne Netz startet.
// Daten (Supabase, Open Food Facts, KI) laufen NICHT über diesen Cache.
// Nach Änderungen an dieser Datei die Versionsnummer erhöhen.
const CACHE = 'kcal-v5';
const LOCAL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
const CDN = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await cache.addAll(LOCAL);
        // CDN-Dateien sind nice-to-have: ein Fehler hier darf die Installation nicht abbrechen
        await Promise.all(CDN.map(url => cache.add(url).catch(() => {})));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE && k !== 'share-inbox').map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    // Geteilt aus einer anderen App (Android "Teilen"): Inhalt kurz ablegen, dann die App öffnen
    if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share-target')) {
        event.respondWith((async () => {
            try {
                const form = await req.formData();
                const inbox = await caches.open('share-inbox');
                await inbox.put('./share-inbox/data', new Response(JSON.stringify({
                    title: form.get('title') || '', text: form.get('text') || '', url: form.get('url') || '', at: Date.now()
                }), { headers: { 'Content-Type': 'application/json' } }));
                const file = form.get('image');
                if (file && file.size) await inbox.put('./share-inbox/image', new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg' } }));
                else await inbox.delete('./share-inbox/image');
            } catch (e) { /* trotzdem öffnen */ }
            return Response.redirect('./?share=1', 303);
        })());
        return;
    }
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // Die App selbst: immer zuerst aus dem Netz (damit Updates sofort ankommen), offline aus dem Cache
    if (req.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const res = await fetch(req);
                if (res.ok) {
                    const cache = await caches.open(CACHE);
                    await cache.put('./index.html', res.clone());
                }
                return res;
            } catch (e) {
                return (await caches.match('./index.html')) || Response.error();
            }
        })());
        return;
    }

    // Icons, Manifest und Bibliotheken: sofort aus dem Cache, im Hintergrund aktualisieren
    const isStatic = (url.origin === self.location.origin && !url.pathname.endsWith('sw.js')) || CDN.includes(req.url);
    if (!isStatic) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        const network = fetch(req).then(res => {
            if (res.ok) cache.put(req, res.clone());
            return res;
        }).catch(() => null);
        if (cached) {
            event.waitUntil(network);
            return cached;
        }
        return (await network) || Response.error();
    })());
});

// Push-Erinnerungen (von der Edge Function "remind")
self.addEventListener('push', (event) => {
    let msg = {};
    try { msg = event.data ? event.data.json() : {}; } catch (e) { msg = { body: event.data && event.data.text() }; }
    event.waitUntil(self.registration.showNotification(msg.title || 'Kcal Tracker', {
        body: msg.body || '',
        tag: msg.tag || undefined,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        data: { url: msg.url || './' }
    }));
});

// Tippen auf die Nachricht: offene App nach vorne holen, sonst öffnen
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
    event.waitUntil((async () => {
        const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        const open = list.find(c => c.url.startsWith(self.registration.scope));
        if (open) {
            await open.focus();
            // Essens-Erinnerung: in der offenen App direkt die Essensideen zeigen
            if (url.includes('ideen=1')) open.postMessage({ open: 'ideas' });
            if (url.includes('rueckblick=1')) open.postMessage({ open: 'weekly' });
            return;
        }
        return clients.openWindow(url);
    })());
});
