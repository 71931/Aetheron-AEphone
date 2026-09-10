

/* ===== v154 闹钟模块：主页开关列表 → 完整列表管理 → 编辑向导(时间/循环/命名) ===== */
(function () {
  var ALARM_KEY = 'aetheron_alarm_v154';
  var alarms = [];           // [{hour, minute, enabled, fired, repeat, days:[], lastFire, name}]
  var editIdx = -1;          // 当前编辑下标，-1 新增
  var editRepeat = 'once';   // 编辑草稿 repeat
  var editDays = [];         // 编辑草稿 weekly 选中的星期
  var editDraftHour = 7, editDraftMin = 0; // 编辑草稿时间
  var audioCtx = null, ringTimer = null, audioUnlocked = false;
  var toastTimer = null;
  var REPEAT_LABEL = { once: '不循环', daily: '每天', weekly: '每周' };
  var WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function showToast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---- localStorage 持久化 ---- */
  function saveAlarm() {
    try { localStorage.setItem(ALARM_KEY, JSON.stringify(alarms)); } catch (e) {}
  }

  function normAlarm(a) {
    return {
      hour: typeof a.hour === 'number' ? a.hour : 7,
      minute: typeof a.minute === 'number' ? a.minute : 0,
      enabled: a.enabled !== false,
      fired: false,
      repeat: (a.repeat === 'daily' || a.repeat === 'weekly') ? a.repeat : 'once',
      days: Array.isArray(a.days) ? a.days.slice() : (typeof a.weekday === 'number' ? [a.weekday] : []),
      lastFire: a.lastFire || null,
      name: typeof a.name === 'string' ? a.name.slice(0, 8) : ''
    };
  }

  function loadAlarm() {
    try {
      var raw = localStorage.getItem(ALARM_KEY);
      if (!raw) {
        // v152/v153 数据迁移
        var old = localStorage.getItem('aetheron_alarm_v152');
        if (!old) old = localStorage.getItem('aetheron_alarm_v151');
        raw = old;
      }
      if (!raw) return;
      var obj = JSON.parse(raw);
      var arr = Array.isArray(obj) ? obj : [obj];
      alarms = arr.map(normAlarm);
      if (!alarms.length) alarms = [];
    } catch (e) {
      alarms = [];
    }
  }

  /* ---- 音频解锁 ---- */
  function unlockAudio() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(function () { audioUnlocked = true; }).catch(function () {});
      } else {
        audioUnlocked = true;
      }
      var buf = audioCtx.createBuffer(1, 1, 22050);
      var src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.start(0);
    } catch (e) {}
  }

  function fmtDate(d) {
    return 'Today ' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* ---- 闹钟时间标签 ---- */
  function repeatLabel(a) {
    var rep = a.repeat || 'once';
    if (rep === 'weekly') {
      var days = (Array.isArray(a.days) && a.days.length) ? a.days : [];
      if (!days.length) return '每周';
      return '每周' + days.map(function (d) { return WEEK_CN[d]; }).join('');
    }
    return REPEAT_LABEL[rep] || '不循环';
  }

  function alarmTitle(a) {
    var base = a.name ? a.name : '闹钟';
    return base;
  }

  /* ---- 时间栏显示下一个将响的启用闹钟 ---- */
  function syncAlarmDisplay() {
    var elTime = document.getElementById('ncTimeNow');
    if (!elTime) return;
    var now = new Date();
    var today = todayStr();
    var curMin = now.getHours() * 60 + now.getMinutes();
    var next = null, nextDelta = 1e9;
    alarms.forEach(function (a) {
      if (!a.enabled) return;
      var rep = a.repeat || 'once';
      if (rep === 'once' && a.fired) return;
      if (a.lastFire === today && rep !== 'once') return;
      if (rep === 'weekly') {
        var act = Array.isArray(a.days) && a.days.length;
        if (!act || a.days.indexOf(now.getDay()) < 0) return;
      }
      var m = a.hour * 60 + a.minute;
      var delta = (m - curMin + 1440) % 1440;
      if (delta < nextDelta) { nextDelta = delta; next = a; }
    });
    elTime.textContent = next ? pad(next.hour) + ':' + pad(next.minute) : '--:--';
  }

  function tickClock() {
    var now = new Date();
    var elToday = document.getElementById('ncToday');
    if (elToday && elToday.lastChild && elToday.lastChild.nodeType === 3) {
      elToday.lastChild.textContent = ' ' + fmtDate(now);
    }
    checkAlarm(now);
  }

  /* ---- 响铃检查：遍历所有启用闹钟 ---- */
  function checkAlarm(now) {
    var h = now.getHours(), m = now.getMinutes();
    var today = todayStr();
    alarms.forEach(function (a) {
      if (!a.enabled) return;
      var rep = a.repeat || 'once';
      if (rep === 'once') {
        if (a.fired) return;
      } else if (rep === 'daily') {
        if (a.lastFire === today) return;
      } else if (rep === 'weekly') {
        var act = Array.isArray(a.days) && a.days.length;
        if (!act || a.days.indexOf(now.getDay()) < 0) return;
        if (a.lastFire === today) return;
      }
      if (a.hour === h && a.minute === m) {
        a.fired = true;
        a.lastFire = today;
        fireRing(a);
      }
    });
  }

  function fireRing(a) {
    var pop = document.getElementById('alarmRingPop');
    var tEl = document.getElementById('alarmRingTime');
    var nameEl = document.getElementById('alarmRingName');
    if (tEl) tEl.textContent = pad(a.hour) + ':' + pad(a.minute);
    if (nameEl) nameEl.textContent = a.name || '';
    if (pop) pop.classList.add('show');
    if (navigator.vibrate) {
      try { navigator.vibrate([400, 200, 400, 200, 800]); } catch (e) {}
    }
    startBeep();
  }

  function startBeep() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
      var i = 0;
      ringTimer = setInterval(function () {
        if (!audioCtx || audioCtx.state !== 'running') return;
        var t = audioCtx.currentTime;
        [880, 660].forEach(function (freq) {
          var osc = audioCtx.createOscillator();
          var gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.value = (i % 2 === 0) ? freq : freq * 0.75;
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(0.4, t + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
          osc.connect(gain).connect(audioCtx.destination);
          osc.start(t);
          osc.stop(t + 0.5);
        });
        i++;
      }, 500);
    } catch (e) {}
  }

  function stopRing() {
    var pop = document.getElementById('alarmRingPop');
    if (pop) pop.classList.remove('show');
    if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch (e) {} }
    // 已响过的闹钟 fired/lastFire 在 checkAlarm 中记录，今日不再触发
  }

  /* ---- 视图切换 ---- */
  function showView(name) {
    var home = document.getElementById('alarmHomeView');
    var list = document.getElementById('alarmListView');
    var edit = document.getElementById('alarmEditView');
    if (home) home.hidden = name !== 'home';
    if (list) list.hidden = name !== 'list';
    if (edit) edit.hidden = name !== 'edit';
    if (name === 'list') renderManage();
    if (name === 'home') renderHome();
  }

  /* ---- 主页：已列闹钟 + 开关 ---- */
  function renderHome() {
    var wrap = document.getElementById('alarmHomeList');
    var empty = document.getElementById('alarmHomeEmpty');
    if (!wrap) return;
    wrap.innerHTML = '';
    var showEmpty = document.getElementById('alarmHomeEmpty');
    if (showEmpty) showEmpty.style.display = alarms.length ? 'none' : '';
    alarms.forEach(function (a, idx) {
      var row = document.createElement('div');
      row.className = 'home-alarm-row' + (a.enabled ? '' : ' off');
      var main = document.createElement('div');
      main.className = 'home-alarm-main';
      var time = document.createElement('div');
      time.className = 'home-alarm-time';
      time.textContent = pad(a.hour) + ':' + pad(a.minute);
      var meta = document.createElement('div');
      meta.className = 'home-alarm-meta';
      meta.textContent = alarmTitle(a) + ' · ' + repeatLabel(a);
      main.appendChild(time);
      main.appendChild(meta);
      var sw = document.createElement('label');
      sw.className = 'alarm-switch';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!a.enabled;
      (function (al, i) {
        cb.addEventListener('change', function () {
          al.enabled = cb.checked;
          // 不重置 fired/lastFire：响铃后关闭当日不再响
          saveAlarm();
          if (al.enabled) syncSystemAlarm(al);
          renderHome();
          syncAlarmDisplay();
        });
      })(a, idx);
      var tg = document.createElement('i');
      tg.className = 'alarm-toggle';
      sw.appendChild(cb);
      sw.appendChild(tg);
      row.appendChild(main);
      row.appendChild(sw);
      wrap.appendChild(row);
    });
  }

  /* ---- 完整列表：点击行编辑 / 行内删除 ---- */
  function renderManage() {
    var wrap = document.getElementById('alarmManageList');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!alarms.length) {
      var tip = document.createElement('div');
      tip.className = 'alarm-home-empty';
      tip.textContent = '还没有闹钟';
      wrap.appendChild(tip);
    }
    alarms.forEach(function (a, idx) {
      var row = document.createElement('div');
      row.className = 'mng-alarm-row';
      var body = document.createElement('div');
      body.className = 'mng-alarm-body';
      var time = document.createElement('div');
      time.className = 'mng-alarm-time';
      time.textContent = pad(a.hour) + ':' + pad(a.minute);
      var meta = document.createElement('div');
      meta.className = 'mng-alarm-meta';
      meta.textContent = alarmTitle(a) + ' · ' + (a.enabled ? '已启用' : '已关闭') + ' · ' + repeatLabel(a);
      body.appendChild(time);
      body.appendChild(meta);
      var editBtn = document.createElement('button');
      editBtn.className = 'mng-alarm-edit';
      editBtn.type = 'button';
      editBtn.textContent = '编辑';
      var delBtn = document.createElement('button');
      delBtn.className = 'mng-alarm-del';
      delBtn.type = 'button';
      delBtn.textContent = '删除';
      row.appendChild(body);
      row.appendChild(editBtn);
      row.appendChild(delBtn);
      // 点击行或编辑按钮：进入编辑向导
      function goEdit() {
        openEditor(idx);
      }
      row.addEventListener('click', function (e) {
        if (e.target === delBtn || e.target === editBtn) return;
        goEdit();
      });
      editBtn.addEventListener('click', goEdit);
      // 删除
      delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        alarms.splice(idx, 1);
        saveAlarm();
        renderManage();
        syncAlarmDisplay();
      });
      wrap.appendChild(row);
    });
  }

  /* ---- 编辑向导 ---- */
  function openEditor(idx) {
    editIdx = idx;
    var a = idx >= 0 ? alarms[idx] : null;
    editDraftHour = a ? a.hour : 7;
    editDraftMin = a ? a.minute : 0;
    editRepeat = a ? (a.repeat || 'once') : 'once';
    editDays = a && Array.isArray(a.days) ? a.days.slice() : [];
    var title = document.getElementById('alarmEditTitle');
    if (title) title.textContent = idx >= 0 ? '编辑闹钟' : '添加闹钟';
    // 步骤 1 展示，2/3 隐藏
    showStep(1);
    syncPickerScroll();
    syncRepeatUI();
    syncWeekUI();
    var nameInput = document.getElementById('alarmNameInput');
    if (nameInput) nameInput.value = a ? (a.name || '') : '';
    showView('edit');
  }

  function showStep(n) {
    var s1 = document.getElementById('alarmStepTime');
    var s2 = document.getElementById('alarmStepRepeat');
    var s3 = document.getElementById('alarmStepName');
    if (s1) s1.hidden = n !== 1;
    if (s2) s2.hidden = n !== 2;
    if (s3) s3.hidden = n !== 3;
    if (n === 2) {
      var ww = document.getElementById('alarmWeekWrap');
      if (ww) ww.hidden = editRepeat !== 'weekly';
    }
    if (n === 3) {
      var ni = document.getElementById('alarmNameInput');
      if (ni) { ni.focus(); }
    }
  }

  function syncRepeatUI() {
    var opts = document.querySelectorAll('#alarmRepeat button');
    if (!opts.length) return;
    opts.forEach(function (btn) {
      btn.classList.toggle('on', btn.dataset.r === editRepeat);
    });
    var ww = document.getElementById('alarmWeekWrap');
    if (ww) ww.hidden = editRepeat !== 'weekly';
  }

  function syncWeekUI() {
    var wrap = document.getElementById('alarmWeekOpts');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (var d = 0; d < 7; d++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = WEEK_CN[d];
      b.dataset.d = d;
      b.classList.toggle('on', editDays.indexOf(d) >= 0);
      (function (day) {
        b.addEventListener('click', function () {
          var i = editDays.indexOf(day);
          if (i >= 0) { editDays.splice(i, 1); }
          else { editDays.push(day); }
          syncWeekUI();
        });
      })(d);
      wrap.appendChild(b);
    }
  }

  /* ---- 顶部时间数字刷新（v156 已移除滚轮，仅同步数字） ---- */
  function syncPickerScroll() {
    var hEl = document.getElementById('alarmHour');
    var mEl = document.getElementById('alarmMinute');
    if (hEl && hEl.tagName !== 'INPUT') hEl.textContent = pad(editDraftHour);
    if (mEl && mEl.tagName !== 'INPUT') mEl.textContent = pad(editDraftMin);
  }

  /* ---- 顶部时间数字：点击改为可编辑输入 ---- */
  function bindNumEdit(el, maxVal, setter) {
    if (!el) return;
    el.addEventListener('click', function () {
      var input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.pattern = '[0-9]*';
      input.className = 'alarm-hm-input';
      input.value = el.textContent;
      el.replaceWith(input);
      input.focus();
      input.select();
      function commit() {
        var v = parseInt(input.value, 10);
        if (isNaN(v)) v = 0;
        v = Math.max(0, Math.min(maxVal, v));
        setter(v);
        var span = document.createElement('span');
        span.className = 'alarm-hm';
        span.textContent = pad(v);
        span.style.cursor = 'pointer';
        input.replaceWith(span);
        bindNumEdit(span, maxVal, setter);
        syncPickerScroll();
      }
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      });
    });
  }

  /* ---- 保存 ---- */
  function doSave() {
    var nameEl = document.getElementById('alarmNameInput');
    var name = nameEl ? nameEl.value.trim().slice(0, 8) : '';
    if (editRepeat === 'weekly' && !editDays.length) {
      showToast('请选择每周重复日');
      return;
    }
    var rec = {
      hour: editDraftHour,
      minute: editDraftMin,
      enabled: true,
      fired: false,
      repeat: editRepeat,
      days: editRepeat === 'weekly' ? editDays.slice() : [],
      lastFire: null,
      name: name
    };
    if (editIdx >= 0 && alarms[editIdx]) {
      var old = alarms[editIdx];
      rec.enabled = old.enabled;
      rec.fired = false;
      rec.lastFire = null;   // 重新设定后当天可再次响
      alarms[editIdx] = rec;
    } else {
      // 最多 5 个
      if (alarms.length >= 5) { showToast('最多设置 5 个闹钟'); return; }
      // 查重：同时间已存在则跳到编辑它
      for (var i = 0; i < alarms.length; i++) {
        if (alarms[i].hour === rec.hour && alarms[i].minute === rec.minute) {
          showToast('该时间闹钟已存在');
          openEditor(i);
          return;
        }
      }
      alarms.push(rec);
    }
    saveAlarm();
    // 启用则同步系统闹钟
    alarms.forEach(function (a) { if (a.enabled) syncSystemAlarm(a); });
    unlockAudio();
    stopRing();
    renderHome();
    renderManage();
    syncAlarmDisplay();
    showView('list');
  }

  /* ---- 初始化 ---- */
  function init() {
    loadAlarm();

    var ringBtn = document.getElementById('ncRingBtn');
    if (ringBtn) ringBtn.addEventListener('click', function (e) { e.stopPropagation(); openPop(); });

    // 打开闹钟弹层：展示主页开关列表
    function openPop() {
      unlockAudio();
      renderHome();
      showView('home');
      var pop = document.getElementById('alarmPop');
      if (pop) pop.classList.add('show');
    }
    function closePop() {
      var pop = document.getElementById('alarmPop');
      if (pop) pop.classList.remove('show');
      editIdx = -1;
    }

    var closeBtn = document.getElementById('alarmClose');
    if (closeBtn) closeBtn.addEventListener('click', closePop);
    var closeBtn2 = document.getElementById('alarmClose2');
    if (closeBtn2) closeBtn2.addEventListener('click', closePop);

    // 主页 → 完整列表
    var listBtn = document.getElementById('alarmListBtn');
    if (listBtn) listBtn.addEventListener('click', function () { renderManage(); showView('list'); });
    // 列表 → 主页
    var backHome = document.getElementById('alarmBackHome');
    if (backHome) backHome.addEventListener('click', function () { renderHome(); showView('home'); });
    // 添加按钮：打开编辑向导步骤1
    var addTop = document.getElementById('alarmAddTop');
    if (addTop) addTop.addEventListener('click', function () { openEditor(-1); });
    // 编辑向导：返回列表
    var backList = document.getElementById('alarmBackList');
    if (backList) backList.addEventListener('click', function () {
      editIdx = -1;
      renderManage();
      showView('list');
    });

    // 顶部时间数字点击改写（v156 已移除滚轮）
    bindNumEdit(document.getElementById('alarmHour'), 23, function (v) { editDraftHour = v; });
    bindNumEdit(document.getElementById('alarmMinute'), 59, function (v) { editDraftMin = v; });

    // 步骤1：确定 → 步骤2 循环
    var timeOk = document.getElementById('alarmTimeOk');
    if (timeOk) timeOk.addEventListener('click', function () { showStep(2); syncRepeatUI(); syncWeekUI(); });

    // 循环模式
    var repBtns = document.querySelectorAll('#alarmRepeat button');
    repBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        editRepeat = btn.dataset.r;
        if (editRepeat !== 'weekly') editDays = [];
        syncRepeatUI();
      });
    });

    // 步骤2：下一步 → 步骤3 命名
    var repOk = document.getElementById('alarmRepeatOk');
    if (repOk) repOk.addEventListener('click', function () {
      if (editRepeat === 'weekly' && !editDays.length) {
        showToast('请选择每周重复日');
        return;
      }
      showStep(3);
    });

    // 步骤3：保存
    var saveNew = document.getElementById('alarmSaveNew');
    if (saveNew) saveNew.addEventListener('click', doSave);

    var pop = document.getElementById('alarmPop');
    if (pop) pop.addEventListener('click', function (e) {
      if (e.target === pop) closePop();
    });

    var stopBtn = document.getElementById('alarmRingStop');
    if (stopBtn) stopBtn.addEventListener('click', function () {
      // 停止响铃：当日不再响（fired/lastFire 已在 checkAlarm 置位）
      stopRing();
    });

    /* ---- v152 App 内更新通知（保留） ---- */
    var ncBtn = document.querySelector('.nc-btn');
    var ncMsgEl2 = document.querySelector('.nc-msg');
    function checkAppUpdate() {
      try {
        var cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AetheronUpdate;
        if (!cap || !cap.checkUpdate) return;
        cap.checkUpdate({}).then(function (res) {
          if (!res || !res.hasUpdate) return;
          var note = res.note ? ' ' + res.note : '';
          if (ncMsgEl2) ncMsgEl2.textContent = '发现新版本 v' + res.versionName + '，点击确认更新' + note;
          if (ncBtn) {
            ncBtn.textContent = '更新';
            ncBtn.dataset.update = '1';
          }
        }).catch(function () {});
      } catch (e) {}
    }
    if (ncBtn) {
      ncBtn.addEventListener('click', function () {
        if (ncBtn.dataset.update !== '1') return;
        try {
          var cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AetheronUpdate;
          if (!cap || !cap.downloadAndInstall) return;
          ncBtn.textContent = '下载中…';
          ncBtn.dataset.update = '2';
          cap.downloadAndInstall({}).then(function (r) {
            if (r && r.needPermission) {
              toast('请允许安装未知来源应用后重试');
              ncBtn.textContent = '更新';
              ncBtn.dataset.update = '1';
            } else {
              toast('已开始安装新版本');
            }
          }).catch(function () {
            toast('更新失败，请稍后重试');
            ncBtn.textContent = '更新';
            ncBtn.dataset.update = '1';
          });
        } catch (e) {}
      });
    }
    checkAppUpdate();

    // 切回前台校准
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) tickClock();
    });

    tickClock();
    syncAlarmDisplay();
    setInterval(tickClock, 1000);
  }

  /* ---- Capacitor 系统闹钟 ---- */
  function syncSystemAlarm(a) {
    try {
      var cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AetheronAlarm;
      if (!cap || !cap.setAlarm) return;
      cap.setAlarm({ hour: a.hour, minute: a.minute, repeat: a.repeat || 'once', msg: 'Aetheron 闹钟 ' + pad(a.hour) + ':' + pad(a.minute) }).catch(function () {});
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      try { init(); } catch (e) { window.__aetheronBootErr = e && e.message ? e.message : 'unknown'; }
    });
  } else {
    try { init(); } catch (e) { window.__aetheronBootErr = e && e.message ? e.message : 'unknown'; }
  }

  /* v161 兼容兜底：启动/运行期异常时显示可见红条，避免“按键点了没反应”无从排查 */
  function showBootErr(msg) {
    try {
      var tag = document.getElementById('bootErrTag');
      if (!tag) {
        tag = document.createElement('div');
        tag.id = 'bootErrTag';
        tag.style.cssText = 'position:fixed;left:10px;right:10px;bottom:12px;z-index:999999;background:rgba(140,32,32,0.94);color:#fff;font-size:12px;line-height:1.5;padding:8px 12px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,0.3);';
        document.body.appendChild(tag);
      }
      tag.textContent = 'Aetheron 出错：' + msg + '。请强制刷新（长按刷新按钮）后再试。';
    } catch (e2) {}
  }
  /* v162：错误提示重构——只展示可诊断的本地错误；跨域 Script error. 与资源加载错误一律静默，
     红条自动消失且可点击关闭，不再误导“强制刷新” */
  var __aeErrShown = false;
  function showBootErr(msg) {
    try {
      var tag = document.getElementById('bootErrTag');
      if (!tag) {
        tag = document.createElement('div');
        tag.id = 'bootErrTag';
        tag.style.cssText = 'position:fixed;left:12px;right:12px;bottom:14px;z-index:999999;background:rgba(140,32,32,0.92);color:#fff;font-size:12px;line-height:1.6;padding:10px 30px 10px 12px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,0.3);cursor:pointer;';
        document.body.appendChild(tag);
      }
      tag.textContent = 'Aetheron 出错：' + msg + '（点此关闭，稍后自动消失）';
      tag.onclick = function () { try { tag.style.display = 'none'; } catch (e3) {} };
      clearTimeout(showBootErr._t);
      showBootErr._t = setTimeout(function () { try { tag.style.display = 'none'; } catch (e4) {} }, 600000);
    } catch (e2) {}
  }
  window.addEventListener('error', function (ev) {
    var m = (ev && ev.message) ? String(ev.message) : '';
    if (!m) return;
    if (m === 'Script error.' || m.indexOf('Script error') !== -1) return;
    if (__aeErrShown) return;
    __aeErrShown = true;
    showBootErr(m);
  });
  if (window.__aetheronBootErr) {
    var _bm = String(window.__aetheronBootErr || '');
    setTimeout(function () {
      if (!__aeErrShown && _bm && _bm.indexOf('Script error') === -1) {
        __aeErrShown = true;
        showBootErr(_bm);
      }
    }, 300);
  }
})();
