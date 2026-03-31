import { useParams, Link } from 'react-router-dom';
import { useConnection } from '@evefrontier/dapp-kit';
import { useSyndicate } from '../hooks/useSyndicate';
import { useSyndicateActions } from '../hooks/useSyndicateActions';
import { useCharacter } from '../hooks/useCharacter';
import { useState } from 'react';

function formatSUI(mist: number) {
    return (mist / 1_000_000_000).toFixed(3);
}

function formatAddress(addr: string) {
    if (!addr || addr.length < 18) return addr;
    return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
}

export default function JoinPage() {
    const { id } = useParams();
    const syndicateId = id || '';
    const { currentAccount: account } = useConnection();
    const { syndicate, members, isLoading, error } = useSyndicate(syndicateId);
    const { joinSyndicate, isPending: joinPending, error: joinError } = useSyndicateActions(syndicateId, '');
    const { characterObjectId, isLoading: characterLoading } = useCharacter(account?.address);
    const [joinSuccess, setJoinSuccess] = useState(false);
    const [copied, setCopied] = useState(false);

    const isMember = account ? members.some(m => m.address === account.address) : false;
    const ownerAddress = members.find(m => m.role === 2)?.address || '';

    if (isLoading) {
        return (
            <div className="page">
                <div className="page-header"><Link to="/" className="back-link">← Home</Link></div>
                <div className="empty-state" style={{ padding: 60 }}>Loading syndicate...</div>
            </div>
        );
    }

    if (error || !syndicate) {
        return (
            <div className="page">
                <div className="page-header"><Link to="/" className="back-link">← Home</Link></div>
                <div className="empty-state" style={{ padding: 60 }}>
                    <div>Syndicate not found</div>
                    <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>
                        {error ? String(error) : 'Check the link and try again'}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page">

            <div className="page-header">
                <Link to="/" className="back-link">← Home</Link>
            </div>

            <div className="join-layout">

                {/* Syndicate card */}
                <div className="card join-card">

                    {/* Header */}
                    <div className="join-hero">
                        <div className="join-logo">⚡</div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <h1 className="page-title">{syndicate.name}</h1>
                                <span className={`badge ${syndicate.invite_only ? 'badge-private' : 'badge-public'}`}>
                                    {syndicate.invite_only ? '🔒 Invite Only' : '🌐 Public'}
                                </span>
                            </div>
                            <div className="address" style={{ marginTop: 6 }}>
                                {syndicateId}
                            </div>
                        </div>
                    </div>

                    <div className="divider" />

                    {/* Stats */}
                    <div className="stats-row" style={{ padding: '20px 0' }}>
                        <div className="stat">
                            <span className="stat-value">{syndicate.member_count}</span>
                            <span className="stat-label">Members</span>
                        </div>
                        <div className="stat">
                            <span className="stat-value">{formatSUI(syndicate.treasury)}</span>
                            <span className="stat-label">SUI Treasury</span>
                        </div>
                    </div>

                    <div className="divider" />

                    {/* Owner */}
                    {ownerAddress && (
                        <>
                            <div className="policy-row" style={{ padding: '16px 0' }}>
                                <span className="policy-label">Owner</span>
                                <span className="address">{formatAddress(ownerAddress)}</span>
                            </div>
                            <div className="divider" />
                        </>
                    )}

                    {/* Join action */}
                    <div className="join-action">
                        {!account ? (
                            <>
                                <p className="join-action-desc">
                                    Connect your wallet to join this Syndicate.
                                </p>
                                <div className="notice notice-info">
                                    <span>💡</span>
                                    <span>Use the Connect Wallet button in the top right corner</span>
                                </div>
                            </>
                        ) : joinSuccess ? (
                            <>
                                <div className="notice notice-info" style={{ background: 'var(--success-dim)', borderColor: 'rgba(34,197,94,0.2)' }}>
                                    <span>✅</span>
                                    <span>Welcome! You are now a member of {syndicate.name}</span>
                                </div>
                                <Link to={`/syndicate/${syndicateId}`} className="btn btn-primary" style={{ marginTop: 12 }}>
                                    Go to Dashboard →
                                </Link>
                            </>
                        ) : isMember ? (
                            <>
                                <div className="notice notice-info" style={{ background: 'var(--success-dim)', borderColor: 'rgba(34,197,94,0.2)' }}>
                                    <span>✅</span>
                                    <span>You are already a member of this Syndicate</span>
                                </div>
                                <Link to={`/syndicate/${syndicateId}`} className="btn btn-primary" style={{ marginTop: 12 }}>
                                    Go to Dashboard →
                                </Link>
                            </>
                        ) : syndicate.invite_only ? (
                            <>
                                <div className="notice notice-warning">
                                    <span>🔒</span>
                                    <span>
                                        This Syndicate is invite-only. Contact the owner to request an invitation.
                                    </span>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="join-action-desc">
                                    This is a public Syndicate. Anyone can join and gain access to member-gated stargates.
                                </p>
                                <button
                                    className="btn btn-primary"
                                    style={{ width: '100%', justifyContent: 'center', padding: '14px' }}
                                    disabled={joinPending || !characterObjectId}
                                    onClick={async () => {
                                        if (!characterObjectId) return;
                                        const res = await joinSyndicate(characterObjectId);
                                        if (res) setJoinSuccess(true);
                                    }}
                                >
                                    {joinPending ? 'Joining...' : !characterObjectId && !characterLoading ? 'No Character Found' : 'Join Syndicate →'}
                                </button>
                                {joinError && (
                                    <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 8 }}>{joinError}</div>
                                )}
                                <div className="notice notice-info" style={{ marginTop: 12 }}>
                                    <span>🔗</span>
                                    <span>Transaction will be signed by your connected EVE Vault wallet.</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Info panel */}
                <div className="info-panel">
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">What membership gives you</span>
                        </div>
                        <div className="info-list">
                            <div className="info-item">
                                <span className="info-icon">🚪</span>
                                <div>
                                    <div className="info-item-title">Gate Access</div>
                                    <div className="info-item-desc">
                                        Pass through member-gated stargates without paying toll
                                    </div>
                                </div>
                            </div>
                            <div className="info-item">
                                <span className="info-icon">🤝</span>
                                <div>
                                    <div className="info-item-title">Alliance Network</div>
                                    <div className="info-item-desc">
                                        Access routes shared across all Syndicate-controlled gates
                                    </div>
                                </div>
                            </div>
                            <div className="info-item">
                                <span className="info-icon">⛓️</span>
                                <div>
                                    <div className="info-item-title">Onchain Membership</div>
                                    <div className="info-item-desc">
                                        Your membership is stored on Sui — no centralized server can revoke it
                                    </div>
                                </div>
                            </div>
                            <div className="info-item">
                                <span className="info-icon">💰</span>
                                <div>
                                    <div className="info-item-title">Contribution Economy</div>
                                    <div className="info-item-desc">
                                        Your contributions are tracked onchain — treasury distributes proportionally
                                    </div>
                                </div>
                            </div>
                            <div className="info-item">
                                <span className="info-icon">🚀</span>
                                <div>
                                    <div className="info-item-title">Leave Anytime</div>
                                    <div className="info-item-desc">
                                        You can leave the Syndicate at any time with a single transaction
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Share */}
                    <div className="card" style={{ marginTop: 16 }}>
                        <div className="card-header">
                            <span className="card-title">Share this link</span>
                        </div>
                        <div className="form">
                            <div className="input" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', wordBreak: 'break-all', overflow: 'hidden' }}>
                                {window.location.href}
                            </div>
                            <button
                                className="btn btn-secondary"
                                onClick={() => {
                                    navigator.clipboard.writeText(window.location.href);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                }}
                            >
                                {copied ? '✅ Copied' : 'Copy Link'}
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
