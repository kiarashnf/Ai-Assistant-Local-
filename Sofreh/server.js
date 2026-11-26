// سرور سُفره — بدون نیاز به npm install. اجرا: node server.js
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const STAFF_PIN = String(process.env.STAFF_PIN || '1234');
const PUB = path.join(__dirname, 'public'), DB_FILE = path.join(__dirname, 'data', 'db.json');
const MENU = JSON.parse(fs.readFileSync(path.join(__dirname, 'menu.json'), 'utf8'));
const DISHES = new Map(MENU.dishes.map(d => [d.id, d]));

let db = { orders: [], reservations: [], seq: 0 };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch {}
const save = () => { fs.mkdirSync(path.dirname(DB_FILE), { recursive: true }); fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db)); fs.renameSync(DB_FILE + '.tmp', DB_FILE); };

const sessions = new Map(), hits = new Map();
const limited = ip => { const n = (hits.get(ip) || 0) + 1; hits.set(ip, n); return n > 30; };
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
const body = req => new Promise((ok, no) => { let s = ''; req.on('data', c => { s += c; if (s.length > 20000) { req.destroy(); no(); } }); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { no(); } }); });
const txt = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const digits = v => String(v).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[\s-]/g, '');
const phoneOk = p => /^(\+98|0098)?0?9\d{9}$/.test(p) || /^0\d{10}$/.test(p);
const authed = req => { const m = /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie || ''); const t = m && sessions.get(m[1]); return t && t > Date.now(); };

async function api(req, res, url) {
  const ip = req.socket.remoteAddress;
  if (req.method === 'GET' && url === '/api/menu') return send(res, 200, MENU);

  if (req.method === 'POST' && url === '/api/orders') {
    if (limited(ip + 'o')) return send(res, 429, { error: 'تعداد درخواست زیاد است. کمی بعد دوباره تلاش کنید.' });
    const b = await body(req), name = txt(b.name, 60), phone = digits(txt(b.phone, 20)), type = ['delivery', 'pickup', 'dine'].includes(b.type) ? b.type : 'pickup';
    if (!name) return send(res, 400, { error: 'نام را وارد کنید.' });
    if (!phoneOk(phone)) return send(res, 400, { error: 'شماره موبایل معتبر نیست.' });
    const address = txt(b.address, 200); if (type === 'delivery' && address.length < 8) return send(res, 400, { error: 'آدرس را کامل وارد کنید.' });
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map(i => { const d = DISHES.get(i.id), q = Math.floor(+i.qty); return d && q > 0 && q <= 20 ? { id: d.id, name: d.name, price: d.price, qty: q } : null; }).filter(Boolean);
    if (!items.length) return send(res, 400, { error: 'سبد سفارش خالی است.' });
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const o = { id: ++db.seq, name, phone, type, address, table: txt(b.table, 10), note: txt(b.note, 200), items, total, status: 'new', at: Date.now() };
    db.orders.push(o); save(); return send(res, 201, { id: o.id, total });
  }

  if (req.method === 'POST' && url === '/api/reservations') {
    if (limited(ip + 'r')) return send(res, 429, { error: 'تعداد درخواست زیاد است. کمی بعد دوباره تلاش کنید.' });
    const b = await body(req), name = txt(b.name, 60), phone = digits(txt(b.phone, 20)), date = txt(b.date, 10), time = txt(b.time, 5), guests = Math.floor(+b.guests);
    if (!name) return send(res, 400, { error: 'نام را وارد کنید.' });
    if (!phoneOk(phone)) return send(res, 400, { error: 'شماره موبایل معتبر نیست.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < new Date().toISOString().slice(0, 10)) return send(res, 400, { error: 'تاریخ رزرو معتبر نیست.' });
    if (!MENU.info.slots.includes(time)) return send(res, 400, { error: 'ساعت انتخاب‌شده در دسترس نیست.' });
    if (!(guests >= 1 && guests <= 12)) return send(res, 400, { error: 'تعداد نفرات باید بین ۱ تا ۱۲ باشد.' });
    const r = { id: ++db.seq, name, phone, date, time, guests, note: txt(b.note, 200), status: 'new', at: Date.now() };
    db.reservations.push(r); save(); return send(res, 201, { id: r.id });
  }

  if (req.method === 'POST' && url === '/api/staff/login') {
    if (limited(ip + 'l')) return send(res, 429, { error: 'تلاش‌های ناموفق زیاد بود. ده دقیقه بعد دوباره امتحان کنید.' });
    const b = await body(req), a = crypto.createHash('sha256').update(String(b.pin)).digest(), c = crypto.createHash('sha256').update(STAFF_PIN).digest();
    if (!crypto.timingSafeEqual(a, c)) return send(res, 401, { error: 'رمز اشتباه است.' });
    const sid = crypto.randomBytes(24).toString('hex'); sessions.set(sid, Date.now() + 12 * 3600e3);
    return send(res, 200, { ok: true }, { 'Set-Cookie': `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200` });
  }

  if (!url.startsWith('/api/staff/')) return send(res, 404, { error: 'پیدا نشد.' });
  if (!authed(req)) return send(res, 401, { error: 'ابتدا وارد شوید.' });
  if (req.method === 'GET' && url === '/api/staff/data') return send(res, 200, { orders: db.orders.slice().reverse(), reservations: db.reservations.slice().reverse() });
  if (req.method === 'POST' && url === '/api/staff/logout') return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Max-Age=0; Path=/' });
  const m = /^\/api\/staff\/(orders|reservations)\/(\d+)$/.exec(url);
  if (req.method === 'PATCH' && m) {
    const allowed = m[1] === 'orders' ? ['new', 'preparing', 'ready', 'done', 'cancelled'] : ['new', 'confirmed', 'seated', 'cancelled'];
    const b = await body(req), row = db[m[1]].find(x => x.id === +m[2]);
    if (!row) return send(res, 404, { error: 'پیدا نشد.' });
    if (!allowed.includes(b.status)) return send(res, 400, { error: 'وضعیت نامعتبر است.' });
    row.status = b.status; save(); return send(res, 200, row);
  }
  return send(res, 404, { error: 'پیدا نشد.' });
}

http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  try {
    if (url.startsWith('/api/')) return await api(req, res, url);
    const file = url === '/' ? '/index.html' : url === '/staff' ? '/staff.html' : url;
    const full = path.normalize(path.join(PUB, file));
    if (!full.startsWith(PUB + path.sep)) return send(res, 403, 'forbidden', { 'Content-Type': 'text/plain' });
    fs.readFile(full, (e, buf) => {
      if (e) return send(res, 404, 'یافت نشد', { 'Content-Type': 'text/plain; charset=utf-8' });
      const ext = path.extname(full);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.woff2' ? 'public,max-age=31536000' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(buf);
    });
  } catch { send(res, 400, { error: 'درخواست نامعتبر است.' }); }
}).listen(PORT, () => console.log(`سایت: http://localhost:${PORT}\nپنل کارکنان: http://localhost:${PORT}/staff  (رمز: ${STAFF_PIN})`));
