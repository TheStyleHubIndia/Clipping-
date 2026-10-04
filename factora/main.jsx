import React,{useState}from"react";
import{createRoot}from"react-dom/client";
import"./style.css";

const FLOW_URL="https://labs.google/fx/tools/flow";

function App(){
  const[t,setT]=useState("Why do humans get déjà vu?");
  const[f,setF]=useState("");
  const[q,setQ]=useState("720p");
  const[mode,setMode]=useState("flow");
  const[r,setR]=useState(null);
  const[s,setS]=useState("");
  const[b,setB]=useState(false);

  async function makeFlow(){
    setB(true);setR(null);setS("Building your Google Flow production pack…");
    try{
      const x=await fetch("/api/flow-pack",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:t,facts:f})});
      const d=await x.json();if(!x.ok)throw Error(d.error);setR(d);setS("Flow pack ready — no Gemini API quota used.");
    }catch(e){setS(e.message||"Could not create Flow pack")}finally{setB(false)}
  }

  async function makeApi(){
    setB(true);setR(null);setS("Generating with Gemini/Veo API…");
    try{
      const x=await fetch("/api/generate-short",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:t,quality:q})});
      const d=await x.json();if(!x.ok)throw Error(d.error);setR(d);setS("Complete.");
    }catch(e){setS(e.message||"Generation failed")}finally{setB(false)}
  }

  function copyAll(){
    if(!r)return;
    const text=[r.title,r.description,r.narration,r.hashtags,...(r.scenes||[])].filter(Boolean).join("\n\n");
    navigator.clipboard?.writeText(text);setS("Copied production pack.");
  }

  function downloadPack(){
    if(!r)return;
    const text=JSON.stringify(r,null,2);
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:"application/json"}));a.download="factora-minds-flow-pack.json";a.click();URL.revokeObjectURL(a.href);
  }

  return <main>
    <header><strong>◉ FACTORA <i>MINDS</i></strong><small>Facts You Won’t Forget.</small></header>
    <section>
      <label>AI SHORTS STUDIO</label>
      <h1>One idea.<br/><em>Production-ready.</em></h1>
      <p>Global English • 9:16 • Cinematic • Faceless</p>

      <div className="tabs">
        <button className={mode==="flow"?"active":""} onClick={()=>setMode("flow")}>GOOGLE FLOW MODE</button>
        <button className={mode==="api"?"active":""} onClick={()=>setMode("api")}>GEMINI API MODE</button>
      </div>

      <div className="card">
        <span>TOPIC / FACT</span>
        <textarea value={t} onChange={e=>setT(e.target.value)} />
        {mode==="flow"&&<>
          <span>VERIFIED FACTS / SOURCE NOTES (RECOMMENDED)</span>
          <textarea className="notes" value={f} onChange={e=>setF(e.target.value)} placeholder="Paste the facts/source notes you want the Short to use. Leave blank to create a clearly marked draft." />
        </>}
        <div className="row">
          {mode==="api"&&<select value={q}onChange={e=>setQ(e.target.value)}><option>720p</option><option>1080p</option><option>4k</option></select>}
          <button disabled={b} onClick={mode==="flow"?makeFlow:makeApi}>{b?"WORKING…":mode==="flow"?"CREATE FLOW PACK →":"GENERATE SHORT →"}</button>
        </div>
        <div className="status">{s}</div>
      </div>
    </section>

    {r&&<article>
      <div className="resultTop">
        <div><h2>{r.title}</h2><p>{r.description}</p></div>
        {mode==="flow"&&<a className="flowBtn" href={FLOW_URL} target="_blank" rel="noreferrer">OPEN GOOGLE FLOW ↗</a>}
      </div>
      {r.verification&&<div className="warning">{r.verification}</div>}
      {r.narration&&<><h3>NARRATION</h3><pre>{r.narration}</pre></>}
      {r.scenes&&<><h3>5 CINEMATIC FLOW PROMPTS</h3>{r.scenes.map((x,i)=><div className="scene" key={i}><b>SCENE {i+1}</b><p>{x.replace(/^SCENE \d+ — [^:]+:\s*/,"")}</p><button onClick={()=>navigator.clipboard?.writeText(x.replace(/^SCENE \d+ — [^:]+:\s*/,""))}>COPY PROMPT</button></div>)}</>}
      {r.hashtags&&<><h3>HASHTAGS</h3><pre>{r.hashtags}</pre></>}
      {r.flowInstructions&&<><h3>FLOW WORKFLOW</h3><ol>{r.flowInstructions.map((x,i)=><li key={i}>{x}</li>)}</ol></>}
      {mode==="flow"&&<div className="actions"><button onClick={copyAll}>COPY ALL</button><button onClick={downloadPack}>DOWNLOAD FLOW PACK</button></div>}
      {r.videoUrl&&<><video controls src={r.videoUrl}/><a className="download" href={r.videoUrl} download>DOWNLOAD MP4</a><pre>{r.script}</pre></>}
    </article>}
  </main>
}
createRoot(document.getElementById("root")).render(<App/>);
