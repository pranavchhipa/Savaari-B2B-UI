const https = require('https');

function postForm(url, formData) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(formData) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(formData);
    req.end();
  });
}

function postJSON(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers, 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject);
  });
}

async function main() {
  // 1. B2B Login (form-urlencoded)
  console.log('=== B2B Login ===');
  const login = await postJSON('https://api23.savaari.com/user/login',
    { userEmail: 'bincy.joseph@savaari.com', password: 'E5YJeNAgyPy#Yvajurug', isAgent: true }, {});
  const loginData = JSON.parse(login.body);
  const b2bToken = loginData.token || '';
  console.log('Status:', login.status, '| Token length:', b2bToken.length);
  if (b2bToken.length === 0) {
    console.log('Login failed:', login.body.substring(0, 200));
    return;
  }

  // 2. Partner API Token
  console.log('\n=== Partner API Token ===');
  const ptRes = await get('https://api.savaari.com/partner_api/public/auth/webtoken?api_key=f645dbc7cd4ba17caf4fac8abc53dc02a01231dde7ec1c31124895aa0fd24166&app_id=MjAxN3Nhdm1vYmlsZXdlYnNpdGU=');
  const partnerToken = JSON.parse(ptRes.body).token || '';
  console.log('Status:', ptRes.status, '| Token length:', partnerToken.length);

  const agentId = '983680';

  // 3. Test wallet with B2B token
  console.log('\n=== Wallet Balance (B2B Token) ===');
  const bal1 = await postJSON('https://apiext.alphasavaari.com/wallet/public/balance',
    { agent_id: agentId },
    { 'Authorization': 'Bearer ' + b2bToken });
  console.log('Status:', bal1.status, '| Response:', bal1.body.substring(0, 300));

  // 4. Test wallet with Partner token
  console.log('\n=== Wallet Balance (Partner Token) ===');
  const bal2 = await postJSON('https://apiext.alphasavaari.com/wallet/public/balance',
    { agent_id: agentId },
    { 'Authorization': 'Bearer ' + partnerToken });
  console.log('Status:', bal2.status, '| Response:', bal2.body.substring(0, 300));

  // 5. Try creating wallet
  console.log('\n=== Wallet Create (B2B Token) ===');
  const create = await postJSON('https://apiext.alphasavaari.com/wallet/public/create',
    { agent_id: agentId, agent_name: 'Bincy Joseph', agent_email: 'bincy.joseph@savaari.com' },
    { 'Authorization': 'Bearer ' + b2bToken });
  console.log('Status:', create.status, '| Response:', create.body.substring(0, 300));

  // 6. Try history
  console.log('\n=== Wallet History (B2B Token) ===');
  const hist = await postJSON('https://apiext.alphasavaari.com/wallet/public/history',
    { agent_id: agentId, page: 1, limit: 10 },
    { 'Authorization': 'Bearer ' + b2bToken });
  console.log('Status:', hist.status, '| Response:', hist.body.substring(0, 300));

  // Summary
  console.log('\n\n========== SUMMARY ==========');
  console.log('B2B Token:', b2bToken.length > 0 ? 'OK' : 'FAILED');
  console.log('Partner Token:', partnerToken.length > 0 ? 'OK' : 'FAILED');
  console.log('Wallet Balance (B2B):', bal1.status);
  console.log('Wallet Balance (Partner):', bal2.status);
  console.log('Wallet Create:', create.status);
  console.log('Wallet History:', hist.status);
}

main().catch(e => console.error('ERROR:', e.message));
