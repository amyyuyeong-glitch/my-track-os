#!/usr/bin/env node
/**
 * 내 트랙 OS — 실행 계획 제안 에이전트
 * 실행: node agent.js
 * 앱에서 http://localhost:3001 로 호출
 */

import Anthropic from '@anthropic-ai/sdk';
import http from 'http';

const client = new Anthropic(); // ANTHROPIC_API_KEY 환경변수 자동 사용
const PORT = 3001;

const SYSTEM_PROMPT = `당신은 사용자의 하루 실행 계획을 설계해주는 에이전트입니다.

할 일 제목을 보고 다음을 판단합니다:
1. 사용자의 목표 중 어느 것과 연결되는지
2. 30초 안에 할 수 있는 가장 작고 구체적인 첫 번째 행동 (마중물)

마중물 원칙:
- 말도 안 되게 작고 구체적으로
- 실패할 수 없을 만큼 쉽게
- 동사로 끝내기
- 예: "포트폴리오.psd 열기", "채용공고 탭 열기", "메모 앱에 제목만 쓰기"`;

async function classify(tasks, goals) {
  const goalsText = goals.length > 0
    ? goals.map(g => `- goalId: "${g.id}", 목표: "${g.name}", 트랙: "${g.track}"`).join('\n')
    : '(설정된 목표 없음)';

  const tasksText = tasks.map((t, i) => `${i + 1}. "${t}"`).join('\n');

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `사용자의 목표 목록:
${goalsText}

오늘 할 일:
${tasksText}

각 할 일에 대해 JSON 배열로만 응답 (설명 없이):
[
  {
    "index": 1,
    "goalId": "연결될 목표 ID (없으면 null)",
    "action": "30초 안에 할 수 있는 구체적인 첫 행동",
    "scope": "in 또는 out 또는 later"
  }
]`
    }]
  });

  const text = message.content[0].text.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('응답 파싱 실패');
  return JSON.parse(match[0]);
}

async function suggest(taskTitle, goalName, trackName) {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `할 일: "${taskTitle}"
${goalName ? `연결된 목표: "${goalName}" (트랙: ${trackName})` : ''}

이 할 일의 마중물 3개를 JSON 배열로만 응답:
["첫 번째 제안", "두 번째 제안", "세 번째 제안"]`
    }]
  });

  const text = message.content[0].text.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('응답 파싱 실패');
  return JSON.parse(match[0]);
}

// HTTP 서버
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method !== 'POST')   { res.writeHead(405); res.end('Method not allowed'); return; }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const data = JSON.parse(body);
      let result;

      if (req.url === '/classify') {
        // 전체 분류: { tasks: string[], goals: [{id, name, track}] }
        result = await classify(data.tasks, data.goals || []);
      } else if (req.url === '/suggest') {
        // 단일 제안: { task: string, goalName?: string, trackName?: string }
        result = await suggest(data.task, data.goalName, data.trackName);
      } else {
        res.writeHead(404); res.end('Not found'); return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      console.log(`✓ ${req.url} — 처리 완료`);

    } catch (e) {
      console.error(`✗ ${req.url} — ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🤖 실행 계획 에이전트 실행 중`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   /classify — 전체 할 일 분류`);
  console.log(`   /suggest  — 단일 항목 제안\n`);
});
