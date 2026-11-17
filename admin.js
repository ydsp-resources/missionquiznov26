// Admin page: edit questions; every change is pushed live to the big screen.
'use strict';
const $ = Q.$;
let quiz = null, L = null, players = {}, presence = {}, scores = {};
let dirty = false, saving = false, saveT = null, lastSent = '', armKick = '';

function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600); }
function setSave(cls, txt) { const s = $('#save'); s.className = 'save ' + cls; s.textContent = txt; }

// ---- editor ----
function renderAll() {
  $('#title').value = quiz.title; $('#joinUrl').value = quiz.joinUrl || '';
  $('#h1').textContent = quiz.title;
  $('#qs').innerHTML = quiz.questions.map(cardHTML).join('');
  quiz.questions.forEach((q, i) => refreshCard(i));
}
function cardHTML(q, i) {
  return '<div class="frame qc" data-i="' + i + '">' +
    '<div class="qh"><span class="no">Q' + String(i + 1).padStart(2, '0') + '</span><span class="badge"></span><span class="sp"></span>' +
    '<select data-f="time" title="Time limit">' + Q.TIMES.map(t => '<option value="' + t + '"' + (t === q.time ? ' selected' : '') + '>' + t + ' s</option>').join('') + '</select>' +
    '<button class="ib" data-a="up" title="Move up">▲</button><button class="ib" data-a="down" title="Move down">▼</button><button class="ib del" data-a="del" title="Delete">✕</button></div>' +
    '<textarea class="qtext" data-f="text" rows="2" maxlength="240" placeholder="Type the question…">' + Q.esc(q.text) + '</textarea>' +
    '<div class="opts">' + q.options.map((o, k) =>
      '<div class="opt c' + k + '"><span class="sw">' + Q.SHAPES[k] + '</span><input type="text" data-f="opt" data-k="' + k + '" maxlength="90" value="' + Q.esc(o) + '" placeholder="Option ' + Q.LETTERS[k] + (k > 1 ? ' (optional)' : '') + '">' +
      '<label title="Mark as correct answer"><input type="radio" name="c' + i + '" data-f="correct" value="' + k + '"' + (q.correct === k ? ' checked' : '') + '>✓</label></div>').join('') +
    '</div></div>';
}
function refreshCard(i) {
  const card = $('#qs').children[i]; if (!card) return;
  const q = quiz.questions[i];
  const live = L && L.q && L.q.id === q.id && (L.phase === 'question' || L.phase === 'reveal');
  card.classList.toggle('live', !!live);
  const b = card.querySelector('.badge');
  b.className = 'badge ' + (live ? 'on' : Q.playable(q) ? 'ok' : 'inc');
  b.textContent = live ? 'On screen now' : Q.playable(q) ? 'Ready' : 'Incomplete';
  card.querySelectorAll('.opt').forEach((el, k) => el.classList.toggle('right', q.correct === k));
}
$('#qs').addEventListener('input', e => {
  const card = e.target.closest('.qc'); if (!card) return;
  const i = +card.dataset.i, q = quiz.questions[i], f = e.target.dataset.f;
  if (f === 'text') q.text = e.target.value;
  else if (f === 'opt') q.options[+e.target.dataset.k] = e.target.value;
  else if (f === 'correct') q.correct = +e.target.value;
  else if (f === 'time') q.time = +e.target.value;
  refreshCard(i); queueSave(f === 'correct' || f === 'time' ? 0 : 350);
});
$('#qs').addEventListener('click', e => {
  const btn = e.target.closest('.ib'); if (!btn) return;
  const i = +btn.closest('.qc').dataset.i, a = btn.dataset.a, qs = quiz.questions;
  if (a === 'up' && i > 0) [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]];
  else if (a === 'down' && i < qs.length - 1) [qs[i + 1], qs[i]] = [qs[i], qs[i + 1]];
  else if (a === 'del') {
    if (!btn.dataset.arm) { btn.dataset.arm = 1; btn.textContent = '?'; btn.title = 'Click again to delete'; setTimeout(() => { delete btn.dataset.arm; btn.textContent = '✕'; }, 2500); return; }
    qs.splice(i, 1);
  } else return;
  renderAll(); queueSave(0);
});
$('#add').onclick = () => { quiz.questions.push({ id: Q.uid(), text: '', options: ['', '', '', ''], correct: 0, time: 20 }); renderAll(); queueSave(0); $('#qs').lastElementChild.querySelector('textarea').focus(); };
$('#title').oninput = e => { quiz.title = e.target.value; $('#h1').textContent = quiz.title || 'Mission Quiz'; queueSave(400); };
$('#joinUrl').oninput = e => { quiz.joinUrl = e.target.value.trim(); queueSave(600); };

function queueSave(ms) { if (quiz) $('#gR').textContent = quiz.questions.filter(Q.playable).length + ' of ' + quiz.questions.length; dirty = true; setSave('busy', '· Saving…'); clearTimeout(saveT); saveT = setTimeout(flush, ms); }
async function flush() {
  if (saving) { saveT = setTimeout(flush, 150); return; }
  saveT = null;
  const clean = Q.cleanQuiz(quiz), body = JSON.stringify(clean);
  if (body === lastSent) { dirty = false; setSave('ok', '· Saved · live'); return; }
  saving = true;
  try {
    await RT.set('quiz', clean);
    lastSent = body;
    if (!saveT) { dirty = false; setSave('ok', '· Saved · live'); }
  } catch (e) {
    setSave('err', '· Not saved — ' + (e.code || e.message)); saveT = setTimeout(flush, 2000);
  }
  saving = false;
}

// ---- export / import ----
$('#exp').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(Q.cleanQuiz(quiz), null, 2)], { type: 'application/json' }));
  a.download = 'mission-quiz-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#imp').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.questions)) throw 0; quiz = Q.cleanQuiz(d); renderAll(); queueSave(0); toast('Imported ' + quiz.questions.length + ' questions'); }
  catch { toast('That file is not a quiz export.'); }
  e.target.value = '';
};

// ---- live game panel ----
const PH = { lobby: 'Lobby', question: 'Question live', reveal: 'Answer shown', board: 'Leaderboard', end: 'Finished' };
function renderGame() {
  const ranks = Q.ranking(players, scores), on = ranks.filter(p => presence[p.uid]).length;
  $('#gPhase').textContent = L ? (PH[L.phase] || L.phase) : '—';
  $('#gQ').textContent = L && L.qi >= 0 && L.phase !== 'lobby' ? (L.qi + 1) + ' / ' + L.total : '—';
  $('#gP').textContent = on + (ranks.length > on ? ' (+' + (ranks.length - on) + ' away)' : '');
  if (quiz) $('#gR').textContent = quiz.questions.filter(Q.playable).length + ' of ' + quiz.questions.length;
  $('#plist').innerHTML = ranks.map(p => '<div data-uid="' + p.uid + '"' + (armKick === p.uid ? ' class="rm"' : '') + '><span>' + (armKick === p.uid ? 'Click again to remove ' : p.rank + '. ') + Q.esc(p.name) + (presence[p.uid] ? '' : ' <i>(away)</i>') + '</span><i>' + p.score + '</i></div>').join('');
  if (quiz) quiz.questions.forEach((q, i) => refreshCard(i));
}
$('#plist').addEventListener('click', e => {
  const d = e.target.closest('[data-uid]'); if (!d) return;
  const u = d.dataset.uid;
  if (armKick === u) { RT.update('', { ['players/' + u]: null, ['scores/' + u]: null }).catch(err => toast(err.message)); armKick = ''; }
  else { armKick = u; setTimeout(() => { if (armKick === u) { armKick = ''; renderGame(); } }, 3000); }
  renderGame();
});
$('#cLobby').onclick = () => RT.update('', { 'live/phase': 'lobby', 'live/qi': -1, 'live/q': null, 'live/reveal': null, scores: null, answers: null }).then(() => toast('Back to lobby — scores cleared')).catch(e => toast(e.message));
$('#cReset').onclick = e => {
  const b = e.currentTarget;
  if (b.dataset.arm) { delete b.dataset.arm; b.textContent = 'New game';
    RT.update('', { live: { phase: 'lobby', gameId: Q.uid(), run: 0, qi: -1, title: quiz.title }, players: null, scores: null, answers: null }).then(() => toast('New game — all players removed')).catch(err => toast(err.message)); }
  else { b.dataset.arm = 1; b.textContent = 'Sure?'; setTimeout(() => { delete b.dataset.arm; b.textContent = 'New game'; }, 3000); }
};
$('#out').onclick = () => RT.signOut().then(() => location.reload());

(async () => {
  await Q.requireAdmin();
  RT.onConnected(ok => { $('#dot').className = 'dot ' + (ok ? 'live' : 'off'); $('#stt').textContent = ok ? 'Live' : 'Reconnecting…'; });
  RT.on('quiz', v => {
    if (!v) { quiz = Q.DEFAULT_QUIZ(); renderAll(); queueSave(0); return; }
    const incoming = Q.cleanQuiz(v), s = JSON.stringify(incoming);
    if (!quiz) { quiz = incoming; lastSent = s; renderAll(); setSave('ok', '· Saved · live'); renderGame(); return; }
    // Changed elsewhere (another admin tab)? adopt it when nothing is pending and you're not typing.
    if (!dirty && !saving && s !== lastSent && !document.activeElement.closest?.('#qs,.fld')) { quiz = incoming; lastSent = s; renderAll(); }
  });
  RT.on('live', v => { L = v; renderGame(); });
  RT.on('players', v => { players = Q.obj(v); renderGame(); });
  RT.on('presence', v => { presence = Q.obj(v); renderGame(); });
  RT.on('scores', v => { scores = Q.obj(v); renderGame(); });
})();
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
