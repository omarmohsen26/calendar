const CACHE = "daybook-v11";
const ASSETS = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-180.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && new URL(e.request.url).origin === location.origin) {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, cp));
      }
      return r;
    }).catch(() => caches.match(e.request).then(m => m || caches.match("index.html")))
  );
});

/* Notification tap: open the app on the event's detail page */
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.registration.scope)) { c.navigate(url); return c.focus(); }
      }
      return clients.openWindow(url);
    })
  );
});

/* Periodic background sync (opportunistic on Android Chrome): fire due reminders from the mirrored event list */
self.addEventListener("periodicsync", e => {
  if (e.tag !== "daybook-remind") return;
  e.waitUntil((async () => {
    try {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open("daybook", 1);
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const items = await new Promise((res, rej) => {
        const q = db.transaction("mirror").objectStore("mirror").getAll();
        q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error);
      });
      const now = new Date();
      const ds = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
      const hm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
      for (const ev of items) {
        if (ev.date === ds && ev.time && ev.time <= hm && ev.time > subHour(hm)) {
          await self.registration.showNotification(ev.title, {
            body: (ev.details || "").split("\n")[0] || "Open Daybook",
            tag: ev.id, icon: "icon-192.png", badge: "icon-192.png",
            data: { url: new URL("#/event/" + ev.id, self.registration.scope).href }
          });
        }
      }
    } catch (err) {}
  })());
});
function subHour(hm) {
  let [h, m] = hm.split(":").map(Number); m -= 60;
  if (m < 0) { m += 60; h = (h + 23) % 24; }
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}
