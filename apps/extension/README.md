# Repository Context Capture for AgentDB

Capture repository files and store them in AgentDB for MCP (Model Context Protocol) server integration.

## Features

- **AgentDB Integration**: Direct integration with AgentDB for storing repository context
- **Automatic Repository Scanning**: Detects when you open a repository and can automatically capture its contents
- **Smart File Filtering**: 
  - Respects .gitignore patterns
  - Configurable exclude patterns
  - Skips binary files automatically
  - File size limits to prevent large files
- **Natural Language Queries**: Query your stored repository data using natural language
- **Progress Tracking**: Visual progress indicator during capture
- **Database Management**: List, query, and manage stored repositories

## Setup

1. **Get AgentDB Credentials**:
   - Sign up at [AgentDB](https://agentdb.dev)
   - Get your UUID token and API key

2. **Configure the Extension**:
   - **Option 1**: Hardcode credentials in `src/extension.ts`:
     ```typescript
     const AGENTDB_TOKEN = 'your-uuid-token-here';
     const AGENTDB_API_KEY = 'your-api-key-here';
     ```
   
   - **Option 2**: Configure in VSCode settings:
     - Open settings (Cmd/Ctrl + ,)
     - Search for "Repository Context Capture"
     - Enter your AgentDB token and API key

3. **Install Dependencies**:
   ```bash
   npm install
   npm install @agentdb/sdk ignore
   ```

4. **Compile and Run**:
   ```bash
   npm run compile
   # Press F5 in VSCode to test
   ```

## Usage

### Capture Repository
1. Open a repository/folder in VSCode
2. Use Command Palette (Cmd/Ctrl + Shift + P)
3. Run "Capture Repository and Send to AgentDB"

### Query Repository Data
1. Use Command Palette
2. Run "Query Repository Context from AgentDB"
3. Enter a natural language query like:
   - "Show me all TypeScript files"
   - "Find files containing TODO comments"
   - "List all test files"

### List Stored Repositories
1. Use Command Palette
2. Run "List Stored Repositories in AgentDB"

### Clear Database
1. Use Command Palette
2. Run "Clear Repository Database in AgentDB"

## Database Schema

The extension creates two tables in AgentDB:

```sql
-- Repositories table
CREATE TABLE repositories (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE,
    workspace_path TEXT,
    last_updated DATETIME,
    total_files INTEGER,
    total_size INTEGER
)

-- Repository files table
CREATE TABLE repository_files (
    id INTEGER PRIMARY KEY,
    repository_id INTEGER,
    file_path TEXT,
    content TEXT,
    size INTEGER,
    created_at DATETIME,
    FOREIGN KEY (repository_id) REFERENCES repositories(id)
)
```

## Building for Production

```bash
npm install -g vsce
npm install
vsce package
```

This creates a `.vsix` file that can be installed in VSCode.

## MCP Server Integration

Once your repository data is in AgentDB, you can access it through their MCP server:

1. **MCP Server URL**: Use AgentDB's MCP endpoints to expose your repository data
2. **Query via Chat**: Your chat client can now access repository context automatically

Example MCP configuration:
```json
{
  "mcpServers": {
    "repository-context": {
      "url": "https://api.agentdb.dev/mcp",
      "params": {
        "key": "your-api-key",
        "token": "your-uuid-token",
        "dbName": "repository-context"
      }
    }
  }
}
```

## Configuration Options

- **agentDbToken**: Your AgentDB UUID token
- **agentDbApiKey**: Your AgentDB API key
- **databaseName**: Name of the database in AgentDB (default: "repository-context")
- **excludePatterns**: File patterns to ignore
- **maxFileSize**: Maximum file size in bytes (default: 1MB)
- **autoCapture**: Automatically capture when opening a repository

## License

MIT