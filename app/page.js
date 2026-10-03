'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const sample = 'https://ncode.syosetu.com/n3669fw/420/';

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState(sample);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem('narou-reader-history') || '[]').slice(0, 6));
    } catch {}
  }, []);

  const openReader = (e) => {
    e?.preventDefault();
    const value = url.trim();
    if (!/^https:\/\/ncode\.syosetu\.com\/n[0-9a-z]+\/\d+\/?$/i.test(value)) {
      alert('「小説家になろう」の各話URLを入力してください。');
      return;
    }
    router.push(`/read?url=${encodeURIComponent(value)}`);
  };

  return (
    <main className="landing">
      <section className="hero-card">
        <div className="logo-mark">読</div>
        <h1>なろうReader</h1>
        <p className="lead">本文に集中するための、シンプルな個人用リーダー。</p>
        <form onSubmit={openReader} className="url-form">
          <input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" aria-label="各話URL" />
          <button type="submit">読む</button>
        </form>
        <p className="hint">各話ページのURLを貼り付けてください。</p>
      </section>

      {history.length > 0 && (
        <section className="history-card">
          <h2>つづきから</h2>
          <div className="history-list">
            {history.map((item) => (
              <button key={item.url} onClick={() => router.push(`/read?url=${encodeURIComponent(item.url)}`)}>
                <span>{item.workTitle || '作品'}</span>
                <strong>{item.episodeTitle || item.url}</strong>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
