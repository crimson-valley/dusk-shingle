import type { ChapterBlock } from '../types';

type ChapterBodyProps = {
  blocks: ChapterBlock[];
};

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
              <blockquote>{block.text}</blockquote>
              {block.attribution && <figcaption>{block.attribution}</figcaption>}
            </figure>
          );
        }

        return <p key={`paragraph-${index}`}>{block.text}</p>;
      })}
    </div>
  );
}
