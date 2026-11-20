/* AI LENS 인터랙티브 초안 - app.js
   본문은 index.html 에 이미 들어 있습니다. 이 파일은 움직임과 탐색만 더합니다.
   (JS가 꺼져도 글, 이미지, 출처는 모두 읽힙니다.) */
(function () {
  'use strict';
  var doc = document.documentElement;
  doc.classList.remove('no-js');
  doc.classList.add('js');

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- 상단 바: 진행률, 장 번호 ---------- */
  var bar = $('#bar'), top = $('.topbar'), cur = $('#cur'), hero = $('.hero img');
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var h = doc.scrollHeight - window.innerHeight;
      var p = h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
      if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
      if (top) top.classList.toggle('solid', window.scrollY > window.innerHeight * 0.5);
      if (hero && !reduce && window.scrollY < window.innerHeight) {
        hero.style.transform = 'scale(' + (1.04 + window.scrollY / window.innerHeight * 0.08).toFixed(3) + ')';
      }
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var chapters = $$('.chapter');
  var tocLinks = $$('#toc a');
  function setChapter(n) {
    if (cur) cur.textContent = ('0' + n).slice(-2);
    tocLinks.forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-ch') === String(n)); });
  }
  if ('IntersectionObserver' in window) {
    var chObs = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) setChapter(e.target.getAttribute('data-ch')); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    chapters.forEach(function (c) { chObs.observe(c); });

    /* ---------- 등장 효과 (움직임 줄이기 설정이면 건너뜀) ---------- */
    if (!reduce) {
      doc.classList.add('reveal-on');
      var rObs = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('in'); rObs.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
      $$('[data-r]').forEach(function (el) { rObs.observe(el); });
      /* 안전장치: 3초 뒤에도 안 보이는 요소가 없도록 */
      window.setTimeout(function () {
        $$('[data-r]:not(.in)').forEach(function (el) {
          var r = el.getBoundingClientRect();
          if (r.top < window.innerHeight) el.classList.add('in');
        });
      }, 3000);
    } else {
      $$('.live').forEach(function (l) { l.classList.add('in'); });
    }
  } else {
    $$('.live').forEach(function (l) { l.classList.add('in'); });
  }

  /* ---------- 목차 ---------- */
  var btn = $('#menu'), toc = $('#toc');
  function closeToc(focusBtn) {
    if (!toc || toc.hidden) return;
    toc.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (focusBtn) btn.focus();
  }
  if (btn && toc) {
    btn.addEventListener('click', function () {
      var open = toc.hidden;
      toc.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) { var a = $('a', toc); if (a) a.focus(); }
    });
    toc.addEventListener('click', function (e) { if (e.target.closest('a')) closeToc(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeToc(true); });
    document.addEventListener('click', function (e) {
      if (!toc.hidden && !toc.contains(e.target) && e.target !== btn) closeToc(false);
    });
  }

  /* ---------- 3장: 두 방식 비교 탭 ---------- */
  $$('.tabset').forEach(function (set) {
    var tabs = $$('[role="tab"]', set), panels = $$('[role="tabpanel"]', set);
    function select(i, focus) {
      tabs.forEach(function (t, k) {
        var on = k === i;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panels[k].hidden = !on;
      });
      if (focus) tabs[i].focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i, false); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); select((i + 1) % tabs.length, true); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); select((i + tabs.length - 1) % tabs.length, true); }
      });
    });
    select(0, false);
  });

  /* ---------- 4장: 다수결 체험 (가상 문항, 원리만 보여 줌) ---------- */
  var demo = $('#demo');
  if (demo) {
    var TRUTH = 2;
    var NAMES = ['①', '②', '③', '④'];
    var picks = [0, 0, 0, 0, 0];
    var run = $('#demo-run'), fill = $('#demo-fill'), reset = $('#demo-reset'), out = $('#demo-out');
    var optBtns = $$('.opt', demo);
    function paint() {
      optBtns.forEach(function (b) {
        var v = +b.getAttribute('data-v'), who = +b.getAttribute('data-who');
        b.setAttribute('aria-pressed', String(picks[who] === v));
      });
      run.disabled = picks.some(function (p) { return p === 0; });
    }
    optBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        picks[+b.getAttribute('data-who')] = +b.getAttribute('data-v');
        out.innerHTML = '';
        paint();
      });
    });
    fill.addEventListener('click', function () { picks = [3, 3, 3, 2, 4]; out.innerHTML = ''; paint(); });
    reset.addEventListener('click', function () { picks = [0, 0, 0, 0, 0]; out.innerHTML = ''; paint(); });
    run.addEventListener('click', function () {
      var c = [0, 0, 0, 0, 0];
      picks.forEach(function (p) { c[p]++; });
      var max = Math.max(c[1], c[2], c[3], c[4]);
      var winners = [];
      for (var i = 1; i <= 4; i++) if (c[i] === max) winners.push(i);
      var html = '<div class="bars">';
      for (var k = 1; k <= 4; k++) {
        html += '<div class="bar' + (winners.indexOf(k) > -1 ? ' win' : '') + '"><span>' + NAMES[k - 1] +
          '</span><i><u style="width:0" data-w="' + (c[k] / 5 * 100) + '%"></u></i><span>' + c[k] + '</span></div>';
      }
      html += '</div>';
      var msg;
      if (winners.length > 1) {
        msg = '동점입니다. 이 경우에는 누구의 답을 따를지부터 정해야 합니다. 실제 정답은 ' + NAMES[TRUTH - 1] + '였습니다.';
      } else if (winners[0] !== TRUTH) {
        msg = '다수가 고른 ' + NAMES[winners[0] - 1] + '이 \'정답\'으로 돌아갑니다. 그러나 실제 정답은 ' + NAMES[TRUTH - 1] + '였습니다.';
      } else {
        msg = '이번에는 다수가 고른 ' + NAMES[winners[0] - 1] + '이 실제 정답과 같았습니다. 그래도 다수결이 늘 맞는 것은 아닙니다. 선수 다섯 명이 모두 틀리면 모두 틀린 답이 돌아갑니다.';
      }
      out.innerHTML = html + '<p class="verdict">' + msg + '</p>';
      window.requestAnimationFrame(function () {
        $$('u[data-w]', out).forEach(function (u) { u.style.width = u.getAttribute('data-w'); });
      });
    });
    paint();
  }
})();
