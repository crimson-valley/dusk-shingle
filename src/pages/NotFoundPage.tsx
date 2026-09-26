import { Link } from '../components/Link';
import { Icon } from '../components/Icon';

export function NotFoundPage() {
  return (
    <main id="main" className="standalone page">
      <p className="meta-label">Not found</p>
      <h1 className="standalone-title">There is nothing at this address.</h1>
      <p className="standalone-text">The page may have moved, or never existed.</p>
      <Link className="btn btn-secondary" href="/"><Icon name="arrow-left" />Return to the library</Link>
    </main>
  );
}
