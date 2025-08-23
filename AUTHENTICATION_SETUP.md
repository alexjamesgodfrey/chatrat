# VSCode Extension Authentication & Proxy Setup

This guide explains how to set up GitHub authentication and request proxying for your VSCode extension.

## Overview

The implementation includes:
- **GitHub OAuth authentication** in the VSCode extension
- **Express server** that handles authentication and proxies requests to AgentDB
- **Secure token management** with no hardcoded credentials in the extension
- **User-specific database isolation** based on GitHub username

## Architecture

```
VSCode Extension → Express Server → AgentDB API
     ↓                    ↓
GitHub OAuth         Session Management
Token Storage        Request Proxying
```

## Setup Instructions

### 1. GitHub OAuth App Setup

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: `VSCode Extension Auth`
   - **Homepage URL**: `http://localhost:3000` (or your server URL)
   - **Authorization callback URL**: `http://localhost:3000/auth/github/callback`
4. Save the **Client ID** and **Client Secret**

### 2. Server Configuration

1. Navigate to the server directory:
   ```bash
   cd apps/server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` with your credentials:
   ```env
   # GitHub OAuth Configuration
   GITHUB_CLIENT_ID=your_github_client_id_here
   GITHUB_CLIENT_SECRET=your_github_client_secret_here

   # AgentDB Configuration
   AGENTDB_TOKEN=your_agentdb_token_here
   AGENTDB_API_KEY=your_agentdb_api_key_here
   AGENTDB_BASE_URL=https://api.agentdb.dev

   # Server Configuration
   SESSION_SECRET=your_random_session_secret_here
   PORT=3000
   NODE_ENV=development
   ```

5. Start the server:
   ```bash
   npm run dev
   ```

   The server will run on `http://localhost:3000`

### 3. Extension Configuration

1. Navigate to the extension directory:
   ```bash
   cd apps/extension
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Open VSCode and press `F5` to launch the extension in debug mode

### 4. Extension Settings (Optional)

You can configure the server URL in VSCode settings:

1. Open VSCode Settings (`Cmd/Ctrl + ,`)
2. Search for "Repository Context Capture"
3. Set **Server Base URL** to your server URL (default: `http://localhost:3000`)

## Usage Flow

### First Time Setup

1. Open VSCode with the extension installed
2. Try to use any extension command (e.g., "Capture Repository and Send to AgentDB")
3. You'll be prompted to authenticate with GitHub
4. Click "Authenticate" → browser opens with GitHub OAuth
5. Authorize the application
6. Return to VSCode - you're now authenticated!

### Authentication Commands

- **Authenticate with GitHub**: `Cmd/Ctrl + Shift + P` → "Authenticate with GitHub"
- **Logout**: `Cmd/Ctrl + Shift + P` → "Logout from GitHub"

### Extension Features

All original extension features now work through the authenticated proxy:

- **Capture Repository**: Stores files in your user-specific database
- **Query Repository**: Natural language queries against your data
- **List Repositories**: View all your stored repositories
- **Clear Database**: Clear your user-specific data
- **Get MCP URL**: Generate MCP connection URL for your database

## Security Features

### User Isolation
- Each GitHub user gets their own database: `repo-context-{username}`
- Users can only access their own data
- Server validates all requests against the authenticated user

### Token Management
- GitHub tokens stored securely in VSCode's encrypted storage
- No hardcoded credentials in extension code
- Server-side session management with secure cookies

### Request Validation
- All AgentDB requests go through authenticated proxy
- Server adds proper credentials before forwarding to AgentDB
- Failed authentication automatically prompts re-login

## Troubleshooting

### Server Not Available
If you see "Authentication server is not available":
1. Ensure the server is running on the correct port
2. Check the server URL in extension settings
3. Verify firewall/network settings

### Authentication Failed
If GitHub authentication fails:
1. Verify GitHub OAuth app configuration
2. Check client ID/secret in server `.env`
3. Ensure callback URL matches exactly

### Database Errors
If you get database-related errors:
1. Verify AgentDB credentials in server `.env`
2. Check server logs for detailed error messages
3. Ensure your AgentDB account has proper permissions

## Development

### Server Development
```bash
cd apps/server
npm run dev  # Starts with nodemon for auto-reload
```

### Extension Development
```bash
cd apps/extension
npm run watch  # Watches for TypeScript changes
```

Then press `F5` in VSCode to launch the extension debugger.

## API Endpoints

The server exposes these endpoints:

### AgentDB Proxy
- `GET /api/agentdb/databases` - List databases
- `POST /api/agentdb/connect` - Connect to database
- `POST /api/agentdb/execute` - Execute SQL
- `POST /api/agentdb/nl-to-sql` - Natural language to SQL
- `POST /api/agentdb/copy-database` - Copy database (for templates)
- `POST /api/agentdb/create-mcp-slug` - Create MCP slug

### Utility
- `GET /healthz` - Health check
- `GET /` - Server status page
