import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../dist");
app.use(express.static(publicDir));
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "jobs");
fs.mkdirSync(root, { recursive: true });

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const wait = m => new Promise(r => setTimeout(r, m));
function ff(a) {
  return new Promise((ok, no) => {
    const p = spawn(ffmpegPath, a);
    let e = "";
    p.stderr.on("data", d => e += d);
    p.on("close", c => c ? no(Error(e.slice(-3000))) : ok());
  });
}

async function plan(topic) {
  if (!ai) throw Error("GEMINI_API_KEY is not configured.");
  let r = await ai.models.generateContent({
    model: process.env.TEXT_MODEL || "gemini-3.8-flash",
    contents: `Create JSON only for a FACTORA MINDS English YouTube Short about: ${topic}. Return {"title":"","description":"","script":"","scenes":[{"prompt":""},{"prompt":""},{"prompt":""},{"prompt":""},{"prompt":""}]}. Make it factually cautious, 20-45 seconds, global English audience, cinematic documentary visuals, no invented quotes, no visible text/logos, each scene an 8-second vertical shot.`
  });
  return JSON.parse((r.text || "").replace(/\`\`\`json|\`\`\`/g, "").trim());
}

async function veo(p, q, out) {
  if (!ai) throw Error("GEMINI_API_KEY is not configured.");
  let op = await ai.models.generateVideos({
    model: process.env.VEO_MODEL || "veo-3.1-generate-preview",
    prompt: p,
    config: { aspectRatio: "9:16", resolution: q, numberOfVideos: 1 }
  });
  while (!op.done) {
    await wait(10000);
    op = await ai.operations.getVideosOperation({ operation: op });
  }
  if (!op.response?.generatedVideos?.[0]?.video) throw Error("Veo returned no video");
  await ai.files.download({ file: op.response.generatedVideos[0].video, downloadPath: out });
}

function clean(s, fallback = "") {
  return String(s || fallback).replace(/\s+/g, " ").trim();
}

function flowPack(topic, facts = "") {
  const subject = clean(topic, "An unexplained science mystery");
  const source = clean(facts);
  const verified = source || "[PASTE VERIFIED FACTS / SOURCE NOTES HERE BEFORE PUBLISHING]";
  const hook = `What if the thing you thought you knew about ${subject.toLowerCase()} is only part of the story?`;
  const narration = [
    hook,
    `Here is the surprising part: ${verified}`,
    "The key is to show the evidence, not exaggerate it.",
    "So remember this the next time you see or hear about it.",
    "Follow FACTORA MINDS for more facts you won't forget."
  ].join(" ");
  const visualBase = "Vertical 9:16 cinematic documentary footage, photorealistic, natural motion, premium science/knowledge channel look, dramatic but believable lighting, shallow depth of field, no text, no subtitles, no logos, no watermark.";
  const scenes = [
    `SCENE 1 — HOOK (0-7s): Visualize ${subject} as an intriguing cinematic mystery. Start with an immediate visual reveal and a subtle camera push-in. ${visualBase}`,
    `SCENE 2 — CONTEXT (7-14s): Show a clear visual representation of ${subject}, using realistic environments and objects that communicate scale and context. ${visualBase}`,
    `SCENE 3 — EVIDENCE (14-21s): Visually communicate the verified fact or evidence: ${verified}. Use an accurate documentary-style visualization; do not invent people, quotes, labels, numbers, or events. ${visualBase}`,
    `SCENE 4 — TWIST (21-28s): Create a visually surprising but scientifically/physically plausible continuation connected to ${subject}. No fantasy unless the topic itself is fictional. ${visualBase}`,
    `SCENE 5 — PAYOFF (28-35s): End on a memorable cinematic image that reinforces ${subject}. Smooth camera movement, strong composition, clean ending frame. ${visualBase}`
  ];
  const title = `${subject}: The Part Nobody Talks About`;
  const description = `A fast, cinematic FACTORA MINDS Short about ${subject}. Verify every factual claim before publishing. #FACTORA #Minds #Facts`;
  const hashtags = "#FACTORA #FACTRAMINDS #Facts #Science #Knowledge #Shorts";
  return {
    brand: "FACTORA MINDS",
    mode: "GOOGLE FLOW",
    topic: subject,
    verification: source ? "Source notes supplied by creator. Still review before publishing." : "DRAFT — add verified facts/source notes before publishing.",
    hook,
    narration,
    scenes,
    title,
    description,
    hashtags,
    flowInstructions: [
      "Open Google Flow and create a new project.",
      "Use Storyboard/Plan when helpful, then generate each scene separately.",
      "Keep all scenes vertical 9:16 and maintain the same visual style/subject.",
      "Use the scene prompts below one at a time; do not paste the SCENE labels into the prompt.",
      "Generate/select the strongest take for each scene.",
      "Assemble the selected clips in Flow or download them for final assembly.",
      "Add captions and final audio only after checking factual accuracy."
    ]
  };
}

app.get("/api/health", (q, r) => r.json({ ok: true, brand: "FACTORA MINDS", flowMode: true }));

app.post("/api/flow-pack", (req, res) => {
  const { topic, facts } = req.body || {};
  if (!topic) return res.status(400).json({ error: "Topic required" });
  res.json(flowPack(topic, facts));
});

app.post("/api/generate-short", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY is not configured. Use GOOGLE FLOW mode instead." });
  const { topic, quality = "720p" } = req.body || {};
  if (!topic) return res.status(400).json({ error: "Topic required" });
  const id = crypto.randomUUID(), dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const p = await plan(topic), clips = [];
    for (let i = 0; i < p.scenes.length; i++) {
      const o = path.join(dir, `scene-${i + 1}.mp4`);
      await veo(p.scenes[i].prompt, quality, o);
      clips.push(o);
    }
    const list = path.join(dir, "list.txt"), out = path.join(dir, "factora-minds.mp4");
    fs.writeFileSync(list, clips.map(x => `file '${x}'`).join("\n"));
    await ff(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", out]);
    app.use(`/generated/${id}`, express.static(dir));
    res.json({ title: p.title, description: p.description, script: p.script, videoUrl: `/generated/${id}/factora-minds.mp4` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(process.env.PORT || 8787, () => console.log("FACTORA MINDS running"));
