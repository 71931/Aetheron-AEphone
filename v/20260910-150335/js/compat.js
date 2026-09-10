/* ===== v162：老内核兼容补丁（Object.assign/Array.from/closest 等），解决部分浏览器整站 JS 失效、点击无反应 ===== */
(function () {
  if (!Object.assign) {
    Object.assign = function (t) {
      for (var i = 1; i < arguments.length; i++) {
        var s = arguments[i];
        if (s) { for (var k in s) { if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k]; } }
      }
      return t;
    };
  }
  if (!Array.from) {
    Array.from = function (o, fn, ctx) {
      var a = [];
      for (var i = 0; i < o.length; i++) { var v = o[i]; a.push(fn ? fn.call(ctx, v, i) : v); }
      return a;
    };
  }
  if (!Array.isArray) { Array.isArray = function (v) { return Object.prototype.toString.call(v) === '[object Array]'; }; }
  if (window.Element && Element.prototype && !Element.prototype.closest) {
    Element.prototype.closest = function (sel) {
      var el = this;
      while (el) { if (el.matches && el.matches(sel)) return el; el = el.parentElement || el.parentNode; }
      return null;
    };
  }
  if (window.Element && Element.prototype && !Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.matchesSelector || Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector || function () { return false; };
  }
  if (!Array.prototype.includes) {
    Array.prototype.includes = function (v) { for (var i = 0; i < this.length; i++) { if (this[i] === v) return true; } return false; };
  }
  if (!String.prototype.startsWith) { String.prototype.startsWith = function (p) { return this.slice(0, p.length) === p; }; }
  if (!String.prototype.endsWith) { String.prototype.endsWith = function (p) { return this.slice(-p.length) === p; }; }
  if (window.NodeList && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = function (fn, ctx) { for (var i = 0; i < this.length; i++) fn.call(ctx || null, this[i], i, this); };
  }
  if (window.HTMLCollection && !HTMLCollection.prototype.forEach) {
    HTMLCollection.prototype.forEach = function (fn, ctx) { for (var i = 0; i < this.length; i++) fn.call(ctx || null, this[i], i, this); };
  }
})();

/* ===== v181 追加：老内核最后一道兼容层（纯 ES5，无模板串/箭头函数） =====
   补齐三个"整站点击无反应"的真正缺口：
   ① Array.prototype.find / findIndex —— Chrome<45 缺失，调用即抛 TypeError
   ② window.fetch —— Chrome<42 缺失，所有联网与点击分支直接抛错
   ③ window.Promise —— Chrome<32 / 老 WebView 缺失，fetch 链与 JSZip 全挂
   另附 IDBObjectStore.getAll/getAllKeys（Chrome<48）的游标兜底，避免老内核抛错弹红条。 */
(function () {
  function bar(msg) {
    try {
      if (typeof window.__aeErrBar === 'function') { window.__aeErrBar(msg); return; }
      var el = document.getElementById('ae-err-bar');
      if (!el) {
        el = document.createElement('div');
        el.id = 'ae-err-bar';
        el.setAttribute('style', 'position:fixed;left:0;right:0;top:0;z-index:2147483647;' +
          'background:rgba(176,42,32,.96);color:#fff;font:12px/1.5 sans-serif;padding:8px 10px;' +
          'white-space:pre-wrap;word-break:break-all;max-height:45%;overflow:auto');
        (document.body || document.documentElement).appendChild(el);
      }
      el.textContent = '脚本报错：' + msg;
    } catch (e) {}
  }
  if (typeof window.__aeErrBar !== 'function') window.__aeErrBar = bar;

  /* ---------- ① Array.find / findIndex ---------- */
  if (!Array.prototype.find) {
    Array.prototype.find = function (fn, ctx) {
      if (this == null) throw new TypeError('Array.prototype.find called on null or undefined');
      var o = Object(this), len = o.length >>> 0, i;
      for (i = 0; i < len; i++) if (fn.call(ctx, o[i], i, o)) return o[i];
      return undefined;
    };
  }
  if (!Array.prototype.findIndex) {
    Array.prototype.findIndex = function (fn, ctx) {
      if (this == null) throw new TypeError('Array.prototype.findIndex called on null or undefined');
      var o = Object(this), len = o.length >>> 0, i;
      for (i = 0; i < len; i++) if (fn.call(ctx, o[i], i, o)) return i;
      return -1;
    };
  }

  /* ---------- ③ Promise（极简 ES5 实现，仅在原生缺失时接管） ---------- */
  if (typeof window.Promise !== 'function') {
    (function () {
      function P(executor) {
        var self = this;
        self._s = 0; self._v = undefined; self._q = [];
        function run(item) {
          var h = self._s === 1 ? item.onOk : item.onFail;
          if (typeof h !== 'function') { (self._s === 1 ? item.res : item.rej)(self._v); return; }
          try { item.res(h(self._v)); } catch (e) { item.rej(e); }
        }
        function flush() {
          var q = self._q; self._q = [];
          for (var i = 0; i < q.length; i++) run(q[i]);
        }
        function settle(state, value) {
          if (self._s) return;
          if (state === 1 && value && typeof value.then === 'function') {
            value.then(function (v) { settle(1, v); }, function (e) { settle(2, e); });
            return;
          }
          self._s = state; self._v = value;
          setTimeout(flush, 0);
        }
        self._add = function (onOk, onFail, res, rej) {
          var item = { onOk: onOk, onFail: onFail, res: res, rej: rej };
          if (self._s) setTimeout(function () { run(item); }, 0);
          else self._q.push(item);
        };
        try { executor(function (v) { settle(1, v); }, function (e) { settle(2, e); }); }
        catch (e) { settle(2, e); }
      }
      P.prototype.then = function (onOk, onFail) {
        var self = this;
        return new P(function (res, rej) { self._add(onOk, onFail, res, rej); });
      };
      P.prototype['catch'] = function (onFail) { return this.then(null, onFail); };
      P.resolve = function (v) { return new P(function (res) { res(v); }); };
      P.reject = function (e) { return new P(function (res, rej) { rej(e); }); };
      P.all = function (arr) {
        return new P(function (res, rej) {
          var n = arr && arr.length ? arr.length : 0, out = [], left = n, i;
          if (!n) { res(out); return; }
          function one(idx) {
            P.resolve(arr[idx]).then(function (v) { out[idx] = v; if (--left === 0) res(out); }, rej);
          }
          for (i = 0; i < n; i++) one(i);
        });
      };
      window.Promise = P;
    })();
  }

  /* ---------- ② fetch（XHR 实现，覆盖本项目用到的 method/headers/body/json/text/ok/status） ---------- */
  if (typeof window.fetch !== 'function') {
    window.fetch = function (url, opts) {
      opts = opts || {};
      return new window.Promise(function (resolve, reject) {
        var x;
        try { x = new XMLHttpRequest(); }
        catch (e) { reject(new Error('XMLHttpRequest 不可用')); return; }
        x.open(opts.method || 'GET', url, true);
        if (opts.credentials === 'include') { try { x.withCredentials = true; } catch (e2) {} }
        if (opts.headers) {
          for (var k in opts.headers) {
            if (opts.headers.hasOwnProperty(k)) { try { x.setRequestHeader(k, opts.headers[k]); } catch (e3) {} }
          }
        }
        x.onload = function () {
          var text = x.responseText;
          resolve({
            ok: x.status >= 200 && x.status < 300,
            status: x.status,
            statusText: x.statusText,
            url: url,
            headers: { get: function (n) { try { return x.getResponseHeader(n); } catch (e4) { return null; } } },
            text: function () { return window.Promise.resolve(text); },
            json: function () {
              return new window.Promise(function (res2, rej2) {
                try { res2(JSON.parse(text)); } catch (e5) { rej2(e5); }
              });
            }
          });
        };
        x.onerror = function () { reject(new Error('网络请求失败')); };
        x.ontimeout = function () { reject(new Error('网络请求超时')); };
        try { x.send(opts.body === undefined || opts.body === null ? null : opts.body); }
        catch (e6) { reject(e6); }
      });
    };
  }

  /* ---------- IndexedDB getAll / getAllKeys 游标兜底（Chrome<48） ---------- */
  try {
    if (window.IDBObjectStore && !IDBObjectStore.prototype.getAll) {
      var agg = function (store, query, mode) {
        var req = { onsuccess: null, onerror: null, result: undefined };
        var out = [], started = false;
        function start() {
          if (started) return; started = true;
          var c;
          try { c = store.openCursor(query); } catch (e) { return; }
          c.onsuccess = function (ev) {
            var cur = ev.target && ev.target.result;
            if (cur) { out.push(mode === 'key' ? cur.key : cur.value); try { cur['continue'](); } catch (e2) {} }
            else {
              req.result = out;
              if (typeof req.onsuccess === 'function') req.onsuccess({ target: req });
            }
          };
          c.onerror = function (ev) { if (typeof req.onerror === 'function') req.onerror(ev); };
        }
        setTimeout(start, 0);
        return req;
      };
      IDBObjectStore.prototype.getAll = function (q) { return agg(this, q, 'value'); };
      IDBObjectStore.prototype.getAllKeys = function (q) { return agg(this, q, 'key'); };
    }
  } catch (e) {}

  try { if (window.console && console.log) console.log('[MarvisLog] v181 老内核兼容层已装载：find=' + (typeof Array.prototype.find) + ' fetch=' + (typeof window.fetch) + ' Promise=' + (typeof window.Promise)); } catch (e) {}
})();
