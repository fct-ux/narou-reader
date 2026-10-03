'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const defaults = { fontSize: 19, lineHeight: 2.0, theme: 'paper', width: 720, writingMode: 'horizontal' };

function Reader() {
  const router = useRouter();
  const params = useSearchParams();
  const url = params.get('url') || '';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(defaults);
  const [showPanel, setShowPanel] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [rate, setRate] = useState(1.0);
  const speechIndex = useRef(0);
  const cancelled = useRef(false);
  const verticalBodyRef = useRef(null);

  useEffect(() => {
    try { setSettings({ ...defaults, ...JSON.parse(localStorage.getItem('narou-reader-settings') || '{}') }); } catch {}
  }, []);

  useEffect(() => {
    if (!url) return;
    setData(null); setError('');
    fetch(`/api/reader?url=${encodeURIComponent(url)}`)
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || '取得失敗'); return j; })
      .then(j => {
        setData(j);
        document.title = `${j.episodeTitle} | なろうReader`;
        try {
          const old = JSON.parse(localStorage.getItem('narou-reader-history') || '[]');
          const next = [{ url: j.sourceUrl, workTitle: j.workTitle, episodeTitle: j.episodeTitle, at: Date.now() }, ...old.filter(x => x.url !== j.sourceUrl)].slice(0, 20);
          localStorage.setItem('narou-reader-history', JSON.stringify(next));
          const saved = Number(localStorage.getItem(`narou-reader-scroll:${j.sourceUrl}`) || 0);
          const mode = JSON.parse(localStorage.getItem('narou-reader-settings') || '{}').writingMode || 'horizontal';
          if (mode !== 'vertical' && saved > 0) setTimeout(() => window.scrollTo({ top: saved }), 100);
        } catch {}
      })
      .catch(e => setError(e.message));
  }, [url]);

  useEffect(() => {
    if (!data?.sourceUrl) return;

    if (settings.writingMode === 'vertical') {
      const el = verticalBodyRef.current;
      if (!el) return;

      const key = `narou-reader-vertical:${data.sourceUrl}`;
      const saved = Number(localStorage.getItem(key) || 0);
      if (saved > 0) {
        requestAnimationFrame(() => {
          // vertical-rl is right-to-left. Safari/Chrome differ in scrollLeft sign,
          // so try the negative form first and fall back to positive.
          el.scrollLeft = -saved;
          if (Math.abs(el.scrollLeft) < 1) el.scrollLeft = saved;
        });
      }

      const onHorizontalScroll = () => {
        const max = Math.max(0, el.scrollWidth - el.clientWidth);
        const pos = Math.min(max, Math.abs(el.scrollLeft));
        setProgress(max > 0 ? Math.min(100, (pos / max) * 100) : 0);
        localStorage.setItem(key, String(pos));
      };
      el.addEventListener('scroll', onHorizontalScroll, { passive: true });
      onHorizontalScroll();
      return () => el.removeEventListener('scroll', onHorizontalScroll);
    }

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
      localStorage.setItem(`narou-reader-scroll:${data.sourceUrl}`, String(window.scrollY));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [data, settings.writingMode]);

  useEffect(() => () => speechSynthesis?.cancel(), []);

  const updateSetting = (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    localStorage.setItem('narou-reader-settings', JSON.stringify(next));
  };

  const go = (target) => {
    if (!target) return;
    speechSynthesis.cancel(); setSpeaking(false);
    router.push(`/read?url=${encodeURIComponent(target)}`);
    window.scrollTo(0, 0);
    if (verticalBodyRef.current) verticalBodyRef.current.scrollLeft = 0;
  };

  const chunks = useMemo(() => {
    if (!data?.paragraphs) return [];
    const result = [];
    let current = '';
    for (const p of data.paragraphs) {
      if ((current + p).length > 450 && current) { result.push(current); current = ''; }
      current += (current ? '。' : '') + p;
    }
    if (current) result.push(current);
    return result;
  }, [data]);

  const stopSpeech = () => {
    cancelled.current = true;
    speechSynthesis.cancel();
    setSpeaking(false);
  };

  const speakFrom = (index = 0) => {
    if (!('speechSynthesis' in window) || !chunks.length) return;
    cancelled.current = false;
    speechIndex.current = index;
    setSpeaking(true);
    speechSynthesis.cancel();

    const speakNext = () => {
      if (cancelled.current || speechIndex.current >= chunks.length) { setSpeaking(false); return; }
      const utter = new SpeechSynthesisUtterance(chunks[speechIndex.current]);
      utter.lang = 'ja-JP'; utter.rate = rate;
      utter.onend = () => { speechIndex.current += 1; speakNext(); };
      utter.onerror = () => setSpeaking(false);
      speechSynthesis.speak(utter);
    };
    speakNext();
  };

  if (error) return <main className="state"><p>{error}</p><button onClick={() => router.push('/')}>URL入力へ戻る</button></main>;
  if (!data) return <main className="state"><div className="spinner"/><p>本文を読み込んでいます…</p></main>;

  return (
    <div className={`reader-shell theme-${settings.theme}`}>
      <div className="progress" style={{ width: `${progress}%` }} />
      <header className="topbar">
        <button className="icon-button" onClick={() => router.push('/')} aria-label="ホーム">⌂</button>
        <div className="top-title"><span>{data.workTitle}</span><strong>{data.current && data.total ? `${data.current} / ${data.total}` : ''}</strong></div>
        <button className="icon-button" onClick={() => setShowPanel(v => !v)} aria-label="表示設定">Aa</button>
      </header>

      {showPanel && (
        <aside className="settings-panel">
          <label>文字サイズ <input type="range" min="15" max="30" value={settings.fontSize} onChange={e => updateSetting('fontSize', Number(e.target.value))}/><span>{settings.fontSize}px</span></label>
          <label>行間 <input type="range" min="1.4" max="2.8" step="0.1" value={settings.lineHeight} onChange={e => updateSetting('lineHeight', Number(e.target.value))}/><span>{settings.lineHeight.toFixed(1)}</span></label>
          {settings.writingMode !== 'vertical' && <label>本文幅 <input type="range" min="520" max="960" step="20" value={settings.width} onChange={e => updateSetting('width', Number(e.target.value))}/><span>{settings.width}</span></label>}
          <div className="writing-choices" role="group" aria-label="組み方向">
            <button className={settings.writingMode === 'horizontal' ? 'active' : ''} onClick={() => updateSetting('writingMode','horizontal')}>横書き</button>
            <button className={settings.writingMode === 'vertical' ? 'active' : ''} onClick={() => updateSetting('writingMode','vertical')}>縦書き</button>
          </div>
          <div className="theme-choices">
            <button onClick={() => updateSetting('theme','paper')}>紙</button>
            <button onClick={() => updateSetting('theme','white')}>白</button>
            <button onClick={() => updateSetting('theme','dark')}>黒</button>
          </div>
        </aside>
      )}

      <main className={`reading-column ${settings.writingMode === 'vertical' ? 'is-vertical' : ''}`} style={{ '--reader-width': `${settings.width}px`, '--font-size': `${settings.fontSize}px`, '--line-height': settings.lineHeight }}>
        <section className="episode-head">
          {data.chapter && <p className="chapter">{data.chapter}</p>}
          <h1>{data.episodeTitle}</h1>
          <p className="counter">{data.current && data.total ? `${data.current} / ${data.total}` : ''}</p>
        </section>

        <article ref={verticalBodyRef} className={`novel-body ${settings.writingMode === 'vertical' ? 'vertical-writing' : ''}`}>
          {data.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </article>

        <nav className="episode-nav">
          <button disabled={!data.prevUrl} onClick={() => go(data.prevUrl)}>← 前の話</button>
          <button onClick={() => { if (settings.writingMode === 'vertical' && verticalBodyRef.current) { verticalBodyRef.current.scrollTo({ left: 0, behavior: 'smooth' }); } else { window.scrollTo({ top: 0, behavior: 'smooth' }); } }}>{settings.writingMode === 'vertical' ? '最初へ' : '↑ 上へ'}</button>
          <button disabled={!data.nextUrl} onClick={() => go(data.nextUrl)}>次の話 →</button>
        </nav>
      </main>

      <div className="speech-bar">
        <button onClick={speaking ? stopSpeech : () => speakFrom(speechIndex.current)}>{speaking ? '■ 停止' : '▶ 読み上げ'}</button>
        <label>速度
          <select value={rate} onChange={e => { const v = Number(e.target.value); setRate(v); if (speaking) { stopSpeech(); setTimeout(() => speakFrom(speechIndex.current), 50); } }}>
            <option value="0.8">0.8×</option><option value="1">1.0×</option><option value="1.2">1.2×</option><option value="1.4">1.4×</option><option value="1.6">1.6×</option><option value="1.8">1.8×</option>
          </select>
        </label>
      </div>
    </div>
  );
}

export default function ReadPage() {
  return <Suspense fallback={<main className="state">読み込み中…</main>}><Reader /></Suspense>;
}
