import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // ANTHROPIC_API_KEY 환경변수 자동 사용

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).end('Method not allowed'); return; }

  const { task, goalName, trackName } = req.body;
  if (!task) { res.status(400).json({ error: 'task required' }); return; }

  const prompt = `할 일: "${task}"
${goalName ? `목표: "${goalName}"${trackName ? ` (트랙: ${trackName})` : ''}` : ''}

이 할 일을 시작하기 위한 마중물 행동 3개를 제안해줘.
조건: 30초 안에 할 수 있을 만큼 구체적이고 작게. 할 일과 목표에 직접적으로 관련된 내용으로.
JSON 배열로만 출력 (다른 텍스트 없이):
["제안1","제안2","제안3"]`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].text;
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error('JSON 파싱 실패');

    res.status(200).json(JSON.parse(match[0]));
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
}
