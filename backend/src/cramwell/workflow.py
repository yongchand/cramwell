import json

from workflows.workflow import Workflow
from workflows.decorators import step
from workflows.context import Context
from workflows.events import StartEvent, StopEvent, Event
from workflows.resource import Resource
from llama_index.tools.mcp import BasicMCPClient
from typing import Annotated, List, Union

import os

MCP_URL = os.getenv("MCP_URL", "http://localhost:8000/mcp")
MCP_CLIENT = BasicMCPClient(command_or_url=MCP_URL, timeout=120)


class FileInputEvent(StartEvent):
    file: str


class NotebookFileInputEvent(StartEvent):
    file: str
    notebook_id: str


class NotebookOutputEvent(StopEvent):
    md_content: str
    summary: str
    highlights: List[str]
    questions: List[str]
    answers: List[str]





def get_mcp_client(*args, **kwargs) -> BasicMCPClient:
    return MCP_CLIENT


class NotebookLMWorkflow(Workflow):
    @step
    async def extract_file_data(
        self,
        ev: FileInputEvent,
        mcp_client: Annotated[BasicMCPClient, Resource(get_mcp_client)],
        ctx: Context,
    ) -> NotebookOutputEvent:
        ctx.write_event_to_stream(
            ev=ev,
        )
        result = await mcp_client.call_tool(
            tool_name="process_file_tool", arguments={"filename": ev.file}
        )
        # Handle string responses (MCP tools return strings)
        result_text = str(result)
        split_result = result_text.split("\n%separator%\n")
        json_data = split_result[0]
        md_text = split_result[1]
        if json_data == "Sorry, your file could not be processed.":
            return NotebookOutputEvent(
                md_content="",
                summary="",
                highlights=[],
                questions=[],
                answers=[],
            )
        json_rep = json.loads(json_data)
        return NotebookOutputEvent(
            md_content=md_text,
            **json_rep,
        )

    @step
    async def extract_notebook_file_data(
        self,
        ev: NotebookFileInputEvent,
        mcp_client: Annotated[BasicMCPClient, Resource(get_mcp_client)],
        ctx: Context,
    ) -> NotebookOutputEvent:
        """Extract file data for a specific notebook context"""
        ctx.write_event_to_stream(
            ev=ev,
        )
        result = await mcp_client.call_tool(
            tool_name="process_file_for_notebook_tool", 
            arguments={"filename": ev.file, "notebook_id": ev.notebook_id}
        )
        # Handle string responses (MCP tools return strings)
        result_text = str(result)
        split_result = result_text.split("\n%separator%\n")
        json_data = split_result[0]
        md_text = split_result[1]
        if json_data == "Sorry, your file could not be processed.":
            return NotebookOutputEvent(
                md_content="",
                summary="",
                highlights=[],
                questions=[],
                answers=[],
            )
        json_rep = json.loads(json_data)
        return NotebookOutputEvent(
            notebook_id=ev.notebook_id,
            md_content=md_text,
            **json_rep,
        )


