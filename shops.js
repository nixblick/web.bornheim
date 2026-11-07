// Läden: mit Geld einkaufen. Supermärkte führen alles, was das Spiel kennt, Fachläden einen Teil.
// Läden kommen aus den OSM-Daten (Shop-Punkte und Gebäude mit Laden), Eingang = nächste Hauswand.
export function initShops(X, W) {
  const { player, CITY, sfx, showMsg, nearestEdge, edgeNormal, keys, solidAt } = X;
  const $ = id => document.getElementById(id);
  // Sortiment: id, Name, Preis, Wirkung
  const ITEMS = {
    bat: { n: 'Baseballschläger', p: 60, w: 'bat' }, pistol: { n: 'Pistole', p: 350, w: 'pistol' }, smg: { n: 'Maschinenpistole', p: 950, w: 'smg' },
    shotgun: { n: 'Schrotflinte', p: 800, w: 'shotgun' }, rifle: { n: 'Sturmgewehr', p: 1500, w: 'rifle' }, spray: { n: 'Pfefferspray', p: 25, w: 'spray' },
    taser: { n: 'Taser', p: 180, w: 'taser' }, paint: { n: 'Farbbeutel (8)', p: 24, w: 'paint' }, banger: { n: 'Böller (6)', p: 18, w: 'banger' },
    smoke: { n: 'Rauchtopf (3)', p: 30, w: 'smoke' }, flare: { n: 'Bengalo (3)', p: 36, w: 'flare' }, grenade: { n: 'Granate (2)', p: 300, w: 'grenade' },
    a_pistol: { n: 'Munition Pistole (48)', p: 40, ammo: 'pistol' }, a_smg: { n: 'Munition MP (120)', p: 90, ammo: 'smg' }, a_shotgun: { n: 'Schrotpatronen (24)', p: 60, ammo: 'shotgun' }, a_rifle: { n: 'Munition Gewehr (90)', p: 110, ammo: 'rifle' },
    snack: { n: 'Snack (+15 Gesundheit)', p: 4, hp: 15 }, drink: { n: 'Wasser (+10, kühlt bei Hitze)', p: 2, hp: 10 }, meal: { n: 'Mahlzeit (+40 Gesundheit)', p: 12, hp: 40 },
    band: { n: 'Verband (+50 Gesundheit)', p: 20, hp: 50 }, kit: { n: 'Erste-Hilfe-Set (volle Gesundheit)', p: 60, hp: 100 },
  };
  const ALL = Object.keys(ITEMS);
  const price = it => Math.max(1, Math.round(it.p * ((X.perks && X.perks.shop) || 1))); // Rabatt nach Stufe (progress.js)
  const TYPES = {
    super: { n: 'Supermarkt', ic: '🛒', items: ALL },
    kiosk: { n: 'Kiosk', ic: '🗞', items: ['drink', 'snack', 'banger', 'flare', 'smoke'] },
    food: { n: 'Imbiss', ic: '🍔', items: ['meal', 'snack', 'drink'] },
    bakery: { n: 'Bäckerei', ic: '🥨', items: ['snack', 'meal', 'drink'] },
    pharmacy: { n: 'Apotheke', ic: '💊', items: ['band', 'kit', 'drink', 'spray'] },
    hardware: { n: 'Baumarkt', ic: '🔨', items: ['bat', 'paint', 'smoke', 'spray'] },
    sports: { n: 'Sportladen', ic: '⚽', items: ['bat', 'spray', 'taser', 'drink'] },
  };
  const KIND = { supermarket: 'super', convenience: 'super', department_store: 'super', general: 'super', kiosk: 'kiosk', newsagent: 'kiosk', tobacco: 'kiosk', beverages: 'kiosk',
    fast_food: 'food', restaurant: 'food', cafe: 'food', ice_cream: 'food', bakery: 'bakery', pastry: 'bakery', pharmacy: 'pharmacy', chemist: 'pharmacy', doityourself: 'hardware', hardware: 'hardware', paint: 'hardware', sports: 'sports', outdoor: 'sports' };
  // Läden aus den geladenen Daten sammeln (wächst mit den Kacheln)
  const shops = []; let seenP = 0, seenB = 0;
  // Eingang: Punkt 1,2 m vor einer freien Außenwand des nächsten Hauses. Zuerst die nächste Kante, sonst die übrigen Kanten nach Abstand
  // (Reihenhäuser teilen Wände mit dem Nachbarn), zuletzt die nächste freie Stelle drumherum.
  const free = (x, z) => solidAt(x, z) < 0 && solidAt(x + 0.8, z) < 0 && solidAt(x - 0.8, z) < 0 && solidAt(x, z + 0.8) < 0 && solidAt(x, z - 0.8) < 0;
  function door(x, z) {
    const ne = nearestEdge(x, z, 25); if (!ne) return free(x, z) ? [x, z] : spiral(x, z); const P = ne.b.p;
    const order = P.map((_, i) => i).map(i => { const e = edgeNormal(P, i); const t = Math.max(0, Math.min(1, ((x - e.ax) * e.dx + (z - e.az) * e.dz) / (e.l * e.l))); const px = e.ax + e.dx * t, pz = e.az + e.dz * t; return { e, px, pz, d: (px - x) ** 2 + (pz - z) ** 2 + (i === ne.e ? -1e6 : 0) }; }).sort((a, b) => a.d - b.d);
    for (const o of order) { if (o.e.l < 2.5) continue; for (const sg of [1, -1]) { const t = Math.max(0.15, Math.min(0.85, ((o.px - o.e.ax) * o.e.dx + (o.pz - o.e.az) * o.e.dz) / (o.e.l * o.e.l))); const bx = o.e.ax + o.e.dx * t, bz = o.e.az + o.e.dz * t; const qx = bx + o.e.nx * sg * 1.2, qz = bz + o.e.nz * sg * 1.2; if (free(qx, qz) && free(bx + o.e.nx * sg * 2.4, bz + o.e.nz * sg * 2.4)) return [qx, qz]; } }
    return spiral(x, z);
  }
  function spiral(x, z) { for (let r = 1.5; r < 40; r += 1.5) for (let a = 0; a < 6.283; a += 1.5 / r) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (free(px, pz)) return [px, pz]; } return [x, z]; }
  function scan() {
    for (; seenP < CITY.pois.length; seenP++) { const p = CITY.pois[seenP]; const k = KIND[p.k]; if (!k) continue; const [x, z] = door(p.x, p.z); shops.push({ x, z, ox: p.x, oz: p.z, k, name: p.n || TYPES[k].n }); }
    for (; seenB < CITY.buildings.length; seenB++) { const b = CITY.buildings[seenB]; const k = KIND[b.shop]; if (!k) continue; const cx = b.p.reduce((a, p) => a + p[0], 0) / b.p.length, cz = b.p.reduce((a, p) => a + p[1], 0) / b.p.length; const [x, z] = door(cx, cz); if (shops.some(s => Math.hypot(s.x - x, s.z - z) < 6)) continue; shops.push({ x, z, ox: cx, oz: cz, k, name: b.n || TYPES[k].n }); }
  }
  // Oberfläche
  const st = document.createElement('style'); st.textContent = `#shop{position:fixed;inset:0;background:#000a;display:none;align-items:center;justify-content:center;z-index:40;font-family:system-ui,sans-serif}
#shop .box{background:#16181d;color:#eee;border:1px solid #333;border-radius:12px;padding:16px 18px;width:min(560px,94vw);max-height:86vh;overflow:auto}
#shop h3{margin:0 0 2px;font-size:20px}#shop .sub{color:#aaa;font-size:13px;margin-bottom:10px}#shop .it{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 8px;border-radius:8px;cursor:pointer;font-size:15px}
#shop .it:hover{background:#2a2d35}#shop .it.no{opacity:.45;cursor:default}#shop .it b{color:#ffd84a;white-space:nowrap}#shop .row{margin-top:10px;display:flex;justify-content:space-between;align-items:center}
#shop button{background:#2a2d35;color:#eee;border:1px solid #444;border-radius:8px;padding:8px 14px;font:600 14px system-ui;cursor:pointer}`;
  document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'shop'; document.body.appendChild(el);
  let cur = null;
  const owned = it => it.w && W.inv[it.w] && W.DEF[it.w].kind !== 'throw' && W.DEF[it.w].kind !== 'gun' && W.DEF[it.w].kind !== 'taser';
  function render() {
    const T = TYPES[cur.k]; const list = T.items.map(id => [id, ITEMS[id]]).filter(([, it]) => !(it.ammo && !W.inv[it.ammo]));
    el.innerHTML = `<div class="box"><h3>${T.ic} ${cur.name}</h3><div class="sub">${T.n} · Du hast <b style="color:#ffd84a">${player.money} €</b> · Gesundheit ${Math.round(player.hp)}</div>` +
      list.map(([id, it]) => { const no = player.money < price(it) || owned(it) || (it.hp && player.hp >= 100); return `<div class="it${no ? ' no' : ''}" data-id="${id}"><span>${it.n}${owned(it) ? ' · hast du' : ''}</span><b>${price(it)} €</b></div>`; }).join('') +
      `<div class="row"><span class="sub">Klick zum Kaufen · Esc schließt</span><button id="shop_x">Fertig</button></div></div>`;
    $('shop_x').onclick = close;
    for (const d of el.querySelectorAll('.it')) d.onclick = () => buy(d.dataset.id);
  }
  function buy(id) {
    const it = ITEMS[id]; if (!it || player.money < price(it) || owned(it) || (it.hp && player.hp >= 100)) { sfx('click', 0.3); return; }
    player.money -= price(it);
    if (it.w) { const fresh = W.give(it.w); if (fresh) W.select(it.w, true); }
    if (it.ammo) W.give(it.ammo);
    if (it.hp) player.hp = Math.min(100, player.hp + it.hp);
    sfx('click', 0.6); X.emit && X.emit('bought', player.pos, { id, price: price(it) }); render();
  }
  let wasLocked = false;
  // Während der Laden offen ist, darf das Loslassen der Maus nicht das Pausemenü öffnen; danach die Maus wieder fangen
  function open(s) { cur = s; X.shopOpen = true; window.__noAutoMenu = true; wasLocked = !!document.pointerLockElement; if (wasLocked) document.exitPointerLock(); for (const k in keys) keys[k] = false; render(); el.style.display = 'flex'; sfx('click', 0.5); }
  function close() { el.style.display = 'none'; X.shopOpen = false; cur = null; window.__noAutoMenu = false; if (wasLocked) { wasLocked = false; try { X.renderer.domElement.requestPointerLock(); } catch (e) {} } }
  addEventListener('keydown', e => { if (!X.shopOpen) return; if (e.code === 'Escape' || e.code === 'KeyF') { close(); e.stopImmediatePropagation(); } }, true);
  // Nähe prüfen, Hinweis zeigen, Taste F
  let near = null, scanT = 0;
  function update(dt) {
    scanT -= dt; if (scanT <= 0) { scanT = 1; scan(); }
    near = null; if (player.car || player.dead) return null; let bd = 3.2 * 3.2;
    for (const s of shops) { const d = (s.x - player.pos.x) ** 2 + (s.z - player.pos.z) ** 2; if (d < 900 && !s.chk) { s.chk = 1; if (!free(s.x, s.z)) [s.x, s.z] = door(s.ox ?? s.x, s.oz ?? s.z); } if (d < bd) { bd = d; near = s; } }
    return near ? `F · ${TYPES[near.k].ic} ${near.name} (${TYPES[near.k].n})` : null;
  }
  addEventListener('keydown', e => { if (X.interiors) return; /* Taste F übernimmt interiors.js (Laden betreten) */ if (e.code !== 'KeyF' || X.shopOpen || !near || X.menuOpen && X.menuOpen()) return; if (player.wanted > 0) { showMsg('POLIZEI SUCHT DICH – KEIN EINKAUF', 1200); return; } open(near); });
  X.mmHooks.push((ctx, P, R) => { for (const s of shops) { const [x, y] = P(s.x, s.z); if (x * x + y * y > R * R) continue; ctx.fillStyle = s.k === 'super' ? '#3fd0ff' : '#7fa8b8'; ctx.fillRect(x - 2, y - 2, 4, 4); } });
  return { update, shops, open, close, ITEMS, TYPES, buy, scan, get near() { return near; } };
}
