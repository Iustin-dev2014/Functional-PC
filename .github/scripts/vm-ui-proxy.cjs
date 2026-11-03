
'use strict';

const http = require('http');
const httpProxy = require('http-proxy');

const targetPort = Number(process.env.TTYD_PORT || 7681);
const listenPort = Number(process.env.VM_UI_PORT || 7682);

if (
  !Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535 ||
  !Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535
) {
  throw new Error('Invalid proxy port configuration.');
}

const proxy = httpProxy.createProxyServer({
  target: `http://127.0.0.1:${targetPort}`,
  ws: true,
  changeOrigin: true,
  xfwd: true,
  proxyTimeout: 30000,
  timeout: 30000
});

const injectedHead = String.raw`
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#080c14">
<style>
:root {
  color-scheme:dark;
  --bg:#080c14;
  --panel:#101827;
  --line:#28364c;
  --text:#eaf0fa;
  --muted:#8fa1bb;
}
*{box-sizing:border-box}
html,body{
  width:100%;height:100%;min-height:100%;
  margin:0;overflow:hidden;background:var(--bg);
  color:var(--text);
  font-family:Inter,system-ui,-apple-system,sans-serif
}
body{
  display:flex;flex-direction:column;
  padding-top:env(safe-area-inset-top);
  padding-bottom:env(safe-area-inset-bottom)
}
button{font:inherit;-webkit-tap-highlight-color:transparent}
#vm-appbar{
  flex:0 0 auto;min-height:56px;padding:9px 14px;
  display:flex;align-items:center;gap:12px;
  background:linear-gradient(110deg,#14223a,#0c1422);
  border-bottom:1px solid var(--line)
}
#vm-brand{display:flex;align-items:center;gap:10px;min-width:0}
#vm-logo{
  width:36px;height:36px;display:grid;place-items:center;
  flex-shrink:0;border-radius:11px;
  background:linear-gradient(145deg,#244675,#14243c);
  border:1px solid #42689e;color:#b9d5ff;
  font-weight:900;font-size:18px
}
#vm-brandcopy strong{display:block;font-size:13px;letter-spacing:.08em}
#vm-brandcopy span{display:block;margin-top:3px;color:var(--muted);font-size:10px}
#vm-live{
  margin-left:auto;padding:7px 10px;border:1px solid #285044;
  border-radius:999px;color:#8de7c0;background:#102820;
  font-size:10px;font-weight:800;white-space:nowrap
}
#vm-toolbar{
  flex:0 0 auto;display:flex;flex-direction:column;gap:7px;
  padding:9px 11px;background:#0d1420;border-bottom:1px solid var(--line)
}
.vm-keyrow,#vm-actions{
  display:flex;align-items:center;gap:7px;
  overflow-x:auto;padding:2px 0 4px;overscroll-behavior-x:contain
}
.vm-toolbarlabel{
  flex:0 0 auto;color:#7588a4;font-size:9px;
  font-weight:900;letter-spacing:.1em;text-transform:uppercase
}
.vm-key{
  flex:0 0 auto;min-width:43px;min-height:40px;padding:0 12px;
  border:1px solid #30415b;border-radius:10px;
  background:linear-gradient(180deg,#1b293d,#131d2d);
  color:#eaf1fc;font-size:12px;font-weight:700;
  touch-action:manipulation;user-select:none
}
.vm-key:active,.vm-key.active{background:#254a79;border-color:#80afff}
.vm-key.primary{color:#c9dfff;border-color:#41699d;background:#193452}
.vm-key.danger{color:#ffb9c1;border-color:#693b48}
.vm-key.wide{min-width:65px}
.vm-key.action{background:linear-gradient(145deg,#244b78,#172d4a);border-color:#527db4}
#vm-terminal-wrap{
  position:relative;flex:1 1 auto;min-height:0;width:100%;
  padding:11px;background:radial-gradient(ellipse at top,#14213a,#080c14 75%)
}
#vm-fullscreen{
  width:100%;height:100%;display:flex;flex-direction:column;min-height:0
}
#vm-terminal-slot{flex:1;min-height:0}
#terminal{
  width:100%!important;height:100%!important;min-height:0!important;
  overflow:hidden;border:1px solid #293951;border-radius:13px;
  background:#070b12!important;box-shadow:0 12px 45px #0007
}
#terminal .xterm{height:100%;padding:9px 7px}
#terminal .xterm-viewport{background:#070b12!important}
#terminal .xterm-helper-textarea{font-size:16px!important}
#vm-footer{
  flex:0 0 auto;display:flex;justify-content:space-between;
  align-items:center;gap:10px;padding:8px 13px;
  background:#0d1420;border-top:1px solid #263348;
  color:var(--muted);font-size:10px
}
#vm-status{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#vm-toast{
  position:fixed;z-index:99999;left:50%;
  bottom:calc(55px + env(safe-area-inset-bottom));
  transform:translateX(-50%);max-width:90%;
  padding:11px 17px;border:1px solid #45628b;
  border-radius:12px;background:#172943;color:white;
  font-size:12px;opacity:0;pointer-events:none;transition:opacity .2s
}
#vm-toast.visible{opacity:1}
#vm-fullscreen:fullscreen{background:var(--bg)}
@media(max-width:520px){
  #vm-appbar{min-height:51px;padding:7px 10px}
  #vm-logo{width:32px;height:32px}
  #vm-brandcopy strong{font-size:11px}
  #vm-brandcopy span{font-size:9px}
  #vm-live{padding:6px 7px;font-size:9px}
  #vm-toolbar{padding:7px;gap:5px}
  .vm-keyrow,#vm-actions{gap:6px}
  .vm-key{min-height:43px;min-width:43px;padding:0 10px}
  #vm-terminal-wrap{padding:6px}
  #terminal{border-radius:9px}
  #vm-footer{padding:7px 9px}
}
@media(max-height:500px){
  #vm-appbar{min-height:39px;padding:4px 9px}
  #vm-logo{width:27px;height:27px}
  #vm-toolbar{padding:4px 7px;gap:3px}
  .vm-key{min-height:32px}
  #vm-terminal-wrap{padding:4px}
  #vm-footer{padding:4px 8px}
}
</style>
`;

const injectedBody = String.raw`
<div id="vm-appbar">
  <div id="vm-brand">
    <div id="vm-logo">›_</div>
    <div id="vm-brandcopy">
      <strong>VM CONSOLE</strong>
      <span>Temporary Ubuntu workspace</span>
    </div>
  </div>
  <div id="vm-live">● SESSION ACTIVE</div>
</div>

<div id="vm-toolbar" role="toolbar" aria-label="Terminal controls">
  <div class="vm-keyrow">
    <span class="vm-toolbarlabel">Modifiers</span>
    <button class="vm-key primary" data-mod="ctrl">Ctrl</button>
    <button class="vm-key primary" data-mod="alt">Alt</button>
    <button class="vm-key" data-key="Escape">Esc</button>
    <button class="vm-key" data-key="Tab">Tab</button>
    <button class="vm-key" data-key="Backspace">⌫</button>
    <button class="vm-key" data-key="Delete">Del</button>
  </div>
  <div class="vm-keyrow">
    <span class="vm-toolbarlabel">Navigate</span>
    <button class="vm-key" data-key="ArrowLeft">←</button>
    <button class="vm-key" data-key="ArrowDown">↓</button>
    <button class="vm-key" data-key="ArrowUp">↑</button>
    <button class="vm-key" data-key="ArrowRight">→</button>
    <button class="vm-key wide" data-key="Home">Home</button>
    <button class="vm-key wide" data-key="End">End</button>
  </div>
  <div class="vm-keyrow">
    <span class="vm-toolbarlabel">Shortcuts</span>
    <button class="vm-key danger" data-chord="ctrl+c">Ctrl+C</button>
    <button class="vm-key" data-chord="ctrl+d">Ctrl+D</button>
    <button class="vm-key" data-chord="ctrl+z">Ctrl+Z</button>
    <button class="vm-key" data-chord="ctrl+l">Ctrl+L</button>
    <button class="vm-key primary" data-key="Enter">Enter ↵</button>
    <button class="vm-key" data-key=" ">Space</button>
  </div>
  <div id="vm-actions">
    <button class="vm-key action" id="vm-paste">📋 Paste</button>
    <button class="vm-key action" id="vm-copy">Copy</button>
    <button class="vm-key action" id="vm-fullscreen-btn">⛶ Fullscreen</button>
    <button class="vm-key" id="vm-exit-fullscreen">Exit fullscreen</button>
  </div>
</div>

<div id="vm-terminal-wrap">
  <div id="vm-fullscreen">
    <div id="vm-terminal-slot"></div>
  </div>
</div>

<div id="vm-footer">
  <span id="vm-status">Ready · Tap terminal to type</span>
  <span>Touch optimized</span>
</div>
<div id="vm-toast" role="status" aria-live="polite"></div>

<script>
(function(){
'use strict';

var mods={ctrl:false,alt:false};
var toastTimer=null;

function terminalInput(){
  return document.querySelector('#terminal .xterm-helper-textarea')||
    document.querySelector('.xterm-helper-textarea')||
    document.querySelector('#terminal textarea');
}

function status(message){
  var el=document.getElementById('vm-status');
  if(el)el.textContent=message;
}

function toast(message){
  var el=document.getElementById('vm-toast');
  if(!el)return;
  el.textContent=message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){el.classList.remove('visible');},2200);
}

function focusTerminal(){
  var el=terminalInput();
  if(el){el.focus({preventScroll:true});return el;}
  return null;
}

function resetMods(){
  mods.ctrl=false;
  mods.alt=false;
  document.querySelectorAll('[data-mod]').forEach(function(button){
    button.classList.remove('active');
    button.setAttribute('aria-pressed','false');
  });
}

function sendKey(key,options){
  var el=focusTerminal();
  if(!el){toast('Terminal is not ready.');return;}

  var opts=options||{
    ctrlKey:mods.ctrl,
    altKey:mods.alt,
    shiftKey:false,
    metaKey:false
  };

  var code=key===' '?'Space':
    (/^[a-z]$/i.test(key)?'Key'+key.toUpperCase():key);

  function dispatch(type){
    el.dispatchEvent(new KeyboardEvent(type,{
      key:key,code:code,bubbles:true,cancelable:true,composed:true,
      ctrlKey:!!opts.ctrlKey,altKey:!!opts.altKey,
      shiftKey:!!opts.shiftKey,metaKey:!!opts.metaKey
    }));
  }

  dispatch('keydown');
  dispatch('keyup');
  resetMods();
  status('Key sent: '+key);

  if(['Enter','Escape','Tab'].indexOf(key)!==-1){
    setTimeout(focusTerminal,50);
  }
}

function sendText(value){
  if(!value)return;
  var el=focusTerminal();
  if(!el){toast('Terminal is not ready.');return;}

  try{
    var transfer=new DataTransfer();
    transfer.setData('text/plain',value);
    var event=new ClipboardEvent('paste',{
      bubbles:true,cancelable:true,clipboardData:transfer
    });
    el.dispatchEvent(event);
    status('Clipboard text inserted.');
    toast('Text inserted.');
  }catch(error){
    toast('Paste is unavailable in this browser.');
  }
}

async function pasteClipboard(){
  try{
    if(!navigator.clipboard||!navigator.clipboard.readText){
      toast('Clipboard unavailable. Use browser paste instead.');
      return;
    }
    var value=await navigator.clipboard.readText();
    if(!value){toast('Clipboard is empty.');return;}
    sendText(value);
  }catch(error){
    toast('Clipboard permission denied.');
  }
}

async function copySelection(){
  var selection=window.getSelection();
  var value=selection?selection.toString():'';

  if(!value){
    toast('Select terminal text first.');
    return;
  }

  try{
    await navigator.clipboard.writeText(value);
    toast('Copied to clipboard.');
  }catch(error){
    toast('Clipboard permission denied.');
  }
}

function updateModifiers(){
  document.querySelectorAll('[data-mod]').forEach(function(button){
    var active=!!mods[button.dataset.mod];
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
}

document.addEventListener('click',function(event){
  var button=event.target.closest('button');
  if(!button)return;

  if(button.dataset.mod){
    mods[button.dataset.mod]=!mods[button.dataset.mod];
    updateModifiers();
    focusTerminal();
    return;
  }

  if(button.dataset.chord){
    var bits=button.dataset.chord.split('+');
    var key=bits.pop();
    sendKey(key,{
      ctrlKey:bits.indexOf('ctrl')!==-1,
      altKey:bits.indexOf('alt')!==-1,
      shiftKey:bits.indexOf('shift')!==-1,
      metaKey:false
    });
    return;
  }

  if(button.dataset.key!==undefined){
    sendKey(button.dataset.key);
    return;
  }

  if(button.id==='vm-paste')pasteClipboard();
  if(button.id==='vm-copy')copySelection();

  if(button.id==='vm-fullscreen-btn'){
    var container=document.getElementById('vm-fullscreen');
    if(container&&container.requestFullscreen){
      container.requestFullscreen().then(function(){
        toast('Fullscreen enabled.');
      }).catch(function(){
        toast('Fullscreen request blocked.');
      });
    }else{
      toast('Fullscreen unavailable in this browser.');
    }
  }

  if(button.id==='vm-exit-fullscreen'&&document.fullscreenElement){
    document.exitFullscreen();
  }
});

document.addEventListener('keydown',function(event){
  if(event.key==='Control'||event.key==='Alt')return;
  if(!mods.ctrl&&!mods.alt)return;

  var el=terminalInput();
  if(!el||document.activeElement!==el)return;

  event.preventDefault();
  event.stopImmediatePropagation();

  sendKey(event.key,{
    ctrlKey:mods.ctrl||event.ctrlKey,
    altKey:mods.alt||event.altKey,
    shiftKey:event.shiftKey,
    metaKey:event.metaKey
  });
},true);

function enhance(){
  var terminal=document.getElementById('terminal');
  var slot=document.getElementById('vm-terminal-slot');

  if(terminal&&slot&&terminal.parentNode!==slot){
    slot.appendChild(terminal);
  }

  if(terminal){
    terminal.style.width='100%';
    terminal.style.height='100%';
  }
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',enhance);
}else{
  enhance();
}

var observer=new MutationObserver(enhance);
observer.observe(document.documentElement,{childList:true,subtree:true});

document.addEventListener('fullscreenchange',function(){
  if(!document.fullscreenElement)toast('Fullscreen closed.');
  setTimeout(enhance,100);
});

window.addEventListener('resize',function(){
  setTimeout(enhance,100);
});

enhance();
})();
</script>
`;

function inject(html){
  let output=html;

  if(/<\/head>/i.test(output)){
    output=output.replace(/<\/head>/i,injectedHead+'</head>');
  }else{
    output=injectedHead+output;
  }

  if(/<\/body>/i.test(output)){
    output=output.replace(/<\/body>/i,injectedBody+'</body>');
  }else{
    output+=injectedBody;
  }

  return output;
}

const server=http.createServer((req,res)=>{
  const path=(req.url||'/').split('?')[0];

  req._injectVmUi=req.method==='GET'&&
    (path==='/'||path.endsWith('/index.html'));

  proxy.web(req,res,{
    selfHandleResponse:req._injectVmUi
  },err=>{
    if(!res.headersSent){
      res.writeHead(502,{
        'content-type':'text/plain; charset=utf-8',
        'cache-control':'no-store'
      });
    }
    res.end('Temporary terminal UI proxy error.');
    process.stderr.write('Proxy error: '+err.message+'\n');
  });
});

proxy.on('proxyReq',(proxyReq,req)=>{
  if(req._injectVmUi){
    proxyReq.setHeader('accept-encoding','identity');
  }
});

proxy.on('proxyRes',(proxyRes,req,res)=>{
  if(!req._injectVmUi)return;

  const chunks=[];

  proxyRes.on('data',chunk=>chunks.push(chunk));

  proxyRes.on('end',()=>{
    try{
      const original=Buffer.concat(chunks).toString('utf8');
      const body=Buffer.from(inject(original),'utf8');
      const headers=Object.assign({},proxyRes.headers);

      delete headers['content-length'];
      delete headers['content-encoding'];
      delete headers.etag;
      delete headers['content-security-policy'];

      headers['content-type']='text/html; charset=utf-8';
      headers['content-length']=String(body.length);
      headers['cache-control']='no-store';

      res.writeHead(proxyRes.statusCode||200,headers);
      res.end(body);
    }catch(error){
      process.stderr.write('HTML injection error: '+error.message+'\n');
      if(!res.headersSent)res.writeHead(502);
      res.end('Could not prepare terminal interface.');
    }
  });

  proxyRes.on('error',error=>{
    process.stderr.write('Upstream response error: '+error.message+'\n');
    if(!res.headersSent)res.writeHead(502);
    res.end('Upstream response failed.');
  });
});

proxy.on('error',error=>{
  process.stderr.write('Upstream proxy error: '+error.message+'\n');
});

server.on('upgrade',(req,socket,head)=>{
  proxy.ws(req,socket,head,error=>{
    if(error)socket.destroy();
  });
});

server.listen(listenPort,'127.0.0.1',()=>{
  process.stdout.write(
    'Modern VM terminal UI listening on 127.0.0.1:'+listenPort+'\n'
  );
});

server.on('clientError',(error,socket)=>{
  process.stderr.write('Client HTTP error: '+error.message+'\n');
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
