// Shared helpers for show / admin / play pages
'use strict';
const Q = {
  SHAPES: [
    '<svg class="shape" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 23 21.5H1z"/></svg>',
    '<svg class="shape" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1 23 12 12 23 1 12z"/></svg>',
    '<svg class="shape" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11"/></svg>',
    '<svg class="shape" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20"/></svg>',
  ],
  LETTERS: ['A', 'B', 'C', 'D'],
  TIMES: [5, 10, 15, 20, 30, 45, 60, 90, 120],
  esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  $(s, r) { return (r || document).querySelector(s); },
  ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; } },
  uid() { return Math.random().toString(36).slice(2, 10); },
  // Firebase returns arrays as objects when they have gaps; normalise.
  arr(x) { if (Array.isArray(x)) return x; if (!x || typeof x !== 'object') return []; return Object.keys(x).sort((a, b) => a - b).map(k => x[k]); },
  obj(x) { return x && typeof x === 'object' ? x : {}; },

  DEFAULT_QUIZ() {
    const blank = () => ({ id: Q.uid(), text: '', options: ['', '', '', ''], correct: 0, time: 20 });
    return {
      title: 'YDSP Mission Quiz', joinUrl: '', autoEnd: true,
      questions: [
        { id: Q.uid(), text: "What is DSTA's full name?", options: ['Defence Science and Technology Agency', 'Defence Systems and Technology Authority', 'Defence Science and Tactics Academy', 'Digital Security and Technology Agency'], correct: 0, time: 20 },
        { id: Q.uid(), text: 'Who is the CE (Chief Executive) of DSTA?', options: ['', '', '', ''], correct: 0, time: 20 },
        ...Array.from({ length: 8 }, blank),
      ],
    };
  },
  cleanQuiz(q) {
    q = Q.obj(q);
    const s = (v, n) => String(v == null ? '' : v).slice(0, n);
    return {
      title: s(q.title, 80) || 'YDSP Mission Quiz',
      joinUrl: s(q.joinUrl, 300),
      autoEnd: q.autoEnd !== false,
      questions: Q.arr(q.questions).filter(Boolean).slice(0, 50).map(x => {
        const opts = Q.arr(x.options).slice(0, 4).map(o => s(o, 90)); while (opts.length < 4) opts.push('');
        return { id: /^[\w-]{4,20}$/.test(x.id || '') ? x.id : Q.uid(), text: s(x.text, 240), options: opts,
          correct: Math.max(0, Math.min(3, Number(x.correct) | 0)), time: Q.TIMES.includes(Number(x.time)) ? Number(x.time) : 20 };
      }),
    };
  },
  playable(q) { return q.text.trim() && q.options.filter(o => o.trim()).length >= 2 && q.options[q.correct].trim(); },

  // Admin login (big screen + admin page). Resolves with the signed-in admin user.
  async requireAdmin() {
    await RT.ready;
    const isAdmin = async () => { try { await RT.get('quiz'); return true; } catch { return false; } };
    const claim = async u => { try { await RT.set('admins/' + u.uid, true); } catch {} };
    const user = await new Promise(res => { const off = RT.onAuth(u => { res(u); off && off(); }); });
    if (user && !user.anonymous && await isAdmin()) return user;
    if (user) await RT.signOut();
    return new Promise(resolve => {
      const g = document.createElement('div');
      g.className = 'gate';
      g.innerHTML = '<form class="frame"><div class="sil" style="color:var(--orange);font-size:12px">Restricted · Mission control</div><h2>Admin sign-in</h2>' +
        '<input type="email" placeholder="Email" autocomplete="username" aria-label="Email" style="font-family:Outfit,sans-serif;font-size:17px;letter-spacing:0;margin-bottom:8px">' +
        '<input type="password" placeholder="Password" autocomplete="current-password" aria-label="Password" style="font-family:Outfit,sans-serif;font-size:17px;letter-spacing:0">' +
        '<div class="err"></div><button class="btn go">Sign in</button></form>';
      document.body.appendChild(g);
      const [em, pw] = g.querySelectorAll('input'), err = g.querySelector('.err'), btn = g.querySelector('button');
      em.value = Q.ls('ydsp-admin-email') || ''; (em.value ? pw : em).focus();
      g.querySelector('form').onsubmit = async e => {
        e.preventDefault(); err.textContent = ''; btn.disabled = true;
        try {
          await RT.signInEmail(em.value.trim(), pw.value);
          Q.ls('ydsp-admin-email', em.value.trim());
          const u = await new Promise(res => { const off = RT.onAuth(x => { if (x) { res(x); off && off(); } }); });
          await claim(u);
          if (await isAdmin()) { g.remove(); resolve(u); }
          else { err.textContent = 'This account is not the quiz admin.'; await RT.signOut(); }
        } catch (ex) {
          const c = String(ex && ex.code || '');
          err.textContent = /password|credential|user-not-found|invalid/.test(c) ? 'Wrong email or password.' : /network/.test(c) ? 'No internet connection.' : 'Could not sign in (' + c + ').';
        }
        btn.disabled = false;
      };
    });
  },

  countdown(endsAtServer, onTick) {
    let raf = 0, lastS = -1;
    const step = () => {
      const left = Math.max(0, endsAtServer - RT.now());
      const s = Math.ceil(left / 1000);
      if (s !== lastS) { lastS = s; onTick(s, left); }
      if (left > 0) raf = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(raf);
  },
  qrSvg(text) {
    try {
      const q = new QRCodeLib.QRCode(-1, QRCodeLib.ECL.M);
      q.addData(text); q.make();
      const n = q.getModuleCount(); let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
      return '<svg viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/><path d="' + d + '" fill="#050B1A"/></svg>';
    } catch (e) { return ''; }
  },
  ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); },
  // Ranking used everywhere: score desc, then name.
  ranking(players, scores) {
    return Object.entries(Q.obj(players)).filter(([, p]) => p && p.name).map(([uid, p]) => ({ uid, name: p.name, score: (Q.obj(scores)[uid] || {}).score || 0, streak: (Q.obj(scores)[uid] || {}).streak || 0 }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).map((p, i) => Object.assign(p, { rank: i + 1 }));
  },
};
