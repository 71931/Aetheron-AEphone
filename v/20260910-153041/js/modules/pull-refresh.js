

/* ===== v125: 下拉刷新（页面顶部下拉 -> 重新加载） ===== */
(function () {
  if (window.__pullRefreshInstalled) return;
  window.__pullRefreshInstalled = true;

  var THRESHOLD = 72;
  var MAX = 96;
  var startY = 0, pulling = false, dist = 0;

  var ind = document.createElement('div');
  ind.id = 'pull-refresh';
  ind.innerHTML = '<div class="pr-spinner"></div><span class="pr-text">下拉刷新</span>';
  document.body.appendChild(ind);
  var textEl = ind.querySelector('.pr-text');

  function canPull() {
    return (window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0) <= 0;
  }

  /* v173.1：下拉刷新只认主桌面/顶层背景，弹层里的触摸一律不启动下拉，
     修复在聊天里删除会话/点按钮时误触下拉导致整页刷新跳回桌面 */
  function isPullSource(t) {
    var n = t;
    while (n && n !== document.documentElement) {
      if (n === document.body) break;
      var cls = '';
      if (n.className && typeof n.className === 'string') cls = n.className;
      else if (n.className && n.className.baseVal !== undefined) cls = n.className.baseVal;
      var id = n.id || '';
      if (/overlay|mask|panel|modal/i.test(cls) || /overlay|mask|panel|modal/i.test(id)) return false;
      if (n.tagName && /^(BUTTON|A|INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/i.test(n.tagName)) return false;
      n = n.parentNode;
    }
    return true;
  }

  document.addEventListener('touchstart', function (e) {
    if (canPull() && isPullSource(e.target)) { startY = e.touches[0].clientY; pulling = true; dist = 0; }
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!pulling) return;
    var y = e.touches[0].clientY;
    dist = y - startY;
    if (dist <= 0) { ind.classList.remove('ready'); ind.style.transform = ''; return; }
    var show = Math.min(dist * 0.55, MAX);
    ind.style.transform = 'translateY(' + show + 'px)';
    ind.classList.add('active');
    if (dist >= THRESHOLD) {
      ind.classList.add('ready');
      textEl.textContent = '释放刷新';
    } else {
      ind.classList.remove('ready');
      textEl.textContent = '下拉刷新';
    }
  }, { passive: true });

  document.addEventListener('touchend', function () {
    if (!pulling) return;
    if (dist >= THRESHOLD) {
      ind.classList.add('loading');
      textEl.textContent = '刷新中...';
      setTimeout(function () { location.reload(); }, 400);
    } else {
      ind.classList.remove('active', 'ready');
      ind.style.transform = '';
    }
    pulling = false; dist = 0;
  }, { passive: true });
})();
