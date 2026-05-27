import { useState, useEffect, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import './index.css'
import { getCards, getCard, deleteCard, getSettings, updateSettings, summarizeCard, getTags, getStarredCards, getStatistics, updateCard, testSettingsConnection } from './api'
import type { KnowledgeCardSummary, KnowledgeCardDetail, Settings, CardListResponse, TagInfo, Statistics as StatisticsType } from './types'
import { PLATFORM_NAMES, PLATFORM_COLORS } from './types'
import { LogoIcon, NavIcon } from './Logo'
import likeIcon from './assets/like.svg'
import likedIcon from './assets/liked.svg'
import trashIcon from './assets/delete.svg'

type Page = 'list' | 'detail' | 'settings' | 'favorites' | 'statistics'

const CARD_LIST_PAGE_SIZE = 12

/** 质检清洗：移除 markdown 格式标识和转义字符（前端兜底） */
function sanitizeContent(text: string): string {
  if (!text) return ''
  let t = text
  t = t.replace(/\\n/g, '\n')
  t = t.replace(/\\r/g, '')
  t = t.replace(/^#{1,6}\s+/gm, '')
  t = t.replace(/\*\*(.+?)\*\*/g, '$1')
  t = t.replace(/([^\n*])\*([^*\n]+?)\*([^\n*])/g, '$1$2$3')
  t = t.replace(/^[-*_]{3,}\s*$/gm, '')
  t = t.replace(/^(好的[，,]\s*|当然[，,]\s*|以下是我的[^：:]*[：:]\s*|以下是[^：:]*[：:]\s*)/gm, '')
  t = t.replace(/\n{3,}/g, '\n\n')
  // 8. 剥离 HTML 标签（TipTap 编辑器输出的是 HTML）
  t = t.replace(/<[^>]*>/g, '')
  return t.trim()
}

/** 从 HTML 中提取段落文本数组 */
function extractParagraphs(html: string): string[] {
  if (!html) return []
  const div = document.createElement('div')
  div.innerHTML = html
  const ps = Array.from(div.querySelectorAll('p'))
  return ps.map(p => p.textContent?.trim() || '').filter(Boolean)
}

/** TipTap 富文本编辑器（B/I/U/高亮） */
function TipTapEditor({ content, onSave, placeholder }: {
  content: string
  onSave: (html: string) => void
  placeholder?: string
}) {
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const lastSavedHtml = useRef(content)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Highlight.configure({ multicolor: true }),
    ],
    content,
    editorProps: {
      attributes: {
        placeholder: placeholder || '输入内容...',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        // 只在内容实际变化时保存
        if (html !== lastSavedHtml.current) {
          lastSavedHtml.current = html
          onSave(html)
        }
      }, 800)
    },
  })

  // 外部 content 变更时同步（如切换卡片）
  useEffect(() => {
    if (editor && content !== lastSavedHtml.current) {
      lastSavedHtml.current = content
      editor.commands.setContent(content || '')
    }
  }, [content, editor])

  if (!editor) return null

  return (
    <div className="tiptap-wrapper">
      <div className="tiptap-toolbar">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'is-active' : ''} title="加粗" aria-label="加粗">
          <span className="format-icon format-icon--bold" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'is-active' : ''} title="斜体" aria-label="斜体">
          <span className="format-icon format-icon--italic" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={editor.isActive('underline') ? 'is-active' : ''} title="下划线" aria-label="下划线">
          <span className="format-icon format-icon--underline" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHighlight().run()} className={editor.isActive('highlight') ? 'is-active' : ''} title="高亮" aria-label="高亮">
          <span className="format-icon format-icon--highlight" aria-hidden="true" />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

// 意图标签颜色（柔和 tint 方案：低饱和背景 + 深色文字）
const INTENT_COLORS: Record<string, string> = {
  '概念理解': '#e8e8ff',
  '事实查询': '#e0f4ff',
  '技能学习': '#e0ffe8',
  '操作指南': '#fff3e0',
  '内容创作': '#ffe8f5',
  '文本处理': '#ede8ff',
  '规划决策': '#fff0e0',
  '头脑风暴': '#fffde0',
  '交互陪伴': '#e0fff8',
  '其他': '#e8e8e8',
}

const INTENT_TEXT_COLORS: Record<string, string> = {
  '概念理解': '#4f46e5',
  '事实查询': '#0284c7',
  '技能学习': '#059669',
  '操作指南': '#d97706',
  '内容创作': '#db2777',
  '文本处理': '#6d28d9',
  '规划决策': '#ea580c',
  '头脑风暴': '#ca8a04',
  '交互陪伴': '#0d9488',
  '其他': '#4b5563',
}

// 标签行截断：一行能放多少个字
// 卡片内宽约 288px，tag 11px 字体下约 13px/汉字 + 16px padding ≈ 29px
// 意图 tag 约 4 字 ≈ 70px，剩余 ≈ 218px，约能放 7-8 个汉字宽度的自定义标签
const TAG_CHAR_BUDGET = 30 // 自定义标签总字数预算（保守）

function fitTags(tags: string[], budget: number = TAG_CHAR_BUDGET): string[] {
  let count = 0
  const result: string[] = []
  for (const tag of tags) {
    count += tag.length + 1 // +1 for gap margin
    if (count > budget) break
    result.push(tag)
  }
  return result
}

function ConfirmModal({ message, onConfirm, onCancel }: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <img src={trashIcon} className="confirm-icon" alt="" />
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn--cancel" onClick={onCancel}>取消</button>
          <button className="confirm-btn confirm-btn--danger" onClick={onConfirm}>确认删除</button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [page, setPage] = useState<Page>('list')
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [currentCardType, setCurrentCardType] = useState<string>('全部')
  const [currentTag, setCurrentTag] = useState<string>('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [cards, setCards] = useState<KnowledgeCardSummary[]>([])
  const [totalCards, setTotalCards] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)

  // 加载卡片列表
  const loadCards = async () => {
    try {
      const params: Record<string, string> = { page: String(currentPage), pageSize: String(CARD_LIST_PAGE_SIZE) }
      if (currentCardType !== '全部') params.card_type = currentCardType
      if (currentTag) params.tag = currentTag
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
  }, [currentCardType, currentTag, currentPage])

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
        currentTag={currentTag}
        onCardTypeChange={(type) => { setCurrentCardType(type); setCurrentPage(1); }}
        onTagChange={(tag) => { setCurrentTag(tag); setCurrentCardType('全部'); setCurrentPage(1); }}
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
            currentTag={currentTag}
            onTagClear={() => { setCurrentTag(''); }}
          />
        )}
        {page === 'favorites' && (
          <FavoritesList onCardClick={handleCardClick} />
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

function Sidebar({ currentPage, onNavigate, currentCardType, currentTag, onCardTypeChange, onTagChange, onOpenSettings }: {
  currentPage: Page
  onNavigate: (p: Page) => void
  currentCardType: string
  currentTag: string
  onCardTypeChange: (type: string) => void
  onTagChange: (tag: string) => void
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
        <div className="brand-copy">
          <div className="brand-name">Memora</div>
          <div className="brand-tagline">微忆，让知识在对话里生长</div>
        </div>
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
            <span className="tags-empty">暂无标签</span>
          ) : (
            tags.map(t => (
              <span
                key={t.tag}
                className={`tag-chip ${currentTag === t.tag ? 'tag-chip--active' : ''}`}
                title={`${t.tag} (${t.count})`}
                onClick={() => { onNavigate('list'); onCardTypeChange('全部'); onTagChange(currentTag === t.tag ? '' : t.tag); }}
              >
                {t.tag}
              </span>
            ))
          )}
        </div>
      </div>

      {/* 底部：设置按钮 */}
      <div className="sidebar-footer">
        <button className="settings-btn" onClick={onOpenSettings} title="设置">
          <span className="material-symbols-rounded">settings</span>
        </button>
      </div>
    </div>
  )
}

// ============ 卡片列表组件 ============

function CardList({ cards, totalCards, currentPage, searchKeyword, onSearchChange, onSearch, onPageChange, onCardClick, currentCardType, currentTag, onTagClear }: {
  cards: KnowledgeCardSummary[]
  totalCards: number
  currentPage: number
  searchKeyword: string
  onSearchChange: (kw: string) => void
  onSearch: () => void
  onPageChange: (page: number) => void
  onCardClick: (id: string) => void
  currentCardType: string
  currentTag: string
  onTagClear: () => void
}) {
  const totalPages = Math.ceil(totalCards / CARD_LIST_PAGE_SIZE)
  const [menuCardId, setMenuCardId] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  // 本地覆盖状态：避免触发 App 重渲染导致 CardList 被销毁 remount
  const [starOverrides, setStarOverrides] = useState<Record<string, boolean>>({})
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuCardId) return
    const handler = () => setMenuCardId(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [menuCardId])

  const getStarred = (c: KnowledgeCardSummary) =>
    starOverrides[c.id] !== undefined ? starOverrides[c.id] : c.starred

  const visibleCards = cards.filter(c => !hiddenIds.has(c.id))

  const handleToggleStar = (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    const newStarred = !getStarred(card)
    setStarOverrides(prev => ({ ...prev, [cardId]: newStarred }))
    updateCard(cardId, { starred: newStarred }).catch(err => {
      setStarOverrides(prev => {
        const next = { ...prev }
        delete next[cardId]
        return next
      })
      console.error('Failed to toggle star:', err)
    })
  }

  const handleDelete = (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteTargetId(cardId)
    setMenuCardId(null)
  }

  const handleConfirmDelete = () => {
    if (!deleteTargetId) return
    const targetId = deleteTargetId
    setHiddenIds(prev => new Set([...prev, targetId]))
    setDeleteTargetId(null)
    setTotalCards(prev => prev - 1)
    deleteCard(targetId).catch(err => {
      setHiddenIds(prev => {
        const next = new Set(prev)
        next.delete(targetId)
        return next
      })
      setTotalCards(prev => prev + 1)
      console.error('Failed to delete card:', err)
    })
  }

  const formatCardDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const isToday = date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate()
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    if (isToday) {
      return `今天 ${hours}:${minutes}`
    }
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  const formatNarrative = (narrative: string) => {
    if (!narrative) return ''
    // 取前 120 字，截断处尽量在标点
    const cleaned = sanitizeContent(narrative); const text = cleaned.replace(/\n+/g, ' ').trim()
    if (text.length <= 120) return text
    const cut = text.slice(0, 120)
    const lastPunct = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'), cut.lastIndexOf('，'))
    return lastPunct > 60 ? cut.slice(0, lastPunct + 1) : cut + '…'
  }

  return (
    <div className="page-shell list-page">
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

      {currentTag && (
        <div className="tag-filter-bar">
          <span className="tag-filter-label">当前筛选：</span>
          <span className="tag-filter-tag">{currentTag}</span>
          <button className="tag-filter-clear" onClick={onTagClear}>清除筛选</button>
        </div>
      )}

      {visibleCards.length === 0 ? (
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
          <div className="list-meta">
            {currentCardType === '全部' ? '全部' : `意图: ${currentCardType}`} · 共 {totalCards} 条
          </div>
          <div className="cards-grid">
            {visibleCards.map(card => (
              <div
                key={card.id}
                className={`card-item ${card.summarize_error ? 'card-item--error' : ''}`}
                onClick={() => onCardClick(card.id)}
                style={card.summarize_error ? { borderColor: '#ff9800' } : {}}
              >
                {/* 标题行 */}
                <div className="card-header">
                  <div className="card-title">{card.title}</div>
                  <div className="card-header-actions">
                    {card.summarize_error && (
                      <span className="error-badge" title={card.summarize_error}>
                        总结失败
                      </span>
                    )}
                    <button
                      className="card-more-btn"
                      onClick={(e) => { e.stopPropagation(); setMenuCardId(menuCardId === card.id ? null : card.id) }}
                    >
                      ⋮
                    </button>
                    {menuCardId === card.id && (
                      <div className="card-menu" onClick={e => e.stopPropagation()}>
                        <button
                          className={`card-menu-item ${getStarred(card) ? 'card-menu-item--starred' : ''}`}
                          onClick={(e) => handleToggleStar(card.id, e)}
                        >
                          <img src={getStarred(card) ? likedIcon : likeIcon} className="menu-icon" alt="" />
                          {getStarred(card) ? '已收藏' : '收藏'}
                        </button>
                        <button className="card-menu-item card-menu-item--danger" onClick={(e) => handleDelete(card.id, e)}>
                          <img src={trashIcon} className="menu-icon" alt="" />
                          删除
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 正文预览（narrative 摘要） */}
                <div className="card-preview">
                  {card.narrative
                    ? formatNarrative(card.narrative)
                    : (card.summarize_error ? card.summarize_error : '暂无摘要')}
                </div>

                {/* 标签行 */}
                <div className="card-tags">
                  <span className="tag tag--type" style={{
                    background: INTENT_COLORS[card.card_type] || '#e8e8e8',
                    color: INTENT_TEXT_COLORS[card.card_type] || '#4b5563',
                  }}>
                    {card.card_type}
                  </span>
                  {fitTags(card.tags || []).map((tag, i) => (
                    <span key={i} className="tag">{tag}</span>
                  ))}
                </div>

                {/* 底部日期 */}
                <div className="card-footer">
                  <span className="card-date">{formatCardDate(card.source?.captured_at || card.created_at)}</span>
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
              <span className="pagination-current">
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
      {deleteTargetId && (
        <ConfirmModal
          message="确定删除此知识卡片？"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTargetId(null)}
        />
      )}
    </div>
  )
}

// ============ 收藏列表组件 ============

function FavoritesList({ onCardClick }: { onCardClick: (id: string) => void }) {
  const [cards, setCards] = useState<KnowledgeCardSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [menuCardId, setMenuCardId] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadCards()
  }, [])

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuCardId) return
    const handler = () => setMenuCardId(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [menuCardId])

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

  const visibleCards = cards.filter(c => !hiddenIds.has(c.id))

  const handleToggleStar = (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setHiddenIds(prev => new Set([...prev, cardId]))
    updateCard(cardId, { starred: false }).catch(err => {
      setHiddenIds(prev => {
        const next = new Set(prev)
        next.delete(cardId)
        return next
      })
      console.error('Failed to unstar card:', err)
    })
  }

  const handleDelete = (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteTargetId(cardId)
    setMenuCardId(null)
  }

  const handleConfirmDelete = () => {
    if (!deleteTargetId) return
    const targetId = deleteTargetId
    setHiddenIds(prev => new Set([...prev, targetId]))
    setDeleteTargetId(null)
    deleteCard(targetId).catch(err => {
      setHiddenIds(prev => {
        const next = new Set(prev)
        next.delete(targetId)
        return next
      })
      console.error('Failed to delete card:', err)
    })
  }

  const formatCardDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const isToday = date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate()
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    if (isToday) {
      return `今天 ${hours}:${minutes}`
    }
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  const formatNarrative = (narrative: string) => {
    if (!narrative) return ''
    const cleaned = sanitizeContent(narrative); const text = cleaned.replace(/\n+/g, ' ').trim()
    if (text.length <= 120) return text
    const cut = text.slice(0, 120)
    const lastPunct = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'), cut.lastIndexOf('，'))
    return lastPunct > 60 ? cut.slice(0, lastPunct + 1) : cut + '…'
  }

  if (loading) return <div className="loading">加载中...</div>

  return (
    <div className="favorites-page">
      <h1 className="favorites-title">收藏</h1>
      {visibleCards.length === 0 ? (
        <div className="empty-state">
          <div className="icon"></div>
          <h3>暂无收藏卡片</h3>
          <p>在卡片详情中点击收藏，即可在这里查看</p>
        </div>
      ) : (
        <div className="cards-grid">
          {visibleCards.map(card => (
            <div
              key={card.id}
              className={`card-item ${card.summarize_error ? 'card-item--error' : ''}`}
              onClick={() => onCardClick(card.id)}
            >
              <div className="card-header">
                <div className="card-title">{card.title}</div>
                <div className="card-header-actions">
                  {card.summarize_error && (
                    <span className="error-badge" title={card.summarize_error}>
                      总结失败
                    </span>
                  )}
                  <button
                    className="card-more-btn"
                    onClick={(e) => { e.stopPropagation(); setMenuCardId(menuCardId === card.id ? null : card.id) }}
                  >
                    ⋮
                  </button>
                  {menuCardId === card.id && (
                    <div className="card-menu" onClick={e => e.stopPropagation()}>
                      <button
                        className="card-menu-item card-menu-item--starred"
                        onClick={(e) => handleToggleStar(card.id, e)}
                      >
                        <img src={likedIcon} className="menu-icon" alt="" />
                        已收藏
                      </button>
                      <button className="card-menu-item card-menu-item--danger" onClick={(e) => handleDelete(card.id, e)}>
                        <img src={trashIcon} className="menu-icon" alt="" />
                        删除
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="card-preview">
                {card.narrative
                  ? formatNarrative(card.narrative)
                  : (card.summarize_error ? card.summarize_error : '暂无摘要')}
              </div>

              <div className="card-tags">
                <span className="tag tag--type" style={{
                  background: INTENT_COLORS[card.card_type] || '#e8e8e8',
                  color: INTENT_TEXT_COLORS[card.card_type] || '#4b5563',
                }}>
                  {card.card_type}
                </span>
                {fitTags(card.tags || []).map((tag, i) => (
                  <span key={i} className="tag">{tag}</span>
                ))}
              </div>

              <div className="card-footer">
                <span className="card-date">{formatCardDate(card.source?.captured_at || card.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {deleteTargetId && (
        <ConfirmModal
          message="确定删除此知识卡片？"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTargetId(null)}
        />
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
      <h1 className="statistics-title">统计</h1>

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
                  <span className="stat-rank">#{i + 1}</span>
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
  const [summarizing, setSummarizing] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'conversation'>('overview')
  const [showDropdown, setShowDropdown] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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

  const handleDelete = () => {
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false)
    onBack()
    deleteCard(cardId).catch(e => console.error('Failed to delete card:', e))
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

  const handleToggleFavorite = () => {
    if (!card) return
    const newStarred = !card.starred
    flushSync(() => {
      setCard({ ...card, starred: newStarred })
    })
    updateCard(cardId, { starred: newStarred }).catch(e => {
      setCard({ ...card, starred: !newStarred })
      console.error('Failed to toggle favorite:', e)
    })
  }

  const handleChangeCardType = async (newType: string) => {
    if (!card || newType === card.card_type) { setShowTypeMenu(false); return }
    try {
      await updateCard(cardId, { card_type: newType })
      setCard({ ...card, card_type: newType })
      setShowTypeMenu(false)
    } catch (e) {
      console.error('Failed to change card type:', e)
    }
  }

  const handleStartEditTitle = () => {
    setEditTitleValue(card?.title || '')
    setEditingTitle(true)
  }

  const handleSaveTitle = async () => {
    if (!editTitleValue.trim()) return
    try {
      await updateCard(cardId, { title: editTitleValue.trim() })
      setCard(prev => prev ? { ...prev, title: editTitleValue.trim() } : prev)
      setEditingTitle(false)
    } catch (e) {
      alert('更新标题失败: ' + (e as Error).message)
    }
  }

  const handleCancelEditTitle = () => {
    setEditingTitle(false)
    setEditTitleValue('')
  }

  const handleExport = async (format: 'txt' | 'pdf' | 'image') => {
    if (!card) return
    setShowExportMenu(false)
    setExporting(true)
    try {
      const platformName = PLATFORM_NAMES[card.source?.platform] || card.source?.platform
      const content = `# ${card.title}

## 核心问题
${card.original_question || '无'}

## 关键结论
${card.narrative || '无'}

## 标签
${(card.tags || []).join(', ')}

## 来源
${platformName} | ${card.source?.captured_at ? new Date(card.source.captured_at).toLocaleString('zh-CN') : '未知'}
`
      const filename = card.title.replace(/[^一-龥a-zA-Z0-9]/g, '_')

      if (format === 'txt') {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${filename}.txt`
        a.click()
        URL.revokeObjectURL(url)
      } else if (format === 'pdf') {
        const doc = new jsPDF()
        doc.addFont('Helvetica', 'Helvetica', 'normal')
        doc.setFont('Helvetica')
        doc.setFontSize(16)
        doc.text(card.title, 20, 20, { maxWidth: 170 })
        doc.setFontSize(12)
        doc.setTextColor('#666')
        let y = 35
        doc.setTextColor('#333')
        doc.setFontSize(10)
        doc.text('Core Question', 20, y)
        doc.setTextColor('#666')
        y += 6
        const questionLines = doc.splitTextToSize(card.original_question || 'N/A', 170)
        doc.text(questionLines, 20, y)
        y += questionLines.length * 5 + 5
        doc.setTextColor('#333')
        doc.text('Key Conclusion', 20, y)
        doc.setTextColor('#666')
        y += 6
        const narrativeLines = doc.splitTextToSize(card.narrative || 'N/A', 170)
        doc.text(narrativeLines, 20, y)
        y += narrativeLines.length * 5 + 5
        doc.setTextColor('#999')
        doc.setFontSize(9)
        doc.text(`Tags: ${(card.tags || []).join(', ')} | Source: ${platformName}`, 20, y)
        doc.save(`${filename}.pdf`)
      } else if (format === 'image') {
        const detailEl = document.querySelector('.detail-card')
        if (!detailEl) return
        const canvas = await html2canvas(detailEl as HTMLElement, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
        })
        const a = document.createElement('a')
        a.href = canvas.toDataURL('image/png')
        a.download = `${filename}.png`
        a.click()
      }
    } catch (e) {
      console.error('Export failed:', e)
      alert('导出失败: ' + (e as Error).message)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div className="loading">加载中...</div>
  if (!card) return <div className="empty-state"><h3>卡片不存在</h3></div>

  const platformName = PLATFORM_NAMES[card.source?.platform] || card.source?.platform

  return (
    <div className="card-detail">
      {/* Header: back icon + title + actions */}
      <div className="detail-hero">
        <div className="detail-title-group">
          <button className="icon-btn" onClick={onBack}>
            <span className="material-symbols-rounded">arrow_back</span>
          </button>
          {editingTitle ? (
            <input
              className="title-edit-input"
              value={editTitleValue}
              onChange={e => setEditTitleValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveTitle()
                if (e.key === 'Escape') handleCancelEditTitle()
              }}
              autoFocus
            />
          ) : (
            <div className="detail-title">{card.title}</div>
          )}
        </div>
        <div className="detail-actions">
          {!editingTitle && (
            <button className="icon-btn" onClick={handleStartEditTitle}>
              <span className="material-symbols-rounded">edit</span>
            </button>
          )}
          {!editingTitle && (
            <div className="dropdown-wrapper">
              <button className="icon-btn" onClick={() => setShowExportMenu(!showExportMenu)} disabled={exporting} title="导出卡片">
                <span className="material-symbols-rounded">download</span>
              </button>
              {showExportMenu && (
                <>
                  <div
                    className="menu-scrim"
                    onClick={() => setShowExportMenu(false)}
                  />
                  <div className="dropdown-menu">
                    <button className="dropdown-item" onClick={() => handleExport('txt')}>
                      <span className="material-symbols-rounded">description</span>
                      导出为 TXT
                    </button>
                    <button className="dropdown-item" onClick={() => handleExport('pdf')}>
                      <span className="material-symbols-rounded">picture_as_pdf</span>
                      导出为 PDF
                    </button>
                    <button className="dropdown-item" onClick={() => handleExport('image')}>
                      <span className="material-symbols-rounded">image</span>
                      导出为图片
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {editingTitle ? (
            <div className="title-edit-actions">
              <button className="save-title-btn" onClick={handleSaveTitle}>保存</button>
              <button className="cancel-title-btn" onClick={handleCancelEditTitle}>取消</button>
            </div>
          ) : (
            <div className="dropdown-wrapper">
              <button className="icon-btn" onClick={() => setShowDropdown(!showDropdown)}>
                <span className="material-symbols-rounded">more_vert</span>
              </button>
              {showDropdown && (
                <>
                  <div
                    className="menu-scrim"
                    onClick={() => setShowDropdown(false)}
                  />
                  <div className="dropdown-menu">
                    <button className={`dropdown-item ${card.starred ? 'dropdown-item--starred' : ''}`} onClick={handleToggleFavorite}>
                      <img src={card.starred ? likedIcon : likeIcon} className="dropdown-icon" alt="" />
                      {card.starred ? '取消收藏' : '收藏'}
                    </button>
                    <button className="dropdown-item danger" onClick={() => { setShowDropdown(false); handleDelete(); }}>
                      <img src={trashIcon} className="dropdown-icon" alt="" />
                      删除
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 总结失败提示 */}
      {card.summarize_error && (
        <div className="summary-error-panel">
          ⚠️ AI 总结失败：{card.summarize_error}
          <br />
          请检查设置中的 API Key 是否正确、额度是否充足，然后点击「重新总结」重试。
          <button
            className="back-btn"
            onClick={handleResummarize}
            disabled={summarizing}
          >
            {summarizing ? '总结中...' : '重新总结'}
          </button>
        </div>
      )}

      <div className="detail-card">
        {/* Tab 栏 */}
        <div className="detail-tabs">
          <button
            className={`detail-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            概览
          </button>
          <button
            className={`detail-tab ${activeTab === 'conversation' ? 'active' : ''}`}
            onClick={() => setActiveTab('conversation')}
          >
            原始对话
          </button>
        </div>

        {activeTab === 'overview' && (
          <>
            {/* 核心问题 */}
            {card.original_question && (
              <div className="detail-section detail-section--question">
                <div className="section-title">核心问题</div>
                <div className="question-box">
                  <div className="section-text">{sanitizeContent(card.original_question)}</div>
                </div>
              </div>
            )}

            {/* 卡片叙事（可编辑） */}
            <div className="detail-section detail-section--conclusion">
              <div className="section-title">关键结论</div>
              <TipTapEditor
                content={card.narrative || ''}
                onSave={(html) => updateCard(cardId, { narrative: html }).catch(e => console.error('保存 narrative 失败:', e))}
                placeholder="输入关键结论..."
              />
            </div>

            <hr className="overview-divider" />

            <div className="detail-section detail-meta-strip">
              <div className="detail-tags">
                <div className="dropdown-wrapper card-type-wrapper">
                  <button
                    className="card-type-badge card-type-badge--editable"
                    style={{
                      background: INTENT_COLORS[card.card_type] || '#e8e8e8',
                      color: INTENT_TEXT_COLORS[card.card_type] || '#4b5563',
                    }}
                    onClick={() => setShowTypeMenu(!showTypeMenu)}
                  >
                    {card.card_type}
                    <span className="material-symbols-rounded card-type-arrow">arrow_drop_down</span>
                  </button>
                </div>
                {showTypeMenu && CARD_TYPES.map(t => (
                  <button
                    key={t}
                    className={`intent-option-chip ${t === card.card_type ? 'intent-option-chip--active' : ''}`}
                    onClick={() => handleChangeCardType(t)}
                    style={{
                      background: INTENT_COLORS[t] || '#e8e8e8',
                      color: INTENT_TEXT_COLORS[t] || '#4b5563',
                    }}
                  >
                    {t}
                  </button>
                ))}
                {(card.tags || []).map((tag, i) => (
                  <span key={i} className="detail-tag">{tag}</span>
                ))}
              </div>
            </div>

            {/* 来源行 */}
            <div className="detail-section source-row">
              <span className="source-platform">
                {platformName}
              </span>
              {card.source?.captured_at && (
                <span>{new Date(card.source.captured_at).toLocaleString('zh-CN')}</span>
              )}
            </div>

            {/* 回到原始对话 */}
            {card.source?.url && (
              <button
                className="play-link"
                onClick={async () => {
                  const url = card.source!.url
                  try {
                    await fetch('/api/open-url', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ url }),
                    })
                  } catch {
                    window.open(url, '_blank', 'noopener,noreferrer')
                  }
                }}
              >
                <span className="material-symbols-rounded">link</span>
                回到原始对话
              </button>
            )}
          </>
        )}

        {activeTab === 'conversation' && (
          <div className="messages-section">
            <div className="messages-header">
              <div className="section-label">对话记录</div>
            </div>
            {(card.cleanMessages || []).map((msg, i) => (
              <div key={i} className={`message-pair ${msg.role === 'user' ? 'msg-user' : 'msg-assistant'}`}>
                <div className="msg-label">{msg.role === 'user' ? '用户' : platformName}</div>
                <div className="message-content">{sanitizeContent(msg.content)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showDeleteConfirm && (
        <ConfirmModal
          message="确定删除此知识卡片？"
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}

// ============ 设置页组件 ============

function SettingsPage({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<Settings>({})
  const [apiKey, setApiKey] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [model, setModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const [testResult, setTestResult] = useState<{ success: boolean; detail: string } | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const data = await getSettings()
      setSettings(data.settings)
      if (!data.settings._hasApiKey) {
        setApiKey('')
      }
      setApiUrl(data.settings.apiUrl || '')
      setModel(data.settings.model || '')
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    setTestResult(null)
    try {
      const updates: Record<string, string> = { apiUrl, model }
      if (apiKey) updates.apiKey = apiKey
      await updateSettings(updates)
      setMessage('设置已保存')
      loadSettings()
    } catch (e) {
      setMessage('保存失败: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    setMessage('')
    try {
      const data = await testSettingsConnection({
        apiKey: apiKey || undefined,
        apiUrl: apiUrl || undefined,
        model: model || undefined,
      })
      if (data.success) {
        setTestResult({ success: true, detail: data.message || '连接成功，API 响应正常' })
      } else {
        setTestResult({ success: false, detail: data.error || '连接失败' })
      }
    } catch (e) {
      setTestResult({ success: false, detail: (e as Error).message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button className="icon-btn" onClick={onBack}>
          <span className="material-symbols-rounded">arrow_back</span>
        </button>
        <h2>设置</h2>
      </div>

      <div className="settings-card">
        <div className="settings-section">
          <h3 className="settings-section-title">API 配置</h3>

          <div className="form-group">
            <label>API Key</label>
            <input
              type="password"
              placeholder={settings._hasApiKey ? '已配置（输入新值可修改）' : '请输入 API Key'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
            <div className="hint">支持 OpenAI、DeepSeek 等兼容 OpenAI 格式的 API</div>
          </div>

          <div className="form-group">
            <label>API 地址</label>
            <input
              type="text"
              placeholder="https://api.deepseek.com/v1"
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>模型</label>
            <input
              type="text"
              placeholder="deepseek-chat"
              value={model}
              onChange={e => setModel(e.target.value)}
            />
            <div className="hint">总结任务为轻推理，小模型即可胜任，单次成本约 ¥0.01</div>
          </div>
        </div>

        <div className="settings-actions">
          <button
            className="test-btn"
            onClick={handleTestConnection}
            disabled={testing || saving}
          >
            <span className="material-symbols-rounded">network_check</span>
            {testing ? '测试中...' : '测试连接'}
          </button>
          <button
            className="save-btn"
            onClick={handleSave}
            disabled={saving || testing}
          >
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>

        {testResult && (
          <div className={`test-result ${testResult.success ? 'test-result--success' : 'test-result--error'}`}>
            <span className="material-symbols-rounded">
              {testResult.success ? 'check_circle' : 'error'}
            </span>
            <span>{testResult.detail}</span>
          </div>
        )}

        {message && !message.startsWith('保存失败') && (
          <div className="save-message save-message--success">
            <span className="material-symbols-rounded">check_circle</span>
            <span>{message}</span>
          </div>
        )}
        {message && message.startsWith('保存失败') && (
          <div className="save-message save-message--error">
            <span className="material-symbols-rounded">error</span>
            <span>{message}</span>
          </div>
        )}
      </div>

      <div className="quick-start-card">
        <div className="quick-start-title">
          <span className="material-symbols-rounded">rocket_launch</span>
          快速开始
        </div>
        <ol className="quick-start-steps">
          <li>
            <span className="step-number">1</span>
            <div className="step-content">
              <strong>配置 API 信息</strong>
              <span>在上方填写你的 API Key、API 地址和模型名称</span>
            </div>
          </li>
          <li>
            <span className="step-number">2</span>
            <div className="step-content">
              <strong>安装浏览器扩展</strong>
              <span>打开支持扩展的浏览器，进入扩展管理页面 → 开启「开发者模式」→ 点击「加载已解压的扩展程序」→ 选择本项目的 extension 文件夹。当前支持：豆包、元宝、DeepSeek、Kimi、Qwen、ChatGPT、Gemini</span>
            </div>
          </li>
          <li>
            <span className="step-number">3</span>
            <div className="step-content">
              <strong>打开 LLM 对话页面</strong>
              <span>在浏览器中打开任意 LLM 网页版（如 ChatGPT、DeepSeek、豆包等），点击页面右侧的悬浮球即可自动抓取当前对话</span>
            </div>
          </li>
          <li>
            <span className="step-number">4</span>
            <div className="step-content">
              <strong>查看知识卡片</strong>
              <span>回到此页面，即可看到自动生成的知识卡片</span>
            </div>
          </li>
        </ol>
      </div>
    </div>
  )
}

export default App
