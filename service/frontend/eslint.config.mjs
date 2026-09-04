import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 서드파티 미니파이 게임 에셋 — 소스코드가 아니라 빌드 산출물이라 린트
    // 대상이 아닌데 여기 없어서 no-unused-expressions 등으로 1400건+ 노이즈
    // 워닝을 찍고 있었다(2026-08-08 발견 — 진짜 이슈 34개 파일이 이 노이즈에
    // 묻혀 안 보였음).
    "public/games/**/*.js",
  ]),
  // FSD Boundaries rules
  {
    plugins: {
      boundaries,
    },
    settings: {
      // 2026-08-08: 이게 없어서 `@/features/...` 같은 tsconfig paths 별칭
      // import를 boundaries 플러그인이 실제 파일 경로로 못 풀어 "미해석"
      // 취급하고 전부 통과시키고 있었다 — 명백한 features↔features lateral
      // import도 0건 검출됐던 근본 원인. eslint-import-resolver-typescript는
      // 이미 devDependency 체인에 존재(eslint-config-next 경유)해 추가 설치
      // 불필요.
      "import/resolver": {
        typescript: {
          project: "./tsconfig.json",
        },
      },
      "boundaries/elements": [
        { type: "app", pattern: "src/app/*" },
        { type: "pages", pattern: "src/pages/*" },
        { type: "widgets", pattern: "src/widgets/*" },
        { type: "features", pattern: "src/features/*" },
        { type: "entities", pattern: "src/entities/*" },
        { type: "shared", pattern: "src/shared/*" },
        // FSD 마이그레이션 잔재 — features/widgets/shared로 이관 중인
        // 레거시 레이어(2026-08-08 등록). "app만 예외적으로 계속 참조 가능,
        // 나머지 레이어는 여기서 못 가져온다"로 좁혀서 점진적으로 비워나간다.
        { type: "components", pattern: "src/components/*" },
      ],
      "boundaries/ignore": ["**/*.test.*", "**/*.spec.*"],
    },
    rules: {
      // "boundaries/element-types"는 eslint-plugin-boundaries@6에서 deprecated
      // (→ "boundaries/dependencies")고, 실측 결과 element-types는 명백한
      // features↔features lateral import 위반도 0건 검출하는 등 사실상 작동을
      // 안 하고 있었다(2026-08-08 발견) — dependencies로 이관. 셀렉터 문법도
      // v6에서 문자열(`allow: ["x"]`)이 아니라 객체(`allow: { to: { type: [...] } }`)
      // 로 바뀌었다 — 처음엔 문자열 그대로 옮겨서 "legacy selector syntax"
      // 경고만 뜨고 실제 검출은 여전히 0건이었음, README 예제로 정정.
      //
      // 2026-09-04 — "warn"이라 위반이 있어도 빌드/배포를 막지 못했다(CI 자체가
      // 없어 warn은 사실상 아무 데도 안 걸림, 리팩토링 감사에서 발견) — "error"로
      // 올려 실제로 강제되게 한다. 올리기 전 유일하게 걸려 있던 위반 1건
      // (features/onboarding/ConsumeStep.tsx가 app 레이어의 LensFormatPanel을
      // import)은 아래 "features → app" 예외로 명시적으로 허용했다 — 그 컴포넌트가
      // widgets/SentenceSelectionPopover에 의존해서 entities/shared로는 못
      // 내려가고(entities는 shared만 import 가능), features → widgets도 규칙상
      // 막혀 있어(widgets는 넓은 조합 레이어라 features가 끌어오면 반대 방향
      // 의존이 생김) 파일을 옮겨도 근본적으로는 같은 예외가 필요했다. 새로운
      // features → app import가 또 생기면 이 예외 때문에 안 걸리므로, 리뷰 시
      // "이것도 LensFormatPanel과 같은 이유인가"를 확인할 것 — 아니라면 이 규칙에
      // 기대지 말고 컴포넌트를 shared/entities로 내리는 쪽으로 고칠 것.
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          rules: [
            // app can import from pages, widgets, features, entities, shared, components(레거시)
            { from: { type: "app" }, allow: { to: { type: ["pages", "widgets", "features", "entities", "shared", "components"] } } },
            // pages can import from widgets, features, entities, shared
            { from: { type: "pages" }, allow: { to: { type: ["widgets", "features", "entities", "shared"] } } },
            // widgets can import from other widgets(Header 같은 전역 chrome을
            // FeedPage/StaticPageShell 등 페이지 단위 widget이 재사용하는 패턴,
            // 2026-08-08), features, entities, shared
            { from: { type: "widgets" }, allow: { to: { type: ["widgets", "features", "entities", "shared"] } } },
            // features can import from entities, shared (다른 features는 금지 — lateral import),
            // app(위 2026-09-04 주석 참조 — 딱 하나의 알려진 예외, 새 사례는 검토 필요)
            { from: { type: "features" }, allow: { to: { type: ["entities", "shared", "app"] } } },
            // entities can import from shared only
            { from: { type: "entities" }, allow: { to: { type: "shared" } } },
            // shared can only import from shared
            { from: { type: "shared" }, allow: { to: { type: "shared" } } },
            // components(레거시)는 shared만 — features/widgets를 끌어오면
            // 안 됨(역방향 의존), app 전용 escape hatch로만 남긴다.
            { from: { type: "components" }, allow: { to: { type: "shared" } } },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
