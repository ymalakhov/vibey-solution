"""Seed script to create demo workspace with sample tools and flows."""
import asyncio

from sqlalchemy import select, delete

from app.database import init_db, async_session
from app.models.models import Workspace, Tool, Flow


async def seed():
    await init_db()

    async with async_session() as db:
        # Remove existing demo workspace and its data if present
        existing = await db.execute(select(Workspace).where(Workspace.id == "demo"))
        if existing.scalar_one_or_none():
            await db.execute(delete(Flow).where(Flow.workspace_id == "demo"))
            await db.execute(delete(Tool).where(Tool.workspace_id == "demo"))
            await db.execute(delete(Workspace).where(Workspace.id == "demo"))
            await db.flush()

        # Create demo workspace
        ws = Workspace(id="demo", name="Demo Shop", domain="demo.shop.com")
        db.add(ws)

        # Sample tools
        tools = [
            Tool(
                workspace_id="demo",
                name="refund_payment",
                description="Process a refund for the customer's order. Use when customer requests money back.",
                endpoint="https://httpbin.org/post",
                method="POST",
                parameters=[
                    {"name": "order_id", "type": "string", "description": "Order ID to refund", "required": True},
                    {"name": "amount", "type": "number", "description": "Refund amount in USD", "required": True},
                    {"name": "reason", "type": "string", "description": "Reason for refund", "required": False},
                ],
                requires_approval=True,
            ),
            Tool(
                workspace_id="demo",
                name="change_subscription_plan",
                description="Change customer's subscription plan to a different tier.",
                endpoint="https://httpbin.org/post",
                method="POST",
                parameters=[
                    {"name": "customer_email", "type": "string", "description": "Customer email", "required": True},
                    {"name": "new_plan", "type": "string", "description": "New plan name (basic/pro/business)", "required": True},
                ],
                requires_approval=True,
            ),
            Tool(
                workspace_id="demo",
                name="reset_password",
                description="Send password reset link to customer's email.",
                endpoint="https://httpbin.org/post",
                method="POST",
                parameters=[
                    {"name": "email", "type": "string", "description": "Customer email address", "required": True},
                ],
                requires_approval=False,
            ),
            Tool(
                workspace_id="demo",
                name="lookup_customer",
                description="Look up customer information including orders, plan, and support history.",
                endpoint="https://httpbin.org/get",
                method="GET",
                parameters=[
                    {"name": "email", "type": "string", "description": "Customer email", "required": True},
                ],
                requires_approval=False,
            ),
        ]

        for tool in tools:
            db.add(tool)

        # Sample flow: Refund Request
        refund_flow = Flow(
            workspace_id="demo",
            name="Refund Request",
            description="Handles customer refund requests with order verification and approval",
            trigger_intents=["refund", "money back", "повернення", "повернути кошти"],
            priority=10,
            is_active=True,
            nodes=[
                {
                    "id": "trigger-1",
                    "type": "trigger",
                    "position": {"x": 250, "y": 0},
                    "data": {
                        "label": "Refund Request",
                        "intents": ["refund", "money back", "повернення"],
                        "description": "Customer wants a refund",
                    },
                },
                {
                    "id": "question-1",
                    "type": "question",
                    "position": {"x": 250, "y": 120},
                    "data": {
                        "label": "Ask Order ID",
                        "question_text": "Could you please provide your order ID so I can look into this for you?",
                        "variable_name": "order_id",
                        "validation": "non-empty",
                        "required": True,
                    },
                },
                {
                    "id": "question-2",
                    "type": "question",
                    "position": {"x": 250, "y": 240},
                    "data": {
                        "label": "Ask Refund Reason",
                        "question_text": "What is the reason for the refund?",
                        "variable_name": "refund_reason",
                        "required": True,
                    },
                },
                {
                    "id": "guardrail-1",
                    "type": "guardrail",
                    "position": {"x": 250, "y": 360},
                    "data": {
                        "label": "Check Amount",
                        "check_type": "amount_limit",
                        "condition": "Refund amount must be under $500",
                        "fail_message": "Refunds over $500 require manager approval. Let me connect you with a supervisor.",
                        "on_fail_action": "escalate",
                    },
                },
                {
                    "id": "tool-1",
                    "type": "tool",
                    "position": {"x": 250, "y": 480},
                    "data": {
                        "label": "Process Refund",
                        "tool_id": "",
                        "input_mapping": {
                            "order_id": "{{order_id}}",
                            "reason": "{{refund_reason}}",
                        },
                    },
                },
                {
                    "id": "response-1",
                    "type": "response",
                    "position": {"x": 250, "y": 600},
                    "data": {
                        "label": "Confirm Refund",
                        "message_template": "Your refund for order {{order_id}} has been processed. You should see the amount back in your account within 5-7 business days.",
                        "ai_instructions": "Confirm the refund was processed and provide timeline.",
                    },
                },
            ],
            edges=[
                {"id": "e1", "source": "trigger-1", "target": "question-1"},
                {"id": "e2", "source": "question-1", "target": "question-2"},
                {"id": "e3", "source": "question-2", "target": "guardrail-1"},
                {"id": "e4", "source": "guardrail-1", "target": "tool-1"},
                {"id": "e5", "source": "tool-1", "target": "response-1"},
            ],
        )
        db.add(refund_flow)

        # Sample flow: Account Deletion (with escalation)
        account_deletion_flow = Flow(
            workspace_id="demo",
            name="Account Deletion",
            description="Handles account deletion requests — confirms intent, checks for active subscriptions, and escalates to a human agent",
            trigger_intents=["delete account", "close account", "remove account", "видалити акаунт", "закрити акаунт"],
            priority=5,
            is_active=True,
            nodes=[
                {
                    "id": "trigger-del",
                    "type": "trigger",
                    "position": {"x": 250, "y": 0},
                    "data": {
                        "label": "Account Deletion",
                        "intents": ["delete account", "close account", "видалити акаунт"],
                        "description": "Customer wants to delete their account",
                    },
                },
                {
                    "id": "question-reason",
                    "type": "question",
                    "position": {"x": 250, "y": 120},
                    "data": {
                        "label": "Ask Reason",
                        "question_text": "We're sorry to see you go. Could you share why you'd like to delete your account? This helps us improve.",
                        "variable_name": "deletion_reason",
                        "required": True,
                    },
                },
                {
                    "id": "question-confirm",
                    "type": "question",
                    "position": {"x": 250, "y": 240},
                    "data": {
                        "label": "Confirm Deletion",
                        "question_text": "Please be aware that account deletion is permanent and all your data will be lost. Type 'CONFIRM' to proceed.",
                        "variable_name": "confirmation",
                        "validation": "must equal CONFIRM",
                        "required": True,
                    },
                },
                {
                    "id": "condition-confirmed",
                    "type": "condition",
                    "position": {"x": 250, "y": 360},
                    "data": {
                        "label": "User Confirmed?",
                        "variable": "confirmation",
                        "operator": "equals",
                        "value": "CONFIRM",
                    },
                },
                {
                    "id": "escalation-delete",
                    "type": "escalation",
                    "position": {"x": 100, "y": 500},
                    "data": {
                        "label": "Escalate to Agent",
                        "reason": "Customer confirmed account deletion. This requires a human agent to process.",
                        "generate_summary": True,
                        "priority_override": "high",
                        "handoff_notes_template": "Customer ({{customer_email}}) confirmed account deletion. Reason: {{deletion_reason}}. Please process in admin panel.",
                    },
                },
                {
                    "id": "response-cancelled",
                    "type": "response",
                    "position": {"x": 400, "y": 500},
                    "data": {
                        "label": "Deletion Cancelled",
                        "message_template": "No problem! Your account will remain active. If you change your mind or need anything else, feel free to reach out.",
                        "ai_instructions": "The customer did not confirm. Reassure them their account is safe.",
                    },
                },
            ],
            edges=[
                {"id": "ed1", "source": "trigger-del", "target": "question-reason"},
                {"id": "ed2", "source": "question-reason", "target": "question-confirm"},
                {"id": "ed3", "source": "question-confirm", "target": "condition-confirmed"},
                {"id": "ed4", "source": "condition-confirmed", "target": "escalation-delete", "sourceHandle": "yes", "label": "Confirmed"},
                {"id": "ed5", "source": "condition-confirmed", "target": "response-cancelled", "sourceHandle": "no", "label": "Not confirmed"},
            ],
        )
        db.add(account_deletion_flow)

        await db.commit()
        print(f"Seeded workspace: demo")
        print(f"Seeded {len(tools)} tools")
        print(f"Seeded 2 flows: Refund Request, Account Deletion")
        print(f"\nWorkspace ID: demo")
        print(f"Start the server and visit: http://localhost:8000/docs")


if __name__ == "__main__":
    asyncio.run(seed())
