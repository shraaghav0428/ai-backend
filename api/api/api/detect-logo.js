export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageBase64, mimeType, imageWidth, imageHeight, pageWidth, pageHeight } = req.body;

  if (!imageBase64) return res.status(400).json({ error: 'No image provided' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const prompt = `You are analyzing a page from a technical document or CAD engineering drawing.

Your task: find ALL company logos on this page. A logo is a graphical brand identity mark — a symbol, icon, or logotype that represents a company. It is NOT text labels, dimension lines, title block text, borders, arrows, or any part of the technical drawing itself.

Logos are commonly found in the title block area (usually bottom-right or top corners of CAD drawings).

For each logo found, return its bounding box as fractions of the total image dimensions (values strictly between 0 and 1):
- left: x of left edge divided by image width
- top: y of top edge divided by image height (origin is top-left, y increases downward)
- right: x of right edge divided by image width
- bottom: y of bottom edge divided by image height

Return ONLY a valid JSON array — no markdown, no explanation, no code blocks:
[{"left": 0.72, "top": 0.88, "right": 0.95, "bottom": 0.97}]

If no logos are found, return exactly: []`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || 'Gemini API error' });
    }

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    // Strip any markdown code fences Gemini might add
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();

    let logos = [];
    try {
      logos = JSON.parse(cleaned);
    } catch (e) {
      logos = [];
    }

    // Convert fractional image coords → PDF user-space coordinates
    // Image origin: top-left, y down
    // PDF origin: bottom-left, y up
    const bounds = logos
      .filter(l => l.left < l.right && l.top < l.bottom)
      .map(l => ({
        x: l.left * pageWidth,
        y: pageHeight * (1 - l.bottom),   // flip y axis: PDF y is from bottom
        w: (l.right - l.left) * pageWidth,
        h: (l.bottom - l.top) * pageHeight,
        // Keep image coords for thumbnail cropping
        imgLeft: l.left,
        imgTop: l.top,
        imgRight: l.right,
        imgBottom: l.bottom
      }));

    return res.status(200).json({ bounds });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
