import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import Groq from "groq-sdk";
import './App.css'

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: any[];
  tool_call_id?: string;
  name?: string;
}

interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  name: string;
  content: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [client, setClient] = useState<Client | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [tools, setTools] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const groq = new Groq({
    apiKey: import.meta.env.VITE_GROQ_API_KEY,
    dangerouslyAllowBrowser: true
  });

  useEffect(() => {
    const connectToMCP = async () => {
      setConnectionStatus("connecting");
      try {
        const transport = new SSEClientTransport(new URL("http://localhost:3001/sse"));
        const newClient = new Client(
          { name: "sql-client", version: "1.0.0" },
          { capabilities: {} }
        );

        await newClient.connect(transport);
        setClient(newClient);
        setConnectionStatus("connected");

        // Fetch available tools
        const result = await newClient.listTools();
        setTools(result.tools);
        console.log("Available tools:", result.tools);

      } catch (err) {
        console.error("Connection failed", err);
        setConnectionStatus("disconnected");
      }
    };

    connectToMCP();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || !client) return;

    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const formattedTools = tools.map(tool => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));

    try {
      // 1. Send user message to Groq with tools
      const chatCompletion = await getGroqCompletion([...messages, userMsg], formattedTools);

      const assistantMsg = chatCompletion.choices[0].message;
      const toolCalls = assistantMsg.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        // Handle tool calls
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: assistantMsg.content || "",
          toolCalls: toolCalls
        }]);

        const toolResults: ToolResult[] = [];

        for (const toolCall of toolCalls) {
          console.log("Executing tool:", toolCall.function.name, toolCall.function.arguments);
          try {
            // Robust Parsing fix
            let args = {};
            try {
              args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
            } catch {
              console.warn("Failed to parse tool args, using empty object");
            }
            if (!args) args = {};

            const result = await client.callTool({
              name: toolCall.function.name,
              arguments: args
            });

            // Unwrap content fix
            let contentStr = "";
            if (Array.isArray(result.content) && result.content.length > 0 && result.content[0].type === 'text') {
              contentStr = result.content[0].text;
            } else {
              contentStr = JSON.stringify(result.content);
            }

            toolResults.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: toolCall.function.name,
              content: contentStr
            });
          } catch (error: any) {
            toolResults.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: toolCall.function.name,
              content: JSON.stringify({ isError: true, error: error.message })
            });
          }
        }

        // 2. Send tool results back to Groq for final response
        const systemMessage = {
          role: "system",
          content: "You are a helpful SQL assistant. Always format database query results as Markdown tables. If the result is a list of items, use bullet points. Keep responses concise."
        };

        const rawHistory = [...messages, userMsg];
        const apiHistory = [systemMessage, ...rawHistory.map(m => {
          const apiMsg: any = { role: m.role, content: m.content };
          if (m.toolCalls) apiMsg.tool_calls = m.toolCalls;
          if (m.role === 'tool') {
            apiMsg.tool_call_id = m.tool_call_id;
            apiMsg.name = m.name;
          }
          return apiMsg;
        })];

        apiHistory.push({
          role: 'assistant',
          content: assistantMsg.content || "",
          tool_calls: toolCalls
        } as any);

        toolResults.forEach(tr => {
          apiHistory.push({
            role: 'tool',
            tool_call_id: tr.tool_call_id,
            name: tr.name,
            content: tr.content
          });
        });

        const secondResponse = await groq.chat.completions.create({
          messages: apiHistory,
          model: "llama-3.3-70b-versatile",
          tools: formattedTools,
          tool_choice: "none" // Force model to reply with text, preventing recursive tool loops
        });

        const finalContent = secondResponse.choices[0].message.content;

        // Append all tool results and final response to internal state
        const toolResultMsgs: Message[] = toolResults.map(tr => ({
          role: 'tool',
          content: tr.content,
          tool_call_id: tr.tool_call_id,
          name: tr.name
        }));

        setMessages(prev => [...prev, ...toolResultMsgs, { role: 'assistant', content: finalContent || "No response generated." }]);

      } else {
        // No tool calls, just normal response
        setMessages(prev => [...prev, { role: 'assistant', content: assistantMsg.content || "" }]);
      }

    } catch (error: any) {
      console.error("Error fetching from Groq:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const getGroqCompletion = async (msgs: Message[], formattedTools: any[]) => {
    const systemMessage = {
      role: "system",
      content: "You are a helpful SQL assistant. Use the provided tools to answer questions. Do not output raw XML or 'function=' text. Always use the structured tool calling format."
    };

    // Convert internal message format to Groq API format (Critical fix: snake_case)
    const apiMessages = [systemMessage, ...msgs.map(m => {
      const apiMsg: any = {
        role: m.role,
        content: m.content
      };
      if (m.toolCalls) {
        apiMsg.tool_calls = m.toolCalls;
      }
      if (m.role === 'tool') {
        apiMsg.tool_call_id = m.tool_call_id;
        apiMsg.name = m.name;
      }
      return apiMsg;
    })];

    return await groq.chat.completions.create({
      messages: apiMessages as any,
      model: "llama-3.3-70b-versatile", // Reverted to 3.3
      tools: formattedTools.length > 0 ? formattedTools : undefined,
      tool_choice: "auto"
    });
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>SQL Agent</h1>
        <div className={`status-badge ${connectionStatus}`}>
          <span className="dot"></span>
          {connectionStatus === 'connected' ? 'Connected to DB' : connectionStatus}
        </div>
      </header>

      <div className="chat-area">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="icon">✨</div>
            <h2>How can I help with your database?</h2>
            <p>Try asking "Show me all tables" or "Find users created last week"</p>
          </div>
        )}

        {messages.filter(m => m.role !== 'tool').map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-content">
              {msg.role === 'assistant' && msg.toolCalls && (
                <div className="tool-usage">
                  {msg.toolCalls.map(tc => (
                    <div key={tc.id} className="tool-call">
                      Thinking: Executing <code>{tc.function.name}</code>...
                    </div>
                  ))}
                </div>
              )}
              <div className="text-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-area">
        <div className="input-wrapper">
          <input
            type="text"
            placeholder="Ask a question about your data..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
            disabled={isLoading || connectionStatus !== 'connected'}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || connectionStatus !== 'connected'}
            className={isLoading ? 'sending' : ''}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
