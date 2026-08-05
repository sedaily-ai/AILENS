import type { FrontPageBlock } from '../api/frontPageApi';

interface Props {
  blocks: FrontPageBlock[];
  /** blocks 가 비었을 때 대신 렌더할 순수 텍스트 (content_ko) */
  fallbackText: string;
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i} className="text-[15px] leading-7 text-neutral-800">
            {p}
          </p>
        ))}
    </>
  );
}

export function ArticleBlocks({ blocks, fallbackText }: Props) {
  if (!blocks.length) {
    return (
      <div className="space-y-4">
        <Paragraphs text={fallbackText} />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        if (block.type === 'image' && block.url) {
          return (
            <figure key={i}>
              {/* 정적 export + 외부 이미지(wimg.sedaily.com) → next/image 대신 원본 사용 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={block.url}
                alt={block.alt || block.caption || ''}
                className="w-full rounded-lg"
                loading="lazy"
              />
              {block.caption && (
                <figcaption className="mt-2 text-xs text-neutral-500">
                  {block.caption}
                </figcaption>
              )}
            </figure>
          );
        }
        if (block.type === 'text' && block.text_ko) {
          return (
            <div key={i} className="space-y-4">
              <Paragraphs text={block.text_ko} />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
