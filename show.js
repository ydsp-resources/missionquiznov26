// Big screen: displays the game AND runs it (timer, scoring). Keep only one big screen open.
'use strict';
const $ = Q.$;
let quiz = null, L = null, players = {}, presence = {}, scores = {}, answers = {};
let ansOff = null, ansKey = '', revealT = null, busy = false;

// ---------- actions (only this page runs the game) ----------
const online = () => Object.keys(players).filter(u => presence[u]);

async function startGame() {
  const order = quiz.questions.filter(Q.playable).map(q => q.id);
  if (!order.length) return warn('Add at least one complete question on the admin page first.');
  const run = ((L && L.run) || 0) + 1;
  await RT.update('', { answers: null, scores: null });
  await startQuestion(0, { order, run });
}
async function startQuestion(i, extra) {
  const order = (extra && extra.order) || Q.arr(L.order);
  const run = (extra && extra.run) || L.run;
  const q = quiz.questions.find(x => x.id === order[i]);
  if (!q) return endGame();
  const qStart = RT.now();
  await RT.set('live', {
    gameId: (L && L.gameId) || Q.uid(), run, order, phase: 'question', qi: i, total: order.length, title: quiz.title,
    q: pubQ(q, run), qStart, endsAt: qStart + q.time * 1000,
  });
}
function pubQ(q, run) { return { key: run + '-' + q.id, id: q.id, text: q.text, time: q.time, options: q.options.map((o, i) => ({ i, o })).filter(x => x.o.trim()) }; }

async function reveal() {
  if (!L || L.phase !== 'question') return;
  clearTimeout(revealT);
  const q = quiz.questions.find(x => x.id === L.q.id);
  const correct = q ? q.correct : -1;
  const T = L.q.time * 1000, counts = [0, 0, 0, 0], up = {};
  let answered = 0;
  for (const uid of Object.keys(players)) {
    const a = answers[uid], prev = scores[uid] || { score: 0, streak: 0 };
    if (prev.last && prev.last.key === L.q.key) continue; // already scored (e.g. second big screen)
    let pts = 0, c = -1;
    if (a && typeof a.c === 'number') {
      c = a.c; counts[c]++; answered++;
      if (c === correct) pts = Math.round(1000 * (1 - Math.min(Math.max(0, (a.at || L.qStart) - L.qStart), T) / T / 2));
    }
    up['scores/' + uid] = { score: (prev.score || 0) + pts, streak: c === correct ? (prev.streak || 0) + 1 : 0, last: { key: L.q.key, c, pts } };
  }
  up['live/phase'] = 'reveal';
  up['live/reveal'] = { correct, correctText: q ? q.options[correct] : '', counts, answered };
  await RT.update('', up);
}
async function next() {
  if (busy || !L) return; busy = true;
  try {
    if (L.phase === 'lobby') await startGame();
    else if (L.phase === 'question') await reveal();
    else if (L.phase === 'reveal') await RT.update('live', { phase: 'board' });
    else if (L.phase === 'board') { if (L.qi + 1 < L.total) await startQuestion(L.qi + 1); else await endGame(); }
    else if (L.phase === 'end') await toLobby();
  } catch (e) { warn('Could not update: ' + (e.code || e.message)); }
  setTimeout(() => busy = false, 300);
}
const endGame = () => RT.update('live', { phase: 'end' });
const toLobby = () => RT.update('', { 'live/phase': 'lobby', 'live/qi': -1, 'live/q': null, 'live/reveal': null, scores: null, answers: null });
const resetGame = () => RT.update('', { live: { phase: 'lobby', gameId: Q.uid(), run: 0, qi: -1, title: quiz.title }, players: null, scores: null, answers: null });
const kick = uid => RT.update('', { ['players/' + uid]: null, ['scores/' + uid]: null });

// Auto-reveal on time-out or when every connected student has answered.
function armTimers() {
  clearTimeout(revealT);
  if (!L || L.phase !== 'question') return;
  revealT = setTimeout(reveal, Math.max(0, L.endsAt - RT.now()) + 300);
  const on = online();
  if (on.length && on.every(u => answers[u])) revealT = setTimeout(reveal, 400);
}
function watchAnswers() {
  const key = L && L.phase === 'question' && L.q ? L.q.key : (L && L.phase === 'reveal' && L.q ? L.q.key : '');
  if (key === ansKey) return;
  if (ansOff) { ansOff(); ansOff = null; }
  ansKey = key; answers = {};
  if (key) ansOff = RT.on('answers/' + key, v => { answers = Q.obj(v); armTimers(); render(); });
}

// Admin edits a question while it is on screen → update what everyone sees.
function syncLiveQuestion() {
  if (!L || !L.q || !quiz || (L.phase !== 'question' && L.phase !== 'reveal')) return;
  const q = quiz.questions.find(x => x.id === L.q.id); if (!q) return;
  const p = pubQ(q, L.run);
  const up = {};
  const sig = x => x.text + '\u0001' + Q.arr(x.options).map(o => o.i + ':' + o.o).join('\u0001');
  // (time limit is not changed mid-question)
  if (sig(p) !== sig(L.q)) { p.time = L.q.time; p.key = L.q.key; up.q = p; }
  if (L.title !== quiz.title) up.title = quiz.title;
  if (L.phase === 'reveal' && L.reveal && L.reveal.correct !== q.correct) { up['reveal/correct'] = q.correct; up['reveal/correctText'] = q.options[q.correct]; }
  if (Object.keys(up).length) RT.update('live', up).catch(() => {});
}

// ---------- rendering ----------
let lastScene = '', lastQ = '', lastJoin = '', stopCd = null, boardFor = '', prevScores = {}, qStartedFor = '', nameKey = '', armKick = '';
const joinUrl = () => (quiz && quiz.joinUrl) || location.href.replace(/[^/]*([?#].*)?$/, '');
function show(name) { if (name === lastScene) return; document.querySelectorAll('.scene').forEach(s => s.classList.toggle('on', s.id === name)); lastScene = name; }
function sizeClass(el, t) { el.classList.toggle('l', t.length > 70); el.classList.toggle('xl', t.length > 130); }

function render() {
  if (!L || !quiz) return;
  const ranks = Q.ranking(players, scores);
  const playable = quiz.questions.filter(Q.playable).length;
  $('#ttl').textContent = quiz.title; document.title = quiz.title + ' · Big Screen';
  const nb = $('#bNext');
  nb.classList.toggle('blink', L.phase === 'lobby');
  nb.textContent = { lobby: 'Start ▸', question: 'Reveal ▸', reveal: 'Leaderboard ▸', board: (L.qi + 1 < L.total ? 'Next question ▸' : 'Final results ▸'), end: 'Play again ⟲' }[L.phase] || 'Next ▸';
  nb.disabled = L.phase === 'lobby' && !playable;
  $('#hint').textContent = L.phase === 'lobby'
    ? (playable ? playable + ' question' + (playable > 1 ? 's' : '') + ' ready · Space to start · click a name twice to remove it' : 'No complete questions yet. Add them on the admin page.')
    : 'Space / → = next';

  if (L.phase === 'lobby') {
    show('lobby');
    const u = joinUrl();
    if (u !== lastJoin) { lastJoin = u; $('#qr').innerHTML = Q.qrSvg(u); $('#url').textContent = u.replace(/^https?:\/\//, '').replace(/\/$/, ''); }
    $('#pcount').innerHTML = ranks.length + '<small>JOINED</small>';
    renderNames(ranks); return;
  }
  if (L.phase === 'question' && L.q) {
    show('question');
    $('#qn').textContent = 'Question ' + (L.qi + 1) + ' / ' + L.total;
    $('#qtm').textContent = L.q.time + 's';
    const opts = Q.arr(L.q.options);
    const key = L.q.key + '|' + L.q.text + '|' + opts.map(o => o.o).join('|');
    if (key !== lastQ) {
      const fresh = !lastQ.startsWith(L.q.key + '|'); lastQ = key;
      $('#qtext').textContent = L.q.text; sizeClass($('#qtext'), L.q.text);
      $('#tiles').innerHTML = opts.map(x => '<div class="tile c' + x.i + '">' + Q.SHAPES[x.i] + '<span>' + Q.esc(x.o) + '</span></div>').join('');
      if (fresh) startRing();
    }
    $('#acount').textContent = Object.keys(answers).length + '/' + online().length;
    return;
  }
  if (stopCd) { stopCd(); stopCd = null; }
  lastQ = '';
  if (L.phase === 'reveal' && L.q && L.reveal) {
    show('reveal');
    const r = L.reveal, counts = Q.arr(r.counts), opts = Q.arr(L.q.options);
    $('#rn').textContent = 'Question ' + (L.qi + 1) + ' / ' + L.total;
    $('#rtm').textContent = (r.answered || 0) + ' answered · ' + (counts[r.correct] || 0) + ' correct';
    $('#rtext').textContent = L.q.text; sizeClass($('#rtext'), L.q.text);
    $('#rtiles').innerHTML = opts.map(x => '<div class="tile c' + x.i + ' ' + (x.i === r.correct ? 'yes' : 'no') + '">' + Q.SHAPES[x.i] + '<span>' + Q.esc(x.o) + '</span><span class="bar"><span class="tick">✓</span>' + (counts[x.i] || 0) + '</span></div>').join('');
    return;
  }
  if (L.phase === 'board' || L.phase === 'reveal') {
    show('board');
    $('#bcode').textContent = '// After question ' + (L.qi + 1) + ' of ' + L.total;
    const key = L.qi + ':' + ranks.map(p => p.uid + p.score).join();
    if (key !== boardFor) {
      boardFor = key;
      $('#lb').innerHTML = ranks.slice(0, 5).map((p, i) => {
        const g = p.score - (prevScores[p.uid] || 0);
        return '<div class="row" style="animation-delay:' + (i * .08) + 's"><span class="r">' + String(p.rank).padStart(2, '0') + '</span><span class="nm">' + Q.esc(p.name) + '</span><span class="gain">' + (g > 0 ? '+' + g : '') + '</span><span class="sc">' + p.score + '</span></div>';
      }).join('') || '<div class="empty">No players</div>';
    }
    return;
  }
  if (L.phase === 'end') {
    if (lastScene !== 'end') {
      const pod = (k, cls) => ranks[k] ? '<div class="pod ' + cls + '"><div class="who">' + Q.esc(ranks[k].name) + '</div><div class="pts">' + ranks[k].score + ' PTS</div><div class="blk">' + (k + 1) + '</div></div>' : '<div class="pod ' + cls + '"></div>';
      $('#podium').innerHTML = pod(1, 'p2') + pod(0, 'p1') + pod(2, 'p3');
    }
    show('end');
  }
}
function renderNames(ranks) {
  const key = ranks.map(p => p.uid + (presence[p.uid] ? 1 : 0)).join() + '|' + armKick;
  if (key === nameKey) return; nameKey = key;
  const box = $('#names');
  if (!ranks.length) { box.innerHTML = '<div class="empty">Waiting for crew to join…</div>'; return; }
  box.querySelector('.empty')?.remove();
  const have = new Map([...box.querySelectorAll('button')].map(b => [b.dataset.uid, b]));
  const order = [...ranks].sort((a, b) => a.name.localeCompare(b.name)), seen = new Set();
  order.forEach((p, idx) => {
    let b = have.get(p.uid);
    if (!b) {
      b = document.createElement('button'); b.dataset.uid = p.uid; b.textContent = p.name; b.title = 'Click twice to remove';
      const nx = order.slice(idx + 1).find(x => have.has(x.uid));
      box.insertBefore(b, nx ? have.get(nx.uid) : null); have.set(p.uid, b);
    }
    b.classList.toggle('off', !presence[p.uid]);
    b.classList.toggle('rm', p.uid === armKick);
    seen.add(p.uid);
  });
  for (const [uid, b] of have) if (!seen.has(uid)) b.remove();
}
$('#names').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (armKick === b.dataset.uid) { kick(armKick); armKick = ''; }
  else { armKick = b.dataset.uid; const k = armKick; setTimeout(() => { if (armKick === k) { armKick = ''; nameKey = ''; render(); } }, 3000); }
  nameKey = ''; render();
});
function startRing() {
  if (stopCd) stopCd();
  const total = L.q.time * 1000, fg = $('#ringfg'), ring = $('#ring'), secs = $('#secs');
  fg.style.transition = 'none'; fg.style.strokeDashoffset = 282.74 * (1 - Math.max(0, L.endsAt - RT.now()) / total);
  void fg.getBoundingClientRect(); fg.style.transition = '';
  stopCd = Q.countdown(L.endsAt, s => {
    secs.textContent = s;
    fg.style.strokeDashoffset = 282.74 * (1 - Math.max(0, (s - 1) / (total / 1000)));
    ring.classList.toggle('low', s <= 5);
  });
}
function warn(m) { const w = $('#warn'); w.textContent = m; w.hidden = false; clearTimeout(warn.t); warn.t = setTimeout(() => w.hidden = true, 4500); }

$('#bNext').onclick = next;
$('#bLobby').onclick = () => toLobby().catch(e => warn(e.message));
$('#bReset').onclick = () => {
  const b = $('#bReset');
  if (b.dataset.arm) { delete b.dataset.arm; b.textContent = 'New game'; resetGame().catch(e => warn(e.message)); }
  else { b.dataset.arm = 1; b.textContent = 'Sure? Click again'; setTimeout(() => { delete b.dataset.arm; b.textContent = 'New game'; }, 3000); }
};
$('#bFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); };
document.addEventListener('keydown', e => {
  if (e.target.closest('input,textarea,select')) return;
  if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
  if (e.key === 'f') $('#bFull').click();
});

// ---------- start ----------
(async () => {
  await Q.requireAdmin();
  RT.onConnected(ok => { $('#dot').className = 'dot ' + (ok ? 'live' : 'off'); $('#stt').textContent = ok ? 'Live' : 'Reconnecting…'; });
  RT.on('quiz', v => {
    if (!v) { RT.set('quiz', Q.DEFAULT_QUIZ()).catch(() => {}); return; }
    quiz = Q.cleanQuiz(v); syncLiveQuestion(); render();
  });
  RT.on('live', v => {
    if (!v) { if (quiz) resetGame(); else setTimeout(() => !L && quiz && resetGame(), 1500); return; }
    L = v;
    if (L.phase === 'question' && L.q && qStartedFor !== L.q.key) { qStartedFor = L.q.key; prevScores = Object.fromEntries(Object.entries(scores).map(([u, s]) => [u, (s || {}).score || 0])); }
    watchAnswers(); armTimers(); syncLiveQuestion(); render();
  });
  RT.on('players', v => { players = Q.obj(v); armTimers(); render(); });
  RT.on('presence', v => { presence = Q.obj(v); armTimers(); render(); });
  RT.on('scores', v => { scores = Q.obj(v); render(); });
})();
