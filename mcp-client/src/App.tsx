import { useState, useEffect } from 'react'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import './App.css'

function App() {
  const [tools, setTools] = useState<any[]>([]);
  const [selectedTool, setSelectedTool] = useState<string>("");
  const [args, setArgs] = useState<Record<string, any>>({});
  const [response, setResponse] = useState("");
  const [client, setClient] = useState<Client | null>(null)
  const [connected, setConnected] = useState(false)
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    const transport = new SSEClientTransport(new URL("http://localhost:3001/sse"));
    const newClient = new Client(
      {
        name: "example-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    setStatusMsg("Connecting...");

    newClient.connect(transport).then(async () => {
      console.log("Connected to MCP Server");
      setStatusMsg("Connected. Fetching tools...");
      setClient(newClient);
      setConnected(true);

      // List tools using the helper method
      try {
        const result = await newClient.listTools();
        console.log("Tools received:", result);
        setTools(result.tools);
        if (result.tools.length > 0) {
          setSelectedTool(result.tools[0].name);
          setStatusMsg("Ready");
        } else {
          setStatusMsg("Connected (No tools found)");
        }
      } catch (e: any) {
        console.error("Failed to list tools", e);
        setStatusMsg(`Error fetching tools: ${e.message}`);
      }

    }).catch(err => {
      console.error("Connection failed", err);
      setStatusMsg(`Connection failed: ${err.message}`);
    });

    return () => {
    }
  }, [])

  const handleArgChange = (key: string, value: string) => {
    setArgs(prev => ({ ...prev, [key]: value }));
  };

  const handleSend = async () => {
    if (!client || !selectedTool) return;

    // Check required args
    const toolDef = tools.find(t => t.name === selectedTool);
    if (toolDef && toolDef.inputSchema?.required) {
      for (const reqField of toolDef.inputSchema.required) {
        if (!args[reqField] || args[reqField].trim() === "") {
          setResponse(`Error: Missing required argument '${reqField}'`);
          return;
        }
      }
    }

    setResponse("Sending...");

    try {
      const toolDef = tools.find(t => t.name === selectedTool);
      const formattedArgs: any = { ...args };

      if (toolDef && toolDef.inputSchema?.properties) {
        for (const key in toolDef.inputSchema.properties) {
          const prop = toolDef.inputSchema.properties[key];
          if (prop.type === 'array' && typeof formattedArgs[key] === 'string') {
            try {
              formattedArgs[key] = JSON.parse(formattedArgs[key]);
            } catch {
              formattedArgs[key] = formattedArgs[key].split(',').map((s: string) => s.trim());
            }
          }
        }
      }

      const result = await client.callTool({
        name: selectedTool,
        arguments: formattedArgs
      });

      const content = (result as any).content;

      if (Array.isArray(content) && content.length > 0 && content[0].type === 'text') {
        const text = content[0].text;
        try {
          const json = JSON.parse(text);
          const resultString = JSON.stringify(json, null, 2);
          if (resultString.length > 50000) {
            setResponse(resultString.substring(0, 50000) + "\n\n...(response truncated due to size)...");
          } else {
            setResponse(resultString);
          }
        } catch {
          if (text.length > 50000) {
            setResponse(text.substring(0, 50000) + "\n\n...(response truncated due to size)...");
          } else {
            setResponse(text);
          }
        }
      } else {
        const resultString = JSON.stringify(result, null, 2);
        if (resultString.length > 50000) {
          setResponse(resultString.substring(0, 50000) + "\n\n...(response truncated due to size, check server logs for full output)...");
        } else {
          setResponse(resultString);
        }
      }
    } catch (e: any) {
      setResponse("Error: " + e.message);
    }
  }

  const currentTool = tools.find(t => t.name === selectedTool);

  return (
    <div className="app-container">
      <h1>MCP Client</h1>
      <div className="status">
        Status: {connected ? <span style={{ color: '#42d392' }}>Connected</span> : <span style={{ color: '#ff6666' }}>Disconnected</span>}
        <br />
        <small>{statusMsg}</small>
      </div>

      {connected && (
        <div className="tool-selection">
          <label>Select Tool:</label>
          <select value={selectedTool} onChange={e => {
            setSelectedTool(e.target.value);
            setArgs({});
            setResponse("");
          }}>
            {tools.length === 0 && <option>No tools available</option>}
            {tools.map(t => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
          <p className="tool-desc">{currentTool?.description}</p>
        </div>
      )}

      {currentTool && (
        <div className="chat-interface">
          {currentTool.inputSchema?.properties && Object.keys(currentTool.inputSchema.properties).map(key => {
            const prop = currentTool.inputSchema.properties[key];
            const isLong = key === 'query' || prop.type === 'array';
            return (
              <div key={key} className="arg-input">
                <label>{key} {prop.description && `(${prop.description})`}:</label>
                {isLong ? (
                  <textarea
                    value={args[key] || ''}
                    onChange={e => handleArgChange(key, e.target.value)}
                    placeholder={prop.type === 'array' ? '["param1", "param2"]' : 'Enter value...'}
                  />
                ) : (
                  <input
                    type="text"
                    value={args[key] || ''}
                    onChange={e => handleArgChange(key, e.target.value)}
                  />
                )}
              </div>
            );
          })}

          <button onClick={handleSend} disabled={!connected}>Execute Tool</button>
        </div>
      )}

      <div className="response-area">
        <p>Response:</p>
        <pre className="response-box">{response}</pre>
      </div>
    </div>
  )
}

export default App
