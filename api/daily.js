export default async function handler(req, res) {
  const secret = req.headers["x-secret"] || req.query.secret;
  if (secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const EMAIL_TO = process.env.EMAIL_TO;

  const WEEK = [
    { day:"ראשון",  emoji:"🧹", topic:"לנקות את הבית",    hint:"הרשימה שלא נגמרת" },
    { day:"שני",    emoji:"👗", topic:"קניות בגדים",       hint:"רק להסתכל, יצאת עם 4 שקיות" },
    { day:"שלישי", emoji:"📱", topic:"וואטסאפ משפחתי",    hint:"הדוד ששולח שרשרות" },
    { day:"רביעי", emoji:"🏥", topic:"קופת חולים",         hint:"תור לעוד חצי שנה" },
    { day:"חמישי", emoji:"🍕", topic:"להזמין אוכל",        hint:"הוויכוח מה להזמין" },
    { day:"שישי",  emoji:"🌅", topic:"שישי ישראלי",        hint:"הכל נסגר ב-2" },
    { day:"שבת",   emoji:"😴", topic:"שבת לאומי",          hint:"תכניות vs מציאות" },
  ];

  async function callClaude(system, user) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    const d = await r.json();
    return (d.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  }

  async function callJSON(s, u) {
    const r = await callClaude(s, u);
    try { const m = r.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); } catch {}
    return null;
  }

  try {
    const today = WEEK[new Date().getDay()];
    const dateStr = new Date().toLocaleDateString("he-IL", { weekday:"long", day:"numeric", month:"long" });

    const scene = await callJSON(
      "סוקר חיי יומיום ישראליים. החזר JSON בלבד: {\"moment\":\"רגע ספציפי\",\"punchline\":\"האירוניה\"}",
      "נושא: " + today.topic + "\nרמז: " + today.hint
    );

    const draft = await callJSON(
      "כותב פוסטים לפייסבוק. הומור ציני, עברית מדוברת, hook חזק, 3-4 נקודות, סיום מפתיע. החזר JSON: {\"hook\":\"\",\"points\":\"\",\"ending\":\"\",\"cta\":\"\",\"tags\":\"\"}",
      "נושא: " + today.topic + " " + today.emoji + " | " + dateStr + "\nרגע: " + (scene?.moment || today.hint)
    );

    const edited = await callJSON(
      "עורך ציני. שפר. החזר JSON: {\"hook\":\"\",\"points\":\"\",\"ending\":\"\",\"cta\":\"\",\"tags\":\"\",\"score\":0}",
      "hook: " + draft?.hook + "\npoints: " + draft?.points + "\nending: " + draft?.ending
    );

    const hook = edited?.hook || draft?.hook || "";
    const points = edited?.points || draft?.points || "";
    const ending = edited?.ending || draft?.ending || "";
    const cta = edited?.cta || draft?.cta || "";
    const tags = edited?.tags || draft?.tags || "";
    const score = edited?.score || 77;
    const fullPost = hook + "\n\n" + points + "\n\n" + ending + "\n\n" + cta + "\n\n" + tags;

    if (EMAIL_TO) {
      await callClaude(
        "שלח אימייל ב-Gmail.",
        "נושא: " + today.emoji + " פוסט היום — " + today.topic + " | " + dateStr + " (ציון: " + score + "/100)\nגוף:\n" + fullPost
      );
    }

    return res.status(200).json({ success: true, topic: today.topic, score, hook });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
