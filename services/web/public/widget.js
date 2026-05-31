/* CloudGrid Mock Ad Tester widget — vanilla JS, no deps */
(function () {
  'use strict';

  // Derive backend origin from this script's own src so the widget works
  // both in dev (http://localhost:3000) and prod (cloudgrid hostname).
  function getOrigin() {
    try {
      var script = document.currentScript;
      if (!script) {
        var scripts = document.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i--) {
          if (scripts[i].src && scripts[i].src.indexOf('/widget.js') !== -1) {
            script = scripts[i];
            break;
          }
        }
      }
      if (script && script.src) {
        var u = new URL(script.src);
        return u.origin;
      }
    } catch (e) {}
    return '';
  }

  var ORIGIN = getOrigin();
  var SUPPORTS_SHADOW = typeof Element !== 'undefined' && !!Element.prototype.attachShadow;

  // CSS rendered inside Shadow DOM (Shadow path) or scoped under .cg-ad-card
  // (fallback path). Uses :host for the Shadow root.
  var SHADOW_CSS = [
    ':host{all:initial;display:block;width:100%;max-width:300px;margin:0;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,Helvetica,Arial,sans-serif;',
    'line-height:1.3;color:#111;text-align:left;contain:content;}',
    '*{box-sizing:border-box;margin:0;padding:0;}',
    '.cg-ad-card{display:flex;flex-direction:column;width:100%;background:#fff;',
    'border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);overflow:hidden;',
    'cursor:pointer;color:#111;text-decoration:none;',
    'transition:transform .15s ease, box-shadow .15s ease;}',
    '.cg-ad-card:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.14);}',
    '.cg-ad-img{width:100%;aspect-ratio:16/9;background-size:cover;background-position:center;background-color:#e5e7eb;}',
    '.cg-ad-body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:10px;}',
    '.cg-ad-title{font-size:14px;font-weight:600;line-height:1.35;color:#111;',
    'text-decoration:none;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
    '.cg-ad-meta{display:flex;justify-content:space-between;align-items:center;gap:8px;}',
    '.cg-ad-brand{font-size:12px;color:#666;text-decoration:none;font-weight:400;}',
    '.cg-ad-sponsored{font-size:10px;padding:3px 7px;background:#f3f4f6;color:#6b7280;',
    'border-radius:4px;text-transform:uppercase;letter-spacing:.05em;font-weight:500;line-height:1;}',
    '@media (max-width:340px){:host{max-width:100%;}}',
  ].join('');

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(s) {
    return escapeHtml(s);
  }

  // Send as text/plain so the request is CORS-simple (no preflight).
  // Server is content-type tolerant and parses the body as JSON either way.
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

  function trackImpression(ad) {
    send(ORIGIN + '/api/track-impression', {
      ad_id: ad.ad_id,
      campaign: ad.campaign,
      page: location.href,
      timestamp: new Date().toISOString(),
    });
  }

  function trackClickAndGo(ad) {
    send(ORIGIN + '/api/track-click', {
      ad_id: ad.ad_id,
      campaign: ad.campaign,
      landing_page: ad.landing_page,
      page: location.href,
      timestamp: new Date().toISOString(),
    });
  }

  function buildCardHtml(ad) {
    return (
      '<a class="cg-ad-card" href="' +
      escapeAttr(ad.landing_page) +
      '" rel="noopener nofollow sponsored">' +
      '<div class="cg-ad-img" style="background-image:url(\'' +
      escapeAttr(ad.image_url) +
      '\')"></div>' +
      '<div class="cg-ad-body">' +
      '<div class="cg-ad-title">' +
      escapeHtml(ad.title) +
      '</div>' +
      '<div class="cg-ad-meta">' +
      '<span class="cg-ad-brand">' +
      escapeHtml(ad.brand) +
      '</span>' +
      '<span class="cg-ad-sponsored">Sponsored</span>' +
      '</div>' +
      '</div>' +
      '</a>'
    );
  }

  function attachImpressionObserver(target, ad) {
    var fired = false;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(
        function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting && entries[i].intersectionRatio >= 0.5) {
              if (!fired) {
                fired = true;
                trackImpression(ad);
                io.disconnect();
              }
            }
          }
        },
        { threshold: [0.5] },
      );
      io.observe(target);
    } else if (!fired) {
      fired = true;
      trackImpression(ad);
    }
  }

  function renderShadow(el, ad) {
    var shadow = el.attachShadow({ mode: 'open' });
    var html =
      '<style>' + SHADOW_CSS + '</style>' + buildCardHtml(ad);
    shadow.innerHTML = html;
    var anchor = shadow.querySelector('.cg-ad-card');
    if (anchor) {
      anchor.addEventListener('click', function () {
        trackClickAndGo(ad);
      });
    }
    // Observe the shadow host — it has the same bounding box as its content.
    attachImpressionObserver(el, ad);
  }

  // Fallback for ancient browsers without Shadow DOM. Prefixes all selectors
  // and bumps specificity with !important to resist the most common publisher
  // overrides.
  var FALLBACK_CSS_ID = 'cg-ad-style';
  var FALLBACK_CSS = SHADOW_CSS
    .replace(/:host/g, '.cg-ad-host')
    // raise specificity slightly for fallback path
    .replace(/\.cg-ad-card/g, '.cg-ad-host .cg-ad-card')
    .replace(/\.cg-ad-img/g, '.cg-ad-host .cg-ad-img')
    .replace(/\.cg-ad-body/g, '.cg-ad-host .cg-ad-body')
    .replace(/\.cg-ad-title/g, '.cg-ad-host .cg-ad-title')
    .replace(/\.cg-ad-meta/g, '.cg-ad-host .cg-ad-meta')
    .replace(/\.cg-ad-brand/g, '.cg-ad-host .cg-ad-brand')
    .replace(/\.cg-ad-sponsored/g, '.cg-ad-host .cg-ad-sponsored');

  function injectFallbackCss() {
    if (document.getElementById(FALLBACK_CSS_ID)) return;
    var s = document.createElement('style');
    s.id = FALLBACK_CSS_ID;
    s.textContent = FALLBACK_CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function renderInline(el, ad) {
    injectFallbackCss();
    el.classList.add('cg-ad-host');
    el.innerHTML = buildCardHtml(ad);
    var anchor = el.firstChild;
    if (anchor) {
      anchor.addEventListener('click', function () {
        trackClickAndGo(ad);
      });
    }
    attachImpressionObserver(el, ad);
  }

  function render(el, ad) {
    if (SUPPORTS_SHADOW) {
      try {
        return renderShadow(el, ad);
      } catch (e) {
        // Some hosts (e.g. <div> with existing children) can fail to attach a
        // shadow root — fall back to inline rendering.
        return renderInline(el, ad);
      }
    }
    return renderInline(el, ad);
  }

  function loadOne(el) {
    if (el.getAttribute('data-cg-init') === '1') return;
    el.setAttribute('data-cg-init', '1');
    var adId = el.getAttribute('data-cg-ad');
    if (!adId) return;

    var url = ORIGIN + '/api/mock-ad?id=' + encodeURIComponent(adId);
    fetch(url, { method: 'GET', cache: 'no-store' })
      .then(function (res) {
        if (!res.ok || res.status === 204) return null;
        return res.json().catch(function () {
          return null;
        });
      })
      .then(function (ad) {
        if (!ad || !ad.ad_id) return;
        render(el, ad);
      })
      .catch(function () {
        // Fail silently
      });
  }

  function scan() {
    var nodes = document.querySelectorAll('[data-cg-ad]');
    for (var i = 0; i < nodes.length; i++) loadOne(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  // Expose a small API for dynamically-injected widgets
  window.CGAds = { scan: scan };
})();
