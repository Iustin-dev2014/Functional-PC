'use strict';

const http = require('http');
const httpProxy = require('http-proxy');

const targetPort = Number(process.env.TTYD_PORT || 7681);
const listenPort = Number(process.env.VM_UI_PORT || 7682);
const proxy = httpProxy.createProxyServer({
  target: 'http://127.0.0.1:' + targetPort,
  ws: true,
  changeOrigin: true,
  xfwd: true,
  proxyTimeout: 30000
});

const injectedHead = String.raw`
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#090d16">
<style id="vm-modern-ui">
:root{color-scheme:dark;--bg:#090d16;--panel:#101827;--panel2:#151f31;--line:#26344b;--text:#e8eef8;--muted:#8ea1bb;--accent:#73a7ff;--green:#56d6a0;--radius:15px}
*{box-sizing:border-box}
html,body{width:100%;height:100%;min-height:100%;margin:0;overflow:hidden;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{display:flex;flex-direction:column;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
#vm-appbar{flex:0 0 auto;display:flex;align-items:center;gap:12px;min-height:58px;padding:10px 16px;background:linear-gradient(110deg,#121d30,#0d1421 72%);border-bottom:1px solid var(--line)}
#vm-brand{display:flex;align-items:center;gap:11px;min-width:0}
#vm-logo{width:36px;height:36px;display:grid;place-items:center;border:1px solid #34517b;border-radius:11px;background:linear-gradient(145deg,#1b3457,#132035);color:#9ec3ff;font-size:19px;font-weight:800}
#vm-brandcopy{min-width:0}
#vm-brandcopy strong{display:block;font-size:14px;letter-spacing:.04em;line-height:1.3}
#vm-brandcopy span{display:block;color:var(--muted);font-size:11px;margin-top:2px}
#vm-live{margin-left:auto;display:flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid #244a43;border-radius:999px;background:#102721;color:#8de6c0;font-size:11px;font-weight:700;white-space:nowrap}
#vm-live i{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 12px #56d6a088}
#vm-toolbar{flex:0 0 auto;padding:9px 12px 10px;border-bottom:1px solid var(--line);background:#0c1320;display:flex;flex-direction:column;gap:8px}
.vm-keyrow{display:flex;gap:7px;align-items:center;overflow-x:auto;scrollbar-width:thin;scrollbar-color:#35445d transparent;padding:1px 0 3px;overscroll-behavior-x:contain}
.vm-keyrow::-webkit-scrollbar{height:4px}.vm-keyrow::-webkit-scrollbar-thumb{background:#35445d;border-radius:9px}
.vm-key{flex:0 0 auto;min-width:45px;min-height:40px;padding:0 12px;border:1px solid #2a3951;border-radius:10px;background:linear-gradient(180deg,#1b273a,#141e2e);color:#e5edf9;font:600 13px/1 system-ui,sans-serif;box-shadow:0 2px 0 #070b12;touch-action:manipulation;user-select:none;-webkit-tap-highlight-color:transparent}
.vm-key:active,.vm-key.vm-active{background:#203d66;border-color:#6799ed;color:#fff;transform:translateY(1px);box-shadow:none}
.vm-key.vm-primary{background:#1c3558;border-color:#365c8e;color:#c7ddff}
.vm-key.vm-danger{color:#ffb7bd;border-color:#5a3540}
.vm-key.vm-wide{min-width:68px}
.vm-key.vm-space{flex:1 0 70px}
.vm-toolbarlabel{flex:0 0 auto;color:#6f829e;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-right:3px}
#vm-terminal-wrap{position:relative;flex:1 1 auto;min-height:0;width:100%;padding:12px 14px 10px;background:radial-gradient(ellipse at 50% 0%,#111d31 0%,#090d16 70%)}
#terminal{width:100%!important;height:100%!important;min-height:0!important;border:1px solid #26344b;border-radius:13px;overflow:hidden;background:#080c13!important;box-shadow:0 14px 45px #0005}
#terminal .xterm{height:100%;padding:10px 8px}
#terminal .xterm-viewport{background:#080c13!important}
#terminal .xterm-screen{width:100%!important}
#terminal .xterm-helper-textarea{font-size:16px!important}
#vm-footer{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 15px calc(7px + env(safe-area-inset-bottom));border-top:1px solid #1d293c;background:#0c1320;color:#7f91aa;font-size:11px}
#vm-footer strong{color:#b8c7dc;font-weight:600}
#vm-keyhint{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media(min-width:900px){#vm-appbar{padding-left:22px;padding-right:22px}#vm-toolbar{padding-left:20px;padding-right:20px;gap:7px}.vm-key{min-height:38px}#vm-terminal-wrap{padding:14px 20px 12px}}
@media(max-width:520px){#vm-appbar{min-height:54px;padding:8px 11px;gap:8px}#vm-logo{width:33px;height:33px;border-radius:10px}#vm-brandcopy strong{font-size:12px}#vm-brandcopy span{font-size:10px}#vm-live{padding:6px 8px;font-size:10px}#vm-toolbar{padding:8px 8px 9px;gap:7px}.vm-keyrow{gap:6px}.vm-key{min-width:42px;min-height:43px;padding:0 10px;font-size:13px;border-radius:11px}.vm-key.vm-wide{min-width:57px}#vm-terminal-wrap{padding:8px 7px 7px}#terminal{border-radius:10px}#terminal .xterm{padding:7px 4px}#vm-footer{padding:7px 10px calc(7px + env(safe-area-inset-bottom));font-size:10px}}
@media(max-height:500px){#vm-appbar{min-height:44px;padding-top:5px;padding-bottom:5px}#vm-logo{width:29px;height:29px}#vm-toolbar{padding-top:5px;padding-bottom:5px;gap:4px}.vm-key{min-height:34px}#vm-terminal-wrap{padding-top:5px;padding-bottom:5px}#vm-footer{padding-top:4px;padding-bottom:4px}}
</style>
`;

const injectedBody = String.raw`
<div id="vm-appbar">
  <div id="vm-brand"><div id="vm-logo" aria-hidden="true">›_</div><div id="vm-brandcopy"><strong>VM CONSOLE</strong><span>Temporary interactive workspace</span></div></div>
  <div id="vm-live"><i></i> SESSION ACTIVE</div>
</div>
<div id="vm-toolbar" role="toolbar" aria-label="Touch terminal controls">
  <div class="vm-keyrow"><span class="vm-toolbarlabel">Modifiers</span>
    <button class="vm-key vm-primary" data-mod="ctrl" aria-pressed="false">Ctrl</button>
    <button class="vm-key vm-primary" data-mod="alt" aria-pressed="false">Alt</button>
    <button class="vm-key" data-key="Escape">Esc</button>
    <button class="vm-key" data-key="Tab">Tab ↹</button>
    <button class="vm-key" data-key="Backspace">⌫</button>
    <button class="vm-key" data-key="Delete">Del</button>
  </div>
  <div class="vm-keyrow"><span class="vm-toolbarlabel">Navigate</span>
    <button class="vm-key" data-key="ArrowLeft">←</button>
    <button class="vm-key" data-key="ArrowDown">↓</button>
    <button class="vm-key" data-key="ArrowUp">↑</button>
    <button class="vm-key" data-key="ArrowRight">→</button>
    <button class="vm-key vm-wide" data-key="Home">Home</button>
    <button class="vm-key vm-wide" data-key="End">End</button>
    <button class="vm-key vm-wide" data-key="PageUp">PgUp</button>
    <button class="vm-key vm-wide" data-key="PageDown">PgDn</button>
  </div>
  <div class="vm-keyrow"><span class="vm-toolbarlabel">Quick</span>
    <button class="vm-key vm-danger" data-chord="ctrl+c">Ctrl+C</button>
    <button class="vm-key" data-chord="ctrl+d">Ctrl+D</button>
    <button class="vm-key" data-chord="ctrl+z">Ctrl+Z</button>
    <button class="vm-key" data-chord="ctrl+l">Ctrl+L</button>
    <button class="vm-key vm-primary" data-key="Enter">Enter ↵</button>
    <button class="vm-key" data-key=" ">Space</button>
  </div>
</div>
<div id="vm-footer"><span id="vm-keyhint">Tap a control, then continue typing in the terminal.</span><span><strong>Touch-ready</strong> · Responsive</span></div>
<script id="vm-modern-ui-script">
(function(){
  'use strict';
  var mods={ctrl:false,alt:false}, replaying=false;
  function terminalInput(){return document.querySelector('#terminal .xterm-helper-textarea')||document.querySelector('.xterm-helper-textarea')||document.querySelector('#terminal textarea')||document.querySelector('textarea');}
  function focusTerminal(){var el=terminalInput();if(el){el.focus({preventScroll:true});return el;}return null;}
  function keyEvent(target,type,key,options){var code=key===' '?'Space':(/^[a-z]$/i.test(key)?'Key'+key.toUpperCase():key);var event=new KeyboardEvent(type,{key:key,code:code,bubbles:true,cancelable:true,composed:true,ctrlKey:!!options.ctrlKey,altKey:!!options.altKey,shiftKey:!!options.shiftKey,metaKey:!!options.metaKey});replaying=true;target.dispatchEvent(event);replaying=false;}
  function pressKey(key,overrides){var el=focusTerminal();if(!el)return;var opts={ctrlKey:mods.ctrl,altKey:mods.alt,shiftKey:false,metaKey:false};if(overrides)Object.assign(opts,overrides);keyEvent(el,'keydown',key,opts);keyEvent(el,'keyup',key,opts);mods.ctrl=false;mods.alt=false;refreshMods();if(key==='Enter'||key==='Escape'||key==='Tab')setTimeout(focusTerminal,0);}
  function refreshMods(){document.querySelectorAll('[data-mod]').forEach(function(btn){var active=!!mods[btn.dataset.mod];btn.classList.toggle('vm-active',active);btn.setAttribute('aria-pressed',String(active));});var hint=document.getElementById('vm-keyhint');if(hint)hint.textContent=mods.ctrl||mods.alt?'Modifier armed — tap a key or type on your keyboard.':'Tap a control, then continue typing in the terminal.';}
  document.addEventListener('keydown',function(ev){if(replaying)return;var el=terminalInput();if(!el||document.activeElement!==el||(!mods.ctrl&&!mods.alt)||ev.key==='Control'||ev.key==='Alt'||ev.key==='Shift')return;ev.preventDefault();ev.stopImmediatePropagation();var opts={ctrlKey:mods.ctrl||ev.ctrlKey,altKey:mods.alt||ev.altKey,shiftKey:ev.shiftKey,metaKey:ev.metaKey};keyEvent(el,'keydown',ev.key,opts);keyEvent(el,'keyup',ev.key,opts);mods.ctrl=false;mods.alt=false;refreshMods();},true);
  document.addEventListener('click',function(ev){var btn=ev.target.closest('button[data-key],button[data-chord],button[data-mod]');if(!btn)return;ev.preventDefault();if(btn.dataset.mod){mods[btn.dataset.mod]=!mods[btn.dataset.mod];refreshMods();focusTerminal();return;}if(btn.dataset.chord){var bits=btn.dataset.chord.split('+'),key=bits.pop(),opts={ctrlKey:bits.indexOf('ctrl')!==-1,altKey:bits.indexOf('alt')!==-1,shiftKey:bits.indexOf('shift')!==-1,metaKey:false};pressKey(key,opts);return;}pressKey(btn.dataset.key);});
  function enhance(){var terminal=document.getElementById('terminal'),wrap=document.getElementById('vm-terminal-wrap'),bar=document.getElementById('vm-appbar'),toolbar=document.getElementById('vm-toolbar'),footer=document.getElementById('vm-footer');if(terminal&&!wrap){wrap=document.createElement('div');wrap.id='vm-terminal-wrap';wrap.className='vm-terminal-ready';terminal.parentNode.insertBefore(wrap,terminal);wrap.appendChild(terminal);}if(wrap&&bar&&toolbar){document.body.insertBefore(bar,wrap);document.body.insertBefore(toolbar,wrap);}if(footer&&footer.parentNode!==document.body)document.body.appendChild(footer);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();
  var observer=new MutationObserver(enhance);observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('resize',function(){var el=terminalInput();if(el)el.style.fontSize='16px';});
})();
</script>
`;

function inject(html) {
  let output = html;
  if (/<\/head>/i.test(output)) output = output.replace(/<\/head>/i, injectedHead + '</head>');
  else output = injectedHead + output;
  if (/<\/body>/i.test(output)) output = output.replace(/<\/body>/i, injectedBody + '</body>');
  else output += injectedBody;
  return output;
}

const server = http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  req._injectVmUi = req.method === 'GET' && (path === '/' || path.endsWith('/index.html'));
  proxy.web(req, res, { selfHandleResponse: req._injectVmUi }, (err) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Temporary terminal UI proxy error.');
    process.stderr.write('Proxy error: ' + err.message + '\\n');
  });
});

proxy.on('proxyReq', (proxyReq, req) => {
  if (req._injectVmUi) proxyReq.setHeader('accept-encoding', 'identity');
});

proxy.on('proxyRes', (proxyRes, req, res) => {
  if (!req._injectVmUi) return;
  const chunks = [];
  proxyRes.on('data', chunk => chunks.push(chunk));
  proxyRes.on('end', () => {
    const original = Buffer.concat(chunks).toString('utf8');
    const body = Buffer.from(inject(original), 'utf8');
    const headers = Object.assign({}, proxyRes.headers);
    delete headers['content-length'];
    delete headers['content-encoding'];
    delete headers.etag;
    headers['content-type'] = 'text/html; charset=utf-8';
    headers['content-length'] = String(body.length);
    res.writeHead(proxyRes.statusCode || 200, headers);
    res.end(body);
  });
});

proxy.on('error', err => process.stderr.write('Upstream proxy error: ' + err.message + '\\n'));
server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head, err => {
    if (err) socket.destroy();
  });
});
server.listen(listenPort, '127.0.0.1', () => {
  process.stdout.write('Modern VM terminal UI listening on 127.0.0.1:' + listenPort + '\\n');
});
