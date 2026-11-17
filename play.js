// Student phone page
'use strict';
const $ = Q.$;
let uid = '', L = null, me = null, players = {}, scores = {}, view = '', joinedOnce = false, joinedGame = '';
let stopCd = null, qKey = '';

function go(v) { if (v === view) return; document.querySelectorAll('.v').forEach(x => x.classList.toggle('on', x.id === v)); view = v; }
const pickedKey = () => Q.ls('ydsp-picked') || '';

$('#nick').value = Q.ls('ydsp-quiz-nick') || '';
$('#jf').onsubmit = async e => {
  e.preventDefault();
  const b = e.target.querySelector('button'), err = $('#jerr');
  const name = $('#nick').value.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  err.textContent = '';
  if (!name) { err.textContent = 'Enter a nickname.'; return; }
  if (!uid || !L) { err.textContent = 'Still connecting… try again in a moment.'; return; }
  if (Object.entries(players).some(([u, p]) => u !== uid && p && p.name && p.name.toLowerCase() === name.toLowerCase())) { err.textContent = 'That nickname is taken. Try another.'; return; }
  b.disabled = true;
  try {
    await RT.set('players/' + uid, { name, gameId: L.gameId || '', at: RT.TS });
    Q.ls('ydsp-quiz-nick', name); $('#nick').blur();
  } catch (ex) { err.textContent = 'Could not join (' + (ex.code || ex.message) + '). Check your internet.'; }
  b.disabled = false;
};

function render() {
  if (!L) return;
  if (!me) {
    if (joinedOnce && L.gameId === joinedGame) { go('vKicked'); return; }
    $('#jt').innerHTML = Q.esc(L.title || 'Mission Quiz').replace(/^(\S+)\s+(.+)$/, '$1<span>$2</span>');
    go('vJoin'); return;
  }
  const ranks = Q.ranking(players, scores);
  const mine = ranks.find(r => r.uid === uid) || { score: 0, rank: ranks.length, streak: 0 };
  const sc = scores[uid] || {};
  $('#me').textContent = me.name;
  $('#sc').textContent = L.phase === 'lobby' ? '' : mine.score + ' pts';

  if (L.phase === 'lobby' || !L.q && L.phase !== 'end') {
    $('#wc').textContent = "You're in"; $('#wn').textContent = me.name;
    $('#ws').textContent = 'See your name on the big screen. The mission starts soon.';
    go('vWait'); return;
  }
  if (L.phase === 'question') {
    const opts = Q.arr(L.q.options);
    if (pickedKey() === L.q.key) {
      if (stopCd) { stopCd(); stopCd = null; }
      $('#wc').textContent = 'Answer locked in'; $('#wn').textContent = 'Stand by';
      $('#ws').textContent = 'Waiting for the rest of the crew…';
      go('vWait'); qKey = ''; return;
    }
    const key = L.q.key + '|' + L.q.text + '|' + opts.map(o => o.o).join('|');
    if (key !== qKey) {
      const fresh = !qKey.startsWith(L.q.key + '|'); qKey = key;
      $('#qn').textContent = 'Q' + (L.qi + 1) + '/' + L.total;
      $('#qt').textContent = L.q.text;
      const box = $('#opts');
      box.className = 'opts' + (opts.length <= 2 ? ' two' : '');
      box.innerHTML = opts.map(x => '<button class="opt c' + x.i + '" data-i="' + x.i + '">' + Q.SHAPES[x.i] + '<span>' + Q.esc(x.o) + '</span></button>').join('');
      if (fresh) timer();
    }
    go('vQ'); return;
  }
  if (stopCd) { stopCd(); stopCd = null; }
  qKey = '';
  if ((L.phase === 'reveal' || L.phase === 'board') && L.reveal) {
    const last = sc.last && sc.last.key === L.q.key ? sc.last : null;
    if (!last) { $('#wc').textContent = 'Checking answers'; $('#wn').textContent = '…'; $('#ws').textContent = ''; go('vWait'); return; }
    const cls = last.c < 0 ? 'none' : (last.c === L.reveal.correct ? 'ok' : 'bad');
    const head = { ok: 'Correct', bad: 'Incorrect', none: "Time's up" }[cls];
    const icon = { ok: '✓', bad: '✕', none: '…' }[cls];
    let extra = '';
    if (L.phase === 'board') {
      if (mine.rank === 1) extra = '<div class="sub">You are leading the mission!</div>';
      else { const ab = ranks[mine.rank - 2]; if (ab) extra = '<div class="sub">' + (ab.score - mine.score) + ' pts behind ' + Q.esc(ab.name) + '</div>'; }
    }
    $('#res').className = 'res ' + cls;
    $('#res').innerHTML = '<div class="icon">' + icon + '</div><div class="big">' + head + '</div>' +
      (cls === 'ok' ? '<div class="pts">+' + last.pts + '</div>' : '<div class="sub">Answer: ' + Q.esc(L.reveal.correctText) + '</div>') +
      '<div class="pill">' + Q.ordinal(mine.rank) + ' of ' + ranks.length + (mine.streak > 1 ? ' · streak ' + mine.streak : '') + '</div>' + extra;
    go('vR'); return;
  }
  if (L.phase === 'end') {
    $('#erank').textContent = Q.ordinal(mine.rank);
    $('#epts').textContent = mine.score + ' pts';
    $('#emsg').textContent = mine.rank <= 3 ? 'On the podium — well done!' : 'Thanks for playing, crew!';
    go('vEnd');
  }
}

function timer() {
  if (stopCd) stopCd();
  const total = L.q.time * 1000, left = Math.max(0, L.endsAt - RT.now());
  const fill = $('#fill');
  fill.style.transition = 'none'; fill.style.transform = 'scaleX(' + (left / total) + ')';
  void fill.offsetWidth;
  fill.style.transition = 'transform ' + (left / 1000) + 's linear'; fill.style.transform = 'scaleX(0)';
  stopCd = Q.countdown(L.endsAt, s => { $('#qs').textContent = s; });
}

$('#opts').addEventListener('click', async e => {
  const b = e.target.closest('.opt'); if (!b || !L || L.phase !== 'question' || pickedKey() === L.q.key) return;
  const key = L.q.key, c = +b.dataset.i;
  Q.ls('ydsp-picked', key);
  b.classList.add('pick'); $('#opts').classList.add('done');
  navigator.vibrate?.(30);
  setTimeout(render, 180);
  for (let i = 0; i < 3; i++) {
    try { await RT.set('answers/' + key + '/' + uid, { c, at: RT.TS }); break; }
    catch (err) { if (/permission/i.test(err.code || err.message || '')) break; await new Promise(r => setTimeout(r, 500)); }
  }
});

(async () => {
  await RT.ready;
  let offT = null;
  RT.onConnected(ok => { clearTimeout(offT); if (ok) $('#conn').hidden = true; else offT = setTimeout(() => $('#conn').hidden = false, 2000); });
  RT.onAuth(async u => {
    if (!u) { RT.signInAnon().catch(e => { $('#jerr').textContent = 'Could not connect (' + (e.code || e.message) + ').'; }); return; }
    if (uid === u.uid) return;
    uid = u.uid;
    RT.on('live', v => { L = v; render(); });
    RT.on('players', v => {
      players = Q.obj(v);
      const was = !!me; me = players[uid] || null;
      if (me && !was) { joinedOnce = true; joinedGame = me.gameId || ''; RT.presence('presence/' + uid); try { navigator.wakeLock?.request('screen').catch(() => {}); } catch {} }
      render();
    });
    RT.on('scores', v => { scores = Q.obj(v); render(); });
  });
})();
$('#rejoin').onclick = () => { joinedOnce = false; render(); };
