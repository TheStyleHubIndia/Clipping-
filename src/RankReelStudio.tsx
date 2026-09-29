import { useEffect, useMemo, useRef, useState } from 'react';

type Clip = { id:string; name:string; url:string; rank:number; file:File };
const PRESETS=['BOLD','CLEAN','MINIMAL','PODCAST','KARAOKE'] as const;

export default function RankReelStudio(){
  const [clips,setClips]=useState<Clip[]>([]);
  const [title,setTitle]=useState('TOP 5');
  const [hook,setHook]=useState('');
  const [preset,setPreset]=useState<(typeof PRESETS)[number]>('BOLD');
  const [captions,setCaptions]=useState(true);
  const [rendering,setRendering]=useState(false);
  const [output,setOutput]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [dragIndex,setDragIndex]=useState<number|null>(null);
  const inputRef=useRef<HTMLInputElement>(null);
  const ordered=useMemo(()=>clips,[clips]);

  useEffect(()=>()=>clips.forEach(c=>URL.revokeObjectURL(c.url)),[clips]);

  function addFiles(files:FileList|null){
    if(!files)return;
    const videos=Array.from(files).filter(f=>f.type.startsWith('video/')).slice(0,30-clips.length);
    setClips(prev=>[...prev,...videos.map((file,i)=>({id:crypto.randomUUID(),name:file.name,url:URL.createObjectURL(file),rank:prev.length+i+1,file}))]);
    setOutput(null);setError('');
  }
  function remove(index:number){
    setClips(prev=>prev.filter((_,i)=>i!==index));
    setOutput(null);
  }
  function move(index:number,delta:number){
    setClips(prev=>{const n=[...prev],t=index+delta;if(t<0||t>=n.length)return prev;[n[index],n[t]]=[n[t],n[index]];return n});
  }
  function shuffle(){
    setClips(prev=>{const n=[...prev];for(let i=n.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[n[i],n[j]]=[n[j],n[i]]}return n});
  }
  function dropAt(index:number){
    if(dragIndex===null||dragIndex===index)return;
    setClips(prev=>{const n=[...prev];const [item]=n.splice(dragIndex,1);n.splice(index,0,item);return n});
    setDragIndex(null);
  }
  async function render(){
    if(!clips.length||rendering)return;
    setRendering(true);setError('');setOutput(null);
    try{
      const form=new FormData();
      clips.forEach(c=>form.append('clips',c.file,c.file.name));
      form.append('ranks',JSON.stringify(clips.map(c=>c.rank)));
      form.append('title',title);form.append('hook',hook);form.append('preset',preset);form.append('captions',String(captions));
      const res=await fetch('/api/rankstudio/render',{method:'POST',body:form});
      const data=await res.json();if(!res.ok)throw new Error(data.error||'Render failed');
      setOutput(data.url);
    }catch(e:any){setError(e?.message||'Render failed')}finally{setRendering(false)}
  }

  return <main style={{minHeight:'100vh',background:'#09090b',color:'#fff',padding:16,fontFamily:'system-ui'}}>
    <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
      <div><h1 style={{margin:0}}>Rank Studio</h1><p style={{opacity:.65,margin:'5px 0'}}>Rank → shuffle → caption → 9:16 export</p></div>
      <button onClick={()=>inputRef.current?.click()}>＋ Add clips</button>
      <input ref={inputRef} hidden type="file" accept="video/*" multiple onChange={e=>addFiles(e.target.files)}/>
    </header>

    <section style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 330px',gap:16,marginTop:16}}>
      <div style={{display:'grid',gap:10}}>
        {ordered.length===0&&<div style={{border:'1px dashed #555',borderRadius:16,padding:44,textAlign:'center'}}>Add MP4, MOV or WebM clips.<br/>Drag to reorder or use ↑ ↓.</div>}
        {ordered.map((clip,i)=><article key={clip.id} draggable onDragStart={()=>setDragIndex(i)} onDragOver={e=>e.preventDefault()} onDrop={()=>dropAt(i)}
          style={{display:'grid',gridTemplateColumns:'82px 1fr auto',gap:10,alignItems:'center',background:'#15151b',padding:10,borderRadius:14,border:dragIndex===i?'1px solid #777':'1px solid transparent'}}>
          <video src={clip.url} muted playsInline style={{width:82,height:108,objectFit:'cover',borderRadius:9}}/>
          <div><strong>#{clip.rank} · {clip.name}</strong><div style={{opacity:.58,fontSize:12,marginTop:5}}>Drag to reorder · rank remains attached</div></div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap',justifyContent:'end'}}><button disabled={i===0} onClick={()=>move(i,-1)}>↑</button><button disabled={i===ordered.length-1} onClick={()=>move(i,1)}>↓</button><button onClick={()=>remove(i)}>×</button></div>
        </article>)}
      </div>

      <aside style={{background:'#15151b',padding:15,borderRadius:16,height:'fit-content',position:'sticky',top:12}}>
        <h2 style={{margin:'0 0 12px'}}>Project</h2>
        <label>Title<input value={title} onChange={e=>setTitle(e.target.value)} style={{display:'block',width:'100%',margin:'6px 0 12px',boxSizing:'border-box'}}/></label>
        <label>Hook<input value={hook} onChange={e=>setHook(e.target.value)} placeholder="Optional opening hook" style={{display:'block',width:'100%',margin:'6px 0 12px',boxSizing:'border-box'}}/></label>
        <label>Caption preset<select value={preset} onChange={e=>setPreset(e.target.value as typeof preset)} style={{display:'block',width:'100%',margin:'6px 0 12px'}}>{PRESETS.map(p=><option key={p}>{p}</option>)}</select></label>
        <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={captions} onChange={e=>setCaptions(e.target.checked)}/> Word-timed captions</label>
        <button onClick={shuffle} disabled={clips.length<2} style={{width:'100%',marginTop:12}}>🔀 Shuffle order</button>
        <button onClick={render} disabled={!clips.length||rendering} style={{width:'100%',marginTop:8,padding:12,fontWeight:700}}>{rendering?'⏳ Rendering…':'🎬 Export 9:16 MP4'}</button>
        <div style={{marginTop:12,fontSize:12,opacity:.65}}>1080×1920 · 30fps · H.264 + AAC · local FFmpeg</div>
        {error&&<div style={{marginTop:10,color:'#fb7185',fontSize:12,whiteSpace:'pre-wrap'}}>{error}</div>}
      </aside>
    </section>

    <section style={{marginTop:18,display:'grid',gridTemplateColumns:'1fr 360px',gap:16}}>
      <div style={{background:'#111116',borderRadius:16,padding:14}}>
        <h2 style={{margin:'0 0 10px'}}>9:16 Preview</h2>
        <div style={{maxWidth:360,margin:'auto',aspectRatio:'9/16',background:'#000',borderRadius:14,position:'relative',overflow:'hidden'}}>
          {ordered[0]&&<video src={ordered[0].url} muted playsInline autoPlay loop style={{width:'100%',height:'100%',objectFit:'cover'}}/>}
          <div style={{position:'absolute',top:14,left:14,background:'rgba(0,0,0,.6)',padding:'8px 12px',borderRadius:8,fontWeight:800}}>#{ordered[0]?.rank??1}</div>
          {title&&<div style={{position:'absolute',top:18,left:70,right:12,textAlign:'center',fontWeight:900,fontSize:20,textShadow:'0 2px 4px #000'}}>{title}</div>}
          {hook&&<div style={{position:'absolute',top:70,left:18,right:18,textAlign:'center',fontWeight:700,textShadow:'0 2px 4px #000'}}>{hook}</div>}
          {captions&&<div style={{position:'absolute',bottom:100,left:16,right:16,textAlign:'center',fontWeight:900,fontSize:23,textShadow:'0 3px 5px #000'}}>WORD-TIMED CAPTIONS</div>}
        </div>
      </div>
      <div style={{background:'#15151b',borderRadius:16,padding:15}}>
        <h2 style={{marginTop:0}}>Export pipeline</h2>
        <ol style={{lineHeight:1.8,paddingLeft:22,opacity:.8}}>
          <li>Upload clips</li><li>Rank stays attached</li><li>Reorder / shuffle</li><li>9:16 crop + 30fps</li><li>Rank + title + hook burn-in</li><li>Local word-timed captions</li><li>H.264 + AAC MP4 validation</li>
        </ol>
        {output&&<><h3>Output</h3><video src={output} controls playsInline style={{width:'100%',aspectRatio:'9/16',background:'#000',borderRadius:12}}/><a href={output} download style={{display:'inline-block',marginTop:10}}>⬇ Download MP4</a></>}
      </div>
    </section>
  </main>;
}
