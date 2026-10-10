/*!
 * AI LENS "MBTI로 읽기" 위젯 — 서울경제 본지(sedaily.com) 기사 페이지용 (신청서 모듈 G)
 *
 * 설치(본지 기사 템플릿, 본문 아래 원하는 자리):
 *   <div data-ailens-widget></div>
 *   <script src="https://ailens.sedaily.ai/widget/mbti-button.js" async></script>
 *
 * 동작: 현재 기사 주소(canonical)로 AI LENS에 같은 기사가 있는지 묻고, 있을 때만 버튼을 그린다.
 *       없으면 아무것도 그리지 않으므로 모든 기사 템플릿에 넣어도 된다.
 * 선택 속성(div에):
 *   data-article-url="https://www.sedaily.com/article/20099720"  기사 주소를 직접 지정(기본: canonical → og:url → 현재 주소)
 *   data-label="MBTI로 읽기"   버튼 제목
 *   data-target="_self"        같은 창에서 열기(기본: 새 창)
 * 쿠키·개인정보를 쓰지 않고, 본지 페이지의 다른 요소를 건드리지 않는다(Shadow DOM 안에만 그린다).
 */
(function () {
  'use strict';
  var ORIGIN = 'https://ailens.sedaily.ai';
  var VERSION = '1.0.0';
  if (window.__ailensWidgetLoaded) return;
  window.__ailensWidgetLoaded = VERSION;

  function articleUrl(el) {
    var direct = el.getAttribute('data-article-url');
    if (direct) return direct;
    var canon = document.querySelector('link[rel="canonical"]');
    if (canon && canon.href) return canon.href;
    var og = document.querySelector('meta[property="og:url"]');
    if (og && og.content) return og.content;
    return location.href;
  }

  // src/app/api/widget/sedailyArticle.ts와 같은 규칙.
  function parseArticle(url) {
    var m = /^https?:\/\/((?:[a-z0-9-]+\.)*)sedaily\.com\/article\/(\d{5,12})(?:[/?#]|$)/i.exec(String(url || '').trim());
    if (!m) return null;
    var sub = m[1].toLowerCase();
    if (sub === 'signal.') return { site: 'signal', id: m[2] };
    if (sub === '' || sub === 'www.' || sub === 'm.') return { site: 'www', id: m[2] };
    return null;
  }

  function withUtm(href, content) {
    var sep = href.indexOf('?') >= 0 ? '&' : '?';
    return href + sep + 'utm_source=sedaily&utm_medium=widget&utm_campaign=mbti_read&utm_content=' + encodeURIComponent(content);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var FORMAT_KEYS = ['letter', 'webtoon', 'podcast', 'video'];
  var CSS =
    ':host{display:block}*{box-sizing:border-box}' +
    '.w{box-sizing:border-box;margin:24px 0;padding:18px 20px;border:1px solid #dbe3f4;border-radius:14px;background:#f7f9ff;' +
    'font-family:inherit;color:#111827;line-height:1.5;-webkit-font-smoothing:antialiased}' +
    '.h{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}' +
    '.t{margin:0;font-size:18px;font-weight:800;letter-spacing:-.01em}' +
    '.b{font-size:12px;font-weight:800;color:#1d4ed8;letter-spacing:.06em;text-decoration:none}' +
    '.d{margin:4px 0 12px;font-size:14px;color:#4b5563;word-break:keep-all}' +
    '.c{display:flex;flex-wrap:wrap;gap:8px}' +
    '.f{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border-radius:999px;background:#fff;' +
    'border:1.5px solid var(--c);color:var(--c);font-size:14.5px;font-weight:700;text-decoration:none}' +
    '.f:hover,.f:focus-visible{background:var(--c);color:#fff;outline:none}' +
    '.f small{font-size:12px;font-weight:600;opacity:.8}' +
    '.k{display:inline-block;margin-top:12px;font-size:13px;color:#374151;text-decoration:underline;text-underline-offset:2px}' +
    '@media (max-width:480px){.f small{display:none}.f{flex:1 1 calc(50% - 8px);justify-content:center}}';

  function render(el, data) {
    var label = el.getAttribute('data-label') || 'MBTI로 읽기';
    var target = el.getAttribute('data-target') === '_self' ? '_self' : '_blank';
    var rel = target === '_blank' ? ' rel="noopener"' : '';
    var chips = '';
    for (var i = 0; i < data.formats.length; i++) {
      var f = data.formats[i];
      chips +=
        '<a class="f" style="--c:' + esc(f.color) + '" href="' + esc(withUtm(f.url, FORMAT_KEYS[i] || 'format')) + '" target="' + target + '"' + rel +
        ' aria-label="' + esc(f.label + ' 형식으로 보기 — ' + f.who) + '">' + esc(f.label) + ' <small>' + esc(f.who) + '</small></a>';
    }
    var html =
      '<style>' + CSS + '</style>' +
      '<section class="w" aria-label="' + esc(label + ' — AI LENS') + '">' +
      '<div class="h"><p class="t">' + esc(label) + '</p>' +
      '<a class="b" href="' + esc(withUtm(data.url, 'brand')) + '" target="' + target + '"' + rel + '>AI LENS</a></div>' +
      '<p class="d">같은 기사를 내 인지 스타일에 맞는 방식으로 — 읽고, 보고, 듣는 4가지 형식으로 만나 보세요.</p>' +
      '<div class="c">' + chips + '</div>' +
      '<a class="k" href="' + esc(withUtm(data.typeFinderUrl, 'type_finder')) + '" target="' + target + '"' + rel + '>내 유형 찾기 →</a>' +
      '</section>';
    var root = el.attachShadow ? el.shadowRoot || el.attachShadow({ mode: 'open' }) : el;
    root.innerHTML = html;
    el.setAttribute('data-ailens-state', 'ready');
  }

  function load(el) {
    if (el.getAttribute('data-ailens-state')) return;
    el.setAttribute('data-ailens-state', 'loading');
    var a = parseArticle(articleUrl(el));
    if (!a || !window.fetch) {
      el.setAttribute('data-ailens-state', 'skip');
      return;
    }
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 5000) : null;
    fetch(ORIGIN + '/api/widget/lookup/' + a.site + '/' + a.id, { mode: 'cors', credentials: 'omit', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (timer) clearTimeout(timer);
        if (data && data.found && data.formats && data.formats.length) render(el, data);
        else el.setAttribute('data-ailens-state', 'none');
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        el.setAttribute('data-ailens-state', 'error');
      });
  }

  function init() {
    var els = document.querySelectorAll('[data-ailens-widget]');
    for (var i = 0; i < els.length; i++) load(els[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
