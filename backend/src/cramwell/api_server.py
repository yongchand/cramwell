from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import asyncio
import tempfile
import os
import uuid
from datetime import datetime
import json
import aiohttp
import logging
from dotenv import load_dotenv
from contextlib import asynccontextmanager

from .utils import process_file, query_index, get_mind_map, process_file_for_notebook, query_index_for_notebook
from .workflow import NotebookLMWorkflow, FileInputEvent, NotebookOutputEvent
from .database import supabase
try:
    from llama_index.tools.mcp import BasicMCPClient
except ImportError:
    # Fallback for different versions
    from llama_index.tools import BasicMCPClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

load_dotenv()
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8001"))
MCP_URL = os.getenv("MCP_URL", "http://localhost:8000/mcp")

app = FastAPI(title="Cramwell API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Development
        "https://localhost:3000",  # Development HTTPS
        "https://cramwell.vercel.app",  # Production frontend
        "https://cramwell-backend.onrender.com",  # Production backend
        os.getenv("FRONTEND_URL", "https://cramwell.vercel.app"),  # Production frontend URL
        os.getenv("FRONTEND_URL_DEV", "http://localhost:3000"),  # Development frontend URL
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# MCP Client Pool for notebook-specific operations
class MCPClientPool:
    def __init__(self, max_connections=5):
        self.max_connections = max_connections
        self._clients = asyncio.Queue(maxsize=max_connections)
        self._initialized = False
    
    async def initialize(self):
        if not self._initialized:
            for _ in range(self.max_connections):
                client = BasicMCPClient(command_or_url=MCP_URL, timeout=30)
                await self._clients.put(client)
            self._initialized = True
    
    @asynccontextmanager
    async def get_client(self):
        await self.initialize()
        client = await self._clients.get()
        try:
            yield client
        finally:
            await self._clients.put(client)

# Replace global MCP_CLIENT with pool
mcp_pool = MCPClientPool()

def notebook_exists(notebook_id: str) -> bool:
    res = supabase.table("notebooks").select("id").eq("id", notebook_id).single().execute()
    return bool(res.data)

# Memory cleanup task
async def memory_cleanup_task():
    """Periodic memory cleanup task."""
    while True:
        try:
            # Force garbage collection
            import gc
            gc.collect()
            
            # Log memory usage
            import psutil
            process = psutil.Process()
            memory_mb = process.memory_info().rss / 1024 / 1024
            logger.info(f"Memory usage: {memory_mb:.1f}MB")
            
            # If memory usage is high, force more aggressive cleanup
            if memory_mb > 1000:  # 1GB threshold
                logger.warning(f"High memory usage detected: {memory_mb:.1f}MB")
                gc.collect()
                
        except Exception as e:
            logger.error(f"Error in memory cleanup task: {e}")
        
        await asyncio.sleep(300)  # Run every 5 minutes

# Start memory cleanup task when app starts
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(memory_cleanup_task())

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint for the API server"""
    health_status = {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
        "services": {}
    }
    
    # Check MCP server
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{MCP_URL.replace('/mcp', '')}/health", timeout=5) as response:
                if response.status == 200:
                    health_status["services"]["mcp_server"] = "healthy"
                else:
                    health_status["services"]["mcp_server"] = "unhealthy"
                    health_status["status"] = "degraded"
    except Exception as e:
        health_status["services"]["mcp_server"] = f"error: {str(e)}"
        health_status["status"] = "degraded"
    
    # Check database connection
    try:
        # Simple query to test database connection
        res = supabase.table("notebooks").select("id").limit(1).execute()
        health_status["services"]["database"] = "healthy"
    except Exception as e:
        health_status["services"]["database"] = f"error: {str(e)}"
        health_status["status"] = "degraded"
    
    # Check environment variables
    required_env_vars = ["OPENAI_API_KEY", "PINECONE_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    missing_vars = []
    for var in required_env_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        health_status["services"]["environment"] = f"missing: {', '.join(missing_vars)}"
        health_status["status"] = "degraded"
    else:
        health_status["services"]["environment"] = "healthy"
    
    return health_status

# Remove in-memory storage
# notebooks: Dict[str, Dict[str, Any]] = {}
# sources: Dict[str, List[Dict[str, Any]]] = {}
# chat_sessions: Dict[str, List[Dict[str, Any]]] = {}

# Pydantic models
class CreateNotebookRequest(BaseModel):
    name: str
    description: str

class NotebookResponse(BaseModel):
    id: str
    name: str
    description: str
    created: str
    updated: str
    archived: bool = False

class SourceResponse(BaseModel):
    id: str
    title: Optional[str] = None
    full_text: Optional[str] = None
    created: str
    updated: str

class ChatMessageRequest(BaseModel):
    message: str
    user_id: str  # Add user_id to the request

class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    timestamp: str

class StudyFeatureResponse(BaseModel):
    id: str
    content: str
    created: str

@app.get("/")
async def root():
    return {"message": "Cramwell API"}

@app.get("/notebooks/", response_model=List[NotebookResponse])
async def get_notebooks():
    """Get all notebooks from Supabase"""
    res = supabase.table("notebooks").select("*").eq("archived", False).execute()
    notebooks = res.data or []
    return [
        NotebookResponse(
            id=nb["id"],
            name=nb["name"],
            description=nb["description"],
            created=nb["created_at"],
            updated=nb["updated_at"],
            archived=nb.get("archived", False)
        ) for nb in notebooks
    ]

@app.post("/notebooks/", response_model=NotebookResponse)
async def create_notebook(request: CreateNotebookRequest):
    """Create a new notebook in Supabase"""
    now = datetime.now().isoformat()
    data = {
        "name": request.name,
        "description": request.description,
        "created_at": now,
        "updated_at": now,
        "archived": False
    }
    res = supabase.table("notebooks").insert(data).execute()
    nb = res.data[0]
    return NotebookResponse(
        id=nb["id"],
        name=nb["name"],
        description=nb["description"],
        created=nb["created_at"],
        updated=nb["updated_at"],
        archived=nb.get("archived", False)
    )

@app.get("/notebooks/{notebook_id}", response_model=NotebookResponse)
async def get_notebook(notebook_id: str):
    """Get a specific notebook from Supabase"""
    res = supabase.table("notebooks").select("*").eq("id", notebook_id).single().execute()
    nb = res.data
    if not nb:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return NotebookResponse(
        id=nb["id"],
        name=nb["name"],
        description=nb["description"],
        created=nb["created_at"],
        updated=nb["updated_at"],
        archived=nb.get("archived", False)
    )

@app.put("/notebooks/{notebook_id}", response_model=NotebookResponse)
async def update_notebook(notebook_id: str, request: CreateNotebookRequest):
    """Update a notebook in Supabase"""
    now = datetime.now().isoformat()
    data = {
        "name": request.name,
        "description": request.description,
        "updated_at": now
    }
    res = supabase.table("notebooks").update(data).eq("id", notebook_id).execute()
    nb = res.data[0]
    return NotebookResponse(
        id=nb["id"],
        name=nb["name"],
        description=nb["description"],
        created=nb["created_at"],
        updated=nb["updated_at"],
        archived=nb.get("archived", False)
    )

@app.delete("/notebooks/{notebook_id}")
async def delete_notebook(notebook_id: str):
    """Delete a notebook from Supabase"""
    res = supabase.table("notebooks").delete().eq("id", notebook_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return {"message": "Notebook deleted successfully"}

# --- Sources, chat, and study features endpoints ---
# TODO: Migrate these to Supabase as well. For now, remove all in-memory checks and raise NotImplementedError or return empty lists.

@app.post("/notebooks/{notebook_id}/upload/", response_model=SourceResponse)
async def upload_source(notebook_id: str, file: UploadFile = File(...), document_type: str = "general_review"):
    """Upload and process a file for a specific notebook"""
    if not notebook_exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    # Validate file type
    allowed_types = [".pdf", ".docx", ".txt", ".md", ".html"]
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_types:
        raise HTTPException(status_code=400, detail=f"File type {file_ext} not supported. Allowed types: {allowed_types}")
    
    # Create temporary file and stream content
    with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as temp_file:
        file_size = 0
        while chunk := await file.read(8192):
            temp_file.write(chunk)
            file_size += len(chunk)
            if file_size > 25 * 1024 * 1024:  # 25MB
                temp_file.close()
                os.unlink(temp_file.name)
                raise HTTPException(status_code=400, detail="File too large. Maximum size is 25MB.")
        temp_file_path = temp_file.name
    
    try:
        # Process file using MCP client for notebook-specific processing
        async with mcp_pool.get_client() as client:
            result = await client.call_tool(
                tool_name="process_file_for_notebook_tool",
                arguments={"filename": temp_file_path, "notebook_id": notebook_id, "document_type": document_type}
            )
        
        if result.content[0].text == "Sorry, your file could not be processed.":
            raise HTTPException(status_code=400, detail="File could not be processed")
        
        # Parse the result
        split_result = result.content[0].text.split("\n%separator%\n")
        
        if len(split_result) >= 2:
            json_data = split_result[0]
            text_content = split_result[1]
            
            # Don't create a new document record since frontend already created one
            # Just return success response
            now = datetime.now().isoformat()
            
            return SourceResponse(
                id=str(uuid.uuid4()),  # Generate a temporary ID
                title=file.filename,
                full_text=f"Document: {file.filename} (processed)",
                created=now,
                updated=now
            )
        else:
            raise HTTPException(status_code=500, detail="Invalid processing result")
            
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")
    finally:
        # Clean up temporary file
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
        # Force garbage collection
        import gc
        gc.collect()


@app.post("/notebooks/{notebook_id}/chat/", response_model=ChatMessageResponse)
async def send_chat_message(notebook_id: str, request: ChatMessageRequest):
    """Send a chat message for a specific notebook"""
    if not notebook_exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    try:
        # Query using notebook-specific context
        async with mcp_pool.get_client() as client:
            result = await client.call_tool(
                tool_name="query_index_for_notebook_tool",
                arguments={"question": request.message, "notebook_id": notebook_id}
            )
        
        # Handle the MCP response properly
        if not result.content or len(result.content) == 0:
            response_text = "Sorry, I was unable to find an answer to your question."
        else:
            response_text = result.content[0].text
            if not response_text or response_text.strip() == "":
                response_text = "Sorry, I was unable to find an answer to your question."
        
        # Get or create a chat session for this notebook
        now = datetime.now().isoformat()
        
        # Use the user_id from the request
        user_id = request.user_id
        
        # Try to get an existing active session for this notebook and user
        session_res = supabase.table("chat_sessions").select("*").eq("notebook_id", notebook_id).eq("user_id", user_id).eq("active", True).order("created_at", desc=True).limit(1).execute()
        
        if session_res.data and len(session_res.data) > 0:
            session_id = session_res.data[0]["id"]
        else:
            # Create a new session
            session_data = {
                "id": str(uuid.uuid4()),
                "notebook_id": notebook_id,
                "user_id": user_id,
                "active": True,
                "created_at": now
            }
            session_res = supabase.table("chat_sessions").insert(session_data).execute()
            session_id = session_res.data[0]["id"] if session_res.data else session_data["id"]
        
        # Store user message with proper UUID
        user_message_data = {
            "id": str(uuid.uuid4()),  # Generate proper UUID
            "session_id": session_id,
            "user_id": user_id,  # Set the user_id for user messages
            "role": "user",
            "content": request.message,
            "created_at": now
        }
        
        user_res = supabase.table("chat_messages").insert(user_message_data).execute()
        user_message_id = user_res.data[0]["id"] if user_res.data else user_message_data["id"]
        
        # Store assistant response with proper UUID
        assistant_message_data = {
            "id": str(uuid.uuid4()),  # Generate proper UUID
            "session_id": session_id,
            "role": "assistant", 
            "content": response_text,
            "created_at": now
        }
        
        assistant_res = supabase.table("chat_messages").insert(assistant_message_data).execute()
        assistant_message_id = assistant_res.data[0]["id"] if assistant_res.data else assistant_message_data["id"]
        
        return ChatMessageResponse(
            id=assistant_message_id,
            role="assistant",
            content=response_text,
            timestamp=now
        )
        
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


@app.get("/notebooks/{notebook_id}/chat/", response_model=List[ChatMessageResponse])
async def get_chat_history(notebook_id: str, user_id: str):
    """Get chat history for a specific notebook"""
    if not notebook_exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    try:
        # Get the active session for this notebook and user
        session_res = supabase.table("chat_sessions").select("*").eq("notebook_id", notebook_id).eq("user_id", user_id).eq("active", True).order("created_at", desc=True).limit(1).execute()
        
        if not session_res.data or len(session_res.data) == 0:
            # No active session, return empty list
            return []
        
        session_id = session_res.data[0]["id"]
        
        # Get chat messages for this session
        res = supabase.table("chat_messages").select("*").eq("session_id", session_id).order("created_at").execute()
        messages = res.data or []
        
        return [
            ChatMessageResponse(
                id=msg["id"],
                role=msg["role"],
                content=msg["content"],
                timestamp=msg["created_at"]
            ) for msg in messages
        ]
    except Exception as e:
        logger.error(f"Chat history error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch chat history: {str(e)}")


@app.get("/notebooks/{notebook_id}/sources", response_model=List[SourceResponse])
async def get_sources(notebook_id: str):
    """Get sources for a specific notebook"""
    if not notebook_exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    try:
        # Use the existing documents table instead of sources
        res = supabase.table("documents").select("*").eq("notebook_id", notebook_id).eq("status", True).order("created_at", desc=True).execute()
        documents = res.data or []
        
        return [
            SourceResponse(
                id=doc["id"],
                title=doc["document_name"],
                full_text=f"Document: {doc['document_name']} ({doc['document_type']})",
                created=doc["created_at"],
                updated=doc["updated_at"]
            ) for doc in documents
        ]
    except Exception as e:
        logger.error(f"Sources error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch sources: {str(e)}")

# The rest of the endpoints (study features, etc.) should be similarly stubbed or migrated as needed.

@app.get("/notebooks/{notebook_id}/chat_sessions/")
async def get_chat_sessions(notebook_id: str):
    """Get chat sessions for a notebook"""
    if not notebook_exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    # For simplicity, return a single session
    return [{"id": "default"}]

@app.get("/chat_sessions/{session_id}/messages/", response_model=List[ChatMessageResponse])
async def get_chat_messages(session_id: str):
    """Get chat messages for a session"""
    # For simplicity, return all messages from the first notebook
    # In a real implementation, you'd track sessions properly
    all_messages = []
    # This part needs to be updated to fetch messages from Supabase
    # For now, returning an empty list as a placeholder
    return []

@app.get("/notebooks/{notebook_id}/summary", response_model=StudyFeatureResponse)
async def get_summary(notebook_id: str):
    """Get existing summary for a notebook"""
    if not notebook_exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    try:
        # Get summary from summary table
        summary_res = supabase.table("summary").select("*").eq("notebook_id", notebook_id).execute()
        existing_summary = summary_res.data[0] if summary_res.data else None
        
        # Create a brief summary using MCP server
        summary_prompt = f"""
        Based on the uploaded documents for this notebook, create a brief 2-3 sentence summary of the syllabus content.
        Focus on the main topics and key concepts covered in the course materials.
        """
        
        # Use MCP client to generate brief summary
        async with mcp_pool.get_client() as client:
            result = await client.call_tool(
                tool_name="query_index_for_notebook_tool",
                arguments={"question": summary_prompt, "notebook_id": notebook_id}
            )
        
        if not result.content or len(result.content) == 0:
            syllabus_summary = "No syllabus content available for summarization."
        else:
            syllabus_summary = result.content[0].text
        
        # Combine syllabus summary with summary table data
        if existing_summary:
            summary_content = f"""
# Course Summary

## Syllabus Overview
{syllabus_summary}

## Course Statistics
- **Average GPA**: {existing_summary.get('average_gpa', 'N/A')}
- **Average Hours**: {existing_summary.get('average_hours', 'N/A')}
- **Professor Rating**: {existing_summary.get('prof_ratings', 'N/A')}/5.0
- **Course Rating**: {existing_summary.get('course_ratings', 'N/A')}/5.0
"""
        else:
            summary_content = f"""
# Course Summary

## Syllabus Overview
{syllabus_summary}

## Course Statistics
*No course statistics available yet.*
"""
        
        return StudyFeatureResponse(
            id=existing_summary["id"] if existing_summary else str(uuid.uuid4()),
            content=summary_content,
            created=existing_summary["created_at"] if existing_summary else datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Get summary error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get summary: {str(e)}")

@app.post("/notebooks/{notebook_id}/generate-summary/", response_model=StudyFeatureResponse)
async def generate_summary(notebook_id: str):
    """Generate a comprehensive summary for a notebook"""
    if not notebook_exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    try:
        # Get documents for this notebook
        res = supabase.table("documents").select("*").eq("notebook_id", notebook_id).eq("status", True).execute()
        documents = res.data or []
        
        if not documents:
            raise HTTPException(status_code=400, detail="No documents found for this notebook")
        
        # Get existing summary data
        summary_res = supabase.table("summary").select("*").eq("notebook_id", notebook_id).execute()
        existing_summary = summary_res.data[0] if summary_res.data else None
        
        # Create a brief summary prompt
        summary_prompt = f"""
        Based on the uploaded documents for this notebook, create a brief 2-3 sentence summary of the syllabus content.
        Focus on the main topics and key concepts covered in the course materials.
        Keep it concise and informative.
        """
        
        # Use MCP client to generate summary
        async with mcp_pool.get_client() as client:
            result = await client.call_tool(
                tool_name="query_index_for_notebook_tool",
                arguments={"question": summary_prompt, "notebook_id": notebook_id}
            )
        
        if not result.content or len(result.content) == 0:
            raise HTTPException(status_code=500, detail="Failed to generate summary")
        
        summary_content = result.content[0].text
        
        # Store/update the summary in the summary table
        summary_data = {
            "notebook_id": notebook_id,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        
        if existing_summary:
            # Update existing summary
            supabase.table("summary").update(summary_data).eq("id", existing_summary["id"]).execute()
            summary_id = existing_summary["id"]
        else:
            # Insert new summary
            summary_data["id"] = str(uuid.uuid4())
            supabase.table("summary").insert(summary_data).execute()
            summary_id = summary_data["id"]
        
        # Get the updated summary data to include in response
        updated_summary_res = supabase.table("summary").select("*").eq("id", summary_id).execute()
        updated_summary = updated_summary_res.data[0] if updated_summary_res.data else None
        
        # Combine syllabus summary with summary table data
        if updated_summary:
            full_summary_content = f"""
# Course Summary

## Syllabus Overview
{summary_content}

## Course Statistics
- **Average GPA**: {updated_summary.get('average_gpa', 'N/A')}
- **Average Hours**: {updated_summary.get('average_hours', 'N/A')}
- **Professor Rating**: {updated_summary.get('prof_ratings', 'N/A')}/5.0
- **Course Rating**: {updated_summary.get('course_ratings', 'N/A')}/5.0
"""
        else:
            full_summary_content = f"""
# Course Summary

## Syllabus Overview
{summary_content}

## Course Statistics
*No course statistics available yet.*
"""
        
        return StudyFeatureResponse(
            id=summary_id,
            content=full_summary_content,
            created=summary_data["created_at"]
        )
        
    except Exception as e:
        logger.error(f"Summary generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate summary: {str(e)}")

@app.post("/notebooks/{notebook_id}/generate-sample-exam/", response_model=StudyFeatureResponse)
async def generate_sample_exam(notebook_id: str):
    """Generate sample exam questions for a notebook"""
    if not notebook_exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    try:
        # Get documents for this notebook
        res = supabase.table("documents").select("*").eq("notebook_id", notebook_id).eq("status", True).execute()
        documents = res.data or []
        
        if not documents:
            raise HTTPException(status_code=400, detail="No documents found for this notebook")
        
        # Create a comprehensive prompt for exam generation
        exam_prompt = f"""
        Based on the uploaded documents for this notebook, generate exactly 5 comprehensive sample exam questions that would test understanding of the key concepts.

        The questions should:
        1. Cover different difficulty levels (easy, medium, hard)
        2. Test both factual knowledge and conceptual understanding
        3. Include multiple choice questions with 4 options each
        4. Focus on the most important topics from the documents
        5. Be specific to the content provided

        Format the response as:
        # Sample Exam Questions

        1. [Question]?
           A) [Option]
           B) [Option] 
           C) [Option]
           D) [Option]
           **Answer:** [Correct option]

        2. [Question]?
           A) [Option]
           B) [Option] 
           C) [Option]
           D) [Option]
           **Answer:** [Correct option]

        Continue this pattern for exactly 5 questions. Generate questions that would be appropriate for a midterm or final exam in this subject area.
        """
        
        # Use MCP client to generate exam questions
        async with mcp_pool.get_client() as client:
            result = await client.call_tool(
                tool_name="query_index_for_notebook_tool",
                arguments={"question": exam_prompt, "notebook_id": notebook_id}
            )
        
        if not result.content or len(result.content) == 0:
            raise HTTPException(status_code=500, detail="Failed to generate exam questions")
        
        exam_content = result.content[0].text
        
        return StudyFeatureResponse(
            id=str(uuid.uuid4()),
            content=exam_content,
            created=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Exam generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate exam: {str(e)}")

@app.post("/notebooks/{notebook_id}/generate-flashcards/", response_model=StudyFeatureResponse)
async def generate_flashcards(notebook_id: str):
    """Generate flashcards for a notebook"""
    if not notebook_exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    try:
        # Get documents for this notebook
        res = supabase.table("documents").select("*").eq("notebook_id", notebook_id).eq("status", True).execute()
        documents = res.data or []
        
        if not documents:
            raise HTTPException(status_code=400, detail="No documents found for this notebook")
        
        # Create a comprehensive prompt for flashcard generation
        flashcard_prompt = f"""
        Based on the uploaded documents for this notebook, generate 20-30 flashcards that cover the key concepts, definitions, and important facts.

        The flashcards should:
        1. Cover the most important concepts from the documents
        2. Include definitions, key terms, and important facts
        3. Be suitable for studying and memorization
        4. Focus on both factual knowledge and conceptual understanding
        5. Be clear and concise

        Format the response as:
        # Flashcards

        **Front:** [Question/Concept/Definition]
        **Back:** [Answer/Explanation]

        **Front:** [Question/Concept/Definition]
        **Back:** [Answer/Explanation]

        Continue this pattern for 20-30 flashcards covering the most important content from the documents.
        """
        
        # Use MCP client to generate flashcards
        async with mcp_pool.get_client() as client:
            result = await client.call_tool(
                tool_name="query_index_for_notebook_tool",
                arguments={"question": flashcard_prompt, "notebook_id": notebook_id}
            )
        
        if not result.content or len(result.content) == 0:
            raise HTTPException(status_code=500, detail="Failed to generate flashcards")
        
        flashcard_content = result.content[0].text
        
        return StudyFeatureResponse(
            id=str(uuid.uuid4()),
            content=flashcard_content,
            created=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Flashcard generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate flashcards: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=API_HOST, port=API_PORT, log_level="info") 