import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { EveFrontierProvider } from '@evefrontier/dapp-kit';
import App from './App';
import '@mysten/dapp-kit/dist/index.css';
import './index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <EveFrontierProvider queryClient={queryClient}>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </EveFrontierProvider>
    </StrictMode>
);
