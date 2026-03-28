import { Link } from 'react-router-dom';
import { useConnection } from '@evefrontier/dapp-kit';
import { useOwnedSyndicates } from '../hooks/useOwnedSyndicates';

export default function HomePage() {
    const { currentAccount: account } = useConnection();
    const { data: syndicates, isLoading: syndicatesLoading } = useOwnedSyndicates(account?.address);

    return (
        <div className="page">

            {/* Hero */}
            <section className="hero">
                <div className="hero-badge">
                    ⚡ EVE Frontier Hackathon 2026
                </div>
                <h1>
                    Onchain Organizations<br />
                    for the <span>Frontier</span>
                </h1>
                <p className="hero-lead">
                    Open Borders Protocol gives tribes real power. Create a Syndicate,
                    control gate access, pool treasury — all enforced by Move on Sui.
                    No Discord agreements. No trust required.
                </p>
                <div className="hero-actions">
                    <Link to="/create" className="btn btn-primary">
                        Create Syndicate →
                    </Link>
                    <a
                        href="https://github.com/aria-trading-system/eve-frontier-hackaton-2026"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary"
                    >
                        View on GitHub
                    </a>
                </div>
            </section>

            {/* How it works */}
            <section>
                <div className="section-title">How it works</div>
                <div className="steps">
                    <div className="step">
                        <div className="step-num">1</div>
                        <div className="step-title">Create Syndicate</div>
                        <div className="step-desc">
                            Deploy an onchain organization. Invite members, assign officers, set public or invite-only access.
                        </div>
                    </div>
                    <div className="step">
                        <div className="step-num">2</div>
                        <div className="step-title">Configure Gate</div>
                        <div className="step-desc">
                            Attach OBP to your stargate. Choose: Members Only, Toll Gate, Members Free, or Blacklist.
                        </div>
                    </div>
                    <div className="step">
                        <div className="step-num">3</div>
                        <div className="step-title">Players Jump</div>
                        <div className="step-desc">
                            Members transit freely. Tolls flow to Syndicate treasury. Non-members get blocked or pay.
                        </div>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section>
                <div className="section-title">What you get</div>
                <div className="feature-grid">
                    <div className="feature-card">
                        <h3>🏛️ Syndicates</h3>
                        <p>Onchain player organizations with membership roles, governance, and trustless enforcement.</p>
                    </div>
                    <div className="feature-card">
                        <h3>🚪 Gate Control</h3>
                        <p>Four access modes for your stargates: members only, toll gate, members free, blacklist.</p>
                    </div>
                    <div className="feature-card">
                        <h3>💰 Treasury</h3>
                        <p>Pool SUI funds with your tribe. Toll fees flow automatically to the Syndicate treasury.</p>
                    </div>
                    <div className="feature-card">
                        <h3>⛓️ Fully Onchain</h3>
                        <p>Move on Sui. No servers, no database, no admin keys. Lives forever on the blockchain.</p>
                    </div>
                </div>
            </section>


            {/* Your Syndicates */}
            {account && (
                <section>
                    <div className="section-title">Your Syndicates</div>
                    {syndicatesLoading ? (
                        <div className="text-muted" style={{ textAlign: 'center', padding: '20px 0' }}>
                            Loading from Utopia...
                        </div>
                    ) : syndicates && syndicates.length > 0 ? (
                        <div className="feature-grid">
                            {syndicates.map(s => (
                                <Link
                                    key={s.syndicateId}
                                    to={`/syndicate/${s.syndicateId}`}
                                    state={{ ownerCapId: s.ownerCapId }}
                                    className="feature-card"
                                    style={{ textDecoration: 'none', cursor: 'pointer' }}
                                >
                                    <h3>🏛️ {s.name}</h3>
                                    <p style={{ marginBottom: 8 }}>
                                        {s.member_count} member{s.member_count !== 1 ? 's' : ''} ·{' '}
                                        <span style={{ color: s.invite_only ? 'var(--warning, #f59e0b)' : 'var(--success, #22c55e)' }}>
                                            {s.invite_only ? '🔒 Invite Only' : '🌐 Public'}
                                        </span>
                                    </p>
                                    <span className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>
                                        View →
                                    </span>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <p className="text-muted">No syndicates yet.</p>
                            <Link to="/create" className="btn btn-primary" style={{ marginTop: 12 }}>
                                Create your first Syndicate →
                            </Link>
                        </div>
                    )}
                </section>
            )}

        </div>
    );
}
