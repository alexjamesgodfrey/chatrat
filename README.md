# Chatrat

**Smart Codebase Context for Claude & MCP**

Chatrat is a VSCode extension that automatically indexes your codebase and makes it available to AI language models through the Model Context Protocol (MCP). Simply mention a filename in your LLM chat and get instant, accurate context without copy-pasting code.

## 🚀 Key Features

### VSCode Extension
- **Automatic Repository Scanning** - Detects when you open a repository and captures its contents
- **Smart File Filtering** - Respects .gitignore patterns, skips binary files, configurable exclude patterns
- **AgentDB Integration** - Stores repository context in AgentDB for persistent access
- **Natural Language Queries** - Query your stored repository data using plain English
- **Progress Tracking** - Visual progress indicators during capture operations
- **GitHub OAuth Authentication** - Secure authentication flow with GitHub integration

### MCP Server Integration
- **Seamless LLM Access** - Works with Claude, ChatGPT, and any MCP-compatible AI
- **Real-time Context** - Access up-to-date codebase information in your chats
- **File-based Queries** - Reference specific files or search across your entire codebase
- **Template System** - Pre-configured database schemas for optimal code storage

### Web Interface
- **Landing Page** - Information about the service and installation instructions
- **Terms & Privacy** - Complete legal documentation for the service

## 🏗️ Architecture

This is a monorepo with three main applications:

- **`apps/extension`** - VSCode extension for capturing and indexing code
- **`apps/server`** - Express.js server providing GitHub OAuth and AgentDB proxy services
- **`apps/web`** - Astro-based marketing website and documentation

## 🛠️ Quick Start

### Prerequisites
- Node.js 18+ and pnpm
- VSCode
- AgentDB account ([sign up here](https://agentdb.dev))
- GitHub OAuth app (for authentication)

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd chatrat
   pnpm install
   ```

2. **Set up environment variables:**
   ```bash
   # Copy example environment files
   cp apps/server/.env.example apps/server/.env
   ```

   Configure the following in `apps/server/.env`:
   - `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
   - `AGENTDB_TOKEN` and `AGENTDB_API_KEY`
   - `SESSION_SECRET`

3. **Start the development server:**
   ```bash
   pnpm dev
   ```

4. **Install the VSCode extension:**
   ```bash
   cd apps/extension
   npm run compile
   # Press F5 in VSCode to launch extension debugger
   ```

## 📖 Usage

### Capturing Your Codebase

1. Open a repository in VSCode
2. Use Command Palette (`Cmd/Ctrl + Shift + P`)
3. Run "Capture Repository and Send to AgentDB"
4. The extension will:
   - Scan all files (respecting .gitignore)
   - Filter out binary files and large files
   - Store structured data in AgentDB
   - Create an MCP endpoint for your repository

### Querying Your Code

**In VSCode:**
1. Use Command Palette
2. Run "Query Repository Context from AgentDB"
3. Enter natural language queries like:
   - "Show me all TypeScript files"
   - "Find files containing TODO comments"
   - "List all test files"

**In Your LLM Chat:**
Once configured with MCP, simply reference files by name or ask questions about your codebase directly in Claude, ChatGPT, or other MCP-compatible AI tools.

## 🔧 Configuration

### VSCode Extension Settings

- **Auto Capture** - Automatically capture repository on workspace open
- **Server Base URL** - URL of your authentication server
- **File Size Limits** - Maximum file size to capture
- **Exclude Patterns** - Additional patterns to ignore beyond .gitignore

### MCP Configuration

Add to your MCP client configuration:
```json
{
  "mcpServers": {
    "repository-context": {
      "url": "https://api.agentdb.dev/mcp",
      "params": {
        "key": "your-api-key",
        "token": "your-uuid-token",
        "dbName": "your-repository-name"
      }
    }
  }
}
```

## 🚀 Development

### Available Scripts

```bash
pnpm dev        # Start all development servers
pnpm build      # Build all applications
pnpm lint       # Lint all code
pnpm typecheck  # Type check all TypeScript
pnpm test       # Run all tests
```

### Extension Development

```bash
cd apps/extension
npm run watch   # Watch for TypeScript changes
# Press F5 in VSCode to launch debugger
```

### Server Development

```bash
cd apps/server
npm run dev     # Start server with hot reload
```

## 📚 API Reference

### AgentDB Proxy Endpoints
- `GET /api/agentdb/databases` - List user databases
- `POST /api/agentdb/connect` - Connect to database
- `POST /api/agentdb/execute` - Execute SQL queries
- `POST /api/agentdb/nl-to-sql` - Convert natural language to SQL
- `POST /api/agentdb/create-mcp-slug` - Create MCP endpoint

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

See LICENSE file for details.

## 🆘 Support

For issues and questions:
- Check the [documentation](apps/extension/README.md)
- Open an issue on GitHub
- Review the [authentication setup guide](AUTHENTICATION_SETUP.md)
