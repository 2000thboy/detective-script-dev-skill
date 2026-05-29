const https = require('https');
const fs = require('fs');
const path = require('path');

function loadEnv(cwd) {
  const env = { ...process.env };
  for (const file of ['.env.local', '.env']) {
    const envPath = path.join(cwd, file);
    if (fs.existsSync(envPath)) {
      const text = fs.readFileSync(envPath, 'utf8');
      for (const line of text.split('\n')) {
        const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
        if (match && !env[match[1]]) {
          env[match[1]] = match[2].replace(/^["']|["']$/g, '');
        }
      }
    }
  }
  return env;
}

function httpPostJson(hostname, pathStr, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path: pathStr, method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function callAnthropic(apiKey, systemPrompt, userPrompt, model) {
  const response = await httpPostJson(
    'api.anthropic.com',
    '/v1/messages',
    {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    {
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    }
  );
  if (response.error) {
    throw new Error(`Anthropic API error: ${response.error.message || JSON.stringify(response.error)}`);
  }
  return response.content && response.content[0] ? response.content[0].text : '';
}

async function callOpenAI(apiKey, systemPrompt, userPrompt, model) {
  const response = await httpPostJson(
    'api.openai.com',
    '/v1/chat/completions',
    {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    {
      model: model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 4096
    }
  );
  if (response.error) {
    throw new Error(`OpenAI API error: ${response.error.message || JSON.stringify(response.error)}`);
  }
  return response.choices && response.choices[0] ? response.choices[0].message.content : '';
}

function renderPrompt(template, variables) {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  }
  return rendered;
}

function generateMockDraft(variables) {
  const title = variables.title || '未命名悬疑短篇';
  const scene = variables.one_line_story ? variables.one_line_story.slice(0, 30) : '一个普通的日常场景';
  const hotspot = variables.hotspot || '日常异常';
  return [
    `第1章 ${title}`,
    '',
    '【MOCK 模拟成稿 — 未配置 LLM API key】',
    '',
    `选题：${title}`,
    `一句话故事：${variables.one_line_story || '暂无'}`,
    `热点背景：${hotspot}`,
    '',
    '--- 以下为模拟正文占位 ---',
    '',
    `${scene}。`,
    '',
    '早晨七点，闹钟还没响，手机先震了。',
    '',
    '一条未读消息，来自一个已经注销三年的账号。',
    '',
    '消息内容只有一句话：「你记得那天下午三点谁在值班吗？」',
    '',
    '他盯着屏幕看了很久。那个账号的头像还是三年前的系统默认图，昵称是一串随机数字。注销账号不可能发消息，这是平台的基本规则。',
    '',
    '但他确实收到了。',
    '',
    '（模拟正文结束。配置 ANTHROPIC_API_KEY 或 OPENAI_API_KEY 后可生成真实成稿。）',
    '',
    `字数统计：约 200 字（MOCK）`
  ].join('\n');
}

function stripMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/`{1,3}(.+?)`{1,3}/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function countChineseChars(text) {
  const chinese = text.match(/[一-鿿]/g) || [];
  return chinese.length;
}

async function generateDraft(env, promptTemplate, variables, options = {}) {
  const {
    systemPrompt = '你是一位推理悬疑短篇小说作家。严格按用户要求输出纯文本，不使用任何 Markdown 标记。',
    anthropicModel,
    openaiModel,
    preferProvider
  } = options;

  const rendered = renderPrompt(promptTemplate, variables);
  const providers = [];

  if (env.ANTHROPIC_API_KEY) {
    providers.push({
      name: 'anthropic',
      call: () => callAnthropic(env.ANTHROPIC_API_KEY, systemPrompt, rendered, anthropicModel)
    });
  }
  if (env.OPENAI_API_KEY) {
    providers.push({
      name: 'openai',
      call: () => callOpenAI(env.OPENAI_API_KEY, systemPrompt, rendered, openaiModel)
    });
  }

  if (preferProvider === 'openai' && providers.length > 1) {
    const idx = providers.findIndex((p) => p.name === 'openai');
    if (idx > 0) {
      const [p] = providers.splice(idx, 1);
      providers.unshift(p);
    }
  }

  const errors = [];
  for (const provider of providers) {
    try {
      const text = await provider.call();
      if (text && text.trim().length > 100) {
        return { text, source: provider.name, error: null };
      }
      errors.push(`${provider.name}: empty or too short response`);
    } catch (err) {
      errors.push(`${provider.name}: ${err.message}`);
    }
  }

  return {
    text: generateMockDraft(variables),
    source: errors.length ? 'mock-fallback' : 'mock',
    error: errors.length ? errors.join('; ') : null
  };
}

module.exports = {
  loadEnv,
  generateDraft,
  generateMockDraft,
  stripMarkdown,
  countChineseChars,
  renderPrompt,
  httpPostJson,
  callAnthropic,
  callOpenAI
};
