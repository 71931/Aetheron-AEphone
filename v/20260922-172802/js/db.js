    // ===== DB 存储层（v222：IndexedDB 为唯一权威存储，localStorage 只当「开机第一帧」的显示缓存） =====
    var DB_NAME = 'ins-home-screen-db';
    var DB_STORE = 'kv';
    var dbCache = {};
    var dbLoaded = false;
    var dbKeep = null;
    var dbReadyCbs = [];
    var dbIdbKeys = {};        /* IDB 里真实存在的 key（哪怕是空值，也以 DB 为准，绝不拿旧镜像去覆盖） */
    var dbPending = {};        /* IDB 还没读完期间的写入：读完后再按「DB 优先、空值不覆盖」并进来 */
    var dbMirrorFailKeys = {}; /* localStorage 镜像写失败的 key（配额满 / 单条过大），用于「存储自检」 */
    var dbMirrorMaxBytes = 1500 * 1024;
    function dbOnReady(fn) {
      if (typeof fn !== 'function') return;
      if (dbLoaded) { try { fn(); } catch (e) {} return; }
      dbReadyCbs.push(fn);
    }
    function dbFireReady() {
      var cbs = dbReadyCbs.slice();
      dbReadyCbs.length = 0;
      for (var i = 0; i < cbs.length; i++) { try { cbs[i](); } catch (e) {} }
    }
    function dbIsEmptyVal(v) {
      if (v === null || v === undefined) return true;
      var s = String(v);
      return s === '' || s === '[]' || s === '{}' || s === 'null' || s === 'undefined';
    }
    function dbPersist() {
      if (!dbKeep) return;
      try {
        var tx = dbKeep.transaction(DB_STORE, 'readwrite');
        var store = tx.objectStore(DB_STORE);
        for (var k in dbCache) {
          if (dbCache.hasOwnProperty(k)) {
            if (dbCache[k] === null || dbCache[k] === undefined) store.delete(k);
            else store.put(dbCache[k], k);
          }
        }
      } catch (e) {}
    }
    function dbMirrorWrite(key, val) {
      /* v222：镜像只是开机第一帧的显示缓存，写不进去 ≠ 数据丢了（权威数据在 IDB） */
      try {
        if (typeof localStorage === 'undefined') return;
        if (val === null || val === undefined) { localStorage.removeItem(key); delete dbMirrorFailKeys[key]; return; }
        if (String(val).length > dbMirrorMaxBytes) { dbMirrorFailKeys[key] = '单条过大'; return; }
        localStorage.setItem(key, val);
        delete dbMirrorFailKeys[key];
      } catch (e) { dbMirrorFailKeys[key] = '本地缓存已满'; }
    }
    function dbMirrorRefresh() {
      for (var k in dbCache) if (dbCache.hasOwnProperty(k)) dbMirrorWrite(k, dbCache[k]);
    }
    function dbMergeJson(oldVal, newVal) {
      /* IDB 已有值 vs 开机瞬间的新值：数组按 id 合并（新的在前），其余新值优先，但空值不覆盖 */
      if (dbIsEmptyVal(newVal)) return dbIsEmptyVal(oldVal) ? newVal : oldVal;
      try {
        var a = JSON.parse(oldVal), b = JSON.parse(newVal);
        if (Array.isArray(a) && Array.isArray(b)) {
          var seen = {}, out = [];
          var push = function (it, i) {
            var kk = (it && typeof it === 'object') ? String(it.id != null ? it.id : (it.key != null ? it.key : 'i' + i)) : 'v' + String(it);
            if (seen[kk]) return;
            seen[kk] = 1;
            out.push(it);
          };
          for (var i = 0; i < b.length; i++) push(b[i], i);
          for (var j = 0; j < a.length; j++) push(a[j], j);
          return JSON.stringify(out);
        }
      } catch (e) {}
      return newVal;
    }
    function dbInit() {
      if (!('indexedDB' in window)) { dbLoaded = true; dbFireReady(); return; }
      try {
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        };
        req.onsuccess = function (e) {
          dbKeep = e.target.result;
          var tx = dbKeep.transaction(DB_STORE, 'readonly');
          var store = tx.objectStore(DB_STORE);
          var all = store.getAll();
          var keys = store.getAllKeys();
          all.onsuccess = function () {
            keys.onsuccess = function () {
              var idbVal = {};
              for (var i = 0; i < keys.result.length; i++) {
                var k = keys.result[i];
                idbVal[k] = all.result[i];
                dbIdbKeys[k] = true;
              }
              /* ① DB 里已有的数据一律为准，直接盖掉内存里的旧值 / 空值（刷新丢数据的根因就在这） */
              for (var k1 in idbVal) if (idbVal.hasOwnProperty(k1)) dbCache[k1] = idbVal[k1];
              /* ② 开机瞬间写进来的新值，按「DB 优先 · 空值不覆盖」并进来；显式删除以删除为准 */
              for (var k2 in dbPending) {
                if (!dbPending.hasOwnProperty(k2)) continue;
                if (dbPending[k2] === null) { delete dbCache[k2]; delete dbIdbKeys[k2]; continue; }
                dbCache[k2] = dbMergeJson(dbCache.hasOwnProperty(k2) ? dbCache[k2] : null, dbPending[k2]);
              }
              dbPending = {};
              dbLoaded = true;
              dbPersist();                                   /* 把并好的最新数据落进 DB */
              dbMirrorRefresh();                             /* 再刷一遍开机镜像（能做就做） */
              for (var k3 in dbCache) if (dbCache.hasOwnProperty(k3)) dbIdbKeys[k3] = true;
              dbFireReady();                                 /* 通知上层：数据齐了，可以按 DB 回读刷新界面 */
            };
          };
        };
        req.onerror = function () { dbLoaded = true; dbFireReady(); };
      } catch (e) { dbLoaded = true; dbFireReady(); }
    }
    function dbGet(key) {
      if (dbLoaded) {
        /* v222：DB 有这条记录（哪怕是空）→ 以 DB 为准，绝不拿过期镜像把数据「复活」回来 */
        if (dbIdbKeys[key]) return dbCache.hasOwnProperty(key) ? dbCache[key] : null;
        if (dbCache.hasOwnProperty(key) && !dbIsEmptyVal(dbCache[key])) return dbCache[key];
        try { var lv2 = localStorage.getItem(key); if (lv2 !== null && !dbIsEmptyVal(lv2)) { dbCache[key] = lv2; dbIdbKeys[key] = true; dbPersist(); return lv2; } } catch (e2) {}
        return dbCache.hasOwnProperty(key) ? dbCache[key] : null;
      }
      if (dbCache.hasOwnProperty(key) && !dbIsEmptyVal(dbCache[key])) return dbCache[key];
      try { var lv = localStorage.getItem(key); if (lv !== null && !dbIsEmptyVal(lv)) { dbCache[key] = lv; return lv; } } catch (e) {}
      return dbCache.hasOwnProperty(key) ? dbCache[key] : null;
    }
    function dbSet(key, val) {
      if (!dbLoaded) {
        /* v222：DB 没读完之前，空值不许盖掉内存里的旧值；非空值先记着，读完再并入 */
        if (dbIsEmptyVal(val) && dbCache.hasOwnProperty(key) && !dbIsEmptyVal(dbCache[key])) return;
        dbPending[key] = val;
      }
      dbCache[key] = val;
      dbMirrorWrite(key, val);
      if (dbLoaded) dbPersist();
    }
    function dbRemove(key) {
      if (!dbLoaded) dbPending[key] = null;
      delete dbCache[key];
      delete dbIdbKeys[key];
      dbMirrorWrite(key, null);
      if (dbLoaded) dbPersist();
    }
    function dbKeys() {
      if (dbLoaded) {
        var out = [];
        for (var k in dbCache) if (dbCache.hasOwnProperty(k)) out.push(k);
        return out;
      }
      var res = [];
      try { for (var i = 0; i < localStorage.length; i++) res.push(localStorage.key(i)); } catch (e) {}
      return res;
    }
    function dbFlush() { if (dbLoaded) dbPersist(); }
    function dbStats() {
      var out = { idb: ('indexedDB' in window), loaded: dbLoaded, keys: 0, bytes: 0, mirrorFails: [], big: [] };
      try {
        for (var k in dbCache) {
          if (!dbCache.hasOwnProperty(k)) continue;
          out.keys++;
          var n = (dbCache[k] === null || dbCache[k] === undefined) ? 0 : String(dbCache[k]).length;
          out.bytes += n;
          if (n > dbMirrorMaxBytes) out.big.push({ key: k, bytes: n });
        }
        for (var f in dbMirrorFailKeys) if (dbMirrorFailKeys.hasOwnProperty(f)) out.mirrorFails.push({ key: f, why: dbMirrorFailKeys[f] });
      } catch (e) {}
      return out;
    }
    function dbMigrate() {
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf('ins-') === 0 && !dbCache.hasOwnProperty(k)) {
            dbCache[k] = localStorage.getItem(k);
          }
        }
      } catch (e) {}
    }
    dbMigrate();
    dbInit();
