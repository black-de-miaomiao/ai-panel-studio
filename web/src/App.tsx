import { Route, Routes, useParams } from 'react-router';
import LobbyPage from './pages/LobbyPage';
import NewDiscussionPage from './pages/NewDiscussionPage';
import StudioPage from './pages/StudioPage';

function StudioRoute() {
  const { id } = useParams();
  return <StudioPage id={id ?? ''} />;
}

function NotFoundPage() {
  return (
    <main className="studio-not-found page-shell">
      <span className="section-kicker">AI PANEL STUDIO / 404</span>
      <h1>这盏演播厅灯没有亮起。</h1>
      <p>页面可能已经离开节目单。</p>
      <a className="button button--secondary button--md" href="/">
        返回演播大厅
      </a>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LobbyPage />} />
      <Route path="/new" element={<NewDiscussionPage />} />
      <Route path="/studio/:id" element={<StudioRoute />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
