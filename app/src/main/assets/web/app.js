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
const pref = Object.assign({ qtd: 9, qualidade: 'rapida', idioma: 'pt', gpu: false, limite: 30, turbo: false, chave: '' }, ler('pref', {}));
const turboLigado = () => !!(pref.turbo && pref.chave && A.groq);

const nomeArq = (v) => (v && v.arquivo ? (typeof v.arquivo === 'string' ? v.arquivo : v.arquivo.nome) : '');
// ---------- memória: vídeos já transcritos (nunca transcreve de novo) ----------
let memoria = ler('memoria', {});
function lembrar(v, perfil) {
  memoria[v.codigo] = {
    codigo: v.codigo, perfil, descricao: v.descricao || '', transcricao: v.transcricao || '',
    data: v.data || null, duracao: v.duracao || null, views: v.views || null, em: Date.now(),
    arquivo: nomeArq(v) || undefined,
  };
  const chaves = Object.keys(memoria);
  if (chaves.length > 400) chaves.sort((a, b) => memoria[a].em - memoria[b].em).slice(0, chaves.length - 400).forEach((k) => delete memoria[k]);
  gravar('memoria', memoria);
}
if (!Object.keys(memoria).length) {
  // primeira vez: aproveita o que já está no histórico
  for (const h of ler('historico', []).slice().reverse()) {
    for (const v of h.itens || []) if (v.estado === 'pronto' && v.codigo && !memoria[v.codigo]) {
      memoria[v.codigo] = { codigo: v.codigo, perfil: (h.perfil && h.perfil.nome) || '', descricao: v.descricao || '', transcricao: v.transcricao || '', data: v.data || null, duracao: v.duracao || null, views: v.views || null, em: h.fim || h.id || Date.now() };
    }
  }
  gravar('memoria', memoria);
}
const jaFeito = (codigo) => !!(memoria[codigo] && memoria[codigo].em);
function acumulado() {
  return Object.values(memoria).sort((a, b) => b.em - a.em).slice(0, pref.limite || 30);
}
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
  if (telaAtual === 'resultado') { if (!E.rodando) esquecerSessao(); ir(E.sessao && E.sessao.doHistorico ? 'inicio' : (E.videos.length ? 'videos' : 'inicio')); return true; }
  if (telaAtual === 'videos' || telaAtual === 'extrator') { ir('inicio'); return true; }
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
  $$('[data-grupo="limite"] button').forEach((b) => b.classList.toggle('sel', +b.dataset.v === pref.limite));
  $('#chk-turbo').checked = !!pref.turbo;
  $('#in-chave').value = pref.chave || '';
  $('#bloco-chave').classList.toggle('oculto', !pref.turbo);
  $('#mem-info').textContent = `${Object.keys(memoria).length} vídeos na memória · o arquivo leva os ${pref.limite} mais recentes`;
  $('#chk-gpu').checked = !!pref.gpu;
  $('#versao').textContent = 'Transcritor ' + (A.versao ? A.versao() : '');
}
$$('[data-grupo] button').forEach((b) => b.addEventListener('click', () => {
  const g = b.parentElement.dataset.grupo;
  pref[g] = g === 'limite' ? +b.dataset.v : b.dataset.v; salvarPref(); pintarAjustes(); A.toque();
}));
let limparPend = false;
$('#btn-limpar-mem').addEventListener('click', () => {
  if (!limparPend) { limparPend = true; aviso('Toque de novo para apagar a memória'); setTimeout(() => { limparPend = false; }, 4000); return; }
  limparPend = false; memoria = {}; gravar('memoria', memoria); pintarAjustes(); aviso('Memória apagada');
});
$('#chk-gpu').addEventListener('change', (e) => { pref.gpu = e.target.checked; salvarPref(); });
$('#chk-turbo').addEventListener('change', (e) => {
  pref.turbo = e.target.checked; salvarPref(); pintarAjustes();
  if (pref.turbo && !pref.chave) setTimeout(() => $('#in-chave').focus(), 300);
});
$('#in-chave').addEventListener('change', (e) => { pref.chave = e.target.value.trim(); salvarPref(); aviso(pref.chave ? 'Chave salva ⚡' : 'Chave apagada'); });
$('#btn-colar-chave').addEventListener('click', () => {
  const t = (A.colar ? A.colar() : '').trim();
  if (!/^gsk_/.test(t)) return aviso('Copie a chave no site do Groq (começa com gsk_)');
  pref.chave = t; salvarPref(); pintarAjustes(); aviso('Chave salva ⚡');
});
$('#btn-criar-chave').addEventListener('click', () => A.abrirLink('https://console.groq.com/keys'));
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
    E.sel = new Set(r.videos.filter((v) => !jaFeito(v.codigo)).slice(0, pref.qtd).map((v) => v.codigo));
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
      ${jaFeito(v.codigo) ? '<span class="feito">✓ já transcrito</span>' : ''}
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
    ultimoSinal = Date.now();
    if (m.tipo === 'carregando') { modeloPronto = false; }
    else if (m.tipo === 'progresso') {
      arquivosModelo.set(m.arquivo, m);
      let c = 0, t = 0; arquivosModelo.forEach((a) => { c += a.carregado; t += a.total; });
      if (telaAtual === 'resultado' && t > 0 && t - c > 1e6) {
        $('#pp-sub').textContent = `Baixando o modelo de voz (só na primeira vez): ${Math.round(c / 1e6)} de ${Math.round(t / 1e6)} MB. Dica: o Modo turbo nos Ajustes pula esse download.`;
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
// vigia: se o download do modelo parar, reinicia; se o turbo for ligado, troca na hora
class ErroTravou extends Error {}
let ultimoSinal = Date.now();
function reiniciarWorker(msg) {
  try { worker && worker.terminate(); } catch (e) {}
  worker = null; modeloPronto = false; arquivosModelo.clear();
  pendentes.forEach((p) => p.falha(new ErroTravou(msg))); pendentes.clear();
}
setInterval(() => {
  if (!pendentes.size) return;
  if (turboLigado()) { reiniciarWorker('trocando para o turbo'); return; }
  if (!modeloPronto && Date.now() - ultimoSinal > 45000) reiniciarWorker('o download do modelo parou');
}, 5000);
function preaquecer() { if (turboLigado()) return; try { obterWorker().postMessage({ tipo: 'carregar', qualidade: pref.qualidade, gpu: pref.gpu }); } catch (e) {} }
// ---------- modo turbo (Groq) ----------
function wavBase64(f32) {
  const n = f32.length, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
  const txt = (o, t) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
  txt(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 16000, true); dv.setUint32(28, 32000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  txt(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const x = Math.max(-1, Math.min(1, f32[i])); dv.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  const u8 = new Uint8Array(buf); let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
const groqPend = new Map();
let groqSeq = 0;
window.groqResposta = (id, status, corpo) => { const p = groqPend.get(id); if (p) { groqPend.delete(id); p({ status, corpo }); } };
class ErroChave extends Error {}
async function transcreverGroq(audio) {
  // áudios longos vão em pedaços de 5 min (limite de tamanho do Groq)
  const PEDACO = 16000 * 300;
  if (audio.length <= PEDACO) return transcreverGroqUm(audio);
  const partes = [];
  for (let i = 0; i < audio.length; i += PEDACO) {
    if (audio.length > PEDACO * 2) $('#pp-sub').textContent = `Modo turbo ⚡ · parte ${Math.floor(i / PEDACO) + 1} de ${Math.ceil(audio.length / PEDACO)}`;
    partes.push(await transcreverGroqUm(audio.subarray(i, i + PEDACO)));
  }
  return partes.join(' ').replace(/\s+/g, ' ').trim();
}
async function transcreverGroqUm(audio) {
  const id = ++groqSeq;
  const { status, corpo } = await new Promise((ok) => { groqPend.set(id, ok); A.groq(id, wavBase64(audio), pref.chave, pref.idioma); });
  let j = null; try { j = JSON.parse(corpo); } catch (e) {}
  if (status === 401 || status === 403) throw new ErroChave('chave do Groq recusada');
  if (status !== 200 || !j) throw new Error((j && j.error && j.error.message) || ('Groq ' + status));
  return String(j.text || '').replace(/\s+/g, ' ').trim();
}
let avisouTurbo = false;
async function transcreverMelhor(audio) {
  if (turboLigado()) {
    try { return { texto: await transcreverGroq(audio), turbo: true }; }
    catch (e) {
      if (e instanceof ErroChave) { pref.turbo = false; salvarPref(); aviso('A chave do Groq foi recusada. Voltei para o modo do celular.'); }
      else if (!avisouTurbo) { avisouTurbo = true; aviso('Turbo indisponível agora (' + (e.message || 'erro').slice(0, 40) + '). Usando o celular.'); }
    }
  }
  for (let tent = 0; ; tent++) {
    try { return { texto: await transcreverAudio(audio), turbo: false }; }
    catch (e) {
      if (turboLigado()) {
        try { return { texto: await transcreverGroq(audio), turbo: true }; } catch (e2) {}
      }
      if (!(e instanceof ErroTravou) || tent >= 2) throw e;
      $('#pp-sub').textContent = 'O download do modelo parou. Tentando de novo…';
    }
  }
}

let idSeq = 0;
function transcreverAudio(audio) {
  return new Promise((ok, falha) => {
    const id = ++idSeq;
    pendentes.set(id, { ok, falha });
    ultimoSinal = Date.now();
    const copia = audio.slice();
    obterWorker().postMessage({ tipo: 'transcrever', id, audio: copia, qualidade: pref.qualidade, gpu: pref.gpu, idioma: pref.idioma }, [copia.buffer]);
  });
}

async function decodificar(buf, semAudio) {
  const ctx = new OfflineAudioContext(1, 16000, 16000);
  let ab;
  try { ab = await ctx.decodeAudioData(buf); } catch (e) { throw new Error(semAudio); }
  if (ab.numberOfChannels === 1) return new Float32Array(ab.getChannelData(0));
  const a = ab.getChannelData(0), b = ab.getChannelData(1), out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
  return out;
}
async function audioDoArquivo(v) {
  let buf;
  const web = arquivosWeb.get(v.arquivo.id);
  if (web) buf = await web.arrayBuffer();
  else {
    const r = await fetch('/arquivo?u=' + encodeURIComponent(v.arquivo.uri)).catch(() => ({ ok: false, status: 0 }));
    if (!r.ok) throw new Error(r.status === 404 ? 'Arquivo não encontrado. Escolha de novo.' : 'Não consegui abrir o arquivo (' + r.status + ')');
    buf = await r.arrayBuffer();
  }
  return decodificar(buf, 'Não achei áudio nesse arquivo');
}
async function audioDe(v) {
  if (v.arquivo) return audioDoArquivo(v);
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
  let r = await fetch(cdn(url)).catch(() => ({ ok: false, status: 0 }));
  if (!r.ok && temCaptura()) {
    // o link do vídeo expira: pega um novo abrindo o post e tenta de novo
    cap.midias.delete(v.codigo);
    const m = await capturarPost(v.codigo, (x) => !!x.video);
    if (m && m.video) { url = v.video = m.video; r = await fetch(cdn(url)).catch(() => ({ ok: false, status: 0 })); }
  }
  if (!r.ok) throw new Error('Falha ao baixar o vídeo (' + r.status + ')');
  return decodificar(await r.arrayBuffer(), 'Vídeo sem áudio');
}

// ---------- arquivos do celular ----------
const arquivosWeb = new Map(); // só fora do APK (teste no navegador)
function hashCurto(t) { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function sessaoDeArquivos(lista) {
  const itens = lista.filter((a) => a && (a.uri || a.id)).map((a, i) => ({
    codigo: 'arq-' + hashCurto((a.nome || '') + ':' + (a.tamanho || 0) + ':' + (a.tamanho ? '' : a.uri || i)),
    arquivo: { id: a.id || null, uri: a.uri || '', nome: a.nome || 'arquivo', tamanho: a.tamanho || 0 },
    descricao: '', data: null, duracao: a.duracao || null, views: null, estado: 'fila', transcricao: '',
  }));
  if (!itens.length) return;
  fecharFolhas();
  E.sessao = { id: Date.now(), perfil: { nome: 'arquivos', titulo: 'Arquivos do celular', arquivo: true }, itens, inicio: Date.now(), fim: null, doHistorico: false };
  pintarResultado();
  ir('resultado');
  rodar();
}
let modoArquivos = 'transcrever';
window.aoArquivos = (t) => {
  let l = []; try { l = JSON.parse(t); } catch (e) {}
  const extrair = modoArquivos === 'extrair' && telaAtual === 'extrator';
  modoArquivos = 'transcrever';
  if (!l.length) return;
  if (extrair) exAdicionar(l); else sessaoDeArquivos(l);
};
window.aoSalvarAudio = (ok, msg) => { aviso(msg); if (ok) A.toque(); };
$('#btn-arquivo').addEventListener('click', () => {
  A.toque();
  if (A.escolherArquivo) A.escolherArquivo();
  else $('#in-arquivo').click();
});
$('#in-arquivo').addEventListener('change', (e) => {
  const fs = [...e.target.files];
  e.target.value = '';
  sessaoDeArquivos(fs.map((f, i) => { const id = 'w' + Date.now() + i; arquivosWeb.set(id, f); return { id, nome: f.name, tamanho: f.size }; }));
});

// ---------- sessão de transcrição ----------
$('#btn-transcrever').addEventListener('click', () => {
  const itens = E.videos.filter((v) => E.sel.has(v.codigo)).map((v) => ({ ...v, estado: 'fila', transcricao: '' }));
  if (!itens.length) return;
  E.sessao = { id: Date.now(), perfil: E.perfil, itens, inicio: Date.now(), fim: null, doHistorico: false };
  pintarResultado();
  ir('resultado');
  rodar();
});

const rotuloSessao = (s) => (s.perfil.arquivo ? 'arquivos do celular' : '@' + s.perfil.nome);
function tituloDe(v, i) {
  if (nomeArq(v)) return nomeArq(v);
  const l = (v.descricao || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
  return l ? (l.length > 90 ? l.slice(0, 90) + '…' : l) : `Vídeo ${i + 1}`;
}
const ESTADOS = {
  fila: ['', 'Na fila'], baixando: ['ativo', 'Baixando áudio'], ouvindo: ['ativo', 'Transcrevendo'],
  pronto: ['ok', 'Pronto'], erro: ['erro', 'Falhou'], cancelado: ['', 'Cancelado'],
};

function pintarResultado() {
  const s = E.sessao;
  const arq = !!s.perfil.arquivo;
  $('#res-cab').innerHTML = `${avatar(s.perfil)}<div><b>${esc(s.perfil.titulo || s.perfil.nome)}</b><small>${arq ? '' : '@' + esc(s.perfil.nome) + ' · '}${s.itens.length} ${arq ? (s.itens.length > 1 ? 'arquivos' : 'arquivo') : 'vídeos'}</small></div>`;
  const icArq = '<span class="sem-img arq"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4-2.5z"/></svg></span>';
  $('#lista-res').innerHTML = s.itens.map((v, i) => `
    <article class="res" id="r-${i}" style="animation-delay:${Math.min(i, 12) * 35}ms">
      <button type="button" class="res-cab">
        ${v.arquivo ? icArq : v.thumb && !s.doHistorico ? `<img src="${cdn(v.thumb)}" alt="">` : '<span class="sem-img"></span>'}
        <div><b>${esc(tituloDe(v, i))}</b>
          <small>${[fmtData(v.data), fmtDur(v.duracao), v.views ? fmtNum(v.views) + ' views' : ''].filter(Boolean).join(' · ')}</small>
          <span class="pilula" data-p></span></div>
        <svg class="seta" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="res-corpo">
        <div class="bloco"><div class="bloco-cab"><span>Transcrição do áudio</span><button type="button" data-copiar="t">Copiar</button></div><p data-t></p></div>
        ${v.arquivo ? '' : `<div class="bloco"><div class="bloco-cab"><span>Descrição do post</span><button type="button" data-copiar="d">Copiar</button></div><p class="${v.descricao ? '' : 'vazio'}">${esc(v.descricao || 'Sem descrição')}</p></div>`}
        ${v.arquivo
    ? (A.salvarAudio && v.arquivo.uri ? '<button type="button" class="abrir-ig" data-audio><svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 20h14"/></svg>Salvar só o áudio (.m4a)</button>' : '')
    : '<button type="button" class="abrir-ig" data-abrir><svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>Abrir no Instagram</button>'}
      </div>
    </article>`).join('');
  s.itens.forEach((v, i) => {
    const el = $('#r-' + i);
    $('.res-cab', el).onclick = () => { el.classList.toggle('aberto'); A.toque(); };
    $('[data-copiar="t"]', el).onclick = () => { if (v.transcricao) { A.copiar(v.transcricao); aviso('Transcrição copiada'); } };
    const bd = $('[data-copiar="d"]', el); if (bd) bd.onclick = () => { A.copiar(v.descricao || ''); aviso('Descrição copiada'); };
    const ba = $('[data-abrir]', el); if (ba) ba.onclick = () => A.abrirLink(`https://www.instagram.com/reel/${v.codigo}/`);
    const bs = $('[data-audio]', el); if (bs) bs.onclick = () => { aviso('Extraindo o áudio…'); A.salvarAudio(v.arquivo.uri, v.arquivo.nome); };
    pintarItem(i);
  });
  pintarPainel();
}
function tentarDeNovo() {
  const s = E.sessao;
  if (!s || E.rodando) return;
  s.itens.forEach((v, i) => { if (v.estado === 'erro' || v.estado === 'cancelado') { v.estado = 'fila'; v.erro = ''; pintarItem(i); } });
  s.fim = null; rodar();
}
function pintarItem(i) {
  const v = E.sessao.itens[i], el = $('#r-' + i);
  if (!el) return;
  const [cls, txt] = ESTADOS[v.estado] || ESTADOS.fila;
  const p = $('[data-p]', el);
  p.className = 'pilula ' + cls;
  p.textContent = v.estado === 'erro' ? 'Falhou · toque para tentar de novo' : v.estado === 'baixando' && v.arquivo ? 'Lendo o arquivo' : (v.estado === 'pronto' && v.reuso ? 'Já transcrito antes' : txt);
  p.onclick = v.estado === 'erro' ? (ev) => { ev.stopPropagation(); tentarDeNovo(); } : null;
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
    $('#pp-titulo').textContent = prontos === tot ? (tot === 1 ? '1 transcrição pronta ✓' : `${tot} transcrições prontas ✓`) : `${prontos} de ${tot} prontas`;
    $('#pp-eta').textContent = s.fim ? `em ${Math.max(1, Math.round((s.fim - s.inicio) / 60000))} min` : '';
    if (!s.doHistorico) $('#pp-sub').textContent = s.perfil.arquivo ? 'Toque no arquivo para ver o texto ou salvar só o áudio.' : 'Toque num vídeo para ver o texto. Use "Enviar .md" para mandar ao Claude.';
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
  $('#btn-enviar').disabled = !acumulado().length;
  $('#btn-copiar-tudo').disabled = !acumulado().length;
  $('#btn-enviar span').textContent = `Enviar .md (${acumulado().length})`;
}

async function rodar() {
  const s = E.sessao;
  if (E.rodando) { E.cancelar = true; while (E.rodando) await new Promise((r) => setTimeout(r, 100)); }
  E.rodando = true; E.cancelar = false;
  A.manterTelaLigada(true);
  $('#pp-sub').textContent = turboLigado() ? 'Modo turbo ⚡' : (modeloPronto ? '' : 'Ligando o motor de transcrição…');
  let proximoAudio = null;
  s.itens.forEach((v) => {
    if (v.estado !== 'pronto' && jaFeito(v.codigo)) { v.transcricao = memoria[v.codigo].transcricao; v.estado = 'pronto'; v.reuso = true; }
  });
  s.itens.forEach((v, i) => pintarItem(i)); pintarPainel();
  const pendente = (i) => s.itens[i] && s.itens[i].estado !== 'pronto';
  const proxPendente = (i) => { while (i < s.itens.length && !pendente(i)) i++; return i; };
  const carregarAudio = (i) => (i < s.itens.length ? audioDe(s.itens[i]).then((a) => ({ a }), (e) => ({ e })) : null);
  const totalN = s.itens.length;
  const feitosN = () => s.itens.filter((x) => ['pronto', 'erro', 'cancelado'].includes(x.estado)).length;
  try { A.notificar && A.notificar('inicio', `Transcrevendo ${rotuloSessao(s)}`, `${feitosN()} de ${totalN} prontos`, feitosN(), totalN); } catch (e) {}
  guardarSessao();
  let iProx = proxPendente(0);
  proximoAudio = carregarAudio(iProx);
  for (let i = iProx; i < s.itens.length; i = proxPendente(i + 1)) {
    if (E.cancelar || E.sessao !== s) break;
    const v = s.itens[i];
    const t0 = Date.now();
    v.estado = 'baixando'; v.erro = ''; pintarItem(i); pintarPainel();
    const res = await proximoAudio;
    proximoAudio = carregarAudio(proxPendente(i + 1));
    if (res.e) { v.estado = 'erro'; v.erro = res.e.message; pintarItem(i); pintarPainel(); continue; }
    v.estado = 'ouvindo'; pintarItem(i);
    try {
      const tr = await transcreverMelhor(res.a);
      v.transcricao = tr.texto;
      v.estado = 'pronto'; v.ms = Date.now() - t0;
      lembrar(v, s.perfil.nome);
      if (tr.turbo) $('#pp-sub').textContent = 'Modo turbo ⚡';
      if (!$('#pp-sub').textContent.startsWith('Baixando')) $('#pp-sub').textContent = device === 'webgpu' ? 'Usando a GPU do celular' : '';
      else $('#pp-sub').textContent = '';
      A.toque();
    } catch (e) {
      v.estado = 'erro'; v.erro = (e.message || 'erro').slice(0, 60);
    }
    pintarItem(i); pintarPainel(); guardarSessao();
    try { A.notificar && A.notificar('progresso', `Transcrevendo ${rotuloSessao(s)}`, `${feitosN()} de ${totalN} prontos`, feitosN(), totalN); } catch (e) {}
    if (i === 0 && v.estado === 'pronto') $('#r-0').classList.add('aberto');
  }
  if (E.sessao === s) {
    s.itens.forEach((v, i) => { if (['fila', 'baixando', 'ouvindo'].includes(v.estado)) { v.estado = 'cancelado'; pintarItem(i); } });
    s.fim = Date.now();
    pintarPainel();
    guardarHistorico(s);
    guardarSessao();
    const ok = s.itens.filter((x) => x.estado === 'pronto').length;
    try { A.notificar && A.notificar('fim', `${ok} transcrições prontas ✓`, `${rotuloSessao(s)} · toque para ver`, totalN, totalN); } catch (e) {}
  } else {
    try { A.notificar && A.notificar('parar', '', '', 0, 0); } catch (e) {}
  }
  A.manterTelaLigada(false);
  E.rodando = false;
}

// ---------- sessão atual (volta para ela se o Android fechar o app) ----------
function guardarSessao() {
  const s = E.sessao;
  if (!s || s.doHistorico) return;
  gravar('sessaoAtual', { ...s, salvoEm: Date.now() });
}
function esquecerSessao() { try { localStorage.removeItem('sessaoAtual'); } catch (e) {} }
function restaurarSessao() {
  const s = ler('sessaoAtual', null);
  if (!s || !s.itens || !s.perfil) return;
  const pend = s.itens.some((v) => ['fila', 'baixando', 'ouvindo'].includes(v.estado));
  if (Date.now() - (s.salvoEm || 0) > 6 * 3600 * 1000) { esquecerSessao(); return; }
  if (!pend && Date.now() - (s.fim || 0) > 30 * 60 * 1000) return;
  s.itens.forEach((v) => { if (v.estado === 'baixando' || v.estado === 'ouvindo') v.estado = 'fila'; });
  E.sessao = s; E.perfil = s.perfil;
  pintarResultado();
  ir('resultado');
  if (pend) { s.fim = null; aviso('Continuando de onde parou…'); rodar(); }
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
    if (v.arquivo) {
      linhas.push(`## ${i + 1}. ${tituloDe(v, i)}`, `Arquivo do celular: ${nomeArq(v)}  `, info, '',
        '### Transcrição do áudio', v.transcricao || '_(sem fala detectada)_', '', '---', '');
      return;
    }
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
function gerarMdAcumulado() {
  const lista = acumulado();
  const agora = new Date();
  const perfis = [...new Set(lista.map((m) => (m.arquivo ? 'arquivos do celular' : '@' + m.perfil)))];
  const linhas = [
    `# Transcrições · acumulado (${perfis.join(', ')})`,
    `Atualizado em ${agora.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · ${lista.length} vídeos (os ${pref.limite} mais recentes)`,
    '', '---', '',
  ];
  lista.forEach((m, i) => {
    const info = [m.data ? 'Publicado: ' + new Date(m.data * 1000).toLocaleDateString('pt-BR') : '', m.duracao ? 'Duração: ' + fmtDur(m.duracao) : '', m.views ? 'Visualizações: ' + m.views.toLocaleString('pt-BR') : ''].filter(Boolean).join(' · ');
    if (m.arquivo) {
      linhas.push(`## ${i + 1}. ${tituloDe(m, i)}`, `Arquivo do celular: ${m.arquivo}  `, info, '',
        '### Transcrição do áudio', m.transcricao || '_(sem fala detectada)_', '', '---', '');
      return;
    }
    linhas.push(`## ${i + 1}. ${tituloDe(m, i)}`, `Perfil: @${m.perfil}  `, `Link: https://www.instagram.com/reel/${m.codigo}/  `, info, '',
      '### Transcrição do áudio', m.transcricao || '_(sem fala detectada)_', '',
      '### Descrição do post', m.descricao || '_(sem descrição)_', '', '---', '');
  });
  return linhas.join('\n');
}
$('#btn-enviar').addEventListener('click', () => { A.toque(); A.compartilhar('Transcricoes-acumulado.md', gerarMdAcumulado()); });
$('#btn-copiar-tudo').addEventListener('click', () => { A.copiar(gerarMdAcumulado()); aviso(`Arquivo acumulado copiado (${acumulado().length} vídeos)`); });

// ---------- histórico ----------
function guardarHistorico(s) {
  if (!s.itens.some((v) => v.estado === 'pronto')) return;
  const h = ler('historico', []).filter((x) => x.id !== s.id);
  const p = s.perfil;
  h.unshift({ id: s.id, inicio: s.inicio, fim: s.fim, perfil: { nome: p.nome, titulo: p.titulo, arquivo: !!p.arquivo },
    itens: s.itens.map(({ codigo, descricao, data, duracao, views, estado, transcricao, arquivo }) => ({ codigo, descricao, data, duracao, views, estado, transcricao, arquivo: arquivo ? { uri: arquivo.uri || '', nome: arquivo.nome, tamanho: arquivo.tamanho } : undefined })) });
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
      <div><b>${x.perfil.arquivo ? esc(x.itens.length === 1 ? nomeArq(x.itens[0]) : 'Arquivos do celular') : '@' + esc(x.perfil.nome)}</b><small>${n} transcriç${n === 1 ? 'ão' : 'ões'} · ${d}</small></div>
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
// ---------- extrator de áudio (só o áudio, sem transcrever) ----------
const EX_QUAL = { leve: { taxa: 16000, canais: 1, bitrate: 24000 } };
let exQual = ler('exQual', 'leve');
const exFila = [];
let exRodando = false, exSeq = 0;
const exPend = new Map();
const fmtTam = (b) => (b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB').replace('.', ',');
const exDormir = (ms) => new Promise((r) => setTimeout(r, ms));
function pintarExQual() { $$('#ex-qual button').forEach((b) => b.classList.toggle('sel', b.dataset.q === exQual)); }
$$('#ex-qual button').forEach((b) => b.addEventListener('click', () => { exQual = b.dataset.q; gravar('exQual', exQual); pintarExQual(); A.toque(); }));
$('#btn-extrator').addEventListener('click', () => { A.toque(); pintarExQual(); ir('extrator'); });
$('#ex-escolher').addEventListener('click', () => {
  A.toque();
  if (A.escolherArquivo) { modoArquivos = 'extrair'; A.escolherArquivo(); }
  else $('#ex-input').click();
});
$('#ex-input').addEventListener('change', (e) => {
  const fs = [...e.target.files]; e.target.value = '';
  exAdicionar(fs.map((f) => ({ arquivoWeb: f, nome: f.name, tamanho: f.size })));
});
window.aoExtraido = (id, ok, msg, tam) => { const p = exPend.get(id); if (p) { exPend.delete(id); p({ ok, msg, tam }); } };

function exAdicionar(lista) {
  for (const a of lista) {
    if (!a || !(a.uri || a.arquivoWeb)) continue;
    const t = { id: ++exSeq, a, q: exQual, el: document.createElement('div') };
    t.el.className = 'ex-item';
    t.el.innerHTML = `<div class="ex-cab"><span class="dica-ic"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4-2.5z"/></svg></span>
      <div><b>${esc(a.nome || 'arquivo')}</b><small>${a.tamanho ? fmtTam(a.tamanho) : ''}</small></div><span class="pilula" data-e>Na fila</span></div>
      <div class="barra"><i></i></div><div data-corpo></div>`;
    $('#ex-lista').prepend(t.el);
    exFila.push(t);
  }
  ir('extrator');
  exProcessar();
}
async function exProcessar() {
  if (exRodando) return;
  exRodando = true;
  A.manterTelaLigada(true);
  while (exFila.length) {
    const t = exFila.shift();
    try { await exExtrair(t); } catch (e) { exFalhou(t, e); }
  }
  A.manterTelaLigada(false);
  exRodando = false;
}
function exEstado(t, txt, cls) { const e = $('[data-e]', t.el); e.textContent = txt; e.className = 'pilula ' + (cls || ''); }
function exBarra(t, p) {
  const b = $('.barra', t.el);
  if (p == null) b.classList.add('indef'); else { b.classList.remove('indef'); b.firstElementChild.style.width = Math.round(p * 100) + '%'; }
}
function exFalhou(t, e) {
  exEstado(t, 'Falhou', 'erro'); $('.barra', t.el).hidden = true;
  $('[data-corpo]', t.el).innerHTML = `<p class="msg">${esc((e && e.message) || 'Algo deu errado.')}</p>`;
}
const exBase = (nome) => String(nome || 'audio').replace(/\.[^.]+$/, '');

async function exExtrair(t) {
  const podeLeve = typeof AudioEncoder !== 'undefined' && typeof WebMMuxer !== 'undefined';
  if (t.q === 'leve' && podeLeve) {
    try { return await exLeve(t); }
    catch (e) { if (!t.a.uri || !A.extrairPara) throw e; }
  }
  if (t.a.uri && A.extrairPara) return exOriginal(t, t.q === 'leve' ? 'Este celular não gera o áudio leve; salvei o original.' : '');
  if (podeLeve) return exLeve(t);
  throw new Error('Não consegui gerar o áudio neste aparelho.');
}

async function exOriginal(t, nota) {
  exEstado(t, 'Extraindo', 'ativo'); exBarra(t, null);
  const r = await new Promise((ok) => { exPend.set(t.id, ok); A.extrairPara(t.id, t.a.uri, t.a.nome || 'audio'); });
  if (!r.ok) throw new Error(r.msg);
  exBarra(t, 1); exEstado(t, 'Pronto', 'ok');
  $('small', t.el).textContent = `${t.a.tamanho ? fmtTam(t.a.tamanho) + ' → ' : ''}${r.tam ? fmtTam(r.tam) : 'áudio original'} · .m4a`;
  $('[data-corpo]', t.el).innerHTML = `<audio controls preload="metadata" src="/arquivo?u=${encodeURIComponent(t.a.uri)}"></audio>
    <p class="ex-ok">Salvo em Downloads › Transcritor${nota ? '. ' + esc(nota) : ''}</p>`;
  A.toque();
}

async function exLeve(t) {
  const cfg = EX_QUAL.leve;
  exEstado(t, 'Lendo o áudio', 'ativo'); exBarra(t, null);
  let buf;
  if (t.a.arquivoWeb) buf = await t.a.arquivoWeb.arrayBuffer();
  else {
    const r = await fetch('/arquivo?u=' + encodeURIComponent(t.a.uri)).catch(() => ({ ok: false, status: 0 }));
    if (!r.ok) throw new Error('Não consegui abrir o arquivo (' + r.status + ')');
    buf = await r.arrayBuffer();
  }
  const ctx = new OfflineAudioContext(cfg.canais, 1, cfg.taxa);
  let ab;
  try { ab = await ctx.decodeAudioData(buf); } catch (e) { throw new Error('Não achei áudio nesse arquivo.'); }
  buf = null;
  const canais = Math.min(cfg.canais, ab.numberOfChannels) || 1;
  const n = ab.length;
  if (!n) throw new Error('Esse vídeo não tem som.');
  exEstado(t, 'Gerando o áudio', 'ativo'); exBarra(t, 0);
  const conf = { codec: 'opus', sampleRate: cfg.taxa, numberOfChannels: canais, bitrate: cfg.bitrate };
  const sup = await AudioEncoder.isConfigSupported(conf).catch(() => ({ supported: false }));
  if (!sup.supported) throw new Error('Este celular não gera áudio Opus.');
  const muxer = new WebMMuxer.Muxer({ target: new WebMMuxer.ArrayBufferTarget(), audio: { codec: 'A_OPUS', sampleRate: cfg.taxa, numberOfChannels: canais } });
  let erroEnc = null;
  const enc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { erroEnc = e; } });
  enc.configure(conf);
  const dados = [];
  for (let c = 0; c < canais; c++) dados.push(ab.getChannelData(c));
  const BLOCO = cfg.taxa;
  for (let i = 0; i < n; i += BLOCO) {
    if (erroEnc) throw erroEnc;
    const k = Math.min(BLOCO, n - i);
    const planar = new Float32Array(k * canais);
    for (let c = 0; c < canais; c++) planar.set(dados[c].subarray(i, i + k), c * k);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: cfg.taxa, numberOfFrames: k, numberOfChannels: canais, timestamp: Math.round((i / cfg.taxa) * 1e6), data: planar });
    enc.encode(ad); ad.close();
    if (enc.encodeQueueSize > 8 || (i / BLOCO) % 20 === 0) { exBarra(t, i / n); while (enc.encodeQueueSize > 8) await exDormir(5); await exDormir(0); }
  }
  await enc.flush(); enc.close();
  if (erroEnc) throw erroEnc;
  muxer.finalize();
  const blob = new Blob([muxer.target.buffer], { type: 'audio/webm' });
  const nome = exBase(t.a.nome) + ' (audio).webm';
  let salvo = false;
  if (A.salvarBinario) {
    const b64 = await new Promise((ok, falha) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = falha; fr.readAsDataURL(blob); });
    salvo = !!A.salvarBinario(nome, 'audio/webm', b64);
  }
  exBarra(t, 1); exEstado(t, 'Pronto', 'ok');
  $('small', t.el).textContent = `${fmtDur(ab.duration)} · ${t.a.tamanho ? fmtTam(t.a.tamanho) + ' → ' : ''}${fmtTam(blob.size)} · .webm`;
  const url = URL.createObjectURL(blob);
  $('[data-corpo]', t.el).innerHTML = `<audio controls preload="metadata" src="${url}"></audio>` +
    (salvo ? '<p class="ex-ok">Salvo em Downloads › Transcritor</p>'
      : `<div class="ex-acoes"><button type="button" data-baixar>Baixar áudio</button></div>`);
  const bb = $('[data-baixar]', t.el);
  if (bb) bb.onclick = () => { const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); };
  A.toque();
}

// ---------- atualização automática pelo GitHub ----------
const REPO_API = 'https://api.github.com/repos/danielsoaresbarboza-debug/transcritor/releases/latest';
let novaVersao = null;
function versaoMaior(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y; }
  return false;
}
async function checarAtualizacao(manual) {
  const atual = (A.versao && A.versao()) || '';
  if (!/^\d+\.\d+/.test(atual)) { if (manual) aviso('Atualização só funciona no app instalado'); return; }
  if (!manual && Date.now() - ler('checouAtualizacao', 0) < 3 * 3600 * 1000 && !ler('novaVersao', null)) return;
  gravar('checouAtualizacao', Date.now());
  try {
    const r = await fetch(REPO_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!r.ok) throw new Error('GitHub ' + r.status);
    const j = await r.json();
    const tag = String(j.tag_name || '').replace(/^v/, '');
    const apk = (j.assets || []).find((x) => /\.apk$/i.test(x.name));
    if (apk && versaoMaior(tag, atual)) {
      novaVersao = { tag, url: apk.browser_download_url };
      gravar('novaVersao', novaVersao);
      $('#at-titulo').textContent = `Nova versão ${tag} disponível`;
      $('#at-sub').textContent = `Você está na ${atual}. Toque para atualizar.`;
      $('#at-btn').disabled = false; $('#at-btn').textContent = 'Atualizar';
      $('#atualiza').classList.remove('oculto');
    } else {
      gravar('novaVersao', null);
      $('#atualiza').classList.add('oculto');
      if (manual) aviso(`Você já está na versão mais nova (${atual}) ✓`);
    }
  } catch (e) { if (manual) aviso('Não consegui ver se tem versão nova. Tente de novo.'); }
}
$('#at-btn').addEventListener('click', () => {
  if (!novaVersao || !A.atualizar) return;
  A.toque();
  $('#at-btn').disabled = true; $('#at-btn').textContent = 'Baixando…';
  A.atualizar(novaVersao.url, novaVersao.tag);
});
window.aoAtualizacao = (estado, pct, msg) => {
  const sub = $('#at-sub'), btn = $('#at-btn');
  if (estado === 'baixando') { sub.textContent = `Baixando a versão nova… ${pct >= 0 ? pct + '%' : ''}`; }
  else if (estado === 'permissao') { sub.textContent = 'Permita “Instalar apps desconhecidos” para o Transcritor, volte e toque em Atualizar de novo.'; btn.disabled = false; btn.textContent = 'Atualizar'; }
  else if (estado === 'instalando') { sub.textContent = 'Confirme a instalação na tela do Android.'; btn.disabled = false; btn.textContent = 'Instalar'; }
  else if (estado === 'erro') { sub.textContent = 'Não deu para baixar: ' + (msg || 'erro') + '. Tente de novo.'; btn.disabled = false; btn.textContent = 'Tentar de novo'; }
};
$('#btn-checar').addEventListener('click', () => { A.toque(); checarAtualizacao(true); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) checarAtualizacao(false); });

pintarQtd(); pintarAjustes(); atualizarConta(); pintarRecentes();
setTimeout(() => checarAtualizacao(false), 1500);
restaurarSessao();
