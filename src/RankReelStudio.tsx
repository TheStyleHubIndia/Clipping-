import { useMemo, useRef, useState } from 'react';

type Clip = { id: string; name: string; url: string; rank: number };

const PRESETS = ['BOLD', 'CLEAN', 'MINIMAL', 'PODCAST'] as const;

export default function RankReelStudio() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [title, setTitle] = useState('TOP 5');
  const [hook, setHook] = useState('');
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>('BOLD');
  const [captions, setCaptions] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const ordered = useMemo(() => clips, [clips]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const videos = Array.from(files).filter(f => f.type.startsWith('video/'));
    setClips(prev => [
      ...prev,
      ...videos.map((file, i) => ({
        id: crypto.randomUUID(),
        name: file.name,
        url: URL.createObjectURL(file),
        rank: prev.length + i + 1,
      })),
    ]);
  }

  function move(index: number, delta: number) {
    setClips(prev => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function shuffle() {
    setClips(prev => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
  }

  return (
    <main style={{minHeight:'100vh',background:'#0b0b0f',color:'#fff',padding:20,fontFamily:'system-ui'}}>
      <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap'}}>
        <div><h1 style={{margin:0}}>Rank Studio</h1><p style={{opacity:.7}}>Local-first ranked countdown editor</p></div>
        <button onClick={() => inputRef.current?.click()}>＋ Add clips</button>
        <input ref={inputRef} hidden type="file" accept="video/*" multiple onChange={e => addFiles(e.target.files)} />
      </header>

      <section style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:20,marginTop:20}}>
        <div style={{display:'grid',gap:12}}>
          {ordered.length === 0 && <div style={{border:'1px dashed #555',borderRadius:16,padding:40,textAlign:'center'}}>Add multiple MP4/MOV/WebM clips. Files stay in the browser.</div>}
          {ordered.map((clip, i) => (
            <article key={clip.id} style={{display:'grid',gridTemplateColumns:'90px 1fr auto',gap:12,alignItems:'center',background:'#15151b',padding:12,borderRadius:14}}>
              <video src={clip.url} muted playsInline style={{width:90,height:120,objectFit:'cover',borderRadius:10}} />
              <div><strong>#{clip.rank} — {clip.name}</strong><div style={{opacity:.65,fontSize:13,marginTop:6}}>Rank stays attached while order changes.</div></div>
              <div style={{display:'flex',gap:6}}><button disabled={i===0} onClick={() => move(i,-1)}>↑</button><button disabled={i===ordered.length-1} onClick={() => move(i,1)}>↓</button></div>
            </article>
          ))}
        </div>

        <aside style={{background:'#15151b',padding:16,borderRadius:16,height:'fit-content'}}>
          <h2 style={{marginTop:0}}>Project</h2>
          <label>Title<input value={title} onChange={e=>setTitle(e.target.value)} style={{display:'block',width:'100%',margin:'6px 0 14px',boxSizing:'border-box'}} /></label>
          <label>Hook<input value={hook} onChange={e=>setHook(e.target.value)} placeholder="Optional opening hook" style={{display:'block',width:'100%',margin:'6px 0 14px',boxSizing:'border-box'}} /></label>
          <label>Preset<select value={preset} onChange={e=>setPreset(e.target.value as typeof preset)} style={{display:'block',width:'100%',margin:'6px 0 14px'}}>{PRESETS.map(p=><option key={p}>{p}</option>)}</select></label>
          <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={captions} onChange={e=>setCaptions(e.target.checked)} /> Captions</label>
          <button onClick={shuffle} disabled={clips.length<2} style={{width:'100%',marginTop:16}}>Shuffle order</button>
          <div style={{marginTop:16,fontSize:13,opacity:.7}}>Canvas: 1080×1920 · 9:16</div>
        </aside>
      </section>

      {hook && <p style={{marginTop:20,opacity:.8}}>Hook: {hook}</p>}
    </main>
  );
}
