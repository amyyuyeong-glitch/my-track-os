#!/usr/bin/env node
/**
 * 내 트랙 OS — 실행 계획 제안 에이전트
 * 실행: node agent.js
 * 앱에서 http://localhost:3001 로 호출
 */

import { spawn } from 'child_process';
import http from 'http';

const PORT = 3001;

// Claude Code CLI 호출 (별도 API 크레딧 불필요 — 구독으로 동작)
function askClaude(prompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', prompt], { env: process.env });
    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    proc.on('close', code => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(err || `exit ${code}`));
    });
  });
}

async function classify(tasks, goals) {
  const goalsText = goals.length > 0
    ? goals.map(g => `- goalId: "${g.id}", 목표: "${g.name}", 트랙: "${g.track}"`).join('\n')
    : '(설정된 목표 없음)';
  const tasksText = tasks.map((t, i) => `${i + 1}. "${t}"`).join('\n');

  const prompt = `당신은 하루 실행 계획 에이전트입니다. JSON만 출력하세요.

목표 목록:
${goalsText}

오늘 할 일:
${tasksText}

각 할 일에 대해 아래 JSON 배열로만 응답 (다른 텍스트 없이):
[{"index":1,"goalId":"목표ID 또는 null","action":"30초 안에 할 수 있는 구체적 첫 행동","scope":"in"}]

규칙: action은 말도 안 되게 작고 구체적으로. goalId는 위 목록에서만.`;

  const text = await askClaude(prompt);
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('JSON 파싱 실패');
  return JSON.parse(match[0]);
}

async function suggest(taskTitle, goalName, trackName) {
  const prompt = `할 일: "${taskTitle}"
${goalName ? `목표: "${goalName}" (트랙: ${trackName})` : ''}

이 할 일의 마중물(30초 안에 할 수 있는 매우 구체적인 첫 행동) 3개를 JSON 배열로만 출력:
["제안1","제안2","제안3"]`;

  const text = await askClaude(prompt);
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('JSON 파싱 실패');
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
