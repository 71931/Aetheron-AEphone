/* ===== v162：移动端沉浸全屏（触碰即尝试全屏，隐藏浏览器顶栏底栏；iframe/桌面不触发） ===== */
(function () {
  function enterFs() {
    try {
      var d = document.documentElement;
      var fn = d.requestFullscreen || d.webkitRequestFullscreen || d.webkitEnterFullscreen || d.msRequestFullscreen;
      if (fn) { var r = fn.call(d); if (r && r.catch) r.catch(function () {}); }
    } catch (e) {}
  }
  function shouldAuto() {
    try { if (window.self !== window.top) return false; } catch (e) { return false; }
    var ua = (navigator.userAgent || '').toLowerCase();
    if (ua.indexOf('windows') !== -1 && ua.indexOf('mobile') === -1) return false;
    if (ua.indexOf('macintosh') !== -1 && ua.indexOf('iphone') === -1 && ua.indexOf('ipad') === -1) return false;
    if (ua.indexOf('linux') !== -1 && ua.indexOf('android') === -1) return false;
    return true;
  }
  if (shouldAuto()) {
    var tried = false;
    function onGesture() {
      if (tried) return;
      tried = true;
      if (window.__aeImmersiveDisabled) return;
      enterFs();
      setTimeout(enterFs, 250);
      setTimeout(enterFs, 800);
    }
    if (document.addEventListener) {
      document.addEventListener('touchstart', onGesture, { passive: true, capture: true });
      document.addEventListener('click', onGesture, { passive: true, capture: true });
    }
  }
  window.__aeRequestImmersive = enterFs;
})();
