/**
 * LLM 对话知识库 - Demo 后端服务
 * Express HTTP 服务，监听 localhost:17321
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const ai = require('./ai');
const { cleanConversation } = require('./capture');

const app = express();
const PORT = 17321;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============ 扩展 → 桌面应用：接收抓取数据 ============

app.post('/api/capture', async (req, res) => {
  try {
    const raw = req.body;
    console.log(`[Capture] 收到 ${raw.platform} 平台抓取数据，${(raw.messages || []).length} 条消息`);

    // 1. 保存原始数据
    const savedRaw = db.saveRawConversation(raw);

    // 2. 清洗数据
    const cleaned = cleanConversation(raw);
    cleaned.rawId = savedRaw.id;
    const savedClean = db.saveCleanConversation(cleaned);

    // 3. 先生成"待总结"的知识卡片（确保数据不丢失）
    let card = db.saveKnowledgeCard({
      rawId: savedRaw.id,
      cleanId: savedClean.id,
      title: cleaned.title || `${cleaned.platform} 对话`,
      card_type: '其他',
      original_question: '',
      narrative: '',
      tags: [cleaned.platform],
      source: {
        platform: cleaned.platform,
        url: cleaned.url,
        conversation_id: cleaned.conversationId,
        captured_at: cleaned.capturedAt,
      },
      rawMessages: raw.messages || raw.grouped_messages || [],
      cleanMessages: cleaned.messages,
    });

    // 4. 检查是否配置了 API Key
    const apiKey = db.getSetting('apiKey');
    const apiUrl = db.getSetting('apiUrl') || 'https://api.openai.com/v1';
    const model = db.getSetting('model') || 'gpt-4.1-nano';

    if (!apiKey) {
      // 未配置 API Key，卡片保留"待总结"状态
      return res.json({
        success: true,
        message: '对话已抓取并保存（待总结），请在设置中配置 API Key 后点击"重新总结"',
        rawId: savedRaw.id,
        cleanId: savedClean.id,
        cardId: card.id,
        needsApiKey: true,
      });
    }

    // 5. 调用 4 步 Pipeline（话题切分 → 意图分类 → 卡片生成）
    console.log(`[Capture] Pipeline 参数: url=${apiUrl}, model=${model}, msgs=${cleaned.messages.length}`);
    try {
      const cards = await ai.processPipeline({
        apiKey,
        apiUrl,
        model,
        messages: cleaned.messages,
        platform: cleaned.platform,
      });
      console.log(`[Capture] Pipeline 返回: ${cards.length} 张卡片`);
      if (cards.length === 0) {
        console.error(`[Capture] Pipeline 返回 0 张卡片！清洗后消息数: ${cleaned.messages.length}, user 消息: ${cleaned.messages.filter(m => m.role === 'user').length}`);
      }

      // 6. 更新第一张卡片（兼容旧版单卡片返回），保存所有新卡片
      if (cards.length === 0) {
        // Pipeline 返回 0 张卡片，说明 AI 处理出了问题，标记卡片
        console.log(`[Capture] 警告: Pipeline 返回 0 张卡片，卡片保持"待总结"状态`);
        db.updateKnowledgeCard(card.id, {
          summarize_error: 'AI 总结未产出有效内容，可能是 API 返回格式异常',
        });
      }
      if (cards.length > 0) {
        const first = cards[0];
        console.log(`[Capture] Pipeline 返回 - title: "${first.title}", narrative: "${first.narrative?.slice(0, 50)}..."`);
        card = db.updateKnowledgeCard(card.id, {
          title: first.title,
          card_type: first.card_type,
          original_question: first.original_question,
          narrative: first.narrative,
          full_output: first.full_output || null,
          tags: first.tags,
          summarize_error: null,
        });

        // 如果切分出了多个话题块，为每个额外话题块创建独立卡片
        for (let i = 1; i < cards.length; i++) {
          const c = cards[i];
          db.saveKnowledgeCard({
            rawId: savedRaw.id,
            cleanId: savedClean.id,
            title: c.title,
            card_type: c.card_type,
            original_question: c.original_question,
            narrative: c.narrative,
            full_output: c.full_output || null,
            tags: c.tags,
            source: {
              platform: cleaned.platform,
              url: cleaned.url,
              conversation_id: cleaned.conversationId,
              captured_at: cleaned.capturedAt,
            },
            rawMessages: raw.messages || raw.grouped_messages || [],
            cleanMessages: cleaned.messages,
          });
        }
      }

      console.log(`[Capture] Pipeline 完成，生成 ${cards.length} 张卡片`);

      // Pipeline 返回 0 张卡片时，标记 aiError 让前端知道
      if (cards.length === 0) {
        res.json({
          success: true,
          message: `对话已抓取并保存，但 AI 总结未产出有效内容`,
          rawId: savedRaw.id,
          cleanId: savedClean.id,
          cardId: card.id,
          cardCount: 0,
          aiError: 'AI 总结未产出有效内容，可能是 API 返回格式异常',
          card: {
            title: card.title,
            card_type: card.card_type,
            tags: card.tags,
          },
        });
      } else {
        res.json({
          success: true,
          message: `对话已抓取、清洗、总结，生成 ${cards.length} 张知识卡片`,
          rawId: savedRaw.id,
          cleanId: savedClean.id,
          cardId: card.id,
          cardCount: cards.length,
          card: {
            title: card.title,
            card_type: card.card_type,
            tags: card.tags,
          },
        });
      }
    } catch (aiError) {
      console.error('[Capture] AI 总结失败:', aiError.message);
      // 标记卡片为总结失败状态
      db.updateKnowledgeCard(card.id, {
        summarize_error: aiError.message || 'AI Pipeline 调用失败',
      });
      // 卡片已创建（待总结状态），用户可稍后重新总结
      res.json({
        success: true,
        message: `对话已抓取并保存（待总结）。AI 总结失败: ${aiError.message}。可在知识库中点击"重新总结"`,
        rawId: savedRaw.id,
        cleanId: savedClean.id,
        cardId: card.id,
        aiError: aiError.message,
      });
    }
  } catch (error) {
    console.error('[Capture] 处理抓取数据失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 知识卡片 CRUD ============

// 获取卡片列表（支持筛选、搜索、分页）
app.get('/api/cards', (req, res) => {
  try {
    const result = db.getKnowledgeCards({
      cardType: req.query.card_type,
      keyword: req.query.keyword,
      tag: req.query.tag,
      platform: req.query.platform,
      starred: req.query.starred === 'true',
      page: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.pageSize) || 20,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取单个卡片详情
app.get('/api/cards/:id', (req, res) => {
  try {
    const card = db.getKnowledgeCard(req.params.id);
    if (!card) {
      return res.status(404).json({ success: false, error: '卡片不存在' });
    }
    res.json({ success: true, card });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新卡片（修改标题、标签等）
app.put('/api/cards/:id', (req, res) => {
  try {
    const card = db.updateKnowledgeCard(req.params.id, req.body);
    if (!card) {
      return res.status(404).json({ success: false, error: '卡片不存在' });
    }
    res.json({ success: true, card });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除卡片
app.delete('/api/cards/:id', (req, res) => {
  try {
    db.deleteKnowledgeCard(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 手动触发 AI 总结（用于未配置 API Key 时后补总结）
app.post('/api/cards/:id/summarize', async (req, res) => {
  try {
    const card = db.getKnowledgeCard(req.params.id);
    if (!card) {
      return res.status(404).json({ success: false, error: '卡片不存在' });
    }

    const apiKey = db.getSetting('apiKey');
    const apiUrl = db.getSetting('apiUrl') || 'https://api.openai.com/v1';
    const model = db.getSetting('model') || 'gpt-4.1-nano';

    if (!apiKey) {
      return res.status(400).json({ success: false, error: '请先在设置中配置 API Key' });
    }

    const messages = card.cleanMessages || card.rawMessages || [];
    const source = card.source || {};

    const summary = await ai.summarizeConversation({
      apiKey,
      apiUrl,
      model,
      messages,
      platform: source.platform || 'unknown',
    });

    const updated = db.updateKnowledgeCard(req.params.id, {
      title: summary.title,
      originalQuestion: summary.originalQuestion,
      insights: summary.insights,
      outputs: summary.outputs,
      tags: summary.tags,
      summarize_error: null, // 清除失败标记
    });

    res.json({ success: true, card: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 知识卡片 CRUD ============

app.get('/api/settings', (req, res) => {
  try {
    const settings = db.getAllSettings();
    // 不暴露完整 API Key
    if (settings.apiKey) {
      settings.apiKey = settings.apiKey.slice(0, 8) + '...' + settings.apiKey.slice(-4);
      settings._hasApiKey = true;
    }
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/settings', (req, res) => {
  try {
    const { apiKey, apiUrl, model } = req.body;

    // 如果 apiKey 包含 "..." 说明用户没有修改它
    if (apiKey && !apiKey.includes('...')) {
      db.setSetting('apiKey', apiKey);
    }
    if (apiUrl) db.setSetting('apiUrl', apiUrl);
    if (model) db.setSetting('model', model);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 验证 API Key 是否有效
app.post('/api/settings/validate', async (req, res) => {
  try {
    const { apiKey, apiUrl, model } = req.body;
    const result = await ai.callOpenAICompatible({
      apiKey,
      apiUrl: apiUrl || 'https://api.openai.com/v1',
      model: model || 'gpt-4.1-nano',
      systemPrompt: 'You are a test assistant.',
      userPrompt: 'Hi',
      temperature: 0.3,
    });
    res.json({ success: true, message: `连接成功（模型返回: ${result.slice(0, 50)}${result.length > 50 ? '...' : ''}）` });
  } catch (error) {
    const msg = error.message || String(error);
    // 分类错误类型
    if (msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED')) {
      res.json({ success: false, error: `无法连接到 API 地址: ${msg}` });
    } else if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized')) {
      res.json({ success: false, error: `API Key 无效: 认证失败` });
    } else if (msg.includes('404')) {
      res.json({ success: false, error: `API 地址不正确: 接口不存在` });
    } else {
      res.json({ success: false, error: msg });
    }
  }
});

// ============ 服务状态 ============

app.get('/api/status', (req, res) => {
  const apiKey = db.getSetting('apiKey');
  const cards = db.getKnowledgeCards({ page: 1, pageSize: 1 });
  res.json({
    success: true,
    status: 'running',
    hasApiKey: !!apiKey,
    totalCards: cards.total,
  });
});

// 获取所有标签
app.get('/api/tags', (req, res) => {
  try {
    const tags = db.getAllTags();
    res.json({ success: true, tags });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取统计数据
app.get('/api/statistics', (req, res) => {
  try {
    const stats = db.getStatistics();
    res.json({ success: true, ...stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 静态文件服务（前端） ============

// 生产模式：从 web/dist 提供静态文件
const distPath = path.join(__dirname, '..', 'web', 'dist');
app.use(express.static(distPath));

// SPA 回退
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) res.status(404).send('Frontend not built. Run: cd web && npm run build');
    });
  }
});

// ============ 启动服务 ============

app.listen(PORT, () => {
  console.log(`\n🧠 LLM 对话知识库 Demo 服务已启动`);
  console.log(`   后端 API: http://localhost:${PORT}`);
  console.log(`   前端界面: http://localhost:${PORT} (需先 build)`);
  console.log(`   或开发模式: cd web && npm run dev (http://localhost:5173)`);
  console.log(`\n   浏览器扩展请配置连接地址: http://localhost:${PORT}`);
  console.log(`\n   等待扩展发送抓取数据...\n`);
});
