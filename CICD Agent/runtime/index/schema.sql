-- Schema for the Local Agent Runtime database.
-- One SQLite file per repo lives at `<data_dir>/repos/<repo_id>/index.db`.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS files (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    path          TEXT NOT NULL UNIQUE,
    language      TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    mtime_ns      INTEGER NOT NULL,
    content_hash  TEXT NOT NULL,
    is_test       INTEGER NOT NULL DEFAULT 0,
    indexed_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
CREATE INDEX IF NOT EXISTS idx_files_hash ON files(content_hash);

CREATE TABLE IF NOT EXISTS symbols (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id       INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL,       -- class, function, method, interface, struct
    name          TEXT NOT NULL,
    qualified     TEXT NOT NULL,
    start_line    INTEGER NOT NULL,
    end_line      INTEGER NOT NULL,
    signature     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_symbols_file  ON symbols(file_id);
CREATE INDEX IF NOT EXISTS idx_symbols_name  ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_qual  ON symbols(qualified);

CREATE TABLE IF NOT EXISTS imports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id       INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    module        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_imports_file ON imports(file_id);
CREATE INDEX IF NOT EXISTS idx_imports_mod  ON imports(module);

CREATE TABLE IF NOT EXISTS chunks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id       INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    symbol_id     INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
    start_line    INTEGER NOT NULL,
    end_line      INTEGER NOT NULL,
    text          TEXT NOT NULL,
    token_count   INTEGER NOT NULL DEFAULT 0,
    embedded      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);

-- Repo-scoped memory tables (no secrets stored).
CREATE TABLE IF NOT EXISTS repo_profile (
    key           TEXT PRIMARY KEY,
    value         TEXT NOT NULL,
    updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pr_history (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id       TEXT NOT NULL,
    pr_id         INTEGER,
    pr_url        TEXT NOT NULL DEFAULT '',
    title         TEXT NOT NULL DEFAULT '',
    summary       TEXT NOT NULL DEFAULT '',
    risk_level    TEXT NOT NULL DEFAULT 'low',
    created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pr_history_task ON pr_history(task_id);

CREATE TABLE IF NOT EXISTS reviewer_map (
    path_glob     TEXT PRIMARY KEY,
    reviewers     TEXT NOT NULL              -- comma-separated identities
);

CREATE TABLE IF NOT EXISTS conventions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    scope         TEXT NOT NULL,             -- repo, module, file_glob
    rule          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS known_flaky_tests (
    test_id       TEXT PRIMARY KEY,
    last_seen     INTEGER NOT NULL,
    notes         TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ignored_paths (
    path_glob     TEXT PRIMARY KEY
);

-- Task queue tables (persist across restarts).
CREATE TABLE IF NOT EXISTS tasks (
    id            TEXT PRIMARY KEY,
    kind          TEXT NOT NULL,             -- submit-pipeline
    status        TEXT NOT NULL,             -- queued, running, succeeded, failed, cancelled
    payload_json  TEXT NOT NULL,
    result_json   TEXT NOT NULL DEFAULT '',
    error         TEXT NOT NULL DEFAULT '',
    created_at    INTEGER NOT NULL,
    started_at    INTEGER,
    finished_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tasks_status  ON tasks(status);

CREATE TABLE IF NOT EXISTS task_steps (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    seq           INTEGER NOT NULL,
    name          TEXT NOT NULL,
    detail        TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL,             -- info, ok, warn, error
    created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_steps_task ON task_steps(task_id, seq);
