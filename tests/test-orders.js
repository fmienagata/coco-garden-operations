// Simple integration test for orders API. Run with: node tests/test-orders.js
const fs = require('node:fs');
const path = require('node:path');

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

(async function main() {
  const base = process.env.BASE_URL || 'http://127.0.0.1:3001';
  function fail(msg) { throw new Error(msg); }

  try {
    const loginRes = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: process.env.CUISINE_LOGIN || 'cuisine', password: process.env.CUISINE_PASSWORD || 'cuisine' })
    });
    if (!loginRes.ok) fail('Login returned ' + loginRes.status);
    const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) fail('Login did not return a session cookie');
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };
    const menuRes = await fetch(base + '/api/menu', { headers });
    if (!menuRes.ok) fail('Menu returned ' + menuRes.status);
    const menu = await menuRes.json();
    const menuItem = menu.find((item) => item.active);
    if (!menuItem) fail('No active menu item available for test');

    // create
    const createRes = await fetch(base + '/api/orders', {
      method: 'POST', headers,
      body: JSON.stringify({ tableNumber: 99, items: [{ itemCode: menuItem.itemCode, qty: 2, price: 1 }] })
    });
    if (createRes.status !== 201) {
      const text = await createRes.text();
      console.error('CREATE error body:', text);
      fail('Create returned ' + createRes.status);
    }
    const created = await createRes.json();
    if (!created._id) fail('Created missing _id');
    if (created.items[0].price !== menuItem.price || created.total !== menuItem.price * 2) fail('Order did not use the menu price');

    console.log('Created id:', created._id);
    // update via POST /api/orders/update
    const updateRes = await fetch(base + '/api/orders/update', {
      method: 'POST', headers,
      body: JSON.stringify({ id: created._id, patch: { status: 'ready' } })
    });
    if (updateRes.status !== 200) {
      const text = await updateRes.text(); console.error('UPDATE error body:', text); fail('Update returned ' + updateRes.status);
    }

    // list and verify status updated
    const listAfter = await (await fetch(base + '/api/orders', { headers })).json();
    const foundAfter = listAfter.find((d)=>String(d._id)===String(created._id));
    if (!foundAfter) fail('Order not found after update');
    if (foundAfter.status !== 'ready') fail('Order status not updated');

    // delete via POST /api/orders/delete
    const deleteRes = await fetch(base + '/api/orders/delete', { method: 'POST', headers, body: JSON.stringify({ id: created._id }) });
    if (deleteRes.status !== 200) { const text = await deleteRes.text(); console.error('DELETE error body:', text); fail('Delete returned ' + deleteRes.status); }

    // verify deletion via list
    const listFinal = await (await fetch(base + '/api/orders', { headers })).json();
    const exists = listFinal.some((d)=>String(d._id)===String(created._id));
    if (exists) fail('Order still present after delete');

    console.log('OK: create → put → get → delete flow succeeded. id:', created._id);
  } catch (err) {
    console.error('ERROR', err);
    process.exitCode = 1;
  }
})();
