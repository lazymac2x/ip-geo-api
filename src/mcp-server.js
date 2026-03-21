#!/usr/bin/env node

/**
 * ip-geo-api MCP Server (stdio transport)
 * Exposes IP geolocation tools over MCP protocol.
 */

const { lookupSingle, lookupBatch, validateIp } = require('./geo');

const TOOLS = [
  {
    name: 'ip_lookup',
    description: 'Look up geographic location, ISP, timezone for an IP address',
    inputSchema: {
      type: 'object',
      properties: {
        ip: { type: 'string', description: 'IPv4 or IPv6 address to look up' },
      },
      required: ['ip'],
    },
  },
  {
    name: 'ip_batch_lookup',
    description: 'Look up geolocation for multiple IP addresses (max 100)',
    inputSchema: {
      type: 'object',
      properties: {
        ips: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of IP addresses',
          maxItems: 100,
        },
      },
      required: ['ips'],
    },
  },
  {
    name: 'ip_validate',
    description: 'Validate whether a string is a valid IPv4 or IPv6 address',
    inputSchema: {
      type: 'object',
      properties: {
        ip: { type: 'string', description: 'String to validate as IP address' },
      },
      required: ['ip'],
    },
  },
];

// --- JSON-RPC helpers ---

function jsonRpcResponse(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function jsonRpcError(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

// --- Request handler ---

async function handleRequest(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      return jsonRpcResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'ip-geo-api', version: '1.0.0' },
      });

    case 'notifications/initialized':
      return null; // no response needed

    case 'tools/list':
      return jsonRpcResponse(id, { tools: TOOLS });

    case 'tools/call': {
      const { name, arguments: args } = params;
      try {
        let result;
        if (name === 'ip_lookup') {
          result = await lookupSingle(args.ip);
        } else if (name === 'ip_batch_lookup') {
          result = await lookupBatch(args.ips);
        } else if (name === 'ip_validate') {
          result = validateIp(args.ip);
        } else {
          return jsonRpcError(id, -32601, `Unknown tool: ${name}`);
        }
        return jsonRpcResponse(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
      } catch (err) {
        return jsonRpcResponse(id, {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        });
      }
    }

    default:
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}

// --- stdio transport ---

let buffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop(); // keep incomplete line

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const msg = JSON.parse(trimmed);
      const response = await handleRequest(msg);
      if (response) {
        process.stdout.write(response + '\n');
      }
    } catch {
      process.stdout.write(jsonRpcError(null, -32700, 'Parse error') + '\n');
    }
  }
});

process.stderr.write('ip-geo-api MCP server running on stdio\n');
