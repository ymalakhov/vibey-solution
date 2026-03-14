from datetime import datetime

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import Tool, ToolExecution


async def execute_tool(db: AsyncSession, execution: ToolExecution) -> dict:
    """Execute a tool by calling its configured endpoint."""

    tool = await db.get(Tool, execution.tool_id)
    if not tool:
        return {"success": False, "error": "Tool not found"}

    try:
        # Resolve headers
        headers = {"Content-Type": "application/json"}
        if tool.headers:
            headers.update(tool.headers)

        async with httpx.AsyncClient(timeout=30.0) as client:
            if tool.method.upper() == "GET":
                response = await client.get(
                    tool.endpoint,
                    params=execution.input_data,
                    headers=headers,
                )
            else:
                response = await client.request(
                    method=tool.method.upper(),
                    url=tool.endpoint,
                    json=execution.input_data,
                    headers=headers,
                )

        result = {
            "success": response.is_success,
            "status_code": response.status_code,
            "data": response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text,
        }

        # Update execution
        execution.output_data = result
        execution.status = "executed" if response.is_success else "failed"
        execution.executed_at = datetime.utcnow()

        # Update tool stats
        tool.usage_count += 1
        if response.is_success:
            tool.success_count += 1

        await db.commit()
        return result

    except Exception as e:
        execution.output_data = {"success": False, "error": str(e)}
        execution.status = "failed"
        execution.executed_at = datetime.utcnow()
        tool.usage_count += 1
        await db.commit()
        return {"success": False, "error": str(e)}
