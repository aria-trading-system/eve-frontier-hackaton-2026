import { useState } from 'react';
import { useConnection } from '@evefrontier/dapp-kit';
import { Link } from 'react-router-dom';
import { useCreateSyndicate } from '../hooks/useCreateSyndicate';
import type { CreateSyndicateResult } from '../hooks/useCreateSyndicate';

export default function CreateSyndicatePage() {
    const { currentAccount: account } = useConnection();
    const [name, setName] = useState('');
    const [inviteOnly, setInviteOnly] = useState(false);
    const [successData, setSuccessData] = useState<{
        name: string;
        result: CreateSyndicateResult;
    } | null>(null);
    const { createSyndicate, isPending, error } = useCreateSyndicate();

    // No wallet connected
    if (!account) {
        return (
            <div className="page">
                <div className="connect-prompt">
                    <div className="connect-prompt-icon">⚡</div>
                    <h2>Connect Your Wallet</h2>
                    <p>You need a Sui wallet to create a Syndicate on the Frontier.</p>
                    <p className="text-muted">Use the Connect Wallet button in the top right.</p>
                </div>
            </div>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = name.trim();
        const res = await createSyndicate({ name: trimmedName, inviteOnly });
        if (res) {
            setSuccessData({ name: trimmedName, result: res });
        }
    };

    // Success state
    if (successData) {
        const { result } = successData;
        const short = result.digest.length > 16
            ? result.digest.slice(0, 8) + '...' + result.digest.slice(-8)
            : result.digest;
        return (
            <div className="page">
                <div className="page-header">
                    <Link to="/" className="back-link">← Back</Link>
                </div>
                <div className="connect-prompt">
                    <div className="connect-prompt-icon">✅</div>
                    <h2>Syndicate Deployed!</h2>
                    <p>
                        <strong style={{ color: 'var(--text-primary)' }}>{successData.name}</strong> is
                        now live on the Frontier.
                    </p>
                    <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                        TX: <span style={{ fontFamily: 'monospace' }}>{short}</span>
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                        {result.syndicateId ? (
                            <Link
                                to={`/syndicate/${result.syndicateId}`}
                                state={{
                                    ownerCapId: result.ownerCapId,
                                    contributionRecordId: result.contributionRecordId,
                                }}
                                className="btn btn-primary"
                            >
                                View Syndicate →
                            </Link>
                        ) : (
                            <Link to="/" className="btn btn-primary">← Home</Link>
                        )}
                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                setSuccessData(null);
                                setName('');
                                setInviteOnly(false);
                            }}
                        >
                            Create Another
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page">

            {/* Header */}
            <div className="page-header">
                <Link to="/" className="back-link">← Back</Link>
                <div>
                    <h1 className="page-title">Create Syndicate</h1>
                    <p className="page-subtitle">
                        Deploy an onchain organization on the Frontier.
                        You'll receive an Owner Cap to manage membership and gates.
                    </p>
                </div>
            </div>

            <div className="create-layout">

                {/* Form */}
                <div className="card">
                    <form className="form" onSubmit={handleSubmit}>

                        {/* Name */}
                        <div className="form-group">
                            <label className="form-label">Syndicate Name</label>
                            <input
                                className="input"
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="e.g. Void Runners"
                                maxLength={64}
                                autoFocus
                            />
                            <span className="form-hint">
                                {name.length}/64 characters — visible to all players
                            </span>
                        </div>

                        {/* Invite Only toggle */}
                        <div className="form-group">
                            <label className="form-label">Access Policy</label>
                            <div className="toggle-row">
                                <div className="toggle-info">
                                    <span className="toggle-label">Invite Only</span>
                                    <span className="toggle-desc">
                                        {inviteOnly
                                            ? 'Members must be invited by owner or officer'
                                            : 'Anyone can join without an invitation'}
                                    </span>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={inviteOnly}
                                        onChange={e => setInviteOnly(e.target.checked)}
                                    />
                                    <span className="toggle-slider" />
                                </label>
                            </div>
                        </div>

                        {/* Creator info */}
                        <div className="form-group">
                            <label className="form-label">Owner</label>
                            <div className="owner-display">
                                <span className="address">{account.address}</span>
                                <span className="badge badge-owner">You</span>
                            </div>
                        </div>

                        {/* Submit */}
                        <div className="form-actions">
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={!name.trim() || isPending}
                            >
                                {isPending ? 'Deploying...' : 'Deploy Syndicate →'}
                            </button>
                            <span className="form-hint">
                                Transaction will be submitted to your wallet for signing
                            </span>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="notice notice-info" style={{ borderColor: '#f55', color: '#f88' }}>
                                <span>⚠️</span>
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="notice notice-info">
                            <span>🔗</span>
                            <span>
                                Transaction will be signed by your connected EVE Vault wallet.
                            </span>
                        </div>

                    </form>
                </div>

                {/* Info panel */}
                <div className="info-panel">
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">What you'll get</span>
                        </div>
                        <div className="info-list">
                            <div className="info-item">
                                <span className="info-icon">🏛️</span>
                                <div>
                                    <div className="info-item-title">Syndicate Object</div>
                                    <div className="info-item-desc">A shared onchain object — your organization lives here forever</div>
                                </div>
                            </div>
                            <div className="info-item">
                                <span className="info-icon">🔑</span>
                                <div>
                                    <div className="info-item-title">Owner Cap</div>
                                    <div className="info-item-desc">NFT that proves you own this Syndicate — keep it safe</div>
                                </div>
                            </div>
                            <div className="info-item">
                                <span className="info-icon">🚪</span>
                                <div>
                                    <div className="info-item-title">Gate Control</div>
                                    <div className="info-item-desc">Attach OBP to any stargate you own — configure access policies</div>
                                </div>
                            </div>
                            <div className="info-item">
                                <span className="info-icon">💰</span>
                                <div>
                                    <div className="info-item-title">Treasury</div>
                                    <div className="info-item-desc">Toll fees flow directly to your Syndicate — withdraw anytime</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
