// Roda dentro da página escondida do Instagram.
// Captura os dados que o próprio site carrega (sem fazer pedidos extras).
(function () {
  if (window.__tc) return;
  window.__tc = 1;

  function norm(o, c) {
    var cap = (o.caption && o.caption.text) || '';
    if (!cap && o.edge_media_to_caption && o.edge_media_to_caption.edges && o.edge_media_to_caption.edges[0])
      cap = o.edge_media_to_caption.edges[0].node.text || '';
    var vv = (o.video_versions && o.video_versions[0] && o.video_versions[0].url) || o.video_url || null;
    var cand = o.image_versions2 && o.image_versions2.candidates;
    var iv = (cand && cand.length && cand[cand.length > 2 ? 1 : 0].url) || o.display_uri || o.thumbnail_src || o.display_url || null;
    return {
      codigo: c,
      video: vv,
      thumb: iv,
      descricao: cap,
      data: o.taken_at || o.taken_at_timestamp || null,
      duracao: o.video_duration || null,
      views: o.play_count || o.ig_play_count || o.view_count || o.video_view_count || null,
      ehVideo: o.media_type === 2 || !!vv || o.is_video === true || o.product_type === 'clips',
      dono: (o.user && o.user.username) || (o.owner && o.owner.username) || null,
    };
  }

  function varre(o, out, d) {
    if (!o || typeof o !== 'object' || d > 45) return;
    if (Array.isArray(o)) {
      for (var i = 0; i < o.length; i++) varre(o[i], out, d + 1);
      return;
    }
    var c = o.code || o.shortcode;
    if (typeof c === 'string' && c.length > 5 &&
        (o.media_type !== undefined || o.video_versions || o.is_video !== undefined || o.image_versions2 || o.display_url)) {
      out.m.push(norm(o, c));
    }
    if (typeof o.username === 'string' && (o.profile_pic_url || o.profile_pic_url_hd || o.hd_profile_pic_url_info)) {
      out.u.push({
        username: o.username,
        full_name: o.full_name || '',
        foto: o.profile_pic_url_hd || (o.hd_profile_pic_url_info && o.hd_profile_pic_url_info.url) || o.profile_pic_url,
        privado: !!o.is_private,
      });
    }
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) varre(o[k], out, d + 1);
  }

  function envia(texto) {
    if (!texto || texto.length < 20) return;
    if (texto.indexOf('"code"') < 0 && texto.indexOf('shortcode') < 0 && texto.indexOf('profile_pic_url') < 0) return;
    texto = texto.replace(/^for \(;;\);/, '');
    var partes = [];
    try { partes.push(JSON.parse(texto)); } catch (e) {
      texto.split('\n').forEach(function (l) { try { partes.push(JSON.parse(l)); } catch (e2) {} });
    }
    var out = { m: [], u: [] };
    partes.forEach(function (p) { varre(p, out, 0); });
    if (out.m.length || out.u.length) {
      try { IGPonte.dados(JSON.stringify(out)); } catch (e) {}
    }
  }

  var interessa = /graphql|\/api\/v1\//;
  var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__tcu = String(u || '');
    return XO.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var x = this;
    if (interessa.test(x.__tcu || '')) {
      x.addEventListener('load', function () {
        try { if (x.responseType === '' || x.responseType === 'text') envia(x.responseText); } catch (e) {}
      });
    }
    return XS.apply(this, arguments);
  };
  var F = window.fetch;
  if (F) {
    window.fetch = function () {
      return F.apply(this, arguments).then(function (r) {
        try { if (interessa.test(r.url || '')) r.clone().text().then(envia, function () {}); } catch (e) {}
        return r;
      });
    };
  }

  window.__tcVarre = function () {
    var s = document.querySelectorAll('script[type="application/json"]');
    for (var i = 0; i < s.length; i++) {
      if (s[i].__tcLido) continue;
      s[i].__tcLido = 1;
      envia(s[i].textContent || '');
    }
  };
  window.__tcEstado = function () {
    try {
      IGPonte.estado(JSON.stringify({
        path: location.pathname,
        texto: ((document.body && document.body.innerText) || '').slice(0, 1500),
      }));
    } catch (e) {}
  };
})();
