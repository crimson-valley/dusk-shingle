import type { ReactNode } from 'react';
import type { ChapterBlock } from '../types';

/** Author-controlled prose: supports **strong** only, rendered as React nodes. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part,
  );
}

export function ChapterBody({ blocks }: { blocks: ChapterBlock[] }) {
  return (
    <div className="prose">
      {blocks.map((block, index) => {
        if (block.type === 'section-break') return <hr className="section-break" key={index} />;
        if (block.type === 'epigraph') {
          return (
            <figure className="epigraph" key={index}>
              <blockquote>{renderInline(block.text)}</blockquote>
              {block.attribution && <figcaption>{block.attribution}</figcaption>}
            </figure>
          );
        }
        const machine = isMachineLine(block.text);
        return <p key={index} data-machine={machine || undefined}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}

/**
 * A paragraph that is nothing but an instrument reading — the pumping station's
 * own alarm text — is the system's voice, not the narrator's. Marking it lets
 * the page set it apart from the prose without touching a word of the novel.
 */
function isMachineLine(text: string): boolean {
  return /^\*\*[^*]+\*\*$/.test(text.trim());
}
