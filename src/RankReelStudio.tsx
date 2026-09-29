import { useMemo, useRef, useState } from 'react';

type Clip = { id: string; name: string; url: string; rank: number; file: File };
const PRESETS = ['BOLD', 'CLEAN', 'MINIMAL', 'PODCAST'] as const;

export default function RankReelStudio() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [title, setTitle] = useState('TOP 5');
  const [hook, setHook] = useState('');
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>('BOLD');
  const [captions, setCaptions] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const ordered = useMemo(() => clips, [clips]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const videos = Array.from(files).filter(f => f.type.startsWith('video/'));
    setClips(prev => [...prev, ...videos.map((file, i) => ({
      id: crypto.randomUUID(), name: file.name, url: URL.createObjectURL(file),
      rank: prev.length + i + 1, file
    }))]);
    setOutput(null); setError('');
  }

  function move(index: number, delta: number) {
    setClips(prev => {
      const next = [...prev]; const target = index + delta;
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

  async function render() {
    if (!clips.length || rendering) return;
    setRendering(true); setError(''); setOutput(null);
    try {
      const form = new FormData();
      clips.forEach(c => form.append('clips', c.file, c.file.name));
      form.append('ranks', JSON.stringify(clips.map(c => c.rank)));
      form.append('title', title);
      form.append('hook', hook);
      form.append('preset', preset);
      form.append('captions', String(captions));
      const res = await fetch('/api/rankstudio/render', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Render failed');
      setOutput(data.url);
    } catch (e: any) {
      setError(e?.message || 'Render failed');
    } finally { setRendering(false); }
  }

  return (
    <main style={{minHeight:'100vh',background:'#0b0b0f',color:'#fff',padding:20,fontFamily:'system-ui'}}>
      <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap'}}>
        <div><h1 style={{margin:0}}>Rank Studio</h1><p style={{opacity:.7}}>Free local-first ranked countdown editor</p></div>
        <button onClick={() => inputRef.current?.click()}>＋ Add clips</button>
        <input ref={inputRef} hidden type="file" accept="video/*" multiple onChange={e => addFiles(e.target.files)} />
      </header>

      <section style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:20,marginTop:20}}>
        <div style={{display:'grid',gap:12}}>
          {ordered.length === 0 && <div style={{border:'1px dashed #555',borderRadius:16,padding:40,textAlign:'center'}}>Add MP4/MOV/WebM clips. The browser keeps the source files until export.</div>}
          {ordered.map((clip, i) => (
            <article key={clip.id} style={{display:'grid',gridTemplateColumns:'90px 1fr auto',gap:12,alignItems:'center',background:'#15151b',padding:12,borderRadius:14}}>
              <video src={clip.url} muted playsInline controls={false} style={{width:90,height:120,objectFit:'cover',borderRadius:10}} />
              <div><strong>#{clip.rank} — {clip.name}</strong><div style={{opacity:.65,fontSize:13,marginTop:6}}>Rank stays attached when you reorder or shuffle.</div></div>
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
          <button onClick={render} disabled={!clips.length || rendering} style={{width:'100%',marginTop:10,padding:12,fontWeight:700}}>{rendering ? 'Rendering FFmpeg MP4…' : 'Export 9:16 MP4'}</button>
          <div style={{marginTop:16,fontSize:13,opacity:.7}}>1080×1920 · 30fps · H.264 + AAC</div>
          {error && <div style={{marginTop:12,color:'#fb7185',fontSize:13}}>{error}</div>}
        </aside>
      </section>

      {output && <section style={{marginTop:24,maxWidth:360}}><h2>Rendered output</h2><video src={output} controls playsInline style={{width:'100%',aspectRatio:'9/16',objectFit:'contain',background:'#000',borderRadius:16}} /><a href={output} download style={{display:'inline-block',marginTop:12}}>Download MP4</a></section>}
      {hook && <p style={{marginTop:20,opacity:.8}}>Hook: {hook}</p>}
    </main>
  );
}
