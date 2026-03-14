import json
from fastapi import WebSocket


class ConnectionManager:
    """Centralized WebSocket connection manager for widget and admin connections."""

    def __init__(self):
        # One WS per conversation (customer widget)
        self.widget_connections: dict[str, WebSocket] = {}
        # Multiple admin tabs per workspace
        self.admin_connections: dict[str, set[WebSocket]] = {}

    # --- Widget connections ---

    def connect_widget(self, conversation_id: str, websocket: WebSocket):
        self.widget_connections[conversation_id] = websocket

    def disconnect_widget(self, conversation_id: str):
        self.widget_connections.pop(conversation_id, None)

    async def send_to_widget(self, conversation_id: str, data: dict) -> bool:
        ws = self.widget_connections.get(conversation_id)
        if ws:
            try:
                await ws.send_text(json.dumps(data))
                return True
            except Exception:
                self.widget_connections.pop(conversation_id, None)
        return False

    # --- Admin connections ---

    def connect_admin(self, workspace_id: str, websocket: WebSocket):
        if workspace_id not in self.admin_connections:
            self.admin_connections[workspace_id] = set()
        self.admin_connections[workspace_id].add(websocket)

    def disconnect_admin(self, workspace_id: str, websocket: WebSocket):
        conns = self.admin_connections.get(workspace_id)
        if conns:
            conns.discard(websocket)
            if not conns:
                del self.admin_connections[workspace_id]

    async def broadcast_to_admins(self, workspace_id: str, data: dict):
        conns = self.admin_connections.get(workspace_id)
        if not conns:
            return
        payload = json.dumps(data)
        dead = []
        for ws in conns:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            conns.discard(ws)

    # --- High-level helpers ---

    async def notify_admins_new_message(
        self, workspace_id: str, conversation_id: str, message_dict: dict
    ):
        await self.broadcast_to_admins(workspace_id, {
            "type": "new_message",
            "conversation_id": conversation_id,
            "message": message_dict,
        })

    async def notify_conversation(self, conversation_id: str, data: dict):
        """Backward-compatible wrapper matching the old notify_conversation signature."""
        await self.send_to_widget(conversation_id, data)


# Singleton instance
manager = ConnectionManager()
