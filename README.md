# QueryMind AI v2.0

A natural language interface for database queries powered by MCP (Model Context Protocol) and LLM.

## Overview

QueryMind AI lets you interact with your SQL database using plain English. Ask questions like "Show me all tables" or "Find users created last week" and get formatted results instantly.

## Architecture

```
┌────────┐         ┌──────────────┐         ┌─────────────┐
│  User  │────────▶│ React Client │────────▶│  Groq LLM   │
└────────┘  Query  └──────┬───────┘  Query  └──────┬──────┘
                          │                        │
                          │   Tool Calls           │
                          │◀───────────────────────┘
                          │
                          │ Execute Tools
                          ▼
                   ┌─────────────┐
                   │  MCP Server │
                   └──────┬──────┘
                          │
                          │ SQL Query
                          ▼
                   ┌─────────────┐
                   │  Database   │
                   └──────┬──────┘
                          │
                          │ Results
                          ▼
┌────────┐         ┌──────────────┐         ┌─────────────┐
│  User  │◀────────│ React Client │────────▶│  Groq LLM   │
└────────┘Response └──────────────┘ Format  └─────────────┘
```

- **Client**: React + Vite frontend that orchestrates the entire flow
- **LLM**: Groq API (Llama 3.3 70B) for natural language understanding and response formatting
- **Server**: MCP server exposing database tools via SSE transport
- **Database**: SQL database (MySQL, PostgreSQL, etc.)

## Features

- Natural language to SQL conversion
- Real-time SSE connection for responsive interactions
- Database schema exploration (list tables, describe structure)
- Execute SELECT queries safely
- Execute INSERT/UPDATE/DELETE/CREATE/DROP operations
- Markdown-formatted results with tables

## Quick Start

### Prerequisites

- Node.js 18+
- MySQL database
- Groq API key

### 1. Clone the repository

```bash
git clone https://github.com/athulya-anil/QueryMindAI.git
cd QueryMindAI
```

### 2. Setup the Server

```bash
cd mcp-server
npm install
npm run build
npm start
```

### 3. Connect Your Database

Create a `.env` file in `mcp-server/`:
```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=your_username
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=your_database
MYSQL_CONN_LIMIT=10
```

Replace the values with your database credentials.

### 4. Setup the Client

```bash
cd mcp-client
npm install
npm run dev
```

Create a `.env` file in `mcp-client/`:
```env
VITE_GROQ_API_KEY=your_groq_api_key
```

### 5. Open in Browser

Navigate to `http://localhost:5173` and start querying!

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_tables` | List all tables in the database |
| `describe_table` | Get schema information for a table |
| `execute_query` | Execute SELECT queries |
| `execute_update` | Execute INSERT/UPDATE/DELETE/CREATE/DROP queries |

## Tech Stack

- **Frontend**: React 19, Vite, TypeScript, react-markdown
- **Backend**: Express 5, TypeScript, mysql2
- **Protocol**: Model Context Protocol (MCP) with SSE transport
- **LLM**: Groq API (Llama 3.3 70B Versatile)

## License

MIT © 2025 Athulya Anil
