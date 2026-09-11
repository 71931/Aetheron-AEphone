
/* ===== v157: 气泡配色改为在 UI 美化中心统一设置（此处仅负责加载已存颜色） ===== */
(function () {
  var KEY = 'aetheron_bubble_colors_v156';
  var bubbles = document.querySelectorAll('.ins-bubble[data-key]');
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  bubbles.forEach(function (el) {
    var k = el.getAttribute('data-key');
    var c = saved[k];
    if (!c) return;
    el.style.setProperty('--bbg', c.bg);
    el.style.setProperty('--bfg', c.fg);
  });
})();
