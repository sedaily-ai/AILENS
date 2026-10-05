# MBTI 코너("MBTI로 보는 오늘의 뉴스") 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/mbti` 코너를 추가 비용 0원으로 만든다.
- 진입: 16유형 고르기 또는 간단 성향 체크
- 결과: `/mbti/{nt,nf,st,sf}` 결과 카드와 공유
- 이어서: 그룹 형식 탭으로 바로 열리는 오늘의 이슈 4건

**Architecture:**
- 순수 로직은 `features/mbti/lib/mbtiCorner.ts` 한 파일에 모으고 노드 테스트로 고정한다.
- 화면은 `features/mbti/components`에 둔다. 라우트(`app/(content)/mbti`)가 widget `StaticPageShell`로 감싼다.
  FSD상 feature는 widget을 import할 수 없어서 헤더 조립은 app 레이어가 맡는다.
- 데이터는 기존 공개 API `fetchLensPosts`를 쓴다. 기사 이동은 기존 `?v=N` 딥링크를 쓴다.
  백엔드·기사 화면은 고치지 않는다.

**Tech Stack:**
- Next.js 16.2.2(App Router), React 19.2.4, TypeScript 5
- 기존 관례대로 인라인 스타일과 `lensPerspectives` 토큰
- 순수 함수 테스트: `node:assert` + `node --experimental-strip-types`
- 화면 확인: 헤드리스 Chrome(`playwright-core`). 스크래치 폴더 전용이고 저장소에는 넣지 않는다.

**Spec:** `docs/worklog/2026-10/2026-10-05-mbti-corner-design.md`

> **구현 후 정정 (2026-10-05)**: 최종 리뷰를 반영한 수정 커밋 `423e9e8`로 아래 부분은 이 계획의 코드와 다르다.
> 다시 구현하거나 참고할 때는 이 계획의 코드가 아니라 `feat/mbti-corner` 브랜치의 코드를 기준으로 한다.
> - `pickTodayIssues` 정렬: 같은 날짜 안에서 `display_order` 오름차순(없으면 뒤) → API 순서. 홈 '오늘의 이슈'와 같은 규칙이다.
>   `IssueSource`에 `display_order`가 추가됐고, Task 1 테스트는 18개다.
> - `MbtiShare`: GA `platform` 값은 aria-label 문구가 아니라 고정 코드(`kakao`·`instagram`·`facebook`·`x`·`linkedin`·`copy`·`other`)다.
> - `MbtiNotice` 글자색: `#64748b`.
> - `sitemap.ts`의 `/games` `lastModified`: `2026-10-05`.
> - 실행 중 판정: 서버 켜고 끄기는 PID 파일 방식을 쓴다(`kill %1` 대신).
>   Task 2 저장소 차단 테스트는 코너 전용 키만 막는다. 사이트 공용 부품이 저장소를 방어 없이 읽어서 전체 차단 시 페이지가 깨지는데, 이 기능 범위 밖이다.
>   macOS에서는 `/mbti/NT` 404를 대소문자 구분 디스크에서 확인한다.

## Global Constraints

- **비용 0**: Bedrock 호출, AWS 리소스 생성, 백엔드 변경, 새 npm 의존성을 모두 금지한다.
- **경로 기준**: 이 문서의 경로는 `service/frontend/` 기준이다. 명령도 `service/frontend/`에서 실행한다.
- **FSD 규칙**:
  - `features/mbti`는 widgets와 다른 feature를 import하지 않는다.
  - shared는 읽기 전용으로만 쓴다.
  - 외부에는 `features/mbti/index.ts`로만 노출한다.
- **문구**:
  - 코너 이름은 "MBTI로 보는 오늘의 뉴스", 체크 이름은 "간단 성향 체크"다. "검사"라는 말은 쓰지 않는다.
  - 상표 안내 문구는 원문 그대로 쓴다: "MBTI는 The Myers-Briggs Company의 상표입니다. 이 코너는 공식 MBTI 검사가 아니며, 고른 유형에 맞춰 뉴스 보는 방식을 추천합니다."
- **그룹 → 형식**: NT→레터(인덱스 0, `?v=1`), NF→웹툰(1, `?v=2`), SF→팟캐스트(2, `?v=3`), ST→영상(3, `?v=4`).
- **저장 키**: `mbti-corner-type`. 값은 `"INTJ"`처럼 4글자 유형이거나, 체크로 찾은 경우 `"NT"`처럼 그룹이다.
- **색**: 형식 기준 `lensPerspectiveAt(i).color` / `.tint`를 쓴다.
  `shared/data/brandAccents.ts` 주석의 옛 페르소나 이름(민철·NT 등)은 이번 매핑과 무관하니 무시한다.
- **제목 표시**: 화면에 보이는 기사 제목은 `displayHeadline()`으로 부서 접두어를 뗀다. 공유 텍스트와 메타데이터는 원문 그대로 둔다.
- **페이지 title**: 루트 템플릿 `"%s | AI LENS"`가 자동으로 붙으므로 "| AI LENS"를 직접 쓰지 않는다.
- **커밋**: `feat/mbti-corner` 브랜치에 한다. 푸시와 PR은 사용자 확인 후에 한다.
- **배포**: Task 6의 "배포 전 조율"을 통과해야만 한다.
  2026-10-05 08:27 KST에 운영 웹이 GitHub에 없는 코드로 배포됐다(Clarity 태그가 운영에만 있다).

## Review Focus

사람이 실제로 부딪힐 가능성이 높은 순서다. 각 줄을 잡는 테스트는 해당 Task에 넣었다.

1. **아침 7시 전(오늘 발행분 없음)**: 전날 이슈가 "최신 지면 · M월 D일" 표시와 함께 나와야 한다. 빈 화면이나 "오늘 지면" 오표시는 안 된다.
   → Task 1 단위 테스트 + Task 3 화면 테스트(API 응답을 어제 날짜로 바꿔 끼움)
2. **브라우저 저장소 차단(사파리 사생활 보호 등)**: 고르기·체크·결과가 오류 없이 동작하고 "지난번" 바로가기만 숨겨진다.
   → Task 2 화면 테스트
3. **이슈 API 실패나 빈 응답**: 로딩 문구에 멈추지 않고 "지금은 이슈를 불러오지 못했어요." + `/lens` 링크가 보인다.
   → Task 3 화면 테스트
4. **위조되거나 그룹과 안 맞는 `?t`**(`/mbti/nt?t=esfp`, `?t=<script>`): 4글자 유형 없이 그룹만 보인다.
   → Task 1 단위 테스트 + Task 3 화면 테스트
5. **그룹 형식이 없는 기사**: 기사 화면이 `?v`를 무시하고 레터 탭을 연다. 오류는 나지 않는다.
   → Task 3 화면 테스트(`?v=9`)

## 파일 지도

| 파일 | 역할 | Task |
|---|---|---|
| `src/features/mbti/lib/mbtiCorner.ts` | 순수 로직(매핑·체크 채점·이슈 고르기·링크·저장값 해석). 런타임 import 없음 | 1 |
| `scripts/test-mbti.mjs` | 순수 로직 테스트 | 1 |
| `package.json` | `test:mbti` 스크립트 | 1 |
| `src/features/mbti/lib/mbtiStorage.ts` | localStorage 읽기·쓰기(차단 환경 안전) | 2 |
| `src/features/mbti/components/TypePicker.tsx` | 16칸 유형 고르기 | 2 |
| `src/features/mbti/components/QuickCheck.tsx` | 간단 성향 체크 | 2 |
| `src/features/mbti/components/MbtiNotice.tsx` | 상표 안내 | 2 |
| `src/features/mbti/components/MbtiLanding.tsx` | `/mbti` 화면 조립 | 2 |
| `src/features/mbti/index.ts` | 공개 API | 2·3 |
| `src/app/(content)/mbti/page.tsx` | `/mbti` 라우트 | 2 |
| `src/features/mbti/components/ResultCard.tsx` | 결과 카드 | 3 |
| `src/features/mbti/components/TodayIssues.tsx` | 오늘의 이슈 4건 | 3 |
| `src/features/mbti/components/GroupSwitcher.tsx` | 다른 유형 링크 | 3 |
| `src/features/mbti/components/MbtiResult.tsx` | 결과 화면 조립 | 3·4 |
| `src/app/(content)/mbti/[group]/page.tsx` | 결과 라우트(정적 4개, 그 외 404) | 3·4 |
| `src/features/mbti/components/MbtiShare.tsx` | 공유 버튼 + `mbti_share` 계측 | 4 |
| `scripts/mbti-og/template.html`, `public/mbti/og-{nt,nf,st,sf}.png` | 공유 미리보기 이미지 | 4 |
| `src/widgets/SiteFooter/SiteFooter.tsx` | 푸터 링크 1줄 | 5 |
| `src/app/(content)/games/GamesClient.tsx` | 게임 페이지 카드 1개 | 5 |
| `src/features/onboarding/components/ResultStep.tsx` | `/start` 결과 링크 1개 | 5 |
| `src/app/sitemap.ts` | 사이트맵 5줄 | 5 |

## 공통: 로컬 운영 빌드와 화면 테스트 준비

Task 2~6의 화면 테스트가 쓰는 준비 절차다.

**한 번만 준비**: 스크래치 폴더에 `playwright-core`를 둔다. 저장소에는 넣지 않는다.

```bash
export SMOKE_DIR="${TMPDIR:-/tmp}/mbti-smoke"   # 세션 스크래치 폴더가 있으면 그걸 쓴다
mkdir -p "$SMOKE_DIR" && cd "$SMOKE_DIR" && [ -d node_modules/playwright-core ] || (npm init -y >/dev/null && npm i playwright-core@1 --no-audit --no-fund)
```

**로컬 운영 빌드 띄우기**: Dockerfile과 같은 절차다. 끝나면 `kill %1`로 서버를 끈다.

```bash
cd service/frontend
npm run build
rm -rf .next/standalone/public .next/standalone/.next/static
cp -R public .next/standalone/public && cp -R .next/static .next/standalone/.next/static
PORT=3100 HOSTNAME=127.0.0.1 node .next/standalone/server.js &
sleep 3 && curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/mbti
```

**화면 테스트 공통 머리말**: 각 테스트 파일의 맨 위에 그대로 넣는다.
분석 스크립트는 막아서 GA·Clarity에 테스트 데이터가 쌓이지 않게 한다.

```js
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3100';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
await context.route(/google-analytics\.com|googletagmanager\.com|clarity\.ms/, (r) => r.abort());
const errors = [];
const newPage = async () => { const p = await context.newPage(); p.on('pageerror', (e) => errors.push(String(e))); return p; };
```

실행:

```bash
cd "$SMOKE_DIR" && BASE=http://127.0.0.1:3100 node taskN-smoke.mjs
```

---

### Task 1: 순수 로직 + 노드 테스트

**Files:**
- Create: `src/features/mbti/lib/mbtiCorner.ts`
- Create: `scripts/test-mbti.mjs`
- Modify: `package.json` (`scripts`에 한 줄)

**Interfaces:**
- Consumes: `MbtiGroupId` 타입(`@/shared/data/mbtiGroups`, `'NT' | 'NF' | 'ST' | 'SF'`). `import type`만 쓰므로 노드 실행 시 지워진다.
- Produces: 아래 이름과 시그니처를 Task 2~5가 그대로 쓴다.
  - **유형·그룹**
    - `MBTI_TYPES: readonly MbtiType[]`(16개, 그룹 순 NT·NF·ST·SF), `type MbtiType`
    - `MBTI_GROUP_ORDER: readonly MbtiGroupId[] = ['NT','NF','ST','SF']`
    - `parseMbtiType(raw: string | null | undefined): MbtiType | null`
    - `groupOfType(type: MbtiType): MbtiGroupId`
    - `typesOfGroup(group: MbtiGroupId): MbtiType[]`
    - `parseGroupSlug(raw: string | null | undefined): MbtiGroupId | null`
    - `groupSlug(group: MbtiGroupId): string`
  - **문구·링크**
    - `interface MbtiGroupInfo { group; title; summary; formatIndex }`, `MBTI_GROUP_INFO: Record<MbtiGroupId, MbtiGroupInfo>`
    - `FORMAT_CTA: readonly string[]`(인덱스 0~3)
    - `viewParamOf(group): number`
    - `issueHref(path: string, group): string`
    - `resultPath(group, type?: MbtiType | null): string`
    - `displayTypeFor(group, raw: string | null | undefined): MbtiType | null`
  - **간단 성향 체크**
    - `type QuickCheckId = 'sn1'|'sn2'|'sn3'|'tf1'|'tf2'|'tf3'`, `type QuickCheckChoice = 'a'|'b'`
    - `type QuickCheckAnswers = Partial<Record<QuickCheckId, QuickCheckChoice>>`
    - `interface QuickCheckQuestion { id; axis: 'SN'|'TF'; tiebreak: boolean; prompt; a; b }`, `QUICK_CHECK: readonly QuickCheckQuestion[]`
    - `nextQuickCheckQuestion(answers): QuickCheckQuestion | null`
    - `scoreQuickCheck(answers): MbtiGroupId | null`
  - **오늘의 이슈**
    - `interface IssueSource { id: string; date: string; paper_section?: string | null }`
    - `interface TodayIssuesPick<T> { issues: T[]; latestDate: string | null; isToday: boolean }`
    - `pickTodayIssues<T extends IssueSource>(posts: readonly T[], todayKst: string, count = 4): TodayIssuesPick<T>`
    - `issuesDateLabel(pick: { latestDate: string | null; isToday: boolean }): string`
    - `sectionLabel(section: string | null | undefined): string`
  - **저장값**
    - `interface SavedMbti { type: MbtiType | null; group: MbtiGroupId }`
    - `parseSavedMbti(raw: string | null | undefined): SavedMbti | null`
    - `savedShortcutLabel(saved: SavedMbti): string`

- [ ] **Step 0: 의존성 설치(최초 1회)**

`service/frontend/node_modules`가 없으면 설치한다. 기존 lock 그대로이고 새 의존성은 없다.

Run: `cd service/frontend && [ -d node_modules ] || npm ci`
Expected: 오류 없이 끝남

- [ ] **Step 1: 실패하는 테스트 작성** — `scripts/test-mbti.mjs`

```js
// MBTI 코너 순수 로직 시험 — `npm run test:mbti` (node --experimental-strip-types)
// 설계: docs/worklog/2026-10/2026-10-05-mbti-corner-design.md
import assert from 'node:assert/strict';
import {
  MBTI_TYPES, MBTI_GROUP_ORDER, MBTI_GROUP_INFO, FORMAT_CTA, QUICK_CHECK,
  parseMbtiType, groupOfType, typesOfGroup, parseGroupSlug, groupSlug,
  viewParamOf, issueHref, resultPath, displayTypeFor,
  nextQuickCheckQuestion, scoreQuickCheck,
  pickTodayIssues, issuesDateLabel, sectionLabel,
  parseSavedMbti, savedShortcutLabel,
} from '../src/features/mbti/lib/mbtiCorner.ts';

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log('ok -', name); };

t('16유형 → 4그룹(가운데 두 글자)', () => {
  assert.equal(MBTI_TYPES.length, 16);
  assert.deepEqual(typesOfGroup('NT'), ['INTJ', 'INTP', 'ENTJ', 'ENTP']);
  assert.deepEqual(typesOfGroup('NF'), ['INFJ', 'INFP', 'ENFJ', 'ENFP']);
  assert.deepEqual(typesOfGroup('ST'), ['ISTJ', 'ISTP', 'ESTJ', 'ESTP']);
  assert.deepEqual(typesOfGroup('SF'), ['ISFJ', 'ISFP', 'ESFJ', 'ESFP']);
  for (const type of MBTI_TYPES) assert.equal(groupOfType(type), type[1] + type[2]);
});

t('유형 문자열 해석: 대소문자·공백 허용, 그 밖은 null', () => {
  assert.equal(parseMbtiType('intj'), 'INTJ');
  assert.equal(parseMbtiType(' Enfp '), 'ENFP');
  for (const bad of ['XXXX', 'NT', '', '<script>', null, undefined]) assert.equal(parseMbtiType(bad), null);
});

t('그룹 슬러그 왕복', () => {
  for (const g of MBTI_GROUP_ORDER) assert.equal(parseGroupSlug(groupSlug(g)), g);
  assert.equal(parseGroupSlug('xx'), null);
  assert.equal(parseGroupSlug(undefined), null);
});

t('그룹 → 형식 인덱스·?v 번호·버튼 문구', () => {
  assert.deepEqual(MBTI_GROUP_ORDER.map((g) => [g, MBTI_GROUP_INFO[g].formatIndex, viewParamOf(g)]), [
    ['NT', 0, 1], ['NF', 1, 2], ['ST', 3, 4], ['SF', 2, 3],
  ]);
  assert.deepEqual(FORMAT_CTA, ['레터로 읽기', '웹툰으로 보기', '팟캐스트로 듣기', '영상으로 보기']);
});

t('기사 링크에 ?v 붙이기(기존 쿼리 보존)', () => {
  assert.equal(issueHref('/markets/2026/10/04/a', 'NF'), '/markets/2026/10/04/a?v=2');
  assert.equal(issueHref('/x?ref=mbti', 'ST'), '/x?ref=mbti&v=4');
});

t('결과 경로', () => {
  assert.equal(resultPath('NT', 'INTJ'), '/mbti/nt?t=intj');
  assert.equal(resultPath('SF'), '/mbti/sf');
  assert.equal(resultPath('SF', null), '/mbti/sf');
});

t('?t 표시: 16유형이면서 그 그룹일 때만(위조 대비)', () => {
  assert.equal(displayTypeFor('NT', 'intj'), 'INTJ');
  assert.equal(displayTypeFor('NT', 'esfp'), null);
  assert.equal(displayTypeFor('NT', '<script>'), null);
  assert.equal(displayTypeFor('NT', null), null);
});

// 간단 성향 체크 — 6개 답의 64가지 조합을 실제 흐름(다음 질문 → 답)대로 돌린다.
const LETTER = { sn: ['S', 'N'], tf: ['T', 'F'] };
t('간단 성향 체크: 모든 조합에서 축별 다수결, 앞 두 답이 같으면 4문항', () => {
  const order = ['sn1', 'sn2', 'sn3', 'tf1', 'tf2', 'tf3'];
  for (let mask = 0; mask < 64; mask++) {
    const scripted = Object.fromEntries(order.map((id, i) => [id, (mask >> i) & 1 ? 'b' : 'a']));
    const answers = {};
    const asked = [];
    for (let guard = 0; guard < 10; guard++) {
      const q = nextQuickCheckQuestion(answers);
      if (!q) break;
      assert.equal(scoreQuickCheck(answers), null, '끝나기 전엔 결과가 없다');
      asked.push(q.id);
      answers[q.id] = scripted[q.id];
    }
    const axis = (k) => {
      const [a1, a2, a3] = [scripted[`${k}1`], scripted[`${k}2`], scripted[`${k}3`]];
      return LETTER[k][(a1 === a2 ? a1 : a3) === 'a' ? 0 : 1];
    };
    assert.equal(scoreQuickCheck(answers), axis('sn') + axis('tf'), `mask ${mask}`);
    const splits = (scripted.sn1 !== scripted.sn2 ? 1 : 0) + (scripted.tf1 !== scripted.tf2 ? 1 : 0);
    assert.equal(asked.length, 4 + splits, `mask ${mask} 질문 수`);
  }
});

t('간단 성향 체크: 보충 질문은 앞 두 답이 갈렸을 때만', () => {
  assert.equal(nextQuickCheckQuestion({ sn1: 'a', sn2: 'a' }).id, 'tf1');
  assert.equal(nextQuickCheckQuestion({ sn1: 'a', sn2: 'b' }).id, 'sn3');
  assert.equal(QUICK_CHECK.filter((q) => q.tiebreak).length, 2);
});

const post = (id, date, section = null) => ({ id, date, paper_section: section });

t('오늘의 이슈: 지면 순서대로 1건씩, 오늘이면 isToday', () => {
  const posts = [post('g1', '2026-10-05'), post('s', '2026-10-05', '시그널'), post('m', '2026-10-05', '증권'), post('f', '2026-10-05', '전체'), post('i', '2026-10-05', '산업')];
  const r = pickTodayIssues(posts, '2026-10-05');
  assert.deepEqual(r.issues.map((p) => p.id), ['f', 'm', 'i', 's']);
  assert.equal(r.latestDate, '2026-10-05');
  assert.equal(r.isToday, true);
  assert.equal(issuesDateLabel(r), '오늘 지면');
});

t('오늘의 이슈: 빈 지면은 같은 날 남은 글로 채우고 중복 없음', () => {
  const posts = [post('f', '2026-10-05', '전체'), post('f', '2026-10-05', '전체'), post('g1', '2026-10-05'), post('g2', '2026-10-05'), post('m', '2026-10-05', '증권')];
  assert.deepEqual(pickTodayIssues(posts, '2026-10-05').issues.map((p) => p.id), ['f', 'm', 'g1', 'g2']);
});

t('오늘의 이슈: 최신 날짜 글이 4건 미만이면 이전 날짜로 보충(아침 7시 전)', () => {
  const posts = [post('old1', '2026-10-03', '증권'), post('new', '2026-10-04', '전체'), post('old2', '2026-10-03'), post('old3', '2026-10-03')];
  const r = pickTodayIssues(posts, '2026-10-05');
  assert.deepEqual(r.issues.map((p) => p.id), ['new', 'old1', 'old2', 'old3']);
  assert.equal(r.latestDate, '2026-10-04');
  assert.equal(r.isToday, false);
  assert.equal(issuesDateLabel(r), '최신 지면 · 10월 4일');
});

t('오늘의 이슈: 같은 날짜 안에서는 API 순서 유지', () => {
  const posts = [post('b', '2026-10-05'), post('a', '2026-10-05'), post('c', '2026-10-05'), post('d', '2026-10-05')];
  assert.deepEqual(pickTodayIssues(posts, '2026-10-05').issues.map((p) => p.id), ['b', 'a', 'c', 'd']);
});

t('오늘의 이슈: 0건', () => {
  const r = pickTodayIssues([], '2026-10-05');
  assert.deepEqual(r, { issues: [], latestDate: null, isToday: false });
  assert.equal(issuesDateLabel(r), '');
});

t('지면 이름', () => {
  assert.equal(sectionLabel('전체'), '지면 1면');
  assert.equal(sectionLabel('시그널'), '시그널 1면');
  assert.equal(sectionLabel(null), '이슈');
  assert.equal(sectionLabel('기타'), '이슈');
});

t('저장값 해석과 바로가기 문구', () => {
  assert.deepEqual(parseSavedMbti('INTJ'), { type: 'INTJ', group: 'NT' });
  assert.deepEqual(parseSavedMbti('NT'), { type: null, group: 'NT' });
  assert.equal(parseSavedMbti('garbage'), null);
  assert.equal(parseSavedMbti(null), null);
  assert.equal(savedShortcutLabel({ type: 'INTJ', group: 'NT' }), '지난번 INTJ(NT형)로 보기');
  assert.equal(savedShortcutLabel({ type: null, group: 'NT' }), '지난번 NT형으로 보기');
});

console.log(`\n${n} tests passed`);
```

- [ ] **Step 2: 스크립트 등록 후 실패 확인**

`package.json`의 `"scripts"`에서 `"test:lens-blocks"` 줄 다음에 추가한다. 앞 줄 끝에 쉼표를 붙인다.

```json
    "test:mbti": "node --experimental-strip-types scripts/test-mbti.mjs"
```

Run: `npm run test:mbti`
Expected: FAIL — `Cannot find module '.../src/features/mbti/lib/mbtiCorner.ts'`

- [ ] **Step 3: 구현** — `src/features/mbti/lib/mbtiCorner.ts`

```ts
// MBTI 코너("MBTI로 보는 오늘의 뉴스") 순수 로직 — 설계: docs/worklog/2026-10/2026-10-05-mbti-corner-design.md
//
// ⚠️ scripts/test-mbti.mjs가 `node --experimental-strip-types`로 이 파일을 직접 불러온다. 런타임 import를
// 두지 않는다(@/ 별칭은 노드가 못 푼다). `import type`은 실행 전에 지워지므로 괜찮다.
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';

export const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISTP', 'ESTJ', 'ESTP',
  'ISFJ', 'ISFP', 'ESFJ', 'ESFP',
] as const;
export type MbtiType = (typeof MBTI_TYPES)[number];

/** 고르기 격자·다른 유형 링크의 그룹 순서. MBTI_TYPES도 이 순서로 4개씩 묶여 있다. */
export const MBTI_GROUP_ORDER: readonly MbtiGroupId[] = ['NT', 'NF', 'ST', 'SF'];

export function parseMbtiType(raw: string | null | undefined): MbtiType | null {
  if (!raw) return null;
  const up = raw.trim().toUpperCase();
  return (MBTI_TYPES as readonly string[]).includes(up) ? (up as MbtiType) : null;
}

/** 가운데 두 글자(인식 S/N + 판단 T/F)가 인지유형 그룹이다. INTJ → NT. */
export function groupOfType(type: MbtiType): MbtiGroupId {
  return (type[1] + type[2]) as MbtiGroupId;
}

export function typesOfGroup(group: MbtiGroupId): MbtiType[] {
  return MBTI_TYPES.filter((t) => groupOfType(t) === group);
}

export function parseGroupSlug(raw: string | null | undefined): MbtiGroupId | null {
  if (!raw) return null;
  const up = raw.trim().toUpperCase();
  return (MBTI_GROUP_ORDER as readonly string[]).includes(up) ? (up as MbtiGroupId) : null;
}

export function groupSlug(group: MbtiGroupId): string {
  return group.toLowerCase();
}

export interface MbtiGroupInfo {
  group: MbtiGroupId;
  /** 결과 카드 제목 */
  title: string;
  /** 결과 카드 한 줄 설명 */
  summary: string;
  /** lensPerspectives 인덱스 — 레터 0 → 웹툰 1 → 팟캐스트 2 → 영상 3(인덱스 기준, 라벨 문자열 매칭 금지) */
  formatIndex: number;
}

export const MBTI_GROUP_INFO: Record<MbtiGroupId, MbtiGroupInfo> = {
  NT: { group: 'NT', title: '구조부터 보는 분석가형', summary: '왜 이렇게 됐고 다음엔 뭐가 올지, 흐름을 짚어 봐요', formatIndex: 0 },
  NF: { group: 'NF', title: '의미를 찾는 이야기형', summary: '이 뉴스가 사람들에게 어떤 의미인지 이야기로 만나요', formatIndex: 1 },
  SF: { group: 'SF', title: '사람에 공감하는 대화형', summary: '누가 어떻게 겪고 있는지, 대화로 들어요', formatIndex: 2 },
  ST: { group: 'ST', title: '사실로 보는 실용형', summary: '무엇이 얼마나 바뀌었는지, 핵심만 빠르게 봐요', formatIndex: 3 },
};

/** 이슈 카드 버튼 문구. 조사(로/으로)와 동사가 형식마다 달라 통째로 둔다. 인덱스 = formatIndex. */
export const FORMAT_CTA: readonly string[] = ['레터로 읽기', '웹툰으로 보기', '팟캐스트로 듣기', '영상으로 보기'];

/** 기사 상세 딥링크 번호. `?v=N`은 1부터 센다(shared/constants/lensPerspectives.ts의 parseLensView). */
export function viewParamOf(group: MbtiGroupId): number {
  return MBTI_GROUP_INFO[group].formatIndex + 1;
}

export function issueHref(path: string, group: MbtiGroupId): string {
  return `${path}${path.includes('?') ? '&' : '?'}v=${viewParamOf(group)}`;
}

export function resultPath(group: MbtiGroupId, type?: MbtiType | null): string {
  const base = `/mbti/${groupSlug(group)}`;
  return type ? `${base}?t=${type.toLowerCase()}` : base;
}

/** `?t`는 16유형이면서 그 그룹에 속할 때만 표시한다(공유 링크 위조·불일치 대비). */
export function displayTypeFor(group: MbtiGroupId, raw: string | null | undefined): MbtiType | null {
  const type = parseMbtiType(raw);
  return type && groupOfType(type) === group ? type : null;
}

// ── 간단 성향 체크 ─────────────────────────────────────────────
// 축마다 기본 2문항. 두 답이 같으면 그 답, 갈리면 보충 질문 1개를 더 물어 2:1 다수결로 정한다.
// 그래서 모든 답이 결과에 반영되고, 일관되게 답한 사람은 4문항에서 끝난다(최대 6문항).
export type QuickCheckAxis = 'SN' | 'TF';
export type QuickCheckId = 'sn1' | 'sn2' | 'sn3' | 'tf1' | 'tf2' | 'tf3';
export type QuickCheckChoice = 'a' | 'b';
export type QuickCheckAnswers = Partial<Record<QuickCheckId, QuickCheckChoice>>;

export interface QuickCheckQuestion {
  id: QuickCheckId;
  axis: QuickCheckAxis;
  /** 그 축의 앞 두 답이 갈릴 때만 묻는 보충 질문 */
  tiebreak: boolean;
  prompt: string;
  /** 축의 앞 글자(S·T) 쪽 선택지 */
  a: string;
  /** 축의 뒤 글자(N·F) 쪽 선택지 */
  b: string;
}

export const QUICK_CHECK: readonly QuickCheckQuestion[] = [
  { id: 'sn1', axis: 'SN', tiebreak: false, prompt: '뉴스에서 먼저 눈이 가는 건?', a: '정확한 숫자와 사실', b: '이 일이 어디로 이어질지' },
  { id: 'sn2', axis: 'SN', tiebreak: false, prompt: '친구에게 뉴스를 전할 때 나는?', a: '무슨 일이 있었는지 그대로', b: '이게 왜 중요한지부터' },
  { id: 'sn3', axis: 'SN', tiebreak: true, prompt: '새 정책 뉴스를 보면 먼저 찾는 건?', a: '언제부터, 누가, 얼마나 받는지', b: '이 정책이 앞으로 무엇을 바꿀지' },
  { id: 'tf1', axis: 'TF', tiebreak: false, prompt: '같은 뉴스라도 더 궁금한 건?', a: '원인과 결과, 누가 이득인지', b: '이 일로 누가 어떤 영향을 받는지' },
  { id: 'tf2', axis: 'TF', tiebreak: false, prompt: '좋은 해설이란?', a: '논리가 딱 맞아떨어지는 해설', b: '사람 사는 이야기가 느껴지는 해설' },
  { id: 'tf3', axis: 'TF', tiebreak: true, prompt: '의견이 갈리는 뉴스를 볼 때 나는?', a: '어느 쪽 근거가 더 탄탄한지 따져 봐요', b: '양쪽 사람들의 사정이 먼저 궁금해요' },
];

function axisQuestions(axis: QuickCheckAxis): QuickCheckQuestion[] {
  return QUICK_CHECK.filter((q) => q.axis === axis);
}

/** 축의 결과 글자. 앞 두 답이 같으면 그 답, 갈리면 보충 질문 답. 아직 모자라면 null. */
function axisLetter(axis: QuickCheckAxis, answers: QuickCheckAnswers): string | null {
  const [q1, q2, q3] = axisQuestions(axis);
  const c1 = answers[q1.id];
  const c2 = answers[q2.id];
  if (!c1 || !c2) return null;
  const pick = c1 === c2 ? c1 : answers[q3.id];
  if (!pick) return null;
  return pick === 'a' ? axis[0] : axis[1];
}

/** 다음에 물을 질문. 끝났으면 null. S/N 축을 끝낸 뒤 T/F 축으로 간다. */
export function nextQuickCheckQuestion(answers: QuickCheckAnswers): QuickCheckQuestion | null {
  for (const axis of ['SN', 'TF'] as const) {
    const [q1, q2, q3] = axisQuestions(axis);
    if (!answers[q1.id]) return q1;
    if (!answers[q2.id]) return q2;
    if (answers[q1.id] !== answers[q2.id] && !answers[q3.id]) return q3;
  }
  return null;
}

export function scoreQuickCheck(answers: QuickCheckAnswers): MbtiGroupId | null {
  const sn = axisLetter('SN', answers);
  const tf = axisLetter('TF', answers);
  return sn && tf ? ((sn + tf) as MbtiGroupId) : null;
}

// ── 오늘의 이슈 ──────────────────────────────────────────────
/** pickTodayIssues가 읽는 필드만. CmsLens(shared/lib/api/cmsPostsApi)가 구조적으로 맞는다. */
export interface IssueSource {
  id: string;
  /** 'YYYY-MM-DD' 발행일(KST) */
  date: string;
  paper_section?: string | null;
}

/** 홈 LensPreviewSection의 SECTIONS와 같은 지면 값·순서. */
const PAPER_SECTIONS: readonly string[] = ['전체', '증권', '산업', '시그널'];
const PAPER_SECTION_LABELS: Record<string, string> = { 전체: '지면 1면', 증권: '증권 1면', 산업: '산업 1면', 시그널: '시그널 1면' };

export function sectionLabel(section: string | null | undefined): string {
  return (section && PAPER_SECTION_LABELS[section]) || '이슈';
}

export interface TodayIssuesPick<T> {
  issues: T[];
  latestDate: string | null;
  isToday: boolean;
}

/**
 * 오늘의 이슈 고르기(설계 2-④).
 * 1) 최신 발행일 글이 후보. 4건 미만이면 이전 날짜 글을 최신순으로 이어 붙인다(아침 7시 전 등).
 * 2) 지면 순서 [전체·증권·산업·시그널]마다 1건씩.
 * 3) 빈 자리는 남은 후보를 최신순으로 채운다.
 * 같은 날짜 안에서는 API 순서를 유지하고, 같은 글은 두 번 고르지 않는다.
 */
export function pickTodayIssues<T extends IssueSource>(posts: readonly T[], todayKst: string, count = 4): TodayIssuesPick<T> {
  const sorted = posts
    .map((post, i) => ({ post, i }))
    .sort((x, y) => (x.post.date === y.post.date ? x.i - y.i : x.post.date < y.post.date ? 1 : -1))
    .map((x) => x.post);
  if (sorted.length === 0) return { issues: [], latestDate: null, isToday: false };

  const latestDate = sorted[0].date;
  const latest = sorted.filter((p) => p.date === latestDate);
  const candidates = latest.length >= count ? latest : sorted;

  const picked: T[] = [];
  const used = new Set<string>();
  for (const section of PAPER_SECTIONS) {
    const hit = candidates.find((p) => p.paper_section === section && !used.has(p.id));
    if (hit) {
      picked.push(hit);
      used.add(hit.id);
    }
  }
  for (const p of candidates) {
    if (picked.length >= count) break;
    if (!used.has(p.id)) {
      picked.push(p);
      used.add(p.id);
    }
  }
  return { issues: picked.slice(0, count), latestDate, isToday: latestDate === todayKst };
}

export function issuesDateLabel(pick: { latestDate: string | null; isToday: boolean }): string {
  if (!pick.latestDate) return '';
  if (pick.isToday) return '오늘 지면';
  const [, m, d] = pick.latestDate.split('-');
  return `최신 지면 · ${Number(m)}월 ${Number(d)}일`;
}

// ── 저장값 ──────────────────────────────────────────────────
export interface SavedMbti {
  type: MbtiType | null;
  group: MbtiGroupId;
}

/** 저장값("INTJ" 또는 체크로 찾은 "NT")을 해석한다. 알 수 없는 값은 null. */
export function parseSavedMbti(raw: string | null | undefined): SavedMbti | null {
  const type = parseMbtiType(raw);
  if (type) return { type, group: groupOfType(type) };
  const group = parseGroupSlug(raw);
  return group ? { type: null, group } : null;
}

export function savedShortcutLabel(saved: SavedMbti): string {
  return saved.type ? `지난번 ${saved.type}(${saved.group}형)로 보기` : `지난번 ${saved.group}형으로 보기`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test:mbti`
Expected: `ok -` 줄 16개 + `16 tests passed`

- [ ] **Step 5: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 출력 없이 종료 코드 0

- [ ] **Step 6: 커밋**

```bash
git add src/features/mbti/lib/mbtiCorner.ts scripts/test-mbti.mjs package.json
git commit -m "feat(frontend): MBTI 코너 순수 로직(16→4 매핑·간단 성향 체크·오늘의 이슈 고르기) + 노드 테스트"
```

---

### Task 2: `/mbti` 첫 화면 (저장·고르기·간단 성향 체크)

**Files:**
- Create: `src/features/mbti/lib/mbtiStorage.ts`
- Create: `src/features/mbti/components/TypePicker.tsx`
- Create: `src/features/mbti/components/QuickCheck.tsx`
- Create: `src/features/mbti/components/MbtiNotice.tsx`
- Create: `src/features/mbti/components/MbtiLanding.tsx`
- Create: `src/features/mbti/index.ts`
- Create: `src/app/(content)/mbti/page.tsx`
- Test: `$SMOKE_DIR/task2-smoke.mjs` (스크래치, 커밋 안 함)

**Interfaces:**
- Consumes: Task 1의 `MBTI_GROUP_ORDER`, `typesOfGroup`, `groupOfType`, `resultPath`, `savedShortcutLabel`, `parseSavedMbti`, `nextQuickCheckQuestion`, `scoreQuickCheck`, `MbtiType`, `SavedMbti`, `QuickCheckAnswers`, `QuickCheckChoice`. 그 밖에 다음을 가져다 쓴다.
  - shared: `trackEvent(name, params)`, `READING_ACCENT`·`LENS_CARD_BORDER`·`LENS_CARD_SHADOW`(`@/shared/constants/lensPerspectives`)
  - widget: `StaticPageShell({ title, children })`(`@/widgets/StaticPageShell`)
- Produces:
  - `readSavedMbti(): SavedMbti | null`, `saveMbti(value: MbtiType | MbtiGroupId): void`
  - `MbtiLanding()`, `MbtiNotice()`
  - `features/mbti/index.ts`의 `MbtiLanding` export

- [ ] **Step 1: 실패하는 화면 테스트 작성** — `$SMOKE_DIR/task2-smoke.mjs`

파일 맨 위에 "공통 머리말"을 넣고 이어서 아래 내용을 쓴다.

```js
// 1) 16칸 + 고르기 → 결과 주소
const page = await newPage();
await page.goto(`${BASE}/mbti`, { waitUntil: 'networkidle' });
assert.equal(await page.locator('[aria-label="내 MBTI 고르기"] button').count(), 16);
await page.getByRole('button', { name: 'INTJ', exact: true }).click();
await page.waitForURL(/\/mbti\/nt\?t=intj$/);

// 2) 다시 오면 "지난번" 바로가기
await page.goto(`${BASE}/mbti`, { waitUntil: 'networkidle' });
await page.getByRole('link', { name: '지난번 INTJ(NT형)로 보기 →' }).waitFor();

// 3) 간단 성향 체크 — 모두 첫 번째 답이면 4문항 만에 ST
await page.getByRole('button', { name: /MBTI를 잘 모르겠어요/ }).click();
for (let i = 1; i <= 4; i++) {
  await page.getByText(`간단 성향 체크 · 질문 ${i}`).waitFor();
  await page.getByRole('radio').first().click();
}
await page.waitForURL(/\/mbti\/st$/);

// 4) 체크 중 건너뛰기 → 고르기 화면
await page.goto(`${BASE}/mbti`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /MBTI를 잘 모르겠어요/ }).click();
await page.getByRole('button', { name: '건너뛰기' }).click();
await page.locator('[aria-label="내 MBTI 고르기"]').waitFor();
assert.deepEqual(errors, [], errors.join('\n'));

// 5) 저장소 차단(사생활 보호 모드) — 바로가기 없이 고르기 동작
//    이 페이지는 사이트의 다른 코드가 저장소 오류를 낼 수 있어 pageerror를 단정하지 않는다.
const blocked = await context.newPage();
await blocked.addInitScript(() => {
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
});
await blocked.goto(`${BASE}/mbti`, { waitUntil: 'networkidle' });
assert.equal(await blocked.getByRole('link', { name: /지난번/ }).count(), 0);
await blocked.getByRole('button', { name: 'ENFP', exact: true }).click();
await blocked.waitForURL(/\/mbti\/nf\?t=enfp$/);

await browser.close();
console.log('task2 smoke ok');
```

- [ ] **Step 2: 실패 확인**

로컬 운영 빌드를 띄운다("공통" 절차). 그다음 실행한다.

Run: `cd "$SMOKE_DIR" && node task2-smoke.mjs`
Expected: FAIL — `/mbti`가 404라 버튼 수 단정이 `0 !== 16`으로 실패

- [ ] **Step 3: 저장소 래퍼** — `src/features/mbti/lib/mbtiStorage.ts`

```ts
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { parseSavedMbti, type MbtiType, type SavedMbti } from './mbtiCorner';

// 코너 전용 키 — 옛 홈 질문 탭(features/question)이 쓰던 `mbti-group`과 겹치지 않게 한다.
const KEY = 'mbti-corner-type';

/** 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 null — 화면은 그대로 동작한다. */
export function readSavedMbti(): SavedMbti | null {
  try {
    return parseSavedMbti(window.localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function saveMbti(value: MbtiType | MbtiGroupId): void {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    /* 저장 못 해도 이번 방문은 계속 볼 수 있다 */
  }
}
```

- [ ] **Step 4: 유형 고르기** — `src/features/mbti/components/TypePicker.tsx`

```tsx
'use client';

import { LENS_CARD_BORDER, LENS_CARD_SHADOW, READING_ACCENT } from '@/shared/constants/lensPerspectives';
import { MBTI_GROUP_ORDER, typesOfGroup, type MbtiType } from '../lib/mbtiCorner';

// 4×4 격자 — 한 줄이 한 그룹(NT·NF·ST·SF). 모바일에서도 4열을 유지한다(390px에서 칸당 약 80px).
export function TypePicker({ selected, onSelect }: { selected: MbtiType | null; onSelect: (type: MbtiType) => void }) {
  return (
    <div role="group" aria-label="내 MBTI 고르기" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
      {MBTI_GROUP_ORDER.flatMap((g) => typesOfGroup(g)).map((type) => {
        const on = selected === type;
        return (
          <button
            key={type}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(type)}
            style={{
              padding: '14px 0',
              borderRadius: 12,
              border: on ? `1.5px solid ${READING_ACCENT}` : LENS_CARD_BORDER,
              background: on ? '#eff6ff' : '#ffffff',
              boxShadow: LENS_CARD_SHADOW,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: '#0f172a',
              cursor: 'pointer',
            }}
          >
            {type}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: 간단 성향 체크** — `src/features/mbti/components/QuickCheck.tsx`

```tsx
'use client';

import { useState } from 'react';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { LENS_CARD_BORDER, LENS_CARD_SHADOW } from '@/shared/constants/lensPerspectives';
import { nextQuickCheckQuestion, scoreQuickCheck, type QuickCheckAnswers, type QuickCheckChoice } from '../lib/mbtiCorner';

// 답을 고르면 바로 다음 질문으로 넘어간다. 축마다 앞 두 답이 갈릴 때만 보충 질문이 나온다(4~6문항).
// "건너뛰기"는 결과를 저장하지 않고 고르기 화면으로 돌아간다.
export function QuickCheck({ onComplete, onCancel }: { onComplete: (group: MbtiGroupId) => void; onCancel: () => void }) {
  const [answers, setAnswers] = useState<QuickCheckAnswers>({});
  const question = nextQuickCheckQuestion(answers);
  if (!question) return null;

  const step = Object.keys(answers).length + 1;
  const choose = (choice: QuickCheckChoice) => {
    const next = { ...answers, [question.id]: choice };
    const group = scoreQuickCheck(next);
    if (group) {
      onComplete(group);
      return;
    }
    setAnswers(next);
  };

  return (
    <section aria-labelledby="mbti-check-q">
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em' }}>
        간단 성향 체크 · 질문 {step}
      </p>
      <h2 id="mbti-check-q" style={{ margin: '10px 0 18px', fontSize: 20, fontWeight: 700, lineHeight: 1.45, color: '#0f172a', letterSpacing: '-0.02em' }}>
        {question.prompt}
      </h2>
      <div role="radiogroup" aria-labelledby="mbti-check-q" style={{ display: 'grid', gap: 10 }}>
        {(['a', 'b'] as const).map((c) => (
          <button
            key={`${question.id}-${c}`}
            type="button"
            role="radio"
            aria-checked={false}
            onClick={() => choose(c)}
            style={{ textAlign: 'left', padding: '16px 18px', borderRadius: 14, border: LENS_CARD_BORDER, boxShadow: LENS_CARD_SHADOW, background: '#ffffff', fontSize: 15, lineHeight: 1.5, color: '#1f2937', cursor: 'pointer' }}
          >
            {question[c]}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onCancel}
        style={{ marginTop: 16, padding: 0, background: 'none', border: 'none', color: '#64748b', fontSize: 13, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}
      >
        건너뛰기
      </button>
    </section>
  );
}
```

- [ ] **Step 6: 상표 안내** — `src/features/mbti/components/MbtiNotice.tsx`

```tsx
// 설계 2-⑤ 원문 그대로. 법률 검토를 대신하지 않는 기본 조치다.
export function MbtiNotice() {
  return (
    <p style={{ margin: '40px 0 0', fontSize: 12, lineHeight: 1.7, color: '#94a3b8' }}>
      MBTI는 The Myers-Briggs Company의 상표입니다. 이 코너는 공식 MBTI 검사가 아니며, 고른 유형에 맞춰 뉴스 보는 방식을 추천합니다.
    </p>
  );
}
```

- [ ] **Step 7: 첫 화면 조립** — `src/features/mbti/components/MbtiLanding.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { LENS_CARD_BORDER, READING_ACCENT } from '@/shared/constants/lensPerspectives';
import { groupOfType, resultPath, savedShortcutLabel, type MbtiType, type SavedMbti } from '../lib/mbtiCorner';
import { readSavedMbti, saveMbti } from '../lib/mbtiStorage';
import { TypePicker } from './TypePicker';
import { QuickCheck } from './QuickCheck';
import { MbtiNotice } from './MbtiNotice';

export function MbtiLanding() {
  const router = useRouter();
  const [mode, setMode] = useState<'pick' | 'check'>('pick');
  const [saved, setSaved] = useState<SavedMbti | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 localStorage 1회 읽기(LensPreviewSection과 같은 관례).
    setSaved(readSavedMbti());
  }, []);

  const pickType = (type: MbtiType) => {
    const group = groupOfType(type);
    trackEvent('mbti_type_select', { type, group });
    saveMbti(type);
    router.push(resultPath(group, type));
  };

  const finishCheck = (group: MbtiGroupId) => {
    trackEvent('mbti_check_complete', { group });
    saveMbti(group);
    router.push(resultPath(group));
  };

  if (mode === 'check') {
    return (
      <div>
        <QuickCheck onComplete={finishCheck} onCancel={() => setMode('pick')} />
        <MbtiNotice />
      </div>
    );
  }

  return (
    <div>
      <p style={{ margin: '0 0 20px', fontSize: 15, lineHeight: 1.7, color: '#475569' }}>
        내 MBTI를 고르면, 같은 기사를 내 인지유형(NT·NF·ST·SF)에 맞는 형식으로 골라 드려요.
      </p>
      {saved && (
        <Link href={resultPath(saved.group, saved.type)} style={{ display: 'inline-block', marginBottom: 20, fontSize: 14, fontWeight: 700, color: READING_ACCENT, textDecoration: 'none' }}>
          {savedShortcutLabel(saved)} →
        </Link>
      )}
      <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>내 MBTI 고르기</h2>
      <TypePicker selected={saved?.type ?? null} onSelect={pickType} />
      <button
        type="button"
        onClick={() => setMode('check')}
        style={{ marginTop: 20, width: '100%', padding: '14px 16px', borderRadius: 14, border: LENS_CARD_BORDER, background: '#f8fafc', fontSize: 14, fontWeight: 700, color: '#334155', cursor: 'pointer' }}
      >
        MBTI를 잘 모르겠어요 → 간단 성향 체크
      </button>
      <MbtiNotice />
    </div>
  );
}
```

- [ ] **Step 8: 공개 API** — `src/features/mbti/index.ts`

```ts
// MBTI 코너 공개 API — 외부(app 라우트)는 이 파일로만 가져다 쓴다(FSD index.ts 규칙).
export { MbtiLanding } from './components/MbtiLanding';
```

- [ ] **Step 9: 라우트** — `src/app/(content)/mbti/page.tsx`

```tsx
import type { Metadata } from 'next';
import { StaticPageShell } from '@/widgets/StaticPageShell';
import { MbtiLanding } from '@/features/mbti';
import { SITE_URL } from '@/shared/constants/site';

// MBTI 코너 첫 화면(2026-10-05) — 설계: docs/worklog/2026-10/2026-10-05-mbti-corner-design.md
const TITLE = 'MBTI로 보는 오늘의 뉴스';
const DESCRIPTION = '내 MBTI 인지유형(NT·NF·ST·SF)에 맞는 형식으로 오늘의 서울경제 이슈를 골라 드려요.';
const URL = `${SITE_URL}/mbti`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: URL,
    type: 'website',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: TITLE }],
    locale: 'ko_KR',
    siteName: 'AI LENS — 서울경제',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [`${SITE_URL}/og-image.png`] },
};

export default function MbtiPage() {
  return (
    <StaticPageShell title={TITLE}>
      <MbtiLanding />
    </StaticPageShell>
  );
}
```

- [ ] **Step 10: 정적 검사**

Run: `npx tsc --noEmit && npx eslint src/features/mbti 'src/app/(content)/mbti'`
Expected: 출력 없이 종료 코드 0

- [ ] **Step 11: 빌드하고 화면 테스트 통과 확인**

기존 서버를 끄고(`kill %1`) "공통" 절차로 다시 빌드해 띄운다.

Run: `cd "$SMOKE_DIR" && node task2-smoke.mjs`
Expected: `task2 smoke ok`

`/mbti/nt` 등은 아직 404지만 주소만 확인하므로 통과한다.

- [ ] **Step 12: 커밋**

```bash
git add src/features/mbti 'src/app/(content)/mbti/page.tsx'
git commit -m "feat(frontend): /mbti 첫 화면 — 16유형 고르기·간단 성향 체크·지난번 유형 바로가기"
```

---

### Task 3: `/mbti/{그룹}` 결과 화면 (결과 카드·오늘의 이슈·다른 유형)

**Files:**
- Create: `src/features/mbti/components/ResultCard.tsx`
- Create: `src/features/mbti/components/TodayIssues.tsx`
- Create: `src/features/mbti/components/GroupSwitcher.tsx`
- Create: `src/features/mbti/components/MbtiResult.tsx`
- Modify: `src/features/mbti/index.ts`
- Create: `src/app/(content)/mbti/[group]/page.tsx`
- Test: `$SMOKE_DIR/task3-smoke.mjs`

**Interfaces:**
- Consumes: Task 1의 `MBTI_GROUP_INFO`, `MBTI_GROUP_ORDER`, `FORMAT_CTA`, `issueHref`, `resultPath`, `displayTypeFor`, `pickTodayIssues`, `issuesDateLabel`, `sectionLabel`, `groupSlug`, `parseGroupSlug`, `TodayIssuesPick`, `MbtiType`. 그 밖에 다음을 가져다 쓴다.
  - Task 2의 `MbtiNotice`
  - shared:
    - `fetchLensPosts(limit): Promise<CmsLens[]>`(실패 시 재시도 후 빈 배열)
    - `lensPath(post): string`
    - `kstTodayStr(): string`
    - `displayHeadline(headline): string`
    - `lensPerspectiveAt(i)`(`.short/.duration/.color/.tint/.icon`), `lensFormatAt(i)`, `pickLensPhoto(post)`
- Produces:
  - `MbtiResult({ group }: { group: MbtiGroupId })`. 공유 영역은 Task 4가 이 파일에 끼워 넣는다.
  - `index.ts`에 추가할 export: `MbtiResult`, `MBTI_GROUP_INFO`, `MBTI_GROUP_ORDER`, `groupSlug`, `parseGroupSlug`

- [ ] **Step 1: 실패하는 화면 테스트 작성** — `$SMOKE_DIR/task3-smoke.mjs`

"공통 머리말" 다음에 아래 내용을 쓴다.

```js
const issueLinks = (p) => p.locator('section[aria-labelledby="mbti-issues-title"] a[href*="?v="]');

// 1) NT 결과 카드 + 이슈 링크 ?v=1 + 기사에서 레터 탭이 열림
const page = await newPage();
await page.goto(`${BASE}/mbti/nt?t=intj`, { waitUntil: 'networkidle' });
await page.getByText('INTJ · NT형').waitFor();
await page.getByRole('heading', { name: '구조부터 보는 분석가형' }).waitFor();
await issueLinks(page).first().waitFor({ timeout: 15000 });
const hrefs = await issueLinks(page).evaluateAll((as) => as.map((a) => a.getAttribute('href')));
assert.ok(hrefs.length >= 1 && hrefs.length <= 4, `이슈 수 ${hrefs.length}`);
for (const h of hrefs) assert.match(h, /\?v=1$/);
await issueLinks(page).first().click();
await page.waitForURL(/\?v=1$/);
await page.locator('[role=tab][aria-selected=true]', { hasText: '레터' }).waitFor();

// 2) 그룹별 ?v 번호
for (const [g, v] of [['nf', 2], ['sf', 3], ['st', 4]]) {
  await page.goto(`${BASE}/mbti/${g}`, { waitUntil: 'networkidle' });
  await issueLinks(page).first().waitFor({ timeout: 15000 });
  assert.match(await issueLinks(page).first().getAttribute('href'), new RegExp(`\\?v=${v}$`));
}

// 3) ?t 위조·불일치 → 그룹만 표시 (Review Focus 4)
for (const bad of ['esfp', '%3Cscript%3E']) {
  await page.goto(`${BASE}/mbti/nt?t=${bad}`, { waitUntil: 'networkidle' });
  await page.getByText('NT형', { exact: true }).waitFor();
  assert.equal(await page.getByText('ESFP').count(), 0);
}

// 4) 없는 그룹·대문자 → 404
for (const p of ['/mbti/xx', '/mbti/NT']) assert.equal((await page.goto(`${BASE}${p}`)).status(), 404, p);

// 5) 형식이 없는 번호(?v=9)는 기사 화면이 무시하고 레터 탭 (Review Focus 5)
await page.goto(`${BASE}${hrefs[0].replace(/\?v=1$/, '?v=9')}`, { waitUntil: 'networkidle' });
await page.locator('[role=tab][aria-selected=true]', { hasText: '레터' }).waitFor();
assert.deepEqual(errors, [], errors.join('\n'));

// 6) API 실패 → 안내 + /lens 링크 (Review Focus 3)
const failing = await context.newPage();
await failing.route('**/api/v2/posts**', (r) => r.abort());
await failing.goto(`${BASE}/mbti/nf`, { waitUntil: 'networkidle' });
await failing.getByText('지금은 이슈를 불러오지 못했어요.').waitFor({ timeout: 20000 });
assert.equal(await failing.getByRole('link', { name: '전체 이슈 보기 →' }).getAttribute('href'), '/lens');

// 7) 아침 7시 전처럼 최신 글이 어제뿐일 때 → "최신 지면 · M월 D일" (Review Focus 1)
const early = await context.newPage();
await early.route('**/api/v2/posts**', async (route) => {
  const res = await route.fetch();
  const data = await res.json();
  const posts = (data.posts ?? []).map((p) => ({ ...p, date: '2026-01-02' }));
  await route.fulfill({ response: res, json: { ...data, posts } });
});
await early.goto(`${BASE}/mbti/st`, { waitUntil: 'networkidle' });
await early.getByText('최신 지면 · 1월 2일').waitFor({ timeout: 15000 });

await browser.close();
console.log('task3 smoke ok');
```

- [ ] **Step 2: 실패 확인**

Run: `cd "$SMOKE_DIR" && node task3-smoke.mjs`
Expected: FAIL — `/mbti/nt`가 404라 `INTJ · NT형` 대기 중 타임아웃

- [ ] **Step 3: 결과 카드** — `src/features/mbti/components/ResultCard.tsx`

```tsx
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { LENS_CARD_BORDER, lensPerspectiveAt } from '@/shared/constants/lensPerspectives';
import { MBTI_GROUP_INFO, type MbtiType } from '../lib/mbtiCorner';

// 색은 형식 기준(lensPerspectiveAt) — 사이트 다른 곳의 형식 색과 같게 보인다.
export function ResultCard({ group, type }: { group: MbtiGroupId; type: MbtiType | null }) {
  const info = MBTI_GROUP_INFO[group];
  const p = lensPerspectiveAt(info.formatIndex);
  const Icon = p.icon;
  return (
    <section
      aria-labelledby="mbti-result-title"
      style={{ background: '#ffffff', borderRadius: 20, padding: '28px 24px', border: LENS_CARD_BORDER, boxShadow: '0 12px 28px rgba(17,24,39,0.06)', textAlign: 'center' }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.14em' }}>
        {type ? `${type} · ${group}형` : `${group}형`}
      </p>
      <h2 id="mbti-result-title" style={{ margin: '10px 0 8px', fontFamily: '"Noto Serif KR", serif', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: '#0f172a' }}>
        {info.title}
      </h2>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7, color: '#6b7280' }}>{info.summary}</p>
      <p style={{ margin: '18px 0 0', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: p.tint, color: p.color, fontSize: 13, fontWeight: 700 }}>
        <Icon size={16} aria-hidden /> 추천 형식: {p.short}
      </p>
    </section>
  );
}
```

- [ ] **Step 4: 오늘의 이슈** — `src/features/mbti/components/TodayIssues.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { lensPath } from '@/shared/lib/lensUrl';
import { kstTodayStr } from '@/shared/lib/date';
import { displayHeadline } from '@/shared/lib/displayHeadline';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { LENS_CARD_BORDER, LENS_CARD_SHADOW, READING_ACCENT, lensFormatAt, lensPerspectiveAt, pickLensPhoto } from '@/shared/constants/lensPerspectives';
import { FORMAT_CTA, MBTI_GROUP_INFO, issueHref, issuesDateLabel, pickTodayIssues, sectionLabel, type TodayIssuesPick } from '../lib/mbtiCorner';

type State = { status: 'loading' } | { status: 'ready'; pick: TodayIssuesPick<CmsLens> };

// 홈 '오늘의 이슈'와 같은 데이터(fetchLensPosts, 실패하면 재시도 후 빈 배열)에서 4건을 고른다(설계 2-④).
// 0건과 실패는 같은 안내로 처리한다 — 로딩 문구에 멈추지 않게.
export function TodayIssues({ group }: { group: MbtiGroupId }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const { formatIndex } = MBTI_GROUP_INFO[group];
  const p = lensPerspectiveAt(formatIndex);

  useEffect(() => {
    let alive = true;
    fetchLensPosts(100)
      .catch(() => [] as CmsLens[])
      .then((posts) => {
        if (alive) setState({ status: 'ready', pick: pickTodayIssues(posts, kstTodayStr()) });
      });
    return () => {
      alive = false;
    };
  }, []);

  const empty = state.status === 'ready' && state.pick.issues.length === 0;

  return (
    <section aria-labelledby="mbti-issues-title" style={{ marginTop: 36 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <h2 id="mbti-issues-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
          오늘의 이슈
        </h2>
        {state.status === 'ready' && !empty && (
          <span style={{ fontSize: 12.5, color: '#94a3b8' }}>{issuesDateLabel(state.pick)}</span>
        )}
      </div>

      {state.status === 'loading' && (
        <p role="status" style={{ margin: 0, fontSize: 14, color: '#94a3b8' }}>
          오늘의 이슈를 불러오는 중이에요…
        </p>
      )}

      {empty && (
        <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
          지금은 이슈를 불러오지 못했어요.{' '}
          <Link href="/lens" style={{ color: READING_ACCENT, fontWeight: 700 }}>
            전체 이슈 보기 →
          </Link>
        </p>
      )}

      {state.status === 'ready' && !empty && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
          {state.pick.issues.map((post) => {
            const photo = pickLensPhoto(post);
            return (
              <li key={post.id}>
                <Link
                  href={issueHref(lensPath(post), group)}
                  prefetch={false}
                  onClick={() => trackEvent('mbti_issue_click', { group, article_id: post.id, format: lensFormatAt(formatIndex) })}
                  style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 12, borderRadius: 16, border: LENS_CARD_BORDER, boxShadow: LENS_CARD_SHADOW, background: '#ffffff', textDecoration: 'none', color: 'inherit' }}
                >
                  {photo && (
                    <span style={{ position: 'relative', flex: '0 0 auto', width: 96, height: 72, borderRadius: 10, overflow: 'hidden', background: '#f1f5f9' }}>
                      <Image src={photo} alt="" fill sizes="96px" style={{ objectFit: 'cover' }} />
                    </span>
                  )}
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>{sectionLabel(post.paper_section)}</span>
                    <span style={{ display: 'block', margin: '4px 0 6px', fontSize: 15, fontWeight: 700, lineHeight: 1.45, color: '#0f172a' }}>
                      {displayHeadline(post.headline)}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: p.color }}>
                      {FORMAT_CTA[formatIndex]} · {p.duration}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 5: 다른 유형 링크** — `src/features/mbti/components/GroupSwitcher.tsx`

```tsx
import Link from 'next/link';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { LENS_CARD_BORDER } from '@/shared/constants/lensPerspectives';
import { MBTI_GROUP_INFO, MBTI_GROUP_ORDER, resultPath } from '../lib/mbtiCorner';

export function GroupSwitcher({ current }: { current: MbtiGroupId }) {
  return (
    <nav aria-label="다른 유형으로 보기" style={{ marginTop: 36 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>다른 유형으로 보기</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {MBTI_GROUP_ORDER.filter((g) => g !== current).map((g) => (
          <Link key={g} href={resultPath(g)} style={{ padding: '8px 14px', borderRadius: 999, border: LENS_CARD_BORDER, fontSize: 13, color: '#334155', textDecoration: 'none' }}>
            {g}형 · {MBTI_GROUP_INFO[g].title}
          </Link>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 6: 결과 화면 조립** — `src/features/mbti/components/MbtiResult.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { displayTypeFor, type MbtiType } from '../lib/mbtiCorner';
import { ResultCard } from './ResultCard';
import { TodayIssues } from './TodayIssues';
import { GroupSwitcher } from './GroupSwitcher';
import { MbtiNotice } from './MbtiNotice';

export function MbtiResult({ group }: { group: MbtiGroupId }) {
  const [type, setType] = useState<MbtiType | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 ?t 1회 읽기. 정적 페이지에서 useSearchParams는 Suspense 경계가 필요해 LensViewClient처럼 location을 직접 읽는다.
    setType(displayTypeFor(group, new URLSearchParams(window.location.search).get('t')));
  }, [group]);

  return (
    <div>
      <ResultCard group={group} type={type} />
      <TodayIssues group={group} />
      <GroupSwitcher current={group} />
      <MbtiNotice />
    </div>
  );
}
```

- [ ] **Step 7: 공개 API 추가** — `src/features/mbti/index.ts` 전체를 다음으로 바꾼다.

```ts
// MBTI 코너 공개 API — 외부(app 라우트)는 이 파일로만 가져다 쓴다(FSD index.ts 규칙).
export { MbtiLanding } from './components/MbtiLanding';
export { MbtiResult } from './components/MbtiResult';
export { MBTI_GROUP_INFO, MBTI_GROUP_ORDER, groupSlug, parseGroupSlug } from './lib/mbtiCorner';
```

- [ ] **Step 8: 라우트** — `src/app/(content)/mbti/[group]/page.tsx`

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StaticPageShell } from '@/widgets/StaticPageShell';
import { MbtiResult, MBTI_GROUP_INFO, MBTI_GROUP_ORDER, groupSlug, parseGroupSlug } from '@/features/mbti';
import { lensPerspectiveAt } from '@/shared/constants/lensPerspectives';
import { SITE_URL } from '@/shared/constants/site';

const CORNER = 'MBTI로 보는 오늘의 뉴스';

// 4개 그룹만 정적으로 만든다. 그 밖의 주소(/mbti/xx, 대문자 /mbti/NT 포함)는 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return MBTI_GROUP_ORDER.map((g) => ({ group: groupSlug(g) }));
}

export async function generateMetadata({ params }: { params: Promise<{ group: string }> }): Promise<Metadata> {
  const { group: slug } = await params;
  const group = parseGroupSlug(slug);
  if (!group) return {};
  const info = MBTI_GROUP_INFO[group];
  const title = `${group}형 — ${info.title} · ${CORNER}`;
  const description = `${info.summary}. MBTI 인지유형 ${group}형에게 맞는 ${lensPerspectiveAt(info.formatIndex).short} 형식으로 오늘의 이슈를 골라 드려요.`;
  return { title, description, alternates: { canonical: `${SITE_URL}/mbti/${groupSlug(group)}` } };
}

export default async function MbtiGroupPage({ params }: { params: Promise<{ group: string }> }) {
  const { group: slug } = await params;
  const group = parseGroupSlug(slug);
  if (!group) notFound();
  return (
    <StaticPageShell title={CORNER}>
      <MbtiResult group={group} />
    </StaticPageShell>
  );
}
```

- [ ] **Step 9: 정적 검사**

Run: `npx tsc --noEmit && npx eslint src/features/mbti 'src/app/(content)/mbti'`
Expected: 출력 없이 종료 코드 0

- [ ] **Step 10: 빌드하고 화면 테스트 통과 확인**

서버를 끄고 "공통" 절차로 다시 빌드해 띄운다. 빌드 로그에 `/mbti/[group]` 아래 `/mbti/nt` 등 4개가 정적(●)으로 나오는지 본다.

Run: `cd "$SMOKE_DIR" && node task3-smoke.mjs && node task2-smoke.mjs`
Expected: `task3 smoke ok`, `task2 smoke ok`

- [ ] **Step 11: 커밋**

```bash
git add src/features/mbti 'src/app/(content)/mbti/[group]/page.tsx'
git commit -m "feat(frontend): /mbti/{nt,nf,st,sf} 결과 화면 — 결과 카드·그룹 형식으로 여는 오늘의 이슈·다른 유형"
```

---

### Task 4: 공유 (공유 버튼·계측·미리보기 이미지·메타데이터)

**Files:**
- Create: `src/features/mbti/components/MbtiShare.tsx`
- Modify: `src/features/mbti/components/MbtiResult.tsx` (공유 영역 끼워 넣기)
- Modify: `src/app/(content)/mbti/[group]/page.tsx` (`generateMetadata`에 OG·트위터 이미지)
- Create: `scripts/mbti-og/template.html`
- Create: `public/mbti/og-nt.png`, `og-nf.png`, `og-st.png`, `og-sf.png`
- Test: `$SMOKE_DIR/task4-smoke.mjs`

**Interfaces:**
- Consumes:
  - Task 1의 `MBTI_GROUP_INFO`, `resultPath`
  - shared: `ArticleShareButtons({ title, url })`(`@/shared/ui/ArticleShareButtons`), `trackEvent`, `SITE_URL`
- Produces: `MbtiShare({ group })`, 이미지 경로 `/mbti/og-{slug}.png`

- [ ] **Step 1: 실패하는 테스트 작성** — `$SMOKE_DIR/task4-smoke.mjs`

"공통 머리말" 다음에 아래 내용을 쓴다.

```js
// 1) 그룹별 og:image 메타와 이미지 파일
for (const g of ['nt', 'nf', 'st', 'sf']) {
  const html = await (await fetch(`${BASE}/mbti/${g}`)).text();
  const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? '';
  assert.ok(og.endsWith(`/mbti/og-${g}.png`), `og:image ${g}: ${og}`);
  const img = await fetch(`${BASE}/mbti/og-${g}.png`);
  assert.equal(img.status, 200, `og-${g}.png`);
  assert.equal(img.headers.get('content-type'), 'image/png');
}

// 2) 공유 버튼 클릭 → mbti_share 이벤트(gtag를 기록기로 바꿔 확인)
const page = await newPage();
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
await page.goto(`${BASE}/mbti/sf`, { waitUntil: 'networkidle' });
await page.evaluate(() => { window.__ev = []; window.gtag = (...a) => window.__ev.push(a); });
await page.getByRole('button', { name: '링크 복사', exact: true }).click();
const ev = await page.evaluate(() => window.__ev);
assert.ok(ev.some((e) => e[0] === 'event' && e[1] === 'mbti_share' && e[2].group === 'SF'), JSON.stringify(ev));
assert.deepEqual(errors, [], errors.join('\n'));

await browser.close();
console.log('task4 smoke ok');
```

- [ ] **Step 2: 실패 확인**

Run: `cd "$SMOKE_DIR" && node task4-smoke.mjs`
Expected: FAIL — `og:image nt:` 뒤가 비어 있거나 기본 `/og-image.png`

- [ ] **Step 3: 공유 영역** — `src/features/mbti/components/MbtiShare.tsx`

```tsx
'use client';

import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { ArticleShareButtons } from '@/shared/ui/ArticleShareButtons';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { SITE_URL } from '@/shared/constants/site';
import { MBTI_GROUP_INFO, resultPath } from '../lib/mbtiCorner';

// 공유 주소는 ?t를 뺀 그룹 주소 — 미리보기 이미지가 그룹 단위라서다.
// 계측은 공용 ArticleShareButtons를 고치지 않고 감싼 영역의 클릭 캡처로 잡는다(버튼 aria-label이 플랫폼 이름).
export function MbtiShare({ group }: { group: MbtiGroupId }) {
  const info = MBTI_GROUP_INFO[group];
  return (
    <div
      onClickCapture={(e) => {
        const label = (e.target as HTMLElement).closest('button')?.getAttribute('aria-label');
        if (label) trackEvent('mbti_share', { group, platform: label });
      }}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 16 }}
    >
      <span style={{ fontSize: 12.5, color: '#94a3b8' }}>내 유형 공유하기</span>
      <ArticleShareButtons title={`나는 ${group}형 — ${info.title} | MBTI로 보는 오늘의 뉴스`} url={`${SITE_URL}${resultPath(group)}`} />
    </div>
  );
}
```

- [ ] **Step 4: 결과 화면에 끼워 넣기** — `src/features/mbti/components/MbtiResult.tsx`

import 줄 `import { MbtiNotice } from './MbtiNotice';` 바로 아래에 추가한다.

```tsx
import { MbtiShare } from './MbtiShare';
```

`<ResultCard group={group} type={type} />` 바로 아래에 추가한다.

```tsx
      <MbtiShare group={group} />
```

- [ ] **Step 5: 메타데이터에 이미지** — `src/app/(content)/mbti/[group]/page.tsx`

`generateMetadata`의 마지막 `return` 한 줄을 다음으로 바꾼다.

```tsx
  const url = `${SITE_URL}/mbti/${groupSlug(group)}`;
  const image = `${SITE_URL}/mbti/og-${groupSlug(group)}.png`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: `${group}형 — ${info.title}` }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
```

- [ ] **Step 6: 이미지 템플릿** — `scripts/mbti-og/template.html`

```html
<!doctype html>
<!--
  MBTI 코너 공유 미리보기(1200×630) 원본 — public/mbti/og-{nt,nf,st,sf}.png를 만든다.
  문구는 src/features/mbti/lib/mbtiCorner.ts의 MBTI_GROUP_INFO, 색은 형식 색(lensPerspectiveAt)과 맞출 것.
  다시 만들기(service/frontend에서, 새 의존성 없이 Chrome 자체 기능으로):
    for g in nt nf st sf; do
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars \
        --window-size=1200,630 --screenshot="public/mbti/og-$g.png" "file://$PWD/scripts/mbti-og/template.html?g=$g"
    done
-->
<html lang="ko">
<head>
<meta charset="utf-8">
<title>MBTI OG</title>
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #ffffff;
    font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; }
  .wrap { box-sizing: border-box; width: 1200px; height: 630px; padding: 64px 88px; display: flex;
    flex-direction: column; justify-content: space-between; border-top: 16px solid var(--c); }
  .kicker { font-size: 30px; font-weight: 700; color: #64748b; }
  .group { font-size: 128px; font-weight: 800; line-height: 1; color: var(--c); margin: 20px 0 12px; }
  .title { font-size: 60px; font-weight: 800; letter-spacing: -0.02em; color: #0f172a; }
  .summary { font-size: 32px; color: #475569; margin-top: 18px; }
  .foot { display: flex; justify-content: space-between; align-items: center; font-size: 28px; color: #64748b; }
  .pill { padding: 10px 24px; border-radius: 999px; background: var(--t); color: var(--c); font-weight: 700; }
</style>
</head>
<body>
<div class="wrap" id="w">
  <div>
    <div class="kicker">MBTI로 보는 오늘의 뉴스</div>
    <div class="group" id="g"></div>
    <div class="title" id="t"></div>
    <div class="summary" id="s"></div>
  </div>
  <div class="foot"><span class="pill" id="f"></span><span>AI LENS · 서울경제</span></div>
</div>
<script>
  const D = {
    nt: { g: 'NT형', t: '구조부터 보는 분석가형', s: '왜 이렇게 됐고 다음엔 뭐가 올지, 흐름을 짚어 봐요', f: '추천 형식 · 레터', c: '#7c3aed', tint: '#f0edf7' },
    nf: { g: 'NF형', t: '의미를 찾는 이야기형', s: '이 뉴스가 사람들에게 어떤 의미인지 이야기로 만나요', f: '추천 형식 · 웹툰', c: '#e11d48', tint: '#fdeeee' },
    sf: { g: 'SF형', t: '사람에 공감하는 대화형', s: '누가 어떻게 겪고 있는지, 대화로 들어요', f: '추천 형식 · 팟캐스트', c: '#059669', tint: '#e6f4ef' },
    st: { g: 'ST형', t: '사실로 보는 실용형', s: '무엇이 얼마나 바뀌었는지, 핵심만 빠르게 봐요', f: '추천 형식 · 영상', c: '#d97706', tint: '#f7f0e3' },
  };
  const d = D[new URLSearchParams(location.search).get('g')] || D.nt;
  const w = document.getElementById('w');
  w.style.setProperty('--c', d.c);
  w.style.setProperty('--t', d.tint);
  for (const k of ['g', 't', 's', 'f']) document.getElementById(k).textContent = d[k];
</script>
</body>
</html>
```

- [ ] **Step 7: 이미지 4장 만들기**

Run (service/frontend에서):

```bash
mkdir -p public/mbti
for g in nt nf st sf; do
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars \
    --window-size=1200,630 --screenshot="public/mbti/og-$g.png" "file://$PWD/scripts/mbti-og/template.html?g=$g"
done
sips -g pixelWidth -g pixelHeight public/mbti/og-*.png
```

Expected: 4개 파일 모두 `pixelWidth: 1200`, `pixelHeight: 630`. 이미지를 열어 글자가 잘리지 않았는지 눈으로 확인한다.

- [ ] **Step 8: 정적 검사**

Run: `npx tsc --noEmit && npx eslint src/features/mbti 'src/app/(content)/mbti'`
Expected: 출력 없이 종료 코드 0

- [ ] **Step 9: 빌드하고 테스트 통과 확인**

서버를 끄고 "공통" 절차로 다시 빌드해 띄운다.

Run: `cd "$SMOKE_DIR" && node task4-smoke.mjs && node task3-smoke.mjs`
Expected: `task4 smoke ok`, `task3 smoke ok`

- [ ] **Step 10: 커밋**

```bash
git add src/features/mbti 'src/app/(content)/mbti/[group]/page.tsx' scripts/mbti-og/template.html public/mbti
git commit -m "feat(frontend): MBTI 결과 공유 — 공유 버튼·mbti_share 계측·그룹별 미리보기 이미지"
```

---

### Task 5: 진입 경로 3곳 + 사이트맵

**Files:**
- Modify: `src/widgets/SiteFooter/SiteFooter.tsx` (`CONTENT_LINKS` 배열, 약 123~129행)
- Modify: `src/app/(content)/games/GamesClient.tsx` (`</header>` 바로 뒤, 약 153행)
- Modify: `src/features/onboarding/components/ResultStep.tsx` (import 블록과 "저장 안 해도…" 문단 뒤)
- Modify: `src/app/sitemap.ts` (`STATIC_ROUTES`의 `/games` 줄 뒤, 약 59행)
- Test: `$SMOKE_DIR/task5-smoke.mjs`

**Interfaces:**
- Consumes: 경로 문자열 `/mbti`뿐이다. 다른 feature 코드는 import하지 않는다.
- Produces: 없음

- [ ] **Step 1: 실패하는 테스트 작성** — `$SMOKE_DIR/task5-smoke.mjs`

"공통 머리말" 다음에 아래 내용을 쓴다.

```js
const page = await newPage();

// 1) 푸터 링크
await page.goto(`${BASE}/lens`, { waitUntil: 'networkidle' });
assert.ok((await page.locator('footer a[href="/mbti"]').count()) >= 1, '푸터 /mbti 링크');

// 2) 게임 페이지 카드
await page.goto(`${BASE}/games`, { waitUntil: 'networkidle' });
await page.locator('main a[href="/mbti"]').first().click();
await page.waitForURL(/\/mbti$/);

// 3) /start 결과 화면 링크 (목적 → 형식 → 체험 → 관심 분야 → 결과)
await page.goto(`${BASE}/start`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /업무 참고/ }).click();
await page.getByRole('button', { name: /팟캐스트/ }).first().click();
await page.getByRole('button', { name: '다 보셨다면' }).click();
await page.getByRole('button', { name: '산업', exact: true }).click();
await page.getByRole('button', { name: /다음/ }).click();
await page.getByRole('link', { name: 'MBTI로도 찾아보기 →' }).click();
await page.waitForURL(/\/mbti$/);

// 4) 사이트맵
const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
for (const p of ['/mbti', '/mbti/nt', '/mbti/nf', '/mbti/st', '/mbti/sf']) {
  assert.ok(xml.includes(`/ailens.sedaily.ai${p}</loc>`), `sitemap ${p}`);
}
assert.deepEqual(errors, [], errors.join('\n'));

await browser.close();
console.log('task5 smoke ok');
```

- [ ] **Step 2: 실패 확인**

Run: `cd "$SMOKE_DIR" && node task5-smoke.mjs`
Expected: FAIL — `푸터 /mbti 링크`

- [ ] **Step 3: 푸터** — `src/widgets/SiteFooter/SiteFooter.tsx`

`CONTENT_LINKS`의 `{ label: '전체 콘텐츠', href: '/lens' },` 바로 아래에 추가한다.

```tsx
  { label: 'MBTI로 보는 뉴스', href: '/mbti' },
```

- [ ] **Step 4: 게임 페이지 카드** — `src/app/(content)/games/GamesClient.tsx`

`</header>`(제목 블록의 끝) 바로 뒤, 게임 격자 `<div style={{ display: 'grid', …` 앞에 추가한다.
`Link`와 `ARCADE_FONT`는 이 파일에 이미 있다.

```tsx
        {/* MBTI 코너 진입 카드(2026-10-05) — 게임 목록과 같은 아케이드 톤. 설계: docs/worklog/2026-10/2026-10-05-mbti-corner-design.md */}
        <Link
          href="/mbti"
          prefetch
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 32,
            padding: '18px 22px',
            borderRadius: 18,
            background: '#0a0a18',
            border: '2px solid #a78bfa55',
            color: '#e2e8f0',
            textDecoration: 'none',
          }}
        >
          <span>
            <span style={{ display: 'block', fontFamily: ARCADE_FONT, fontSize: 11, letterSpacing: '0.2em', color: '#a78bfa', marginBottom: 6 }}>BONUS STAGE</span>
            <span style={{ display: 'block', fontSize: 16, fontWeight: 700 }}>MBTI로 보는 오늘의 뉴스</span>
            <span style={{ display: 'block', fontSize: 13, color: '#94a3b8', marginTop: 4 }}>내 유형에 맞는 형식으로 오늘의 이슈를 골라 드려요</span>
          </span>
          <span aria-hidden style={{ fontFamily: ARCADE_FONT, color: '#a78bfa' }}>▶</span>
        </Link>
```

- [ ] **Step 5: `/start` 결과 화면 링크** — `src/features/onboarding/components/ResultStep.tsx`

import 블록 첫 줄(`import { lensPerspectiveAt, … }`) 위에 추가한다.

```tsx
import Link from 'next/link';
```

`<p style={{ margin: '-6px 0 0', fontSize: 11.5, color: '#94a3b8' }}>저장 안 해도 오늘은 계속 볼 수 있어요</p>` 바로 아래에 추가한다.

```tsx
        {/* MBTI 코너 진입(2026-10-05) — 단순 링크라 features/mbti를 import하지 않는다(feature 간 import 금지). */}
        <Link href="/mbti" style={{ fontSize: 12, color: '#64748b', textDecoration: 'underline', textUnderlineOffset: 3 }}>
          MBTI로도 찾아보기 →
        </Link>
```

- [ ] **Step 6: 사이트맵** — `src/app/sitemap.ts`

`STATIC_ROUTES`의 `{ path: '/games', … },` 줄 바로 아래에 추가한다.

```ts
  { path: '/mbti',         priority: 0.5, changeFrequency: 'weekly',  lastModified: '2026-10-05' }, // MBTI 코너 첫 화면
  { path: '/mbti/nt',      priority: 0.4, changeFrequency: 'daily',   lastModified: '2026-10-05' }, // MBTI 코너 결과 — 오늘의 이슈가 매일 바뀐다
  { path: '/mbti/nf',      priority: 0.4, changeFrequency: 'daily',   lastModified: '2026-10-05' },
  { path: '/mbti/st',      priority: 0.4, changeFrequency: 'daily',   lastModified: '2026-10-05' },
  { path: '/mbti/sf',      priority: 0.4, changeFrequency: 'daily',   lastModified: '2026-10-05' },
```

- [ ] **Step 7: 정적 검사**

Run: `npx tsc --noEmit && npx eslint src/widgets/SiteFooter 'src/app/(content)/games' src/features/onboarding src/app/sitemap.ts`
Expected: 출력 없이 종료 코드 0

- [ ] **Step 8: 빌드하고 테스트 통과 확인**

서버를 끄고 "공통" 절차로 다시 빌드해 띄운다.

Run: `cd "$SMOKE_DIR" && node task5-smoke.mjs`
Expected: `task5 smoke ok`

- [ ] **Step 9: 커밋**

```bash
git add src/widgets/SiteFooter/SiteFooter.tsx 'src/app/(content)/games/GamesClient.tsx' src/features/onboarding/components/ResultStep.tsx src/app/sitemap.ts
git commit -m "feat(frontend): MBTI 코너 진입 경로(푸터·게임·/start 결과) + 사이트맵"
```

---

### Task 6: 최종 검증, 배포 전 조율, 배포, 운영 확인

**Files:**
- Modify: `docs/worklog/2026-10/2026-10-05-mbti-corner-design.md` (맨 아래 "구현·배포 결과" 절 추가)

**Interfaces:**
- Consumes: Task 1~5의 결과와 `$SMOKE_DIR/task2~5-smoke.mjs`
- Produces: 운영 반영, worklog 기록

- [ ] **Step 1: 전체 검사**

Run (service/frontend에서): `npm run test:mbti && npm run test:lens-blocks && npx tsc --noEmit && npm run lint && npm run build`
Expected: 모두 통과. `npm run lint`에 기존 경고가 있으면 이번에 바꾼 파일에서 나온 것이 없는지만 확인한다.

- [ ] **Step 2: 로컬 전체 화면 테스트 + 회귀**

"공통" 절차로 띄운 뒤 실행한다.

Run: `cd "$SMOKE_DIR" && for n in 2 3 4 5; do node task$n-smoke.mjs || exit 1; done`
Expected: `task2~5 smoke ok` 4줄

회귀 확인을 덧붙인다(같은 머리말로 `$SMOKE_DIR/regress-smoke.mjs`를 만든다).

```js
const page = await newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
assert.ok((await page.locator('a[href*="/20"]').count()) > 0, '홈 기사 링크');
const art = await page.locator('a[href*="/2026/"]').first().getAttribute('href');
await page.goto(`${BASE}${art.split('?')[0]}?v=2`, { waitUntil: 'networkidle' });
await page.locator('[role=tab][aria-selected=true]', { hasText: '웹툰' }).waitFor();
await page.goto(`${BASE}/games`, { waitUntil: 'networkidle' });
assert.equal(await page.locator('main a[href^="/games/play/"]').count(), 2, '게임 2개 유지');
assert.deepEqual(errors, [], errors.join('\n'));
await browser.close();
console.log('regress smoke ok');
```

Run: `node regress-smoke.mjs` → Expected: `regress smoke ok`

변경 범위를 확인한다.

Run: `git diff --stat main...HEAD`
Expected: 파일 지도에 있는 파일과 설계·계획 문서만 바뀌었다.

- [ ] **Step 3: 배포 전 조율 (사용자 확인 필수, 여기서 멈춘다)**

운영에 GitHub에 없는 변경이 올라가 있는지 확인한다.

```bash
aws ecs describe-services --region us-east-1 --cluster sedaily-lens-frontend --services sedaily-lens-frontend \
  --query 'services[0].deployments[0].{created:createdAt,td:taskDefinition}' --output text | sed -E 's/[0-9]{12}/<acct>/'
curl -sS https://ailens.sedaily.ai/ | grep -c 'clarity.ms/tag/'
git fetch origin && git log --oneline -3 origin/main
git grep -c -i 'clarity.ms' HEAD -- src || true
```

- `curl` 결과가 1 이상이면서 `git grep`이 아무것도 못 찾으면, 운영에 미커밋 변경이 있는 것이다.
  2026-10-05 08:27 KST 배포(리비전 70)에서 Clarity가 확인됐다.
- 이 상태로 `./deploy.sh`를 돌리면 그 변경이 사라진다.
- **사용자에게 알리고 멈춘다.** 마지막으로 배포한 사람이 변경을 커밋·푸시하면 `git fetch && git rebase origin/main`(또는 해당 브랜치 병합)으로 이 브랜치에 반영한다.
  그다음 Step 1~2를 다시 통과시킨다.
- 루트 CLAUDE.md 규칙대로 옛 체크아웃(`AI-LENS-sedaily-old`)에서 더 최근에 배포한 기록이 없는지도 함께 확인한다.

- [ ] **Step 4: 배포 (Step 3 해소 + 사용자 승인 후)**

Docker Desktop이 켜져 있어야 한다.

Run: `cd service/frontend && ./deploy.sh`
Expected: 4단계 완료, 롤링 배포 안정화

- [ ] **Step 5: 운영 확인**

Run: `cd "$SMOKE_DIR" && for n in 2 3 4 5; do BASE=https://ailens.sedaily.ai node task$n-smoke.mjs || exit 1; done && BASE=https://ailens.sedaily.ai node regress-smoke.mjs`
Expected: 5줄 모두 ok

추가로 확인한다.
- `curl -sS https://ailens.sedaily.ai/ | grep -c 'clarity.ms/tag/'`가 배포 전과 같다(운영 변경 보존).
- GA4 전송 확인: 분석 차단 없이 `/mbti`에서 유형 하나를 누른다. 그리고 `google-analytics.com/g/collect` 요청에 `en=mbti_type_select`가 실리는지 본다.
  헤드리스 스크립트로 `page.on('request')`를 쓰면 된다. 이 1건은 테스트 이벤트로 남는다.

- [ ] **Step 6: worklog**

`docs/worklog/2026-10/2026-10-05-mbti-corner-design.md` 맨 아래에 다음 절을 추가한다.

```markdown
## 구현·배포 결과 (YYYY-MM-DD HH:MM KST)

- 커밋: <Task 1~5 커밋 해시 5개>
- 검증: test:mbti 16개 통과, tsc·lint·build 통과, 로컬·운영 화면 테스트(task2~5, 회귀) 통과
- 배포: ECS sedaily-lens-frontend 리비전 <번호>, 운영 미커밋 변경 반영 방법: <누가·어떤 커밋으로>
- GA4: mbti_type_select 전송 확인
- 다음: 증적서 REQ-001·006에 MBTI 코너 반영, 요구사항정의서 v1.1 개정 근거로 사용
```

꺾쇠 안의 값은 실제 값으로 채운다.

```bash
git add docs/worklog/2026-10/2026-10-05-mbti-corner-design.md
git commit -m "docs(worklog): MBTI 코너 구현·배포 결과"
```

- [ ] **Step 7: 푸시·PR (사용자 확인 후)**

사용자에게 푸시와 PR 생성을 확인받는다. 승인되면 `git push -u origin feat/mbti-corner`를 실행한다.
그다음 `gh pr create --base main`으로 PR을 연다. 본문은 루트 CLAUDE.md의 PR 규칙(왜 / 무엇이 바뀜 / 영향 범위)을 따른다.
