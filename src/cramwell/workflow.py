import json

from workflows.workflow import Workflow
from workflows.decorators import step
from workflows.context import Context
from workflows.events import StartEvent, StopEvent, Event
from workflows.resource import Resource
from llama_index.tools.mcp import BasicMCPClient
from typing import Annotated, List, Union

MCP_CLIENT = BasicMCPClient(command_or_url="http://localhost:8000/mcp", timeout=120)


class FileInputEvent(StartEvent):
    file: str


class NotebookFileInputEvent(StartEvent):
    file: str
    notebook_id: str


class NotebookOutputEvent(StopEvent):
    mind_map: str
    md_content: str
    summary: str
    highlights: List[str]
    questions: List[str]
    answers: List[str]


class MindMapCreationEvent(Event):
    summary: str
    highlights: List[str]
    questions: List[str]
    answers: List[str]
    md_content: str


class NotebookMindMapCreationEvent(Event):
    summary: str
    highlights: List[str]
    questions: List[str]
    answers: List[str]
    md_content: str
    notebook_id: str


def get_mcp_client(*args, **kwargs) -> BasicMCPClient:
    return MCP_CLIENT


class NotebookLMWorkflow(Workflow):
    @step
    async def extract_file_data(
        self,
        ev: FileInputEvent,
        mcp_client: Annotated[BasicMCPClient, Resource(get_mcp_client)],
        ctx: Context,
    ) -> Union[MindMapCreationEvent, NotebookOutputEvent]:
        ctx.write_event_to_stream(
            ev=ev,
        )
        result = await mcp_client.call_tool(
            tool_name="process_file_tool", arguments={"filename": ev.file}
        )
        split_result = result.content[0].text.split("\n%separator%\n")
        json_data = split_result[0]
        md_text = split_result[1]
        if json_data == "Sorry, your file could not be processed.":
            return NotebookOutputEvent(
                mind_map="Unprocessable file, sorry😭",
                md_content="",
                summary="",
                highlights=[],
                questions=[],
                answers=[],
            )
        json_rep = json.loads(json_data)
        return MindMapCreationEvent(
            md_content=md_text,
            **json_rep,
        )

    @step
    async def extract_notebook_file_data(
        self,
        ev: NotebookFileInputEvent,
        mcp_client: Annotated[BasicMCPClient, Resource(get_mcp_client)],
        ctx: Context,
    ) -> Union[NotebookMindMapCreationEvent, NotebookOutputEvent]:
        """Extract file data for a specific notebook context"""
        ctx.write_event_to_stream(
            ev=ev,
        )
        result = await mcp_client.call_tool(
            tool_name="process_file_for_notebook_tool", 
            arguments={"filename": ev.file, "notebook_id": ev.notebook_id}
        )
        split_result = result.content[0].text.split("\n%separator%\n")
        json_data = split_result[0]
        md_text = split_result[1]
        if json_data == "Sorry, your file could not be processed.":
            return NotebookOutputEvent(
                mind_map="Unprocessable file, sorry😭",
                md_content="",
                summary="",
                highlights=[],
                questions=[],
                answers=[],
            )
        json_rep = json.loads(json_data)
        return NotebookMindMapCreationEvent(
            notebook_id=ev.notebook_id,
            md_content=md_text,
            **json_rep,
        )

    @step
    async def generate_mind_map(
        self,
        ev: MindMapCreationEvent,
        mcp_client: Annotated[BasicMCPClient, Resource(get_mcp_client)],
        ctx: Context,
    ) -> NotebookOutputEvent:
        ctx.write_event_to_stream(
            ev=ev,
        )
        result = await mcp_client.call_tool(
            tool_name="get_mind_map_tool",
            arguments={"summary": ev.summary, "highlights": ev.highlights},
        )
        if result is not None:
            return NotebookOutputEvent(
                mind_map=result.content[0].text,
                **ev.model_dump(
                    include={
                        "summary",
                        "highlights",
                        "questions",
                        "answers",
                        "md_content",
                    }
                ),
            )
        return NotebookOutputEvent(
            mind_map="Sorry, mind map creation failed😭",
            **ev.model_dump(
                include={
                    "summary",
                    "highlights",
                    "questions",
                    "answers",
                    "md_content",
                }
            ),
        )

    @step
    async def generate_notebook_mind_map(
        self,
        ev: NotebookMindMapCreationEvent,
        mcp_client: Annotated[BasicMCPClient, Resource(get_mcp_client)],
        ctx: Context,
    ) -> NotebookOutputEvent:
        """Generate mind map for notebook-specific data"""
        ctx.write_event_to_stream(
            ev=ev,
        )
        result = await mcp_client.call_tool(
            tool_name="get_mind_map_tool",
            arguments={"summary": ev.summary, "highlights": ev.highlights},
        )
        if result is not None:
            return NotebookOutputEvent(
                mind_map=result.content[0].text,
                **ev.model_dump(
                    include={
                        "summary",
                        "highlights",
                        "questions",
                        "answers",
                        "md_content",
                    }
                ),
            )
        return NotebookOutputEvent(
            mind_map="Sorry, mind map creation failed😭",
            **ev.model_dump(
                include={
                    "summary",
                    "highlights",
                    "questions",
                    "answers",
                    "md_content",
                }
            ),
        )
