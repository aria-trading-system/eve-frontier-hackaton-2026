import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import {
    MODE_LABELS, MODE_MEMBERS_ONLY, MODE_TOLL_GATE, MODE_MEMBERS_FREE, MODE_BLACKLIST,
    GATE_OBJECT_ID_1, GATE_OBJECT_ID_2, GATE_OWNER_CAP_1, SYNDICATE_ID,
} from '../lib/constants';
import { useGatePolicy } from '../hooks/useGatePolicy';
import { useConfigureGate } from '../hooks/useConfigureGate';
import { useJumpHistory } from '../hooks/useJumpHistory';

function formatSUI(mist: number) {
    return (mist / 1_000_000_000).toFixed(3);
}

function formatAddr(addr: string) {
    if (!addr || addr.length < 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(ts: number) {
    if (!ts) return '—';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

const MODE_BADGE: Record<number, string> = {
    0: 'badge-members',
    1: 'badge-toll',
    2: 'badge-free',
    3: 'badge-blacklist',
};

export default function GatePage() {
    const { id } = useParams();
    const [searchParams] = useSearchParams();

    // Resolve gate object ID: URL param > query param > fallback
    const itemId = searchParams.get('itemId');
    const gateObjectId = id || GATE_OBJECT_ID_1;

    // Hooks — real data from Utopia
    const { policy, isLoading: policyLoading, refetch: refetchPolicy } = useGatePolicy(gateObjectId);
    const { jumps, isLoading: historyLoading } = useJumpHistory(gateObjectId);
    const { configureGate, isLoading: configuring, error: configError } = useConfigureGate();

    // Form state — prefill from current policy if available
    const [mode, setMode] = useState(policy?.mode ?? MODE_MEMBERS_FREE);
    const [tollFee, setTollFee] = useState('0.5');
    const [syndicateId, setSyndicateId] = useState(policy?.syndicateId || SYNDICATE_ID);
    const [configSuccess, setConfigSuccess] = useState(false);

    // Derived
    const showToll = mode === MODE_TOLL_GATE || mode === MODE_MEMBERS_FREE;
    const showBlacklist = mode === MODE_BLACKLIST;

    // Handler: Apply Policy
    const handleApplyPolicy = async () => {
        setConfigSuccess(false);
        try {
            // For demo: characterObjectId comes from EVE Vault connection
            // In production: resolve from useSmartObject or URL params
            const characterObjectId = searchParams.get('characterId') || '';

            await configureGate({
                gateObjectId,
                gateOwnerCapId: GATE_OWNER_CAP_1,
                characterObjectId,
                syndicateId,
                mode,
                tollMist: Math.round(parseFloat(tollFee) * 1_000_000_000),
                expiryMs: 3_600_000, // 1 hour default
            });
            setConfigSuccess(true);
            refetchPolicy();
        } catch (err) {
            console.error('Configure gate failed:', err);
        }
    };

    return (
        <div className="page">

            {/* Header */}
            <div className="page-header">
                <Link to="/" className="back-link">← Home</Link>
                <div>
                    <h1 className="page-title">Gate Configuration</h1>
                    <div className="address" style={{ marginTop: 4 }}>
                        {itemId ? `Item: ${itemId}` : `Gate: ${formatAddr(gateObjectId)}`}
                    </div>
                </div>
            </div>

            <div className="gate-layout">

                {/* Left — config */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Current policy */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Current Policy</span>
                            {policy ? (
                                <span className={`badge ${MODE_BADGE[policy.mode]}`}>
                                    {MODE_LABELS[policy.mode]}
                                </span>
                            ) : (
                                <span className="badge">Not Configured</span>
                            )}
                        </div>
                        {policyLoading ? (
                            <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading policy...</div>
                        ) : policy ? (
                            <div className="policy-info">
                                <div className="policy-row">
                                    <span className="policy-label">Syndicate</span>
                                    <Link to={`/syndicate/${policy.syndicateId}`} className="address" style={{ color: 'var(--accent)' }}>
                                        {formatAddr(policy.syndicateId)}
                                    </Link>
                                </div>
                                <div className="policy-row">
                                    <span className="policy-label">Mode</span>
                                    <span className={`badge ${MODE_BADGE[policy.mode]}`}>{MODE_LABELS[policy.mode]}</span>
                                </div>
                                {policy.tollFee > 0 && (
                                    <div className="policy-row">
                                        <span className="policy-label">Toll Fee</span>
                                        <span>{formatSUI(policy.tollFee)} SUI per jump</span>
                                    </div>
                                )}
                                <div className="policy-row">
                                    <span className="policy-label">Permit Expiry</span>
                                    <span>{policy.expiryMs >= 3600000 ? `${policy.expiryMs / 3600000}h` : `${policy.expiryMs / 60000}m`}</span>
                                </div>
                                {policy.requireProximity && (
                                    <div className="policy-row">
                                        <span className="policy-label">Proximity</span>
                                        <span>Required (max {policy.maxDistance} AU)</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ padding: 16, color: 'var(--text-muted)' }}>
                                No OBP policy configured for this gate yet. Use the form below to set one up.
                            </div>
                        )}
                    </div>

                    {/* Reconfigure */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">{policy ? 'Reconfigure Gate' : 'Configure Gate'}</span>
                        </div>
                        <div className="form">

                            {/* Syndicate ID */}
                            <div className="form-group">
                                <label className="form-label">Syndicate ID</label>
                                <input
                                    className="input"
                                    type="text"
                                    value={syndicateId}
                                    onChange={e => setSyndicateId(e.target.value)}
                                    placeholder="0x..."
                                />
                                <span className="form-hint">The Syndicate whose members get access</span>
                            </div>

                            {/* Mode */}
                            <div className="form-group">
                                <label className="form-label">Access Mode</label>
                                <div className="mode-grid">
                                    {[
                                        { value: MODE_MEMBERS_ONLY, label: 'Members Only', desc: 'Only Syndicate members may pass', badge: 'badge-members' },
                                        { value: MODE_TOLL_GATE,    label: 'Toll Gate',    desc: 'Anyone pays toll to pass',     badge: 'badge-toll' },
                                        { value: MODE_MEMBERS_FREE, label: 'Members Free', desc: 'Members free, others pay toll', badge: 'badge-free' },
                                        { value: MODE_BLACKLIST,    label: 'Blacklist',    desc: 'Everyone passes except blocked', badge: 'badge-blacklist' },
                                    ].map(m => (
                                        <div
                                            key={m.value}
                                            className={`mode-option ${mode === m.value ? 'mode-option-active' : ''}`}
                                            onClick={() => setMode(m.value)}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span className="mode-option-label">{m.label}</span>
                                                <span className={`badge ${m.badge}`}>{m.value === mode ? '✓' : ''}</span>
                                            </div>
                                            <span className="mode-option-desc">{m.desc}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Toll fee */}
                            {showToll && (
                                <div className="form-group">
                                    <label className="form-label">Toll Fee (SUI)</label>
                                    <input
                                        className="input"
                                        type="number"
                                        value={tollFee}
                                        onChange={e => setTollFee(e.target.value)}
                                        placeholder="0.5"
                                        min="0"
                                        step="0.1"
                                    />
                                    <span className="form-hint">Collected per jump → Syndicate treasury</span>
                                </div>
                            )}

                            <button
                                className="btn btn-primary"
                                onClick={handleApplyPolicy}
                                disabled={configuring || !syndicateId}
                            >
                                {configuring ? 'Signing via EVE Vault...' : 'Apply Policy →'}
                            </button>

                            {configSuccess && (
                                <div className="notice notice-info">
                                    <span>✅</span>
                                    <span>Gate policy updated on Utopia!</span>
                                </div>
                            )}
                            {configError && (
                                <div className="notice notice-info" style={{ borderColor: 'var(--danger)' }}>
                                    <span>❌</span>
                                    <span>{configError.message}</span>
                                </div>
                            )}

                            {/* Gate selector for both gates */}
                            <div className="notice notice-info" style={{ marginTop: 8 }}>
                                <span>ℹ️</span>
                                <span>
                                    Both gates in a link must be configured.{' '}
                                    {gateObjectId === GATE_OBJECT_ID_1 ? (
                                        <Link to={`/gate/${GATE_OBJECT_ID_2}`} style={{ color: 'var(--accent)' }}>
                                            Configure Gate 2 →
                                        </Link>
                                    ) : (
                                        <Link to={`/gate/${GATE_OBJECT_ID_1}`} style={{ color: 'var(--accent)' }}>
                                            Configure Gate 1 →
                                        </Link>
                                    )}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right — jump history */}
                <div>
                    <div className="card" style={{ position: 'sticky', top: 72 }}>
                        <div className="card-header">
                            <span className="card-title">Jump History</span>
                            <span className="badge badge-member">{jumps.length} recent</span>
                        </div>
                        {historyLoading ? (
                            <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading events...</div>
                        ) : jumps.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                {jumps.map((h, i) => (
                                    <div key={i} className="history-row">
                                        <div>
                                            <span className="address">{formatAddr(h.character)}</span>
                                            <div style={{ marginTop: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
                                                <span className={`badge ${h.paidToll ? 'badge-toll' : 'badge-members'}`}>
                                                    {h.paidToll ? 'Toll' : 'Member'}
                                                </span>
                                                {h.proximityVerified && (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>📍 verified</span>
                                                )}
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                            {timeAgo(h.timestamp)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ padding: 16, color: 'var(--text-muted)' }}>
                                No jumps recorded yet. Events appear here after travelers use this gate.
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
