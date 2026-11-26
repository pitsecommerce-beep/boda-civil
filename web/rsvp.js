/*
 * Confirmación de asistencia y datos de mesa de regalos con Supabase.
 * Se inyecta en la invitación durante el despliegue; el HTML original no se modifica.
 * Si la URL trae el nombre del invitado (dominio/nombre-del-invitado), el botón
 * "Confirmar asistencia" abre un formulario. Si no, conserva su enlace de WhatsApp.
 */
(function () {
  var cfg = window.BODA_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  var RESERVED = ['', 'index.html', '404.html', 'dashboard'];

  function getSlug() {
    var params = new URLSearchParams(location.search);
    var q = params.get('invitado') || params.get('i');
    if (q) return q.trim().toLowerCase();
    var path = location.pathname;
    var base = (cfg.basePath || '').replace(/\/$/, '');
    if (base && path.indexOf(base) === 0) path = path.slice(base.length);
    var seg = path.split('/').filter(Boolean)[0] || '';
    seg = decodeURIComponent(seg).trim().toLowerCase();
    return RESERVED.indexOf(seg) === -1 ? seg : '';
  }

  function rpc(fn, body) {
    return fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseAnonKey
      },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error('Error ' + r.status);
      return r.json();
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- Mesa de regalos: datos bancarios configurados en el dashboard ----------
  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
    var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    return Promise.resolve();
  }

  rpc('get_datos_regalo', {})
    .then(function (rows) {
      var d = rows && rows[0];
      if (!d || !d.clabe) return;
      var modalGifts = document.getElementById('modal-gifts');
      if (!modalGifts) return;
      var anchor = Array.prototype.find.call(modalGifts.querySelectorAll('p strong'), function (el) {
        return /concepto/i.test(el.textContent);
      });
      var box = document.createElement('span');
      box.className = 'gift-bank';
      box.innerHTML =
        (d.banco ? '<strong>Banco:</strong> ' + esc(d.banco) + '<br>' : '') +
        (d.titular ? '<strong>Titular:</strong> ' + esc(d.titular) + '<br>' : '') +
        '<strong>CLABE:</strong> <span style="letter-spacing:.06em">' + esc(d.clabe) + '</span><br>' +
        '<button type="button" class="btn" style="display:inline-block;margin:.8rem auto 0;padding:.5rem 1rem">Copiar CLABE</button><br><br>';
      var btn = box.querySelector('button');
      btn.addEventListener('click', function () {
        copyText(d.clabe).then(function () {
          btn.textContent = 'CLABE copiada';
          setTimeout(function () { btn.textContent = 'Copiar CLABE'; }, 2000);
        });
      });
      if (anchor) anchor.parentNode.insertBefore(box, anchor);
      else modalGifts.querySelector('.modal-content p').appendChild(box);
    })
    .catch(function () {});

  // ---------- Confirmar asistencia ----------
  // Con liga personalizada (dominio/?i=juan-perez o dominio/juan-perez) se confirma
  // al invitado con un clic. Sin liga, o si no se encuentra, se pide nombre y pases.
  // Se usa la tabla directamente (el dashboard ya trabaja así con la anon key).
  var api = cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/invitados';
  function rest(method, query, body) {
    return fetch(api + query, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseAnonKey,
        Prefer: 'return=representation'
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t); });
      return r.json();
    });
  }
  function slugify(t) {
    return String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  }

  var slug = getSlug();
  var btn = document.querySelector('a.btn[href*="wa.me"]');
  if (!btn) return;
  btn.removeAttribute('target');

  var style = document.createElement('style');
  style.textContent =
    '.rsvp-link{background:none;border:none;color:#7a6f66;text-decoration:underline;text-decoration-color:#c3ccb5;text-underline-offset:3px;cursor:pointer;font:inherit;font-size:.8rem;margin-top:1.4rem}' +
    '.rsvp-error{color:#b5605b}' +
    '.rsvp-form{display:flex;flex-direction:column;gap:.8rem;margin-top:1rem;text-align:left}' +
    '.rsvp-form label{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:#7a6f66}' +
    '.rsvp-form input{width:100%;margin-top:.35rem;padding:.7rem .8rem;border:1px solid #c3ccb5;background:#fff;font:inherit;font-size:1rem;color:#2f2a26;border-radius:0}' +
    '.rsvp-form .btn{margin-top:.6rem;width:100%}';
  document.head.appendChild(style);

  var modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'modal-rsvp';
  modal.innerHTML = '<div class="modal-content"><button class="modal-close" aria-label="Cerrar">&times;</button><div class="rsvp-body"></div></div>';
  document.body.appendChild(modal);
  var body = modal.querySelector('.rsvp-body');
  function show(html) { body.innerHTML = html; modal.classList.add('active'); }
  function close() { modal.classList.remove('active'); }
  modal.querySelector('.modal-close').addEventListener('click', close);
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

  function errorMsg() {
    show('<h2>Ups</h2><p class="rsvp-error">No pudimos registrar tu confirmación. Revisa tu conexión e intenta de nuevo.</p>');
  }

  var guestReq = slug
    ? rest('GET', '?select=slug,nombre,pases,estado&slug=eq.' + encodeURIComponent(slug))
        .then(function (rows) { return rows[0] || null; })
    : Promise.resolve(null);

  function responder(guest, asiste, personas) {
    return rest('PATCH', '?slug=eq.' + encodeURIComponent(guest.slug), {
      estado: asiste ? 'confirmado' : 'no_asiste',
      asistentes: asiste ? personas : 0,
      respondido_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  function confirmado(guest, personas) {
    show(
      '<h2>¡Gracias, ' + esc(guest.nombre) + '!</h2>' +
      '<p>Tu asistencia quedó confirmada' + (personas > 1 ? ' para ' + personas + ' personas' : '') + '.<br><br>Nos dará mucho gusto verte el 13 de marzo.</p>' +
      '<button class="rsvp-link" type="button">¿Al final no podrás asistir? Avísanos aquí</button>'
    );
    body.querySelector('.rsvp-link').addEventListener('click', function () {
      this.disabled = true;
      responder(guest, false, 0)
        .then(function () { show('<h2>Gracias por avisarnos</h2><p>Lamentamos que no puedas acompañarnos.<br><br>Te tendremos presente en este día.</p>'); })
        .catch(errorMsg);
    });
  }

  function formulario() {
    show(
      '<h2>Confirmar asistencia</h2>' +
      '<p>Déjanos tu nombre y cuántas personas asistirán.</p>' +
      '<form class="rsvp-form">' +
      '<label>Nombre<input name="nombre" required autocomplete="name"></label>' +
      '<label>Personas<input name="pases" type="number" min="1" max="20" value="1" required inputmode="numeric"></label>' +
      '<button class="btn" type="submit">Confirmar</button>' +
      '</form>'
    );
    var form = body.querySelector('form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var nombre = form.nombre.value.trim();
      var pases = Math.max(1, parseInt(form.pases.value, 10) || 1);
      if (!nombre) return;
      form.querySelector('button').disabled = true;
      var now = new Date().toISOString();
      var row = {
        slug: (slugify(nombre) || 'invitado') + '-' + Math.random().toString(36).slice(2, 6),
        nombre: nombre, pases: pases, estado: 'confirmado', asistentes: pases,
        respondido_at: now, updated_at: now, notas: 'Confirmó desde la invitación general'
      };
      rest('POST', '', row)
        .then(function (rows) { confirmado(rows[0] || row, pases); })
        .catch(errorMsg);
    });
  }

  var busy = false;
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    show('<h2>Un momento…</h2><p>Estamos registrando tu asistencia.</p>');
    guestReq.then(function (guest) {
      if (!guest) { formulario(); return; }
      return responder(guest, true, guest.pases).then(function () { confirmado(guest, guest.pases); });
    }).catch(function (err) {
      if (window.console) console.error('RSVP', err);
      errorMsg();
    }).then(function () { busy = false; });
  });
})();
