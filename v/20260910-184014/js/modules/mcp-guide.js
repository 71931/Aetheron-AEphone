/* ===== MCP 接入向导（AEphone 内置 · 卡片式） =====
   形态：三张独立小卡片（瑞幸 / 麦当劳 / 高德），点哪张配哪张；
        也支持 URL 一次性导入（#mcp=<urlencode(base64(JSON))>）自动填好并保存。
   入口：桌面 MCP 图标 / 设置 → 接口服务 → MCP 接入
   全文无图形符号，纯黑白灰。 */
(function () {
  'use strict';
  var STORE_KEY = 'AE_MCP_CREDS_V1';
  var KEYMAP = { luckin: 'luckin', mcd: 'mcd', amap: 'amap' };

  var SVG = {
    luckin: '<svg viewBox="0 0 24 24"><path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M4 22h13"/></svg>',
    mcd: '<svg viewBox="0 0 24 24"><path d="M3 20V9.5a3 3 0 0 1 5.5-1.7L12 12l3.5-4.2A3 3 0 0 1 21 9.5V20"/><path d="M3 20h18"/></svg>',
    amap: '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>'
  };

  var SERVICES = [
    { key: 'luckin', name: '瑞幸咖啡', desc: '门店 / 菜单 / 下单 / 订单',
      entry: 'https://open.luckincoffee.com/mcp', ph: '粘贴瑞幸 Token',
      steps: '新窗口里点右上角「登录」：先勾下方的协议（不勾按钮是灰的），再填手机号和验证码——填用户自己的手机号就行。登录后复制配置块里的 Token 回来粘上。',
      clientNote: '工具数 8：查门店、搜商品、下单、查订单、取消订单。' },
    { key: 'mcd', name: '麦当劳', desc: '点餐 / 领券 / 积分 / 抽奖',
      entry: 'https://open.mcd.cn/mcp/doc', ph: '粘贴麦当劳 Token',
      steps: '新窗口里点右上角「登录」，用手机号加验证码完成验证（用户自己的号即可）。回来按钮会变成「控制台」，点「激活」→「同意」→「一键复制」。',
      clientNote: '工具数 32：点餐 13、互动 4、领券 3、商城积分 6、主题活动 5。' },
    { key: 'amap', name: '高德地图', desc: '路线 / 周边 / 地名转坐标',
      entry: 'https://lbs.amap.com/api/mcp-server/create-project-and-key', ph: '粘贴高德 Key',
      steps: '新窗口里登录高德开放平台（用户自己的账号）。进「应用管理」，新建应用后点「添加 Key」，服务平台必须选「Web 服务」，复制那串 Key。',
      clientNote: '工具数 9：路线规划、周边搜索、地理编码等。' }
  ];

  var FAQ = [
    ['状态 401', 'Token 写错或过期。确认粘的是 Bearer 后面那串、前后没有空格；回平台重新领一次。'],
    ['状态 429', '调用太频繁。麦当劳上限每分钟 600 次，等一分钟再试。'],
    ['高德报 INVALID_USER_KEY', 'Key 的「服务平台」选错了，必须选 Web 服务。'],
    ['保存后没反应', '客户端要完全退出进程再打开，关窗口不算。'],
    ['找不到 MCP 入口', '客户端设置页搜索框敲 MCP 三个字母，基本都能定位。'],
    ['为什么让用户自己去官方页登录', '官方平台的登录只能由账号本人完成，验证码也只会发到本人手机上。所以本页只做引导，不经手任何手机号、账号和密码，也没有代替登录的能力。'],
    ['换个人来用要重填吗', '要。Token 只存在各人自己设备的浏览器里，换设备或换浏览器都得重新领一次；同账号在不同设备各领一份即可。'],
    ['连上了 AI 不动手', '客户端要处于工具调用 / Agent 模式。测试就说：帮我找一下附近的瑞幸门店。'],
    ['瑞幸改杯型糖度报错', '官方接口自身缺陷，按默认规格下单即可。']
  ];

  function loadCreds() {
    try { var o = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; }
    catch (e) { return {}; }
  }
  function saveCreds(o) { try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) {} }
  var creds = loadCreds();
  var overlay = null, currentKey = null;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function val(k) { return String(creds[k] || '').replace(/^\s+|\s+$/g, ''); }

  function blockFor(s, v) {
    var token = v || ('这里换成你的' + (s.key === 'amap' ? '高德Key' : s.name + 'Token'));
    if (s.key === 'amap') {
      return '    "amap-maps": {\n      "type": "streamablehttp",\n      "url": "https://mcp.amap.com/mcp?key=' + token + '"\n    }';
    }
    var id = s.key === 'luckin' ? 'luckin-coffee' : 'mcd-china';
    var url = s.key === 'luckin' ? 'https://gwmcp.lkcoffee.com/order/user/mcp' : 'https://mcp.mcd.cn';
    return '    "' + id + '": {\n      "type": "streamablehttp",\n      "url": "' + url + '",\n      "headers": { "Authorization": "Bearer ' + token + '" }\n    }';
  }

  function jsonFor(keys, includeBlank) {
    var parts = [];
    for (var i = 0; i < SERVICES.length; i++) {
      var s = SERVICES[i];
      if (keys && keys.indexOf(s.key) < 0) { continue; }
      var v = val(s.key);
      if (!v && !includeBlank) { continue; }
      parts.push(blockFor(s, v));
    }
    if (!parts.length) { return ''; }
    return '{\n  "mcpServers": {\n' + parts.join(',\n') + '\n  }\n}';
  }

  function copyText(text, ok, fail) {
    var legacy = function () {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(ta); ta.select();
        if (ta.setSelectionRange) { ta.setSelectionRange(0, text.length); }
        var done = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        if (done) { ok(); return; }
      } catch (e) {}
      fail();
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { ok(); }, legacy); return;
      }
    } catch (e) {}
    legacy();
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) { return; }
    t.textContent = msg; t.classList.add('show');
    if (toast._t) { clearTimeout(toast._t); }
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }

  /* ---------- 视图一：卡片列表 ---------- */
  function listHtml() {
    var cards = '';
    for (var i = 0; i < SERVICES.length; i++) {
      var s = SERVICES[i], on = !!val(s.key);
      cards += '<div class="mcp-svc-card" data-key="' + s.key + '">' +
        '<div class="item-icon">' + SVG[s.key] + '</div>' +
        '<div class="item-body">' +
          '<div class="item-title">' + s.name + '</div>' +
          '<div class="item-sub">' + s.desc + '</div>' +
        '</div>' +
        '<div class="mcp-svc-state' + (on ? ' on' : '') + '">' + (on ? '已配置' : '未配置') + '</div>' +
        '<div class="mcp-arrow">' + SVG.arrow + '</div>' +
      '</div>';
    }
    var faq = '';
    for (var j = 0; j < FAQ.length; j++) {
      faq += '<div class="mcp-faq-item"><b>' + FAQ[j][0] + '</b>：' + FAQ[j][1] + '</div>';
    }
    return '<div class="settings-header">' +
        '<button class="settings-close" id="mcpClose" type="button">' + SVG.back + '</button>' +
        '<span class="title">MCP 服务</span>' +
      '</div>' +
      '<div class="mcp-scroll">' +
        '<div class="mcp-lead">三张卡片，用哪家点哪家。领 Token 时，用户用自己的手机号去官方页登录——本页不收手机号、不存账号密码，Token 也只留在用户自己这台设备里。</div>' +
        '<div class="mcp-cards">' + cards + '</div>' +
        '<button class="mcp-ghost" id="mcpCopyAll" type="button">复制全部配置（只含已填的）</button>' +
        '<div class="mcp-faq-head" id="mcpFaqHead">出问题看这里<span id="mcpFaqArrow">展开</span></div>' +
        '<div id="mcpFaqBody" hidden>' + faq + '</div>' +
        '<div class="mcp-note">Token 等于账号身份，只保存在本机浏览器，不上传、站点也看不到。谁填错或外发了，回平台重领一次即可作废旧 Token。</div>' +
      '</div>';
  }

  /* ---------- 视图二：单家详情 ---------- */
  function detailHtml(s) {
    var v = val(s.key), on = !!v;
    return '<div class="settings-header">' +
        '<button class="settings-close" id="mcpBack" type="button">' + SVG.back + '</button>' +
        '<span class="title">' + s.name + '</span>' +
      '</div>' +
      '<div class="mcp-scroll">' +
        '<div class="mcp-detail-head">' +
          '<div class="item-icon">' + SVG[s.key] + '</div>' +
          '<div class="item-body"><div class="item-title">' + s.name + '</div>' +
          '<div class="item-sub">' + s.clientNote + '</div></div>' +
        '</div>' +
        '<div class="mcp-step">' +
          '<div class="mcp-step-title"><span class="mcp-num">1</span>去官方页，用自己的手机号登录</div>' +
          '<button class="mcp-primary" id="mcpEntry" type="button">打开 ' + s.name + ' 官方页</button>' +
          '<div class="mcp-hint">' + s.steps + '</div>' +
          '<div class="mcp-hint">手机号和验证码是在官方页里填的，本页不收集、也拿不到。</div>' +
        '</div>' +
        '<div class="mcp-step">' +
          '<div class="mcp-step-title"><span class="mcp-num">2</span>粘到这里</div>' +
          '<input class="mcp-input" id="mcpIn" type="text" autocomplete="off" spellcheck="false" placeholder="' + s.ph + '">' +
        '</div>' +
        '<div class="mcp-step">' +
          '<div class="mcp-step-title"><span class="mcp-num">3</span>复制配置，去客户端粘贴</div>' +
          '<button class="mcp-primary" id="mcpCopyOne" type="button">复制' + s.name + '配置</button>' +
          '<pre class="mcp-preview" id="mcpPreview"></pre>' +
          '<div class="mcp-hint">粘进客户端后完全退出进程再打开，回列表看到「已配置」就成了。</div>' +
        '</div>' +
        '<button class="mcp-ghost" id="mcpClear" type="button"' + (on ? '' : ' hidden') + '>清除本机保存的这份</button>' +
        '<div class="mcp-note">Token 只存在这台设备的浏览器里，不上传、站点看不到；重新粘贴会覆盖旧的，清除后要重新粘。</div>' +
      '</div>';
  }

  function buildDom() {
    var ov = document.createElement('div');
    ov.className = 'mcp-overlay';
    ov.id = 'mcpOverlay';
    ov.innerHTML =
      '<div class="mcp-panel"><div class="mcp-view" id="mcpListView">' + listHtml() + '</div>' +
      '<div class="mcp-view" id="mcpDetailView" hidden></div></div>';
    document.body.appendChild(ov);
    return ov;
  }

  function refreshList() {
    var lv = document.getElementById('mcpListView');
    lv.innerHTML = listHtml();
    bindList();
  }

  function bindList() {
    var cards = document.querySelectorAll('#mcpListView .mcp-svc-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].addEventListener('click', function () { openDetail(this.getAttribute('data-key')); });
    }
    var close = document.getElementById('mcpClose');
    if (close) { close.addEventListener('click', close); }
    var all = document.getElementById('mcpCopyAll');
    if (all) {
      all.addEventListener('click', function () {
        var txt = jsonFor(null, false);
        if (!txt) { toast('先配一家再复制'); return; }
        copyText(txt, function () { toast('已复制，去客户端粘贴'); },
          function () { toast('复制失败，进单家详情长按文本复制'); });
      });
    }
    var fh = document.getElementById('mcpFaqHead');
    if (fh) {
      fh.addEventListener('click', function () {
        var body = document.getElementById('mcpFaqBody'), arrow = document.getElementById('mcpFaqArrow');
        if (body.hidden) { body.hidden = false; arrow.textContent = '收起'; }
        else { body.hidden = true; arrow.textContent = '展开'; }
      });
    }
  }

  function openDetail(key) {
    var s = null;
    for (var i = 0; i < SERVICES.length; i++) { if (SERVICES[i].key === key) { s = SERVICES[i]; } }
    if (!s) { return; }
    currentKey = key;
    var dv = document.getElementById('mcpDetailView');
    dv.innerHTML = detailHtml(s);
    dv.hidden = false;
    document.getElementById('mcpListView').hidden = true;
    dv.scrollTop = 0;
    var sc = dv.querySelector('.mcp-scroll');
    if (sc) { sc.scrollTop = 0; }

    document.getElementById('mcpBack').addEventListener('click', function () {
      dv.hidden = true;
      document.getElementById('mcpListView').hidden = false;
      refreshList();
      currentKey = null;
    });
    document.getElementById('mcpEntry').addEventListener('click', function () {
      try { window.open(s.entry, '_blank'); } catch (e) { location.href = s.entry; }
    });
    var inp = document.getElementById('mcpIn');
    if (val(key)) { inp.value = val(key); }
    inp.addEventListener('input', function () {
      creds[key] = inp.value; saveCreds(creds);
      var c2 = document.getElementById('mcpClear');
      if (c2) { c2.hidden = !val(key); }
      renderPreview();
    });
    document.getElementById('mcpCopyOne').addEventListener('click', function () {
      var v = val(key);
      if (!v) { toast('先把 Token 粘进来'); return; }
      var btn = this;
      copyText(jsonFor([key], false), function () {
        btn.textContent = '已复制'; toast('已复制，去客户端粘贴');
        setTimeout(function () { btn.textContent = '复制' + s.name + '配置'; }, 1800);
      }, function () { toast('复制失败，长按下面文本手动复制'); });
    });
    var clr = document.getElementById('mcpClear');
    if (clr) {
      clr.addEventListener('click', function () {
        if (!window.confirm('清除后要重新粘贴 Token 才能用，确定清除？')) { return; }
        delete creds[key]; saveCreds(creds);
        openDetail(key);
        toast('已清除本机保存的 Token');
      });
    }
    renderPreview();
  }

  function renderPreview() {
    var pre = document.getElementById('mcpPreview');
    if (!pre || !currentKey) { return; }
    pre.textContent = jsonFor([currentKey], true);
  }

  /* ---------- 一次性导入： #mcp=<urlencode(base64)> ---------- */
  function b64ToUtf8(b64) {
    var bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    try {
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) { return decodeURIComponent(escape(bin)); }
  }

  function tryImportFromHash() {
    var h = location.hash || '';
    var i = h.indexOf('mcp=');
    if (i < 0) { return null; }
    var raw = h.slice(i + 4).split('&')[0];
    var obj;
    try { obj = JSON.parse(b64ToUtf8(decodeURIComponent(raw))); }
    catch (e) { return { bad: true }; }
    if (!obj || typeof obj !== 'object') { return { bad: true }; }
    var n = 0;
    for (var k in KEYMAP) {
      if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k]) {
        creds[k] = String(obj[k]).replace(/^\s+|\s+$/g, ''); n++;
      }
    }
    if (n) {
      saveCreds(creds);
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
    }
    return { count: n };
  }

  function open() {
    if (!overlay) { overlay = buildDom(); bindList(); }
    refreshList();
    document.getElementById('mcpDetailView').hidden = true;
    document.getElementById('mcpListView').hidden = false;
    overlay.classList.add('open');
  }
  function close() { if (overlay) { overlay.classList.remove('open'); } }

  window.AE_openMcpGuide = open;

  function boot() {
    var r = null;
    try { r = tryImportFromHash(); } catch (e) {}
    overlay = buildDom();
    bindList();
    if (r && r.count) { open(); toast('已自动填好 ' + r.count + ' 家，点卡片就能复制'); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
