/* ===== AI 助手（联网版）· AEphone 内置 =====
   形态：桌面「AI」图标 / 设置 → 接口服务 → AI 助手 打开。
   能力：填一次自己的模型钥匙（存本机），之后直接对话；开联网后 AI 会自己上网查资料再回答。
   联网三种走法：智谱 web_search / 通义 enable_search / Kimi 内置 $web_search；
   其他服务（DeepSeek、硅基流动、自定义）走独立搜索接口（博查 / Tavily）。
   全文无图形符号、无 emoji，纯黑白灰。 */
(function () {
  'use strict';

  var CFG_KEY = 'AE_AI_CFG_V1';
  var LOG_KEY = 'AE_AI_LOG_V1';
  var STYLE_ID = 'ae-ai-style';

  /* ---------------- 服务与搜索接口 ---------------- */
  var PROVIDERS = [
    { key: 'zhipu', name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash',
      search: 'builtin', sign: 'https://open.bigmodel.cn/usercenter/apikeys',
      tip: '注册后进「API Keys」新建一个，复制那串钥匙。这家自带联网。' },
    { key: 'kimi', name: 'Kimi', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k',
      search: 'kimi', sign: 'https://platform.moonshot.cn/console/api-keys',
      tip: '注册后进「API Key 管理」新建，复制 sk- 开头那串。这家自带联网。' },
    { key: 'qwen', name: '通义千问', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus',
      search: 'qwen', sign: 'https://bailian.console.aliyun.com/',
      tip: '在百炼控制台「API-KEY」里新建。这家自带联网。' },
    { key: 'deepseek', name: 'DeepSeek', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat',
      search: 'external', sign: 'https://platform.deepseek.com/api_keys',
      tip: '注册后在「API keys」新建。这家自己不带联网，要联网得在下面再填一个搜索钥匙。' },
    { key: 'siliconflow', name: '硅基流动', base: 'https://api.siliconflow.cn/v1', model: '',
      search: 'external', sign: 'https://cloud.siliconflow.cn/account/ak',
      tip: '注册后在「API 密钥」新建。这家自己不带联网，要联网得在下面再填一个搜索钥匙。模型名建议点「拉取可选模型」挑。' },
    { key: 'custom', name: '自定义（OpenAI 兼容）', base: '', model: '',
      search: 'external', sign: '',
      tip: '任何 OpenAI 兼容接口都行：地址填到 /v1 那一层，再填钥匙和模型名。这种也不自带联网。' }
  ];

  var SEARCHERS = [
    { key: 'bocha', name: '博查', url: 'https://api.bochaai.com/v1/web-search',
      sign: 'https://open.bochaai.com/', tip: '国产搜索接口，注册送体验额度，国内网络直连。' },
    { key: 'tavily', name: 'Tavily', url: 'https://api.tavily.com/search',
      sign: 'https://app.tavily.com/home', tip: '国外搜索接口，每月 1000 次免费额度。' }
  ];

  /* ---------------- 存储 ---------------- */
  function readJson(k, d) {
    try { var o = JSON.parse(localStorage.getItem(k) || ''); return o && typeof o === 'object' ? o : d; }
    catch (e) { return d; }
  }
  function writeJson(k, o) { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} }

  var cfg = readJson(CFG_KEY, null);
  var log = readJson(LOG_KEY, { msgs: [] });
  if (!log.msgs || !log.msgs.length) { log = { msgs: [] }; }

  function provider(key) {
    for (var i = 0; i < PROVIDERS.length; i++) { if (PROVIDERS[i].key === key) { return PROVIDERS[i]; } }
    return PROVIDERS[0];
  }
  function searcher(key) {
    for (var i = 0; i < SEARCHERS.length; i++) { if (SEARCHERS[i].key === key) { return SEARCHERS[i]; } }
    return SEARCHERS[0];
  }
  function defaultCfg() {
    return { provider: 'zhipu', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '', model: 'glm-4-flash',
             searchOn: true, searchProvider: 'bocha', searchKey: '' };
  }
  if (!cfg || typeof cfg !== 'object') { cfg = defaultCfg(); }

  function ready() { return !!(cfg.apiKey && cfg.model && cfg.baseUrl); }

  /* ---------------- 工具 ---------------- */
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function linkify(s) {
    return s.replace(/(https?:\/\/[^\s<>"）)】]+)/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>';
    });
  }
  function fmt(s) {
    var parts = escHtml(s).split(/\n{2,}/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      out.push('<p>' + linkify(parts[i]).replace(/\n/g, '<br>') + '</p>');
    }
    return out.join('');
  }
  function host(u) {
    var m = /^https?:\/\/([^\/]+)/i.exec(String(u || ''));
    return m ? m[1] : '';
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) { return; }
    t.textContent = msg; t.classList.add('show');
    if (toast._t) { clearTimeout(toast._t); }
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }

  /* ---------------- 样式 ---------------- */
  var CSS = [
    '.ai-overlay{position:fixed;inset:0;z-index:72;background:#0a0a0b;opacity:0;pointer-events:none;visibility:hidden;transition:opacity .25s;}',
    '.ai-overlay.open{opacity:1;pointer-events:auto;visibility:visible;}',
    '.ai-panel{width:100%;height:100vh;height:100dvh;display:flex;flex-direction:column;background:var(--bg);}',
    '.ai-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}',
    '.ai-scroll{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px 18px calc(20px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:14px;}',
    '.ai-h{font-size:14px;font-weight:700;color:var(--text);}',
    '.ai-card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.10);border-radius:18px;overflow:hidden;}',
    '.ai-row{display:flex;align-items:center;gap:12px;padding:14px 15px;cursor:pointer;}',
    '.ai-row+.ai-row{border-top:1px solid rgba(255,255,255,0.07);}',
    '.ai-row:active{background:rgba(255,255,255,0.06);}',
    '.ai-row-main{flex:1 1 auto;min-width:0;}',
    '.ai-row-t{font-size:14px;font-weight:600;color:var(--text);}',
    '.ai-row-s{font-size:11px;line-height:1.6;color:var(--text-faint);margin-top:3px;}',
    '.ai-pick{flex:none;font-size:11px;font-weight:700;color:var(--text-faint);border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:4px 10px;}',
    '.ai-pick.on{color:var(--text);border-color:rgba(255,255,255,0.45);}',
    '.ai-field{display:flex;flex-direction:column;gap:7px;}',
    '.ai-label{font-size:12px;font-weight:700;color:var(--text-dim);}',
    '.ai-input,.ai-area{width:100%;box-sizing:border-box;padding:12px;border-radius:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--text);font-size:13px;outline:none;font-family:inherit;}',
    '.ai-input:focus,.ai-area:focus{border-color:rgba(255,255,255,0.34);}',
    '.ai-area{resize:none;line-height:1.6;}',
    '.ai-btns{display:flex;gap:10px;}',
    '.ai-btn{flex:1 1 0;padding:12px;border-radius:13px;border:none;background:#f5f5f5;color:#101014;font-size:14px;font-weight:700;cursor:pointer;}',
    '.ai-btn:active{opacity:.85;}',
    '.ai-btn.ghost{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);color:var(--text);font-weight:600;font-size:13px;}',
    '.ai-btn[disabled]{opacity:.4;}',
    '.ai-hint{font-size:11px;line-height:1.7;color:var(--text-faint);}',
    '.ai-switch{flex:none;width:44px;height:26px;border-radius:999px;background:rgba(255,255,255,0.14);position:relative;transition:background .2s;}',
    '.ai-switch i{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#8a8a92;transition:left .2s,background .2s;}',
    '.ai-switch.on{background:rgba(255,255,255,0.30);}',
    '.ai-switch.on i{left:21px;background:#f5f5f5;}',
    /* 聊天 */
    '.ai-msgs{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px 16px 8px;display:flex;flex-direction:column;gap:14px;}',
    '.ai-empty{flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:10px;color:var(--text-faint);font-size:13px;padding:40px 24px;text-align:center;line-height:1.8;}',
    '.ai-m{max-width:86%;display:flex;flex-direction:column;gap:6px;}',
    '.ai-m.u{align-self:flex-end;align-items:flex-end;}',
    '.ai-bub{padding:11px 13px;border-radius:16px;font-size:14px;line-height:1.72;color:var(--text);background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.08);word-break:break-word;}',
    '.ai-m.u .ai-bub{background:rgba(255,255,255,0.16);border-color:rgba(255,255,255,0.14);}',
    '.ai-bub p{margin:0 0 8px;}',
    '.ai-bub p:last-child{margin:0;}',
    '.ai-bub a{color:var(--text);text-decoration:underline;}',
    '.ai-meta{font-size:11px;color:var(--text-faint);padding:0 4px;}',
    '.ai-bad{font-size:12px;line-height:1.7;color:var(--text-dim);border-left:2px solid rgba(255,255,255,0.28);padding-left:10px;}',
    '.ai-src{display:flex;flex-direction:column;gap:8px;margin-top:2px;}',
    '.ai-src-t{font-size:11px;font-weight:700;color:var(--text-faint);}',
    '.ai-src-i{font-size:12px;line-height:1.6;color:var(--text-dim);text-decoration:none;display:block;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);}',
    '.ai-src-i b{display:block;color:var(--text);font-weight:600;margin-bottom:2px;}',
    '.ai-inputbar{flex:none;display:flex;align-items:flex-end;gap:9px;padding:10px 14px calc(12px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,0.07);background:var(--bg);}',
    '.ai-inputbar .ai-area{flex:1 1 auto;max-height:120px;}',
    '.ai-send{flex:none;width:62px;padding:12px 0;border-radius:13px;border:none;background:#f5f5f5;color:#101014;font-size:14px;font-weight:700;cursor:pointer;}',
    '.ai-send[disabled]{opacity:.4;}',
    '.ai-tools{flex:none;display:flex;align-items:center;gap:14px;padding:2px 4px;}',
    '.ai-mini{font-size:12px;color:var(--text-faint);font-weight:600;cursor:pointer;}',
    'body.light .ai-overlay,body.light .ai-panel{background:#f4f4f6;}',
    'body.light .ai-inputbar{background:#f4f4f6;border-top-color:rgba(0,0,0,0.08);}',
    'body.light .ai-card{background:rgba(0,0,0,0.04);border-color:rgba(0,0,0,0.08);}',
    'body.light .ai-row+.ai-row{border-top-color:rgba(0,0,0,0.07);}',
    'body.light .ai-row:active{background:rgba(0,0,0,0.05);}',
    'body.light .ai-input,body.light .ai-area{background:#fff;border-color:#d5d5db;color:#17171b;}',
    'body.light .ai-btn{background:#1c1c1f;color:#fff;}',
    'body.light .ai-btn.ghost{background:#fff;border-color:#d5d5db;color:#17171b;}',
    'body.light .ai-bub{background:#fff;border-color:#e2e2e8;color:#1c1c1f;}',
    'body.light .ai-m.u .ai-bub{background:#e9e9ee;border-color:#dcdce2;}',
    'body.light .ai-switch{background:rgba(0,0,0,0.14);}',
    'body.light .ai-switch i{background:#8a8a92;}',
    'body.light .ai-switch.on{background:rgba(0,0,0,0.26);}',
    'body.light .ai-switch.on i{background:#1c1c1f;}',
    'body.light .ai-src-i{background:#fff;border-color:#e2e2e8;}',
    'body.light .ai-send{background:#1c1c1f;color:#fff;}',
    'body.light .ai-pick{color:#8a8a92;border-color:rgba(0,0,0,0.18);}',
    'body.light .ai-pick.on{color:#1c1c1f;border-color:rgba(0,0,0,0.45);}',
    /* 纵向 flex 容器里的子项一律不参与收缩，否则 overflow:hidden 的卡片会被压扁 */
    '.ai-scroll>*,.ai-msgs>*{flex:0 0 auto;}'
].join('\n');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) { return; }
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------- 搜索接口 ---------------- */
  function normalizeExternal(kind, data) {
    var out = [];
    try {
      if (kind === 'bocha') {
        var vals = (data && data.data && data.data.webPages && data.data.webPages.value) || [];
        for (var i = 0; i < vals.length; i++) {
          out.push({ title: vals[i].name || host(vals[i].url), url: vals[i].url || '',
                     snippet: vals[i].summary || vals[i].snippet || '' });
        }
      } else {
        var rs = (data && data.results) || [];
        for (var j = 0; j < rs.length; j++) {
          out.push({ title: rs[j].title || host(rs[j].url), url: rs[j].url || '', snippet: rs[j].content || '' });
        }
      }
    } catch (e) {}
    return out.slice(0, 6);
  }

  function doExternalSearch(query, cb) {
    var s = searcher(cfg.searchProvider);
    var key = String(cfg.searchKey || '').replace(/^\s+|\s+$/g, '');
    if (!key) { cb('没填搜索钥匙'); return; }
    var body, headers = { 'Content-Type': 'application/json' };
    if (s.key === 'bocha') {
      headers['Authorization'] = 'Bearer ' + key;
      body = { query: query, count: 6, summary: true, freshness: 'noLimit' };
    } else {
      body = { api_key: key, query: query, max_results: 6, search_depth: 'basic', include_answer: false };
    }
    fetch(s.url, { method: 'POST', headers: headers, body: JSON.stringify(body) })
      .then(function (r) {
        if (!r.ok) { throw new Error('搜索接口 HTTP ' + r.status); }
        return r.json();
      })
      .then(function (d) { cb(null, normalizeExternal(s.key, d), s.name); })
      ['catch'](function (e) { cb((e && e.message) || '搜索失败'); });
  }

  /* 从模型返回里尽量捞出来源链接 */
  function guessSources(data) {
    var out = [], seen = {};
    function take(o) {
      if (!o || typeof o !== 'object' || out.length >= 6) { return; }
      var u = o.link || o.url || o.href || o.refer;
      var t = o.title || o.name || '';
      if (typeof u === 'string' && /^https?:\/\//i.test(u) && !seen[u]) {
        seen[u] = 1;
        out.push({ title: t || host(u), url: u, snippet: '' });
      }
    }
    function scan(v, depth) {
      if (!v || typeof v !== 'object' || depth > 3 || out.length >= 6) { return; }
      if (Object.prototype.toString.call(v) === '[object Array]') {
        for (var i = 0; i < v.length; i++) { take(v[i]); scan(v[i], depth + 1); }
        return;
      }
      for (var k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) { continue; }
        if (/^(web_search|search|search_info|search_result|references|results|sources|documents)$/i.test(k)) {
          scan(v[k], depth);
        }
      }
    }
    try {
      scan(data, 0);
      var m = data && data.choices && data.choices[0] && data.choices[0].message;
      if (m) { scan(m, 1); }
    } catch (e) {}
    return out;
  }

  /* ---------------- 对话请求 ---------------- */
  var busy = false;

  function baseUrlOf() {
    var b = String(cfg.baseUrl || '').replace(/\/+$/, '');
    if (!/\/chat\/completions$/.test(b)) { b += '/chat/completions'; }
    return b;
  }
  function sysPrompt(hasRef) {
    return '你是 AE 助手，一个说中文的 AI。回答直接、有条理、不啰嗦，不用 emoji，不写颜文字。' +
      '今天是 ' + today() + '。' +
      (hasRef ? '\n下面会给出「联网资料」，请优先依据它回答；引用到的句子末尾标上来源序号，如 [1]。资料里没有的就直说没查到，不许编。'
              : '\n你的知识有截止时间，遇到时效性强的问题要说清楚这一点。');
  }

  function postChat(body, cb) {
    fetch(baseUrlOf(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.text().then(function (txt) {
        var d = null;
        try { d = JSON.parse(txt); } catch (e) {}
        if (!r.ok) {
          var m = (d && d.error && (d.error.message || d.error.code)) || txt.slice(0, 200) || ('HTTP ' + r.status);
          throw new Error('HTTP ' + r.status + ' · ' + m);
        }
        if (!d) { throw new Error('返回不是 JSON'); }
        return d;
      });
    }).then(function (d) { cb(null, d); })
      ['catch'](function (e) { cb((e && e.message) || '请求失败'); });
  }

  function pickText(d) {
    var m = d && d.choices && d.choices[0] && d.choices[0].message;
    var t = (m && m.content) || '';
    if (Object.prototype.toString.call(t) === '[object Array]') {
      var buf = [];
      for (var i = 0; i < t.length; i++) { if (t[i] && t[i].text) { buf.push(t[i].text); } }
      t = buf.join('');
    }
    return t || '';
  }

  function buildMessages(history, refs) {
    var msgs = [{ role: 'system', content: sysPrompt(!!refs) }];
    if (refs && refs.length) {
      var lines = ['联网资料（' + new Date().toLocaleString() + ' 检索）：'];
      for (var i = 0; i < refs.length; i++) {
        lines.push('[' + (i + 1) + '] ' + refs[i].title + '\n' + refs[i].url + '\n' + String(refs[i].snippet || '').slice(0, 600));
      }
      msgs.push({ role: 'system', content: lines.join('\n\n') });
    }
    for (var j = 0; j < history.length; j++) {
      msgs.push({ role: history[j].role, content: history[j].content });
    }
    return msgs;
  }

  function callModel(history, refs, query, cb) {
    var p = provider(cfg.provider);
    var msgs = buildMessages(history, refs);
    var body = { model: cfg.model, messages: msgs, temperature: 0.6, stream: false };

    if (refs === undefined) { refs = []; }
    var useBuiltin = cfg.searchOn && !refs.length && query;

    if (useBuiltin && p.search === 'builtin') {
      body.tools = [{ type: 'web_search', web_search: { enable: true, search_query: query } }];
    } else if (useBuiltin && p.search === 'qwen') {
      body.enable_search = true;
    } else if (useBuiltin && p.search === 'kimi') {
      body.tools = [{ type: 'builtin_function', function: { name: '$web_search' } }];
    }

    postChat(body, function (err, d) {
      if (err) { cb(err); return; }
      /* Kimi 内置联网：把参数原样回传一次，模型再出最终答案 */
      var m = d && d.choices && d.choices[0] && d.choices[0].message;
      var tc = m && m.tool_calls;
      if (!err && tc && tc.length && p.search === 'kimi' && useBuiltin) {
        var msgs2 = msgs.concat([{ role: 'assistant', content: m.content || '', tool_calls: tc }]);
        for (var i = 0; i < tc.length; i++) {
          msgs2.push({ role: 'tool', tool_call_id: (tc[i].id || ('call_' + i)), name: (tc[i].function && tc[i].function.name) || '$web_search',
                       content: (tc[i].function && tc[i].function.arguments) || '{}' });
        }
        var body2 = { model: cfg.model, messages: msgs2, temperature: 0.6, stream: false,
                      tools: [{ type: 'builtin_function', function: { name: '$web_search' } }] };
        postChat(body2, function (e2, d2) { cb(e2, d2, true); });
        return;
      }
      cb(null, d, false);
    });
  }

  /* ---------------- 界面 ---------------- */
  var overlay = null, view = 'chat', pending = '';

  function headerHtml(title, right) {
    return '<div class="settings-header">' +
      '<button class="settings-close" id="aiBack" type="button">' +
      '<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M15 5l-7 7 7 7"/></svg>' +
      '</button><span class="title">' + title + '</span>' + (right || '') + '</div>';
  }

  function providerListHtml() {
    var h = '';
    for (var i = 0; i < PROVIDERS.length; i++) {
      var p = PROVIDERS[i], on = cfg.provider === p.key;
      h += '<div class="ai-row" data-prov="' + p.key + '">' +
        '<div class="ai-row-main"><div class="ai-row-t">' + p.name + '</div>' +
        '<div class="ai-row-s">' + (p.search === 'external' ? '不自带联网' : '自带联网') + '</div></div>' +
        '<div class="ai-pick' + (on ? ' on' : '') + '">' + (on ? '已选' : '选择') + '</div></div>';
    }
    return '<div class="ai-card">' + h + '</div>';
  }

  function searcherListHtml() {
    var h = '';
    for (var i = 0; i < SEARCHERS.length; i++) {
      var s = SEARCHERS[i], on = cfg.searchProvider === s.key;
      h += '<div class="ai-row" data-searcher="' + s.key + '">' +
        '<div class="ai-row-main"><div class="ai-row-t">' + s.name + '</div>' +
        '<div class="ai-row-s">' + s.tip + '</div></div>' +
        '<div class="ai-pick' + (on ? ' on' : '') + '">' + (on ? '已选' : '选择') + '</div></div>';
    }
    return '<div class="ai-card">' + h + '</div>';
  }

  function setupHtml() {
    var p = provider(cfg.provider), s = searcher(cfg.searchProvider);
    var needSearch = cfg.searchOn && p.search === 'external';
    return headerHtml('AI 助手设置') +
      '<div class="ai-scroll">' +
        '<div class="ai-hint">填一次，以后打开就能用。钥匙只存在这台设备的浏览器里，不上传、站点看不到。' +
        '换成别人的手机或换个浏览器，都要重新填一次。</div>' +

        '<div class="ai-h"><span>1</span> 选一个服务</div>' +
        providerListHtml() +
        '<div class="ai-hint">' + escHtml(p.tip) + '</div>' +
        (p.sign ? '<button class="ai-btn ghost" id="aiSign" type="button">去 ' + p.name + ' 领钥匙</button>' : '') +

        '<div class="ai-h"><span>2</span> 填钥匙</div>' +
        '<div class="ai-field"><input class="ai-input" id="aiKey" type="text" autocomplete="off" spellcheck="false" placeholder="粘贴钥匙" value="' + escHtml(cfg.apiKey) + '"></div>' +

        '<div class="ai-h"><span>3</span> 填模型名</div>' +
        '<div class="ai-field"><input class="ai-input" id="aiModel" type="text" autocomplete="off" spellcheck="false" placeholder="模型名" value="' + escHtml(cfg.model) + '"></div>' +
        '<div class="ai-btns"><button class="ai-btn ghost" id="aiPull" type="button">拉取可选模型</button></div>' +
        '<div class="ai-field" id="aiModelBox" hidden><div class="ai-label">接口给的模型（点一个）</div><div class="ai-card" id="aiModelList"></div></div>' +

        '<div class="ai-h"><span>4</span> 接口地址</div>' +
        '<div class="ai-field"><input class="ai-input" id="aiBase" type="text" autocomplete="off" spellcheck="false" placeholder="https://…/v1" value="' + escHtml(cfg.baseUrl) + '"></div>' +
        '<div class="ai-hint">一般不用改。自己填的话写到 /v1 那一层就行。</div>' +

        '<div class="ai-card"><div class="ai-row" id="aiSearchToggle">' +
          '<div class="ai-row-main"><div class="ai-row-t">联网搜索</div>' +
          '<div class="ai-row-s">开着的时候，它回答前会自己上网查资料。</div></div>' +
          '<div class="ai-switch' + (cfg.searchOn ? ' on' : '') + '"><i></i></div>' +
        '</div></div>' +

        (needSearch ?
        ('<div class="ai-h">联网用哪家搜</div>' + searcherListHtml() +
         '<div class="ai-field"><input class="ai-input" id="aiSearchKey" type="text" autocomplete="off" spellcheck="false" placeholder="粘贴' + s.name + '的钥匙" value="' + escHtml(cfg.searchKey) + '"></div>' +
         (s.sign ? '<button class="ai-btn ghost" id="aiSearchSign" type="button">去 ' + s.name + ' 领钥匙</button>' : '') +
         '<div class="ai-hint">' + escHtml(s.tip) + '</div>' +
         '<div class="ai-hint">不想再弄一个钥匙的话，就把服务换成 智谱 / Kimi / 通义千问，这三家自带联网，只填一把钥匙就够。</div>')
        : '') +

        '<div class="ai-btns"><button class="ai-btn" id="aiSave" type="button">保存</button></div>' +
        '<div class="ai-hint">钥匙填错或想换人用，回这一页重新填、点保存就会覆盖旧的。</div>' +
      '</div>';
  }

  function msgsHtml() {
    if (!log.msgs.length) {
      return '<div class="ai-empty"><div>随便问点什么。</div><div>开着联网的话，我会先上网查，再回答。</div></div>';
    }
    var h = '';
    for (var i = 0; i < log.msgs.length; i++) {
      var m = log.msgs[i];
      if (m.role === 'user') {
        h += '<div class="ai-m u"><div class="ai-bub">' + fmt(m.content) + '</div></div>';
      } else {
        h += '<div class="ai-m a">' + (m.note ? '<div class="ai-meta">' + escHtml(m.note) + '</div>' : '') +
             '<div class="ai-bub">' + fmt(m.content) + '</div>';
        if (m.sources && m.sources.length) {
          h += '<div class="ai-src"><div class="ai-src-t">来源</div>';
          for (var j = 0; j < m.sources.length; j++) {
            var s = m.sources[j];
            h += '<a class="ai-src-i" href="' + escHtml(s.url) + '" target="_blank" rel="noopener"><b>[' + (j + 1) + '] ' + escHtml(s.title) + '</b>' + escHtml(host(s.url)) + '</a>';
          }
          h += '</div>';
        }
        h += '</div>';
      }
    }
    return h;
  }

  function chatHtml() {
    return headerHtml('AI 助手',
        '<span class="ai-mini" id="aiToSetup" style="position:absolute;right:20px;top:50%;transform:translateY(-50%)">设置</span>') +
      '<div class="ai-body">' +
        '<div class="ai-msgs" id="aiMsgs">' + msgsHtml() + '</div>' +
        '<div class="ai-inputbar">' +
          '<textarea class="ai-area" id="aiInput" rows="1" placeholder="问点什么…" autocomplete="off"></textarea>' +
          '<button class="ai-send" id="aiSend" type="button">发送</button>' +
        '</div>' +
      '</div>';
  }

  function render() {
    if (!ready()) { view = 'setup'; }
    overlay.innerHTML = '<div class="ai-panel" id="aiPanel">' + (view === 'setup' ? setupHtml() : chatHtml()) + '</div>';
    if (view === 'setup') { bindSetup(); } else { bindChat(); }
  }

  function openSetup() {
    view = 'setup';
    render();
    overlay.classList.add('open');
  }
  function openChat() {
    view = 'chat';
    render();
    overlay.classList.add('open');
    scrollMsgs();
    var inp = document.getElementById('aiInput');
    if (inp && ready()) { try { inp.focus(); } catch (e) {} }
  }

  function scrollMsgs() {
    var box = document.getElementById('aiMsgs');
    if (box) { box.scrollTop = box.scrollHeight; }
  }

  /* ---------------- 绑定：设置 ---------------- */
  function bindSetup() {
    var b = document.getElementById('aiBack');
    if (b) { b.addEventListener('click', function () { if (ready()) { openChat(); } else { overlay.classList.remove('open'); } }); }

    var rows = overlay.querySelectorAll('[data-prov]');
    for (var i = 0; i < rows.length; i++) {
      rows[i].addEventListener('click', function () {
        readSetupInputs();
        var p = provider(this.getAttribute('data-prov'));
        cfg.provider = p.key;
        if (p.base) { cfg.baseUrl = p.base; }
        if (p.model) { cfg.model = p.model; }
        render();
        toast('已选 ' + p.name);
      });
    }
    var srows = overlay.querySelectorAll('[data-searcher]');
    for (var j = 0; j < srows.length; j++) {
      srows[j].addEventListener('click', function () {
        readSetupInputs();
        cfg.searchProvider = this.getAttribute('data-searcher');
        render();
      });
    }
    var tg = document.getElementById('aiSearchToggle');
    if (tg) {
      tg.addEventListener('click', function () {
        readSetupInputs();
        cfg.searchOn = !cfg.searchOn;
        render();
      });
    }
    var sign = document.getElementById('aiSign');
    if (sign) { sign.addEventListener('click', function () { try { window.open(provider(cfg.provider).sign, '_blank'); } catch (e) {} }); }
    var ssign = document.getElementById('aiSearchSign');
    if (ssign) { ssign.addEventListener('click', function () { try { window.open(searcher(cfg.searchProvider).sign, '_blank'); } catch (e) {} }); }

    var pull = document.getElementById('aiPull');
    if (pull) {
      pull.addEventListener('click', function () {
        readSetupInputs();
        var btn = this;
        if (!cfg.apiKey) { toast('先填钥匙'); return; }
        var base = String(cfg.baseUrl || '').replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
        if (!base) { toast('先填接口地址'); return; }
        btn.textContent = '拉取中…';
        fetch(base + '/models', { headers: { 'Authorization': 'Bearer ' + cfg.apiKey } })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            var arr = (d && (d.data || d.models)) || [];
            var box = document.getElementById('aiModelBox'), list = document.getElementById('aiModelList');
            if (!arr.length) { toast('这个接口没返回模型列表，手动填名字吧'); btn.textContent = '拉取可选模型'; return; }
            var h = '';
            for (var k = 0; k < arr.length && k < 60; k++) {
              var id = arr[k].id || arr[k].name || '';
              if (!id) { continue; }
              h += '<div class="ai-row" data-model="' + escHtml(id) + '"><div class="ai-row-main"><div class="ai-row-t">' + escHtml(id) + '</div></div>' +
                   '<div class="ai-pick' + (cfg.model === id ? ' on' : '') + '">' + (cfg.model === id ? '已选' : '选择') + '</div></div>';
            }
            list.innerHTML = h; box.hidden = false;
            var mrows = list.querySelectorAll('[data-model]');
            for (var q = 0; q < mrows.length; q++) {
              mrows[q].addEventListener('click', function () {
                cfg.model = this.getAttribute('data-model');
                document.getElementById('aiModel').value = cfg.model;
                render();
              });
            }
            btn.textContent = '拉取可选模型';
          })
          ['catch'](function () { toast('拉取失败，手动填模型名'); btn.textContent = '拉取可选模型'; });
      });
    }

    var save = document.getElementById('aiSave');
    if (save) {
      save.addEventListener('click', function () {
        readSetupInputs();
        if (!cfg.apiKey) { toast('钥匙还没填'); return; }
        if (!cfg.model) { toast('模型名还没填'); return; }
        if (!/^https?:\/\//.test(cfg.baseUrl)) { toast('接口地址不对'); return; }
        if (cfg.searchOn && provider(cfg.provider).search === 'external' && !cfg.searchKey) {
          toast('这家不带联网，请填搜索钥匙或换服务');
          return;
        }
        writeJson(CFG_KEY, cfg);
        toast('已保存');
        openChat();
      });
    }
  }

  function readSetupInputs() {
    var k = document.getElementById('aiKey');
    var m = document.getElementById('aiModel');
    var b = document.getElementById('aiBase');
    var sk = document.getElementById('aiSearchKey');
    if (k) { cfg.apiKey = k.value.replace(/^\s+|\s+$/g, ''); }
    if (m) { cfg.model = m.value.replace(/^\s+|\s+$/g, ''); }
    if (b) { cfg.baseUrl = b.value.replace(/^\s+|\s+$/g, ''); }
    if (sk) { cfg.searchKey = sk.value.replace(/^\s+|\s+$/g, ''); }
  }

  /* ---------------- 绑定：聊天 ---------------- */
  function bindChat() {
    var b = document.getElementById('aiBack');
    if (b) { b.addEventListener('click', function () { overlay.classList.remove('open'); }); }
    var st = document.getElementById('aiToSetup');
    if (st) { st.addEventListener('click', function () { openSetup(); }); }

    var inp = document.getElementById('aiInput');
    var btn = document.getElementById('aiSend');
    if (inp) {
      inp.addEventListener('input', function () {
        inp.style.height = 'auto';
        inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
      });
    }
    if (btn) { btn.addEventListener('click', ask); }
  }

  function setBusy(on, note) {
    busy = on;
    var b = document.getElementById('aiSend');
    if (b) { b.disabled = on; b.textContent = on ? '等等' : '发送'; }
    var box = document.getElementById('aiMsgs');
    var old = document.getElementById('aiPend');
    if (old) { old.parentNode.removeChild(old); }
    if (on && box) {
      var d = document.createElement('div');
      d.id = 'aiPend'; d.className = 'ai-m a';
      d.innerHTML = '<div class="ai-bub" style="opacity:.72">' + escHtml(note || '正在生成…') + '</div>';
      box.appendChild(d);
      scrollMsgs();
    }
  }

  function saveLog() {
    if (log.msgs.length > 40) { log.msgs = log.msgs.slice(log.msgs.length - 40); }
    writeJson(LOG_KEY, log);
  }

  function pushMsg(role, content, note, sources) {
    log.msgs.push({ role: role, content: content, note: note || '', sources: sources || [], ts: Date.now() });
    saveLog();
    var box = document.getElementById('aiMsgs');
    if (box) { box.innerHTML = msgsHtml(); scrollMsgs(); }
  }

  function ask() {
    if (busy) { return; }
    var inp = document.getElementById('aiInput');
    if (!inp) { return; }
    var q = String(inp.value || '').replace(/^\s+|\s+$/g, '');
    if (!q) { return; }
    if (!ready()) { openSetup(); return; }
    inp.value = ''; inp.style.height = 'auto';
    pushMsg('user', q);

    var p = provider(cfg.provider);
    var external = cfg.searchOn && p.search === 'external';
    var history = [];
    for (var i = 0; i < log.msgs.length; i++) {
      if (log.msgs[i].role === 'user' || log.msgs[i].role === 'assistant') {
        history.push({ role: log.msgs[i].role, content: log.msgs[i].content });
      }
    }

    var srcName = '';
    if (external) {
      setBusy(true, '正在联网检索…');
      doExternalSearch(q, function (err, refs, name) {
        if (err) {
          setBusy(true, '检索失败（' + err + '），直接回答…');
          callModel(history, [], q, finish);
        } else {
          srcName = name || '联网';
          setBusy(true, '查到 ' + refs.length + ' 条，正在整理…');
          callModel(history, refs, q, finish);
        }
      });
    } else {
      setBusy(true, cfg.searchOn ? '正在联网检索并回答…' : '正在回答…');
      callModel(history, [], q, finish);
    }

    function finish(err, data) {
      if (err) {
        setBusy(false);
        pushMsg('assistant', '出错：' + err + '\n检查一下钥匙、模型名和接口地址；要是服务不支持联网，把联网关掉再试。');
        return;
      }
      var t = pickText(data);
      if (!t) {
        setBusy(false);
        pushMsg('assistant', '接口没返回内容。可能是模型名不对，或者这个模型不支持联网，把联网关掉再试。');
        return;
      }
      var note = '';
      if (cfg.searchOn) { note = srcName ? ('已联网 · ' + srcName) : '已联网'; }
      setBusy(false);
      pushMsg('assistant', t, note, guessSources(data));
    }
  }

  /* ---------------- 对外 ---------------- */
  function open() {
    injectStyle();
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'ai-overlay'; overlay.id = 'aiOverlay';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) { overlay.classList.remove('open'); } });
    }
    if (ready()) { openChat(); } else { openSetup(); }
  }

  function boot() { injectStyle(); }

  window.AE_openAiAssistant = open;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
