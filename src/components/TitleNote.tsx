import { publication } from '../content/publication';

// The website carries the name of the publication project; the novel's own
// title remains unannounced. This note keeps that distinction clear to readers.
export function TitleNote() {
  return (
    <section className="title-note page-width" aria-labelledby="title-note-title">
      <div className="note-mark" aria-hidden="true"><span /><span /><span /></div>
      <div className="title-note-copy">
        <span className="title-note-label" id="title-note-title">{publication.titleNoteLabel}</span>
        <p>
          <em>{publication.title}</em> is the name of this website — the name of the project
          under which this novel belongs. It is not the name of the novel itself. The novel’s
          true name will be revealed in due time.
        </p>
      </div>
    </section>
  );
}
