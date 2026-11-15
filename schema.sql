CREATE TABLE IF NOT EXISTS business_info (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  agency_name TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  tagline TEXT,
  subheadline TEXT,
  location TEXT,
  pricing_plans TEXT,
  admin_pin TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  client TEXT,
  category TEXT,
  url TEXT,
  image TEXT,
  description TEXT,
  tags TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_active TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  name TEXT,
  phone TEXT,
  email TEXT,
  service TEXT,
  budget TEXT,
  message TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

INSERT OR IGNORE INTO business_info (id, agency_name, email, phone, whatsapp, tagline, subheadline, location, pricing_plans, admin_pin) VALUES
(1, 'GrowthMachine Studio', 'studio.growthmachine@gmail.com', '', '917557575514', 'High-Converting Websites & Growth Landing Pages', 'We build ultra-fast, premium websites & lead-generation machines using modern frameworks, conversion copywriting, and clean handcrafted code. Ready in 24 to 72 hours.', 'Vishnu Garden, West Delhi 110018', '[]', '19882020');

