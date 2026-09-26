import type { ReactNode } from 'react';
import type { ChapterBlock } from '../types';

type ChapterBodyProps = {
  blocks: ChapterBlock[];
};

function renderInlineMarkdown(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`strong-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export function ChapterBody({ blocks }: ChapterBodyProps) {
  return (
    <div className="chapter-body">
      {blocks.map((block, index) => {
        if (block.type === 'section-break') {
          return <div className="section-break" key={`break-${index}`} aria-hidden="true"><span>·</span><span>·</span><span>·</span></div>;
        }

        if (block.type === 'epigraph') {
          return (
            <figure className="chapter-epigraph" key={`epigraph-${index}`}>
              <blockquote>{renderInlineMarkdown(block.text)}</blockquote>
              {block.attribution && <figcaption>{block.attribution}</figcaption>}
            </figure>
          );
        }

        return <p key={`paragraph-${index}`}>{renderInlineMarkdown(block.text)}</p>;
      })}
    </div>
  );
}
