/* CloudGrid Mock Ad Tester — Infinite Feed widget. Vanilla JS, no deps. */
(function () {
  'use strict';

  // ---------- helpers ----------
  function getOrigin() {
    try {
      var script = document.currentScript;
      if (!script) {
        var scripts = document.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i--) {
          if (scripts[i].src && scripts[i].src.indexOf('/feed-widget.js') !== -1) {
            script = scripts[i];
            break;
          }
        }
      }
      if (script && script.src) return new URL(script.src).origin;
    } catch (e) {}
    return '';
  }

  var ORIGIN = getOrigin();

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function send(url, data) {
    try {
      var payload = JSON.stringify(data);
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' });
        if (navigator.sendBeacon(url, blob)) return;
      }
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: payload,
        keepalive: true,
        mode: 'cors',
      }).catch(function () {});
    } catch (e) {}
  }

  // ---------- styles ----------
  var CSS = [
    ':host{all:initial;display:block;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,Helvetica,Arial,sans-serif;color:#fff;}',
    // Scope the reset so light-DOM mounts (live mode) don\'t wipe out the publisher page.
    '.cg-feed-overlay, .cg-feed-overlay *, .cg-feed-cta{box-sizing:border-box;margin:0;padding:0;}',
    '.cg-feed-cta{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483645;',
    'background:#111;color:#fff;padding:12px 20px;border-radius:9999px;font-size:14px;font-weight:600;',
    'box-shadow:0 10px 30px rgba(0,0,0,.25);cursor:pointer;border:0;}',
    '.cg-feed-overlay{position:fixed;inset:0;z-index:2147483647;background:#000;color:#fff;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,Helvetica,Arial,sans-serif;}',
    '.cg-feed-scroller{position:absolute;inset:0;overflow-y:scroll;overflow-x:hidden;',
    'scroll-snap-type:y mandatory;-webkit-overflow-scrolling:touch;}',
    '.cg-feed-card{position:relative;width:100vw;height:100vh;height:100dvh;',
    'scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;background:#000;}',
    // Only constrain card width on real desktop (≥1024px). Phones and tablets get the full viewport.
    '@media (min-width:1024px){.cg-feed-card{max-width:420px;margin:0 auto;}}',
    '.cg-feed-img{position:absolute;inset:0;background-size:cover;background-position:center;background-color:#222;',
    'transform:scale(1);transition:transform .4s ease;}',
    '.cg-feed-card.is-active .cg-feed-img{animation:cgKen 7s ease-out forwards;}',
    '@keyframes cgKen{from{transform:scale(1) translate(0,0);}to{transform:scale(1.08) translate(-1%,-1.5%);}}',
    '.cg-feed-grad{position:absolute;left:0;right:0;bottom:0;height:55%;',
    'background:linear-gradient(0deg,rgba(0,0,0,.85) 0%,rgba(0,0,0,.55) 35%,rgba(0,0,0,0) 100%);',
    'pointer-events:none;}',
    '.cg-feed-body{position:relative;padding:24px 20px calc(28px + env(safe-area-inset-bottom,0)) 20px;',
    'display:flex;flex-direction:column;gap:12px;color:#fff;}',
    '.cg-feed-card .cg-feed-body{opacity:0;transform:translateY(8px);transition:opacity .4s ease,transform .4s ease;}',
    '.cg-feed-card.is-active .cg-feed-body{opacity:1;transform:none;}',
    '.cg-feed-kind{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.75);',
    'display:inline-block;padding:3px 8px;border-radius:4px;background:rgba(255,255,255,.18);align-self:flex-start;}',
    '.cg-feed-title{font-size:22px;font-weight:700;line-height:1.25;color:#fff;',
    'text-shadow:0 1px 3px rgba(0,0,0,.5);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}',
    '.cg-feed-brand{font-size:14px;font-weight:600;color:#fff;opacity:.9;}',
    '.cg-feed-cta-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:4px;}',
    '.cg-feed-more{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;background:#fff;color:#111;',
    'border-radius:9999px;font-size:14px;font-weight:600;text-decoration:none;}',
    '.cg-feed-card--live{background:#fff;color:#111;}',
    '.cg-feed-live-slot{position:absolute;inset:0;overflow:hidden;-webkit-overflow-scrolling:touch;background:#fff;',
    'display:flex;flex-direction:column;align-items:stretch;}',
    // Force provider children to stretch and fill the entire card viewport.
    '.cg-feed-live-slot > *:not(script){width:100% !important;min-height:100% !important;flex:1 1 auto;display:flex !important;flex-direction:column;}',
    '.cg-feed-live-slot script{display:none !important;}',
    // Outbrain container chain — make every wrapper flex-stretch so the ad fills the card.
    '.cg-feed-live-slot .OUTBRAIN,' +
    '.cg-feed-live-slot .ob-smartfeed-wrapper,' +
    '.cg-feed-live-slot .ob_holder,' +
    '.cg-feed-live-slot .ob-widget,' +
    '.cg-feed-live-slot .ob-widget-section,' +
    '.cg-feed-live-slot .ob-widget-items-container,' +
    '.cg-feed-live-slot .ob-dynamic-rec-container,' +
    '.cg-feed-live-slot .ob-rec-link-img' +
    '{display:flex !important;flex-direction:column;flex:1 1 auto;width:100% !important;max-width:100% !important;min-height:0;box-sizing:border-box;}',
    // Make the ad image cover the full card area.
    '.cg-feed-live-slot .ob-rec-image,' +
    '.cg-feed-live-slot .ob-dynamic-rec-link img' +
    '{flex:1 1 auto;width:100% !important;height:100% !important;object-fit:cover !important;max-height:none !important;}',
    // Position ad text content at the bottom with a gradient overlay for legibility.
    '.cg-feed-live-slot .ob-rec-text{position:absolute !important;bottom:0;left:0;right:0;z-index:1;' +
    'padding:24px 20px calc(28px + env(safe-area-inset-bottom,0)) 20px !important;' +
    'background:linear-gradient(0deg,rgba(0,0,0,.85) 0%,rgba(0,0,0,.55) 35%,transparent 100%) !important;' +
    'color:#fff !important;display:flex !important;flex-direction:column;gap:6px;}',
    '.cg-feed-live-slot .ob-rec-text *{color:#fff !important;}',
    // Taboola container chain — same stretch treatment.
    '.cg-feed-live-slot .trc_rbox,' +
    '.cg-feed-live-slot .trc_rbox_div,' +
    '.cg-feed-live-slot .trc_elastic,' +
    '.cg-feed-live-slot .trc_spotlight_item' +
    '{display:flex !important;flex-direction:column;flex:1 1 auto;width:100% !important;max-width:100% !important;min-height:0;}',
    '.cg-feed-live-slot .trc_spotlight_item .thumbnail img' +
    '{flex:1 1 auto;width:100% !important;height:100% !important;object-fit:cover !important;max-height:none !important;}',
    // Hide any provider branding/chrome that breaks the full-bleed look on mobile.
    '@media (max-width:768px){' +
    '.cg-feed-live-slot .ob-widget-header,' +
    '.cg-feed-live-slot .ob-widget-footer,' +
    '.cg-feed-live-slot .ob-p,' +
    '.cg-feed-live-slot .tbl-feed-header' +
    '{display:none !important;}' +
    '.cg-feed-live-slot .ob-dynamic-rec-container{position:relative;}' +
    '}',
    '.cg-feed-kind--live{position:absolute;left:14px;top:calc(14px + env(safe-area-inset-top,0));z-index:2;background:rgba(0,0,0,.7);color:#fff;}',
    '.cg-feed-close{position:fixed;top:calc(14px + env(safe-area-inset-top,0));right:14px;z-index:2147483647;',
    'width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;border:0;font-size:22px;line-height:1;',
    'cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}',
    '.cg-feed-close:hover{background:rgba(0,0,0,.75);}',
  ].join('');

  // ---------- card HTML ----------
  function articleCardHtml(it, index) {
    return (
      '<div class="cg-feed-card" data-position="' + index + '" data-kind="article">' +
      '<div class="cg-feed-img" style="background-image:url(\'' + escapeHtml(it.image) + '\')"></div>' +
      '<div class="cg-feed-grad"></div>' +
      '<div class="cg-feed-body">' +
      '<div class="cg-feed-title">' + escapeHtml(it.title) + '</div>' +
      (it.description
        ? '<div style="font-size:14px;color:rgba(255,255,255,.85);text-shadow:0 1px 2px rgba(0,0,0,.5);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' +
          escapeHtml(it.description) +
          '</div>'
        : '') +
      '<div class="cg-feed-cta-row">' +
      '<a class="cg-feed-more" href="' + escapeHtml(it.url) + '" data-cg-more="1">Read more →</a>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function adCardHtml(it, index) {
    return (
      '<div class="cg-feed-card" data-position="' + index + '" data-kind="ad">' +
      '<div class="cg-feed-img" style="background-image:url(\'' + escapeHtml(it.ad_image) + '\')"></div>' +
      '<div class="cg-feed-grad"></div>' +
      '<div class="cg-feed-body">' +
      '<span class="cg-feed-kind">Sponsored</span>' +
      '<div class="cg-feed-title">' + escapeHtml(it.ad_title) + '</div>' +
      '<div class="cg-feed-brand">' + escapeHtml(it.ad_brand) + '</div>' +
      '<div class="cg-feed-cta-row">' +
      '<a class="cg-feed-more" href="' + escapeHtml(it.ad_landing_page) + '" data-cg-more="1">Learn more →</a>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  // Live mode: render the operator-pasted snippet inside an ad-slot card.
  function liveAdCardHtml(index) {
    return (
      '<div class="cg-feed-card cg-feed-card--live" data-position="' + index + '" data-kind="ad" data-live="1">' +
      '<div class="cg-feed-live-slot"></div>' +
      '<span class="cg-feed-kind cg-feed-kind--live">Sponsored</span>' +
      '</div>'
    );
  }

  // Parse a snippet into three pieces:
  //   - containerHtml: any non-script HTML (the provider's slot div, if any)
  //   - externalScripts: <script src="..."> — loaded ONCE globally
  //   - inlineScripts:   <script>...code...</script> — re-run in each ad slot, AFTER
  //                      external scripts have finished loading (so init calls find
  //                      the loader's globals already defined)
  function parseLiveSnippet(snippet) {
    var tmp = document.createElement('div');
    tmp.innerHTML = snippet;
    var scriptEls = tmp.querySelectorAll('script');
    var externalScripts = [];
    var inlineScripts = [];
    for (var i = 0; i < scriptEls.length; i++) {
      var s = scriptEls[i];
      var attrs = {};
      for (var j = 0; j < s.attributes.length; j++) attrs[s.attributes[j].name] = s.attributes[j].value;
      var src = s.getAttribute('src');
      if (src) externalScripts.push({ src: src, attrs: attrs });
      else if (s.text) inlineScripts.push({ text: s.text, attrs: attrs });
      s.parentNode.removeChild(s);
    }
    return {
      containerHtml: tmp.innerHTML,
      externalScripts: externalScripts,
      inlineScripts: inlineScripts,
    };
  }

  // Load external scripts into <head> once each, keyed by URL. Returns a promise
  // that resolves after every external in the snippet has finished loading.
  //
  // We use addEventListener (NOT el.onload = ...) so that any inline `onload="…"`
  // attribute the operator wrote on their <script> tag — common for widgets like
  // the ATL one which fires its init in the onload — is preserved alongside our
  // promise-resolution listener.
  var _cgExternalPromises = {};
  function ensureExternal(s) {
    if (_cgExternalPromises[s.src]) return _cgExternalPromises[s.src];
    var p = new Promise(function (resolve) {
      var el = document.createElement('script');
      for (var k in s.attrs) {
        if (Object.prototype.hasOwnProperty.call(s.attrs, k) && k !== 'async' && k !== 'defer') {
          el.setAttribute(k, s.attrs[k]);
        }
      }
      el.src = s.src;
      el.async = false; // preserve execution order across externals
      el.addEventListener('load', function () { resolve(); });
      el.addEventListener('error', function () { resolve(); }); // resolve on error so the chain doesn\'t hang
      document.head.appendChild(el);
    });
    _cgExternalPromises[s.src] = p;
    return p;
  }

  function ensureAllExternals(scripts) {
    if (!scripts || scripts.length === 0) return Promise.resolve();
    return Promise.all(scripts.map(ensureExternal));
  }

  // Re-execute an inline <script>...code...</script> inside a given slot. Appending
  // a freshly-created <script> element to the DOM triggers execution; the script's
  // `document.currentScript.parentNode` is the slot, so widgets that target their
  // surrounding container land in the right place.
  function runInlineInSlot(slot, inlineScripts) {
    for (var i = 0; i < inlineScripts.length; i++) {
      var s = inlineScripts[i];
      var el = document.createElement('script');
      for (var k in s.attrs) {
        if (Object.prototype.hasOwnProperty.call(s.attrs, k)) el.setAttribute(k, s.attrs[k]);
      }
      el.text = s.text;
      slot.appendChild(el);
    }
  }

  // Best-effort: some providers expose a global rescan API once loaded.
  function pokeProviderRescan() {
    try {
      if (window.OBR && window.OBR.extern && typeof window.OBR.extern.researchWidget === 'function') {
        window.OBR.extern.researchWidget();
      }
    } catch (e) {}
    try {
      if (window._taboola && typeof window._taboola.push === 'function') {
        window._taboola.push({ flush: true });
      }
    } catch (e) {}
  }

  // ---------- overlay ----------
  function mountOverlay(host, payload) {
    var isLiveMode = payload.ad_mode === 'live' && typeof payload.live_ad_snippet === 'string' && payload.live_ad_snippet.length > 0;

    // In live mode we cannot use Shadow DOM because provider scripts (Outbrain,
    // Taboola, etc.) scan `document.querySelectorAll` to find their containers
    // and can't see into a Shadow root. Mount the overlay directly under
    // document.body and inject styles inline.
    var root;        // where new children get appended
    var styleHost;   // where the <style> tag lives
    if (isLiveMode) {
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
    close.textContent = '✕';
    overlay.appendChild(close);

    var scroller = document.createElement('div');
    scroller.className = 'cg-feed-scroller';

    var itemCount = payload.items.length;
    var loopsRendered = 0;
    // ----- Live-ad lazy loader -----
    // In live mode, ad cards stay empty until they're about to enter the viewport.
    // Then we inject the operator's full snippet into that one slot with all IDs
    // rewritten to be unique. Each slot fires its own external-script execution
    // and its own init call, so each scroll-into delivers a fresh, independent ad.
    var liveSlotCounter = 0;

    function rewriteSnippetIds(snippet, suffix) {
      var tmp = document.createElement('div');
      tmp.innerHTML = snippet;
      var idMap = {};
      var withIds = tmp.querySelectorAll('[id]');
      for (var i = 0; i < withIds.length; i++) {
        var oldId = withIds[i].getAttribute('id');
        if (!oldId || idMap[oldId]) continue;
        idMap[oldId] = oldId + suffix;
        withIds[i].setAttribute('id', idMap[oldId]);
      }
      var html = tmp.innerHTML;
      // Substitute the same IDs anywhere they're referenced in scripts (quoted).
      for (var oldId2 in idMap) {
        if (Object.prototype.hasOwnProperty.call(idMap, oldId2)) {
          var newId = idMap[oldId2];
          html = html.split("'" + oldId2 + "'").join("'" + newId + "'");
          html = html.split('"' + oldId2 + '"').join('"' + newId + '"');
        }
      }
      return html;
    }

    function injectSnippetIntoSlot(slot, snippet) {
      slot.innerHTML = snippet;
      // Re-create <script> tags so the browser actually executes them.
      var scripts = slot.querySelectorAll('script');
      for (var i = 0; i < scripts.length; i++) {
        var oldEl = scripts[i];
        var newEl = document.createElement('script');
        for (var j = 0; j < oldEl.attributes.length; j++) {
          var attr = oldEl.attributes[j];
          newEl.setAttribute(attr.name, attr.value);
        }
        if (oldEl.text) newEl.text = oldEl.text;
        oldEl.parentNode.replaceChild(newEl, oldEl);
      }
    }

    function loadLiveAdInto(card) {
      if (!isLiveMode || card._cgLiveLoaded) return;
      card._cgLiveLoaded = true;
      var slot = card.querySelector('.cg-feed-live-slot');
      if (!slot) return;
      var suffix = '-cg' + (++liveSlotCounter);
      injectSnippetIntoSlot(slot, rewriteSnippetIds(payload.live_ad_snippet, suffix));
    }

    // Fire ~one card before scroll-into so the ad has a moment to render. Root
    // must be the scroller (not the viewport) — the overlay's cards live inside
    // a custom scroller; with root: null the observer wouldn't reliably fire on
    // inner-scroller scroll events.
    var liveLoadObserver = isLiveMode
      ? new IntersectionObserver(
          function (entries) {
            for (var i = 0; i < entries.length; i++) {
              if (entries[i].isIntersecting) {
                loadLiveAdInto(entries[i].target);
                liveLoadObserver.unobserve(entries[i].target);
              }
            }
          },
          { root: scroller, rootMargin: '150% 0px', threshold: 0 },
        )
      : null;

    function renderLoop() {
      var startAbs = loopsRendered * itemCount;
      var html = '';
      for (var i = 0; i < itemCount; i++) {
        var it = payload.items[i];
        var absIdx = startAbs + i;
        if (it.kind === 'ad') {
          html += isLiveMode ? liveAdCardHtml(absIdx) : adCardHtml(it, absIdx);
        } else {
          html += articleCardHtml(it, absIdx);
        }
      }
      var tmp = document.createElement('div');
      tmp.innerHTML = html;
      var newCards = [];
      while (tmp.firstChild) {
        var node = tmp.firstChild;
        newCards.push(node);
        scroller.appendChild(node);
      }
      // Live mode: leave ad slots empty and let the IntersectionObserver inject
      // each one lazily as the user scrolls toward it. One scroll-in = one ad.
      if (isLiveMode && liveLoadObserver) {
        for (var k = 0; k < newCards.length; k++) {
          var card = newCards[k];
          if (card.getAttribute && card.getAttribute('data-live') === '1') {
            liveLoadObserver.observe(card);
          }
        }
      }
      loopsRendered++;
      return newCards;
    }

    overlay.appendChild(scroller);
    root.appendChild(overlay);

    // ----- state -----
    var entryScroll = window.scrollY || document.documentElement.scrollTop || 0;
    var startedAt = Date.now();
    var maxPosition = 0;
    var prevOverflow = document.body.style.overflow;
    var prevTouch = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    var impressionsFired = new Set();
    var visibleSince = {};
    var IMPRESSION_DWELL_MS = 500;

    function trackImpression(absIdx) {
      var realIdx = ((absIdx % itemCount) + itemCount) % itemCount;
      if (impressionsFired.has(realIdx)) return;
      impressionsFired.add(realIdx);
      var it = payload.items[realIdx];
      send(ORIGIN + '/api/feed/track-impression', {
        feed_id: payload.feed_id,
        position: realIdx,
        kind: it.kind,
        item_ref: it.kind === 'ad' ? it.ad_id : it.url,
        page: location.href,
        timestamp: new Date().toISOString(),
      });
    }

    function setActive(absIdx) {
      var cards = scroller.querySelectorAll('.cg-feed-card');
      for (var c = 0; c < cards.length; c++) {
        var node = cards[c];
        var pos = Number(node.getAttribute('data-position'));
        if (pos === absIdx) node.classList.add('is-active');
        else node.classList.remove('is-active');
      }
      if (absIdx > maxPosition) maxPosition = absIdx;
      // preload next 3 images (wrap)
      var realIdx = ((absIdx % itemCount) + itemCount) % itemCount;
      for (var k = 1; k <= 3; k++) {
        var nxt = payload.items[(realIdx + k) % itemCount];
        if (nxt) {
          var url = nxt.kind === 'ad' ? nxt.ad_image : nxt.image;
          if (url) new Image().src = url;
        }
      }
      // Keep enough cards rendered ahead so the loop feels infinite
      var totalRendered = loopsRendered * itemCount;
      if (absIdx >= totalRendered - Math.max(2, Math.min(itemCount, 4))) {
        var added = renderLoop();
        for (var a = 0; a < added.length; a++) io.observe(added[a]);
      }
    }

    // IntersectionObserver tracks visibility for active-state + impression dwell
    var io = new IntersectionObserver(
      function (entries) {
        var now = Date.now();
        entries.forEach(function (e) {
          var pos = Number(e.target.getAttribute('data-position'));
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            if (!visibleSince[pos]) visibleSince[pos] = now;
            setActive(pos);
            setTimeout(function () {
              // re-check still visible before firing
              if (visibleSince[pos] && now - visibleSince[pos] >= 0) {
                trackImpression(pos);
              }
            }, IMPRESSION_DWELL_MS);
          } else {
            visibleSince[pos] = 0;
          }
        });
      },
      { root: scroller, threshold: [0.6] },
    );

    // Render a couple of loops up front so scroll-snap has somewhere to go
    renderLoop();
    renderLoop();
    scroller.querySelectorAll('.cg-feed-card').forEach(function (c) {
      io.observe(c);
    });

    // First card impression + active state
    setActive(0);
    trackImpression(0);

    // Click handler on cards (anywhere) and on the CTA — both navigate
    scroller.addEventListener('click', function (e) {
      var card = e.target.closest('.cg-feed-card');
      if (!card) return;
      var absPos = Number(card.getAttribute('data-position'));
      var realPos = ((absPos % itemCount) + itemCount) % itemCount;
      var it = payload.items[realPos];
      var landing = it.kind === 'ad' ? it.ad_landing_page : it.url;
      if (!landing) return;
      e.preventDefault();
      send(ORIGIN + '/api/feed/track-click', {
        feed_id: payload.feed_id,
        position: realPos,
        kind: it.kind,
        item_ref: it.kind === 'ad' ? it.ad_id : it.url,
        landing_url: landing,
        page: location.href,
        timestamp: new Date().toISOString(),
      });
      window.location.href = landing;
    });

    function exit() {
      var exitPos = ((maxPosition % itemCount) + itemCount) % itemCount;
      send(ORIGIN + '/api/feed/track-exit', {
        feed_id: payload.feed_id,
        exit_position: exitPos,
        items_viewed: maxPosition + 1,
        time_in_feed_ms: Date.now() - startedAt,
        page: location.href,
        timestamp: new Date().toISOString(),
      });
      io.disconnect();
      if (liveLoadObserver) liveLoadObserver.disconnect();
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
      // remove overlay + restore page scroll
      if (isLiveMode) {
        if (root.parentNode) root.parentNode.removeChild(root);
      } else {
        while (root.firstChild) root.removeChild(root.firstChild);
      }
      window.scrollTo(0, entryScroll);
      host.removeAttribute('data-cg-feed-open');
    }

    close.addEventListener('click', exit);

    // Esc to close on desktop
    function onKey(e) {
      if (e.key === 'Escape') exit();
    }
    document.addEventListener('keydown', onKey, { once: false });
    host._cgCleanupKey = function () {
      document.removeEventListener('keydown', onKey);
    };

    host.setAttribute('data-cg-feed-open', '1');
  }

  // ---------- loader ----------
  function loadOne(el) {
    if (el.getAttribute('data-cg-init') === '1') return;
    el.setAttribute('data-cg-init', '1');
    var feedId = el.getAttribute('data-cg-feed');
    if (!feedId) return;
    // Preview mode: open the overlay immediately, ignore trigger config.
    var previewMode = el.getAttribute('data-cg-feed-preview') === '1';

    fetch(ORIGIN + '/api/feed?id=' + encodeURIComponent(feedId), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok || res.status === 204) return null;
        return res.json().catch(function () {
          return null;
        });
      })
      .then(function (payload) {
        if (!payload || !payload.items || payload.items.length === 0) return;

        if (previewMode) {
          mountOverlay(el, payload);
          return;
        }

        var mode = payload.trigger && payload.trigger.mode === 'manual' ? 'manual' : 'scroll';
        var depth =
          payload.trigger && typeof payload.trigger.scroll_depth_px === 'number'
            ? payload.trigger.scroll_depth_px
            : 1500;

        if (mode === 'manual') {
          // Render a CTA chip near the bottom; tap to open the feed.
          var shadow = el.shadowRoot || el.attachShadow({ mode: 'open' });
          var style = document.createElement('style');
          style.textContent = CSS;
          shadow.appendChild(style);
          var chip = document.createElement('button');
          chip.className = 'cg-feed-cta';
          chip.textContent = '📰 See more stories';
          chip.addEventListener('click', function () {
            mountOverlay(el, payload);
          });
          shadow.appendChild(chip);
          return;
        }

        // scroll-trigger
        var fired = false;
        function check() {
          if (fired) return;
          var y = window.scrollY || document.documentElement.scrollTop || 0;
          if (y >= depth) {
            fired = true;
            window.removeEventListener('scroll', check);
            mountOverlay(el, payload);
          }
        }
        window.addEventListener('scroll', check, { passive: true });
        check();
      })
      .catch(function () {
        /* fail silently */
      });
  }

  function scan() {
    var nodes = document.querySelectorAll('[data-cg-feed]');
    for (var i = 0; i < nodes.length; i++) loadOne(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  window.CGFeed = { scan: scan };
})();
