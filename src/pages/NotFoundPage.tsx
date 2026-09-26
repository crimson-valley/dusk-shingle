import { Link } from '../components/Link';
import { Icon } from '../components/Icon';
import { PublicationFooter } from '../components/PublicationFooter';

export function NotFoundPage() {
  return (
    <main id="main" className="not-found-page">
      <section className="not-found-content" aria-labelledby="not-found-title">
        <p className="chapter-kicker">404 / Not found</p>
        <h1 id="not-found-title">The page has gone quiet.</h1>
        <p>There is no public page at this address.</p>
        <Link className="quiet-button" href="/">Return to the library <Icon name="arrow-right" /></Link>
      </section>
      <PublicationFooter />
    </main>
  );
}
