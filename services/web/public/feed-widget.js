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

  /* ── attribution ── */

  function readCookie(name) {
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : '';
    } catch (e) { return ''; }
  }

  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', 'ttclid', 'cmp', 'ast', 'ad', 'plc', 'sub'];
  var CLICK_ID_KEYS = { fbclid: 1, gclid: 1, ttclid: 1 };
  var ATTR_STORE_KEY = 'cg_attr';
  var ATTR_TTL_MS = 30 * 60 * 1000;

  /* Capture acquisition params from the host article page once per session.
     Click ids are case-sensitive match keys: oversized values are DROPPED,
     never truncated. First-touch is persisted in sessionStorage so a
     continuation click to another own-domain article (whose URL carries no
     campaign params) stays attributed to the original campaign. */
  function captureAttribution() {
    try {
      var out = {};
      var any = false;
      var params = new URLSearchParams(location.search);
      for (var i = 0; i < ATTR_KEYS.length; i++) {
        var k = ATTR_KEYS[i];
        var v = params.get(k);
        if (!v) continue;
        if (CLICK_ID_KEYS[k]) {
          if (v.length > 1000) continue;
        } else if (v.length > 200) {
          v = v.slice(0, 200);
        }
        out[k] = v;
        any = true;
      }
      try {
        if (document.referrer) {
          out.referrer = new URL(document.referrer).hostname.slice(0, 200);
          any = true;
        }
      } catch (e) {}
      var fbp = readCookie('_fbp');
      if (fbp && fbp.length <= 1000) { out.fbp = fbp; any = true; }
      var fbc = readCookie('_fbc');
      if (!fbc && out.fbclid) fbc = 'fb.1.' + Date.now() + '.' + out.fbclid;
      if (fbc && fbc.length <= 1000) { out.fbc = fbc; any = true; }

      var hasCampaign = !!(out.fbclid || out.gclid || out.ttclid || out.sub || out.cmp || out.utm_source);
      if (hasCampaign) {
        try { sessionStorage.setItem(ATTR_STORE_KEY, JSON.stringify({ t: Date.now(), a: out })); } catch (e) {}
      } else {
        try {
          var storedRaw = sessionStorage.getItem(ATTR_STORE_KEY);
          if (storedRaw) {
            var stored = JSON.parse(storedRaw);
            if (stored && stored.a && Date.now() - stored.t < ATTR_TTL_MS) {
              var merged = stored.a;
              if (out.fbp && !merged.fbp) merged.fbp = out.fbp;
              if (out.referrer && !merged.referrer) merged.referrer = out.referrer;
              return merged;
            }
          }
        } catch (e) {}
      }
      return any ? out : null;
    } catch (e) { return null; }
  }

  /* ── sub-id macros ── */

  function subToken(v, fallback) {
    v = (v == null ? '' : String(v)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    return v || fallback;
  }

  /* Replace {{SUBID}} / {{FEED}} / {{PLACEMENT}} in provider script text.
     {{SUBID}} and {{FEED}} are session-constant (safe in head scripts). Pass
     placementToken=null to leave {{PLACEMENT}} untouched (head scripts — a
     per-slot value there would defeat the once-per-page loader cache).
     Unknown {{...}} tokens are left as-is (may be provider macros). */
  function applyMacros(text, subid, placementToken, feed) {
    if (!text || text.indexOf('{{') === -1) return text;
    var out = text.split('{{SUBID}}').join(subid);
    if (feed != null) out = out.split('{{FEED}}').join(feed);
    if (placementToken != null) out = out.split('{{PLACEMENT}}').join(placementToken);
    return out;
  }

  /* ── styles ── */
  var CSS = [
    /* Shadow-DOM host reset */
    ':host{all:initial;display:block;font-family:' + FONT + ';color:#fff;}',

    /* Scoped reset — only touches our own tree so light-DOM mounts don't nuke the publisher page */
    '.cg-feed-overlay,.cg-feed-overlay *,.cg-feed-cta{box-sizing:border-box;margin:0;padding:0;}',

    /* Manual-trigger CTA chip — base styles; position/color/size applied inline by JS */
    '.cg-feed-cta{z-index:' + (Z_TOP - 2) + ';',
    'border-radius:9999px;font-weight:600;',
    'box-shadow:0 10px 30px rgba(0,0,0,.25);cursor:pointer;border:0;font-family:' + FONT + ';}',

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
    '@keyframes cgKen{from{transform:scale(1)}to{transform:scale(1.15) translate(-2%,-2.5%)}}',

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
    /* Listicle cards are text-forward — allow a couple more lines than articles */
    '.cg-feed-desc--card{-webkit-line-clamp:4;}',

    /* ── Listicle card (data-kind="card") — bottom-anchored text panel + banner ──
       Scoped to [data-kind="card"] so article / ad / live cards are untouched.
       The card is a flex column pinned to flex-end (base rule), so its flow
       children stack at the BOTTOM of the full-height, image-backed card:
         [.cg-feed-body → .cg-feed-cardpanel]  text panel (grows upward)
         [.cg-feed-article-ad]                 under-card ad banner, if present
       The panel gets a translucent-dark blur surface; the gradient scrim below
       stays as a legibility fallback for browsers without backdrop-filter. */
    /* Full-height, layered scrim: a deep near-black base rising from the bottom
       (rich footing for text) that fades to clear around the mid-image so the
       photo still breathes up top, plus a gentle darkening at the very top so a
       bright image never looks flat / blown-out. Both layers are smooth. */
    '.cg-feed-card[data-kind="card"] .cg-feed-grad{top:0;height:auto;',
    'background:linear-gradient(to top,rgba(0,0,0,.94) 0%,rgba(0,0,0,.86) 14%,rgba(0,0,0,.42) 40%,rgba(0,0,0,0) 62%),',
    'linear-gradient(to bottom,rgba(0,0,0,.38) 0%,rgba(0,0,0,.08) 14%,rgba(0,0,0,0) 26%);}',
    /* Body is just a padded wrapper for the panel. With no banner it carries the
       comfortable bottom space so the panel is not jammed against the edge. */
    '.cg-feed-card[data-kind="card"] .cg-feed-body{padding:0 18px calc(20px + ' + SAFE_B + ') 18px;gap:0;}',
    /* When a banner is present it owns the bottom edge; the body just needs a
       small gap above it. */
    '.cg-feed-card[data-kind="card"][data-article-ad="1"] .cg-feed-body{padding-bottom:12px;}',
    /* The frosted text panel — bottom-anchored, NOT vertically centered. Soft
       glass card: gentle radius + hairline edge so there is no harsh rectangle.
       The backdrop-blur adds depth where supported; the solid rgba background is
       the legibility fallback where backdrop-filter is unavailable. */
    '.cg-feed-cardpanel{position:relative;display:flex;flex-direction:column;',
    'padding:18px 18px 20px;border-radius:18px;color:#fff;',
    'border:1px solid rgba(255,255,255,.08);',
    'box-shadow:0 10px 34px rgba(0,0,0,.28);',
    'background:rgba(17,17,20,.46);backdrop-filter:blur(10px) saturate(120%);',
    '-webkit-backdrop-filter:blur(10px) saturate(120%);}',
    /* Short editorial accent rule above the title — a small refined touch. */
    '.cg-feed-cardpanel::before{content:"";display:block;width:30px;height:3px;',
    'border-radius:2px;background:rgba(255,255,255,.9);margin:0 0 13px;}',
    /* Title — heavy editorial weight, tight leading, full (no clamp). */
    '.cg-feed-card[data-kind="card"] .cg-feed-title{margin:0;font-size:28px;font-weight:800;',
    'line-height:1.14;letter-spacing:-.02em;color:#fff;',
    'text-shadow:0 1px 18px rgba(0,0,0,.32);',
    'display:block;-webkit-line-clamp:none;overflow:visible;}',
    /* Description — comfortable measure, softened white, full (no clamp). */
    '.cg-feed-card[data-kind="card"] .cg-feed-desc--card{margin:11px 0 0;font-size:16px;',
    'line-height:1.5;letter-spacing:-.003em;color:rgba(255,255,255,.88);',
    'text-shadow:0 1px 10px rgba(0,0,0,.28);',
    'display:block;-webkit-line-clamp:none;overflow:visible;}',
    /* Under-card banner: full-width, flush to the very bottom, but reading as an
       intentional native slot — rounded top corners lift it off the image, a soft
       upward shadow separates it from the content above, and a small "Sponsored"
       kicker labels it. Bottom padding respects the iOS safe area. */
    '.cg-feed-card[data-kind="card"] .cg-feed-article-ad.cg-aa-filled{border-radius:16px 16px 0 0;',
    'box-shadow:0 -10px 30px rgba(0,0,0,.42);padding:8px 10px;',
    'padding-bottom:calc(8px + ' + SAFE_B + ');}',
    '.cg-feed-card[data-kind="card"] .cg-feed-article-ad.cg-aa-filled::before{content:"Sponsored";',
    'display:block;font-size:10px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;',
    'color:rgba(0,0,0,.42);padding:2px 4px 7px;}',

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

    /* ── Per-article ad slot — a space below the article text into which the
       injected provider snippet renders. Stays invisible (no surface, no height)
       until the provider actually paints content, so a slow / no-fill slot never
       shows as an empty white box. The surface is added via cg-aa-filled. */
    '.cg-feed-article-ad{position:relative;width:100%;max-height:46vh;overflow-y:auto;-webkit-overflow-scrolling:touch;}',
    '.cg-feed-article-ad.cg-aa-filled{background:rgba(255,255,255,.97);border-radius:12px;color:#111;min-height:60px;padding:6px;}',
    '.cg-feed-article-ad script{display:none!important;}',

    /* ── Live-mode ad slot — minimal CSS, JS handles the heavy lifting ── */
    '.cg-feed-card--live{background:#000;}',
    '.cg-feed-live-slot{position:absolute;inset:0;overflow:hidden;background:#000;}',
    '.cg-feed-live-slot script{display:none!important;}',
    /* Our overlay sits on top of the untouched provider DOM */
    '.cg-feed-live-slot .cg-live-cover{position:absolute;inset:0;background-size:cover;background-position:center;background-color:#222;z-index:0;}',
    '.cg-feed-live-slot .cg-live-grad{position:absolute;left:0;right:0;bottom:0;height:55%;background:' + GRAD + ';pointer-events:none;z-index:1;}',
    '.cg-feed-live-slot .cg-live-body{position:absolute;bottom:0;left:0;right:0;z-index:2;',
    'padding:24px 20px calc(28px + ' + SAFE_B + ') 20px;display:flex;flex-direction:column;gap:8px;color:#fff;}',
    '.cg-feed-live-slot .cg-live-title{font-size:22px;font-weight:700;line-height:1.25;',
    'text-shadow:0 1px 3px rgba(0,0,0,.5);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}',
    '.cg-feed-live-slot .cg-live-brand{font-size:14px;font-weight:600;opacity:.9;}',
    '.cg-feed-live-slot .cg-live-cta{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;',
    'background:#fff;color:#111;border-radius:9999px;font-size:14px;font-weight:600;text-decoration:none;align-self:flex-start;}',

    /* Multi-ad live card: the provider renders its own multi-card block, so we
       skip adaptLiveSlot and just give it a light, scrollable container. */
    '.cg-feed-card--live-multi{background:#fff;}',
    '.cg-feed-card--live-multi .cg-feed-live-slot{overflow-y:auto;-webkit-overflow-scrolling:touch;',
    'background:#fff;padding:52px 12px calc(20px + ' + SAFE_B + ') 12px;}',

    /* Sponsored badge on live cards */
    '.cg-feed-kind--live{position:absolute;left:14px;top:calc(14px + ' + SAFE_T + ');z-index:2;background:rgba(0,0,0,.7);color:#fff;}',

    /* Close button */
    '.cg-feed-close{position:fixed;top:calc(14px + ' + SAFE_T + ');right:14px;z-index:' + Z_TOP + ';',
    'width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;border:0;font-size:22px;line-height:1;',
    'cursor:pointer;display:flex;align-items:center;justify-content:center;',
    'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}',
    '.cg-feed-close:hover{background:rgba(0,0,0,.75);}',

    /* Position counter — small pill mirroring the close button's chrome */
    '.cg-feed-counter{position:fixed;top:calc(14px + ' + SAFE_T + ');left:14px;z-index:' + Z_TOP + ';',
    'padding:6px 12px;border-radius:9999px;background:rgba(0,0,0,.55);color:#fff;',
    'font-size:12px;font-weight:600;font-family:' + FONT + ';',
    'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);pointer-events:none;}',

    /* Scroll-hint arrow */
    '.cg-feed-scroll-hint{position:fixed;bottom:calc(28px + ' + SAFE_B + ');left:50%;transform:translateX(-50%);',
    'z-index:' + Z_TOP + ';pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:2px;',
    'animation:cgBounce 2s ease-in-out infinite;}',
    '.cg-feed-scroll-hint svg{filter:drop-shadow(0 1px 3px rgba(0,0,0,.5));}',
    '@keyframes cgBounce{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-10px)}}',
  ].join('');

  /* ── card HTML builders ── */
  function articleCardHtml(it, idx) {
    var hasAd = !!it.banner_snippet;
    var h = '<div class="cg-feed-card" data-position="' + idx + '" data-kind="article"' +
      (hasAd ? ' data-article-ad="1"' : '') + '>' +
      '<div class="cg-feed-img" style="background-image:url(\'' + esc(it.image) + '\')"></div>' +
      '<div class="cg-feed-grad"></div><div class="cg-feed-body">' +
      '<div class="cg-feed-title">' + esc(it.title) + '</div>';
    if (it.description) h += '<div class="cg-feed-desc">' + esc(it.description) + '</div>';
    h += '<div class="cg-feed-cta-row"><a class="cg-feed-more" href="' + esc(it.url) + '" data-cg-more="1">Read more \u2192</a></div>';
    // Ad slot sits below all the article text, at the bottom of the card body.
    if (hasAd) h += '<div class="cg-feed-article-ad"></div>';
    h += '</div></div>';
    return h;
  }

  function contentCardHtml(it, idx) {
    var hasAd = !!it.banner_snippet;
    var h = '<div class="cg-feed-card" data-position="' + idx + '" data-kind="card"' +
      (hasAd ? ' data-article-ad="1"' : '') + '>' +
      '<div class="cg-feed-img" style="background-image:url(\'' + esc(it.image) + '\')"></div>' +
      '<div class="cg-feed-grad"></div><div class="cg-feed-body"><div class="cg-feed-cardpanel">' +
      '<div class="cg-feed-title">' + esc(it.title) + '</div>';
    if (it.description) h += '<div class="cg-feed-desc cg-feed-desc--card">' + esc(it.description) + '</div>';
    h += '</div></div>'; // close .cg-feed-cardpanel + .cg-feed-body
    // Non-clickable: no anchor/"Read more" row. The under-card ad banner is a
    // sibling of the body so it spans edge-to-edge, pinned at the very bottom.
    if (hasAd) h += '<div class="cg-feed-article-ad"></div>';
    h += '</div>'; // close .cg-feed-card
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

  function liveAdCardHtml(idx, multi) {
    var cls = 'cg-feed-card cg-feed-card--live' + (multi ? ' cg-feed-card--live-multi' : '');
    return '<div class="' + cls + '" data-position="' + idx + '" data-kind="ad" data-live="1">' +
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

  /* ── head-script loader (once per page) ── */
  // snippet text → { status:'loading'|'done', queue:[cb,…] }. Slots that ask
  // while the script is still in flight wait in the queue instead of firing
  // early — otherwise they'd call the provider's loader before it's defined.
  var headScriptState = {};

  function ensureHeadScript(snippet, cb) {
    if (!snippet || !snippet.trim()) { cb(); return; }

    var st = headScriptState[snippet];
    if (st) {
      if (st.status === 'done') cb();
      else st.queue.push(cb);   // still loading → wait for it
      return;
    }

    st = headScriptState[snippet] = { status: 'loading', queue: [cb] };

    function finish() {
      if (st.status === 'done') return;
      st.status = 'done';
      var q = st.queue; st.queue = [];
      for (var n = 0; n < q.length; n++) { try { q[n](); } catch (e) {} }
    }

    // Parse the snippet to extract <script src="..."> tags
    var tmp = document.createElement('div');
    tmp.innerHTML = snippet;
    var scripts = tmp.querySelectorAll('script');
    var pending = 0;

    function done() { if (--pending <= 0) finish(); }

    for (var i = 0; i < scripts.length; i++) {
      var old = scripts[i];
      var el = document.createElement('script');
      for (var j = 0; j < old.attributes.length; j++) {
        el.setAttribute(old.attributes[j].name, old.attributes[j].value);
      }
      if (old.text) el.text = old.text;
      if (el.src) {
        // Already in <head> (e.g. publisher included it) → assume available.
        if (document.querySelector('script[src="' + el.src + '"]')) continue;
        pending++;
        el.onload = el.onerror = done;
      }
      // Inline scripts execute synchronously on append; no need to wait.
      document.head.appendChild(el);
    }

    // Also inject non-script elements (e.g. <link> tags)
    var others = tmp.children;
    for (var k = 0; k < others.length; k++) {
      if (others[k].tagName !== 'SCRIPT') {
        document.head.appendChild(others[k].cloneNode(true));
      }
    }

    if (pending <= 0) finish();
  }

  /* ── overlay ── */
  function mountOverlay(host, payload) {
    // One id per feed open — every event this visit carries it, so the backend
    // computes per-session metrics directly instead of via proxies.
    var SESSION_ID = 's' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    // Campaign attribution from the article page URL (+ first-touch storage).
    var ATTRIBUTION = captureAttribution();
    // {{SUBID}} value for provider snippets: URL param → feed default → feed id.
    var SUBID = subToken(ATTRIBUTION && ATTRIBUTION.sub,
      subToken(payload.default_subid, subToken(payload.feed_id, 'nosub')));
    // {{FEED}} value: the feed id, so one shared snippet can still report per-feed.
    var FEED = subToken(payload.feed_id, 'feed');

    /* ── event batching ──
       One HTTP request per event doesn't scale under paid-traffic bursts, so
       events queue locally and flush as one bulk request every few seconds.
       Clicks/exits/session-start flush immediately (navigation may follow —
       send() uses sendBeacon, which survives unload). A pagehide flush covers
       tab closes and click-through navigations. */
    var evQueue = [];
    var evTimer = null;
    function flushEvents() {
      if (evTimer) { clearTimeout(evTimer); evTimer = null; }
      if (!evQueue.length) return;
      var batch = evQueue.splice(0, evQueue.length);
      send(ORIGIN + '/api/feed/track-batch', {
        feed_id: payload.feed_id, session_id: SESSION_ID, attribution: ATTRIBUTION,
        page: location.href, events: batch,
      });
    }
    function queueEvent(evt, urgent) {
      evt.ts = new Date().toISOString();
      evQueue.push(evt);
      if (urgent || evQueue.length >= 12) { flushEvents(); return; }
      if (!evTimer) evTimer = setTimeout(flushEvents, 4000);
    }
    var isLive = payload.ad_mode === 'live' && typeof payload.live_ad_snippet === 'string' && payload.live_ad_snippet.length > 0;
    var adsPerSnippet = typeof payload.live_ads_per_snippet === 'number' && payload.live_ads_per_snippet >= 1
      ? Math.floor(payload.live_ads_per_snippet) : 1;
    var liveMulti = isLive && adsPerSnippet > 1;
    var itemCount = payload.items.length;

    // 1-based rank of each CONTENT item (kind !== 'ad') among content items,
    // for the "n / total" position counter — ads don't consume a number.
    var contentRanks = {};
    var contentTotal = 0;
    for (var ri = 0; ri < itemCount; ri++) {
      if (payload.items[ri].kind !== 'ad') {
        contentTotal++;
        contentRanks[ri] = contentTotal;
      }
    }

    // Any article or card carrying a provider snippet also needs light-DOM
    // mounting so that injected script can find/render its container.
    var hasArticleAds = false;
    for (var ai = 0; ai < payload.items.length; ai++) {
      if (payload.items[ai].kind !== 'ad' && payload.items[ai].banner_snippet) { hasArticleAds = true; break; }
    }
    var needsLightDom = isLive || hasArticleAds;

    // Light DOM: provider scripts can find their containers.
    // Shadow DOM: style isolation (used only when nothing needs to run scripts).
    var root, styleHost;
    if (needsLightDom) {
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

    // "n / total" position counter \u2014 content items only (ads don't count).
    var counterEl = document.createElement('div');
    counterEl.className = 'cg-feed-counter';
    overlay.appendChild(counterEl);
    function updateCounter(absIdx) {
      var rank = contentRanks[wrapIdx(absIdx, itemCount)];
      if (rank) counterEl.textContent = rank + ' / ' + contentTotal;
    }

    // Scroll-hint bouncing arrow
    var scrollHint = document.createElement('div');
    scrollHint.className = 'cg-feed-scroll-hint';
    scrollHint.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    overlay.appendChild(scrollHint);

    var scroller = document.createElement('div');
    scroller.className = 'cg-feed-scroller';

    /* ── live-ad lazy loader ── */
    var loopsRendered = 0;
    var liveSlotN = 0;

    /**
     * Smart live-ad adapter — waits for any provider to render, then extracts the
     * actual ad content (image, title, brand, landing URL) and rebuilds the card
     * using our own full-bleed layout. Works for Outbrain, Taboola, ATL, or any
     * provider — identifies elements by type and size, not class names.
     *
     * The provider's original DOM is kept in the document (hidden) so their
     * impression/viewability pixels continue to fire.
     *
     * `card` (optional) enables the per-session dedupe cap: when
     * payload.live_ad_dedupe is on and this creative's fingerprint was already
     * shown this session, and the card isn't the active/adjacent one, the card
     * collapses (display:none + unobserved) instead of being adapted.
     */
    function adaptLiveSlot(slot, card) {
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

      // Card is "in play" if it's the active card or immediately adjacent —
      // never yank the viewport out from under a card the user is on/near.
      function isActiveOrAdjacent() {
        if (!card) return false;
        var pos = Number(card.getAttribute('data-position'));
        return Math.abs(pos - activeAbsIdx) <= 1;
      }

      function collapseCard() {
        try { card.style.display = 'none'; } catch (e) {}
        try { if (liveIO) liveIO.unobserve(card); } catch (e) {}
        try { io.unobserve(card); } catch (e) {}
      }

      function attempt() {
        if (adapted) return;
        var img = findMainImage();
        if (!img) return; // provider hasn't rendered yet
        adapted = true;
        clearInterval(poll);

        // READ content from provider DOM — never move, wrap, or restyle their elements.
        var imgSrc = img.src || img.currentSrc || '';
        var landing = findLandingUrl();
        var texts = findTexts();

        if (payload.live_ad_dedupe && card) {
          var fp = landing || imgSrc;
          if (fp) {
            if (seenCreatives[fp] && !isActiveOrAdjacent()) {
              // Duplicate creative, not in view — collapse instead of
              // rendering it: no impression fires, scroller skips it.
              collapseCard();
              return;
            }
            seenCreatives[fp] = 1;
          }
        }

        // Append our own overlay elements on top of the untouched provider DOM.
        // Provider's positioned elements (adchoice icon etc.) naturally sit above
        // our cover (z-index:0) thanks to their own z-index from the provider CSS.
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
        if (landing) html += '<a class="cg-live-cta" href="' + esc(landing) + '" target="_blank">Learn more →</a>';
        body.innerHTML = html;
        slot.appendChild(body);
      }

      // Poll until the provider renders (typically 200-2000ms)
      var poll = setInterval(attempt, 250);
      // Give up after 12s
      setTimeout(function () { clearInterval(poll); }, 12000);
    }

    function loadLiveAdInto(card) {
      if (!isLive || card._cgLiveLoaded) return;
      card._cgLiveLoaded = true;
      var slot = card.querySelector('.cg-feed-live-slot');
      if (!slot) return;
      var suffix = '-cg' + (++liveSlotN);
      var dataPosition = Number(card.getAttribute('data-position'));
      var real = wrapIdx(dataPosition, itemCount);
      // Loop-distinct placement: repeated passes through the infinite loop
      // re-use the same `real` index, so without a loop suffix the provider
      // would see byte-identical {{PLACEMENT}} values on every pass.
      var loop = Math.floor(dataPosition / itemCount);
      var placementToken = 'p' + real + (loop > 0 ? 'x' + loop : '');
      // {{PLACEMENT}} is snippet-only (null here keeps head script cacheable).
      var head = applyMacros(payload.live_ad_head_script || '', SUBID, null, FEED);
      var snippet = applyMacros(payload.live_ad_snippet, SUBID, placementToken, FEED);
      ensureHeadScript(head, function () {
        injectSnippetIntoSlot(slot, rewriteSnippetIds(snippet, suffix));
        // Single-ad snippet → rebuild as one full-bleed card. Multi-ad snippet →
        // leave the provider's own multi-card block in the scrollable container.
        if (!liveMulti) adaptLiveSlot(slot, card);
      });
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

    /* ── per-article ad lazy loader ── */
    var articleAdN = 0;
    function loadArticleAdInto(card) {
      if (card._cgArticleAdLoaded) return;
      card._cgArticleAdLoaded = true;
      var slot = card.querySelector('.cg-feed-article-ad');
      if (!slot) return;
      var real = wrapIdx(Number(card.getAttribute('data-position')), itemCount);
      var it = payload.items[real];
      if (!it || !it.banner_snippet) return;
      var suffix = '-cgaa' + (++articleAdN);
      var head = applyMacros(it.banner_head_script || '', SUBID, null, FEED);
      var snippet = applyMacros(it.banner_snippet, SUBID, 'ban' + real, FEED);
      ensureHeadScript(head, function () {
        injectSnippetIntoSlot(slot, rewriteSnippetIds(snippet, suffix));
        // Reveal the slot's surface only once the provider paints real content,
        // so an unfilled / slow / no-fill slot never shows as an empty white box.
        var tries = 0;
        var poll = setInterval(function () {
          tries++;
          if (slot.scrollHeight > 8 || slot.querySelector('img,iframe,a,canvas,picture,video')) {
            if (slot.className.indexOf('cg-aa-filled') === -1) slot.className += ' cg-aa-filled';
            clearInterval(poll);
          } else if (tries > 48) {
            clearInterval(poll); // ~12s: give up; leave the slot invisible
          }
        }, 250);
      });
    }
    var articleAdIO = hasArticleAds
      ? new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
              loadArticleAdInto(entries[i].target);
              articleAdIO.unobserve(entries[i].target);
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
        if (it.kind === 'ad') {
          html += isLive ? liveAdCardHtml(pos, liveMulti) : adCardHtml(it, pos);
        } else if (it.kind === 'card') {
          html += contentCardHtml(it, pos);
        } else {
          html += articleCardHtml(it, pos);
        }
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
      if (articleAdIO) {
        for (var m = 0; m < cards.length; m++) {
          if (cards[m].getAttribute && cards[m].getAttribute('data-article-ad') === '1') articleAdIO.observe(cards[m]);
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
    var hasExited = false;
    var activeAbsIdx = 0;
    // Per-mount fingerprint cache for the optional live-ad dedupe feature —
    // fingerprint = landing url (or image src if no landing) of each creative
    // actually rendered into a live-ad slot this feed session.
    var seenCreatives = {};

    function trackExitEvent() {
      queueEvent({
        t: 'exit',
        exit_position: wrapIdx(maxPosition, itemCount),
        items_viewed: maxPosition + 1,
        time_in_feed_ms: Date.now() - startedAt,
      }, true);
    }

    // Tab close / hard navigation (typed URL, external link) never reaches the
    // X button or Escape — without this, those departures fire no exit event
    // at all and just vanish from the funnel instead of being counted.
    function onPageHide() {
      if (!hasExited) { hasExited = true; trackExitEvent(); }
      flushEvents();
    }
    window.addEventListener('pagehide', onPageHide);

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
      queueEvent({
        t: 'imp', position: real, kind: it.kind,
        item_ref: it.kind === 'ad' ? it.ad_id : (it.url || it.slug || it.title), placement: 'card',
      });
      // An article/card carrying an under-content ad also produces an ad
      // impression: the card was viewed (swipe/visibility), so the ad inside
      // it was viewed.
      if (it.kind !== 'ad' && it.banner_snippet) {
        queueEvent({
          t: 'imp', position: real, kind: 'ad',
          item_ref: it.banner_ad_id || 'banner', placement: 'banner',
        });
      }
    }

    // Swipe-depth milestones — each fires once per session when the user first
    // reaches that many swipes from the top.
    var DEPTH_THRESHOLDS = [1, 2, 4, 6, 8, 10];
    var depthsFired = {};
    function trackSwipeDepth(absIdx) {
      for (var t = 0; t < DEPTH_THRESHOLDS.length; t++) {
        var d = DEPTH_THRESHOLDS[t];
        if (absIdx >= d && !depthsFired[d]) {
          depthsFired[d] = 1;
          queueEvent({ t: 'event', event: 'swipe_depth', depth: d });
        }
      }
    }

    function setActive(absIdx) {
      activeAbsIdx = absIdx;
      var cards = scroller.querySelectorAll('.cg-feed-card');
      for (var c = 0; c < cards.length; c++) {
        var pos = Number(cards[c].getAttribute('data-position'));
        cards[c].classList.toggle('is-active', pos === absIdx);
      }
      if (absIdx > maxPosition) maxPosition = absIdx;
      trackSwipeDepth(absIdx);
      updateCounter(absIdx);

      // Forward progress past the deepest card we've given its own history
      // entry: push one entry per newly-reached card (normally exactly one).
      // Backward/manual swipes into already-visited territory don't touch
      // history — the existing entries for those cards are still there.
      if (absIdx > histTop) {
        for (var hi = histTop + 1; hi <= absIdx; hi++) pushHistoryForIdx(hi);
        histTop = absIdx;
      } else if (absIdx !== lastUrlIdx) {
        // Backward/already-visited card reached by manual scroll (not the
        // browser back button): the current history entry still points at a
        // deeper card, so its URL shows the wrong slug. Repaint the address
        // bar to the visible card via replaceState — URL only, existing state
        // preserved, so stackDepth/histTop/cgDepth are all untouched and no
        // new entry is created.
        var bslug = slugForIdx(absIdx);
        var burl = bslug ? urlForSlug(bslug) : null;
        if (burl) {
          try {
            history.replaceState(history.state, '', burl);
            lastUrlIdx = absIdx;
          } catch (e) {}
        }
      }

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
    // Urgent flush: guarantees the session (and its CAPI FeedSession event)
    // exists server-side even if the user bounces immediately.
    queueEvent({ t: 'event', event: 'session_start' }, true);
    setActive(0);
    trackImpression(0);

    // Scroll-hint peek — briefly reveal the second card so users know they can scroll
    if (itemCount > 1) {
      var peekStarted = false;
      var peekTimer = setTimeout(function () {
        peekStarted = true;
        scroller.style.scrollSnapType = 'none';
        scroller.scrollTo({ top: 80, behavior: 'smooth' });
        setTimeout(function () {
          scroller.scrollTo({ top: 0, behavior: 'smooth' });
          setTimeout(function () {
            scroller.style.scrollSnapType = 'y mandatory';
          }, 500);
        }, 600);
      }, 1500);
      // Cancel peek if user scrolls before it fires
      function cancelPeek() {
        if (!peekStarted) clearTimeout(peekTimer);
        scroller.removeEventListener('scroll', cancelPeek);
      }
      scroller.addEventListener('scroll', cancelPeek, { passive: true });
    }

    // Click → track + navigate
    scroller.addEventListener('click', function (e) {
      var card = e.target.closest('.cg-feed-card');
      if (!card) return;
      var real = wrapIdx(Number(card.getAttribute('data-position')), itemCount);
      var it = payload.items[real];

      // Click inside an under-article ad slot → count it as a real-ad click, but
      // let the advertiser's own link do the navigation (don't open the article).
      if (e.target.closest && e.target.closest('.cg-feed-article-ad')) {
        queueEvent({
          t: 'click', position: real, kind: 'ad',
          item_ref: (it && it.banner_ad_id) ? it.banner_ad_id : 'banner',
          landing_url: '', placement: 'banner',
        }, true);
        return;
      }

      var landing = it.kind === 'ad' ? it.ad_landing_page : it.url;
      if (!landing) {
        // Live/real ad card has no landing of our own — count the click; the
        // provider's own markup performs the navigation.
        if (it.kind === 'ad') {
          queueEvent({
            t: 'click', position: real, kind: 'ad',
            item_ref: it.ad_id || 'live', landing_url: '', placement: 'card',
          }, true);
        }
        return;
      }
      e.preventDefault();
      queueEvent({
        t: 'click', position: real, kind: it.kind,
        item_ref: it.kind === 'ad' ? it.ad_id : it.url,
        landing_url: landing, placement: 'card',
      }, true);
      window.location.href = landing;
    });

    // Per-card URLs + back-button "stop". Without a history entry of our own,
    // a feed that pops up immediately (scroll_depth_px:0) gets closed by most
    // users via their most natural reflex — back — which navigates off the
    // article entirely instead of just dismissing the overlay. That silent
    // full-site bounce is invisible to analytics. baseUrl is captured here
    // (still the pristine publisher URL — captureAttribution() already ran
    // at the top of mountOverlay, well before any URL mutation) so every
    // urlForSlug() call rewrites from the original URL, never a mutated one.
    var baseUrl = location.href;
    var histTop = 0;     // deepest abs index that has its own history entry
    var stackDepth = 0;  // how many of OUR entries sit above the publisher entry
    var lastUrlIdx = 0;  // card index whose slug the address bar currently shows
    var suppressNextPopstate = false;

    function slugForIdx(abs) {
      var it = payload.items[wrapIdx(abs, itemCount)];
      return (it && it.slug) || null;
    }

    // Set/replace only the `item` query param against the pristine base URL.
    // `item` is never in ATTR_KEYS, so it can never leak into attribution.
    function urlForSlug(slug) {
      try {
        var u = new URL(baseUrl);
        u.searchParams.set('item', slug);
        return u.pathname + u.search + u.hash;
      } catch (e) { return null; }
    }

    // Push one history entry for card `idx`. Ads/slugless items keep whatever
    // URL is already showing (pass no URL arg) so the previous content card's
    // slug stays visible while an ad is on screen — but we still push state so
    // back-steps stay 1:1 with forward swipes.
    function pushHistoryForIdx(idx) {
      var slug = slugForIdx(idx);
      var url = slug ? urlForSlug(slug) : null;
      // Record this entry's REAL push depth in its own state so a later
      // popstate can read it back directly. Never re-derive depth from cgIdx:
      // once a forward push truncates stale forward entries, cgIdx and real
      // depth diverge, and cgIdx would over/under-state how far to unwind.
      var newDepth = stackDepth + 1;
      try {
        history.pushState({ cgFeedOpen: true, cgIdx: idx, cgDepth: newDepth }, '', url || undefined);
        stackDepth = newDepth;
        // A slug'd card actually repainted the address bar; ads/slugless cards
        // leave the previous content card's slug showing, so don't claim them.
        if (url) lastUrlIdx = idx;
      } catch (e) {}
    }

    function scrollToCard(abs) {
      try {
        var target = scroller.querySelector('[data-position="' + abs + '"]');
        if (target && target.scrollIntoView) target.scrollIntoView({ block: 'start' });
      } catch (e) {}
    }

    // Mount push = the entry for card 0.
    pushHistoryForIdx(0);
    histTop = 0;

    function onPopState(e) {
      if (suppressNextPopstate) { suppressNextPopstate = false; return; }
      var st = e && e.state;
      if (st && st.cgFeedOpen && typeof st.cgIdx === 'number') {
        // Intra-feed back/forward — step to that card, do NOT exit.
        // Read the real push depth straight from the entry we landed on;
        // this is immune to any truncation that happened before or after it
        // was created (cgIdx can lie about depth, cgDepth cannot).
        stackDepth = (typeof st.cgDepth === 'number') ? st.cgDepth : (st.cgIdx + 1);
        lastUrlIdx = st.cgIdx;
        scrollToCard(st.cgIdx);
        return;
      }
      // Popped past our base (card-0) entry — close the feed, same contract
      // as before: this is what makes an immediate back-press right after a
      // scroll_depth_px:0 mount close the overlay instead of bouncing off-site.
      exit(true);
    }
    window.addEventListener('popstate', onPopState);

    function exit(fromPopState) {
      if (hasExited) return;
      hasExited = true;
      trackExitEvent();
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('popstate', onPopState);
      io.disconnect();
      if (liveIO) liveIO.disconnect();
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
      if (isLive) { if (root.parentNode) root.parentNode.removeChild(root); }
      else { while (root.firstChild) root.removeChild(root.firstChild); }
      window.scrollTo(0, entryScroll);
      host.removeAttribute('data-cg-feed-open');
      if (!fromPopState && stackDepth > 0) {
        // Closed via the X/Escape, not by pressing back — unwind every entry
        // we pushed (one per forward step) in a single jump, so a later
        // back-press behaves normally instead of requiring extra presses.
        suppressNextPopstate = true;
        try { history.go(-stackDepth); } catch (e) {}
      }
    }

    close.addEventListener('click', function () { exit(false); });

    function onKey(e) { if (e.key === 'Escape') exit(false); }
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
          var trig = p.trigger || {};
          var ctaPos = trig.cta_position || 'sticky-bottom-center';
          var ctaText = typeof trig.cta_text === 'string' ? trig.cta_text : '\uD83D\uDCF0 See more stories';
          var ctaBg = trig.cta_bg_color || '#111';
          var ctaColor = trig.cta_text_color || '#fff';
          var ctaSize = trig.cta_size || 'medium';
          var isInline = ctaPos === 'inline';

          var sizePad = ctaSize === 'small' ? '8px 14px' : ctaSize === 'large' ? '16px 28px' : '12px 20px';
          var sizeFont = ctaSize === 'small' ? '12px' : ctaSize === 'large' ? '16px' : '14px';

          var shadow = el.shadowRoot || el.attachShadow({ mode: 'open' });
          var s = document.createElement('style'); s.textContent = CSS; shadow.appendChild(s);
          var chip = document.createElement('button');
          chip.className = 'cg-feed-cta';
          chip.textContent = ctaText;
          chip.style.background = ctaBg;
          chip.style.color = ctaColor;
          chip.style.padding = sizePad;
          chip.style.fontSize = sizeFont;

          if (isInline) {
            chip.style.position = 'relative';
            chip.style.display = 'inline-flex';
          } else {
            chip.style.position = 'fixed';
            // Vertical
            if (ctaPos.indexOf('top') !== -1) {
              chip.style.top = '20px'; chip.style.bottom = 'auto';
            } else {
              chip.style.bottom = '20px'; chip.style.top = 'auto';
            }
            // Horizontal
            if (ctaPos.indexOf('-left') !== -1) {
              chip.style.left = '20px'; chip.style.right = 'auto'; chip.style.transform = 'none';
            } else if (ctaPos.indexOf('-right') !== -1) {
              chip.style.right = '20px'; chip.style.left = 'auto'; chip.style.transform = 'none';
            } else {
              chip.style.left = '50%'; chip.style.transform = 'translateX(-50%)';
            }
          }

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
