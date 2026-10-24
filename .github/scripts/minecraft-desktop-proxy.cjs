#!/usr/bin/env node
'use strict';

// Authenticated reverse proxy for a temporary noVNC desktop.
// The upstream websockify service must listen on loopback only.
const http = require('node:http');
const crypto = require('node:crypto');
const httpProxy = require('http-proxy');

const password = process.env.VM_WEB_PASSWORD;
const port = Number(process.env.VM_UI_PORT || 8090);
const upstream = process.env.DESKTOP_UPSTREAM || 'http://127.0.0.1:6080';

if (!password) {
  console.error('VM_WEB_PASSWORD is required.');
  process.exit(1);
}

function safeEqual(a, b) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function isAuthorized(req) {
  const header = req.headers.authorization || '';
  const match = /^Basic\s+(.+)$/i.exec(header);
  if (!match) return false;

  let decoded;
  try {
    decoded = Buffer.from(match[1], 'base64').toString('utf8');
  } catch {
    return false;
  }
  const split = decoded.indexOf(':');
  if (split < 0) return false;
  return safeEqual(decoded.slice(0, split), 'cctvtest') &&
    safeEqual(decoded.slice(split + 1), password);
}

const proxy = httpProxy.createProxyServer({
  target: upstream,
  ws: true,
  changeOrigin: true,
});

proxy.on('error', (error, req, res) => {
  console.error('Desktop proxy error:', error.message);
  if (res && typeof res.writeHead === 'function' && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('The temporary desktop is starting or has stopped. Please retry.');
  } else if (res && typeof res.destroy === 'function') {
    res.destroy();
  }
});

const server = http.createServer((req, res) => {
  if (!isAuthorized(req)) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="IMMERSIVE-CCTV Linux Desktop", charset="UTF-8"',
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    });
    res.end('Authentication required.');
    return;
  }
  proxy.web(req, res);
});

server.on('upgrade', (req, socket, head) => {
  if (!isAuthorized(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="IMMERSIVE-CCTV Linux Desktop"\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  proxy.ws(req, socket, head);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Authenticated desktop proxy listening on 127.0.0.1:${port}`);
});
