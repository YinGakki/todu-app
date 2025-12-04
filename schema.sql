    DROP TABLE IF EXISTS tasks;
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      is_done BOOLEAN DEFAULT 0,
      group_id TEXT,
      subtasks TEXT, -- 存 JSON 字符串
      due_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS configs (
      key TEXT PRIMARY KEY,
      value TEXT
    );