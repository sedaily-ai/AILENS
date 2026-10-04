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
    // 서드파티 미니파이 게임 에셋은 소스코드가 아니라 빌드 산출물이므로 린트 대상에서 제외한다(no-unused-expressions 등 대량 노이즈 방지).
    "public/games/**/*.js",
  ]),
  // FSD Boundaries rules
  {
    plugins: {
      boundaries,
    },
    settings: {
      // tsconfig paths 별칭(`@/features/...`) import를 boundaries 플러그인이 실제 파일 경로로 풀도록 resolver를 지정한다.
      // 없으면 별칭 import가 "미해석"으로 취급되어 위반이 검출되지 않는다. eslint-import-resolver-typescript는 devDependency 체인(eslint-config-next 경유)에 이미 있어 추가 설치가 필요 없다.
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
        // FSD 마이그레이션 잔재: features/widgets/shared로 이관 중인 레거시 레이어. "app만 예외적으로 계속 참조 가능, 나머지 레이어는 여기서 가져올 수 없다"로 좁혀 점진적으로 비운다.
        { type: "components", pattern: "src/components/*" },
      ],
      "boundaries/ignore": ["**/*.test.*", "**/*.spec.*"],
    },
    rules: {
      // "boundaries/element-types"는 eslint-plugin-boundaries@6에서 deprecated(→ "boundaries/dependencies")이고 features↔features lateral import 위반도 검출하지 못하므로 dependencies를 쓴다.
      // 셀렉터 문법은 v6에서 문자열(`allow: ["x"]`)이 아니라 객체(`allow: { to: { type: [...] } }`)다(문자열을 쓰면 "legacy selector syntax" 경고만 뜨고 검출되지 않는다).
      // 심각도는 "error"다. CI가 없어 "warn"으로는 위반이 빌드/배포를 막지 못한다.
      // 아래 "features → app" 예외는 features/onboarding/ConsumeStep.tsx가 app 레이어의 LensFormatPanel을 import하는 유일한 알려진 위반을 허용한다.
      // 그 컴포넌트는 widgets/SentenceSelectionPopover에 의존해 entities/shared로 내릴 수 없고, features → widgets도 규칙상 막혀 있어(widgets는 넓은 조합 레이어라 역방향 의존이 생긴다) 파일을 옮겨도 같은 예외가 필요하다.
      // 새로운 features → app import는 이 예외 때문에 검출되지 않으므로, 리뷰 시 LensFormatPanel과 같은 이유인지 확인하고 아니라면 컴포넌트를 shared/entities로 내릴 것.
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          rules: [
            // app can import from pages, widgets, features, entities, shared, components(레거시)
            { from: { type: "app" }, allow: { to: { type: ["pages", "widgets", "features", "entities", "shared", "components"] } } },
            // pages can import from widgets, features, entities, shared
            { from: { type: "pages" }, allow: { to: { type: ["widgets", "features", "entities", "shared"] } } },
            // widgets can import from other widgets(Header 같은 전역 chrome을 FeedPage/StaticPageShell 등 페이지 단위 widget이 재사용), features, entities, shared
            { from: { type: "widgets" }, allow: { to: { type: ["widgets", "features", "entities", "shared"] } } },
            // features can import from entities, shared (다른 features는 금지 — lateral import),
            // app(위 "features → app" 예외 참조. 알려진 예외 하나뿐이며 새 사례는 검토 필요)
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
