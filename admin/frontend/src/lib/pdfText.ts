// PDF → 텍스트 추출. 프롬프트 첨부로 PDF 를 받기 위한 유일한 목적의 모듈.
//
// 왜 pdf.js(pdfjs-dist) 를 쓰는가 — 저장소는 zero-new-dependency 정책이지만
// PDF 는 브라우저가 읽을 수 없는 바이너리 포맷이고, 직접 파싱하려면 xref/객체
// 파서 + Flate 해제 + CID 폰트의 ToUnicode CMap 해석까지 필요하다(한글 PDF 는
// Identity-H 인코딩이 대부분이라 CMap 해석이 필수다). 수백 줄에 오작동 위험이
// 큰 영역이라 "100줄 이상 절약되면 의존성 허용" 예외에 해당한다고 판단했다.
//
// 한계 (호출부에서 사용자에게 안내한다):
//   · 스캔 PDF(이미지만 있는 문서)는 텍스트가 0 → OCR 이 필요하고 여기선 못 한다.
//   · 표·다단 레이아웃은 읽는 순서가 흐트러질 수 있다. y 좌표로 줄을 묶고
//     x 좌표로 정렬하지만 원본 구조를 완전히 복원하지는 못한다.
//   · MediaBox 밖으로 나간 텍스트는 pdf.js 가 버린다(정상 동작).
//   · 추출한 "텍스트"만 보관한다. 원본 PDF 는 버린다 — 원본을 그대로 모델에
//     넘기려면 S3 업로드(현재 presign 은 image/audio 만 허용)와 저장 스키마
//     변경이 선행돼야 한다.

/** 원본 PDF 파일 크기 상한. 추출 결과는 이보다 훨씬 작다. */
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** 추출 텍스트 길이 상한.
 *
 *  DDB 아이템 한계가 400KB 이고, 첨부 본문은 content(산문)와 sections_json(구조)
 *  **양쪽에** 들어가므로 한 글자가 두 번 저장된다. 게다가 한글은 UTF-8 에서
 *  3바이트다 — 4만 자면 최악의 경우 4만×3×2 = 240KB 로, 백엔드 상한(340KB)
 *  안에서 본문까지 담을 여유가 남는다. */
export const MAX_EXTRACTED_CHARS = 40_000;

export interface PdfExtraction {
  text: string;
  pages: number;
  /** MAX_EXTRACTED_CHARS 에 걸려 뒷부분이 잘렸는지. */
  truncated: boolean;
}

export class PdfExtractError extends Error {}

/* 같은 줄로 볼 y 좌표 허용 오차(pt). 본문 글자 크기보다 작게 잡아야
   윗줄·아랫줄이 한 줄로 뭉치지 않는다. */
const LINE_TOLERANCE = 2;

/* 같은 줄에서 이 정도(pt) 이상 벌어지면 공백을 넣는다. PDF 는 단어 사이
   공백을 문자로 안 넣고 좌표만 띄우는 경우가 많다. */
const WORD_GAP = 1;

const PAGE_SEPARATOR = "\n\n";

interface TextLike {
  str: string;
  transform: number[];
  width?: number;
}

// pdf.js 의 items 는 TextItem | TextMarkedContent 섞임 — 타입을 깊은 경로에서
// import 하지 않고 duck typing 으로 좁힌다(버전 간 경로 변경에 안 흔들린다).
function isTextLike(v: unknown): v is TextLike {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as TextLike).str === "string" &&
    Array.isArray((v as TextLike).transform)
  );
}

/* 워커는 한 번 만들어 재사용한다. workerPort 로 넘긴 워커는 pdf.js 가
   teardown 때 종료하지 않으므로(외부 소유) 다음 추출에 그대로 쓴다.
   1.2MB 스크립트를 PDF 마다 다시 파싱하지 않으려는 것. */
let workerPort: Worker | null = null;

async function loadPdfjs() {
  // 동적 import — pdf.js 를 메인 번들에서 떼어내 PDF 를 실제로 첨부할 때만 받는다.
  const pdfjs = await import("pdfjs-dist");

  // Worker 가 없는 환경(Node — 추출 로직 검증용)에서는 pdf.js 자체 폴백에 맡긴다.
  if (typeof Worker === "undefined") return pdfjs;

  if (!workerPort) {
    workerPort = new Worker(
      new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
      { type: "module" }
    );
  }
  pdfjs.GlobalWorkerOptions.workerPort = workerPort;
  return pdfjs;
}

/** 한 페이지의 텍스트를 읽는 순서에 가깝게 재조립한다. */
export function assemblePage(items: unknown[]): string {
  const lines: Array<{ y: number; runs: TextLike[] }> = [];

  for (const item of items) {
    if (!isTextLike(item) || item.str === "") continue;
    const y = item.transform[5];
    let line = lines.find((l) => Math.abs(l.y - y) <= LINE_TOLERANCE);
    if (!line) {
      line = { y, runs: [] };
      lines.push(line);
    }
    line.runs.push(item);
  }

  // PDF 좌표계는 y 가 아래에서 위로 증가한다 → 내림차순이 위에서 아래.
  lines.sort((a, b) => b.y - a.y);

  return lines
    .map((line) => {
      const runs = [...line.runs].sort((a, b) => a.transform[4] - b.transform[4]);
      let text = "";
      let prevEnd: number | null = null;
      for (const run of runs) {
        const x = run.transform[4];
        if (prevEnd !== null && x - prevEnd > WORD_GAP && !text.endsWith(" ")) {
          text += " ";
        }
        text += run.str;
        prevEnd = x + (run.width ?? 0);
      }
      return text.trim();
    })
    .filter((line) => line !== "")
    .join("\n");
}

export async function extractPdfText(file: File): Promise<PdfExtraction> {
  if (file.size === 0) throw new PdfExtractError("빈 파일입니다");
  if (file.size > MAX_PDF_BYTES) {
    throw new PdfExtractError(
      `PDF 가 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB, 최대 ${
        MAX_PDF_BYTES / 1024 / 1024
      }MB)`
    );
  }

  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());

  // cMapUrl·standardFontDataUrl 을 주지 않는다 — 정적 배포라 별도 에셋을 두고
  // 싶지 않다. 내장 처리로 안 되는 희귀 인코딩은 글자가 빠질 수 있지만,
  // 일반적인 한글 PDF(Identity-H + ToUnicode)는 그대로 읽힌다.
  const task = pdfjs.getDocument({ data });

  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    await task.destroy();
    const name = (err as { name?: string }).name;
    if (name === "PasswordException") {
      throw new PdfExtractError("암호가 걸린 PDF 는 읽을 수 없습니다");
    }
    throw new PdfExtractError(
      `PDF 를 열지 못했습니다 (${(err as Error).message || "손상된 파일"})`
    );
  }

  try {
    const pages = doc.numPages;
    const chunks: string[] = [];
    let length = 0;
    let truncated = false;

    for (let n = 1; n <= pages; n += 1) {
      const page = await doc.getPage(n);
      let text: string;
      try {
        const content = await page.getTextContent();
        text = assemblePage(content.items);
      } finally {
        page.cleanup();
      }
      if (text === "") continue;

      const block = pages > 1 ? `[p.${n}]\n${text}` : text;
      // 쪽 사이 구분자도 길이에 포함해야 한다 — 빼먹으면 쪽수가 많을 때
      // 결과가 상한을 (쪽수 × 2)만큼 넘는다.
      const gap = chunks.length > 0 ? PAGE_SEPARATOR.length : 0;

      if (length + gap + block.length > MAX_EXTRACTED_CHARS) {
        const room = MAX_EXTRACTED_CHARS - length - gap;
        if (room > 0) chunks.push(block.slice(0, room));
        truncated = true;
        break;
      }
      chunks.push(block);
      length += gap + block.length;
    }

    const text = chunks.join(PAGE_SEPARATOR).trim();
    if (text === "") {
      throw new PdfExtractError(
        "텍스트를 찾지 못했습니다 — 스캔한 이미지 PDF 로 보입니다 (OCR 이 필요합니다)"
      );
    }

    return { text, pages, truncated };
  } finally {
    // v6 에서 teardown 은 문서가 아니라 loading task 쪽이다
    // (PDFDocumentProxy 에는 destroy 가 없고 cleanup 만 있다).
    await doc.cleanup();
    await task.destroy();
  }
}
