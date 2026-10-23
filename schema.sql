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

INSERT OR IGNORE INTO business_info (id, agency_name, email, phone, whatsapp, tagline, subheadline, location, pricing_plans) VALUES
(1, 'GrowthMachine Studio', 'studio.growthmachine@gmail.com', '+91 75575 75514', '917557575514', 'High-Converting Websites & Growth Landing Pages', 'We build ultra-fast, premium websites & lead-generation machines using modern frameworks, conversion copywriting, and clean handcrafted code. Ready in 24 to 72 hours.', '5b/23, Vishnu Garden, West Delhi 110018', '[]');
