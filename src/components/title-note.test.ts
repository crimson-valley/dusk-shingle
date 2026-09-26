import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TitleNote } from './TitleNote';
import { PublicationFooter } from './PublicationFooter';
import { publication } from '../content/publication';

describe('publication name note', () => {
  it('explains that the website carries the project name, not the novel’s title', () => {
    const html = renderToString(createElement(TitleNote));

    expect(html).toContain(publication.titleNoteLabel);
    expect(html).toContain(`${publication.title}</em> is the name of this website`);
    expect(html).toContain('the name of the project under which this novel belongs');
    expect(html).toContain('It is not the name of the novel itself.');
    expect(html).toContain('The novel’s true name will be revealed in due time.');
  });

  it('carries a compact version of the note in the public footer', () => {
    const html = renderToString(createElement(PublicationFooter));

    expect(html).toContain(`${publication.title}</em> is the name of the project under which this novel belongs`);
    expect(html).toContain('the novel’s true name will be revealed in due time.');
  });
});
