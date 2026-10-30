'use strict';
// ============================================================
// Transcritor · lógica do app
// ============================================================
const A = window.Android || {
  logado: () => false, entrar() {}, sair() {}, copiar: (t) => navigator.clipboard && navigator.clipboard.writeText(t),
  aviso: (t) => console.log(t), toque() {}, manterTelaLigada() {}, abrirLink: (u) => window.open(u),
  salvar: () => '', compartilhar() {}, compartilharTexto() {}, colar: () => '', versao: () => 'web',
};
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cdn = (u) => (u ? '/cdn?u=' + encodeURIComponent(u) : '');

// ---------- preferências ----------
function ler(k, padrao) { try { const v = localStorage.getItem(k); return v == null ? padrao : JSON.parse(v); } catch (e) { return padrao; } }
function gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
const pref = Object.assign({ qtd: 9, qualidade: 'rapida', idioma: 'pt', gpu: false }, ler('pref', {}));
const salvarPref = () => gravar('pref', pref);

// ---------- estado ----------
const E = { perfil: null, videos: [], sel: new Set(), fila: [], rodando: false, cancelar: false, sessao: null };

// ---------- navegação ----------
let telaAtual = 'inicio';
function ir(nome) {
  if (nome === telaAtual) return;
  const de = $('#v-' + telaAtual), para = $('#v-' + nome);
  de.classList.remove('ativa');
  para.classList.add('ativa');
  telaAtual = nome;
  $('.rolagem', para) && ($('.rolagem', para).scrollTop = $('.rolagem', para).scrollTop);
}
window.voltar = () => {
  const aberta = $('.folha.on');
  if (aberta) { fecharFolhas(); return true; }
  if (telaAtual === 'resultado') { ir(E.sessao && E.sessao.doHistorico ? 'inicio' : 'videos'); return true; }
  if (telaAtual === 'videos') { ir('inicio'); return true; }
  return false;
};
$$('[data-voltar]').forEach((b) => b.addEventListener('click', () => window.voltar()));

// ---------- avisos e folhas ----------
let tAviso;
function aviso(msg) {
  const el = $('#aviso'); el.textContent = msg; el.classList.add('on');
  clearTimeout(tAviso); tAviso = setTimeout(() => el.classList.remove('on'), msg.length > 60 ? 5000 : 2400);
}
function abrirFolha(id) { fecharFolhas(); $('#veu').classList.add('on'); $('#' + id).classList.add('on'); }
function fecharFolhas() { $('#veu').classList.remove('on'); $$('.folha').forEach((f) => f.classList.remove('on')); }
$('#veu').addEventListener('click', fecharFolhas);
$$('[data-fechar]').forEach((b) => b.addEventListener('click', fecharFolhas));

// ---------- conta ----------
function atualizarConta() {
  const on = !!A.logado();
  const chip = $('#chip-conta');
  chip.className = 'chip-conta' + (on ? ' on' : '');
  chip.innerHTML = `<i></i>${on ? 'Conectado' : 'Entrar'}`;
  $('#conta-box').innerHTML = on
    ? `<span>Instagram conectado</span><span><button type="button" id="btn-ver-ig2">Ver página</button> &nbsp; <button type="button" id="btn-sair">Sair</button></span>`
    : `<span>Sem conta conectada</span><button type="button" id="btn-entrar2">Entrar</button>`;
  const s = $('#btn-sair'); if (s) s.onclick = () => { A.sair(); atualizarConta(); aviso('Você saiu do Instagram'); };
  const e = $('#btn-entrar2'); if (e) e.onclick = () => A.entrar();
  const v = $('#btn-ver-ig2'); if (v) v.onclick = () => { fecharFolhas(); A.igMostrar && A.igMostrar(true); };
}
$('#chip-conta').addEventListener('click', () => (A.logado() ? abrirFolha('f-ajustes') : A.entrar()));
$('#btn-login').addEventListener('click', () => { fecharFolhas(); A.entrar(); });
let depoisDoLogin = null;
window.aoEntrar = (ok) => {
  atualizarConta();
  if (ok) {
    aviso('Instagram conectado ✓');
    if (depoisDoLogin) { const f = depoisDoLogin; depoisDoLogin = null; f(); }
  }
};

// ---------- ajustes ----------
function pintarAjustes() {
  $$('[data-grupo="qualidade"] button').forEach((b) => b.classList.toggle('sel', b.dataset.v === pref.qualidade));
  $$('[data-grupo="idioma"] button').forEach((b) => b.classList.toggle('sel', b.dataset.v === pref.idioma));
  $('#chk-gpu').checked = !!pref.gpu;
  $('#versao').textContent = 'Transcritor ' + (A.versao ? A.versao() : '');
}
$$('[data-grupo] button').forEach((b) => b.addEventListener('click', () => {
  pref[b.parentElement.dataset.grupo] = b.dataset.v; salvarPref(); pintarAjustes(); A.toque();
}));
$('#chk-gpu').addEventListener('change', (e) => { pref.gpu = e.target.checked; salvarPref(); });
$('#btn-ajustes').addEventListener('click', () => { pintarAjustes(); abrirFolha('f-ajustes'); });
$('#btn-ajustes2').addEventListener('click', () => { pintarAjustes(); abrirFolha('f-ajustes'); });

// ---------- início ----------
function pintarQtd() { $$('#seg-qtd button').forEach((b) => b.classList.toggle('sel', +b.dataset.q === pref.qtd)); }
$$('#seg-qtd button').forEach((b) => b.addEventListener('click', () => { pref.qtd = +b.dataset.q; salvarPref(); pintarQtd(); A.toque(); }));

function limparPerfil(t) {
  t = String(t || '').trim();
  const m = t.match(/instagram\.com\/(?!p\/|reel\/|reels\/|tv\/|stories\/)([A-Za-z0-9_.]+)/i);
  if (m) t = m[1];
  return t.replace(/^@/, '').split(/[?\s/]/)[0].toLowerCase();
}
$('#btn-colar').addEventListener('click', async () => {
  let t = '';
  try { t = A.colar ? A.colar() : ''; } catch (e) {}
  if (!t && navigator.clipboard) { try { t = await navigator.clipboard.readText(); } catch (e) {} }
  if (!t) return aviso('Nada copiado ainda');
  receberTexto(t, false);
});
$('#form-busca').addEventListener('submit', (e) => {
  e.preventDefault();
  const nome = limparPerfil($('#in-perfil').value);
  if (!nome) { $('#in-perfil').focus(); return aviso('Digite o @ do perfil'); }
  $('#in-perfil').value = nome;
  $('#in-perfil').blur();
  buscar(nome);
});

// recebe o que veio do "Compartilhar" do Instagram
async function receberTexto(t, buscarJa) {
  const reel = String(t).match(/instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  if (reel) {
    aviso('Descobrindo o autor do vídeo…');
    const dono = await donoDoPost(reel[1]);
    if (!dono) return aviso('Não consegui ver o autor. Compartilhe o perfil.');
    $('#in-perfil').value = dono;
    if (buscarJa) buscar(dono);
    return;
  }
  const nome = limparPerfil(t);
  if (!nome) return aviso('Não achei um perfil nesse texto');
  $('#in-perfil').value = nome;
  if (buscarJa) buscar(nome);
}
window.aoCompartilhar = (t) => { fecharFolhas(); ir('inicio'); receberTexto(t, true); };

// ---------- Instagram ----------
class ErroLogin extends Error {}
class ErroPerfil extends Error {}
class ErroPrivado extends Error {}
class ErroLimite extends Error {}
class ErroCaptura extends Error {}

// as buscas passam por uma página escondida do Instagram (igual ao site);
// se ela não responder, usa o caminho direto pelo app
const igPendentes = new Map();
let igSeq = 0;
window.igResposta = (id, status, texto) => {
  const p = igPendentes.get(id);
  if (p) { igPendentes.delete(id); p({ status, texto }); }
};
function viaPagina(caminho) {
  return new Promise((ok) => {
    const id = ++igSeq;
    igPendentes.set(id, ok);
    A.igFetch(id, caminho);
  });
}
async function viaDireto(caminho) {
  try {
    const r = await fetch('/ig/' + caminho, { cache: 'no-store' });
    return { status: r.status, texto: await r.text() };
  } catch (e) { return { status: 0, texto: String(e) }; }
}
let ultimoErro = '';
async function ig(caminho) {
  let r = A.igFetch ? await viaPagina(caminho) : { status: 0 };
  if (!r.status) r = await viaDireto(caminho);
  const { status, texto } = r;
  let j = null;
  try { j = JSON.parse(texto); } catch (e) {}
  ultimoErro = `HTTP ${status}${j && j.message ? ' · ' + j.message : ''}`;
  if (status === 404) throw new ErroPerfil();
  if (j && j.require_login) throw new ErroLogin();
  if (status === 429 || (j && /wait|aguarde|minut/i.test(j.message || ''))) throw new ErroLimite();
  if (status === 401 || status === 403) throw new ErroLogin();
  if (!j) throw status ? new ErroLogin() : new Error('sem conexão');
  if (j.status === 'fail') throw new Error(j.message || 'falha');
  return j;
}

// ---------- captura pela página escondida (o jeito principal) ----------
const cap = { midias: new Map(), usuarios: new Map(), estado: null, ouvintes: new Set() };
const avisarOuvintes = () => cap.ouvintes.forEach((f) => f());
window.igDados = (t) => {
  let d; try { d = JSON.parse(t); } catch (e) { return; }
  for (const m of d.m || []) {
    const a = cap.midias.get(m.codigo) || {};
    for (const k in m) if (m[k] != null && m[k] !== '' && k !== 'ehVideo') a[k] = m[k];
    a.ehVideo = !!(a.ehVideo || m.ehVideo);
    cap.midias.set(m.codigo, a);
  }
  for (const u of d.u || []) {
    const k = u.username.toLowerCase();
    const atual = cap.usuarios.get(k) || {};
    for (const c in u) if (u[c] !== '' && u[c] != null) atual[c] = u[c];
    cap.usuarios.set(k, atual);
  }
  avisarOuvintes();
};
window.igEstadoPagina = (t) => { try { cap.estado = JSON.parse(t); } catch (e) {} avisarOuvintes(); };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function esperar(cond, ms) {
  return new Promise((ok) => {
    let fim = false;
    const t = setTimeout(() => { fim = true; cap.ouvintes.delete(f); ok(false); }, ms);
    const f = () => { if (!fim && cond()) { fim = true; cap.ouvintes.delete(f); clearTimeout(t); ok(true); } };
    cap.ouvintes.add(f); f();
  });
}
let filaIg = Promise.resolve();
function exclusivo(fn) { const p = filaIg.then(fn, fn); filaIg = p.catch(() => {}); return p; }
const temCaptura = () => !!(A.igAbrir && A.igRolar);

function erroDaPagina(e) {
  if (!e) return null;
  const p = e.path || '', t = e.texto || '';
  if (/^\/(accounts\/login|challenge|accounts\/suspended)/.test(p)) return new ErroLogin();
  if (!A.logado()) return new ErroLogin();
  if (/conta é privada|account is private|cuenta es privada/i.test(t)) return new ErroPrivado();
  if (/não está disponível|isn't available|no está disponible|page not found/i.test(t)) return new ErroPerfil();
  if (/tente novamente mais tarde|try again later|wait a few minutes|aguarde alguns minutos/i.test(t)) return new ErroLimite();
  return null;
}

function capturarPerfil(nome, qtd) {
  return exclusivo(async () => {
    cap.midias.clear(); cap.estado = null;
    A.igAbrir(`https://www.instagram.com/${nome}/`);
    const meus = () => [...cap.midias.values()].filter((m) => !m.dono || m.dono.toLowerCase() === nome);
    const videos = () => meus().filter((m) => m.ehVideo);
    const inicio = Date.now();
    let ultimo = -1, parado = 0;
    while (Date.now() - inicio < 50000) {
      await dormir(1500);
      A.igPedirEstado();
      const n = videos().length;
      if (!meus().length && Date.now() - inicio > 4000) {
        const err = erroDaPagina(cap.estado);
        if (err) throw err;
      }
      if (n >= qtd + 3) break;
      if (meus().length) {
        if (n === ultimo) { if (++parado >= 6) break; } else parado = 0;
      } else if (Date.now() - inicio > 25000) break;
      ultimo = n;
      A.igRolar();
    }
    if (!meus().length) {
      const e = cap.estado || {};
      const err = new ErroCaptura('A página do perfil abriu, mas nenhum post apareceu.');
      err.detalhe = `Página: ${e.path || '?'} · Texto: ${(e.texto || '(vazia)').replace(/\s+/g, ' ').slice(0, 160)}`;
      throw err;
    }
    const u = cap.usuarios.get(nome) || {};
    if (u.privado && !meus().length) throw new ErroPrivado();
    const lista = videos().sort((a, b) => (b.data || 0) - (a.data || 0));
    return {
      perfil: { nome, titulo: u.full_name || nome, foto: u.foto || '' },
      videos: lista.map((m) => ({ codigo: m.codigo, thumb: m.thumb, video: m.video || null, descricao: m.descricao || '', data: m.data, duracao: m.duracao, views: m.views })),
      limitado: false,
    };
  });
}

function capturarPost(codigo, cond) {
  return exclusivo(async () => {
    cap.estado = null;
    A.igAbrir(`https://www.instagram.com/p/${codigo}/`);
    const ok = await esperar(() => { const m = cap.midias.get(codigo); return !!(m && cond(m)); }, 20000);
    return ok ? cap.midias.get(codigo) : null;
  });
}

async function donoDoPost(codigo) {
  if (temCaptura()) {
    const m = await capturarPost(codigo, (x) => !!x.dono);
    return m ? m.dono.toLowerCase() : null;
  }
  try {
    const j = await ig(`p/${codigo}/?__a=1&__d=dis`);
    const it = (j.items && j.items[0]) || (j.graphql && j.graphql.shortcode_media);
    return (it && ((it.user && it.user.username) || (it.owner && it.owner.username))) || null;
  } catch (e) { return null; }
}

function deNo(n) {
  const leg = n.edge_media_to_caption && n.edge_media_to_caption.edges[0];
  return {
    codigo: n.shortcode, thumb: n.thumbnail_src || n.display_url, video: n.video_url || null,
    descricao: (leg && leg.node.text) || '', data: n.taken_at_timestamp, duracao: n.video_duration,
    views: n.video_view_count || n.video_play_count || null,
  };
}
function deItem(it) {
  const img = it.image_versions2 && it.image_versions2.candidates && it.image_versions2.candidates[0];
  const vid = it.video_versions && it.video_versions[0];
  return {
    codigo: it.code, thumb: img && img.url, video: vid ? vid.url : null,
    descricao: (it.caption && it.caption.text) || '', data: it.taken_at, duracao: it.video_duration,
    views: it.play_count || it.ig_play_count || it.view_count || null,
  };
}

async function buscarPerfil(nome, qtd) {
  if (temCaptura()) {
    return capturarPerfil(nome, qtd);
  }
  return buscarPerfilApi(nome, qtd);
}

async function buscarPerfilApi(nome, qtd) {
  const j = await ig('api/v1/users/web_profile_info/?username=' + encodeURIComponent(nome));
  const u = j && j.data && j.data.user;
  if (!u) throw new ErroPerfil();
  const perfil = { nome, id: u.id, titulo: u.full_name || nome, foto: u.profile_pic_url_hd || u.profile_pic_url, privado: u.is_private, total: (u.edge_owner_to_timeline_media || {}).count };
  if (u.is_private && !u.followed_by_viewer) throw new ErroPrivado();
  const vistos = new Set();
  const videos = [];
  for (const e of ((u.edge_owner_to_timeline_media || {}).edges || [])) {
    const n = e.node;
    if (n.is_video && !vistos.has(n.shortcode)) { vistos.add(n.shortcode); videos.push(deNo(n)); }
  }
  let limitado = false;
  const alvo = Math.max(qtd + 6, 12);
  if (videos.length < alvo) {
    if (A.logado()) {
      let maxId = '';
      for (let pag = 0; pag < 8 && videos.length < alvo; pag++) {
        let f;
        try { f = await ig(`api/v1/feed/user/${u.id}/?count=12${maxId ? '&max_id=' + encodeURIComponent(maxId) : ''}`); } catch (e) { break; }
        for (const it of f.items || []) {
          if (it.media_type === 2 && it.code && !vistos.has(it.code)) { vistos.add(it.code); videos.push(deItem(it)); }
        }
        if (!f.more_available || !f.next_max_id) break;
        maxId = f.next_max_id;
      }
    } else if (perfil.total > 12) {
      limitado = true;
    }
  }
  return { perfil, videos, limitado };
}

// ---------- busca ----------
let ultimaBusca = '';
$('#btn-ver-ig').addEventListener('click', () => { fecharFolhas(); A.igMostrar && A.igMostrar(true); });
$('#btn-tentar').addEventListener('click', () => { fecharFolhas(); if (ultimaBusca) buscar(ultimaBusca); });
async function buscar(nome) {
  const btn = $('#btn-buscar');
  if (btn.disabled) return;
  if (!A.logado()) { depoisDoLogin = () => buscar(nome); abrirFolha('f-login'); return; }
  btn.disabled = true;
  btn.insertAdjacentHTML('beforeend', '<i class="girando"></i>');
  $('#form-busca').classList.add('carregando');
  A.toque();
  aviso('Abrindo o perfil… leva uns segundos');
  try {
    const r = await buscarPerfil(nome, pref.qtd);
    E.perfil = r.perfil; E.videos = r.videos;
    E.sel = new Set(r.videos.slice(0, pref.qtd).map((v) => v.codigo));
    pintarVideos(r.limitado);
    ir('videos');
    preaquecer();
  } catch (e) {
    if (e instanceof ErroLogin) { depoisDoLogin = () => buscar(nome); abrirFolha('f-login'); }
    else if (e instanceof ErroPerfil) aviso(`Não encontrei @${nome}. Confira o @.`);
    else if (e instanceof ErroPrivado) aviso(`@${nome} é privado`);
    else {
      ultimaBusca = nome;
      $('#erro-msg').textContent = e instanceof ErroLimite
        ? 'O Instagram pediu uma pausa para esta conta. Espere um pouco (às vezes algumas horas) e tente de novo.'
        : (e.message || 'Algo deu errado.');
      $('#erro-det').textContent = e.detalhe || (e instanceof ErroLimite ? 'Toque abaixo para ver se o Instagram está pedindo alguma confirmação.' : '');
      abrirFolha('f-erro');
    }
  } finally {
    btn.disabled = false;
    const g = $('.girando', btn); g && g.remove();
    $('#form-busca').classList.remove('carregando');
  }
}

function fmtDur(s) { if (!s) return ''; s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function fmtNum(n) {
  if (!n) return '';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + ' mi';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '').replace('.', ',') + ' mil';
  return String(n);
}
function fmtData(ts) { if (!ts) return ''; const d = new Date(ts * 1000); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', ''); }
function avatar(p) {
  return p.foto ? `<img src="${cdn(p.foto)}" alt="" onerror="this.outerHTML='<span class=av>${esc(p.nome[0].toUpperCase())}</span>'">` : `<span class="av">${esc(p.nome[0].toUpperCase())}</span>`;
}

function pintarVideos(limitado) {
  const p = E.perfil;
  $('#perfil-cab').innerHTML = `${avatar(p)}<div><b>${esc(p.titulo)}</b><small>@${esc(p.nome)} · ${E.videos.length} vídeos</small></div>`;
  let aviso = '';
  if (!E.videos.length) {
    aviso = `<div class="vazio-tela"><b>Nenhum vídeo recente</b>Os últimos posts de @${esc(p.nome)} são só fotos.${A.logado() ? '' : '<br><br><button class="link" id="btn-mais">Entrar no Instagram para buscar mais</button>'}</div>`;
  } else if (limitado) {
    aviso = `<div class="aviso-cartao">Sem login, o Instagram mostra só os 12 posts mais recentes.<br><button class="link" id="btn-mais">Entrar para ver mais vídeos</button></div>`;
  }
  $('#aviso-videos').innerHTML = aviso;
  const bm = $('#btn-mais'); if (bm) bm.onclick = () => { depoisDoLogin = () => buscar(p.nome); A.entrar(); };
  $('#grade').innerHTML = E.videos.map((v, i) => `
    <button type="button" class="vid ${E.sel.has(v.codigo) ? 'sel' : ''}" data-c="${esc(v.codigo)}" style="animation-delay:${Math.min(i, 18) * 30}ms">
      ${v.thumb ? `<img loading="lazy" src="${cdn(v.thumb)}" alt="">` : ''}
      <span class="marca-sel"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
      <span class="dur">${fmtDur(v.duracao)}</span>
      ${v.views ? `<span class="vis"><svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>${fmtNum(v.views)}</span>` : ''}
    </button>`).join('');
  $$('#grade .vid').forEach((el) => el.addEventListener('click', () => {
    const c = el.dataset.c;
    E.sel.has(c) ? E.sel.delete(c) : E.sel.add(c);
    el.classList.toggle('sel', E.sel.has(c));
    A.toque(); pintarSel();
  }));
  pintarSel();
}
function pintarSel() {
  const n = E.sel.size;
  $('#txt-sel').innerHTML = `<b>${n}</b> de ${E.videos.length} selecionados`;
  $('#btn-todos').textContent = n ? 'Desmarcar todos' : 'Marcar todos';
  const b = $('#btn-transcrever');
  b.disabled = !n;
  b.innerHTML = `<span>${n ? `Transcrever ${n} vídeo${n > 1 ? 's' : ''}` : 'Escolha os vídeos'}</span><svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/></svg>`;
}
$('#btn-todos').addEventListener('click', () => {
  if (E.sel.size) E.sel.clear(); else E.videos.forEach((v) => E.sel.add(v.codigo));
  $$('#grade .vid').forEach((el) => el.classList.toggle('sel', E.sel.has(el.dataset.c)));
  pintarSel(); A.toque();
});

// ---------- Whisper (worker) ----------
let worker = null, modeloPronto = false, device = '';
const pendentes = new Map();
const arquivosModelo = new Map();
function obterWorker() {
  if (worker) return worker;
  worker = new Worker('worker.js', { type: 'module' });
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.tipo === 'carregando') { modeloPronto = false; }
    else if (m.tipo === 'progresso') {
      arquivosModelo.set(m.arquivo, m);
      let c = 0, t = 0; arquivosModelo.forEach((a) => { c += a.carregado; t += a.total; });
      if (telaAtual === 'resultado' && t > 0 && t - c > 1e6) {
        $('#pp-sub').textContent = `Baixando o modelo de voz (só na primeira vez): ${Math.round(c / 1e6)} de ${Math.round(t / 1e6)} MB`;
      }
    } else if (m.tipo === 'pronto') { modeloPronto = true; device = m.device; }
    else if (m.tipo === 'texto' || m.tipo === 'erro') {
      const p = pendentes.get(m.id);
      if (p) { pendentes.delete(m.id); m.tipo === 'texto' ? p.ok(m.texto) : p.falha(new Error(m.msg)); }
      else if (m.tipo === 'erro' && m.id == null) { console.error(m.msg); }
    }
  };
  worker.onerror = (e) => {
    console.error(e);
    pendentes.forEach((p) => p.falha(new Error('O motor de transcrição não abriu. Verifique a internet.')));
    pendentes.clear(); worker = null;
  };
  return worker;
}
function preaquecer() { try { obterWorker().postMessage({ tipo: 'carregar', qualidade: pref.qualidade, gpu: pref.gpu }); } catch (e) {} }
let idSeq = 0;
function transcreverAudio(audio) {
  return new Promise((ok, falha) => {
    const id = ++idSeq;
    pendentes.set(id, { ok, falha });
    obterWorker().postMessage({ tipo: 'transcrever', id, audio, qualidade: pref.qualidade, gpu: pref.gpu, idioma: pref.idioma }, [audio.buffer]);
  });
}

async function audioDe(v) {
  let url = v.video;
  if (!url && temCaptura()) {
    const m = await capturarPost(v.codigo, (x) => !!x.video);
    if (m) url = v.video = m.video;
    if (!url) throw new Error('Não consegui o link do vídeo');
  }
  if (!url) {
    try {
      const j = await ig(`p/${v.codigo}/?__a=1&__d=dis`);
      const it = j.items && j.items[0];
      url = it && it.video_versions && it.video_versions[0].url;
    } catch (e) {}
    if (!url) throw new Error('Não consegui o link do vídeo');
  }
  const r = await fetch(cdn(url));
  if (!r.ok) throw new Error('Falha ao baixar o vídeo (' + r.status + ')');
  const buf = await r.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 16000, 16000);
  let ab;
  try { ab = await ctx.decodeAudioData(buf); } catch (e) { throw new Error('Vídeo sem áudio'); }
  if (ab.numberOfChannels === 1) return new Float32Array(ab.getChannelData(0));
  const a = ab.getChannelData(0), b = ab.getChannelData(1), out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
  return out;
}

// ---------- sessão de transcrição ----------
$('#btn-transcrever').addEventListener('click', () => {
  const itens = E.videos.filter((v) => E.sel.has(v.codigo)).map((v) => ({ ...v, estado: 'fila', transcricao: '' }));
  if (!itens.length) return;
  E.sessao = { id: Date.now(), perfil: E.perfil, itens, inicio: Date.now(), fim: null, doHistorico: false };
  pintarResultado();
  ir('resultado');
  rodar();
});

function tituloDe(v, i) {
  const l = (v.descricao || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
  return l ? (l.length > 90 ? l.slice(0, 90) + '…' : l) : `Vídeo ${i + 1}`;
}
const ESTADOS = {
  fila: ['', 'Na fila'], baixando: ['ativo', 'Baixando áudio'], ouvindo: ['ativo', 'Transcrevendo'],
  pronto: ['ok', 'Pronto'], erro: ['erro', 'Falhou'], cancelado: ['', 'Cancelado'],
};

function pintarResultado() {
  const s = E.sessao;
  $('#res-cab').innerHTML = `${avatar(s.perfil)}<div><b>${esc(s.perfil.titulo || s.perfil.nome)}</b><small>@${esc(s.perfil.nome)} · ${s.itens.length} vídeos</small></div>`;
  $('#lista-res').innerHTML = s.itens.map((v, i) => `
    <article class="res" id="r-${i}" style="animation-delay:${Math.min(i, 12) * 35}ms">
      <button type="button" class="res-cab">
        ${v.thumb && !s.doHistorico ? `<img src="${cdn(v.thumb)}" alt="">` : '<span class="sem-img"></span>'}
        <div><b>${esc(tituloDe(v, i))}</b>
          <small>${[fmtData(v.data), fmtDur(v.duracao), v.views ? fmtNum(v.views) + ' views' : ''].filter(Boolean).join(' · ')}</small>
          <span class="pilula" data-p></span></div>
        <svg class="seta" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="res-corpo">
        <div class="bloco"><div class="bloco-cab"><span>Transcrição do áudio</span><button type="button" data-copiar="t">Copiar</button></div><p data-t></p></div>
        <div class="bloco"><div class="bloco-cab"><span>Descrição do post</span><button type="button" data-copiar="d">Copiar</button></div><p class="${v.descricao ? '' : 'vazio'}">${esc(v.descricao || 'Sem descrição')}</p></div>
        <button type="button" class="abrir-ig" data-abrir><svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>Abrir no Instagram</button>
      </div>
    </article>`).join('');
  s.itens.forEach((v, i) => {
    const el = $('#r-' + i);
    $('.res-cab', el).onclick = () => { el.classList.toggle('aberto'); A.toque(); };
    $('[data-copiar="t"]', el).onclick = () => { if (v.transcricao) { A.copiar(v.transcricao); aviso('Transcrição copiada'); } };
    $('[data-copiar="d"]', el).onclick = () => { A.copiar(v.descricao || ''); aviso('Descrição copiada'); };
    $('[data-abrir]', el).onclick = () => A.abrirLink(`https://www.instagram.com/reel/${v.codigo}/`);
    pintarItem(i);
  });
  pintarPainel();
}
function pintarItem(i) {
  const v = E.sessao.itens[i], el = $('#r-' + i);
  if (!el) return;
  const [cls, txt] = ESTADOS[v.estado] || ESTADOS.fila;
  const p = $('[data-p]', el);
  p.className = 'pilula ' + cls;
  p.textContent = v.estado === 'erro' && v.erro ? 'Falhou · ' + v.erro : txt;
  const t = $('[data-t]', el);
  t.textContent = v.transcricao || (v.estado === 'pronto' ? 'Sem fala no vídeo (provavelmente só música)' : 'Aguardando…');
  t.className = v.transcricao ? '' : 'vazio';
}
function pintarPainel() {
  const s = E.sessao, tot = s.itens.length;
  const feitos = s.itens.filter((v) => ['pronto', 'erro', 'cancelado'].includes(v.estado)).length;
  const prontos = s.itens.filter((v) => v.estado === 'pronto').length;
  $('#pp-barra').style.width = (tot ? (feitos / tot) * 100 : 0) + '%';
  const terminado = feitos === tot;
  $('#painel').classList.toggle('feito', terminado && prontos > 0);
  if (terminado) {
    $('#pp-titulo').textContent = prontos === tot ? `${tot} transcrições prontas ✓` : `${prontos} de ${tot} prontas`;
    $('#pp-eta').textContent = s.fim ? `em ${Math.max(1, Math.round((s.fim - s.inicio) / 60000))} min` : '';
    if (!s.doHistorico) $('#pp-sub').textContent = 'Toque num vídeo para ver o texto. Use "Enviar .md" para mandar ao Claude.';
    else $('#pp-sub').textContent = `Salvo em ${new Date(s.id).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`;
  } else {
    $('#pp-titulo').textContent = `Transcrevendo ${Math.min(feitos + 1, tot)} de ${tot}`;
    const tempos = s.itens.filter((v) => v.ms).map((v) => v.ms);
    if (tempos.length) {
      const med = tempos.reduce((a, b) => a + b, 0) / tempos.length;
      const rest = Math.round((med * (tot - feitos)) / 1000);
      $('#pp-eta').textContent = rest > 90 ? `~${Math.round(rest / 60)} min` : `~${rest} s`;
    } else $('#pp-eta').textContent = '';
  }
  $('#btn-enviar').disabled = !prontos;
  $('#btn-copiar-tudo').disabled = !prontos;
}

async function rodar() {
  const s = E.sessao;
  if (E.rodando) { E.cancelar = true; while (E.rodando) await new Promise((r) => setTimeout(r, 100)); }
  E.rodando = true; E.cancelar = false;
  A.manterTelaLigada(true);
  $('#pp-sub').textContent = modeloPronto ? '' : 'Ligando o motor de transcrição…';
  let proximoAudio = null;
  const carregarAudio = (i) => (i < s.itens.length ? audioDe(s.itens[i]).then((a) => ({ a }), (e) => ({ e })) : null);
  proximoAudio = carregarAudio(0);
  for (let i = 0; i < s.itens.length; i++) {
    if (E.cancelar || E.sessao !== s) break;
    const v = s.itens[i];
    const t0 = Date.now();
    v.estado = 'baixando'; pintarItem(i); pintarPainel();
    const res = await proximoAudio;
    proximoAudio = carregarAudio(i + 1);
    if (res.e) { v.estado = 'erro'; v.erro = res.e.message; pintarItem(i); pintarPainel(); continue; }
    v.estado = 'ouvindo'; pintarItem(i);
    try {
      v.transcricao = await transcreverAudio(res.a);
      v.estado = 'pronto'; v.ms = Date.now() - t0;
      if (!$('#pp-sub').textContent.startsWith('Baixando')) $('#pp-sub').textContent = device === 'webgpu' ? 'Usando a GPU do celular' : '';
      else $('#pp-sub').textContent = '';
      A.toque();
    } catch (e) {
      v.estado = 'erro'; v.erro = (e.message || 'erro').slice(0, 60);
    }
    pintarItem(i); pintarPainel();
    if (i === 0 && v.estado === 'pronto') $('#r-0').classList.add('aberto');
  }
  if (E.sessao === s) {
    s.itens.forEach((v, i) => { if (['fila', 'baixando', 'ouvindo'].includes(v.estado)) { v.estado = 'cancelado'; pintarItem(i); } });
    s.fim = Date.now();
    pintarPainel();
    guardarHistorico(s);
  }
  A.manterTelaLigada(false);
  E.rodando = false;
}

// ---------- markdown ----------
function gerarMd(s) {
  const agora = new Date(s.fim || Date.now());
  const p = s.perfil;
  const linhas = [
    `# Transcrições · @${p.nome}`,
    `Perfil: https://www.instagram.com/${p.nome}/  `,
    `Coletado em ${agora.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · ${s.itens.filter((v) => v.estado === 'pronto').length} vídeos`,
    '', '---', '',
  ];
  s.itens.forEach((v, i) => {
    if (v.estado !== 'pronto') return;
    const info = [v.data ? 'Publicado: ' + new Date(v.data * 1000).toLocaleDateString('pt-BR') : '', v.duracao ? 'Duração: ' + fmtDur(v.duracao) : '', v.views ? 'Visualizações: ' + v.views.toLocaleString('pt-BR') : ''].filter(Boolean).join(' · ');
    linhas.push(`## ${i + 1}. ${tituloDe(v, i)}`, `Link: https://www.instagram.com/reel/${v.codigo}/  `, info, '',
      '### Transcrição do áudio', v.transcricao || '_(sem fala detectada)_', '',
      '### Descrição do post', v.descricao || '_(sem descrição)_', '', '---', '');
  });
  return linhas.join('\n');
}
function nomeArquivo(s) {
  const d = new Date(s.fim || Date.now()), z = (n) => String(n).padStart(2, '0');
  return `${s.perfil.nome}-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.md`;
}
$('#btn-enviar').addEventListener('click', () => { A.toque(); A.compartilhar(nomeArquivo(E.sessao), gerarMd(E.sessao)); });
$('#btn-copiar-tudo').addEventListener('click', () => { A.copiar(gerarMd(E.sessao)); aviso('Tudo copiado em Markdown'); });

// ---------- histórico ----------
function guardarHistorico(s) {
  if (!s.itens.some((v) => v.estado === 'pronto')) return;
  const h = ler('historico', []).filter((x) => x.id !== s.id);
  const p = s.perfil;
  h.unshift({ id: s.id, inicio: s.inicio, fim: s.fim, perfil: { nome: p.nome, titulo: p.titulo },
    itens: s.itens.map(({ codigo, descricao, data, duracao, views, estado, transcricao }) => ({ codigo, descricao, data, duracao, views, estado, transcricao })) });
  gravar('historico', h.slice(0, 25));
  pintarRecentes();
}
function pintarRecentes() {
  const h = ler('historico', []);
  $('#bloco-recentes').classList.toggle('oculto', !h.length);
  $('#lista-recentes').innerHTML = h.slice(0, 8).map((x) => {
    const n = x.itens.filter((v) => v.estado === 'pronto').length;
    const d = new Date(x.id).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
    return `<button type="button" class="recente" data-h="${x.id}"><span class="av">${esc(x.perfil.nome[0].toUpperCase())}</span>
      <div><b>@${esc(x.perfil.nome)}</b><small>${n} transcriç${n === 1 ? 'ão' : 'ões'} · ${d}</small></div>
      <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>`;
  }).join('');
  $$('#lista-recentes .recente').forEach((b) => b.addEventListener('click', () => {
    const x = ler('historico', []).find((y) => String(y.id) === b.dataset.h);
    if (!x) return;
    E.sessao = { ...x, doHistorico: true };
    pintarResultado(); ir('resultado');
  }));
}

// ---------- início ----------
pintarQtd(); pintarAjustes(); atualizarConta(); pintarRecentes();
