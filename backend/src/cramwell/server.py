from .utils import get_mind_map, process_file, query_index, process_file_for_notebook, query_index_for_notebook, DOC_CONVERTER
from .pinecone_service import pinecone_service
from fastmcp import FastMCP
from typing import List, Union, Literal
import os
from dotenv import load_dotenv

load_dotenv()
MCP_TRANSPORT = os.getenv("MCP_TRANSPORT", "streamable-http")

# Pre-load DocumentConverter at server startup to download models early
print("Initializing DocumentConverter and downloading models...")
try:
    # This will trigger the cached instance creation in utils.py
    if DOC_CONVERTER is None:
        print("DocumentConverter not available")
    else:
        print("DocumentConverter initialized successfully")
except Exception as e:
    print(f"Warning: Could not initialize DocumentConverter at startup: {e}")

mcp: FastMCP = FastMCP(name="MCP For Cramwell")

# Health check tool
@mcp.tool(
    name="health_check_tool",
    description="Health check endpoint for the MCP server"
)
async def health_check_tool() -> str:
    """Health check for the MCP server"""
    return "MCP server is healthy"

@mcp.tool(
    name="process_file_tool",
    description="This tool is useful to process files and produce summaries, question-answers and highlights.",
)
async def process_file_tool(
    filename: str,
) -> Union[str, Literal["Sorry, your file could not be processed."]]:
    notebook_model, text = await process_file(filename=filename)
    if notebook_model is None:
        return "Sorry, your file could not be processed."
    if text is None:
        text = ""
    return notebook_model + "\n%separator%\n" + text


@mcp.tool(
    name="process_file_for_notebook_tool",
    description="This tool processes files for a specific notebook and creates embeddings for that notebook context.",
)
async def process_file_for_notebook_tool(
    filename: str,
    notebook_id: str,
    document_type: str = "general_review",
) -> Union[str, Literal["Sorry, your file could not be processed."]]:
    notebook_model, text = await process_file_for_notebook(filename=filename, notebook_id=notebook_id, document_type=document_type)
    if notebook_model is None:
        return "Sorry, your file could not be processed."
    if text is None:
        text = ""
    return notebook_model + "\n%separator%\n" + text


@mcp.tool(name="get_mind_map_tool", description="This tool is useful to get a mind ")
async def get_mind_map_tool(
    summary: str, highlights: List[str]
) -> Union[str, Literal["Sorry, mind map creation failed."]]:
    mind_map_fl = await get_mind_map(summary=summary, highlights=highlights)
    if mind_map_fl is None:
        return "Sorry, mind map creation failed."
    return mind_map_fl


@mcp.tool(name="query_index_tool", description="Query a LlamaCloud index.")
async def query_index_tool(question: str) -> str:
    response = await query_index(question=question)
    if response is None:
        return "Sorry, I was unable to find an answer to your question."
    return response


@mcp.tool(name="query_index_for_notebook_tool", description="Query a Pinecone index for a specific notebook context.")
async def query_index_for_notebook_tool(question: str, notebook_id: str) -> str:
    response = await query_index_for_notebook(question=question, notebook_id=notebook_id)
    if response is None:
        return "Sorry, I was unable to find an answer to your question."
    return response

@mcp.tool(name="list_notebooks_tool", description="List all notebooks that have documents in the main Pinecone index.")
async def list_notebooks_tool() -> str:
    notebooks = pinecone_service.list_notebooks()
    if not notebooks:
        return "No notebooks found."
    return f"Available notebooks: {', '.join(notebooks)}"

@mcp.tool(name="delete_notebook_documents_tool", description="Delete all documents for a specific notebook from the main Pinecone index.")
async def delete_notebook_documents_tool(notebook_id: str) -> str:
    success = await pinecone_service.delete_notebook_documents(notebook_id)
    if success:
        return f"Successfully deleted all documents for notebook {notebook_id}"
    else:
        return f"Failed to delete documents for notebook {notebook_id}"


if __name__ == "__main__":
    mcp.run(transport=MCP_TRANSPORT)
