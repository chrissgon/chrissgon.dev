// Names the pages and llms.txt show without loading the MCP SDK. tests/mcp.test.ts checks that
// they match the tools the server registers.
export const MCP_PATH = "/api/mcp";
export const MCP_TOOLS = ["get_profile", "list_products", "list_posts"] as const;
