import { Outlet, NavLink } from 'react-router-dom';
import { useConnection } from '@evefrontier/dapp-kit';

function WalletButton() {
    const { isConnected, walletAddress, handleConnect, handleDisconnect } = useConnection();

    if (isConnected && walletAddress) {
        return (
            <div className="wallet-connected">
                <span className="wallet-address">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </span>
                <button className="btn btn-sm" onClick={handleDisconnect}>
                    Disconnect
                </button>
            </div>
        );
    }

    return (
        <button className="btn btn-accent" onClick={handleConnect}>
            Connect Wallet
        </button>
    );
}

export default function Layout() {
    return (
        <div className="app">
            <header className="navbar">
                <NavLink to="/" className="navbar-brand" style={{ textDecoration: 'none' }}>
                    <img src="/favicon.jpg" alt="OBP" className="brand-icon" />
                    <span className="brand-logo">OBP</span>
                    <span className="navbar-subtitle">Open Borders Protocol</span>
                </NavLink>
                <nav className="navbar-links">
                    <NavLink to="/" end>Home</NavLink>
                    <NavLink to="/explore">Explore</NavLink>
                    <NavLink to="/create">Create Syndicate</NavLink>
                </nav>
                <div className="navbar-wallet">
                    <WalletButton />
                </div>
            </header>
            <main className="main-content">
                <Outlet />
            </main>
            <footer className="app-footer">
                <div className="footer-content">
                    <span className="footer-brand">OBP — Open Borders Protocol</span>
                    <span className="footer-divider">·</span>
                    <a href="https://github.com/aria-trading-system/eve-frontier-hackaton-2026" target="_blank" rel="noopener noreferrer">
                        GitHub
                    </a>
                    <span className="footer-divider">·</span>
                    <span>Built for EVE Frontier × Sui Hackathon 2026</span>
                </div>
            </footer>
        </div>
    );
}
