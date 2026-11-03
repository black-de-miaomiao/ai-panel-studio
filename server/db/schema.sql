-- AI Panel Studio SQLite 持久化结构；可重复执行，不在此处设置连接级 PRAGMA。

CREATE TABLE IF NOT EXISTS discussions (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL CHECK (length(trim(topic)) BETWEEN 2 AND 200),
  expert_count INTEGER NOT NULL DEFAULT 4 CHECK (expert_count BETWEEN 2 AND 6),
  status TEXT NOT NULL CHECK (
    status IN (
      'draft',
      'lineup_ready',
      'live',
      'paused',
      'summarizing',
      'ended',
      'failed'
    )
  ),
  max_turns INTEGER NOT NULL DEFAULT 16 CHECK (max_turns > 0),
  turn_count INTEGER NOT NULL DEFAULT 0 CHECK (turn_count >= 0),
  summary TEXT,
  error_message TEXT,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'seed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  discussion_id TEXT NOT NULL
    REFERENCES discussions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('host', 'expert')),
  seat INTEGER NOT NULL CHECK (seat >= 0),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 12),
  profession TEXT NOT NULL CHECK (length(profession) BETWEEN 1 AND 20),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 30),
  stance TEXT NOT NULL CHECK (length(stance) BETWEEN 1 AND 80),
  stance_tag TEXT NOT NULL CHECK (length(stance_tag) BETWEEN 1 AND 6),
  persona TEXT NOT NULL DEFAULT '' CHECK (length(persona) <= 200),
  color TEXT NOT NULL CHECK (
    color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
  ),
  avatar TEXT NOT NULL,
  agent_state TEXT NOT NULL DEFAULT 'idle'
    CHECK (agent_state IN ('idle', 'preparing', 'speaking')),
  agent_intent TEXT
    CHECK (
      agent_intent IS NULL OR
      agent_intent IN ('raise_hand', 'interrupt', 'supplement', 'rebut')
    ),
  focus TEXT CHECK (focus IS NULL OR length(focus) <= 40),
  speak_count INTEGER NOT NULL DEFAULT 0 CHECK (speak_count >= 0),
  created_at TEXT NOT NULL,
  UNIQUE (discussion_id, seat),
  CHECK (
    (role = 'host' AND seat = 0) OR
    (role = 'expert' AND seat > 0)
  ),
  CHECK (agent_state = 'preparing' OR agent_intent IS NULL)
);

CREATE TABLE IF NOT EXISTS utterances (
  id TEXT PRIMARY KEY,
  discussion_id TEXT NOT NULL
    REFERENCES discussions(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL
    REFERENCES participants(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq > 0),
  act TEXT NOT NULL CHECK (
    act IN (
      'opening',
      'follow_up',
      'bridge',
      'invite',
      'closing',
      'statement',
      'interrupt',
      'supplement',
      'rebut'
    )
  ),
  reply_to_participant_id TEXT
    REFERENCES participants(id) ON DELETE SET NULL,
  content TEXT NOT NULL CHECK (length(content) > 0),
  created_at TEXT NOT NULL,
  UNIQUE (discussion_id, seq)
);

CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  discussion_id TEXT NOT NULL
    REFERENCES discussions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('consensus', 'divergence')),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'resolved')),
  evidence_seqs TEXT NOT NULL DEFAULT '[]',
  updated_at_seq INTEGER NOT NULL CHECK (updated_at_seq > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS insight_stances (
  insight_id TEXT NOT NULL
    REFERENCES insights(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL
    REFERENCES participants(id) ON DELETE CASCADE,
  position TEXT NOT NULL CHECK (length(position) BETWEEN 1 AND 40),
  PRIMARY KEY (insight_id, participant_id)
);

CREATE TABLE IF NOT EXISTS events (
  discussion_id TEXT NOT NULL
    REFERENCES discussions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq > 0),
  type TEXT NOT NULL CHECK (
    type IN (
      'discussion.status',
      'lineup.updated',
      'utterance.completed',
      'insights.updated',
      'summary.completed'
    )
  ),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (discussion_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_insights_discussion
  ON insights(discussion_id, kind);

CREATE INDEX IF NOT EXISTS idx_discussions_status
  ON discussions(status, updated_at);
