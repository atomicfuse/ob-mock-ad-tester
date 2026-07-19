/* CloudGrid Mock Ad Tester — Infinite Feed widget. Vanilla JS, no deps. */
(function () {
  'use strict';

  /* ── constants ── */
  var FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,Helvetica,Arial,sans-serif';
  var Z_TOP = 2147483647;
  var SAFE_B = 'env(safe-area-inset-bottom,0)';
  var SAFE_T = 'env(safe-area-inset-top,0)';
  var GRAD = 'linear-gradient(0deg,rgba(0,0,0,.85) 0%,rgba(0,0,0,.55) 35%,transparent 100%)';

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

    /* ── Listicle card (data-kind="card") — vertically CENTERED text panel + banner ──
       Scoped to [data-kind="card"] so article / ad / live cards are untouched.
       The card is a flex column; its flow children on the full-height,
       image-backed card:
         [.cg-feed-body → .cg-feed-cardpanel]  text panel, vertically centered
         [.cg-feed-article-ad]                 under-card ad banner, if present
       The body carries margin auto top+bottom, so it centers in the free space
       — the full card when there is no banner, or the space ABOVE the banner
       when one is present (the banner stays pinned to the very bottom).
       The panel gets a translucent-dark blur surface; the gradient scrim below
       stays as a legibility fallback for browsers without backdrop-filter. */
    '.cg-feed-card[data-kind="card"]{justify-content:center;}',
    /* Full-height, layered scrim: a deep near-black base rising from the bottom
       (rich footing for text) that fades to clear around the mid-image so the
       photo still breathes up top, plus a gentle darkening at the very top so a
       bright image never looks flat / blown-out. Both layers are smooth. */
    '.cg-feed-card[data-kind="card"] .cg-feed-grad{top:0;height:auto;',
    'background:linear-gradient(to top,rgba(0,0,0,.94) 0%,rgba(0,0,0,.86) 14%,rgba(0,0,0,.42) 40%,rgba(0,0,0,0) 62%),',
    'linear-gradient(to bottom,rgba(0,0,0,.38) 0%,rgba(0,0,0,.08) 14%,rgba(0,0,0,0) 26%);}',
    /* Body is a padded wrapper for the panel. margin auto top+bottom centers it
       vertically in the available space (auto margins absorb the free space, so
       when a banner is present the banner keeps the bottom edge and the body
       centers in the space above it). Padding keeps a tall panel off the card
       edges; bottom still respects the iOS safe area. */
    '.cg-feed-card[data-kind="card"] .cg-feed-body{margin-top:auto;margin-bottom:auto;',
    'padding:20px 18px calc(20px + ' + SAFE_B + ') 18px;gap:0;}',
    /* When a banner is present it owns the bottom edge; the body just needs a
       small gap above it. */
    '.cg-feed-card[data-kind="card"][data-article-ad="1"] .cg-feed-body{padding-bottom:12px;}',
    /* The frosted text panel — vertically centered on the card. Soft
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
    '.cg-feed-card[data-kind="card"] .cg-feed-title{margin:0;font-size:31px;font-weight:800;',
    'line-height:1.14;letter-spacing:-.02em;color:#fff;',
    'text-shadow:0 1px 18px rgba(0,0,0,.32);',
    'display:block;-webkit-line-clamp:none;overflow:visible;}',
    /* Description — comfortable measure, softened white, full (no clamp). */
    '.cg-feed-card[data-kind="card"] .cg-feed-desc--card{margin:11px 0 0;font-size:18px;',
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

    /* ── Chooser card (data-kind="chooser") — terminal card of a finite feed.
       Centered dark panel with a single-column list of full-width choice tiles
       (thumb + name). The list scrolls when there are more than a few. ── */
    '.cg-feed-card--chooser{background:#000;justify-content:center;align-items:center;}',
    '.cg-feed-chooser-inner{width:100%;max-width:420px;box-sizing:border-box;',
    'display:flex;flex-direction:column;padding:24px 20px calc(24px + ' + SAFE_B + ') 20px;}',
    '.cg-feed-chooser-head{font-size:26px;font-weight:800;letter-spacing:-.02em;color:#fff;',
    'text-align:center;margin-bottom:4px;}',
    '.cg-feed-chooser-sub{font-size:15px;color:rgba(255,255,255,.6);text-align:center;margin-bottom:20px;}',
    '.cg-feed-choices{display:flex;flex-direction:column;gap:12px;max-height:60vh;',
    'overflow-y:auto;-webkit-overflow-scrolling:touch;}',
    '.cg-feed-choice{display:flex;align-items:center;gap:14px;width:100%;text-align:left;',
    'background:rgba(255,255,255,.08);border:0;border-radius:14px;padding:10px;cursor:pointer;',
    'color:#fff;font-family:' + FONT + ';transition:opacity .2s ease,background .2s ease;}',
    '.cg-feed-choice:hover{background:rgba(255,255,255,.14);}',
    '.cg-feed-choice-img{flex:0 0 auto;width:84px;height:56px;border-radius:10px;',
    'background:center/cover no-repeat #222;}',
    '.cg-feed-choice-name{font-size:16px;font-weight:600;line-height:1.3;color:#fff;}',
    '.cg-feed-choice--loading{opacity:.6;}',
    '.cg-feed-choice--picked{outline:2px solid #fff;}',
    '.cg-feed-choice--disabled{opacity:.35;pointer-events:none;}',
    /* ── fact deck ── */
    '.cg-deck-root{position:fixed;inset:0;z-index:' + Z_TOP + ';display:flex;align-items:center;justify-content:center;',
    'background:radial-gradient(1200px 800px at 50% 20%,#2430C8,#1A24A0);font-family:' + FONT + ';color:#FBF8F1;}',
    '.cg-deck-wrap{width:100%;max-width:400px;padding:16px;box-sizing:border-box;}',
    '.cg-deck-close{position:absolute;top:calc(12px + ' + SAFE_T + ');right:14px;width:38px;height:38px;border-radius:50%;',
    'background:rgba(0,0,0,.35);color:#fff;border:0;font-size:20px;line-height:38px;text-align:center;cursor:pointer;z-index:5;}',
    '.cg-deck-center{text-align:center;}',
    '.cg-deck-emoji{font-size:56px;}',
    '.cg-deck-h1{font-size:40px;font-weight:800;margin:8px 0 0;}',
    '.cg-deck-sub{margin-top:12px;font-size:15px;opacity:.9;font-weight:500;line-height:1.4;}',
    '.cg-deck-btn{width:100%;padding:16px;border-radius:18px;font-weight:800;font-size:18px;border:0;cursor:pointer;',
    'box-shadow:0 8px 24px rgba(0,0,0,.25);font-family:' + FONT + ';}',
    '.cg-deck-btn:active{transform:scale(.97);}',
    '.cg-deck-fine{margin-top:14px;font-size:11px;opacity:.6;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}',
    '.cg-deck-fuse{display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:0 4px;}',
    '.cg-deck-streak{font-size:13px;font-weight:800;white-space:nowrap;}',
    '.cg-deck-bars{flex:1;display:flex;gap:3px;}',
    '.cg-deck-bar{flex:1;height:6px;border-radius:99px;background:rgba(255,255,255,.25);}',
    '.cg-deck-bar--done{background:#FBF8F1;}',
    '.cg-deck-bar--gold{background:#F5B93F;}',
    '.cg-deck-count{font-size:12px;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;}',
    '.cg-deck-stack{position:relative;width:100%;height:min(62vh,480px);}',
    '.cg-deck-card{position:absolute;inset:0;border-radius:24px;background:#FBF8F1;color:#16161C;padding:24px;',
    'box-sizing:border-box;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.35);',
    'user-select:none;-webkit-user-select:none;touch-action:none;transition:transform .28s cubic-bezier(.2,.9,.3,1.2),opacity .2s;}',
    '.cg-deck-card--hidden{visibility:hidden;}',
    '.cg-deck-card--gone{visibility:hidden;transition:none;}',
    '.cg-deck-tag{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;',
    'background:#EBE5D6;padding:5px 12px;border-radius:99px;display:inline-block;align-self:flex-start;}',
    '.cg-deck-tag--ad{background:#fef3c7;color:#92400e;}',
    '.cg-deck-body{flex:1;display:flex;align-items:center;overflow:hidden;}',
    '.cg-deck-body p{font-weight:800;line-height:1.3;font-size:26px;margin:0;}',
    '.cg-deck-body p.cg-deck-long{font-size:21px;}',
    '.cg-deck-adslot{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;border-radius:12px;margin-top:10px;}',
    '.cg-deck-stamp{position:absolute;top:24px;font-size:18px;font-weight:800;padding:4px 12px;border-radius:10px;',
    'border:4px solid;display:none;pointer-events:none;}',
    '.cg-deck-stamp--blow{left:24px;transform:rotate(-12deg);color:#FF4D5E;border-color:#FF4D5E;}',
    '.cg-deck-stamp--knew{right:24px;transform:rotate(12deg);color:#5B6B8C;border-color:#5B6B8C;}',
    '.cg-deck-actions{display:flex;gap:12px;margin-top:16px;}',
    '.cg-deck-actions button{flex:1;padding:15px;border-radius:18px;font-size:17px;font-weight:800;border:0;cursor:pointer;font-family:' + FONT + ';}',
    '.cg-deck-actions button:active{transform:scale(.96);}',
    '.cg-deck-b-knew{background:#FBF8F1;color:#5B6B8C;}',
    '.cg-deck-b-blow{background:#FF4D5E;color:#FBF8F1;}',
    '.cg-deck-score{background:#FBF8F1;color:#16161C;border-radius:24px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,.35);}',
    '.cg-deck-score-label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#5B6B8C;',
    'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin:0;}',
    '.cg-deck-score h2{font-size:34px;font-weight:800;margin:4px 0 0;}',
    '.cg-deck-score-sub{font-weight:700;color:#FF4D5E;margin-top:4px;font-size:15px;}',
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

  // Terminal card of a finite feed — offers the admin-picked next feeds. Each
  // choice carries data-cg-choose="<feed_id>" for the scroller click handler.
  function chooserCardHtml(seg, abs) {
    var nf = seg.payload.next_feeds || [];
    var h = '<div class="cg-feed-card cg-feed-card--chooser" data-position="' + abs + '" data-kind="chooser">' +
      '<div class="cg-feed-chooser-inner"><div class="cg-feed-chooser-head">Keep exploring</div>' +
      '<div class="cg-feed-chooser-sub">Pick your next feed</div><div class="cg-feed-choices">';
    for (var i = 0; i < nf.length; i++) {
      h += '<button type="button" class="cg-feed-choice" data-cg-choose="' + esc(nf[i].feed_id) + '">' +
        '<span class="cg-feed-choice-img" style="background-image:url(\'' + esc(nf[i].image) + '\')"></span>' +
        '<span class="cg-feed-choice-name">' + esc(nf[i].name) + '</span></button>';
    }
    return h + '</div></div></div>';
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
    // Campaign attribution from the article page URL (+ first-touch storage).
    // Global to the mount — every segment derives its subid/feed macros from it.
    var ATTRIBUTION = captureAttribution();
    // Per-open session id, {{SUBID}} and {{FEED}} macros now live PER SEGMENT
    // (seg.sessionId / seg.subid / seg.feedToken) — see makeSegment below.
    // Deep entry (standalone /feeds/<id>/<n> page): the page flags its mount
    // node with data-cg-feed-pos="n" (1-based, ads included). Publisher embeds
    // never set the flag, so a publisher URL that merely ends in a number
    // (/article/2024) is never misread as a feed position and their behavior
    // is byte-identical to before.
    var entryPosRaw = host && host.getAttribute ? host.getAttribute('data-cg-feed-pos') : null;
    var HAS_ENTRY_POS = !!(entryPosRaw && /^[0-9]+$/.test(entryPosRaw) && Number(entryPosRaw) >= 1);
    var ENTRY_ABS = HAS_ENTRY_POS ? Number(entryPosRaw) - 1 : 0;

    /* ── segment model ──
       The scroller is an ordered list of SEGMENTS. segments[0] is the mount
       feed. A finite segment (one with next_feeds) plays a single pass and
       ends with a chooser card; picking a target appends a NEW segment into the
       same scroller. Only the LAST segment may loop infinitely. Every segment
       owns its own session id, subid/feed macros, impression/depth/creative
       dedupe, counter ranks, and exit accounting, so a crossing (A→B) mints a
       fresh analytics identity while the user keeps scrolling in one scroller.
       With a single infinite segment this collapses to exactly the previous
       behavior (f<index> prefix empty, no chooser, one POST per flush). */
    var segments = [];
    function makeSegment(p, startAbs, opts) {
      opts = opts || {};
      var isLiveS = p.ad_mode === 'live' && typeof p.live_ad_snippet === 'string' && p.live_ad_snippet.length > 0;
      var apsS = typeof p.live_ads_per_snippet === 'number' && p.live_ads_per_snippet >= 1
        ? Math.floor(p.live_ads_per_snippet) : 1;
      var countS = p.items.length;
      // 1-based rank of each CONTENT item (kind !== 'ad') among content items,
      // for the "n / total" position counter — ads don't consume a number.
      var ranks = {};
      var ctotal = 0;
      for (var ri = 0; ri < countS; ri++) {
        if (p.items[ri].kind !== 'ad') { ctotal++; ranks[ri] = ctotal; }
      }
      var finiteS = !!(p.next_feeds && p.next_feeds.length);
      return {
        payload: p,
        feedId: p.feed_id,
        // One id per SEGMENT — every event from this segment carries it, so a
        // crossing is a distinct backend session.
        sessionId: 's' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
        arrivedFrom: opts.arrivedFrom || null,
        originSessionId: opts.originSessionId || null,
        // {{SUBID}}: URL param → feed default → feed id. {{FEED}}: the feed id.
        subid: subToken(ATTRIBUTION && ATTRIBUTION.sub,
          subToken(p.default_subid, subToken(p.feed_id, 'nosub'))),
        feedToken: subToken(p.feed_id, 'feed'),
        isLive: isLiveS,
        adsPerSnippet: apsS,
        liveMulti: isLiveS && apsS > 1,
        count: countS,
        startAbs: startAbs,
        finite: finiteS,
        chooserAbs: finiteS ? startAbs + countS : -1,
        loopsRendered: 0,
        contentRanks: ranks,
        contentTotal: ctotal,
        impressionsFired: new Set(),   // per-segment REAL-index dedupe
        depthsFired: {},               // per-segment swipe-depth milestones
        seenCreatives: {},             // per-segment live_ad_dedupe scope
        entryAbs: startAbs,            // depth-0 reference for this segment
        startedAt: 0,                  // set when the segment is first entered
        maxAbs: startAbs,              // deepest abs reached within this segment
        entered: false,
        exited: false,
        chooserViewed: false,
        chosen: null,
        index: 0
      };
    }
    // Resolve which segment an absolute index belongs to (later segments win;
    // only the last segment can be infinite).
    function segForAbs(abs) {
      for (var i = segments.length - 1; i >= 0; i--) {
        if (abs >= segments[i].startAbs) return segments[i];
      }
      return segments[0];
    }
    // Resolve an absolute index to its segment + real item (or the chooser).
    function itemForAbs(abs) {
      var seg = segForAbs(abs);
      if (seg.finite && abs === seg.chooserAbs) return { seg: seg, chooser: true, real: -1, item: null };
      var real = wrapIdx(abs - seg.startAbs, seg.count);
      return { seg: seg, chooser: false, real: real, item: seg.payload.items[real] };
    }

    segments.push(makeSegment(payload, 0, {}));
    var seg0 = segments[0];
    // Pathological deep positions (hand-typed /feeds/x/99999) would force
    // thousands of pre-rendered loops — wrap them to the equivalent card
    // instead (the absolute scheme wraps anyway: any n maps to a real card).
    // Must happen here, before ENTRY_ABS seeds any downstream state
    // (lastImpressedAbs, render seeding, history).
    if (ENTRY_ABS >= seg0.count * 100) ENTRY_ABS = wrapIdx(ENTRY_ABS, seg0.count);
    // A finite mount feed renders a single pass, so a deep link past that pass
    // would land beyond the chooser — clamp it into the single pass.
    if (seg0.finite && ENTRY_ABS >= seg0.count) ENTRY_ABS = wrapIdx(ENTRY_ABS, seg0.count);
    seg0.entryAbs = ENTRY_ABS;

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
      // Partition by segment (order-preserving) — ONE POST per segment, each
      // carrying that segment's own feed_id/session_id (+ chaining identity).
      // With a single segment this is exactly one POST of the same shape as
      // before (arrived_from_feed / origin_session_id absent for segment 0).
      var groups = [];
      var byIndex = {};
      for (var i = 0; i < batch.length; i++) {
        var evt = batch[i];
        var eseg = evt._seg;
        var g = byIndex[eseg.index];
        if (!g) { g = byIndex[eseg.index] = { seg: eseg, events: [] }; groups.push(g); }
        var clean = {};
        for (var key in evt) {
          if (key !== '_seg' && Object.prototype.hasOwnProperty.call(evt, key)) clean[key] = evt[key];
        }
        g.events.push(clean);
      }
      for (var gi = 0; gi < groups.length; gi++) {
        var gseg = groups[gi].seg;
        var body = {
          feed_id: gseg.feedId, session_id: gseg.sessionId, attribution: ATTRIBUTION,
          page: location.href, events: groups[gi].events,
        };
        if (gseg.arrivedFrom) body.arrived_from_feed = gseg.arrivedFrom;
        if (gseg.originSessionId) body.origin_session_id = gseg.originSessionId;
        send(ORIGIN + '/api/feed/track-batch', body);
      }
    }
    function queueEvent(seg, evt, urgent) {
      evt._seg = seg;
      evt.ts = new Date().toISOString();
      evQueue.push(evt);
      if (urgent || evQueue.length >= 12) { flushEvents(); return; }
      if (!evTimer) evTimer = setTimeout(flushEvents, 4000);
    }
    // Any article or card carrying a provider snippet also needs light-DOM
    // mounting so that injected script can find/render its container.
    var hasArticleAds = false;
    for (var ai = 0; ai < payload.items.length; ai++) {
      if (payload.items[ai].kind !== 'ad' && payload.items[ai].banner_snippet) { hasArticleAds = true; break; }
    }
    // Light DOM is also forced when the feed can chain (next_feeds): a chosen
    // segment may itself be live / carry article ads, and its injected provider
    // scripts must be able to find their containers in the real document.
    var needsLightDom = seg0.isLive || hasArticleAds || !!(payload.next_feeds && payload.next_feeds.length);

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
      var r = itemForAbs(absIdx);
      if (r.chooser) return; // chooser card has no counter position — leave as-is
      var rank = r.seg.contentRanks[r.real];
      if (rank) counterEl.textContent = rank + ' / ' + r.seg.contentTotal;
    }

    // Scroll-hint bouncing arrow
    var scrollHint = document.createElement('div');
    scrollHint.className = 'cg-feed-scroll-hint';
    scrollHint.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    overlay.appendChild(scrollHint);

    var scroller = document.createElement('div');
    scroller.className = 'cg-feed-scroller';

    /* ── live-ad lazy loader ── */
    // liveSlotN / articleAdN stay global across segments so every injected
    // snippet gets a unique id suffix even after a crossing.
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
    function adaptLiveSlot(slot, card, seg) {
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

        if (seg.payload.live_ad_dedupe && card) {
          var fp = landing || imgSrc;
          if (fp) {
            if (seg.seenCreatives[fp] && !isActiveOrAdjacent()) {
              // Duplicate creative, not in view — collapse instead of
              // rendering it: no impression fires, scroller skips it.
              collapseCard();
              return;
            }
            seg.seenCreatives[fp] = 1;
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
      if (card._cgLiveLoaded) return;
      var dataPosition = Number(card.getAttribute('data-position'));
      var seg = segForAbs(dataPosition);
      if (!seg.isLive) return;
      card._cgLiveLoaded = true;
      var slot = card.querySelector('.cg-feed-live-slot');
      if (!slot) return;
      var suffix = '-cg' + (++liveSlotN);
      var real = wrapIdx(dataPosition - seg.startAbs, seg.count);
      // Loop-distinct placement: repeated passes through the infinite loop
      // re-use the same `real` index, so without a loop suffix the provider
      // would see byte-identical {{PLACEMENT}} values on every pass. A chained
      // segment (index > 0) also prefixes f<index> so its slots never collide
      // with the mount feed's. Segment 0 → empty prefix (byte-identical).
      var loop = Math.floor((dataPosition - seg.startAbs) / seg.count);
      var placementToken = (seg.index > 0 ? 'f' + seg.index : '') + 'p' + real + (loop > 0 ? 'x' + loop : '');
      // {{PLACEMENT}} is snippet-only (null here keeps head script cacheable).
      var head = applyMacros(seg.payload.live_ad_head_script || '', seg.subid, null, seg.feedToken);
      var snippet = applyMacros(seg.payload.live_ad_snippet, seg.subid, placementToken, seg.feedToken);
      ensureHeadScript(head, function () {
        injectSnippetIntoSlot(slot, rewriteSnippetIds(snippet, suffix));
        // Single-ad snippet → rebuild as one full-bleed card. Multi-ad snippet →
        // leave the provider's own multi-card block in the scrollable container.
        if (!seg.liveMulti) adaptLiveSlot(slot, card, seg);
      });
    }

    // Pre-load live ads one card before they scroll into view. Created
    // UNCONDITIONALLY: a chained segment may be live even when the mount feed
    // isn't. It only ever observes cards flagged data-live="1", and
    // loadLiveAdInto no-ops for non-live segments, so a non-live mount feed
    // never triggers it (behavior identical to the previous null observer).
    var liveIO = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          loadLiveAdInto(entries[i].target);
          liveIO.unobserve(entries[i].target);
        }
      }
    }, { root: scroller, rootMargin: '150% 0px', threshold: 0 });

    /* ── per-article ad lazy loader ── */
    var articleAdN = 0;
    function loadArticleAdInto(card) {
      if (card._cgArticleAdLoaded) return;
      card._cgArticleAdLoaded = true;
      var slot = card.querySelector('.cg-feed-article-ad');
      if (!slot) return;
      var dataPosition = Number(card.getAttribute('data-position'));
      var seg = segForAbs(dataPosition);
      var real = wrapIdx(dataPosition - seg.startAbs, seg.count);
      var it = seg.payload.items[real];
      if (!it || !it.banner_snippet) return;
      var suffix = '-cgaa' + (++articleAdN);
      var head = applyMacros(it.banner_head_script || '', seg.subid, null, seg.feedToken);
      // Chained segments (index > 0) prefix f<index> so their banner slots never
      // collide with the mount feed's. Segment 0 → 'ban'+real (byte-identical).
      var placementToken = (seg.index > 0 ? 'f' + seg.index : '') + 'ban' + real;
      var snippet = applyMacros(it.banner_snippet, seg.subid, placementToken, seg.feedToken);
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
    // Created UNCONDITIONALLY (a chained segment may carry article ads even when
    // the mount feed doesn't). Only observes cards flagged data-article-ad="1",
    // and loadArticleAdInto no-ops when the slot/snippet is absent, so a feed
    // with no article ads never triggers it (identical to the old null observer).
    var articleAdIO = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          loadArticleAdInto(entries[i].target);
          articleAdIO.unobserve(entries[i].target);
        }
      }
    }, { root: scroller, rootMargin: '150% 0px', threshold: 0 });

    function renderSegmentPass(seg) {
      var base = seg.startAbs + seg.loopsRendered * seg.count;
      var html = '';
      for (var i = 0; i < seg.count; i++) {
        var it = seg.payload.items[i];
        var pos = base + i;
        if (it.kind === 'ad') {
          html += seg.isLive ? liveAdCardHtml(pos, seg.liveMulti) : adCardHtml(it, pos);
        } else if (it.kind === 'card') {
          html += contentCardHtml(it, pos);
        } else {
          html += articleCardHtml(it, pos);
        }
      }
      seg.loopsRendered++;
      // A finite segment plays a SINGLE pass and ends with a chooser card as its
      // terminal lookahead card — never a second pass.
      if (seg.finite && seg.loopsRendered === 1) {
        html += chooserCardHtml(seg, seg.chooserAbs);
      }
      var tmp = document.createElement('div');
      tmp.innerHTML = html;
      var cards = [];
      while (tmp.firstChild) { cards.push(tmp.firstChild); scroller.appendChild(tmp.firstChild); }
      // Observe every appended card for visibility (io); live/banner cards also
      // register with their lazy loaders.
      for (var k = 0; k < cards.length; k++) {
        var el = cards[k];
        if (!el.getAttribute) continue;
        io.observe(el);
        if (el.getAttribute('data-live') === '1') liveIO.observe(el);
        if (el.getAttribute('data-article-ad') === '1') articleAdIO.observe(el);
      }
      return cards;
    }

    overlay.appendChild(scroller);
    root.appendChild(overlay);

    /* ── tracking state ── */
    var entryScroll = window.scrollY || document.documentElement.scrollTop || 0;
    var hasExited = false;   // mount-level teardown guard
    var activeAbsIdx = 0;
    // startedAt / maxPosition / seenCreatives / impressionsFired / depthsFired
    // are now PER SEGMENT (seg.startedAt / seg.maxAbs / seg.seenCreatives /
    // seg.impressionsFired / seg.depthsFired).

    // A segment's exit is accounted against ITS OWN entry: exit_position and
    // items_viewed are relative to the segment's startAbs/entryAbs, and a finite
    // segment's chooser card is never counted as an item. For segment 0 (finite
    // false, startAbs 0) this reduces to exactly the previous exit event.
    function trackSegmentExit(seg) {
      if (seg.exited) return;
      var maxItemAbs = seg.finite ? Math.min(seg.maxAbs, seg.startAbs + seg.count - 1) : seg.maxAbs;
      queueEvent(seg, {
        t: 'exit',
        exit_position: wrapIdx(maxItemAbs - seg.startAbs, seg.count),
        // Actually-viewed count: cards from the entry position to the deepest
        // reached. On a deep entry the skipped cards before entryAbs were never
        // seen and must not count. Normal opens (entryAbs === startAbs) reduce
        // to maxAbs - startAbs + 1.
        items_viewed: maxItemAbs - seg.entryAbs + 1,
        time_in_feed_ms: Date.now() - seg.startedAt,
      }, true);
      seg.exited = true;
    }
    // Fire the exit for every segment the user actually entered but hasn't yet
    // left (teardown via X / Escape / back / pagehide). A segment left at a
    // crossing (A→B) is already exited and skipped here.
    function fireAllSegmentExits() {
      for (var si = 0; si < segments.length; si++) {
        if (segments[si].entered && !segments[si].exited) trackSegmentExit(segments[si]);
      }
    }

    // Tab close / hard navigation (typed URL, external link) never reaches the
    // X button or Escape — without this, those departures fire no exit event
    // at all and just vanish from the funnel instead of being counted.
    function onPageHide() {
      if (!hasExited) { hasExited = true; fireAllSegmentExits(); }
      flushEvents();
    }
    window.addEventListener('pagehide', onPageHide);

    var prevOverflow = document.body.style.overflow;
    var prevTouch = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    // Deepest absolute index already swept for impressions — a GLOBAL cursor
    // across all segments (abs space is contiguous, so the sweep continues
    // straight across a crossing). trackImpression dedupes per-segment by REAL
    // index, so loop wraps and crossings never double-fire. On a deep entry the
    // sweep starts AT the entry card: seeding this to ENTRY_ABS-1 means the
    // initial setActive(ENTRY_ABS) fires only the entry card's impression (plus
    // its banner companion), never the skipped cards. Cards visited by swiping
    // BACKWARD from the entry stay uncounted (the sweep only fires forward).
    var lastImpressedAbs = ENTRY_ABS - 1;

    function trackImpression(absIdx) {
      var r = itemForAbs(absIdx);
      var seg = r.seg;
      // Chooser card: a "view" is a chooser_view event (once per segment), not
      // an impression doc — feed_impressions stays clean of chooser cards.
      if (r.chooser) {
        if (!seg.chooserViewed) {
          seg.chooserViewed = true;
          queueEvent(seg, { t: 'event', event: 'chooser_view' });
        }
        return;
      }
      if (seg.impressionsFired.has(r.real)) return;
      seg.impressionsFired.add(r.real);
      var it = r.item;
      queueEvent(seg, {
        t: 'imp', position: r.real, kind: it.kind,
        item_ref: it.kind === 'ad' ? it.ad_id : (it.url || it.slug || it.title), placement: 'card',
      });
      // An article/card carrying an under-content ad also produces an ad
      // impression: the card was viewed (swipe/visibility), so the ad inside
      // it was viewed.
      if (it.kind !== 'ad' && it.banner_snippet) {
        queueEvent(seg, {
          t: 'imp', position: r.real, kind: 'ad',
          item_ref: it.banner_ad_id || 'banner', placement: 'banner',
        });
      }
    }

    // Swipe-depth milestones — each fires once per session when the user first
    // reaches that many swipes from where they ENTERED. Depth is relative to
    // ENTRY_ABS so a deep entry (data-cg-feed-pos) starts at depth 0 and fires
    // milestone 1 on the first actual swipe — never retroactively for skipped
    // cards. Normal opens (ENTRY_ABS 0) are unchanged: depth === absIdx.
    var DEPTH_THRESHOLDS = [1, 2, 4, 6, 8, 10];
    function trackSwipeDepth(absIdx) {
      var seg = segForAbs(absIdx);
      var depth = absIdx - seg.entryAbs;
      for (var t = 0; t < DEPTH_THRESHOLDS.length; t++) {
        var d = DEPTH_THRESHOLDS[t];
        if (depth >= d && !seg.depthsFired[d]) {
          seg.depthsFired[d] = 1;
          queueEvent(seg, { t: 'event', event: 'swipe_depth', depth: d });
        }
      }
    }

    function setActive(absIdx) {
      activeAbsIdx = absIdx;
      var r = itemForAbs(absIdx);
      var seg = r.seg;
      // First settle inside a segment → mark entered + start its clock.
      if (!seg.entered) { seg.entered = true; seg.startedAt = Date.now(); }
      var cards = scroller.querySelectorAll('.cg-feed-card');
      for (var c = 0; c < cards.length; c++) {
        var pos = Number(cards[c].getAttribute('data-position'));
        cards[c].classList.toggle('is-active', pos === absIdx);
      }
      if (absIdx > seg.maxAbs) seg.maxAbs = absIdx;
      trackSwipeDepth(absIdx);
      updateCounter(absIdx);

      // Reached-based impressions: in a vertical snap feed you cannot reach
      // card N without passing every card before it, so settling on absIdx
      // counts every not-yet-counted position up to it — fast flings included.
      // trackImpression dedupes per-segment REAL index, so a second loop pass
      // never re-fires an already-counted card, and the sweep continues cleanly
      // across a crossing into the newly-appended segment.
      if (absIdx > lastImpressedAbs) {
        for (var im = lastImpressedAbs + 1; im <= absIdx; im++) trackImpression(im);
        lastImpressedAbs = absIdx;
      }

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
        // deeper card, so its URL shows the wrong position. Repaint the
        // address bar to the visible card via replaceState — URL only,
        // existing state preserved, so stackDepth/histTop/cgDepth are all
        // untouched and no new entry is created.
        var burl = urlForIdx(absIdx);
        if (burl) {
          try {
            history.replaceState(history.state, '', burl);
            lastUrlIdx = absIdx;
          } catch (e) {}
        }
      }

      // Preload next 3 images (resolver-based; skip chooser / missing items).
      for (var k = 1; k <= 3; k++) {
        var rr = itemForAbs(absIdx + k);
        if (rr.chooser || !rr.item) continue;
        var nxt = rr.item;
        var url = nxt.kind === 'ad' ? nxt.ad_image : nxt.image;
        if (url) new Image().src = url;
      }

      // Render ahead to keep the loop going — only the LAST segment, and only if
      // it is infinite (a finite segment ends at its chooser and never loops).
      var last = segments[segments.length - 1];
      if (!last.finite && seg === last) {
        var lookahead = Math.max(2, Math.min(last.count, 4));
        if (absIdx >= last.startAbs + last.loopsRendered * last.count - lookahead) {
          renderSegmentPass(last);
        }
      }
    }

    // Visibility observer — marks the settled card active. Impressions are
    // reached-based and fire inside setActive (no dwell timer): activating
    // card N counts every position up to N.
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var pos = Number(e.target.getAttribute('data-position'));
        if (e.isIntersecting && e.intersectionRatio >= 0.6) setActive(pos);
      });
    }, { root: scroller, threshold: [0.6] });

    // Seed segment 0. A finite mount feed renders exactly ONE pass (its chooser
    // card is the terminal lookahead). An infinite feed seeds two passes so
    // scroll-snap has content ahead, plus extra passes for a deep entry.
    // renderSegmentPass observes each card (io + live/banner) as it appends, so
    // there is no separate observe sweep here.
    if (seg0.finite) {
      renderSegmentPass(seg0);
    } else {
      renderSegmentPass(seg0);
      renderSegmentPass(seg0);
      // Deep entry beyond the seeded loops: render until the entry card (plus
      // one card of lookahead) exists so the jump below has a target.
      while (seg0.startAbs + seg0.loopsRendered * seg0.count <= ENTRY_ABS + 1) renderSegmentPass(seg0);
    }
    // Urgent flush: guarantees the session (and its CAPI FeedSession event)
    // exists server-side even if the user bounces immediately.
    queueEvent(seg0, { t: 'event', event: 'session_start' }, true);
    // Deep entry: jump straight to the entry card (instant — scrollToCard uses
    // scrollIntoView with no animation) BEFORE activating it.
    if (ENTRY_ABS > 0) scrollToCard(ENTRY_ABS);
    setActive(ENTRY_ABS); // fires the entry card's impression via the reached sweep

    // Scroll-hint peek — briefly reveal the second card so users know they can
    // scroll. Skipped on deep entries: the peek scrolls to absolute offsets
    // (80px then 0), which would yank a deep-entry user back to card 0.
    if (seg0.count > 1 && ENTRY_ABS === 0) {
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

    // Cross into a chosen next feed: optimistic lock, feed_continue event, fetch
    // the target payload, then mint segment B (a FRESH session tagged with A's
    // identity), append its cards after the chooser, and smooth-scroll into it.
    // A is left at this crossing (its exit fires here). Chains of 3+ need no
    // extra code — B may itself be finite and end with its own chooser.
    function onChoose(seg, feedId, btn) {
      if (seg.chosen) return;   // already picked — permanent no-op
      if (!feedId) return;
      seg.chosen = feedId;      // optimistic lock
      if (btn && btn.className.indexOf('cg-feed-choice--loading') === -1) {
        btn.className += ' cg-feed-choice--loading';
      }
      queueEvent(seg, { t: 'event', event: 'feed_continue', chosen_feed_id: feedId }, true);
      fetch(ORIGIN + '/api/feed?id=' + encodeURIComponent(feedId), { cache: 'no-store' })
        .then(function (rsp) { return (rsp.ok && rsp.status !== 204) ? rsp.json().catch(function () { return null; }) : null; })
        .then(function (pB) {
          if (!pB || !pB.items || !pB.items.length) {
            // Failure / 204 / empty (paused or missing target — a race window
            // only): unlock so another option is pickable.
            seg.chosen = null;
            if (btn) btn.className = btn.className.replace(/\s*cg-feed-choice--loading/, '');
            return;
          }
          // A is left at the crossing — account its exit now.
          trackSegmentExit(seg);
          var segB = makeSegment(pB, seg.chooserAbs + 1, { arrivedFrom: seg.feedId, originSessionId: seg.sessionId });
          segB.index = segments.length;
          segments.push(segB);
          renderSegmentPass(segB);
          // Infinite B → seed a second pass so scroll-snap has content ahead.
          if (!segB.finite) renderSegmentPass(segB);
          // B's own session (fresh id, tagged arrived_from_feed + origin).
          queueEvent(segB, { t: 'event', event: 'session_start' }, true);
          // Lock the chooser UI permanently: picked tile highlighted, the rest
          // disabled. seg.chosen already makes the click handler a no-op.
          try {
            var card = scroller.querySelector('[data-position="' + seg.chooserAbs + '"]');
            if (card) {
              var choices = card.querySelectorAll('.cg-feed-choice');
              for (var i = 0; i < choices.length; i++) {
                var el = choices[i];
                el.className = el.className.replace(/\s*cg-feed-choice--loading/, '');
                if (el === btn) {
                  if (el.className.indexOf('cg-feed-choice--picked') === -1) el.className += ' cg-feed-choice--picked';
                } else if (el.className.indexOf('cg-feed-choice--disabled') === -1) {
                  el.className += ' cg-feed-choice--disabled';
                }
              }
            }
          } catch (e) {}
          // Smooth-scroll into B's first card; io settling fires setActive → B's
          // first impression / history / counter via the resolver.
          try {
            var target = scroller.querySelector('[data-position="' + segB.startAbs + '"]');
            if (target && target.scrollIntoView) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
            else scrollToCard(segB.startAbs);
          } catch (e2) {
            scrollToCard(segB.startAbs);
          }
        })
        .catch(function () {
          seg.chosen = null;
          if (btn) btn.className = btn.className.replace(/\s*cg-feed-choice--loading/, '');
        });
    }

    // Click → track + navigate
    scroller.addEventListener('click', function (e) {
      // Chooser choice tapped → cross into the chosen feed.
      var chooseBtn = e.target.closest ? e.target.closest('[data-cg-choose]') : null;
      if (chooseBtn) {
        var chCard = e.target.closest('.cg-feed-card');
        var chSeg = chCard ? segForAbs(Number(chCard.getAttribute('data-position'))) : segForAbs(activeAbsIdx);
        onChoose(chSeg, chooseBtn.getAttribute('data-cg-choose'), chooseBtn);
        return;
      }
      var card = e.target.closest('.cg-feed-card');
      if (!card) return;
      var r = itemForAbs(Number(card.getAttribute('data-position')));
      if (r.chooser) return; // tap on chooser card outside a choice → ignore
      var seg = r.seg;
      var real = r.real;
      var it = r.item;

      // Click inside an under-article ad slot → count it as a real-ad click, but
      // let the advertiser's own link do the navigation (don't open the article).
      if (e.target.closest && e.target.closest('.cg-feed-article-ad')) {
        queueEvent(seg, {
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
          queueEvent(seg, {
            t: 'click', position: real, kind: 'ad',
            item_ref: it.ad_id || 'live', landing_url: '', placement: 'card',
          }, true);
        }
        return;
      }
      e.preventDefault();
      queueEvent(seg, {
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
    // full-site bounce is invisible to analytics. The base URL parts are
    // captured here (still the pristine publisher URL — captureAttribution()
    // already ran at the top of mountOverlay, well before any URL mutation)
    // so every urlForIdx() call builds from the original URL, never a
    // mutated one.
    var basePath, baseSearch, baseHash;
    try {
      var bu = new URL(location.href);
      basePath = bu.pathname; baseSearch = bu.search; baseHash = bu.hash;
    } catch (e) {
      basePath = location.pathname; baseSearch = location.search; baseHash = location.hash;
    }
    // Strip any trailing slash so appending '/<n>' never yields '//<n>'.
    // A bare-root base ('/') becomes '' → '/1', '/2', ...
    basePath = String(basePath || '').replace(/\/+$/, '');
    // Deep-entry page: the URL's trailing segment IS the position number, not
    // part of the true base — strip it so subsequent pushes become /base/2,
    // /base/3, ... and never /base/5/1. Gated on the page-set flag
    // (HAS_ENTRY_POS): publisher URLs legitimately ending in a number are
    // never stripped because publisher pages never carry the flag.
    if (HAS_ENTRY_POS) basePath = basePath.replace(/\/[0-9]+$/, '');
    baseSearch = baseSearch || '';
    baseHash = baseHash || '';
    var histTop = 0;     // deepest abs index that has its own history entry
    var stackDepth = 0;  // how many of OUR entries sit above the publisher entry
    var lastUrlIdx = 0;  // card index whose URL the address bar currently shows
    var suppressNextPopstate = false;

    // Path-style per-position URL: the base pathname with the 1-based ABSOLUTE
    // feed position appended as a segment (base '/article' → card 0 shows
    // '/article/1', ad at abs 3 shows '/article/4'; loop wraps keep counting,
    // abs 12 → '/13'). EVERY position — content cards AND ad slots — gets its
    // own distinct URL. The base URL's query string and hash are preserved
    // verbatim on every step. The numeric segment is never in ATTR_KEYS, so it
    // can never leak into attribution.
    function urlForIdx(abs) {
      // Guard: null before the base parts above have initialized (setActive(0)
      // runs earlier in mountOverlay than this section).
      if (typeof basePath !== 'string') return null;
      return basePath + '/' + (abs + 1) + baseSearch + baseHash;
    }

    // Push one history entry for card `idx`. Every position — ads included —
    // gets its own URL, so back-steps stay 1:1 with forward swipes AND the
    // address bar advances on every step.
    function pushHistoryForIdx(idx) {
      var url = urlForIdx(idx);
      // Record this entry's REAL push depth in its own state so a later
      // popstate can read it back directly. Never re-derive depth from cgIdx:
      // once a forward push truncates stale forward entries, cgIdx and real
      // depth diverge, and cgIdx would over/under-state how far to unwind.
      var newDepth = stackDepth + 1;
      try {
        history.pushState({ cgFeedOpen: true, cgIdx: idx, cgDepth: newDepth }, '', url || undefined);
        stackDepth = newDepth;
        if (url) lastUrlIdx = idx;
      } catch (e) {}
    }

    function scrollToCard(abs) {
      try {
        var target = scroller.querySelector('[data-position="' + abs + '"]');
        if (target && target.scrollIntoView) target.scrollIntoView({ block: 'start' });
      } catch (e) {}
    }

    // Mount push = the entry for the entry card (card 0 on a normal open,
    // card n-1 on a deep /feeds/<id>/<n> entry). State is {cgIdx: ENTRY_ABS,
    // cgDepth: 1} and the URL is /base/<n>, so one back-press from the entry
    // card pops past our only entry and closes the overlay — exactly the
    // card-0 contract.
    pushHistoryForIdx(ENTRY_ABS);
    histTop = ENTRY_ABS;

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
      fireAllSegmentExits();
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('popstate', onPopState);
      io.disconnect();
      if (liveIO) liveIO.disconnect();
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
      if (needsLightDom) { if (root.parentNode) root.parentNode.removeChild(root); }
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

  /* ── fact deck ──
     Swipe-deck consumption UI for feed_type:'facts' payloads. Shares the
     module machinery (attribution, macros, snippet injection, beacons) with
     the scroll overlay but owns its own simplified single-session event queue
     and per-card history contract (same URL scheme: /base/<n> per card,
     back-button steps back one card, unwinding past the entry closes). */
  function mountDeck(host, payload) {
    if (host.getAttribute('data-cg-feed-open') === '1') return;
    var ATTRIBUTION = captureAttribution();
    var items = payload.items;
    var N = items.length;
    if (!N) return;

    // Deep entry (standalone /facts/<id>/<n> page) — same flag contract as
    // the feed overlay: only our own pages set data-cg-feed-pos, so publisher
    // URLs ending in a number are never misread as deck positions.
    var entryPosRaw = host && host.getAttribute ? host.getAttribute('data-cg-feed-pos') : null;
    var HAS_ENTRY_POS = !!(entryPosRaw && /^[0-9]+$/.test(entryPosRaw) && Number(entryPosRaw) >= 1);
    var ENTRY_IDX = HAS_ENTRY_POS ? Math.min(Number(entryPosRaw) - 1, N - 1) : 0;

    var isLive = payload.ad_mode === 'live' && typeof payload.live_ad_snippet === 'string' && payload.live_ad_snippet.length > 0;
    var subid = subToken(ATTRIBUTION && ATTRIBUTION.sub,
      subToken(payload.default_subid, subToken(payload.feed_id, 'nosub')));
    var feedToken = subToken(payload.feed_id, 'feed');
    var deckName = typeof payload.name === 'string' && payload.name ? payload.name : 'Fact Deck';
    var factTotal = 0;
    for (var fi = 0; fi < N; fi++) { if (items[fi].kind === 'fact') factTotal++; }

    /* ── per-deal session + event batching (single feed, single session) ── */
    var sessionId = null;
    var evQueue = [];
    var evTimer = null;
    function flushEvents() {
      if (evTimer) { clearTimeout(evTimer); evTimer = null; }
      if (!evQueue.length || !sessionId) return;
      var batch = evQueue.splice(0, evQueue.length);
      send(ORIGIN + '/api/feed/track-batch', {
        feed_id: payload.feed_id, session_id: sessionId, attribution: ATTRIBUTION,
        page: location.href, events: batch,
      });
    }
    function queueEvent(evt, urgent) {
      evt.ts = new Date().toISOString();
      evQueue.push(evt);
      if (urgent || evQueue.length >= 12) { flushEvents(); return; }
      if (!evTimer) evTimer = setTimeout(flushEvents, 4000);
    }

    /* ── deal-scoped tracking state ── */
    var dealt = false;
    var idx = 0;            // current top card
    var entryIdx = 0;       // where this deal entered (deep entry ≠ 0)
    var maxIdx = 0;         // deepest card reached this deal
    var startedAt = 0;
    var impsFired = {};     // card index → 1 (once per deal)
    var depthsFired = {};   // swipe-depth milestones (once per deal)
    var swipes = {};        // fact card index → 'knew' | 'blow'
    var bestStreak = 0;
    var completed = false;
    var hasExited = false;  // per-deal exit accounting
    var DEPTH_THRESHOLDS = [1, 2, 4, 6, 8, 10];

    function currentStreak() {
      // Consecutive 🤯 on fact cards walking back from the last swiped card.
      var s = 0;
      for (var i = idx - 1; i >= 0; i--) {
        if (items[i].kind !== 'fact') continue;
        if (swipes[i] === 'blow') s++;
        else if (swipes[i] === 'knew') break;
        else break;
      }
      return s;
    }

    function trackImpression(i) {
      if (impsFired[i]) return;
      impsFired[i] = 1;
      var it = items[i];
      queueEvent({
        t: 'imp', position: i, kind: it.kind,
        item_ref: it.kind === 'ad' ? (it.ad_id || 'live') : (it.slug || (it.fact && it.fact.text) || ''),
        placement: 'card',
      });
    }

    function trackSwipeDepth(i) {
      var depth = i - entryIdx;
      for (var t = 0; t < DEPTH_THRESHOLDS.length; t++) {
        var d = DEPTH_THRESHOLDS[t];
        if (depth >= d && !depthsFired[d]) {
          depthsFired[d] = 1;
          queueEvent({ t: 'event', event: 'swipe_depth', depth: d });
        }
      }
    }

    function trackExit() {
      if (!dealt || hasExited) return;
      hasExited = true;
      queueEvent({
        t: 'exit',
        exit_position: maxIdx,
        items_viewed: maxIdx - entryIdx + 1,
        time_in_feed_ms: Date.now() - startedAt,
      }, true);
    }

    /* ── per-card URLs — same contract as the feed overlay ── */
    var basePath, baseSearch, baseHash;
    try {
      var bu = new URL(location.href);
      basePath = bu.pathname; baseSearch = bu.search; baseHash = bu.hash;
    } catch (e) {
      basePath = location.pathname; baseSearch = location.search; baseHash = location.hash;
    }
    basePath = String(basePath || '').replace(/\/+$/, '');
    if (HAS_ENTRY_POS) basePath = basePath.replace(/\/[0-9]+$/, '');
    baseSearch = baseSearch || '';
    baseHash = baseHash || '';
    var stackDepth = 0;
    var suppressNextPopstate = false;

    function urlForIdx(i) {
      if (typeof basePath !== 'string') return null;
      return basePath + '/' + (i + 1) + baseSearch + baseHash;
    }
    function pushHistoryForIdx(i) {
      var url = urlForIdx(i);
      var newDepth = stackDepth + 1;
      try {
        history.pushState({ cgDeckOpen: true, cgIdx: i, cgDepth: newDepth }, '', url || undefined);
        stackDepth = newDepth;
      } catch (e) {}
    }

    function onPopState(e) {
      if (suppressNextPopstate) { suppressNextPopstate = false; return; }
      var st = e && e.state;
      if (st && st.cgDeckOpen && typeof st.cgIdx === 'number') {
        stackDepth = (typeof st.cgDepth === 'number') ? st.cgDepth : (st.cgIdx + 1);
        // Step the deck to that card (backward re-shows it; forward re-advances).
        if (completed) { completed = false; renderPlay(st.cgIdx); }
        else setTop(st.cgIdx, true);
        return;
      }
      // Popped past our entry — close the deck, same contract as the overlay.
      exit(true);
    }
    window.addEventListener('popstate', onPopState);

    function onPageHide() { trackExit(); flushEvents(); }
    window.addEventListener('pagehide', onPageHide);

    /* ── mount root ── */
    // Light DOM when live so provider scripts can find their containers;
    // Shadow DOM otherwise for style isolation (same rule as the overlay).
    var root, mountPoint;
    if (isLive) {
      root = document.createElement('div');
      root.setAttribute('data-cg-deck-root', '1');
      var st0 = document.createElement('style'); st0.textContent = CSS;
      root.appendChild(st0);
      document.body.appendChild(root);
      mountPoint = root;
    } else {
      var shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
      while (shadow.firstChild) shadow.removeChild(shadow.firstChild);
      var st1 = document.createElement('style'); st1.textContent = CSS;
      shadow.appendChild(st1);
      root = shadow;
      mountPoint = shadow;
    }

    var backdrop = document.createElement('div');
    backdrop.className = 'cg-deck-root';
    mountPoint.appendChild(backdrop);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'cg-deck-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '✕';
    backdrop.appendChild(closeBtn);

    var wrap = document.createElement('div');
    wrap.className = 'cg-deck-wrap';
    backdrop.appendChild(wrap);

    var prevOverflow = document.body.style.overflow;
    var prevTouch = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    var entryScroll = window.scrollY || 0;

    /* ── start screen ── */
    function renderStart() {
      wrap.innerHTML =
        '<div class="cg-deck-center">' +
        '<div class="cg-deck-emoji">🃏</div>' +
        '<h1 class="cg-deck-h1">' + esc(deckName) + '</h1>' +
        '<p class="cg-deck-sub">' + N + ' cards. Swipe right if it blew your mind 🤯, left if you knew it 😎.</p>' +
        '<button class="cg-deck-btn" data-cg-deal="1" style="margin-top:28px;background:#FBF8F1;color:#16161C">Deal the deck →</button>' +
        '<p class="cg-deck-fine">every deal is a fresh shuffle of the queue</p>' +
        '</div>';
      var dealBtn = wrap.querySelector('[data-cg-deal]');
      if (dealBtn) dealBtn.addEventListener('click', function () { deal(0); });
    }

    /* ── deal / play ── */
    var stackEl = null;
    var liveSlotN = 0;

    function deal(startIdx) {
      // Fresh analytics identity per deal — a re-deal is a new backend session
      // (same pattern as feed chaining's per-segment sessions).
      sessionId = 's' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      dealt = true;
      hasExited = false;
      completed = false;
      entryIdx = startIdx;
      maxIdx = startIdx;
      startedAt = Date.now();
      impsFired = {};
      depthsFired = {};
      swipes = {};
      bestStreak = 0;
      queueEvent({ t: 'event', event: 'session_start' }, true);
      renderPlay(startIdx);
      pushHistoryForIdx(startIdx);
    }

    function cardHtml(it, i) {
      if (it.kind === 'ad') {
        return '<div class="cg-deck-card cg-deck-card--hidden" data-deck-pos="' + i + '" data-kind="ad">' +
          '<span class="cg-deck-tag cg-deck-tag--ad">Sponsored</span>' +
          '<div class="cg-deck-adslot"></div>' +
          '<div class="cg-deck-stamp cg-deck-stamp--blow">🤯 MIND BLOWN</div>' +
          '<div class="cg-deck-stamp cg-deck-stamp--knew">😎 KNEW IT</div>' +
          '</div>';
      }
      var text = (it.fact && it.fact.text) || '';
      var long = text.length > 120 ? ' cg-deck-long' : '';
      return '<div class="cg-deck-card cg-deck-card--hidden" data-deck-pos="' + i + '" data-kind="fact">' +
        '<span class="cg-deck-tag">✨ fact</span>' +
        '<div class="cg-deck-body"><p class="' + long.replace(' ', '') + '">' + esc(text) + '</p></div>' +
        '<div class="cg-deck-stamp cg-deck-stamp--blow">🤯 MIND BLOWN</div>' +
        '<div class="cg-deck-stamp cg-deck-stamp--knew">😎 KNEW IT</div>' +
        '</div>';
    }

    function renderPlay(startIdx) {
      var barsHtml = '';
      for (var b = 0; b < N; b++) {
        barsHtml += '<div class="cg-deck-bar' + (items[b].kind === 'ad' ? ' cg-deck-bar--gold' : '') + '" data-deck-bar="' + b + '"></div>';
      }
      var cardsHtml = '';
      for (var ci = 0; ci < N; ci++) cardsHtml += cardHtml(items[ci], ci);
      wrap.innerHTML =
        '<div class="cg-deck-fuse">' +
        '<span class="cg-deck-streak">🤯 <span data-deck-streak>0</span></span>' +
        '<div class="cg-deck-bars">' + barsHtml + '</div>' +
        '<span class="cg-deck-count"><span data-deck-n>1</span>/' + N + '</span>' +
        '</div>' +
        '<div class="cg-deck-stack">' + cardsHtml + '</div>' +
        '<div class="cg-deck-actions">' +
        '<button class="cg-deck-b-knew" data-deck-knew>😎 Knew it</button>' +
        '<button class="cg-deck-b-blow" data-deck-blow>Blew my mind 🤯</button>' +
        '</div>';
      stackEl = wrap.querySelector('.cg-deck-stack');
      wrap.querySelector('[data-deck-knew]').addEventListener('click', function () { commit('knew'); });
      wrap.querySelector('[data-deck-blow]').addEventListener('click', function () { commit('blow'); });
      // Drag on every card (only the top card responds).
      var cards = stackEl.querySelectorAll('.cg-deck-card');
      for (var di = 0; di < cards.length; di++) attachDrag(cards[di]);
      // Ad-creative clicks: count as ad clicks; the provider's own markup
      // performs any navigation (same as the overlay's live path).
      stackEl.addEventListener('click', function (e) {
        var slot = e.target && e.target.closest ? e.target.closest('.cg-deck-adslot') : null;
        if (!slot) return;
        var card = e.target.closest('.cg-deck-card');
        var pos = card ? Number(card.getAttribute('data-deck-pos')) : idx;
        queueEvent({
          t: 'click', position: pos, kind: 'ad',
          item_ref: 'live', landing_url: '', placement: 'card',
        }, true);
      });
      setTop(startIdx, true);
    }

    function loadLiveAdInto(card) {
      if (card._cgLiveLoaded || !isLive) return;
      card._cgLiveLoaded = true;
      var slot = card.querySelector('.cg-deck-adslot');
      if (!slot) return;
      var i = Number(card.getAttribute('data-deck-pos'));
      var suffix = '-cgdk' + (++liveSlotN);
      var placementToken = 'p' + i;
      var head = applyMacros(payload.live_ad_head_script || '', subid, null, feedToken);
      var snippet = applyMacros(payload.live_ad_snippet, subid, placementToken, feedToken);
      ensureHeadScript(head, function () {
        injectSnippetIntoSlot(slot, rewriteSnippetIds(snippet, suffix));
      });
    }

    function setTop(newIdx, silent) {
      idx = newIdx;
      if (!stackEl) return;
      var cards = stackEl.querySelectorAll('.cg-deck-card');
      for (var c = 0; c < cards.length; c++) {
        var card = cards[c];
        var i = Number(card.getAttribute('data-deck-pos'));
        card.classList.remove('cg-deck-card--gone', 'cg-deck-card--hidden');
        card.style.opacity = '';
        if (i < idx) {
          card.classList.add('cg-deck-card--gone');
        } else if (i === idx) {
          card.style.transform = 'translate(0,0) rotate(0)';
          card.style.zIndex = 10;
          card.setAttribute('data-deck-top', '1');
        } else if (i === idx + 1 || i === idx + 2) {
          var off = i - idx;
          card.style.transform = 'translateY(' + (off * 10) + 'px) scale(' + (1 - off * 0.04) + ')';
          card.style.zIndex = 10 - off;
          card.removeAttribute('data-deck-top');
        } else {
          card.classList.add('cg-deck-card--hidden');
          card.removeAttribute('data-deck-top');
        }
        // Preload live ads as they enter the visible window (top + 2 under).
        if (i >= idx && i <= idx + 2 && card.getAttribute('data-kind') === 'ad') loadLiveAdInto(card);
        // Reset stamps.
        var stamps = card.querySelectorAll('.cg-deck-stamp');
        for (var sti = 0; sti < stamps.length; sti++) stamps[sti].style.display = 'none';
      }
      // Fuse bars + counter + streak.
      var bars = wrap.querySelectorAll('[data-deck-bar]');
      for (var bi = 0; bi < bars.length; bi++) {
        var bpos = Number(bars[bi].getAttribute('data-deck-bar'));
        bars[bi].classList.toggle('cg-deck-bar--done', bpos < idx);
      }
      var nEl = wrap.querySelector('[data-deck-n]');
      if (nEl) nEl.textContent = String(idx + 1);
      var stEl = wrap.querySelector('[data-deck-streak]');
      if (stEl) stEl.textContent = String(currentStreak());
      if (idx > maxIdx) maxIdx = idx;
      trackImpression(idx);
      trackSwipeDepth(idx);
      if (silent) return;
    }

    function attachDrag(el) {
      var sx = 0, sy = 0, dragging = false;
      var stampB = el.querySelector('.cg-deck-stamp--blow');
      var stampK = el.querySelector('.cg-deck-stamp--knew');
      el.addEventListener('pointerdown', function (e) {
        if (el.getAttribute('data-deck-top') !== '1') return;
        // Let provider ad content receive its own pointer interactions.
        if (e.target && e.target.closest && e.target.closest('.cg-deck-adslot')) return;
        dragging = true; sx = e.clientX; sy = e.clientY;
        el.style.transition = 'none';
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
      });
      el.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - sx, dy = e.clientY - sy;
        el.style.transform = 'translate(' + dx + 'px,' + (dy * 0.35) + 'px) rotate(' + (dx / 18) + 'deg)';
        if (stampB) stampB.style.display = dx > 40 ? 'block' : 'none';
        if (stampK) stampK.style.display = dx < -40 ? 'block' : 'none';
      });
      el.addEventListener('pointerup', function (e) {
        if (!dragging) return;
        dragging = false;
        var dx = e.clientX - sx;
        el.style.transition = 'transform .28s cubic-bezier(.2,.9,.3,1.2),opacity .2s';
        if (dx > 100) commit('blow');
        else if (dx < -100) commit('knew');
        else {
          el.style.transform = 'translate(0,0) rotate(0)';
          if (stampB) stampB.style.display = 'none';
          if (stampK) stampK.style.display = 'none';
        }
      });
      el.addEventListener('pointercancel', function () {
        if (!dragging) return;
        dragging = false;
        el.style.transition = 'transform .28s cubic-bezier(.2,.9,.3,1.2),opacity .2s';
        el.style.transform = 'translate(0,0) rotate(0)';
      });
    }

    function commit(dir) {
      if (completed) return;
      var it = items[idx];
      if (it.kind === 'fact') {
        swipes[idx] = dir;
        // swipe_knew / swipe_blow carry depth = position + 1 (the unique
        // {session_id, event, depth} index dedupes per position server-side).
        queueEvent({ t: 'event', event: dir === 'blow' ? 'swipe_blow' : 'swipe_knew', depth: idx + 1 });
      }
      var s = currentStreak() + (it.kind === 'fact' && dir === 'blow' ? 1 : 0);
      if (s > bestStreak) bestStreak = s;
      var top = stackEl ? stackEl.querySelector('[data-deck-top="1"]') : null;
      if (top) {
        top.style.transition = 'transform .2s ease-out,opacity .2s';
        top.style.transform = 'translate(' + (dir === 'blow' ? 600 : -600) + 'px,0) rotate(' + (dir === 'blow' ? 30 : -30) + 'deg)';
        top.style.opacity = '0';
      }
      var next = idx + 1;
      setTimeout(function () {
        if (next >= N) { showScore(); return; }
        setTop(next);
        pushHistoryForIdx(next);
      }, 200);
    }

    /* ── score card ── */
    function showScore() {
      completed = true;
      queueEvent({ t: 'event', event: 'deck_complete' }, true);
      var knews = 0, blows = 0;
      for (var k in swipes) {
        if (!Object.prototype.hasOwnProperty.call(swipes, k)) continue;
        if (swipes[k] === 'knew') knews++; else blows++;
      }
      var swiped = knews + blows;
      // Faked standing — hardcoded tiers, no real data by design.
      var rate = swiped > 0 ? knews / swiped : 0;
      var tier = rate < 0.34 ? 68 : rate < 0.67 ? 31 : 9;
      wrap.innerHTML =
        '<div class="cg-deck-score">' +
        '<p class="cg-deck-score-label">score card</p>' +
        '<h2>You knew ' + knews + '/' + factTotal + '</h2>' +
        '<p class="cg-deck-score-sub">Top ' + tier + '% of today’s swipers · best 🤯 streak: ' + bestStreak + '</p>' +
        '<button class="cg-deck-btn" data-deck-again style="margin-top:20px;background:#FF4D5E;color:#FBF8F1">Deal a fresh deck ↻</button>' +
        '</div>';
      var again = wrap.querySelector('[data-deck-again]');
      if (again) again.addEventListener('click', function () {
        trackExit();       // close out this deal's session before re-dealing
        flushEvents();
        deal(0);
      });
    }

    /* ── teardown ── */
    var torndown = false;
    function exit(fromPopState) {
      if (torndown) return;
      torndown = true;
      trackExit();
      flushEvents();
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
      if (isLive) { if (root.parentNode) root.parentNode.removeChild(root); }
      else { while (root.firstChild) root.removeChild(root.firstChild); }
      window.scrollTo(0, entryScroll);
      host.removeAttribute('data-cg-feed-open');
      if (!fromPopState && stackDepth > 0) {
        suppressNextPopstate = true;
        try { history.go(-stackDepth); } catch (e) {}
      }
    }
    closeBtn.addEventListener('click', function () { exit(false); });
    function onKey(e) { if (e.key === 'Escape') exit(false); }
    document.addEventListener('keydown', onKey);
    host.setAttribute('data-cg-feed-open', '1');

    // Deep entry deals immediately at the requested card (no start screen);
    // normal opens show the start screen first — session starts on deal.
    if (HAS_ENTRY_POS) deal(ENTRY_IDX);
    else renderStart();
  }

  /* ── loader ── */
  function loadOne(el) {
    if (el.getAttribute('data-cg-init') === '1') return;
    el.setAttribute('data-cg-init', '1');
    var feedId = el.getAttribute('data-cg-feed') || el.getAttribute('data-cg-facts');
    if (!feedId) return;
    var isPreview = el.getAttribute('data-cg-feed-preview') === '1';

    fetch(ORIGIN + '/api/feed?id=' + encodeURIComponent(feedId), { cache: 'no-store' })
      .then(function (r) { return (r.ok && r.status !== 204) ? r.json().catch(function () { return null; }) : null; })
      .then(function (p) {
        if (!p || !p.items || !p.items.length) return;

        // Fact decks: swipe-deck UI instead of the scroll overlay. Preview /
        // standalone pages open immediately; publisher embeds get a CTA chip
        // (decks have no scroll trigger — a takeover mid-article makes no
        // sense for a card game).
        if (p.feed_type === 'facts') {
          if (isPreview) { mountDeck(el, p); return; }
          var dshadow = el.shadowRoot || el.attachShadow({ mode: 'open' });
          var ds = document.createElement('style'); ds.textContent = CSS; dshadow.appendChild(ds);
          var dchip = document.createElement('button');
          dchip.className = 'cg-feed-cta';
          dchip.textContent = '🃏 ' + (typeof p.name === 'string' && p.name ? p.name : 'Play the deck');
          dchip.style.background = '#2430C8';
          dchip.style.color = '#fff';
          dchip.style.padding = '12px 20px';
          dchip.style.fontSize = '14px';
          dchip.style.position = 'fixed';
          dchip.style.bottom = '20px';
          dchip.style.top = 'auto';
          dchip.style.left = '50%';
          dchip.style.transform = 'translateX(-50%)';
          dchip.addEventListener('click', function () { mountDeck(el, p); });
          dshadow.appendChild(dchip);
          return;
        }

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
    var nodes = document.querySelectorAll('[data-cg-feed],[data-cg-facts]');
    for (var i = 0; i < nodes.length; i++) loadOne(nodes[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();

  window.CGFeed = { scan: scan };
})();
