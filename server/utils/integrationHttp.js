const https = require('https');
const dns = require('dns').promises;
const net = require('net');

const blockedV4 = new net.BlockList(), blockedV6 = new net.BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['192.0.2.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) blockedV4.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['::', 96], ['::ffff:0:0', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['2001::', 32]]) blockedV6.addSubnet(address, prefix, 'ipv6');

function allowedGatewayUrl(baseUrl) {
  let url;
  try { url = new URL(baseUrl); } catch (_) { throw new Error('Invalid integration URL'); }
  const allowed = String(process.env.NAFATH_ALLOWED_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || (url.port && url.port !== '443')
      || net.isIP(url.hostname) || !allowed.includes(url.hostname.toLowerCase()) || !/^[a-z0-9.-]+$/i.test(url.hostname)) {
    throw new Error('Integration URL must use an allowed HTTPS host');
  }
  return url;
}

function isPublicAddress(address) {
  const family = net.isIP(address);
  if (!family) return false;
  if (family === 6 && !/^[23]/i.test(address)) return false;
  return family === 4 ? !blockedV4.check(address, 'ipv4') : !blockedV6.check(address, 'ipv6');
}

// Resolve once, reject nonpublic answers, and pin the exact approved IP in TLS.
// Redirects are never followed, so configured credentials cannot move hosts.
async function gatewayRequest(baseUrl, endpoint, options = {}) {
  const base = allowedGatewayUrl(baseUrl);
  const url = new URL(base.toString().replace(/\/$/, '') + endpoint);
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('Integration host is unavailable');
  const selected = addresses[0];
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error('Integration request failed'));
    const request = https.request(url, {
      method: options.method || 'GET', headers: options.headers,
      agent: false, timeout: 10000,
      lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family),
    }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 256 * 1024) { response.destroy(); request.destroy(); fail(); }
        else chunks.push(chunk);
      });
      response.on('error', fail);
      response.on('end', () => {
        if (response.statusCode >= 300 && response.statusCode < 400) return fail();
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers }));
      });
    });
    request.on('error', fail);
    request.on('timeout', () => { request.destroy(); fail(); });
    request.end(options.body);
  });
}

function providerFetch(url, options = {}) {
  return fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) });
}

module.exports = { allowedGatewayUrl, isPublicAddress, gatewayRequest, providerFetch };
