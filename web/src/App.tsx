import { useEffect, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router';

interface HealthResponse {
  ok: boolean;
  llm: {
    provider: string;
  };
}

function HomePage() {
  const [provider, setProvider] = useState('加载中');

  useEffect(() => {
    let isMounted = true;

    async function fetchHealth(): Promise<void> {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) {
          throw new Error('健康检查失败');
        }
        const health = (await response.json()) as HealthResponse;
        if (isMounted) {
          setProvider(health.llm.provider);
        }
      } catch {
        if (isMounted) {
          setProvider('暂不可用');
        }
      }
    }

    void fetchHealth();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="panel">
        <p className="eyebrow">AI 圆桌演播厅</p>
        <h1>AI Panel Studio</h1>
        <p>
          当前模型提供方：<strong>{provider}</strong>
        </p>
        <Link to="/new">开始新讨论</Link>
      </section>
    </main>
  );
}

function NewDiscussionPage() {
  return (
    <main className="app-shell">
      <section className="panel">
        <h1>新建讨论</h1>
        <Link to="/">返回首页</Link>
      </section>
    </main>
  );
}

function StudioPage() {
  const { id } = useParams();

  return (
    <main className="app-shell">
      <section className="panel">
        <h1>讨论演播厅</h1>
        <p>讨论 ID：{id}</p>
        <Link to="/">返回首页</Link>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/new" element={<NewDiscussionPage />} />
      <Route path="/studio/:id" element={<StudioPage />} />
    </Routes>
  );
}
