const LocalStore = (() => {
  let db;
  const empty = () => ({schema: 1, revision: 0, bank: [], events: [], favorites: {}, session: null});

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('fire-drill-2026', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('study');
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('请关闭其他练习册页面后重试。'));
      request.onsuccess = () => {
        db = request.result;
        db.onversionchange = () => db.close();
        resolve();
      };
    });
  }

  function read() {
    return new Promise((resolve, reject) => {
      const request = db.transaction('study').objectStore('study').get('state');
      request.onsuccess = () => resolve(request.result || empty());
      request.onerror = () => reject(request.error);
    });
  }

  function change(revision, update) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('study', 'readwrite');
      const store = tx.objectStore('study');
      const request = store.get('state');
      let next, failure;
      request.onsuccess = () => {
        try {
          next = request.result || empty();
          if (next.revision !== revision) {
            failure = new Error('另一个页面已保存新记录。已刷新本页，请重试。');
            failure.conflict = true;
            tx.abort();
            return;
          }
          update(next);
          next.revision++;
          store.put(next, 'state');
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(next);
      tx.onabort = () => reject(failure || tx.error || new Error('保存失败'));
    });
  }

  return {open, read, change};
})();
