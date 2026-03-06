// api/webhook.js
const { createHmac } = require('crypto');

// 飞书应用配置（从环境变量读取）
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_ENCRYPT_KEY = process.env.FEISHU_ENCRYPT_KEY || '';

// Kimi API 配置
const KIMI_API_KEY = process.env.KIMI_API_KEY;
const KIMI_API_URL = 'https://api.moonshot.cn/v1/chat/completions';

// 验证飞书签名
function verifySignature(timestamp, nonce, encryptKey, body) {
  const signString = `${timestamp}\n${nonce}\n${encryptKey}\n${body}`;
  return createHmac('sha256', encryptKey).update(signString).digest('hex');
}

// 获取飞书 tenant_access_token
async function getTenantToken() {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET
    })
  });
  const data = await res.json();
  return data.tenant_access_token;
}

// 发送消息到飞书
async function sendMessage(chatId, content) {
  const token = await getTenantToken();
  await fetch('https://open.feishu.cn/open-apis/im/v1/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text: content })
    })
  });
}

// 调用 Kimi API
async function callKimi(message) {
  const res = await fetch(KIMI_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KIMI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      messages: [{ role: 'user', content: message }]
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '抱歉，我无法回答';
}

module.exports = async (req, res) => {
  // 处理飞书 URL 验证（首次配置时需要）
  if (req.method === 'POST' && req.body?.challenge) {
    return res.json({ challenge: req.body.challenge });
  }

  // 处理消息事件
  if (req.body?.event?.message) {
    const message = req.body.event.message;
    const chatId = message.chat_id;
    const userMessage = message.content?.text || '';

    try {
      // 调用 Kimi 获取回复
      const reply = await callKimi(userMessage);
      // 发送回复到飞书
      await sendMessage(chatId, reply);
    } catch (error) {
      console.error('Error:', error);
      await sendMessage(chatId, '服务暂时不可用，请稍后重试');
    }
  }

  res.status(200).send('OK');
};
