import { Link } from 'react-router-dom';
import { useAllSyndicates } from '../hooks/useAllSyndicates';

function formatSui(mist: number): string {
    if (mist === 0) return '0';
    return (mist / 1_000_000_000).toFixed(2);
}

function shortenAddr(addr: string): string {
    if (!addr) return '';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

export default function ExplorePage() {
    const { syndicates, isLoading, error, refetch } = useAllSyndicates();

    return (
        <div className="page">

            <section className="hero" style={{ paddingBottom: 16 }}>
                <h1>Explore Syndicates</h1>
                <p className="hero-lead">
                    Discover player organizations on the Frontier.
                    Join a Syndicate to access gates, contribute resources, and earn from shared treasury.
                </p>
            </section>

            <section>
                {isLoading ? (
                    <div className="text-muted" style={{ textAlign: 'center', padding: '40px 0' }}>
                        Scanning Utopia for Syndicates...
                    </div>
                ) : error ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <p className="text-muted">Failed to load syndicates.</p>
                        <button className="btn btn-secondary" onClick={() => refetch()}>
                            Retry
                        </button>
                    </div>
                ) : syndicates.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <p className="text-muted" style={{ marginBottom: 16 }}>
                            No syndicates found yet. Be the first to create one!
                        </p>
                        <Link to="/create" className="btn btn-primary">
                            Create Syndicate →
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="text-muted" style={{ marginBottom: 12, fontSize: 14 }}>
                            {syndicates.length} syndicate{syndicates.length !== 1 ? 's' : ''} found
                        </div>
                        <div className="feature-grid">
                            {syndicates.map(s => (
                                <Link
                                    key={s.syndicateId}
                                    to={`/join/${s.syndicateId}`}
                                    className="feature-card"
                                    style={{ textDecoration: 'none', cursor: 'pointer' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <h3 style={{ margin: 0 }}>🏛️ {s.name}</h3>
                                        <span className={`badge ${s.inviteOnly ? 'badge-warn' : 'badge-ok'}`}>
                                            {s.inviteOnly ? 'Invite Only' : 'Open'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
                                        <span className="text-muted" style={{ fontSize: 13 }}>
                                            👥 {s.memberCount} member{s.memberCount !== 1 ? 's' : ''}
                                        </span>
                                        {s.treasuryBalance > 0 && (
                                            <span className="text-muted" style={{ fontSize: 13 }}>
                                                💰 {formatSui(s.treasuryBalance)} SUI
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
                                        Owner: {shortenAddr(s.owner)}
                                    </p>
                                </Link>
                            ))}
                        </div>
                    </>
                )}
            </section>

        </div>
    );
}
