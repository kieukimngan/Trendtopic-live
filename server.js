import express from "express";
import Parser from "rss-parser";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();
const app = express();
const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "Mozilla/5.0 TrendTopicLive/3.0 (+research app)" }
});
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const CACHE_MS = Number(process.env.CACHE_MINUTES || 10) * 60 * 1000;

const categories = {
  ai: {label:"AI & tương lai", vi:"(AI OR robot OR \"trí tuệ nhân tạo\" OR tự động hóa)", en:"(AI OR robotics OR \"artificial intelligence\" OR automation)"},
  tech: {label:"Công nghệ mới", vi:"(\"công nghệ mới\" OR thiết bị mới OR \"đổi mới số\" OR internet)", en:"(\"emerging technology\" OR innovation OR \"digital transformation\" OR internet)"},
  cyber: {label:"An ninh mạng", vi:"(\"an ninh mạng\" OR \"dữ liệu cá nhân\" OR \"lừa đảo số\" OR bảo mật)", en:"(\"cybersecurity\" OR privacy OR \"data breach\" OR \"online scam\")"},
  business: {label:"Kinh doanh & khởi nghiệp", vi:"(khởi nghiệp OR doanh nghiệp OR \"mô hình kinh doanh\" OR đổi mới)", en:"(startup OR entrepreneurship OR business OR innovation)"},
  science: {label:"Khoa học", vi:"(\"nghiên cứu mới\" OR \"khám phá khoa học\" OR vật lý OR sinh học)", en:"(\"scientific research\" OR science discovery OR physics OR biology)"},
  space: {label:"Không gian", vi:"(vũ trụ OR không gian OR vệ tinh OR thiên văn)", en:"(space OR satellite OR astronomy OR \"space exploration\")"},
  health: {label:"Sức khỏe", vi:"(\"sức khỏe\" OR y tế OR dinh dưỡng OR wellbeing)", en:"(health OR healthcare OR nutrition OR wellbeing)"},
  psychology: {label:"Tâm lý & hành vi", vi:"(tâm lý OR \"hành vi con người\" OR \"sức khỏe tinh thần\" OR hạnh phúc)", en:"(psychology OR \"human behavior\" OR \"mental health\" OR happiness)"},
  environment: {label:"Môi trường & khí hậu", vi:"(khí hậu OR môi trường OR \"đa dạng sinh học\" OR ô nhiễm)", en:"(climate OR environment OR biodiversity OR pollution)"},
  energy: {label:"Năng lượng", vi:"(\"năng lượng sạch\" OR \"điện tái tạo\" OR pin OR \"chuyển dịch năng lượng\")", en:"(\"clean energy\" OR renewable OR battery OR \"energy transition\")"},
  education: {label:"Giáo dục", vi:"(giáo dục OR học tập OR \"kỹ năng tương lai\" OR trường học)", en:"(education OR learning OR \"future skills\" OR school)"},
  society: {label:"Xã hội", vi:"(\"đời sống xã hội\" OR dân số OR đô thị hóa OR cộng đồng)", en:"(society OR population OR urbanization OR community)"},
  culture: {label:"Văn hóa & sáng tạo", vi:"(văn hóa OR di sản OR bản sắc OR nghệ thuật OR sáng tạo)", en:"(culture OR heritage OR identity OR art OR creativity)"},
  lifestyle: {label:"Phong cách sống", vi:"(\"lối sống\" OR \"xu hướng sống\" OR wellbeing OR thói quen)", en:"(lifestyle OR wellbeing OR \"living trends\" OR habits)"},
  food: {label:"Ẩm thực & thực phẩm", vi:"(ẩm thực OR thực phẩm OR \"xu hướng ăn uống\" OR nông nghiệp)", en:"(food OR nutrition OR agriculture OR \"food trends\")"},
  design: {label:"Thiết kế & kiến trúc", vi:"(thiết kế OR kiến trúc OR \"không gian sống\" OR \"đô thị thông minh\")", en:"(design OR architecture OR \"living space\" OR \"smart city\")"},
  travel: {label:"Du lịch", vi:"(du lịch OR \"điểm đến\" OR hàng không OR \"du lịch bền vững\")", en:"(travel OR tourism OR aviation OR \"sustainable tourism\")"},
  mobility: {label:"Giao thông tương lai", vi:"(\"xe điện\" OR \"giao thông thông minh\" OR \"xe tự hành\" OR \"vận tải xanh\")", en:"(\"electric vehicle\" OR \"smart mobility\" OR \"autonomous vehicle\" OR \"green transport\")"},
  work: {label:"Công việc tương lai", vi:"(\"tương lai việc làm\" OR \"kỹ năng nghề nghiệp\" OR \"làm việc từ xa\" OR tự động hóa)", en:"(\"future of work\" OR \"workplace skills\" OR remote work OR automation)"},
  world: {label:"Thế giới", vi:"(\"quan hệ quốc tế\" OR xã hội toàn cầu OR \"chính sách công\")", en:"(geopolitics OR \"international relations\" OR \"public policy\" OR global society)"},
  sports: {label:"Thể thao", vi:"(thể thao OR bóng đá OR vận động viên OR giải đấu)", en:"(sports OR football OR athlete OR tournament)"}
};
const blocked = ["giá vàng","tỷ giá","chứng khoán","cổ phiếu","lãi suất","bitcoin","tiền ảo","doanh thu","lợi nhuận","mở bán","khuyến mãi","săn sale","xổ số","soi kèo","giá xăng","giá dầu"];
const recentTopics = [];
const cache = new Map();

const feedUrl = (query, scope) => {
  const settings = scope === "vn"
    ? {hl:"vi", gl:"VN", ceid:"VN:vi"}
    : {hl:"en-US", gl:"US", ceid:"US:en"};
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${settings.hl}&gl=${settings.gl}&ceid=${settings.ceid}`;
};
const cleanTitle = (s="") => s.replace(/\s*[-–—]\s*[^-–—]{2,80}$/,"").replace(/\s+/g," ").trim();
const domainOf = (link="") => { try { return new URL(link).hostname.replace(/^www\./,""); } catch { return ""; } };
const sample = (arr,n) => [...arr].sort(()=>Math.random()-.5).slice(0,n);
const normalize = s => s.toLocaleLowerCase("vi").replace(/\s+/g," ").trim();

async function fetchFeed(query, scope) {
  const feed = await parser.parseURL(feedUrl(query, scope));
  return feed.items.map(item => ({
    title: cleanTitle(item.title),
    link: item.link || "",
    publishedAt: item.isoDate || item.pubDate || null,
    source: domainOf(item.link)
  }));
}
async function getHeadlines(categoryId, scope, topicHint) {
  const category = categories[categoryId];
  const key = `${categoryId}|${scope}|${normalize(topicHint || "")}`;
  const cached = cache.get(key);
  if (cached && Date.now()-cached.time < CACHE_MS) return {...cached, cached:true};

  const query = topicHint?.trim() ? `"${topicHint.trim()}"` : category[scope === "vn" ? "vi" : "en"];
  const targets = scope === "all" ? ["vn","global"] : [scope];
  const settled = await Promise.allSettled(targets.map(target => fetchFeed(query, target)));
  const raw = settled.filter(x=>x.status==="fulfilled").flatMap(x=>x.value);
  if (!raw.length) throw new Error("Không kết nối được nguồn RSS. Hãy thử lại sau ít phút.");

  const seen = new Set();
  const headlines = raw.filter(item => {
    const title = normalize(item.title);
    if (!title || blocked.some(word=>title.includes(word)) || seen.has(title)) return false;
    seen.add(title); return true;
  }).slice(0,60);
  if (!headlines.length) throw new Error("Có tin nhưng không có kết quả phù hợp sau khi lọc.");
  const value = {headlines, time:Date.now(), cached:false, scopeUsed: scope};
  cache.set(key,value);
  return value;
}

const fallbackTemplates = [
  "Những thay đổi đang định hình {label}",
  "Tương lai của {label}",
  "Cơ hội và thách thức trong {label}",
  "Góc nhìn mới về {label}",
  "Sự dịch chuyển của {label}",
  "Khi {label} bước vào giai đoạn mới"
];
function fallbackTopic(label, hint) {
  if (hint?.trim()) return hint.trim().replace(/[?.!]+$/,"").slice(0,90);
  const noun = label.replace(/^AI & /i,"AI và ").replace(/ & /g," và ").toLocaleLowerCase("vi");
  return fallbackTemplates[Math.floor(Math.random()*fallbackTemplates.length)].replace("{label}", noun);
}
function promptFor(headlines,label,style,hint) {
  const styleRule = style==="creative" ? "Gợi mở, giàu sức hút nhưng không mơ hồ." : "Trung tính, rõ ràng, có chiều sâu.";
  return `Bạn là biên tập viên. Từ các headline, tạo MỘT chủ đề thảo luận rộng bằng tiếng Việt, chỉ 3–9 từ.
Phong cách: ${styleRule}
${hint ? `Người dùng muốn nghiên cứu: ${hint}. Bám sát hướng này.` : ""}
Không sao chép headline; không tên riêng, công ty, địa danh, số, ngày; không câu hỏi, dấu hai chấm hay lời giải thích; không chủ đề giá cả/thị trường.
Lĩnh vực: ${label}
Headline:
${headlines.map((x,i)=>`${i+1}. ${x.title}`).join("\n")}`;
}
function sanitizeTopic(text="") {
  return text.replace(/["“”'`*_#]/g,"").replace(/[\r\n:;.!?]+/g," ").replace(/\s+/g," ").trim();
}
async function askOpenAI(prompt) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST", headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({model:process.env.OPENAI_MODEL || "gpt-4o-mini",temperature:1.1,max_tokens:40,messages:[{role:"user",content:prompt}]})
  });
  if (!response.ok) throw new Error(`OpenAI trả về lỗi ${response.status}`);
  const body = await response.json();
  return body.choices?.[0]?.message?.content || "";
}
async function askGemini(prompt) {
  const model=process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:1.1,maxOutputTokens:40}})});
  if(!response.ok) throw new Error(`Gemini trả về lỗi ${response.status}`);
  const body=await response.json(); return body.candidates?.[0]?.content?.parts?.[0]?.text || "";
}
async function generateTopic(headlines,label,style,hint) {
  let raw="", mode="Tổng hợp quy tắc + tin trực tiếp";
  if(process.env.OPENAI_API_KEY) { raw=await askOpenAI(promptFor(headlines,label,style,hint)); mode="AI + tin trực tiếp"; }
  else if(process.env.GEMINI_API_KEY) { raw=await askGemini(promptFor(headlines,label,style,hint)); mode="AI + tin trực tiếp"; }
  else raw=fallbackTopic(label,hint);
  const topic=sanitizeTopic(raw);
  return {topic: topic && topic.length<=100 ? topic : fallbackTopic(label,hint), mode};
}

app.use(express.static(path.join(__dirname,"public")));
app.get("/api/categories",(req,res)=>res.json([{id:"discover",label:"Khám phá đa lĩnh vực"},...Object.entries(categories).map(([id,x])=>({id,label:x.label}))]));
app.get("/api/suggestions",(req,res)=>{
  const category=categories[req.query.category] || categories.ai;
  const options = [
    `Tương lai của ${category.label.toLocaleLowerCase("vi")}`,
    `Tác động của ${category.label.toLocaleLowerCase("vi")} đến đời sống`,
    `Niềm tin và trách nhiệm trong ${category.label.toLocaleLowerCase("vi")}`,
    `Những kỹ năng cần thiết trong ${category.label.toLocaleLowerCase("vi")}`,
    `Đổi mới bền vững trong ${category.label.toLocaleLowerCase("vi")}`
  ];
  res.json(sample(options,3));
});
app.get("/api/topic",async(req,res)=>{
  try {
    let id=req.query.category;
    if(!categories[id]) id=Object.keys(categories)[Math.floor(Math.random()*Object.keys(categories).length)];
    const scope=["vn","global","all"].includes(req.query.scope) ? req.query.scope : "all";
    const topicHint=String(req.query.q || "").trim().slice(0,100);
    const result=await getHeadlines(id,scope,topicHint);
    const pool=sample(result.headlines.slice(0,35),10);
    let generated;
    for(let i=0;i<3;i++) { generated=await generateTopic(pool,categories[id].label,req.query.style,topicHint); if(!recentTopics.includes(generated.topic)) break; }
    recentTopics.push(generated.topic); if(recentTopics.length>50) recentTopics.shift();
    res.json({topic:generated.topic, category:categories[id].label, categoryId:id, mode:generated.mode,
      scope, sourceCount:result.headlines.length, cached:result.cached, updatedAt:new Date(result.time).toISOString(), signals:pool.slice(0,5)});
  } catch(error) {
    console.error("Topic error:", error.message);
    res.status(502).json({error:error.message || "Chưa lấy được nguồn tin phù hợp."});
  }
});
app.listen(PORT,()=>console.log(`TrendTopic Live v3: http://localhost:${PORT}`));
