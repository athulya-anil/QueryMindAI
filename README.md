# QueryMind AI v2.0

A natural language interface for database queries powered by MCP (Model Context Protocol) and LLM.

## Overview

QueryMind AI lets you interact with your MySQL database using plain English. Ask questions like "Show me all tables" or "Find users created last week" and get formatted results instantly.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React Client  │────▶│   MCP Server    │────▶│  MySQL Database │
│   + Groq LLM    │ SSE │   (Express)     │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

- **Client**: React + Vite frontend with Groq LLM (Llama 3.3 70B) for natural language processing
- **Server**: Express-based MCP server exposing database tools via SSE transport
- **Database**: MySQL connection with query execution capabilities

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
```

Create `.env` file:
```env
DB_HOST=localhost
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=your_database
```

Start the server:
```bash
npm run dev
```

### 3. Setup the Client

```bash
cd mcp-client
npm install
```

Create `.env` file:
```env
VITE_GROQ_API_KEY=your_groq_api_key
```

Start the client:
```bash
npm run dev
```

### 4. Open in Browser

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

MIT

## Author

Athulya Anil
