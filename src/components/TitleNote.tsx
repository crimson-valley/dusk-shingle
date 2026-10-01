import { publication } from '../content/publication';

// The website carries the name of the publication project; the novel's own
// title remains unannounced. This note keeps that distinction clear to readers.
export function TitleNote() {
  return (
    <aside className="title-note page" aria-labelledby="title-note-title">
      <p className="meta-label" id="title-note-title">{publication.titleNoteLabel}</p>
      <p>
        {/* <cite> is the correct element for a work's title; set roman rather
            than italic, since no italic cut is loaded. */}
        <cite>{publication.title}</cite> is the name of this website — the name of the project
        under which this novel belongs. It is not the name of the novel itself. The novel’s
        true name will be revealed in due time.
      </p>
    </aside>
  );
}
