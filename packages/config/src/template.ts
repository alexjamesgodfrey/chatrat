import { AgentDBTemplate } from "@chatrat/types";

export const templates: AgentDBTemplate = {
  name: "chatrat-template",
  description: `Schema Overview (SQLite)

    The database stores captured repositories, their files, and metadata.

    Table: repositories

    id (TEXT, primary key) — deterministic unique identifier for each repository.

    name (TEXT) — repository name.

    workspace_path (TEXT) — local workspace path.

    last_updated (DATETIME) — last time repository was updated.

    total_files (INTEGER) — total number of files in the repository.

    total_size (INTEGER) — total size of all files (bytes).

    Unique Constraint: (name, workspace_path)

    Table: repository_files

    id (INTEGER, primary key autoincrement).

    repository_id (TEXT, foreign key → repositories.id).

    file_path (TEXT) — relative file path within repository.

    content (TEXT) — file content (skipped for binaries/large files).

    size (INTEGER) — file size in bytes.

    created_at (DATETIME) — when file entry was captured.

    Unique Constraint: (repository_id, file_path)

    Table: repository_files_fts (full-text search index on repository_files)

    file_path

    content

    Mirrors repository_files and auto-syncs via triggers.

    Used for efficient text search inside file content.

    Views

    repository_summary — per-repository summary:

    repository_name, total_files, total_size, last_updated, file_types (count of unique extensions), avg_file_size.

    file_extensions — per-repository breakdown by file extension:

    repository_name, extension, file_count, total_size.

    Relationships

    repositories.id ↔ repository_files.repository_id.

    Each repository has many files.

    Full-text search is supported on repository_files.content via repository_files_fts.`,
  migrations: [
    `-- Enable foreign keys for this session
        PRAGMA foreign_keys = ON;

        -- Migration 1: Create repositories table (TEXT PK + natural key)
        CREATE TABLE IF NOT EXISTS repositories (
            id TEXT PRIMARY KEY,                               -- deterministic repo id
            name TEXT NOT NULL,
            workspace_path TEXT,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
            total_files INTEGER,
            total_size INTEGER,
            UNIQUE(name, workspace_path)                       -- ensure stable natural key
        );

        -- Migration 2: Create repository_files table (FK -> TEXT)
        CREATE TABLE IF NOT EXISTS repository_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repository_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            content TEXT,
            size INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(repository_id, file_path),
            FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
        );

        -- Migration 3: Create performance indexes
        CREATE INDEX IF NOT EXISTS idx_repositories_natural_key
        ON repositories(name, workspace_path);

        CREATE INDEX IF NOT EXISTS idx_repository_files_repo_id 
        ON repository_files(repository_id);

        CREATE INDEX IF NOT EXISTS idx_repository_files_path 
        ON repository_files(file_path);

        -- Migration 4: Create full-text search virtual table
        CREATE VIRTUAL TABLE IF NOT EXISTS repository_files_fts USING fts5(
            file_path,
            content,
            content=repository_files,
            content_rowid=id
        );

        -- Migration 5: Create triggers to keep FTS index in sync
        CREATE TRIGGER IF NOT EXISTS repository_files_ai 
        AFTER INSERT ON repository_files 
        BEGIN
            INSERT INTO repository_files_fts(rowid, file_path, content)
            VALUES (new.id, new.file_path, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS repository_files_ad 
        AFTER DELETE ON repository_files 
        BEGIN
            DELETE FROM repository_files_fts WHERE rowid = old.id;
        END;

        CREATE TRIGGER IF NOT EXISTS repository_files_au 
        AFTER UPDATE ON repository_files 
        BEGIN
            UPDATE repository_files_fts 
            SET file_path = new.file_path, content = new.content
            WHERE rowid = new.id;
        END;

        -- Migration 6: Create useful views
        CREATE VIEW IF NOT EXISTS repository_summary AS
        SELECT 
            r.name as repository_name,
            r.total_files,
            r.total_size,
            r.last_updated,
            COUNT(DISTINCT SUBSTR(rf.file_path, INSTR(rf.file_path, '.') + 1)) as file_types,
            AVG(rf.size) as avg_file_size
        FROM repositories r
        LEFT JOIN repository_files rf ON r.id = rf.repository_id
        GROUP BY r.id;

        CREATE VIEW IF NOT EXISTS file_extensions AS
        SELECT 
            r.name as repository_name,
            SUBSTR(rf.file_path, INSTR(rf.file_path, '.') + 1) as extension,
            COUNT(*) as file_count,
            SUM(rf.size) as total_size
        FROM repository_files rf
        JOIN repositories r ON r.id = rf.repository_id
        WHERE INSTR(rf.file_path, '.') > 0
        GROUP BY r.name, extension
        ORDER BY file_count DESC;`,
  ],
} as const;
