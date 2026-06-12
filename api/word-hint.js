export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { targetWord, currentWord, attempts } = req.body;
  if (!targetWord) return res.status(400).json({ error: 'No target word provided' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });
  const prompt = `You are a helpful assistant for a word game called WordClimb.
The player is trying to guess the target word: "${targetWord}"
Their current guess: "${currentWord || 'none yet'}"
Attempts made: ${attempts || 0}
Give ONE short hint (max 2 sentences) that helps without giving away the answer.
- Hint about meaning, category, or common usage
- Do NOT reveal the word or any of its letters
- Be encouraging and fun
- Keep it under 30 words
Reply with ONLY the hint text, nothing else.`;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 100 }
        })
      }
    );
    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || 'Gemini API error' });
    }
    const hint = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Keep going, you are close!';
    return res.status(200).json({ hint });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
