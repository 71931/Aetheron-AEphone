    // ===== DB 存储层（IndexedDB 主存储 + localStorage 启动兜底） =====
    var DB_NAME = 'ins-home-screen-db';
    var DB_STORE = 'kv';
    var dbCache = {};
    var dbLoaded = false;
    var dbKeep = null;
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
    function dbInit() {
      if (!('indexedDB' in window)) { dbLoaded = true; return; }
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
              for (var i = 0; i < keys.result.length; i++) {
                var k = keys.result[i];
                if (!dbCache.hasOwnProperty(k)) dbCache[k] = all.result[i];
              }
              dbLoaded = true;
              dbPersist();
            };
          };
        };
        req.onerror = function () { dbLoaded = true; };
      } catch (e) { dbLoaded = true; }
    }
    function dbGet(key) {
      if (dbLoaded) return dbCache.hasOwnProperty(key) ? dbCache[key] : null;
      try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function dbSet(key, val) {
      dbCache[key] = val;
      try { localStorage.setItem(key, val); } catch (e) {}
      dbPersist();
    }
    function dbRemove(key) {
      delete dbCache[key];
      try { localStorage.removeItem(key); } catch (e) {}
      dbPersist();
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

