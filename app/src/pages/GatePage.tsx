import { useParams, Link, useSearchParams, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import {
    MODE_LABELS, MODE_MEMBERS_ONLY, MODE_TOLL_GATE, MODE_MEMBERS_FREE, MODE_OPEN_GATE,
} from '../lib/constants';
import { useGatePolicy } from '../hooks/useGatePolicy';
import { useConfigureGate } from '../hooks/useConfigureGate';
import { useJumpHistory } from '../hooks/useJumpHistory';
import { useCharacter } from '../hooks/useCharacter';
import { useGateInfo } from '../hooks/useGateInfo';

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
    const location = useLocation();
    const stateData = (location.state as any) ?? {};
    const account = useCurrentAccount();

    // Resolve gate object ID from URL
    const itemId = searchParams.get('itemId');
    const gateObjectId = id || '';

    // Dynamic lookups — no hardcoded IDs
    const { character, characterObjectId, isLoading: characterLoading } = useCharacter(account?.address);
    const { gateInfo, isLoading: gateInfoLoading } = useGateInfo(gateObjectId || undefined);

    // Hooks — real data from Utopia
    const { policy, isLoading: policyLoading, refetch: refetchPolicy } = useGatePolicy(gateObjectId || undefined);
    const { policy: linkedPolicy } = useGatePolicy(gateInfo?.linkedGateId || undefined);
    const { jumps, isLoading: historyLoading } = useJumpHistory(gateObjectId || undefined);
    const { configureGate, addToBlacklist, removeFromBlacklist, addBlockedTribe, removeBlockedTribe, isLoading: configuring, error: configError } = useConfigureGate();

    // Form state — prefill from current policy if available
    const [mode, setMode] = useState(policy?.mode ?? MODE_MEMBERS_FREE);
    const [tollFee, setTollFee] = useState('0.5');
    const [syndicateId, setSyndicateId] = useState(policy?.syndicateId || stateData.syndicateId || '');
    const [expiryMinutes, setExpiryMinutes] = useState('60');
    const [configSuccess, setConfigSuccess] = useState(false);
    const [blacklistAddr, setBlacklistAddr] = useState('');
    const [blacklistSuccess, setBlacklistSuccess] = useState('');
    const [tribeIdInput, setTribeIdInput] = useState('');
    const [tribeSuccess, setTribeSuccess] = useState('');

    // Derived
    const showToll = mode === MODE_TOLL_GATE || mode === MODE_MEMBERS_FREE;
    const canConfigure = !!account && !!characterObjectId && !!syndicateId && !!gateObjectId;
    const linkedGateId = gateInfo?.linkedGateId;

    // Handler: Apply Policy
    const handleApplyPolicy = async () => {
        if (!characterObjectId || !gateObjectId) return;
        setConfigSuccess(false);
        try {
            await configureGate({
                gateObjectId,
                characterObjectId,
                syndicateId,
                mode,
                tollMist: Math.round(parseFloat(tollFee) * 1_000_000_000),
                expiryMs: Math.round(parseFloat(expiryMinutes) * 60_000),
            });
            setConfigSuccess(true);
            // Delay refetch — RPC node needs time to index new dynamic field
            setTimeout(() => refetchPolicy(), 2000);
        } catch (err) {
            console.error('Configure gate failed:', err);
        }
    };

    // No gate selected
    if (!gateObjectId) {
        return (
            <div className="page">
                <div className="page-header">
                    <Link to="/" className="back-link">← Home</Link>
                    <h1 className="page-title">Gate Configuration</h1>
                </div>
                <div className="card">
                    <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>
                        <p>No gate selected. Open this page from a gate link or enter a Gate Object ID in the URL.</p>
                        <p style={{ marginTop: 8, fontSize: '0.85rem' }}>
                            Format: <code>/gate/0x...</code>
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page">

            {/* Header */}
            <div className="page-header">
                <Link to="/" className="back-link">← Home</Link>
                <div>
                    <h1 className="page-title">Gate Configuration</h1>
                    <div className="address" style={{ marginTop: 4 }}>
                        {itemId ? `Item: ${itemId}` : `Gate: ${formatAddr(gateObjectId)}`}
                        {gateInfo?.hasExtension && (
                            <span className="badge badge-free" style={{ marginLeft: 8, fontSize: '0.7rem' }}>OBP Active</span>
                        )}
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

                            {/* Wallet / Character status */}
                            {!account && (
                                <div className="notice notice-info">
                                    <span>🔌</span>
                                    <span>Connect your EVE Vault to configure this gate.</span>
                                </div>
                            )}
                            {account && characterLoading && (
                                <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    Resolving character...
                                </div>
                            )}
                            {account && !characterLoading && !characterObjectId && (
                                <div className="notice notice-info" style={{ borderColor: 'var(--warning)' }}>
                                    <span>⚠️</span>
                                    <span>No EVE character found for this wallet. Make sure you have a character registered in EVE Frontier.</span>
                                </div>
                            )}

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
                                        { value: MODE_OPEN_GATE,    label: 'Open Gate',    desc: 'Everyone passes (use blacklist to block)', badge: 'badge-blacklist' },
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

                            {/* Permit Expiry */}
                            <div className="form-group">
                                <label className="form-label">Permit Expiry</label>
                                <div className="mode-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                                    {[
                                        { value: '5', label: '5 min' },
                                        { value: '60', label: '1 hour' },
                                        { value: '1440', label: '24 hours' },
                                        { value: '10080', label: '7 days' },
                                    ].map(opt => (
                                        <div
                                            key={opt.value}
                                            className={`mode-option ${expiryMinutes === opt.value ? 'mode-option-active' : ''}`}
                                            onClick={() => setExpiryMinutes(opt.value)}
                                            style={{ padding: '10px 8px', textAlign: 'center' }}
                                        >
                                            <span className="mode-option-label" style={{ fontSize: '0.85rem' }}>{opt.label}</span>
                                        </div>
                                    ))}
                                </div>
                                <span className="form-hint">How long a jump permit stays valid after request</span>
                            </div>

                            {/* Blacklist hint when not in blacklist mode */}
                            {mode === MODE_OPEN_GATE && (
                                <div className="notice notice-info">
                                    <span>🛡️</span>
                                    <span>Open Gate mode: everyone can pass. Use the blacklist below to block specific addresses.</span>
                                </div>
                            )}

                            <button
                                className="btn btn-primary"
                                onClick={handleApplyPolicy}
                                disabled={configuring || !canConfigure}
                            >
                                {configuring ? 'Signing via EVE Vault...' : !account ? 'Connect Wallet First' : !characterObjectId ? 'No Character Found' : 'Apply Policy →'}
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

                            {/* Linked gate — dynamic from chain */}
                            {gateInfoLoading ? (
                                <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    Checking linked gate...
                                </div>
                            ) : linkedGateId ? (
                                linkedPolicy ? (
                                    <div className="notice notice-info" style={{ marginTop: 8, borderColor: 'var(--accent)' }}>
                                        <span>✅</span>
                                        <span>
                                            Both gates configured!{' '}
                                            <Link to={`/gate/${linkedGateId}`} style={{ color: 'var(--accent)' }}>
                                                View linked gate ({formatAddr(linkedGateId)}) →
                                            </Link>
                                        </span>
                                    </div>
                                ) : (
                                    <div className="notice notice-info" style={{ marginTop: 8 }}>
                                        <span>🔗</span>
                                        <span>
                                            Both gates in a link must be configured.{' '}
                                            <Link to={`/gate/${linkedGateId}`} style={{ color: 'var(--accent)' }}>
                                                Configure linked gate ({formatAddr(linkedGateId)}) →
                                            </Link>
                                        </span>
                                    </div>
                                )
                            ) : (
                                <div className="notice notice-info" style={{ marginTop: 8 }}>
                                    <span>ℹ️</span>
                                    <span>This gate is not linked to another gate yet. Link gates in-game first, then configure both.</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Blacklist Management — show when policy exists */}
                    {policy && (
                        <div className="card">
                            <div className="card-header">
                                <span className="card-title">Blacklist</span>
                                <span className="badge badge-blacklist">{policy.blacklist.length} blocked</span>
                            </div>

                            {/* Current blacklist */}
                            {policy.blacklist.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                                    {policy.blacklist.map((addr: string) => (
                                        <div key={addr} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)' }}>
                                            <span className="address" style={{ fontSize: '0.8rem' }}>{addr.slice(0, 10)}...{addr.slice(-6)}</span>
                                            <button
                                                className="btn btn-danger"
                                                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                                disabled={configuring || !characterObjectId}
                                                onClick={async () => {
                                                    try {
                                                        await removeFromBlacklist(gateObjectId, characterObjectId!, addr);
                                                        setBlacklistSuccess('removed');
                                                        setTimeout(() => { refetchPolicy(); setBlacklistSuccess(''); }, 2000);
                                                    } catch {}
                                                }}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    No addresses blocked
                                </div>
                            )}

                            {/* Hint if not in blacklist mode */}
                            {policy.mode !== 3 && (
                                <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                    Blacklist is universal — blocked addresses are denied in ALL modes.
                                </div>
                            )}

                            {/* Add to blacklist */}
                            <div className="form" style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                                <div className="form-group">
                                    <label className="form-label">Block Address</label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input
                                            className="input"
                                            type="text"
                                            value={blacklistAddr}
                                            onChange={e => setBlacklistAddr(e.target.value)}
                                            placeholder="0x..."
                                            style={{ flex: 1 }}
                                        />
                                        <button
                                            className="btn btn-primary"
                                            style={{ flexShrink: 0 }}
                                            disabled={!blacklistAddr.startsWith('0x') || configuring || !characterObjectId}
                                            onClick={async () => {
                                                try {
                                                    await addToBlacklist(gateObjectId, characterObjectId!, blacklistAddr.trim());
                                                    setBlacklistAddr('');
                                                    setBlacklistSuccess('added');
                                                    setTimeout(() => { refetchPolicy(); setBlacklistSuccess(''); }, 2000);
                                                } catch {}
                                            }}
                                        >
                                            {configuring ? '...' : 'Block'}
                                        </button>
                                    </div>
                                </div>
                                {blacklistSuccess && (
                                    <div style={{ color: 'var(--accent)', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                        ✅ Address {blacklistSuccess}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Tribe Blocking — universal security layer */}
                    {policy && (
                        <div className="card">
                            <div className="card-header">
                                <span className="card-title">Tribe Blocking</span>
                                <span className="badge badge-blacklist">{policy.blockedTribes.length} blocked</span>
                            </div>

                            {/* Current blocked tribes */}
                            {policy.blockedTribes.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                                    {policy.blockedTribes.map((tribeId: number) => (
                                        <div key={tribeId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)' }}>
                                            <span style={{ fontSize: '0.85rem' }}>Tribe #{tribeId}</span>
                                            <button
                                                className="btn btn-danger"
                                                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                                disabled={configuring || !characterObjectId}
                                                onClick={async () => {
                                                    try {
                                                        await removeBlockedTribe(gateObjectId, characterObjectId!, tribeId);
                                                        setTribeSuccess('unblocked');
                                                        setTimeout(() => { refetchPolicy(); setTribeSuccess(''); }, 2000);
                                                    } catch {}
                                                }}
                                            >
                                                Unblock
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    No tribes blocked
                                </div>
                            )}

                            <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                Tribe blocking is universal — blocked factions are denied in ALL modes.
                            </div>

                            {/* Add blocked tribe */}
                            <div className="form" style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                                <div className="form-group">
                                    <label className="form-label">Block Tribe ID</label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input
                                            className="input"
                                            type="number"
                                            value={tribeIdInput}
                                            onChange={e => setTribeIdInput(e.target.value)}
                                            placeholder="e.g. 100"
                                            style={{ flex: 1 }}
                                        />
                                        <button
                                            className="btn btn-primary"
                                            style={{ flexShrink: 0 }}
                                            disabled={!tribeIdInput || isNaN(Number(tribeIdInput)) || configuring || !characterObjectId}
                                            onClick={async () => {
                                                try {
                                                    await addBlockedTribe(gateObjectId, characterObjectId!, Number(tribeIdInput));
                                                    setTribeIdInput('');
                                                    setTribeSuccess('blocked');
                                                    setTimeout(() => { refetchPolicy(); setTribeSuccess(''); }, 2000);
                                                } catch {}
                                            }}
                                        >
                                            {configuring ? '...' : 'Block'}
                                        </button>
                                    </div>
                                </div>
                                {tribeSuccess && (
                                    <div style={{ color: 'var(--accent)', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                        ✅ Tribe {tribeSuccess}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

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
