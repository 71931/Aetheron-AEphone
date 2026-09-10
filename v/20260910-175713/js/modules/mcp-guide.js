/* ===== MCP 接入向导（AEphone 内置） =====
   入口：桌面 MCP 图标 / 设置 → 接口服务 → MCP 接入
   逻辑：粘贴 Token → 生成 JSON → 一键复制 → 交给客户端。
   说明：全文不使用图形符号，纯黑白灰，与 AEphone 视觉一致。 */
(function () {
  'use strict';
  var STORE_KEY = 'AE_MCP_CREDS_V1';

  var SVG = {
    luckin: '<svg viewBox="0 0 24 24"><path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M4 22h13"/></svg>',
    mcd: '<svg viewBox="0 0 24 24"><path d="M3 20V9.5a3 3 0 0 1 5.5-1.7L12 12l3.5-4.2A3 3 0 0 1 21 9.5V20"/><path d="M3 20h18"/></svg>',
    amap: '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>'
  };

  var SERVICES = [
    { key: 'luckin', name: '瑞幸咖啡', desc: '门店 / 菜单 / 下单 / 订单', url: 'https://open.luckincoffee.com/mcp',
      ph: '粘贴瑞幸 Token', label: '瑞幸Token',
      hint: '打开后点右上角「登录」，输手机号加验证码；先勾选下方协议，否则登录按钮是灰的。登录后复制配置块里的 Token。' },
    { key: 'mcd', name: '麦当劳', desc: '点餐 / 领券 / 积分 / 抽奖', url: 'https://open.mcd.cn/mcp/doc',
      ph: '粘贴麦当劳 Token', label: '麦当劳Token',
      hint: '点右上角「登录」，在登录页做完手机号验证；回来把「登录」换成「控制台」，点「激活」「同意」，再点「一键复制」。' },
    { key: 'amap', name: '高德地图', desc: '路线 / 周边 / 地名转坐标', url: 'https://lbs.amap.com/api/mcp-server/create-project-and-key',
      ph: '粘贴高德 Key', label: '高德Key',
      hint: '控制台进「应用管理」，创建新应用后「添加 Key」，服务平台必须选 Web 服务，然后复制 Key。' }
  ];

  var FAQ = [
    ['状态 401', 'Token 写错或已过期。确认填的是 Bearer 后面那一串、前后没有多余空格；回平台重新登录领一次。'],
    ['状态 429', '调用太频繁。麦当劳上限每分钟 600 次，等一分钟再试。'],
    ['高德报 INVALID_USER_KEY', 'Key 的「服务平台」选错了，必须选 Web 服务。'],
    ['保存后没反应', '客户端没重启。要完全退出进程再打开，关窗口不算。'],
    ['找不到 MCP 入口', '在客户端设置页的搜索框里敲 MCP 三个字母，基本都能定位。'],
    ['连上了但 AI 不动手', '客户端要处于工具调用 / Agent 模式。测试直接说：帮我找一下附近的瑞幸门店。'],
    ['瑞幸改杯型糖度报错', '官方接口自身缺陷，按默认规格下单即可。']
  ];

  var state = { open: false };

  function loadCreds() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var o = raw ? JSON.parse(raw) : {};
      return o && typeof o === 'object' ? o : {};
    } catch (e) { return {}; }
  }
  function saveCreds(o) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) {}
  }
  var creds = loadCreds();

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function jsonFor(includeBlank) {
    var parts = [];
    for (var i = 0; i < SERVICES.length; i++) {
      var s = SERVICES[i];
      var v = (creds[s.key] || '').replace(/^\s+|\s+$/g, '');
      if (!v && !includeBlank) { continue; }
      var val = v || ('这里换成你的' + s.label);
      if (s.key === 'amap') {
        parts.push('    "' + s.key + '-maps": {\n' +
                   '      "type": "streamablehttp",\n' +
                   '      "url": "https://mcp.amap.com/mcp?key=' + val + '"\n' +
                   '    }');
      } else if (s.key === 'luckin') {
        parts.push('    "luckin-coffee": {\n' +
                   '      "type": "streamablehttp",\n' +
                   '      "url": "https://gwmcp.lkcoffee.com/order/user/mcp",\n' +
                   '      "headers": { "Authorization": "Bearer ' + val + '" }\n' +
                   '    }');
      } else {
        parts.push('    "mcd-china": {\n' +
                   '      "type": "streamablehttp",\n' +
                   '      "url": "https://mcp.mcd.cn",\n' +
                   '      "headers": { "Authorization": "Bearer ' + val + '" }\n' +
                   '    }');
      }
    }
    if (!parts.length) { return ''; }
    return '{\n  "mcpServers": {\n' + parts.join(',\n') + '\n  }\n}';
  }

  function copyText(text, ok, fail) {
    var legacy = function () {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        if (ta.setSelectionRange) { ta.setSelectionRange(0, text.length); }
        var done = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        if (done) { ok(); return; }
      } catch (e) {}
      fail();
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { ok(); }, legacy);
        return;
      }
    } catch (e) {}
    legacy();
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) { return; }
    t.textContent = msg;
    t.classList.add('show');
    if (toast._t) { clearTimeout(toast._t); }
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }

  function buildDom() {
    var rows = '';
    for (var i = 0; i < SERVICES.length; i++) {
      var s = SERVICES[i];
      rows += '<div class="mcp-row">' +
        '<div class="mcp-row-head">' +
          '<div class="item-icon">' + SVG[s.key] + '</div>' +
          '<div class="item-body"><div class="item-title">' + s.name + '</div>' +
          '<div class="item-sub">' + s.desc + '</div></div>' +
          '<button type="button" class="mcp-go" data-url="' + s.url + '">去领取</button>' +
        '</div>' +
        '<input class="mcp-input" id="mcpIn_' + s.key + '" type="text" autocomplete="off" spellcheck="false" placeholder="' + s.ph + '">' +
        '<div class="mcp-hint">' + s.hint + '</div>' +
      '</div>';
    }

    var faq = '';
    for (var j = 0; j < FAQ.length; j++) {
      faq += '<div class="mcp-faq-item"><b>' + FAQ[j][0] + '</b>：' + FAQ[j][1] + '</div>';
    }

    var html =
      '<div class="mcp-panel">' +
        '<div class="settings-header">' +
          '<button class="settings-close" id="mcpClose" type="button">' +
            '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>' +
          '</button>' +
          '<span class="title">MCP 接入</span>' +
        '</div>' +
        '<div class="mcp-scroll">' +
          '<div class="mcp-lead">三步走完：领 Token、复制配置、粘进客户端。不用手写 JSON，也不用装东西。</div>' +

          '<div class="mcp-step">' +
            '<div class="mcp-step-title"><span class="mcp-num">1</span>领 Token，用哪个填哪个</div>' +
            '<div class="group-card">' + rows + '</div>' +
          '</div>' +

          '<div class="mcp-step">' +
            '<div class="mcp-step-title"><span class="mcp-num">2</span>复制配置</div>' +
            '<div class="mcp-actions">' +
              '<button class="mcp-primary" id="mcpCopy" type="button">复制配置（只含已填的）</button>' +
              '<button class="mcp-ghost" id="mcpCopyBlank" type="button">复制空白模板</button>' +
            '</div>' +
            '<pre class="mcp-preview" id="mcpPreview"></pre>' +
          '</div>' +

          '<div class="mcp-step">' +
            '<div class="mcp-step-title"><span class="mcp-num">3</span>粘进客户端</div>' +
            '<div class="mcp-tip">打开你的客户端（Cherry Studio / Cursor / TRAE / Claude Desktop 等），进 <b>设置</b>，搜索框敲 <b>MCP</b>，选「添加服务器」或「从 JSON 导入」，把配置粘进去保存。<br>' +
            '然后<b>完全退出客户端进程再打开</b>，关窗口不算。<br>' +
            '回到 MCP 列表看状态：显示<b>已连接</b>就成了。工具数参考：瑞幸 8、麦当劳 32、高德 9。</div>' +
          '</div>' +

          '<div class="mcp-faq-head" id="mcpFaqHead">出问题看这里<span id="mcpFaqArrow">展开</span></div>' +
          '<div id="mcpFaqBody" hidden>' + faq + '</div>' +

          '<div class="mcp-note">Token 等于你的账号身份，别发群里、别截图外发。填错或泄露了，回平台重新领一次即可作废旧 Token。</div>' +
        '</div>' +
      '</div>';

    var ov = document.createElement('div');
    ov.className = 'mcp-overlay';
    ov.id = 'mcpOverlay';
    ov.innerHTML = html;
    document.body.appendChild(ov);
    return ov;
  }

  var overlay = null;

  function renderPreview() {
    var pre = document.getElementById('mcpPreview');
    if (!pre) { return; }
    var txt = jsonFor(true);
    pre.textContent = txt;
  }

  function init() {
    overlay = buildDom();

    document.getElementById('mcpClose').addEventListener('click', close);

    var goBtns = overlay.querySelectorAll('.mcp-go');
    for (var i = 0; i < goBtns.length; i++) {
      goBtns[i].addEventListener('click', function () {
        var u = this.getAttribute('data-url');
        try { window.open(u, '_blank'); } catch (e) { location.href = u; }
      });
    }

    for (var k = 0; k < SERVICES.length; k++) {
      (function (s) {
        var el = document.getElementById('mcpIn_' + s.key);
        if (creds[s.key]) { el.value = creds[s.key]; }
        el.addEventListener('input', function () {
          creds[s.key] = el.value;
          saveCreds(creds);
          renderPreview();
        });
      })(SERVICES[k]);
    }

    document.getElementById('mcpCopy').addEventListener('click', function () {
      var txt = jsonFor(false);
      if (!txt) { toast('先粘贴至少一个 Token'); return; }
      var btn = this;
      copyText(txt, function () {
        btn.textContent = '已复制';
        toast('已复制，去客户端粘贴');
        setTimeout(function () { btn.textContent = '复制配置（只含已填的）'; }, 1800);
      }, function () {
        toast('复制失败，长按下方文本手动复制');
      });
    });

    document.getElementById('mcpCopyBlank').addEventListener('click', function () {
      var txt = jsonFor(true);
      copyText(txt, function () { toast('空白模板已复制'); },
        function () { toast('复制失败，长按下方文本手动复制'); });
    });

    document.getElementById('mcpFaqHead').addEventListener('click', function () {
      var body = document.getElementById('mcpFaqBody');
      var arrow = document.getElementById('mcpFaqArrow');
      if (body.hidden) { body.hidden = false; arrow.textContent = '收起'; }
      else { body.hidden = true; arrow.textContent = '展开'; }
    });

    renderPreview();
  }

  function open() {
    if (!overlay) { init(); }
    renderPreview();
    overlay.classList.add('open');
    state.open = true;
  }
  function close() {
    if (overlay) { overlay.classList.remove('open'); }
    state.open = false;
  }

  window.AE_openMcpGuide = open;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
