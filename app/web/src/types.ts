// 共享类型定义 — 对齐 PRD-v2 数据模型

// 10 个意图大类（PRD-v2 §7.1）
export type CardType =
  | '概念理解'
  | '事实查询'
  | '技能学习'
  | '操作指南'
  | '内容创作'
  | '文本处理'
  | '规划决策'
  | '头脑风暴'
  | '交互陪伴'
  | '其他';

export interface ReviewHistoryEntry {
  date: string;       // YYYY-MM-DD
  interval: number;   // 艾宾浩斯间隔（天）
  acknowledged: boolean;
}

export interface ReviewSchedule {
  intervals: number[];          // [1, 2, 4, 7, 15, 30]
  review_history: ReviewHistoryEntry[];
  mastered: boolean;
  next_review_date?: string;    // YYYY-MM-DD
  review_material?: string;     // AI 生成的复习素材
}

export interface KnowledgeCardSummary {
  id: string;
  title: string;
  original_question: string;
  card_type: CardType;            // 意图大类
  tags: string[];                 // parent/child 层级标签
  narrative: string;              // 卡片叙事（列表页摘要用）
  source: {
    platform: string;
    url?: string;
    conversation_id?: string;
    captured_at: string;
  };
  summary_confidence?: number;    // 0~1
  summarize_error?: string;       // AI 总结失败原因
  created_at: string;
  updated_at: string;
  starred: boolean;
  archived: boolean;
}

export interface KnowledgeCardDetail extends KnowledgeCardSummary {
  narrative: string;               // AI 生成的叙事文本（统一描述）
  full_output: string | null;      // 可复用产出原文（内容创作/文本处理类）
  insights: string[];
  outputs: string[];
  unresolved_questions: string[];  // 遗留问题
  exploration_paths: string[];     // 探索方向
  review_schedule: ReviewSchedule; // 复习调度
  rawMessages: Array<{ role: string; content: string }>;
  cleanMessages: Array<{ role: string; content: string }>;
}

export interface CardListResponse {
  total: number;
  page: number;
  pageSize: number;
  cards: KnowledgeCardSummary[];
}

export interface Settings {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  _hasApiKey?: boolean;
}

export interface TagInfo {
  tag: string;
  count: number;
}

export interface Statistics {
  total: number;
  byType: Record<string, number>;
  byPlatform: Record<string, number>;
  byTag: Record<string, number>;
}

// 平台名称映射
export const PLATFORM_NAMES: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  deepseek: 'DeepSeek',
  doubao: '豆包',
  gemini: 'Gemini',
  kimi: 'Kimi',
  minimax: 'MiniMax',
  qwen: '通义千问',
  yuanbao: '腾讯元宝',
};

// 平台颜色
export const PLATFORM_COLORS: Record<string, string> = {
  chatgpt: '#10a37f',
  claude: '#d97757',
  deepseek: '#4d6bfe',
  doubao: '#fe2c55',
  gemini: '#4285f4',
  kimi: '#6c5ce7',
  minimax: '#00b894',
  qwen: '#6236ff',
  yuanbao: '#07c160',
};
