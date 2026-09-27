export type McpProfile = "default" | "music";

export const MCP_PATHS = new Map<string, McpProfile>([
  ["/mcp", "default"],
  ["/mcp/music", "music"],
]);

export function acceptsProfileSource(profile: McpProfile, source: string): boolean {
  if (profile === "music") return source.startsWith("netease.");
  return true;
}

export function buildProfileInstructions(profile: McpProfile): string {
  return [
    profile === "music"
      ? "Cove Resonance exposes a Music-scoped MCP view for NetEase Listen Together events and tools."
      : "Cove Resonance routes external events into this conversation while preserving the legacy all-in-one MCP surface.",
    "SOURCE DISTINCTION: a bridged NetEase ChatRoom message is authored inside NetEase Cloud Music, not in the ChatGPT window. It is identified by MESSAGE ORIGIN: NetEase ChatRoom, source=netease.chatroom, or the visible prefix 【网易云聊天室】.",
    "A normal user message typed directly in the official ChatGPT conversation has no Cove Resonance NetEase origin marker. Do not route ordinary ChatGPT-window replies to NetEase unless the current turn is explicitly a bridged NetEase event.",
    "NetEase playback/music_changed state events are system state, not direct user chat. Do not confuse 【网易云一起听状态】 with a user-authored ChatRoom message.",
    "For any current bridged NetEase ChatRoom turn whose model context contains replyPolicy=required and replyRoute=netease.chatroom, you MUST call cove_bridge_reply exactly once before completing the turn. eventId may be omitted because the Bridge binds the reply to the active required event.",
    "For normal conversational replies, messages[] MUST default to 2-5 short, natural chat bubbles. A single bubble is allowed only for a genuinely brief reply.",
    "A reply written only in the ChatGPT conversation does NOT satisfy a required routed reply.",
    "Do not use netease_together_send_message directly for a routed reply.",
    "For replyPolicy=optional, call cove_bridge_reply only when you choose to send a user-facing reaction.",
  ].join("\n");
}
