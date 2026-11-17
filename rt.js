// Realtime data layer. Wraps Firebase Realtime Database + Auth behind a small API
// so the pages stay simple:
//   await RT.ready            -> resolves once Firebase is loaded
//   RT.onAuth(fn)             -> fn(user|null)   user = {uid, anonymous}
//   RT.signInAnon(), RT.signInEmail(email, pw), RT.signOut()
//   RT.on(path, fn) -> unsubscribe     fn(value) on every change
//   RT.get(path), RT.set(path, v), RT.update(path, obj), RT.remove(path)
//   RT.TS                     -> server-timestamp placeholder
//   RT.now()                  -> best estimate of server time (ms)
//   RT.onConnected(fn)        -> fn(true|false)
//   RT.presence(path)         -> keeps path=true while this tab is connected
'use strict';
(function () {
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const RT = window.RT = {};
  let offset = 0;
  RT.now = () => Date.now() + offset;

  async function loadFirebase() {
    const [appM, dbM, authM] = await Promise.all([
      import(SDK + 'firebase-app.js'), import(SDK + 'firebase-database.js'), import(SDK + 'firebase-auth.js'),
    ]);
    const app = appM.initializeApp(window.FIREBASE_CONFIG);
    const db = dbM.getDatabase(app);
    const auth = authM.getAuth(app);
    const r = p => dbM.ref(db, p || undefined);
    RT.TS = dbM.serverTimestamp();
    RT.onAuth = fn => authM.onAuthStateChanged(auth, u => fn(u ? { uid: u.uid, anonymous: u.isAnonymous, email: u.email } : null));
    RT.signInAnon = () => authM.signInAnonymously(auth);
    RT.signInEmail = (e, p) => authM.signInWithEmailAndPassword(auth, e, p);
    RT.signOut = () => authM.signOut(auth);
    RT.on = (path, fn, onErr) => dbM.onValue(r(path), s => fn(s.val()), e => { console.warn('read', path, e.code); onErr && onErr(e); });
    RT.get = async path => (await dbM.get(r(path))).val();
    RT.set = (path, v) => dbM.set(r(path), v);
    RT.update = (path, obj) => dbM.update(r(path), obj);
    RT.remove = path => dbM.remove(r(path));
    RT.onConnected = fn => dbM.onValue(r('.info/connected'), s => fn(!!s.val()));
    dbM.onValue(r('.info/serverTimeOffset'), s => { offset = s.val() || 0; });
    RT.presence = path => dbM.onValue(r('.info/connected'), s => {
      if (!s.val()) return;
      dbM.onDisconnect(r(path)).remove().then(() => dbM.set(r(path), true)).catch(() => {});
    });
  }

  // Local stand-in used only for automated testing (window.RT_MOCK = true).
  async function loadMock() {
    const cid = Math.random().toString(36).slice(2);
    const subs = new Map(); let sid = 0; let authCb = []; let user = null; const connCbs = [];
    const es = new EventSource('/mock/stream?cid=' + cid);
    es.onopen = () => connCbs.forEach(f => f(true));
    es.onerror = () => connCbs.forEach(f => f(false));
    es.onmessage = e => { const m = JSON.parse(e.data); const s = subs.get(m.sid); if (s) s(m.val); };
    const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ cid }, b)) }).then(r => r.json());
    await new Promise(res => { if (es.readyState === 1) res(); else es.addEventListener('open', res, { once: true }); });
    RT.TS = { '.sv': 'timestamp' };
    const setUser = u => { user = u; authCb.forEach(f => f(u)); };
    RT.onAuth = fn => { authCb.push(fn); setTimeout(() => fn(user), 0); return () => {}; };
    RT.signInAnon = async () => { let id = localStorage.getItem('mockuid'); if (!id) { id = 'u' + cid; localStorage.setItem('mockuid', id); } setUser({ uid: id, anonymous: true }); };
    RT.signInEmail = async (e, p) => { if (p !== 'test') throw { code: 'auth/wrong-password' }; setUser({ uid: 'admin', anonymous: false, email: e }); };
    RT.signOut = async () => setUser(null);
    RT.on = (path, fn) => { const id = ++sid; subs.set(id, fn); post('/mock/sub', { sid: id, path }); return () => { subs.delete(id); post('/mock/unsub', { sid: id }); }; };
    RT.get = path => post('/mock/get', { path }).then(r => r.val);
    RT.set = (path, v) => post('/mock/write', { op: 'set', path, val: v });
    RT.update = (path, v) => post('/mock/write', { op: 'update', path, val: v });
    RT.remove = path => post('/mock/write', { op: 'set', path, val: null });
    RT.onConnected = fn => { connCbs.push(fn); fn(es.readyState === 1); };
    RT.presence = path => { post('/mock/ondisc', { path }); RT.set(path, true); };
  }

  RT.ready = (window.RT_MOCK ? loadMock() : loadFirebase()).catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;inset:auto 0 0 0;padding:12px;background:#5a1016;color:#fff;font:14px sans-serif;z-index:999">Could not load the quiz service. Check the internet connection and reload.</div>');
    throw e;
  });
})();
