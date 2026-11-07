// Läden: mit Geld einkaufen. Supermärkte führen alles, was das Spiel kennt, Fachläden einen Teil.
// Läden kommen aus den OSM-Daten (Shop-Punkte und Gebäude mit Laden), Eingang = nächste Hauswand.
export function initShops(X, W) {
  const { player, CITY, sfx, showMsg, nearestEdge, edgeNormal, keys } = X;
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
  function door(x, z) { const ne = nearestEdge(x, z, 25); if (!ne) return [x, z]; const e = edgeNormal(ne.b.p, ne.e); let nx = e.nx, nz = e.nz; const mx = e.ax + e.dx / 2, mz = e.az + e.dz / 2; const bx = ne.b.p.reduce((a, p) => a + p[0], 0) / ne.b.p.length, bz = ne.b.p.reduce((a, p) => a + p[1], 0) / ne.b.p.length; if ((mx - bx) * nx + (mz - bz) * nz < 0) { nx = -nx; nz = -nz; } const t = Math.max(0, Math.min(1, ((x - e.ax) * e.dx + (z - e.az) * e.dz) / (e.l * e.l))); return [e.ax + e.dx * t + nx * 1.2, e.az + e.dz * t + nz * 1.2]; }
  function scan() {
    for (; seenP < CITY.pois.length; seenP++) { const p = CITY.pois[seenP]; const k = KIND[p.k]; if (!k) continue; const [x, z] = door(p.x, p.z); shops.push({ x, z, k, name: p.n || TYPES[k].n }); }
    for (; seenB < CITY.buildings.length; seenB++) { const b = CITY.buildings[seenB]; const k = KIND[b.shop]; if (!k) continue; const cx = b.p.reduce((a, p) => a + p[0], 0) / b.p.length, cz = b.p.reduce((a, p) => a + p[1], 0) / b.p.length; const [x, z] = door(cx, cz); if (shops.some(s => Math.hypot(s.x - x, s.z - z) < 6)) continue; shops.push({ x, z, k, name: b.n || TYPES[k].n }); }
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
      list.map(([id, it]) => { const no = player.money < it.p || owned(it) || (it.hp && player.hp >= 100); return `<div class="it${no ? ' no' : ''}" data-id="${id}"><span>${it.n}${owned(it) ? ' · hast du' : ''}</span><b>${it.p} €</b></div>`; }).join('') +
      `<div class="row"><span class="sub">Klick zum Kaufen · Esc schließt</span><button id="shop_x">Fertig</button></div></div>`;
    $('shop_x').onclick = close;
    for (const d of el.querySelectorAll('.it')) d.onclick = () => buy(d.dataset.id);
  }
  function buy(id) {
    const it = ITEMS[id]; if (!it || player.money < it.p || owned(it) || (it.hp && player.hp >= 100)) { sfx('click', 0.3); return; }
    player.money -= it.p;
    if (it.w) { const fresh = W.give(it.w); if (fresh) W.select(it.w, true); }
    if (it.ammo) W.give(it.ammo);
    if (it.hp) player.hp = Math.min(100, player.hp + it.hp);
    sfx('click', 0.6); X.emit && X.emit('bought', player.pos, { id, price: it.p }); render();
  }
  let wasLocked = false;
  function open(s) { cur = s; if (document.pointerLockElement) { wasLocked = true; document.exitPointerLock(); } for (const k in keys) keys[k] = false; render(); el.style.display = 'flex'; X.shopOpen = true; sfx('click', 0.5); }
  function close() { el.style.display = 'none'; X.shopOpen = false; cur = null; }
  addEventListener('keydown', e => { if (!X.shopOpen) return; if (e.code === 'Escape' || e.code === 'KeyF') { close(); e.stopImmediatePropagation(); } }, true);
  // Nähe prüfen, Hinweis zeigen, Taste F
  let near = null, scanT = 0;
  function update(dt) {
    scanT -= dt; if (scanT <= 0) { scanT = 1; scan(); }
    near = null; if (player.car || player.dead) return null; let bd = 3.2 * 3.2;
    for (const s of shops) { const d = (s.x - player.pos.x) ** 2 + (s.z - player.pos.z) ** 2; if (d < bd) { bd = d; near = s; } }
    return near ? `F · ${TYPES[near.k].ic} ${near.name} (${TYPES[near.k].n})` : null;
  }
  addEventListener('keydown', e => { if (e.code !== 'KeyF' || X.shopOpen || !near || X.menuOpen && X.menuOpen()) return; if (player.wanted > 0) { showMsg('POLIZEI SUCHT DICH – KEIN EINKAUF', 1200); return; } open(near); });
  X.mmHooks.push((ctx, P, R) => { for (const s of shops) { const [x, y] = P(s.x, s.z); if (x * x + y * y > R * R) continue; ctx.fillStyle = s.k === 'super' ? '#3fd0ff' : '#7fa8b8'; ctx.fillRect(x - 2, y - 2, 4, 4); } });
  return { update, shops, open, close, ITEMS, TYPES, buy, scan, get near() { return near; } };
}
