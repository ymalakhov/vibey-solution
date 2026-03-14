"""Seed script to create demo workspace with sample tools."""
import asyncio

from app.database import init_db, async_session
from app.models.models import Workspace, Tool


async def seed():
    await init_db()

    async with async_session() as db:
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

        await db.commit()
        print(f"Seeded workspace: demo")
        print(f"Seeded {len(tools)} tools")
        print(f"\nWorkspace ID: demo")
        print(f"Start the server and visit: http://localhost:8000/docs")


if __name__ == "__main__":
    asyncio.run(seed())
