

/* ===== v127: 移除打字机效果，气泡直接静态显示文字 ===== */

/* ===== v130: 气泡文字可点击编辑，保存到 localStorage ===== */
(function () {
  var KEY = 'aetheron_bubbles';
  var bubbles = document.querySelectorAll('.ins-bubble[data-key]');

  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      bubbles.forEach(function (el) {
        var k = el.getAttribute('data-key');
        if (saved[k] && saved[k].trim()) {
          el.textContent = saved[k];
        }
      });
    } catch (e) {}
  }

  function save() {
    var obj = {};
    bubbles.forEach(function (el) {
      obj[el.getAttribute('data-key')] = el.textContent.trim();
    });
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function enterEdit(el) {
    if (el.classList.contains('editing')) return;
    el.classList.add('editing');
    el.contentEditable = 'true';
    el.focus();
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }

  function exitEdit(el) {
    if (!el.classList.contains('editing')) return;
    el.classList.remove('editing');
    el.contentEditable = 'false';
    save();
  }

  bubbles.forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      enterEdit(el);
    });
    el.addEventListener('blur', function () { exitEdit(el); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        el.blur();
      }
    });
  });

  document.addEventListener('click', function (e) {
    bubbles.forEach(function (el) {
      if (el.classList.contains('editing') && !el.contains(e.target)) {
        exitEdit(el);
      }
    });
  });

  load();
})();
