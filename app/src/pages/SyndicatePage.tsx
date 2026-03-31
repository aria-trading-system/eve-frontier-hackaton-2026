import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { useConnection } from '@evefrontier/dapp-kit';
import { useState } from 'react';
import { useSyndicate } from '../hooks/useSyndicate';
import { useSyndicateLookup } from '../hooks/useSyndicateLookup';
import { useContributionRecord } from '../hooks/useContributionRecord';
import { useRecordContribution } from '../hooks/useRecordContribution';
import { useDistributeTreasury } from '../hooks/useDistributeTreasury';
import { useSyndicateActions } from '../hooks/useSyndicateActions';
import {
    ROLE_LABELS,
} from '../lib/constants';

const ROLE_BADGES: Record<number, string> = { 0: 'badge-member', 1: 'badge-officer', 2: 'badge-owner' };

function formatAddress(addr: string) {
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function formatSUI(mist: number) {
    return (mist / 1_000_000_000).toFixed(3);
}

function formatScore(score: number) {
    if (score >= 1_000_000) return `${(score / 1_000_000).toFixed(1)}M`;
    if (score >= 1_000) return `${(score / 1_000).toFixed(1)}K`;
    return score.toString();
}

function formatDate(ms: number) {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString();
}

export default function SyndicatePage() {
    const { id } = useParams();
    const location = useLocation();
    const syndicateId = id || '';
    const { currentAccount: account } = useConnection();
    const navigate = useNavigate();

    // Dynamic lookup — hints from navigation state, fallback to RPC lookup
    const stateHints = (location.state as any) ?? {};
    const { ownerCapId, contributionRecordId, isLoading: lookupLoading } = useSyndicateLookup(
        syndicateId,
        account?.address,
        {
            ownerCapId: stateHints.ownerCapId,
            contributionRecordId: stateHints.contributionRecordId,
        }
    );

    // Data hooks
    const { syndicate, members, isLoading, error, refetch } = useSyndicate(syndicateId);
    const { entries, isLoading: entriesLoading, refetch: refetchEntries } = useContributionRecord(contributionRecordId ?? undefined);
    const { recordContribution, isPending: recordPending, error: recordError } = useRecordContribution();
    const { distributeTreasury, isPending: distributePending, error: distributeError } = useDistributeTreasury(syndicateId, ownerCapId || '');
    const {
        inviteMember, kickMember, promoteToOfficer,
        deposit, withdraw, leaveSyndicate,
        isPending: actionPending, error: actionError,
    } = useSyndicateActions(syndicateId, ownerCapId || '');

    // Form state
    const [inviteAddress, setInviteAddress] = useState('');
    const [depositAmount, setDepositAmount] = useState('');
    const [copied, setCopied] = useState(false);

    // Record contribution form state
    const [rcContributor, setRcContributor] = useState('');
    const [rcResource, setRcResource] = useState('');
    const [rcQuantity, setRcQuantity] = useState('');
    const [rcPrice, setRcPrice] = useState('');
    const [rcNotes, setRcNotes] = useState('');
    const [rcSuccess, setRcSuccess] = useState(false);

    // Distribute form state
    const [distributeAmount, setDistributeAmount] = useState('');
    const [distributeSuccess, setDistributeSuccess] = useState(false);

    // Derived state
    const isOwner = account && ownerCapId
        ? members.some(m => m.role === 2 && m.address === account.address)
        : false;
    const isOfficer = isOwner || (account ? members.some(m => m.role === 1 && m.address === account.address) : false);
    const isMember = account ? members.some(m => m.address === account.address) : false;

    // Gate config form state
    const [gateIdInput, setGateIdInput] = useState('');

    // Loading state
    if (isLoading) {
        return (
            <div className="page">
                <div className="page-header">
                    <Link to="/" className="back-link">← Home</Link>
                </div>
                <div className="empty-state" style={{ padding: 60 }}>
                    Loading syndicate data from Utopia...
                </div>
            </div>
        );
    }

    // Error state
    if (error || !syndicate) {
        return (
            <div className="page">
                <div className="page-header">
                    <Link to="/" className="back-link">← Home</Link>
                </div>
                <div className="empty-state" style={{ padding: 60 }}>
                    <div>Failed to load syndicate</div>
                    <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>
                        {error ? String(error) : 'Syndicate not found'}
                    </div>
                    <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={refetch}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="page">

            {/* Header */}
            <div className="page-header">
                <Link to="/" className="back-link">← Home</Link>
                <div className="syndicate-header">
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <h1 className="page-title">{syndicate.name}</h1>
                            <span className={`badge ${syndicate.invite_only ? 'badge-private' : 'badge-public'}`}>
                                {syndicate.invite_only ? '🔒 Invite Only' : '🌐 Public'}
                            </span>
                        </div>
                        <div className="address" style={{ marginTop: 4 }}>
                            Syndicate ID: {syndicateId}
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="stats-row">
                        <div className="stat">
                            <span className="stat-value">{syndicate.member_count}</span>
                            <span className="stat-label">Members</span>
                        </div>
                        <div className="stat">
                            <span className="stat-value">{formatSUI(syndicate.treasury)}</span>
                            <span className="stat-label">SUI Treasury</span>
                        </div>
                        <div className="stat">
                            <span className="stat-value">{formatScore(syndicate.total_contribution_score)}</span>
                            <span className="stat-label">Total Score</span>
                        </div>

                    </div>
                </div>
            </div>

            <div className="syndicate-layout">

                {/* Left column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Members */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Members</span>
                            {isOfficer && (
                                <span className="badge badge-officer">Officer View</span>
                            )}
                        </div>

                        {members.length === 0 ? (
                            <div className="empty-state">No members yet</div>
                        ) : (
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Address</th>
                                        <th>Role</th>
                                        <th>Score</th>
                                        <th>Joined</th>
                                        {isOfficer && <th>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {members.map(m => (
                                        <tr key={m.address}>
                                            <td>
                                                <span className="address">{formatAddress(m.address)}</span>
                                                {account?.address === m.address && (
                                                    <span className="badge badge-owner" style={{ marginLeft: 8 }}>You</span>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`badge ${ROLE_BADGES[m.role]}`}>
                                                    {ROLE_LABELS[m.role]}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{ fontFamily: 'monospace' }}>
                                                    {formatScore(m.contribution_score)}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                                                    {formatDate(m.joined_at)}
                                                </span>
                                            </td>
                                            {isOfficer && (
                                                <td>
                                                    {m.role < 2 && account?.address !== m.address && (
                                                        <div style={{ display: 'flex', gap: 6 }}>
                                                            {isOwner && m.role === 0 && (
                                                                <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                                                    disabled={actionPending}
                                                                    onClick={() => promoteToOfficer(m.address)}>
                                                                    Promote
                                                                </button>
                                                            )}
                                                            <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                                                disabled={actionPending}
                                                                onClick={() => kickMember(m.address)}>
                                                                Kick
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {/* Leave button for members */}
                        {isMember && !isOwner && (
                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                                <button className="btn btn-danger" disabled={actionPending} onClick={leaveSyndicate}>
                                    Leave Syndicate
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Contribution History */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Contribution History</span>
                            <button
                                className="btn btn-ghost"
                                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                onClick={() => refetchEntries()}
                            >
                                ↻ Refresh
                            </button>
                        </div>

                        {!contributionRecordId ? (
                            <div className="empty-state" style={{ padding: 24 }}>
                                {lookupLoading ? 'Looking up contribution record...' : 'No contribution record found'}
                            </div>
                        ) : entriesLoading ? (
                            <div className="empty-state" style={{ padding: 24 }}>Loading entries...</div>
                        ) : entries.length === 0 ? (
                            <div className="empty-state">No contributions recorded yet</div>
                        ) : (
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Member</th>
                                        <th>Resource</th>
                                        <th>Qty</th>
                                        <th>Value</th>
                                        <th>Notes</th>
                                        <th>Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {entries.map(e => (
                                        <tr key={e.entry_id}>
                                            <td>
                                                <span className="address">{formatAddress(e.contributor)}</span>
                                            </td>
                                            <td>
                                                <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                                    {e.resource_type}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{ fontFamily: 'monospace' }}>
                                                    {e.quantity.toLocaleString()}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>
                                                    {formatScore(e.total_value)}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                                                    {e.notes || '—'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                                                    {formatDate(e.timestamp)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Configure Gate */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Gate Configuration</span>
                        </div>
                        <div className="form">
                            <div className="form-group">
                                <label className="form-label">Gate Object ID</label>
                                <input
                                    className="input"
                                    type="text"
                                    value={gateIdInput}
                                    onChange={e => setGateIdInput(e.target.value)}
                                    placeholder="0x... (copy Assembly ID from game)"
                                />
                                <span className="form-hint">
                                    Open your gate in-game → copy the Assembly ID → paste here
                                </span>
                            </div>
                            <button
                                className="btn btn-primary"
                                disabled={!gateIdInput.trim().startsWith('0x')}
                                onClick={() => navigate(`/gate/${gateIdInput.trim()}`, { state: { syndicateId } })}
                            >
                                Configure Gate →
                            </button>
                        </div>
                    </div>

                </div>

                {/* Right column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Invite */}
                    {isOfficer && (
                        <div className="card">
                            <div className="card-header">
                                <span className="card-title">Invite Member</span>
                            </div>
                            <div className="form">
                                <div className="form-group">
                                    <label className="form-label">Wallet Address</label>
                                    <input
                                        className="input"
                                        type="text"
                                        value={inviteAddress}
                                        onChange={e => setInviteAddress(e.target.value)}
                                        placeholder="0x..."
                                    />
                                </div>
                                <button
                                    className="btn btn-primary"
                                    disabled={!inviteAddress.trim() || actionPending}
                                    onClick={async () => {
                                        const res = await inviteMember(inviteAddress.trim());
                                        if (res) setInviteAddress('');
                                    }}
                                >
                                    {actionPending ? 'Sending...' : 'Send Invite'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Record Contribution — officer only */}
                    {isOfficer && contributionRecordId && (
                        <div className="card">
                            <div className="card-header">
                                <span className="card-title">Record Contribution</span>
                                <span className="badge badge-officer">Officer</span>
                            </div>
                            {rcSuccess ? (
                                <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
                                    <div style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>
                                        ✅ Contribution recorded
                                    </div>
                                    <button className="btn btn-ghost" style={{ fontSize: '0.85rem' }}
                                        onClick={() => { setRcSuccess(false); refetchEntries(); }}>
                                        + Record Another
                                    </button>
                                </div>
                            ) : (
                                <div className="form">
                                    <div className="form-group">
                                        <label className="form-label">Contributor Address</label>
                                        <input className="input" type="text" value={rcContributor}
                                            onChange={e => setRcContributor(e.target.value)} placeholder="0x..." />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Resource Type</label>
                                        <input className="input" type="text" value={rcResource}
                                            onChange={e => setRcResource(e.target.value)}
                                            placeholder="e.g. building_foam" />
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <div className="form-group" style={{ flex: 1 }}>
                                            <label className="form-label">Quantity</label>
                                            <input className="input" type="number" value={rcQuantity}
                                                onChange={e => setRcQuantity(e.target.value)}
                                                placeholder="0" min="1" />
                                        </div>
                                        <div className="form-group" style={{ flex: 1 }}>
                                            <label className="form-label">Price / unit (MIST)</label>
                                            <input className="input" type="number" value={rcPrice}
                                                onChange={e => setRcPrice(e.target.value)}
                                                placeholder="0" min="0" />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Notes (optional)</label>
                                        <input className="input" type="text" value={rcNotes}
                                            onChange={e => setRcNotes(e.target.value)}
                                            placeholder="Delivered to Horn NWN" />
                                    </div>
                                    {recordError && (
                                        <div style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{recordError}</div>
                                    )}
                                    <button
                                        className="btn btn-primary"
                                        disabled={!rcContributor || !rcResource || !rcQuantity || !rcPrice || recordPending}
                                        onClick={async () => {
                                            const res = await recordContribution({
                                                syndicateId,
                                                ownerCapId: ownerCapId!,
                                                contributionRecordId: contributionRecordId!,
                                                contributor: rcContributor.trim(),
                                                resource_type: rcResource.trim(),
                                                quantity: parseInt(rcQuantity),
                                                market_price_per_unit: parseInt(rcPrice),
                                                notes: rcNotes.trim(),
                                            });
                                            if (res) {
                                                setRcContributor(''); setRcResource('');
                                                setRcQuantity(''); setRcPrice(''); setRcNotes('');
                                                setRcSuccess(true);
                                                refetch();
                                                refetchEntries();
                                            }
                                        }}
                                    >
                                        {recordPending ? 'Recording...' : 'Record Contribution'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Treasury */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Treasury</span>
                            <span className="stat-value" style={{ fontSize: '1.1rem' }}>
                                {formatSUI(syndicate.treasury)} SUI
                            </span>
                        </div>
                        <div className="form">
                            <div className="form-group">
                                <label className="form-label">Amount (SUI)</label>
                                <input
                                    className="input"
                                    type="number"
                                    value={depositAmount}
                                    onChange={e => setDepositAmount(e.target.value)}
                                    placeholder="0.0"
                                    min="0"
                                    step="0.1"
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    className="btn btn-secondary"
                                    disabled={!depositAmount || actionPending}
                                    onClick={async () => {
                                        const res = await deposit(parseFloat(depositAmount));
                                        if (res) { setDepositAmount(''); refetch(); }
                                    }}
                                    style={{ flex: 1 }}
                                >
                                    {actionPending ? 'Pending...' : 'Deposit'}
                                </button>
                                {isOwner && (
                                    <button
                                        className="btn btn-ghost"
                                        disabled={actionPending}
                                        onClick={() => withdraw(parseFloat(depositAmount) || 0)}
                                        style={{ flex: 1 }}
                                    >
                                        {actionPending ? 'Pending...' : 'Withdraw'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Distribute Treasury — owner only */}
                    {isOwner && (
                        <div className="card">
                            <div className="card-header">
                                <span className="card-title">Distribute Treasury</span>
                                <span className="badge badge-owner">Owner</span>
                            </div>
                            {distributeSuccess ? (
                                <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
                                    <div style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>
                                        ✅ Distribution complete
                                    </div>
                                    <button className="btn btn-ghost" style={{ fontSize: '0.85rem' }}
                                        onClick={() => { setDistributeSuccess(false); refetch(); }}>
                                        ↻ Refresh
                                    </button>
                                </div>
                            ) : (
                                <div className="form">
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                                        Distribute proportionally to {members.length} member{members.length !== 1 ? 's' : ''} by contribution score.
                                        Dust stays in treasury.
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Amount (SUI)</label>
                                        <input
                                            className="input"
                                            type="number"
                                            value={distributeAmount}
                                            onChange={e => setDistributeAmount(e.target.value)}
                                            placeholder="0.0"
                                            min="0"
                                            step="0.1"
                                        />
                                    </div>
                                    {distributeError && (
                                        <div style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{distributeError}</div>
                                    )}
                                    <button
                                        className="btn btn-primary"
                                        disabled={!distributeAmount || distributePending || syndicate.total_contribution_score === 0}
                                        onClick={async () => {
                                            const recipientAddrs = members.map(m => m.address);
                                            const res = await distributeTreasury(
                                                recipientAddrs,
                                                parseFloat(distributeAmount)
                                            );
                                            if (res) {
                                                setDistributeAmount('');
                                                setDistributeSuccess(true);
                                                refetch();
                                            }
                                        }}
                                    >
                                        {distributePending ? 'Distributing...' : 'Distribute'}
                                    </button>
                                    {syndicate.total_contribution_score === 0 && (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                            No contributions recorded yet — record contributions first.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Share link */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Invite Link</span>
                        </div>
                        <div className="form">
                            <div className="input" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', wordBreak: 'break-all', overflow: 'hidden' }}>
                                {`${window.location.origin}/join/${syndicateId}`}
                            </div>
                            <button
                                className="btn btn-secondary"
                                onClick={() => {
                                    navigator.clipboard.writeText(`${window.location.origin}/join/${syndicateId}`);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                }}
                            >
                                {copied ? '✅ Copied' : 'Copy Link'}
                            </button>
                        </div>
                    </div>

                    {/* Syndicate Info */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Info</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.85rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span className="text-muted">Created</span>
                                <span>{formatDate(syndicate.created_at)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span className="text-muted">Total Score</span>
                                <span style={{ fontFamily: 'monospace' }}>{formatScore(syndicate.total_contribution_score)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span className="text-muted">Access</span>
                                <span>{syndicate.invite_only ? 'Invite Only' : 'Open'}</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

        </div>
    );
}
