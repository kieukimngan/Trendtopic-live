import express from "express";
import Parser from "rss-parser";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const app = express();
app.use(express.json());

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "Mozilla/5.0 TrendTopicLive/4.0 (+research app)"
  }
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const CACHE_MS = Number(process.env.CACHE_MINUTES || 10) * 60 * 1000;

/*
  Add these two values in Render (Environment Variables), NOT in GitHub:
  SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_ANON_KEY=your-anon-public-key
*/
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const categories = {
  ai: { label: "AI & tương lai", vi: "(AI OR robot OR \"trí tuệ nhân tạo\" OR tự động hóa)", en: "(AI OR robotics OR \"artificial intelligence\" OR automation)" },
  tech: { label: "Công nghệ mới", vi: "(\"công nghệ mới\" OR thiết bị mới OR \"đổi mới số\" OR internet)", en: "(\"emerging technology\" OR innovation OR \"digital transformation\" OR internet)" },
  cyber: { label: "An ninh mạng", vi: "(\"an ninh mạng\" OR \"dữ liệu cá nhân\" OR \"lừa đảo số\" OR bảo mật)", en: "(\"cybersecurity\" OR privacy OR \"data breach\" OR \"online scam\")" },
  business: { label: "Kinh doanh & khởi nghiệp", vi: "(khởi nghiệp OR doanh nghiệp OR \"mô hình kinh doanh\" OR đổi mới)", en: "(startup OR entrepreneurship OR business OR innovation)" },
  science: { label: "Khoa học", vi: "(\"nghiên cứu mới\" OR \"khám phá khoa học\" OR vật lý OR sinh học)", en: "(\"scientific research\" OR science discovery OR physics OR biology)" },
  space: { label: "Không gian", vi: "(vũ trụ OR không gian OR vệ tinh OR thiên văn)", en: "(space OR satellite OR astronomy OR \"space exploration\")" },
  health: { label: "Sức khỏe", vi: "(\"sức khỏe\" OR y tế OR dinh dưỡng OR wellbeing)", en: "(health OR healthcare OR nutrition OR wellbeing)" },
  psychology: { label: "Tâm lý & hành vi", vi: "(tâm lý OR \"hành vi con người\" OR \"sức khỏe tinh thần\" OR hạnh phúc)", en: "(psychology OR \"human behavior\" OR \"mental health\" OR happiness)" },
  environment: { label: "Môi trường & khí hậu", vi: "(khí hậu OR môi trường OR \"đa dạng sinh học\" OR ô nhiễm)", en: "(climate OR environment OR biodiversity OR pollution)" },
  energy: { label: "Năng lượng", vi: "(\"năng lượng sạch\" OR \"điện tái tạo\" OR pin OR \"chuyển dịch năng lượng\")", en: "(\"clean energy\" OR renewable OR battery OR \"energy transition\")" },
  education: { label: "Giáo dục", vi: "(giáo dục OR học tập OR \"kỹ năng tương lai\" OR trường học)", en: "(education OR learning OR \"future skills\" OR school)" },
  society: { label: "Xã hội", vi: "(\"đời sống xã hội\" OR dân số OR đô thị hóa OR cộng đồng)", en: "(society OR population OR urbanization OR community)" },
  culture: { label: "Văn hóa & sáng tạo", vi: "(văn hóa OR di sản OR bản sắc OR nghệ thuật OR sáng tạo)", en: "(culture OR heritage OR identity OR art OR creativity)" },
  lifestyle: { label: "Phong cách sống", vi: "(\"lối sống\" OR \"xu hướng sống\" OR wellbeing OR thói quen)", en: "(lifestyle OR wellbeing OR \"living trends\" OR habits)" },
  food: { label: "Ẩm thực & thực phẩm", vi: "(ẩm thực OR thực phẩm OR \"xu hướng ăn uống\" OR nông nghiệp)", en: "(food OR nutrition OR agriculture OR \"food trends\")" },
  design: { label: "Thiết kế & kiến trúc", vi: "(thiết kế OR kiến trúc OR \"không gian sống\" OR \"đô thị thông minh\")", en: "(design OR architecture OR \"living space\" OR \"smart city\")" },
  travel: { label: "Du lịch", vi: "(du lịch OR \"điểm đến\" OR hàng không OR \"du lịch bền vững\")", en: "(travel OR tourism OR aviation OR \"sustainable tourism\")" },
  mobility: { label: "Giao thông tương lai", vi: "(\"xe điện\" OR \"giao thông thông minh\" OR \"xe tự hành\" OR \"vận tải xanh\")", en: "(\"electric vehicle\" OR \"smart mobility\" OR \"autonomous vehicle\" OR \"green transport\")" },
  work: { label: "Công việc tương lai", vi: "(\"tương lai việc làm\" OR \"kỹ năng nghề nghiệp\" OR \"làm việc từ xa\" OR tự động hóa)", en: "(\"future of work\" OR \"workplace skills\" OR remote work OR automation)" },
  world: { label: "Thế giới", vi: "(\"quan hệ quốc tế\" OR xã hội toàn cầu OR \"chính sách công\")", en: "(geopolitics OR \"international relations\" OR \"public policy\" OR global society)" },
  sports: { label: "Thể thao", vi: "(thể thao OR bóng đá OR vận động viên OR giải đấu)", en: "(sports OR football OR athlete OR tournament)" }
};

const blocked = [
  "giá vàng", "tỷ giá", "chứng khoán", "cổ phiếu", "lãi suất",
  "bitcoin", "tiền ảo", "doanh thu", "lợi nhuận", "mở bán",
  "khuyến mãi", "săn sale", "xổ số", "soi kèo", "giá xăng", "giá dầu"
];

const cache = new Map();
const recentTopics = [];

const feedUrl = (query, scope) => {
  const settings = scope === "vn"
    ? { hl: "vi", gl: "VN", ceid: "VN:vi" }
    : { hl: "en-US", gl: "US", ceid: "US:en" };

  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${settings.hl}&gl=${settings.gl}&ceid=${settings.ceid}`;
};

const cleanTitle = (text = "") =>
  text.replace(/\s*[-–—]\s*[^-–—]{2,80}$/, "").replace(/\s+/g, " ").trim();

const domainOf = (link = "") => {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const sample = (items, count) => [...items].sort(() => Math.random() - 0.5).slice(0, count);

const normalize = (text = "") =>
  String(text).toLocaleLowerCase("vi").replace(/\s+/g, " ").trim();

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
  const key = `${categoryId}|${scope}|${normalize(topicHint)}`;
  const cached = cache.get(key);

  if (cached && Date.now() - cached.time < CACHE_MS) {
    return { ...cached, cached: true };
  }

  const query = topicHint?.trim()
    ? `"${topicHint.trim()}"`
    : category[scope === "vn" ? "vi" : "en"];

  const targets = scope === "all" ? ["vn", "global"] : [scope];
  const settled = await Promise.allSettled(targets.map(target => fetchFeed(query, target)));
  const raw = settled
    .filter(result => result.status === "fulfilled")
    .flatMap(result => result.value);

  if (!raw.length) {
    throw new Error("Không kết nối được nguồn RSS. Hãy thử lại sau ít phút.");
  }

  const seen = new Set();
  const headlines = raw.filter(item => {
    const title = normalize(item.title);
    if (!title || blocked.some(word => title.includes(word)) || seen.has(title)) return false;
    seen.add(title);
    return true;
  }).slice(0, 60);

  if (!headlines.length) {
    throw new Error("Có tin nhưng không có kết quả phù hợp sau khi lọc.");
  }

  const value = { headlines, time: Date.now(), cached: false };
  cache.set(key, value);
  return value;
}

/*
  Fallback is used only when there is no OPENAI_API_KEY or GEMINI_API_KEY.
  It deliberately returns a specific topic rather than a broad phrase.
*/
function fallbackTopic(categoryId, hint) {
  if (hint?.trim()) return hint.trim().replace(/[?.!]+$/g, "").slice(0, 90);

  const fallbackByCategory = {
    health: "Bảo hiểm y tế miễn phí",
    ai: "AI trong công việc",
    tech: "Quyền riêng tư dữ liệu",
    cyber: "Lừa đảo trực tuyến",
    business: "Khởi nghiệp bền vững",
    science: "Nghiên cứu y sinh",
    space: "Du lịch không gian",
    psychology: "Sức khỏe tinh thần",
    environment: "Ô nhiễm không khí",
    energy: "Điện mặt trời hộ gia đình",
    education: "Kỹ năng số",
    society: "Già hóa dân số",
    culture: "Bản sắc văn hóa",
    lifestyle: "Cân bằng công việc cuộc sống",
    food: "An toàn thực phẩm",
    design: "Không gian sống xanh",
    travel: "Du lịch bền vững",
    mobility: "Xe điện đô thị",
    work: "Làm việc từ xa",
    world: "Chính sách công toàn cầu",
    sports: "Sức khỏe vận động"
  };

  return fallbackByCategory[categoryId] || "Một vấn đề đáng thảo luận";
}

function promptFor(headlines, label, style, hint) {
  const styleRule = style === "creative"
    ? "Gợi mở, tự nhiên, có sức hút nhưng không mơ hồ."
    : "Rõ ràng, trung tính và có chiều sâu.";

  return `Bạn là biên tập viên tạo topic thảo luận từ tin tức.

Dựa vào các headline bên dưới, tạo MỘT topic tiếng Việt dài 2–7 từ.

Yêu cầu bắt buộc:
- Topic phải là một khía cạnh CỤ THỂ xuất hiện hoặc thể hiện rõ trong headline.
- Ưu tiên cụm danh từ có thể mở thảo luận, ví dụ: "Bảo hiểm y tế miễn phí", "Chi phí điều trị bệnh", "Dữ liệu sức khỏe cá nhân", "AI trong chẩn đoán".
- Không tạo topic chung chung như "Cơ hội và thách thức trong sức khỏe", "Tương lai của công nghệ", "Những thay đổi đang định hình xã hội".
- Không dùng tên riêng, tên công ty, địa danh, số liệu, ngày tháng.
- Không viết câu hỏi, không thêm lời giải thích, dấu hai chấm, dấu ngoặc hoặc dấu chấm.
- Không chọn nội dung giá cả, chứng khoán, doanh thu hoặc khuyến mãi.
- Nếu có nhiều hướng, chọn chi tiết cụ thể nhất có khả năng mở thảo luận.
- Phong cách: ${styleRule}
${hint ? `- Người dùng muốn tìm hiểu: "${hint}". Chỉ bám sát hướng này nếu headline liên quan.` : ""}

Lĩnh vực: ${label}

Headline:
${headlines.map((item, index) => `${index + 1}. ${item.title}`).join("\n")}`;
}

function sanitizeTopic(text = "") {
  return String(text)
    .replace(/["“”'`*_#]/g, "")
    .replace(/[\r\n:;.!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function askOpenAI(prompt) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.8,
      max_tokens: 40,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) throw new Error(`OpenAI trả về lỗi ${response.status}`);
  const body = await response.json();
  return body.choices?.[0]?.message?.content || "";
}

async function askGemini(prompt) {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 40 }
    })
  });

  if (!response.ok) throw new Error(`Gemini trả về lỗi ${response.status}`);
  const body = await response.json();
  return body.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function generateTopic(headlines, categoryId, style, hint) {
  let raw = "";
  let mode = "Topic mẫu theo lĩnh vực";

  if (process.env.OPENAI_API_KEY) {
    raw = await askOpenAI(promptFor(headlines, categories[categoryId].label, style, hint));
    mode = "AI + tin trực tiếp";
  } else if (process.env.GEMINI_API_KEY) {
    raw = await askGemini(promptFor(headlines, categories[categoryId].label, style, hint));
    mode = "AI + tin trực tiếp";
  } else {
    raw = fallbackTopic(categoryId, hint);
  }

  const topic = sanitizeTopic(raw);
  return {
    topic: topic && topic.length <= 100 ? topic : fallbackTopic(categoryId, hint),
    mode
  };
}

/* Shared saved topics: Supabase REST API */
async function supabaseRequest(endpoint, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Chưa cấu hình SUPABASE_URL hoặc SUPABASE_ANON_KEY trên server.");
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  if (response.status === 204) return null;
  return response.json();
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/categories", (req, res) => {
  res.json([
    { id: "discover", label: "Khám phá đa lĩnh vực" },
    ...Object.entries(categories).map(([id, item]) => ({ id, label: item.label }))
  ]);
});

app.get("/api/topic", async (req, res) => {
  try {
    let categoryId = req.query.category;
    if (!categories[categoryId]) {
      categoryId = Object.keys(categories)[Math.floor(Math.random() * Object.keys(categories).length)];
    }

    const scope = ["vn", "global", "all"].includes(req.query.scope) ? req.query.scope : "all";
    const topicHint = String(req.query.q || "").trim().slice(0, 100);
    const result = await getHeadlines(categoryId, scope, topicHint);
    const pool = sample(result.headlines.slice(0, 35), 10);

    let generated;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      generated = await generateTopic(pool, categoryId, req.query.style, topicHint);
      if (!recentTopics.includes(generated.topic)) break;
    }

    recentTopics.push(generated.topic);
    if (recentTopics.length > 50) recentTopics.shift();

    const source = pool[0] || {};

    res.json({
      topic: generated.topic,
      category: categories[categoryId].label,
      categoryId,
      mode: generated.mode,
      scope,
      sourceCount: result.headlines.length,
      cached: result.cached,
      updatedAt: new Date(result.time).toISOString(),
      sourceHeadline: source.title || "",
      sourceUrl: source.link || "",
      signals: pool.slice(0, 5)
    });
  } catch (error) {
    console.error("Topic error:", error.message);
    res.status(502).json({ error: error.message || "Chưa lấy được nguồn tin phù hợp." });
  }
});

app.get("/api/saved-topics", async (req, res) => {
  try {
    const topics = await supabaseRequest(
      "saved_topics?select=id,topic,category,source_count,created_at&order=created_at.desc&limit=100"
    );
    res.json(topics);
  } catch (error) {
    console.error("Load saved topics error:", error.message);
    res.status(500).json({ error: "Không thể tải các topic đã lưu." });
  }
});

app.post("/api/saved-topics", async (req, res) => {
  try {
    const topic = String(req.body.topic || "").trim().slice(0, 120);
    const category = String(req.body.category || "").trim().slice(0, 80);
    const sourceCount = Number(req.body.sourceCount || 0);

    if (topic.length < 2) {
      return res.status(400).json({ error: "Topic cần có ít nhất 2 ký tự." });
    }

    const created = await supabaseRequest("saved_topics", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{
        topic,
        category,
        source_count: Number.isFinite(sourceCount) ? sourceCount : 0
      }])
    });

    res.status(201).json(created[0]);
  } catch (error) {
    console.error("Save topic error:", error.message);
    res.status(500).json({ error: "Không thể lưu topic." });
  }
});

app.listen(PORT, () => {
  console.log(`TrendTopic Live: http://localhost:${PORT}`);
});
