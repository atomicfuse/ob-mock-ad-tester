/* CloudGrid Mock Ad Tester — Infinite Feed widget. Vanilla JS, no deps. */
(function () {
  'use strict';

  /* ── constants ── */
  var FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,Helvetica,Arial,sans-serif';
  var Z_TOP = 2147483647;
  var SAFE_B = 'env(safe-area-inset-bottom,0)';
  var SAFE_T = 'env(safe-area-inset-top,0)';
  var GRAD = 'linear-gradient(0deg,rgba(0,0,0,.85) 0%,rgba(0,0,0,.55) 35%,transparent 100%)';
  var IMPRESSION_DWELL_MS = 500;

  /* ── helpers ── */
  function getOrigin() {
    try {
      var s = document.currentScript;
      if (!s) {
        var all = document.getElementsByTagName('script');
        for (var i = all.length - 1; i >= 0; i--) {
          if (all[i].src && all[i].src.indexOf('/feed-widget.js') !== -1) { s = all[i]; break; }
        }
      }
      if (s && s.src) return new URL(s.src).origin;
    } catch (e) {}
    return '';
  }

  var ORIGIN = getOrigin();

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Positive-safe modulo: wrapIdx(7, 3) → 1 */
  function wrapIdx(i, n) { return ((i % n) + n) % n; }

  function send(url, data) {
    try {
      var body = JSON.stringify(data);
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
        if (navigator.sendBeacon(url, blob)) return;
      }
      fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: body, keepalive: true, mode: 'cors',
      }).catch(function () {});
    } catch (e) {}
  }

  /* ── styles ── */
  var CSS = [
    /* Shadow-DOM host reset */
    ':host{all:initial;display:block;font-family:' + FONT + ';color:#fff;}',

    /* Scoped reset — only touches our own tree so light-DOM mounts don't nuke the publisher page */
    '.cg-feed-overlay,.cg-feed-overlay *,.cg-feed-cta{box-sizing:border-box;margin:0;padding:0;}',

    /* Manual-trigger CTA chip */
    '.cg-feed-cta{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:' + (Z_TOP - 2) + ';',
    'background:#111;color:#fff;padding:12px 20px;border-radius:9999px;font-size:14px;font-weight:600;',
    'box-shadow:0 10px 30px rgba(0,0,0,.25);cursor:pointer;border:0;}',

    /* Full-screen overlay */
    '.cg-feed-overlay{position:fixed;inset:0;z-index:' + Z_TOP + ';background:#000;color:#fff;font-family:' + FONT + ';}',

    /* Scroll container — snap-mandatory for TikTok-style swiping */
    '.cg-feed-scroller{position:absolute;inset:0;overflow-y:scroll;overflow-x:hidden;',
    'scroll-snap-type:y mandatory;-webkit-overflow-scrolling:touch;}',

    /* Card: one per viewport height */
    '.cg-feed-card{position:relative;width:100vw;height:100vh;height:100dvh;',
    'scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden;',
    'display:flex;flex-direction:column;justify-content:flex-end;background:#000;}',
    '@media(min-width:1024px){.cg-feed-card{max-width:420px;margin:0 auto;}}',

    /* Background image + Ken Burns */
    '.cg-feed-img{position:absolute;inset:0;background:center/cover no-repeat #222;transition:transform .4s ease;}',
    '.cg-feed-card.is-active .cg-feed-img{animation:cgKen 7s ease-out forwards;}',
    '@keyframes cgKen{from{transform:scale(1)}to{transform:scale(1.08) translate(-1%,-1.5%)}}',

    /* Gradient scrim */
    '.cg-feed-grad{position:absolute;left:0;right:0;bottom:0;height:55%;background:' + GRAD + ';pointer-events:none;}',

    /* Body text block */
    '.cg-feed-body{position:relative;padding:24px 20px calc(28px + ' + SAFE_B + ') 20px;',
    'display:flex;flex-direction:column;gap:12px;color:#fff;}',
    '.cg-feed-card .cg-feed-body{opacity:0;transform:translateY(8px);transition:opacity .4s ease,transform .4s ease;}',
    '.cg-feed-card.is-active .cg-feed-body{opacity:1;transform:none;}',

    /* Article description (was inline style, now a proper class) */
    '.cg-feed-desc{font-size:14px;color:rgba(255,255,255,.85);text-shadow:0 1px 2px rgba(0,0,0,.5);',
    'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',

    /* Badge / kind label */
    '.cg-feed-kind{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.75);',
    'display:inline-block;padding:3px 8px;border-radius:4px;background:rgba(255,255,255,.18);align-self:flex-start;}',

    /* Title */
    '.cg-feed-title{font-size:22px;font-weight:700;line-height:1.25;',
    'text-shadow:0 1px 3px rgba(0,0,0,.5);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}',

    /* Brand */
    '.cg-feed-brand{font-size:14px;font-weight:600;opacity:.9;}',

    /* CTA row + pill button */
    '.cg-feed-cta-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:4px;}',
    '.cg-feed-more{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;background:#fff;color:#111;',
    'border-radius:9999px;font-size:14px;font-weight:600;text-decoration:none;}',

    /* ── Live-mode ad slot — minimal CSS, JS handles the heavy lifting ── */
    '.cg-feed-card--live{background:#000;}',
    '.cg-feed-live-slot{position:absolute;inset:0;overflow:hidden;background:#000;}',
    '.cg-feed-live-slot script{display:none!important;}',
    /* Provider DOM is hidden once adapted; our overlay sits on top */
    '.cg-feed-live-slot .cg-live-original{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;pointer-events:none!important;}',
    '.cg-feed-live-slot .cg-live-cover{position:absolute;inset:0;background-size:cover;background-position:center;background-color:#222;z-index:0;}',
    '.cg-feed-live-slot .cg-live-grad{position:absolute;left:0;right:0;bottom:0;height:55%;background:' + GRAD + ';pointer-events:none;z-index:1;}',
    '.cg-feed-live-slot .cg-live-body{position:absolute;bottom:0;left:0;right:0;z-index:2;',
    'padding:24px 20px calc(28px + ' + SAFE_B + ') 20px;display:flex;flex-direction:column;gap:8px;color:#fff;}',
    '.cg-feed-live-slot .cg-live-title{font-size:22px;font-weight:700;line-height:1.25;',
    'text-shadow:0 1px 3px rgba(0,0,0,.5);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}',
    '.cg-feed-live-slot .cg-live-brand{font-size:14px;font-weight:600;opacity:.9;}',
    '.cg-feed-live-slot .cg-live-cta{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;',
    'background:#fff;color:#111;border-radius:9999px;font-size:14px;font-weight:600;text-decoration:none;align-self:flex-start;}',

    /* Sponsored badge on live cards */
    '.cg-feed-kind--live{position:absolute;left:14px;top:calc(14px + ' + SAFE_T + ');z-index:2;background:rgba(0,0,0,.7);color:#fff;}',

    /* Close button */
    '.cg-feed-close{position:fixed;top:calc(14px + ' + SAFE_T + ');right:14px;z-index:' + Z_TOP + ';',
    'width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;border:0;font-size:22px;line-height:1;',
    'cursor:pointer;display:flex;align-items:center;justify-content:center;',
    'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}',
    '.cg-feed-close:hover{background:rgba(0,0,0,.75);}',
  ].join('');

  /* ── card HTML builders ── */
  function articleCardHtml(it, idx) {
    var h = '<div class="cg-feed-card" data-position="' + idx + '" data-kind="article">' +
      '<div class="cg-feed-img" style="background-image:url(\'' + esc(it.image) + '\')"></div>' +
      '<div class="cg-feed-grad"></div><div class="cg-feed-body">' +
      '<div class="cg-feed-title">' + esc(it.title) + '</div>';
    if (it.description) h += '<div class="cg-feed-desc">' + esc(it.description) + '</div>';
    h += '<div class="cg-feed-cta-row"><a class="cg-feed-more" href="' + esc(it.url) + '" data-cg-more="1">Read more \u2192</a></div></div></div>';
    return h;
  }

  function adCardHtml(it, idx) {
    return '<div class="cg-feed-card" data-position="' + idx + '" data-kind="ad">' +
      '<div class="cg-feed-img" style="background-image:url(\'' + esc(it.ad_image) + '\')"></div>' +
      '<div class="cg-feed-grad"></div><div class="cg-feed-body">' +
      '<span class="cg-feed-kind">Sponsored</span>' +
      '<div class="cg-feed-title">' + esc(it.ad_title) + '</div>' +
      '<div class="cg-feed-brand">' + esc(it.ad_brand) + '</div>' +
      '<div class="cg-feed-cta-row"><a class="cg-feed-more" href="' + esc(it.ad_landing_page) + '" data-cg-more="1">Learn more \u2192</a></div></div></div>';
  }

  function liveAdCardHtml(idx) {
    return '<div class="cg-feed-card cg-feed-card--live" data-position="' + idx + '" data-kind="ad" data-live="1">' +
      '<div class="cg-feed-live-slot"></div>' +
      '<span class="cg-feed-kind cg-feed-kind--live">Sponsored</span></div>';
  }

  /* ── live-mode snippet injection ── */

  /** Rewrite every id="…" (and quoted references in inline scripts) to avoid collisions across slots. */
  function rewriteSnippetIds(snippet, suffix) {
    var tmp = document.createElement('div');
    tmp.innerHTML = snippet;
    var idMap = {};
    var els = tmp.querySelectorAll('[id]');
    for (var i = 0; i < els.length; i++) {
      var old = els[i].getAttribute('id');
      if (!old || idMap[old]) continue;
      idMap[old] = old + suffix;
      els[i].setAttribute('id', idMap[old]);
    }
    var html = tmp.innerHTML;
    for (var key in idMap) {
      if (!Object.prototype.hasOwnProperty.call(idMap, key)) continue;
      var nid = idMap[key];
      html = html.split("'" + key + "'").join("'" + nid + "'");
      html = html.split('"' + key + '"').join('"' + nid + '"');
    }
    return html;
  }

  /** Inject HTML into a slot, re-creating <script> tags so the browser executes them. */
  function injectSnippetIntoSlot(slot, snippet) {
    slot.innerHTML = snippet;
    var scripts = slot.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      var old = scripts[i];
      var el = document.createElement('script');
      for (var j = 0; j < old.attributes.length; j++) el.setAttribute(old.attributes[j].name, old.attributes[j].value);
      if (old.text) el.text = old.text;
      old.parentNode.replaceChild(el, old);
    }
  }

  /**
   * Smart live-ad adapter — waits for any provider to render, then extracts the
   * actual ad content (image, title, brand, landing URL) and rebuilds the card
   * using our own full-bleed layout. Works for Outbrain, Taboola, ATL, or any
   * provider — identifies elements by type and size, not class names.
   *
   * The provider's original DOM is kept in the document (hidden) so their
   * impression/viewability pixels continue to fire.
   */
  function adaptLiveSlot(slot) {
    var adapted = false;

    function findMainImage() {
      var imgs = slot.querySelectorAll('img');
      var best = null, bestArea = 0;
      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        var w = img.naturalWidth || img.offsetWidth || 0;
        var h = img.naturalHeight || img.offsetHeight || 0;
        if (w < 60 || h < 60) continue; // skip tiny icons
        var src = img.src || img.currentSrc || '';
        if (src.indexOf('adchoice') !== -1 || src.indexOf('logo') !== -1) continue;
        if (src.indexOf('.svg') !== -1 && w * h < 5000) continue; // skip small SVGs
        var area = w * h;
        if (area > bestArea) { bestArea = area; best = img; }
      }
      return best;
    }

    function findLandingUrl() {
      var links = slot.querySelectorAll('a[href]');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].href || '';
        if (href.indexOf('outbrain.com/what-is') !== -1) continue;
        if (href.indexOf('adchoice') !== -1) continue;
        if (href.indexOf('taboola.com/') !== -1) continue;
        // Content links wrap images or have meaningful children
        if (links[i].querySelector('img') || links[i].querySelector('div')) return href;
      }
      // Fallback: first non-utility link
      for (var j = 0; j < links.length; j++) {
        var h2 = links[j].href || '';
        if (h2.indexOf('outbrain.com') === -1 && h2.indexOf('taboola.com') === -1 && h2.indexOf('adchoice') === -1) return h2;
      }
      return '';
    }

    function findTexts() {
      var title = '', brand = '';
      // Walk visible text nodes — first substantial text = title, next short one = brand
      var els = slot.querySelectorAll('div, span, p, h1, h2, h3, h4, h5, h6');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.querySelector('img') || el.querySelector('a') || el.querySelector('div')) continue;
        if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;
        var txt = (el.textContent || '').trim();
        if (!txt || txt.length < 2) continue;
        if (!title) { title = txt; continue; }
        if (!brand && txt !== title) { brand = txt; break; }
      }
      return { title: title, brand: brand };
    }

    function attempt() {
      if (adapted) return;
      var img = findMainImage();
      if (!img) return; // provider hasn't rendered yet
      adapted = true;
      clearInterval(poll);

      var imgSrc = img.src || img.currentSrc || '';
      var landing = findLandingUrl();
      var texts = findTexts();

      // Wrap original provider DOM so it stays for tracking but is visually hidden
      var original = document.createElement('div');
      original.className = 'cg-live-original';
      while (slot.firstChild) original.appendChild(slot.firstChild);
      slot.appendChild(original);

      // Build our own full-bleed card on top
      var cover = document.createElement('div');
      cover.className = 'cg-live-cover';
      cover.style.backgroundImage = 'url(' + imgSrc + ')';
      slot.appendChild(cover);

      var grad = document.createElement('div');
      grad.className = 'cg-live-grad';
      slot.appendChild(grad);

      var body = document.createElement('div');
      body.className = 'cg-live-body';
      var html = '';
      if (texts.title) html += '<div class="cg-live-title">' + esc(texts.title) + '</div>';
      if (texts.brand) html += '<div class="cg-live-brand">' + esc(texts.brand) + '</div>';
      if (landing) html += '<a class="cg-live-cta" href="' + esc(landing) + '" target="_blank">Learn more \u2192</a>';
      body.innerHTML = html;
      slot.appendChild(body);
    }

    // Poll until the provider renders (typically 200-2000ms)
    var poll = setInterval(attempt, 250);
    // Give up after 12s
    setTimeout(function () { clearInterval(poll); }, 12000);
  }

  /* ── overlay ── */
  function mountOverlay(host, payload) {
    var isLive = payload.ad_mode === 'live' && typeof payload.live_ad_snippet === 'string' && payload.live_ad_snippet.length > 0;
    var itemCount = payload.items.length;

    // Live mode: mount in light DOM so provider scripts can find their containers.
    // Mock mode: use Shadow DOM for style isolation.
    var root, styleHost;
    if (isLive) {
      root = document.createElement('div');
      root.setAttribute('data-cg-feed-root', '1');
      document.body.appendChild(root);
      styleHost = root;
    } else {
      var shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
      while (shadow.firstChild) shadow.removeChild(shadow.firstChild);
      root = shadow;
      styleHost = shadow;
    }

    var styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    styleHost.appendChild(styleEl);

    var overlay = document.createElement('div');
    overlay.className = 'cg-feed-overlay';

    var close = document.createElement('button');
    close.className = 'cg-feed-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '\u2715';
    overlay.appendChild(close);

    var scroller = document.createElement('div');
    scroller.className = 'cg-feed-scroller';

    /* ── live-ad lazy loader ── */
    var loopsRendered = 0;
    var liveSlotN = 0;

    function loadLiveAdInto(card) {
      if (!isLive || card._cgLiveLoaded) return;
      card._cgLiveLoaded = true;
      var slot = card.querySelector('.cg-feed-live-slot');
      if (!slot) return;
      injectSnippetIntoSlot(slot, rewriteSnippetIds(payload.live_ad_snippet, '-cg' + (++liveSlotN)));
      adaptLiveSlot(slot);
    }

    // Pre-load live ads one card before they scroll into view.
    var liveIO = isLive
      ? new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
              loadLiveAdInto(entries[i].target);
              liveIO.unobserve(entries[i].target);
            }
          }
        }, { root: scroller, rootMargin: '150% 0px', threshold: 0 })
      : null;

    function renderLoop() {
      var base = loopsRendered * itemCount;
      var html = '';
      for (var i = 0; i < itemCount; i++) {
        var it = payload.items[i];
        var pos = base + i;
        html += it.kind === 'ad'
          ? (isLive ? liveAdCardHtml(pos) : adCardHtml(it, pos))
          : articleCardHtml(it, pos);
      }
      var tmp = document.createElement('div');
      tmp.innerHTML = html;
      var cards = [];
      while (tmp.firstChild) { cards.push(tmp.firstChild); scroller.appendChild(tmp.firstChild); }
      if (isLive && liveIO) {
        for (var k = 0; k < cards.length; k++) {
          if (cards[k].getAttribute && cards[k].getAttribute('data-live') === '1') liveIO.observe(cards[k]);
        }
      }
      loopsRendered++;
      return cards;
    }

    overlay.appendChild(scroller);
    root.appendChild(overlay);

    /* ── tracking state ── */
    var entryScroll = window.scrollY || document.documentElement.scrollTop || 0;
    var startedAt = Date.now();
    var maxPosition = 0;
    var prevOverflow = document.body.style.overflow;
    var prevTouch = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    var impressionsFired = new Set();
    var visibleSince = {};

    function trackImpression(absIdx) {
      var real = wrapIdx(absIdx, itemCount);
      if (impressionsFired.has(real)) return;
      impressionsFired.add(real);
      var it = payload.items[real];
      send(ORIGIN + '/api/feed/track-impression', {
        feed_id: payload.feed_id, position: real, kind: it.kind,
        item_ref: it.kind === 'ad' ? it.ad_id : it.url,
        page: location.href, timestamp: new Date().toISOString(),
      });
    }

    function setActive(absIdx) {
      var cards = scroller.querySelectorAll('.cg-feed-card');
      for (var c = 0; c < cards.length; c++) {
        var pos = Number(cards[c].getAttribute('data-position'));
        cards[c].classList.toggle('is-active', pos === absIdx);
      }
      if (absIdx > maxPosition) maxPosition = absIdx;

      // Preload next 3 images
      var real = wrapIdx(absIdx, itemCount);
      for (var k = 1; k <= 3; k++) {
        var nxt = payload.items[(real + k) % itemCount];
        if (nxt) { var url = nxt.kind === 'ad' ? nxt.ad_image : nxt.image; if (url) new Image().src = url; }
      }

      // Render ahead to keep the infinite loop going
      var total = loopsRendered * itemCount;
      if (absIdx >= total - Math.max(2, Math.min(itemCount, 4))) {
        var added = renderLoop();
        for (var a = 0; a < added.length; a++) io.observe(added[a]);
      }
    }

    // Visibility observer — fires active-state + deferred impression
    var io = new IntersectionObserver(function (entries) {
      var now = Date.now();
      entries.forEach(function (e) {
        var pos = Number(e.target.getAttribute('data-position'));
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          if (!visibleSince[pos]) visibleSince[pos] = now;
          setActive(pos);
          setTimeout(function () {
            if (visibleSince[pos] && now - visibleSince[pos] >= 0) trackImpression(pos);
          }, IMPRESSION_DWELL_MS);
        } else {
          visibleSince[pos] = 0;
        }
      });
    }, { root: scroller, threshold: [0.6] });

    // Seed two loops so scroll-snap has content ahead
    renderLoop();
    renderLoop();
    scroller.querySelectorAll('.cg-feed-card').forEach(function (c) { io.observe(c); });
    setActive(0);
    trackImpression(0);

    // Click → track + navigate
    scroller.addEventListener('click', function (e) {
      var card = e.target.closest('.cg-feed-card');
      if (!card) return;
      var real = wrapIdx(Number(card.getAttribute('data-position')), itemCount);
      var it = payload.items[real];
      var landing = it.kind === 'ad' ? it.ad_landing_page : it.url;
      if (!landing) return;
      e.preventDefault();
      send(ORIGIN + '/api/feed/track-click', {
        feed_id: payload.feed_id, position: real, kind: it.kind,
        item_ref: it.kind === 'ad' ? it.ad_id : it.url,
        landing_url: landing, page: location.href, timestamp: new Date().toISOString(),
      });
      window.location.href = landing;
    });

    function exit() {
      send(ORIGIN + '/api/feed/track-exit', {
        feed_id: payload.feed_id,
        exit_position: wrapIdx(maxPosition, itemCount),
        items_viewed: maxPosition + 1,
        time_in_feed_ms: Date.now() - startedAt,
        page: location.href, timestamp: new Date().toISOString(),
      });
      io.disconnect();
      if (liveIO) liveIO.disconnect();
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
      if (isLive) { if (root.parentNode) root.parentNode.removeChild(root); }
      else { while (root.firstChild) root.removeChild(root.firstChild); }
      window.scrollTo(0, entryScroll);
      host.removeAttribute('data-cg-feed-open');
    }

    close.addEventListener('click', exit);

    function onKey(e) { if (e.key === 'Escape') exit(); }
    document.addEventListener('keydown', onKey);
    host._cgCleanupKey = function () { document.removeEventListener('keydown', onKey); };
    host.setAttribute('data-cg-feed-open', '1');
  }

  /* ── loader ── */
  function loadOne(el) {
    if (el.getAttribute('data-cg-init') === '1') return;
    el.setAttribute('data-cg-init', '1');
    var feedId = el.getAttribute('data-cg-feed');
    if (!feedId) return;
    var isPreview = el.getAttribute('data-cg-feed-preview') === '1';

    fetch(ORIGIN + '/api/feed?id=' + encodeURIComponent(feedId), { cache: 'no-store' })
      .then(function (r) { return (r.ok && r.status !== 204) ? r.json().catch(function () { return null; }) : null; })
      .then(function (p) {
        if (!p || !p.items || !p.items.length) return;
        if (isPreview) { mountOverlay(el, p); return; }

        var mode = p.trigger && p.trigger.mode === 'manual' ? 'manual' : 'scroll';
        var depth = p.trigger && typeof p.trigger.scroll_depth_px === 'number' ? p.trigger.scroll_depth_px : 1500;

        if (mode === 'manual') {
          var shadow = el.shadowRoot || el.attachShadow({ mode: 'open' });
          var s = document.createElement('style'); s.textContent = CSS; shadow.appendChild(s);
          var chip = document.createElement('button');
          chip.className = 'cg-feed-cta';
          chip.textContent = '\uD83D\uDCF0 See more stories';
          chip.addEventListener('click', function () { mountOverlay(el, p); });
          shadow.appendChild(chip);
          return;
        }

        // Scroll-trigger
        var fired = false;
        function check() {
          if (fired) return;
          if ((window.scrollY || document.documentElement.scrollTop || 0) >= depth) {
            fired = true;
            window.removeEventListener('scroll', check);
            mountOverlay(el, p);
          }
        }
        window.addEventListener('scroll', check, { passive: true });
        check();
      })
      .catch(function () {});
  }

  function scan() {
    var nodes = document.querySelectorAll('[data-cg-feed]');
    for (var i = 0; i < nodes.length; i++) loadOne(nodes[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();

  window.CGFeed = { scan: scan };
})();
