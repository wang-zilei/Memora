import { useState, useEffect } from 'react'
import './index.css'
import { getCards, getCard, deleteCard, getSettings, updateSettings, summarizeCard, getTags, getStarredCards, getStatistics } from './api'
import type { KnowledgeCardSummary, KnowledgeCardDetail, Settings, CardListResponse, TagInfo, Statistics as StatisticsType } from './types'
import { PLATFORM_NAMES, PLATFORM_COLORS } from './types'
import { LogoIcon, LogoWordmark, NavIcon } from './Logo'

type Page = 'list' | 'detail' | 'settings' | 'favorites' | 'statistics'

function App() {
  const [page, setPage] = useState<Page>('list')
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [currentCardType, setCurrentCardType] = useState<string>('全部')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [cards, setCards] = useState<KnowledgeCardSummary[]>([])
  const [totalCards, setTotalCards] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)

  // 加载卡片列表
  const loadCards = async () => {
    try {
      const params: Record<string, string> = { page: String(currentPage), pageSize: '20' }
      if (currentCardType !== '全部') params.card_type = currentCardType
      if (searchKeyword) params.keyword = searchKeyword
      const data: CardListResponse = await getCards(params)
      setCards(data.cards)
      setTotalCards(data.total)
    } catch (e) {
      console.error('Failed to load cards:', e)
    }
  }

  useEffect(() => {
    loadCards()
  }, [currentCardType, currentPage])

  const handleSearch = () => {
    setCurrentPage(1)
    loadCards()
  }

  const handleCardClick = (id: string) => {
    setSelectedCardId(id)
    setPage('detail')
  }

  const handleBack = () => {
    setPage('list')
    setSelectedCardId(null)
    loadCards()
  }

  const handleNavigate = (p: Page) => {
    setPage(p)
    setSelectedCardId(null)
  }

  return (
    <div className="app-layout">
      <Sidebar
        currentPage={page}
        onNavigate={handleNavigate}
        currentCardType={currentCardType}
        onCardTypeChange={(type) => { setCurrentCardType(type); setCurrentPage(1); }}
        onOpenSettings={() => setPage('settings')}
      />

      <div className="main-content">
        {page === 'list' && (
          <CardList
            cards={cards}
            totalCards={totalCards}
            currentPage={currentPage}
            searchKeyword={searchKeyword}
            onSearchChange={setSearchKeyword}
            onSearch={handleSearch}
            onPageChange={setCurrentPage}
            onCardClick={handleCardClick}
            currentCardType={currentCardType}
          />
        )}
        {page === 'favorites' && (
          <FavoritesList onCardClick={handleCardClick} onBack={() => handleNavigate('list')} />
        )}
        {page === 'statistics' && <StatisticsPage />}
        {page === 'detail' && selectedCardId && (
          <CardDetail
            cardId={selectedCardId}
            onBack={handleBack}
          />
        )}
        {page === 'settings' && (
          <SettingsPage onBack={handleBack} />
        )}
      </div>
    </div>
  )
}

// ============ 侧边栏组件 ============

const CARD_TYPES = [
  '概念理解', '事实查询', '技能学习', '操作指南', '内容创作',
  '文本处理', '规划决策', '头脑风暴', '交互陪伴', '其他',
] as const

function Sidebar({ currentPage, onNavigate, currentCardType, onCardTypeChange, onOpenSettings }: {
  currentPage: Page
  onNavigate: (p: Page) => void
  currentCardType: string
  onCardTypeChange: (type: string) => void
  onOpenSettings: () => void
}) {
  const [tags, setTags] = useState<TagInfo[]>([])

  useEffect(() => {
    getTags().then((data: any) => setTags(data.tags)).catch(() => {})
  }, [])

  const isHomeActive = currentPage === 'list' && currentCardType === '全部'

  return (
    <div className="sidebar">
      {/* Logo 区域 */}
      <div className="sidebar-logo">
        <LogoIcon className="logo-icon" />
        <LogoWordmark className="logo-wordmark" />
      </div>

      {/* 导航区域 */}
      <div className="sidebar-nav">
        {/* Group 1: 主页面 */}
        <div
          className={`nav-item ${isHomeActive ? 'active' : ''}`}
          onClick={() => { onNavigate('list'); onCardTypeChange('全部'); }}
        >
          <NavIcon name="首页" />
          <span>首页</span>
        </div>
        <div
          className={`nav-item ${currentPage === 'favorites' ? 'active' : ''}`}
          onClick={() => onNavigate('favorites')}
        >
          <NavIcon name="收藏" />
          <span>收藏</span>
        </div>
        <div
          className={`nav-item ${currentPage === 'statistics' ? 'active' : ''}`}
          onClick={() => onNavigate('statistics')}
        >
          <NavIcon name="统计" />
          <span>统计</span>
        </div>

        {/* Group 2: 意图分类 */}
        <div className="nav-section-label">意图分类</div>
        {CARD_TYPES.map(t => (
          <div
            key={t}
            className={`nav-item nav-item-compact ${currentPage === 'list' && currentCardType === t ? 'active' : ''}`}
            onClick={() => { onNavigate('list'); onCardTypeChange(t); }}
          >
            <NavIcon name={t} />
            <span>{t}</span>
          </div>
        ))}

        {/* Group 3: 全部标签 */}
        <div className="nav-section-label">全部标签</div>
        <div className="tags-cloud">
          {tags.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--sidebar-text-muted)' }}>暂无标签</span>
          ) : (
            tags.map(t => (
              <span key={t.tag} className="tag-chip" title={`${t.tag} (${t.count})`}>
                {t.tag}
              </span>
            ))
          )}
        </div>
      </div>

      {/* 底部：用户 + 设置 */}
      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="avatar-placeholder">用</div>
          <span className="user-name">用户</span>
        </div>
        <button className="settings-btn" onClick={onOpenSettings}>
          设置
        </button>
      </div>
    </div>
  )
}

// ============ 卡片列表组件 ============

function CardList({ cards, totalCards, currentPage, searchKeyword, onSearchChange, onSearch, onPageChange, onCardClick, currentCardType }: {
  cards: KnowledgeCardSummary[]
  totalCards: number
  currentPage: number
  searchKeyword: string
  onSearchChange: (kw: string) => void
  onSearch: () => void
  onPageChange: (page: number) => void
  onCardClick: (id: string) => void
  currentCardType: string
}) {
  const totalPages = Math.ceil(totalCards / 20)

  return (
    <div>
      <div className="search-bar">
        <input
          type="text"
          placeholder="搜索知识卡片..."
          value={searchKeyword}
          onChange={e => onSearchChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSearch() }}
        />
        <button onClick={onSearch}>搜索</button>
      </div>

      {cards.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📭</div>
          <h3>暂无知识卡片</h3>
          <p>
            在浏览器 LLM 对话页面点击悬浮球<br />
            即可自动抓取对话并生成知识卡片
          </p>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: '#999', marginBottom: 12 }}>
            {currentCardType === '全部' ? '全部' : `意图: ${currentCardType}`} · 共 {totalCards} 条
          </div>
          <div className="cards-grid">
            {cards.map(card => (
              <div
                key={card.id}
                className={`card-item ${card.summarize_error ? 'card-item--error' : ''}`}
                onClick={() => onCardClick(card.id)}
                style={card.summarize_error ? { borderColor: '#ff9800' } : {}}
              >
                <div className="card-header">
                  <div className="card-title">{card.title}</div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {card.summarize_error && (
                      <span className="error-badge" title={card.summarize_error}>
                        总结失败
                      </span>
                    )}
                    <span
                      className="platform-badge"
                      style={{ background: PLATFORM_COLORS[card.source?.platform] || '#999' }}
                    >
                      {PLATFORM_NAMES[card.source?.platform] || card.source?.platform || '未知'}
                    </span>
                  </div>
                </div>
                <div className="card-question">
                  {card.original_question
                    || (card.summarize_error ? `⚠️ ${card.summarize_error}` : '暂无核心问题')}
                </div>
                <div className="card-tags">
                  <span className="tag" style={{
                    background: card.summarize_error ? '#fff3e0' : '#f0f0ff',
                    color: card.summarize_error ? '#e65100' : '#667eea',
                    fontWeight: 500,
                  }}>
                    {card.card_type}
                  </span>
                  {card.tags?.map((tag, i) => (
                    <span key={i} className="tag">{tag}</span>
                  ))}
                </div>
                <div className="card-footer">
                  <span>{new Date(card.created_at).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
              >上一页</button>
              <span style={{ padding: '8px 12px', fontSize: 13 }}>
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(currentPage + 1)}
              >下一页</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============ 收藏列表组件 ============

function FavoritesList({ onCardClick, onBack }: { onCardClick: (id: string) => void; onBack: () => void }) {
  const [cards, setCards] = useState<KnowledgeCardSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCards()
  }, [])

  const loadCards = async () => {
    try {
      setLoading(true)
      const data = await getStarredCards({ page: '1', pageSize: '1000' })
      setCards(data.cards || [])
    } catch (e) {
      console.error('Failed to load favorites:', e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="loading">加载中...</div>

  return (
    <div>
      <button className="back-btn" style={{ marginBottom: 16 }} onClick={onBack}>← 返回首页</button>
      <h2 style={{ fontSize: 20, marginBottom: 20 }}>收藏</h2>
      {cards.length === 0 ? (
        <div className="empty-state">
          <div className="icon"></div>
          <h3>暂无收藏卡片</h3>
          <p>在卡片详情中点击收藏，即可在这里查看</p>
        </div>
      ) : (
        <div className="cards-grid">
          {cards.map(card => (
            <div
              key={card.id}
              className={`card-item ${card.summarize_error ? 'card-item--error' : ''}`}
              onClick={() => onCardClick(card.id)}
            >
              <div className="card-header">
                <div className="card-title">{card.title}</div>
                <span
                  className="platform-badge"
                  style={{ background: PLATFORM_COLORS[card.source?.platform] || '#999' }}
                >
                  {PLATFORM_NAMES[card.source?.platform] || card.source?.platform || '未知'}
                </span>
              </div>
              <div className="card-question">{card.original_question || '暂无核心问题'}</div>
              <div className="card-tags">
                <span className="tag" style={{ background: '#f0f0ff', color: '#667eea', fontWeight: 500 }}>
                  {card.card_type}
                </span>
                {card.tags?.map((tag, i) => (
                  <span key={i} className="tag">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============ 统计页面组件 ============

function StatisticsPage() {
  const [stats, setStats] = useState<StatisticsType | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getStatistics().then((data: any) => {
      setStats(data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading">加载中...</div>
  if (!stats) return <div className="empty-state"><h3>暂无统计数据</h3></div>

  const maxByType = Math.max(...Object.values(stats.byType), 1)
  const maxByPlatform = Math.max(...Object.values(stats.byPlatform), 1)

  return (
    <div className="statistics-page">
      <h2>统计</h2>

      {/* 总卡片数 */}
      <div className="stat-card">
        <h3>知识卡片总数</h3>
        <div className="stat-total">{stats.total}</div>
      </div>

      {/* 按意图分类 */}
      <div className="stat-card">
        <h3>按意图分类</h3>
        {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
          <div key={type}>
            <div className="stat-row">
              <span>{type}</span>
              <span className="stat-row-value">{count}</span>
            </div>
            <div className="stat-bar" style={{
              width: `${(count / maxByType) * 100}%`,
              background: 'linear-gradient(90deg, #667eea, #818cf8)',
            }} />
          </div>
        ))}
      </div>

      {/* 按平台分布 */}
      <div className="stat-card">
        <h3>按平台分布</h3>
        {Object.entries(stats.byPlatform).sort((a, b) => b[1] - a[1]).map(([platform, count]) => (
          <div key={platform}>
            <div className="stat-row">
              <div className="stat-row-label">
                <span className="stat-row-dot" style={{ background: PLATFORM_COLORS[platform] || '#999' }} />
                <span>{PLATFORM_NAMES[platform] || platform}</span>
              </div>
              <span className="stat-row-value">{count}</span>
            </div>
            <div className="stat-bar" style={{
              width: `${(count / maxByPlatform) * 100}%`,
              background: PLATFORM_COLORS[platform] || '#999',
            }} />
          </div>
        ))}
      </div>

      {/* 标签 TOP */}
      {Object.keys(stats.byTag).length > 0 && (
        <div className="stat-card">
          <h3>热门标签 TOP 10</h3>
          {Object.entries(stats.byTag)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([tag, count], i) => (
              <div className="stat-row" key={tag}>
                <span>
                  <span style={{ color: '#999', marginRight: 8, fontSize: 12 }}>#{i + 1}</span>
                  {tag}
                </span>
                <span className="stat-row-value">{count}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

// ============ 卡片详情组件 ============

function CardDetail({ cardId, onBack }: {
  cardId: string
  onBack: () => void
}) {
  const [card, setCard] = useState<KnowledgeCardDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showRawMessages, setShowRawMessages] = useState(false)
  const [summarizing, setSummarizing] = useState(false)

  useEffect(() => {
    loadCard()
  }, [cardId])

  const loadCard = async () => {
    try {
      setLoading(true)
      const data = await getCard(cardId)
      setCard(data.card)
    } catch (e) {
      console.error('Failed to load card:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('确定删除此知识卡片？')) return
    try {
      await deleteCard(cardId)
      onBack()
    } catch (e) {
      console.error('Failed to delete card:', e)
    }
  }

  const handleResummarize = async () => {
    setSummarizing(true)
    try {
      const data = await summarizeCard(cardId)
      setCard(data.card)
    } catch (e) {
      alert('重新总结失败: ' + (e as Error).message)
    } finally {
      setSummarizing(false)
    }
  }

  if (loading) return <div className="loading">加载中...</div>
  if (!card) return <div className="empty-state"><h3>卡片不存在</h3></div>

  return (
    <div className="card-detail">
      <button className="back-btn" onClick={onBack}>← 返回列表</button>

      <div className="detail-card">
        {/* 总结失败提示 */}
        {card.summarize_error && (
          <div style={{
            padding: '12px 16px',
            background: '#fff3e0',
            border: '1px solid #ffcc80',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            color: '#e65100',
          }}>
            ⚠️ AI 总结失败：{card.summarize_error}
            <br />
            请检查设置中的 API Key 是否正确、额度是否充足，然后点击「重新总结」重试。
          </div>
        )}

        {/* 标题和操作 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="tag" style={{ background: '#667eea', color: '#fff', fontWeight: 600, fontSize: 12, padding: '3px 10px', borderRadius: 12 }}>
              {card.card_type}
            </span>
            <div className="detail-title">{card.title}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="back-btn" onClick={handleResummarize} disabled={summarizing}>
              {summarizing ? '总结中...' : '🔄 重新总结'}
            </button>
            <button className="delete-btn" onClick={handleDelete}>删除</button>
          </div>
        </div>

        {/* 核心问题 */}
        {card.original_question && (
          <div className="detail-section">
            <div className="section-label">核心问题</div>
            <div className="section-content">{card.original_question}</div>
          </div>
        )}

        {/* 卡片叙事 */}
        {card.narrative && (
          <div className="detail-section">
            <div className="section-label">卡片叙事</div>
            <div className="section-content" style={{ lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{card.narrative}</div>
          </div>
        )}

        {/* 标签 */}
        {card.tags?.length > 0 && (
          <div className="detail-section">
            <div className="section-label">标签</div>
            <div className="detail-tags">
              {card.tags.map((tag, i) => (
                <span key={i} className="detail-tag">{tag}</span>
              ))}
            </div>
          </div>
        )}

        {/* 来源信息 */}
        <div className="detail-section">
          <div className="section-label">来源</div>
          <div className="section-content" style={{ fontSize: 13, color: '#666' }}>
            <span
              className="platform-badge"
              style={{ background: PLATFORM_COLORS[card.source?.platform] || '#999', marginRight: 8 }}
            >
              {PLATFORM_NAMES[card.source?.platform] || card.source?.platform}
            </span>
            {card.source?.captured_at && new Date(card.source.captured_at).toLocaleString('zh-CN')}
            <span style={{ margin: '0 8px' }}>·</span>
          </div>
          {card.source?.url && (
            <a className="source-link" href={card.source.url} target="_blank" rel="noopener noreferrer">
              🔗 回到原始对话
            </a>
          )}
        </div>

        {/* 对话记录 */}
        <div className="messages-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="section-label" style={{ margin: 0 }}>对话记录</div>
            <button className="back-btn" onClick={() => setShowRawMessages(!showRawMessages)}>
              {showRawMessages ? '查看清洗版' : '查看原始版'}
            </button>
          </div>
          {(showRawMessages ? card.rawMessages : card.cleanMessages)?.map((msg, i) => (
            <div key={i} style={{
              marginBottom: 8,
              padding: '8px 12px',
              borderRadius: 6,
              background: msg.role === 'user' ? '#f8f9ff' : '#fafafa',
              borderLeft: msg.role === 'user' ? '3px solid #667eea' : '3px solid #43a047',
            }}>
              <div className="msg-label">{msg.role === 'user' ? '👤 用户' : '🤖 AI'}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============ 设置页组件 ============

function SettingsPage({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<Settings>({})
  const [apiKey, setApiKey] = useState('')
  const [apiUrl, setApiUrl] = useState('https://api.openai.com/v1')
  const [model, setModel] = useState('gpt-4.1-nano')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const data = await getSettings()
      setSettings(data.settings)
      setApiUrl(data.settings.apiUrl || 'https://api.openai.com/v1')
      setModel(data.settings.model || 'gpt-4.1-nano')
      if (!data.settings._hasApiKey) {
        setApiKey('')
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      const updates: Record<string, string> = { apiUrl, model }
      if (apiKey) updates.apiKey = apiKey
      await updateSettings(updates)
      setMessage('✅ 设置已保存')
      loadSettings()
    } catch (e) {
      setMessage('❌ 保存失败: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-page">
      <button className="back-btn" onClick={onBack}>← 返回</button>
      <h2>设置</h2>

      <div className="form-group">
        <label>API Key</label>
        <input
          type="password"
          placeholder={settings._hasApiKey ? '已配置（输入新值可修改）' : '请输入 API Key'}
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
        />
        <div className="hint">支持 OpenAI、DeepSeek 等兼容 OpenAI 格式的 API Key</div>
      </div>

      <div className="form-group">
        <label>API 地址</label>
        <select value={apiUrl} onChange={e => setApiUrl(e.target.value)}>
          <option value="https://api.openai.com/v1">OpenAI (api.openai.com)</option>
          <option value="https://api.deepseek.com/v1">DeepSeek (api.deepseek.com)</option>
          <option value="https://open.bigmodel.cn/api/paas/v4">智谱 GLM (open.bigmodel.cn)</option>
          <option value="custom">自定义...</option>
        </select>
        {apiUrl === 'custom' && (
          <input
            type="text"
            placeholder="输入自定义 API 地址"
            onChange={e => setApiUrl(e.target.value)}
            style={{ marginTop: 8 }}
          />
        )}
      </div>

      <div className="form-group">
        <label>模型</label>
        <select value={model} onChange={e => setModel(e.target.value)}>
          <option value="gpt-4.1-nano">GPT-4.1 nano（推荐，性价比最高）</option>
          <option value="gpt-4.1-mini">GPT-4.1 mini（质量更好）</option>
          <option value="deepseek-chat">DeepSeek V3（国内首选）</option>
          <option value="glm-4-flash">GLM-4 Flash（国内免费额度）</option>
        </select>
        <div className="hint">总结任务为轻推理，小模型即可胜任，单次成本约 ¥0.01</div>
      </div>

      {message && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: message.startsWith('✅') ? '#e8f5e9' : '#ffebee', fontSize: 13 }}>
          {message}
        </div>
      )}

      <button className="save-btn" onClick={handleSave} disabled={saving}>
        {saving ? '保存中...' : '保存设置'}
      </button>

      <div style={{ marginTop: 32, padding: 16, background: '#f8f9ff', borderRadius: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>快速开始指南</div>
        <ol style={{ fontSize: 13, lineHeight: 2, paddingLeft: 20, color: '#555' }}>
          <li>启动后端服务：<code style={{ background: '#e8e8e8', padding: '2px 6px', borderRadius: 3 }}>npm run server</code></li>
          <li>在上方配置你的 API Key</li>
          <li>在 Chrome 中加载扩展（chrome://extensions → 开发者模式 → 加载已解压的扩展）</li>
          <li>选择 demo/extension 文件夹</li>
          <li>打开任意 LLM 对话页面，点击右侧悬浮球</li>
          <li>回到此页面查看生成的知识卡片</li>
        </ol>
      </div>
    </div>
  )
}

export default App