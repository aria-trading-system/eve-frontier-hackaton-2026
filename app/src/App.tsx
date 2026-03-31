import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import CreateSyndicatePage from './pages/CreateSyndicatePage';
import SyndicatePage from './pages/SyndicatePage';
import GatePage from './pages/GatePage';
import JoinPage from './pages/JoinPage';
import ExplorePage from './pages/ExplorePage';

export default function App() {
    return (
        <Routes>
            <Route element={<Layout />}>
                <Route path="/"                  element={<HomePage />} />
                <Route path="/explore"            element={<ExplorePage />} />
                <Route path="/create"             element={<CreateSyndicatePage />} />
                <Route path="/syndicate/:id"      element={<SyndicatePage />} />
                <Route path="/gate/:id"           element={<GatePage />} />
                <Route path="/join/:id"           element={<JoinPage />} />
            </Route>
        </Routes>
    );
}
