import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import "dotenv/config";
import { getDb } from "./db.js";

const app = express();
app.use(cors()); // Allow all CORS for dev

app.get("/sse", async (req, res) => {
    console.log("New SSE connection");

    const server = new Server(
        {
            name: "sql-server",
            version: "1.0.0",
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "say_hi",
                    description: "Responds to hi",
                    inputSchema: {
                        type: "object",
                        properties: {
                            message: {
                                type: "string",
                                description: "The message from the user",
                            },
                        },
                        required: ["message"],
                    },
                },
                {
                    name: "list_tables",
                    description: "List all tables in the database",
                    inputSchema: {
                        type: "object",
                        properties: {},
                    },
                },
                {
                    name: "describe_table",
                    description: "Get schema information for a table",
                    inputSchema: {
                        type: "object",
                        properties: {
                            table_name: { type: "string" },
                        },
                        required: ["table_name"],
                    },
                },
                {
                    name: "execute_query",
                    description: "Execute a SELECT query",
                    inputSchema: {
                        type: "object",
                        properties: {
                            query: { type: "string" },
                        },
                        required: ["query"],
                    },
                },
                {
                    name: "execute_update",
                    description: "Execute an INSERT/UPDATE/DELETE/CREATE/DROP query",
                    inputSchema: {
                        type: "object",
                        properties: {
                            query: { type: "string" },
                        },
                        required: ["query"],
                    },
                },
            ],
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name === "say_hi") {
            const message = request.params.arguments?.message;
            console.log("Received message:", message);
            if (message === "hi") {
                return {
                    content: [
                        {
                            type: "text",
                            text: "hi im there",
                        },
                    ],
                };
            } else {
                return {
                    content: [
                        {
                            type: "text",
                            text: `You said ${message}, but I only respond to 'hi'`,
                        },
                    ],
                };
            }
        }

        if (request.params.name === "list_tables") {
            console.log("Executing list_tables...");
            try {
                const db = getDb();
                const [rows] = await db.query("SHOW TABLES");
                const allRows = (rows as any[]).map(row => ({ ...row }));

                // Filter out system tables in JS (safer than dynamic SQL column names)
                const plainRows = allRows.filter(row => {
                    const values = Object.values(row);
                    const tableName = values[0] as string;
                    return !['information_schema', 'mysql', 'performance_schema', 'sys'].some(prefix => tableName.startsWith(prefix));
                });

                console.log("list_tables result:", JSON.stringify(plainRows));
                return {
                    content: [{ type: "text", text: JSON.stringify(plainRows) }],
                };
            } catch (error: any) {
                console.error("Error in list_tables:", error);
                return {
                    isError: true,
                    content: [{ type: "text", text: `Error listing tables: ${error.message}` }],
                };
            }
        }

        if (request.params.name === "describe_table") {
            console.log("[describe_table] args:", request.params.arguments);
            const tableName = request.params.arguments?.table_name;

            if (typeof tableName !== 'string' || !tableName) {
                return {
                    isError: true,
                    content: [{ type: "text", text: "Missing or invalid required argument: table_name" }],
                };
            }

            // Basic validation to prevent SQL injection or bad characters
            if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
                return {
                    isError: true,
                    content: [{ type: "text", text: "Invalid table name. Only alphanumeric characters and underscores are allowed." }],
                };
            }

            try {
                const db = getDb();
                const [rows] = await db.query(`DESCRIBE ${tableName}`);
                // convert mysql RowDataPacket → plain objects
                const rowsArray = rows as any[];
                console.log("[describe_table] rows type:", rowsArray[0]?.constructor?.name);
                console.log("[describe_table] row count:", (rows as any[])?.length);

                const plainRows = (rows as any[]).map(row => ({ ...row }));
                console.log("[describe_table] sending plain rows");

                return {
                    content: [{ type: "text", text: JSON.stringify(plainRows) }],
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Error describing table: ${error.message}` }],
                };
            }
        }

        if (request.params.name === "execute_query") {
            const query = request.params.arguments?.query as string;

            if (!query.trim().toUpperCase().startsWith("SELECT")) {
                throw new Error("Only SELECT queries are allowed via execute_query");
            }

            const db = getDb();
            // No params used
            const [rows] = await db.query(query);
            const plainRows = (rows as any[]).map(row => ({ ...row }));
            return {
                content: [{ type: "text", text: JSON.stringify(plainRows) }],
            };
        }

        if (request.params.name === "execute_update") {
            const query = request.params.arguments?.query as string;
            const upperQuery = query.trim().toUpperCase();

            // Allow INSERT, UPDATE, DELETE, CREATE, DROP
            if (!upperQuery.startsWith("INSERT") &&
                !upperQuery.startsWith("UPDATE") &&
                !upperQuery.startsWith("DELETE") &&
                !upperQuery.startsWith("CREATE") &&
                !upperQuery.startsWith("DROP")) {
                throw new Error("Only INSERT, UPDATE, DELETE, CREATE, or DROP queries are allowed via execute_update");
            }

            const db = getDb();
            const [result] = await db.query(query);
            // Result for updates might not be an array of rows, but OkPacket. 
            // However, mysql2 query returns [rows, fields]. 
            // For INSERT/UPDATE, 'rows' is an object (ResultSetHeader/OkPacket).
            // It's safer to spread it too if it's an object.
            const plainResult = JSON.parse(JSON.stringify(result)); // Simplest way to strip proto for non-array result
            return {
                content: [{ type: "text", text: JSON.stringify(plainResult) }],
            };
        }

        throw new Error("Tool not found");
    });

    const transport = new SSEServerTransport("/message", res);

    await server.connect(transport);

    const sessionId = (transport as any).sessionId;
    servers.set(sessionId, transport);

    // Clean up on close
    res.on("close", () => {
        console.log("SSE connection closed");
        servers.delete(sessionId);
        server.close();
    });
});

const servers = new Map<string, SSEServerTransport>();

app.post("/message",
    async (req, res) => {
        const sessionId = req.query.sessionId as string;
        const transport = servers.get(sessionId);

        if (!transport) {
            res.status(404).send("Session not found");
            return;
        }

        await transport.handlePostMessage(req, res);
    });

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`MCP Server running on port ${PORT}`);
});
