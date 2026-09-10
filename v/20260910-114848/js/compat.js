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
