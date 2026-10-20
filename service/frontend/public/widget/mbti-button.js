/*!
 * AI LENS "MBTI로 읽기" 위젯 — 서울경제 본지(sedaily.com) 기사 페이지용 (신청서 모듈 G)
 *
 * 설치(본지 기사 템플릿, 본문 아래 원하는 자리):
 *   <div data-ailens-widget></div>
 *   <script src="https://ailens.sedaily.ai/widget/mbti-button.js" async></script>
 *
 * 동작: 현재 기사 주소(canonical)로 AI LENS에 같은 기사가 있는지 묻고, 있을 때만 버튼을 그린다.
 *       없으면 아무것도 그리지 않으므로 모든 기사 템플릿에 넣어도 된다(data-fallback 을 주면 대신 '오늘의 지면' 링크를 그린다).
 * 선택 속성(div에):
 *   data-article-url="https://www.sedaily.com/article/20099720"  기사 주소를 직접 지정(기본: canonical → og:url → 현재 주소)
 *   data-label="MBTI로 읽기"   버튼 제목
 *   data-target="_self"        같은 창에서 열기(기본: 새 창). iframe 안에서는 "_top"(부모 창)을 쓴다
 *   data-utm-source="sedaily"  UTM utm_source 값(기본: sedaily). sedaily.ai 에 붙일 때는 "sedaily.ai"
 *   data-fallback="latest"     기사가 없거나 AI LENS 에 없을 때 최신 AI LENS 기사로 같은 위젯(4가지 형식)을 그린다
 *                  ="today"    ...대신 '오늘의 지면' 링크 하나만 그린다
 *   data-compact               바깥 여백·테두리를 없애고 sedaily.ai 톤으로 그린다(iframe 용)
 *   data-desc="..."            설명 문장을 바꾼다
 *   data-roll                  제목을 'MBTI로 읽기' ↔ 'AI LENS' 로 마우스를 올리면 굴러 바뀌는 링크로 그린다(우측 상단 AI LENS 표시는 없앤다)
 *   data-preview               형식 버튼 위에 기사 미리보기(썸네일·날짜·제목)를 보인다
 *   data-illust                형식 이름 옆에 AI LENS 역할 일러스트를 보인다
 *   data-footer="letter"       하단 링크를 '내 유형 찾기' 대신 '레터 보러가기'로 바꾼다
 *
 * iframe 으로 붙일 때는 /widget/frame.html?url={기사주소}&src=sedaily.ai 를 쓴다(아래 frame.html 참고).
 * 쿠키·개인정보를 쓰지 않고, 본지 페이지의 다른 요소를 건드리지 않는다(Shadow DOM 안에만 그린다).
 */
(function () {
  'use strict';
  var VERSION = '1.7.0';
  // 스크립트를 불러온 주소의 origin 을 따른다 — 로컬·스테이징에서도 같은 origin 의 API 를 부르게 한다.
  var ORIGIN = 'https://ailens.sedaily.ai';
  try {
    var self = document.currentScript && document.currentScript.src;
    if (self) ORIGIN = new URL(self).origin;
  } catch (e) {}
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

  function withUtm(href, content, source) {
    var sep = href.indexOf('?') >= 0 ? '&' : '?';
    return href + sep + 'utm_source=' + encodeURIComponent(source || 'sedaily') + '&utm_medium=widget&utm_campaign=mbti_read&utm_content=' + encodeURIComponent(content);
  }

  function targetOf(el) {
    var t = el.getAttribute('data-target');
    return t === '_self' || t === '_top' ? t : '_blank';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var FORMAT_KEYS = ['letter', 'webtoon', 'podcast', 'video'];
  // AI LENS 의 역할 일러스트(src/shared/constants/lensPerspectives.ts 의 illustration 과 같은 파일). data-illust 일 때만 쓴다.
  var ILLUSTRATIONS = ['role-1-newcomer', 'role-2-worker', 'role-3-owner', 'role-4-investor'];
  var CSS =
    ':host{display:block}*{box-sizing:border-box}' +
    '.w{box-sizing:border-box;margin:24px 0;padding:18px 20px;border:1px solid #dbe3f4;border-radius:14px;background:#f7f9ff;' +
    'font-family:inherit;color:#111827;line-height:1.5;-webkit-font-smoothing:antialiased}' +
    // data-compact(iframe 삽입): sedaily.ai 톤 — Pretendard, 테두리·그림자·칩 없이 흰 면 위의 글자만. 포인트는 파랑(#006CFF) 하나.
    '.w.x{margin:0;padding:24px;border:0;border-radius:16px;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.08);' +
    'font-family:Pretendard,"Pretendard Variable","Noto Sans KR",-apple-system,BlinkMacSystemFont,sans-serif;color:#1c1c1c}' +
    '.x .r{display:block;height:28px;overflow:hidden;color:inherit;text-decoration:none}' +
    '.x .rw{display:block;transition:transform .4s cubic-bezier(.22,.8,.3,1)}' +
    '.x .rw>span{display:block;height:28px;line-height:28px}.x .rw>.n{color:#006cff;letter-spacing:.02em}' +
    '.x .r:hover .rw,.x .r:focus-visible .rw{transform:translateY(-28px)}.x .r:focus-visible{outline:none}' +
    '@media (prefers-reduced-motion:reduce){.x .rw{transition:none}}' +
    '.x .h{flex-wrap:nowrap}.x .t{font-size:20px;font-weight:700;letter-spacing:-.02em}' +
    '.x .b{font-size:12px;font-weight:600;color:#999;letter-spacing:.04em}' +
    '.x .d{margin:6px 0 18px;font-size:14px;color:#666}' +
    '.x .a{display:flex;align-items:center;gap:14px;margin:0 0 14px;color:inherit;text-decoration:none}' +
    '.x .th{flex:none;width:104px;height:70px;border-radius:10px;object-fit:cover;background:#f6f7f9}' +
    '.x .at{display:block;min-width:0}.x .at small{display:block;font-size:12px;font-weight:600;color:#999;margin-bottom:4px}' +
    '.x .at b{display:-webkit-box;font-size:16px;font-weight:700;line-height:1.4;letter-spacing:-.02em;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
    '.x .a:hover b{color:#006cff}' +
    '.x .c{display:grid;grid-template-columns:repeat(4,1fr);gap:0 12px}' +
    '.x .f{position:relative;display:flex;align-items:center;gap:10px;min-height:0;padding:12px 0;border:0;border-radius:0;background:none;color:#1c1c1c;font-size:16px;font-weight:700;line-height:1.35}' +
    '.x .i{flex:none;width:52px;height:52px;border-radius:12px;object-fit:cover;mix-blend-mode:multiply}.x .tx{display:block;min-width:0}' +
    '.x .f small{display:block;margin-top:3px;font-size:11.5px;letter-spacing:-.03em;font-weight:400;color:#666;opacity:1}' +
    '.x .f:hover,.x .f:focus-visible{background:none;color:var(--c);outline:none}.x .f:hover::after{color:var(--c)}' +
    '.x .k{margin-top:8px;font-size:13px;font-weight:600;color:#006cff;text-decoration:none}.x .k:hover{text-decoration:underline}' +
    '@media (max-width:720px){.x .c{grid-template-columns:repeat(2,1fr)}.w.x{padding:20px}}' +
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
    var target = targetOf(el);
    var src = el.getAttribute('data-utm-source');
    var rel = target === '_blank' ? ' rel="noopener"' : '';
    var chips = '';
    for (var i = 0; i < data.formats.length; i++) {
      var f = data.formats[i];
      var illust = el.hasAttribute('data-illust') && ILLUSTRATIONS[i]
        ? '<img class="i" src="' + ORIGIN + '/lens/' + ILLUSTRATIONS[i] + '.png" alt="" width="56" height="56" loading="lazy">'
        : '';
      chips +=
        '<a class="f" style="--c:' + esc(f.color) + '" href="' + esc(withUtm(f.url, FORMAT_KEYS[i] || 'format', src)) + '" target="' + target + '"' + rel +
        ' aria-label="' + esc(f.label + ' 형식으로 보기 — ' + f.who) + '">' + illust +
        (illust ? '<span class="tx">' + esc(f.label) + '<small>' + esc(f.who) + '</small></span>' : esc(f.label) + ' <small>' + esc(f.who) + '</small>') + '</a>';
    }
    // 기사 미리보기(data-preview): 썸네일·날짜·제목 — AI LENS 가 이 기사를 어떻게 보여 주는지 맛보게 한다. 누르면 해당 기사로 간다.
    var preview = '';
    if (el.hasAttribute('data-preview') && data.headline) {
      var d = /^(\d{4})-(\d{2})-(\d{2})/.exec(data.date || '');
      var meta = (data.latest ? '오늘의 AI LENS' : 'AI LENS에서 보기') + (d ? ' · ' + d[1] + '.' + d[2] + '.' + d[3] : '');
      preview =
        '<a class="a" href="' + esc(withUtm(data.url, 'preview', src)) + '" target="' + target + '"' + rel + '>' +
        (data.image ? '<img class="th" src="' + esc(data.image) + '" alt="" width="104" height="70" loading="lazy">' : '') +
        '<span class="at"><small>' + esc(meta) + '</small><b>' + esc(data.headline) + '</b></span></a>';
    }
    var html =
      '<style>' + CSS + '</style>' +
      '<section class="w' + (el.hasAttribute('data-compact') ? ' x' : '') + '" aria-label="' + esc(label + ' — AI LENS') + '">' +
      (el.hasAttribute('data-roll')
        // 제목 롤링: 기본은 라벨, 마우스를 올리면 위로 굴러 'AI LENS'로 바뀌고, 누르면 AI LENS 메인으로 간다.
        ? '<div class="h"><a class="t r" href="' + esc(withUtm(ORIGIN + '/', 'brand', src)) + '" target="' + target + '"' + rel + ' aria-label="' + esc(label + ' — AI LENS 메인으로 이동') + '">' +
          '<span class="rw"><span>' + esc(label) + '</span><span class="n">AI LENS</span></span></a></div>'
        : '<div class="h"><p class="t">' + esc(label) + '</p>' +
          '<a class="b" href="' + esc(withUtm(data.url, 'brand', src)) + '" target="' + target + '"' + rel + '>AI LENS</a></div>') +
      '<p class="d">' + esc(el.getAttribute('data-desc') || '같은 기사를 내 인지 스타일에 맞는 방식으로 — 읽고, 보고, 듣는 4가지 형식으로 만나 보세요.') + '</p>' +
      preview +
      '<div class="c">' + chips + '</div>' +
      (el.getAttribute('data-footer') === 'letter'
        ? '<a class="k" href="' + esc(withUtm(ORIGIN + '/letter', 'letter', src)) + '" target="' + target + '"' + rel + '>레터 보러가기 →</a>'
        : '<a class="k" href="' + esc(withUtm(data.typeFinderUrl, 'type_finder', src)) + '" target="' + target + '"' + rel + '>내 유형 찾기 →</a>') +
      '</section>';
    var root = el.attachShadow ? el.shadowRoot || el.attachShadow({ mode: 'open' }) : el;
    root.innerHTML = html;
    el.setAttribute('data-ailens-state', 'ready');
  }

  // 기사가 없거나 AI LENS 에 아직 없을 때 — 새 기능이 아니라 '오늘의 지면' 링크 하나만 보여 준다.
  function renderFallback(el) {
    var label = '오늘의 ' + (el.getAttribute('data-label') || 'MBTI로 읽기');
    var target = targetOf(el);
    var rel = target === '_blank' ? ' rel="noopener"' : '';
    var href = withUtm(ORIGIN + '/paper', 'today', el.getAttribute('data-utm-source'));
    var html =
      '<style>' + CSS + '</style>' +
      '<section class="w' + (el.hasAttribute('data-compact') ? ' x' : '') + '" aria-label="' + esc(label + ' — AI LENS') + '">' +
      '<div class="h"><p class="t">' + esc(label) + '</p><span class="b">AI LENS</span></div>' +
      '<p class="d">오늘의 서울경제 기사를 내 인지 스타일에 맞는 방식으로 — 읽고, 보고, 듣는 4가지 형식으로 만나 보세요.</p>' +
      '<div class="c"><a class="f" style="--c:#1d4ed8" href="' + esc(href) + '" target="' + target + '"' + rel + '>오늘의 지면 보기 →</a></div>' +
      '</section>';
    var root = el.attachShadow ? el.shadowRoot || el.attachShadow({ mode: 'open' }) : el;
    root.innerHTML = html;
    el.setAttribute('data-ailens-state', 'fallback');
  }

  function miss(el, state, noLatest) {
    var mode = el.getAttribute('data-fallback');
    if (mode === 'latest' && !noLatest) {
      fetchJson(ORIGIN + '/api/widget/latest').then(function (data) {
        if (data && data.found && data.formats && data.formats.length) {
          data.latest = true;
          render(el, data);
          el.setAttribute('data-ailens-state', 'latest');
        } else miss(el, state, true);
      });
    } else if (mode === 'latest' || mode === 'today') renderFallback(el);
    else el.setAttribute('data-ailens-state', state);
  }

  function fetchJson(url) {
    if (!window.fetch) return Promise.resolve(null);
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 5000) : null;
    return fetch(url, { mode: 'cors', credentials: 'omit', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (timer) clearTimeout(timer); return r.ok ? r.json() : null; })
      .catch(function () { if (timer) clearTimeout(timer); return null; });
  }

  function load(el) {
    if (el.getAttribute('data-ailens-state')) return;
    el.setAttribute('data-ailens-state', 'loading');
    var a = parseArticle(articleUrl(el));
    if (!a || !window.fetch) {
      miss(el, 'skip');
      return;
    }
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 5000) : null;
    fetch(ORIGIN + '/api/widget/lookup/' + a.site + '/' + a.id, { mode: 'cors', credentials: 'omit', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (timer) clearTimeout(timer);
        if (data && data.found && data.formats && data.formats.length) render(el, data);
        else miss(el, 'none');
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        miss(el, 'error');
      });
  }

  function init() {
    var els = document.querySelectorAll('[data-ailens-widget]');
    for (var i = 0; i < els.length; i++) load(els[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
