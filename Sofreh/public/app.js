const $ = id => document.getElementById(id), fa = v => Number(v).toLocaleString('fa-IR');
const cart = new Map(); let MENU;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderMenu() {
  $('menuList').innerHTML = MENU.categories.map(c => `<h3 class="cat">${esc(c)}</h3>` + MENU.dishes.filter(d => d.cat === c).map(d => `
    <div class="dish"><h3>${esc(d.name)}<i></i><span class="pr">${fa(d.price)}</span></h3>
    <p>${esc(d.desc)}</p><span data-ctl="${d.id}"></span></div>`).join('')).join('');
  document.querySelectorAll('[data-ctl]').forEach(drawCtl);
}
function drawCtl(el) {
  const id = el.dataset.ctl, q = cart.get(id) || 0, name = MENU.dishes.find(d => d.id === id).name;
  el.outerHTML = q
    ? `<span class="qty" data-ctl="${id}"><button type="button" data-a="inc" data-id="${id}" aria-label="یکی بیشتر ${esc(name)}">+</button><span aria-live="polite">${fa(q)}</span><button type="button" data-a="dec" data-id="${id}" aria-label="یکی کمتر ${esc(name)}">−</button></span>`
    : `<button type="button" class="add" data-ctl="${id}" data-a="inc" data-id="${id}">افزودن</button>`;
}
function change(id, delta) {
  const q = Math.max(0, Math.min(20, (cart.get(id) || 0) + delta));
  q ? cart.set(id, q) : cart.delete(id);
  const el = document.querySelector(`#menuList [data-ctl="${id}"]`); if (el) drawCtl(el);
  sync();
}
const total = () => [...cart].reduce((s, [id, q]) => s + MENU.dishes.find(d => d.id === id).price * q, 0);
function sync() {
  $('cc').textContent = fa([...cart.values()].reduce((a, b) => a + b, 0));
  $('items').innerHTML = cart.size
    ? [...cart].map(([id, q]) => { const d = MENU.dishes.find(x => x.id === id); return `<div class="li"><span>${esc(d.name)} × ${fa(q)}</span><span>${fa(d.price * q)}</span></div>`; }).join('') + `<div class="tot"><span>جمع</span><span>${fa(total())} هزار تومان</span></div>`
    : '<p class="empty" style="padding:16px 0">هنوز غذایی انتخاب نشده. از منو چیزی اضافه کنید.</p>';
  $('osub').disabled = !cart.size;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) change(b.dataset.id, b.dataset.a === 'inc' ? 1 : -1); });
$('openCart').onclick = () => $('cart').showModal();
$('closeCart').onclick = () => $('cart').close();
$('cart').addEventListener('click', e => { if (e.target === $('cart')) $('cart').close(); });
document.querySelectorAll('[name=type]').forEach(r => r.onchange = () => $('addrBox').hidden = r.value !== 'delivery' && r.checked);

async function post(url, data) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'خطایی رخ داد. دوباره تلاش کنید.'); return j;
}
$('oform').onsubmit = async e => {
  e.preventDefault(); const m = $('omsg'); m.className = 'msg'; m.textContent = ''; $('osub').disabled = true;
  try {
    const type = document.querySelector('[name=type]:checked').value;
    const r = await post('/api/orders', { name: $('on').value, phone: $('op').value, type, address: $('oa').value, note: $('onote').value, items: [...cart].map(([id, qty]) => ({ id, qty })) });
    cart.clear(); renderMenu(); sync();
    $('oform').outerHTML = `<div class="done">سفارش شماره‌ی ${fa(r.id)} ثبت شد. مبلغ ${fa(r.total)} هزار تومان. برای هماهنگی با شما تماس می‌گیریم.</div>`;
  } catch (err) { m.className = 'msg err'; m.textContent = err.message; $('osub').disabled = !cart.size; }
};
$('rform').onsubmit = async e => {
  e.preventDefault(); const m = $('rmsg'); m.className = 'msg'; m.textContent = ''; $('rsub').disabled = true;
  try {
    const r = await post('/api/reservations', { name: $('rn').value, phone: $('rp').value, date: $('rd').value, time: $('rt').value, guests: $('rg').value });
    $('rbox').innerHTML = `<div class="done">رزرو شماره‌ی ${fa(r.id)} ثبت شد. برای تأیید با شما تماس می‌گیریم.</div>`;
  } catch (err) { m.className = 'msg err'; m.textContent = err.message; $('rsub').disabled = false; }
};

fetch('/api/menu').then(r => r.json()).then(m => {
  MENU = m; const i = m.info;
  $('facts').innerHTML = `<div><span>ساعت کاری</span><b>${esc(i.hours)}</b></div><div><span>آدرس</span><b>${esc(i.address)}</b></div><div><span>تلفن</span><b>${esc(i.phone)}</b></div>`;
  $('finfo').innerHTML = `${esc(i.address)}<br>تلفن: <a href="tel:${esc(i.phone.replace(/[^\d۰-۹]/g, ''))}">${esc(i.phone)}</a> · ${esc(i.hours)}`;
  $('rt').innerHTML = i.slots.map(s => `<option value="${s}">${s.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d])}</option>`).join('');
  $('rg').innerHTML = Array.from({ length: 10 }, (_, k) => `<option value="${k + 1}"${k === 1 ? ' selected' : ''}>${fa(k + 1)} نفر</option>`).join('');
  const d = new Date(), p = n => String(n).padStart(2, '0'), t = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  $('rd').min = $('rd').value = t;
  renderMenu(); sync();
}).catch(() => $('menuList').textContent = 'منو بارگذاری نشد. صفحه را دوباره باز کنید.');
