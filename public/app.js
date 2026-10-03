(() => {
  const $ = (id) => document.getElementById(id);
  const sample = 'https://ncode.syosetu.com/n3669fw/420/';
  const defaults = { fontSize: 19, lineHeight: 2.0, theme: 'paper', width: 720, writingMode: 'horizontal' };
  let settings = loadJSON('narou-reader-settings', defaults);
  let data = null;
  let speaking = false;
  let speechIndex = 0;
  let speechChunks = [];
  let jsonpSerial = 0;

  function loadJSON(key, fallback) { try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return fallback; } }
  function validEpisodeUrl(value) { return /^https:\/\/ncode\.syosetu\.com\/n[0-9a-z]+\/\d+\/?$/i.test(value); }
  function absolute(href, base) { try { return href ? new URL(href, base).toString() : null; } catch { return null; } }
  function clean(text='') { return text.replace(/\u00a0/g,' ').replace(/[ \t]+\n/g,'\n').trim(); }

  function renderHistory() {
    let history = [];
    try { history = JSON.parse(localStorage.getItem('narou-reader-history') || '[]').slice(0,6); } catch {}
    $('historyList').innerHTML = '';
    $('historyCard').classList.toggle('hidden', !history.length);
    history.forEach(item => {
      const b = document.createElement('button');
      const s = document.createElement('span'); s.textContent = item.workTitle || '作品';
      const st = document.createElement('strong'); st.textContent = item.episodeTitle || item.url;
      b.append(s, st); b.onclick = () => openEpisode(item.url);
      $('historyList').appendChild(b);
    });
  }

  function showHome() {
    stopSpeech(); data = null;
    $('reader').classList.add('hidden'); $('state').classList.add('hidden'); $('home').classList.remove('hidden');
    document.title = 'なろうReader'; renderHistory();
  }
  function showState(text, error=false) {
    $('home').classList.add('hidden'); $('reader').classList.add('hidden'); $('state').classList.remove('hidden');
    $('stateText').textContent = text; $('spinner').classList.toggle('hidden', error); $('stateBack').classList.toggle('hidden', !error);
  }

  function proxyUrl() { return localStorage.getItem('narou-reader-proxy') || ''; }
  function updateProxyState() { $('proxyState').textContent = proxyUrl() ? '本文取得設定：完了' : '※最初に本文取得用URLの設定が必要です'; }
  function openProxyDialog() { $('proxyUrl').value = proxyUrl(); $('proxyDialog').showModal(); }

  function fetchHtml(url) {
    return new Promise((resolve, reject) => {
      const base = proxyUrl();
      if (!base) { reject(new Error('本文取得用URLが未設定です。')); return; }
      const callback = `__narouJsonp${Date.now()}_${jsonpSerial++}`;
      const script = document.createElement('script');
      const timer = setTimeout(() => finish(new Error('本文取得がタイムアウトしました。')), 20000);
      const finish = (err, payload) => {
        clearTimeout(timer); try { delete window[callback]; } catch {} script.remove();
        err ? reject(err) : resolve(payload);
      };
      window[callback] = (payload) => {
        if (!payload || payload.ok !== true || !payload.html) finish(new Error(payload?.error || '本文を取得できませんでした。'));
        else finish(null, payload.html);
      };
      script.onerror = () => finish(new Error('本文取得用URLへ接続できませんでした。'));
      const sep = base.includes('?') ? '&' : '?';
      script.src = `${base}${sep}callback=${encodeURIComponent(callback)}&url=${encodeURIComponent(url)}&_=${Date.now()}`;
      document.head.appendChild(script);
    });
  }

  function findBodyRoot(doc) {
    const selectors = ['#novel_honbun','.js-novel-text.p-novel__text','.p-novel__text','.js-novel-text','[class*="novel__text"]','[class*="novel-text"]'];
    let best = null;
    for (const sel of selectors) {
      const nodes = [...doc.querySelectorAll(sel)];
      for (const n of nodes) {
        const len = clean(n.textContent).length;
        if (len > 80 && (!best || len > best.len)) best = { el:n, len };
      }
    }
    return best?.el || null;
  }
  function findNav(doc, labels, base) {
    for (const a of doc.querySelectorAll('a[href]')) {
      const label = clean(a.textContent);
      if (labels.some(x => label === x || label.includes(x))) {
        const u = absolute(a.getAttribute('href'), base);
        if (u && u.includes('ncode.syosetu.com')) return u;
      }
    }
    return null;
  }
  function parseEpisode(html, sourceUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,noscript,iframe').forEach(x => x.remove());
    const root = findBodyRoot(doc);
    if (!root) throw new Error('本文を取得できませんでした。ページ構造が変わった可能性があります。');
    let paragraphs = [...root.querySelectorAll('p')].map(p => clean(p.textContent)).filter(Boolean);
    if (!paragraphs.length) paragraphs = clean(root.textContent).split(/\n{2,}/).map(clean).filter(Boolean);
    if (!paragraphs.length) throw new Error('本文が見つかりませんでした。');

    const pageTitle = clean(doc.title);
    const h1 = clean(doc.querySelector('h1')?.textContent || '');
    let episodeTitle = h1 || pageTitle.split(' - ').at(-1) || '本文';
    let workTitle = clean(doc.querySelector('.p-novel__title')?.textContent || '');
    if (!workTitle || workTitle === episodeTitle) {
      const episodePath = new URL(sourceUrl).pathname.split('/').filter(Boolean)[0];
      const candidate = [...doc.querySelectorAll('a[href]')].find(a => {
        const href = absolute(a.getAttribute('href'), sourceUrl) || '';
        try { return new URL(href).pathname.replace(/\/$/,'') === `/${episodePath}`; } catch { return false; }
      });
      workTitle = clean(candidate?.textContent || '') || pageTitle.split(' - ')[0] || '作品';
    }
    const bodyText = clean(doc.body?.textContent || '');
    const count = bodyText.match(/(\d+)\s*\/\s*(\d+)/);
    const chapter = clean(doc.querySelector('.p-novel__chapter-title,.chapter_title')?.textContent || '');
    return {
      sourceUrl, workTitle, episodeTitle, chapter,
      current: count ? Number(count[1]) : null, total: count ? Number(count[2]) : null,
      prevUrl: findNav(doc,['前へ','前話'],sourceUrl), nextUrl: findNav(doc,['次へ','次話'],sourceUrl),
      indexUrl: findNav(doc,['目次'],sourceUrl), paragraphs
    };
  }

  async function openEpisode(url) {
    const value = String(url || '').trim();
    if (!validEpisodeUrl(value)) { alert('「小説家になろう」の各話URLを入力してください。'); return; }
    if (!proxyUrl()) { openProxyDialog(); return; }
    showState('本文を読み込んでいます…');
    try {
      const html = await fetchHtml(value);
      data = parseEpisode(html, value);
      saveHistory(data); renderReader();
    } catch (e) { showState(e.message || '読み込みに失敗しました。', true); }
  }

  function saveHistory(j) {
    try {
      const old = JSON.parse(localStorage.getItem('narou-reader-history') || '[]');
      const next = [{url:j.sourceUrl,workTitle:j.workTitle,episodeTitle:j.episodeTitle,at:Date.now()},...old.filter(x=>x.url!==j.sourceUrl)].slice(0,20);
      localStorage.setItem('narou-reader-history', JSON.stringify(next));
    } catch {}
  }

  function renderReader() {
    $('state').classList.add('hidden'); $('home').classList.add('hidden'); $('reader').classList.remove('hidden');
    $('workTitle').textContent = data.workTitle; $('episodeTitle').textContent = data.episodeTitle; $('chapter').textContent = data.chapter || '';
    const c = data.current && data.total ? `${data.current} / ${data.total}` : '';
    $('countTop').textContent = c; $('counter').textContent = c; document.title = `${data.episodeTitle} | なろうReader`;
    $('novelBody').innerHTML = '';
    data.paragraphs.forEach(t => { const p=document.createElement('p'); p.textContent=t; $('novelBody').appendChild(p); });
    $('prevButton').disabled = !data.prevUrl; $('nextButton').disabled = !data.nextUrl;
    speechChunks = makeSpeechChunks(data.paragraphs); speechIndex = 0; applySettings();
    requestAnimationFrame(restorePosition);
  }

  function makeSpeechChunks(paragraphs) {
    const out=[]; let current='';
    paragraphs.forEach(p => { if ((current+p).length>450 && current) { out.push(current); current=''; } current += (current?'。':'') + p; });
    if (current) out.push(current); return out;
  }
  function stopSpeech() { if ('speechSynthesis' in window) speechSynthesis.cancel(); speaking=false; $('speechButton').textContent='▶ 読み上げ'; }
  function speakFrom(index=0) {
    if (!('speechSynthesis' in window) || !speechChunks.length) return;
    stopSpeech(); speaking=true; speechIndex=index; $('speechButton').textContent='■ 停止';
    const next=()=>{ if(!speaking||speechIndex>=speechChunks.length){stopSpeech();return;} const u=new SpeechSynthesisUtterance(speechChunks[speechIndex]); u.lang='ja-JP'; u.rate=Number($('speechRate').value); u.onend=()=>{speechIndex++;next();}; u.onerror=stopSpeech; speechSynthesis.speak(u); }; next();
  }

  function applySettings() {
    settings = loadJSON('narou-reader-settings', defaults);
    const shell=$('reader'), column=$('readingColumn'), body=$('novelBody');
    shell.className = `reader-shell theme-${settings.theme}`;
    column.style.setProperty('--reader-width', `${settings.width}px`); column.style.setProperty('--font-size', `${settings.fontSize}px`); column.style.setProperty('--line-height', settings.lineHeight);
    column.classList.toggle('is-vertical', settings.writingMode==='vertical'); body.classList.toggle('vertical-writing', settings.writingMode==='vertical');
    $('widthRow').classList.toggle('hidden', settings.writingMode==='vertical');
    $('horizontalButton').classList.toggle('active', settings.writingMode==='horizontal'); $('verticalButton').classList.toggle('active', settings.writingMode==='vertical');
    $('fontSize').value=settings.fontSize; $('lineHeight').value=settings.lineHeight; $('readerWidth').value=settings.width;
    $('fontSizeValue').textContent=`${settings.fontSize}px`; $('lineHeightValue').textContent=Number(settings.lineHeight).toFixed(1); $('readerWidthValue').textContent=settings.width;
    $('topButton').textContent=settings.writingMode==='vertical'?'最初へ':'↑ 上へ'; updateProgress();
  }
  function updateSetting(k,v){ settings={...settings,[k]:v}; localStorage.setItem('narou-reader-settings',JSON.stringify(settings)); applySettings(); }

  function restorePosition() {
    if (!data) return;
    if (settings.writingMode==='vertical') {
      const el=$('novelBody'); const saved=Number(localStorage.getItem(`narou-reader-vertical:${data.sourceUrl}`)||0);
      el.scrollLeft=-saved; if(Math.abs(el.scrollLeft)<1)el.scrollLeft=saved;
    } else {
      const saved=Number(localStorage.getItem(`narou-reader-scroll:${data.sourceUrl}`)||0); if(saved>0)window.scrollTo({top:saved});
    }
    updateProgress();
  }
  function updateProgress() {
    if (!data) return;
    let pct=0;
    if (settings.writingMode==='vertical') { const el=$('novelBody'); const max=Math.max(0,el.scrollWidth-el.clientWidth),pos=Math.min(max,Math.abs(el.scrollLeft)); pct=max?pos/max*100:0; localStorage.setItem(`narou-reader-vertical:${data.sourceUrl}`,String(pos)); }
    else { const max=document.documentElement.scrollHeight-window.innerHeight; pct=max?window.scrollY/max*100:0; localStorage.setItem(`narou-reader-scroll:${data.sourceUrl}`,String(window.scrollY)); }
    $('progress').style.width=`${Math.max(0,Math.min(100,pct))}%`;
  }

  $('urlForm').addEventListener('submit', e=>{e.preventDefault();openEpisode($('episodeUrl').value);});
  $('proxySettings').onclick=openProxyDialog; $('proxyCancel').onclick=()=>$('proxyDialog').close();
  $('proxyForm').addEventListener('submit',e=>{e.preventDefault();const u=$('proxyUrl').value.trim();if(!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/i.test(u)){alert('Apps ScriptのウェブアプリURL（/exec）を入力してください。');return;} localStorage.setItem('narou-reader-proxy',u);$('proxyDialog').close();updateProxyState();});
  $('homeButton').onclick=showHome; $('stateBack').onclick=showHome; $('settingsButton').onclick=()=>$('settingsPanel').classList.toggle('hidden');
  $('prevButton').onclick=()=>data?.prevUrl&&openEpisode(data.prevUrl); $('nextButton').onclick=()=>data?.nextUrl&&openEpisode(data.nextUrl);
  $('topButton').onclick=()=>{if(settings.writingMode==='vertical'){$('novelBody').scrollTo({left:0,behavior:'smooth'});}else window.scrollTo({top:0,behavior:'smooth'});};
  $('fontSize').oninput=e=>updateSetting('fontSize',Number(e.target.value)); $('lineHeight').oninput=e=>updateSetting('lineHeight',Number(e.target.value)); $('readerWidth').oninput=e=>updateSetting('width',Number(e.target.value));
  $('horizontalButton').onclick=()=>updateSetting('writingMode','horizontal'); $('verticalButton').onclick=()=>updateSetting('writingMode','vertical'); document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>updateSetting('theme',b.dataset.theme));
  $('speechButton').onclick=()=>speaking?stopSpeech():speakFrom(speechIndex); $('speechRate').onchange=()=>{if(speaking){const i=speechIndex;stopSpeech();setTimeout(()=>speakFrom(i),50);}};
  window.addEventListener('scroll',()=>{if(data&&settings.writingMode!=='vertical')updateProgress();},{passive:true}); $('novelBody').addEventListener('scroll',()=>{if(data&&settings.writingMode==='vertical')updateProgress();},{passive:true});
  window.addEventListener('beforeunload',stopSpeech);

  $('episodeUrl').value=sample; updateProxyState(); renderHistory();
})();
