from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
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
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from .utils import process_file, query_index, process_file_for_notebook, query_index_for_notebook, get_cached_study_feature, cache_study_feature, clear_cached_study_feature
from .workflow import NotebookLMWorkflow, FileInputEvent, NotebookOutputEvent
from .database import supabase

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

load_dotenv()
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8001"))

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

# Initialize security
security = HTTPBearer(auto_error=False)

def sanitize_error_message(error: Exception) -> str:
    """
    Sanitize error messages to prevent sensitive information leakage.
    """
    error_str = str(error).lower()
    
    # Define safe error messages for different error types
    if any(keyword in error_str for keyword in ["file not found", "no such file", "file does not exist"]):
        return "File not found or inaccessible"
    elif any(keyword in error_str for keyword in ["permission denied", "access denied", "forbidden"]):
        return "Access denied"
    elif any(keyword in error_str for keyword in ["timeout", "timed out"]):
        return "Request timed out"
    elif any(keyword in error_str for keyword in ["memory", "out of memory"]):
        return "System resource limit exceeded"
    elif any(keyword in error_str for keyword in ["database", "sql", "connection"]):
        return "Database operation failed"
    elif any(keyword in error_str for keyword in ["api", "openai", "pinecone"]):
        return "External service unavailable"
    else:
        return "An internal error occurred"


async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Optional[str]:
    """
    Validate JWT token and return user ID.
    For now, this is a simplified implementation.
    In production, you should properly validate JWT tokens.
    """
    if not credentials:
        return None
    
    try:
        # For now, we'll use a simple token validation
        # In production, you should validate against Supabase Auth
        token = credentials.credentials
        
        # Simple token format validation (user_id:timestamp)
        if ":" in token:
            user_id = token.split(":")[0]
            # Add proper JWT validation here
            return user_id
        else:
            return None
    except Exception as e:
        return None


async def require_auth(user_id: Optional[str] = Depends(get_current_user)) -> Optional[str]:
    """
    Optional authentication for endpoints.
    Returns user_id if authenticated, None otherwise.
    """
    return user_id


async def verify_notebook_access(notebook_id: str, user_id: str) -> bool:
    """
    Verify that the user has access to the notebook.
    """
    try:
        # Check if the notebook belongs to the user
        res = supabase.table("notebooks").select("user_id").eq("id", notebook_id).single().execute()
        if res.data and res.data.get("user_id") == user_id:
            return True
        return False
    except Exception as e:
        return False

app = FastAPI(title="Cramwell API", version="1.0.0")

# Add rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Development
        "https://localhost:3000",  # Development HTTPS
        "https://cramwell.vercel.app",  # Production frontend (Vercel)
        "https://www.cramwell.ai",  # Production custom domain
        "https://cramwell.ai",  # Production custom domain (without www)
        "https://cramwell-backend.onrender.com",  # Production backend
        os.getenv("FRONTEND_URL", "https://cramwell.vercel.app"),  # Production frontend URL
        os.getenv("FRONTEND_URL_DEV", "http://localhost:3000"),  # Development frontend URL
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

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
            
            # Check memory usage
            import psutil
            process = psutil.Process()
            memory_mb = process.memory_info().rss / 1024 / 1024
            
            # If memory usage is high, force more aggressive cleanup
            if memory_mb > 1000:  # 1GB threshold
                gc.collect()
                
        except Exception as e:
            pass
        
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

class GeneralReviewRequest(BaseModel):
    takenYear: Optional[int] = None
    takenSemester: Optional[str] = None
    grade: Optional[str] = None
    courseReview: Optional[int] = None
    professorReview: Optional[int] = None
    inputHours: Optional[float] = None
    difficulty: Optional[str] = None
    additional_comment: Optional[str] = None

@app.get("/")
async def root():
    return {"message": "Cramwell API"}

@app.get("/notebooks/", response_model=List[NotebookResponse])
async def get_notebooks(user_id: Optional[str] = Depends(require_auth)):
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
async def create_notebook(request: CreateNotebookRequest, user_id: Optional[str] = Depends(require_auth)):
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
async def get_notebook(notebook_id: str, user_id: Optional[str] = Depends(require_auth)):
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
async def update_notebook(notebook_id: str, request: CreateNotebookRequest, user_id: Optional[str] = Depends(require_auth)):
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
async def delete_notebook(notebook_id: str, user_id: Optional[str] = Depends(require_auth)):
    """Delete a notebook from Supabase"""
    res = supabase.table("notebooks").delete().eq("id", notebook_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return {"message": "Notebook deleted successfully"}

# --- Sources, chat, and study features endpoints ---
# TODO: Migrate these to Supabase as well. For now, remove all in-memory checks and raise NotImplementedError or return empty lists.

@app.post("/notebooks/{notebook_id}/upload/", response_model=SourceResponse)
@limiter.limit("5/minute")
async def upload_source(request: Request, notebook_id: str, file: UploadFile = File(...), document_type: str = "course_files", user_id: Optional[str] = Depends(require_auth)):
    """Upload and process a file for a specific notebook"""
    if not notebook_exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    # Verify user has access to this notebook (optional for now)
    if user_id and not await verify_notebook_access(notebook_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied to this notebook")
    
    # Validate file type
    allowed_types = [".pdf", ".docx", ".txt", ".md", ".html", ".ppt", ".pptx", ".ipynb", ".xlsx", ".csv"]
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_types:
        raise HTTPException(status_code=400, detail=f"File type {file_ext} not supported. Allowed types: {allowed_types}")
    
    # Create temporary file and stream content with smaller chunks
    with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as temp_file:
        file_size = 0
        while chunk := await file.read(4096):  # Reduced from 8192 to 4096
            temp_file.write(chunk)
            file_size += len(chunk)
            if file_size > 25 * 1024 * 1024:  # 25MB
                temp_file.close()
                os.unlink(temp_file.name)
                raise HTTPException(status_code=400, detail="File too large. Maximum size is 25MB.")
        temp_file_path = temp_file.name
    
    try:
        # Process file directly
        result = await process_file_for_notebook(temp_file_path, notebook_id, document_type)
        
        if result[0] is None:
            raise HTTPException(status_code=400, detail="File could not be processed")
        
        # Parse the result
        notebook_model, text_content = result
        
        # Clean up large variables immediately
        del text_content
        del result
        
        # Clear cached study features since new content was added
        try:
            await clear_cached_study_feature(notebook_id, "summary")
            await clear_cached_study_feature(notebook_id, "exam")
            await clear_cached_study_feature(notebook_id, "flashcards")
        except Exception as e:
            pass
        
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
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        sanitized_error = sanitize_error_message(e)
        raise HTTPException(status_code=500, detail=sanitized_error)
    finally:
        # Clean up temporary file
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
        # Force garbage collection
        import gc
        gc.collect()


@app.post("/notebooks/{notebook_id}/general-review/")
async def save_general_review(notebook_id: str, review_request: GeneralReviewRequest, user_id: Optional[str] = Depends(require_auth)):
    """Save general review data for a specific notebook"""
    if not notebook_exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    # Verify user has access to this notebook (optional for now)
    if user_id and not await verify_notebook_access(notebook_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied to this notebook")
    
    try:
        now = datetime.now().isoformat()
        
        # Create document record for general review
        document_data = {
            "notebook_id": notebook_id,
            "document_type": "general_review",
            "document_name": f"Review_{now.split('T')[0]}",
            "document_path": "general_review_metadata",
            "file_size": 0,
            "document_info": {
                "mime_type": "application/json",
                "upload_timestamp": now
            },
            "status": True,
            "created_at": now,
            "updated_at": now
        }
        
        # Insert document record
        res = supabase.table("documents").insert(document_data).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create document record")
        
        document_id = res.data[0]["id"]
        
        # Create review data JSON
        review_data = {
            "document_id": document_id,
            "notebook_id": notebook_id,
            "taken_year": review_request.takenYear,
            "taken_semester": review_request.takenSemester,
            "grade": review_request.grade,
            "course_review": review_request.courseReview,
            "professor_review": review_request.professorReview,
            "input_hours": review_request.inputHours,
            "difficulty": review_request.difficulty,
            "additional_comment": review_request.additional_comment,
            "created_at": now
        }
        
        # Store review data in document_info field of documents table
        updated_document_info = document_data["document_info"].copy()
        updated_document_info["review_data"] = review_data
        
        supabase.table("documents").update({
            "document_info": updated_document_info
        }).eq("id", document_id).execute()
        
        # Create searchable text content from review data for Pinecone
        review_text_content = f"""Course Review Information:

Year Taken: {review_request.takenYear or 'Not specified'}
Semester: {review_request.takenSemester or 'Not specified'}
Grade Received: {review_request.grade or 'Not specified'}
Course Rating: {review_request.courseReview or 'Not rated'}/5
Professor Rating: {review_request.professorReview or 'Not rated'}/5
Hours Spent per Week: {review_request.inputHours or 'Not specified'}

Course Difficulty Assessment:
{review_request.difficulty or 'No difficulty assessment provided'}

Additional Student Comments:
{review_request.additional_comment or 'No additional comments provided'}

This is a student review containing valuable insights about course workload, difficulty level, and overall experience that can help other students understand what to expect from this course."""
        
        # Process through Pinecone for embeddings
        try:
            # Create document for Pinecone processing
            review_document = {
                "text": review_text_content,
                "filename": f"Course_Review_{review_request.takenSemester}_{review_request.takenYear}.json",
                "notebook_id": notebook_id,
                "chunk_index": 0,
                "total_chunks": 1,
                "processed_at": now
            }
            
            # Add to Pinecone index
            from .pinecone_service import pinecone_service
            success = await pinecone_service.add_documents_to_notebook(
                notebook_id=notebook_id,
                documents=[review_document],
                metadata={"filename": f"Course_Review_{review_request.takenSemester}_{review_request.takenYear}.json"}
            )
            
            if not success:
                logger.warning(f"Failed to add review to Pinecone index for notebook {notebook_id}")
            else:
                logger.info(f"Successfully added general review to Pinecone for notebook {notebook_id}")
                
        except Exception as e:
            logger.error(f"Error processing review for Pinecone: {e}")
            # Don't fail the entire request if Pinecone processing fails
            import traceback
            traceback.print_exc()
        
        return SourceResponse(
            id=document_id,
            title=f"Course Review - {review_request.takenSemester} {review_request.takenYear}",
            full_text=f"Course Review: {review_request.grade} grade, {review_request.courseReview}/5 course rating, {review_request.professorReview}/5 professor rating",
            created=now,
            updated=now
        )
        
    except Exception as e:
        sanitized_error = sanitize_error_message(e)
        raise HTTPException(status_code=500, detail=sanitized_error)


@app.post("/notebooks/{notebook_id}/chat/", response_model=ChatMessageResponse)
@limiter.limit("30/5 minutes")
async def send_chat_message(request: Request, notebook_id: str, chat_request: ChatMessageRequest):
    """Send a chat message for a specific notebook"""
    if not notebook_exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    try:
        # Query using notebook-specific context directly
        response_text = await query_index_for_notebook(chat_request.message, notebook_id)
        
        if not response_text:
            response_text = "Sorry, I was unable to find an answer to your question."
        
        # Get or create a chat session for this notebook
        now = datetime.now().isoformat()
        
        # Use the user_id from the request
        user_id = chat_request.user_id
        
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
            "content": chat_request.message,
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
        sanitized_error = sanitize_error_message(e)
        raise HTTPException(status_code=500, detail=sanitized_error)


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
        sanitized_error = sanitize_error_message(e)
        raise HTTPException(status_code=500, detail=sanitized_error)


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
        sanitized_error = sanitize_error_message(e)
        raise HTTPException(status_code=500, detail=sanitized_error)

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
        # Clear any existing cached summary to ensure fresh generation with assessment extraction
        await clear_cached_study_feature(notebook_id, "summary")
        
        # Get summary from summary table
        summary_res = supabase.table("summary").select("*").eq("notebook_id", notebook_id).execute()
        existing_summary = summary_res.data[0] if summary_res.data else None
        
        # Create a brief summary using direct pinecone query (avoid template formatting)
        summary_prompt = f"""
        Based on the uploaded documents for this notebook, create a brief 2-3 sentence summary of the syllabus content.
        Focus on the main topics and key concepts covered in the course materials.
        """
        
        # Extract assessment information from syllabus
        assessment_prompt = f"""
        Please examine the syllabus and course documents to find information about these specific assessments. 
        
        Respond in exactly this format:
        
        **Midterm:** [If midterms exist, state "Yes" and include count if specified (e.g. "Yes (2 exams)"). If no midterms mentioned, state "Not specified"]
        **Final:** [If final exam exists, state "Yes" and include any details about timing/format. If no final mentioned, state "Not specified"]  
        **Weekly Quiz:** [If weekly/regular quizzes exist, state "Yes" and include frequency/details. If no weekly quizzes mentioned, state "Not specified"]
        
        Only include information that is explicitly mentioned in the uploaded documents. Do not make assumptions.
        """
        
        # Use direct pinecone service to avoid template formatting
        from .pinecone_service import pinecone_service
        summary_content = await pinecone_service.query_notebook(notebook_id, summary_prompt)
        assessment_content = await pinecone_service.query_notebook(notebook_id, assessment_prompt)
        
        if not summary_content:
            raise HTTPException(status_code=500, detail="Failed to generate summary")
        
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

## Assessment Structure
{assessment_content if assessment_content else "*Assessment details not found in syllabus.*"}

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

## Assessment Structure
{assessment_content if assessment_content else "*Assessment details not found in syllabus.*"}

## Course Statistics
*No course statistics available yet.*
"""
        
        return StudyFeatureResponse(
            id=summary_id,
            content=full_summary_content,
            created=summary_data["created_at"]
        )
        
    except Exception as e:
        sanitized_error = sanitize_error_message(e)
        raise HTTPException(status_code=500, detail=sanitized_error)

@app.post("/notebooks/{notebook_id}/generate-summary/", response_model=StudyFeatureResponse)
@limiter.limit("10/minute")
async def generate_summary(request: Request, notebook_id: str):
    """Generate a comprehensive summary for a notebook"""
    if not notebook_exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    try:
        # Clear any existing cached summary to ensure fresh generation
        await clear_cached_study_feature(notebook_id, "summary")
        
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
        """
        
        # Extract assessment information from syllabus
        assessment_prompt = f"""
        Please examine the syllabus and course documents to find information about these specific assessments. 
        
        Respond in exactly this format:
        
        **Midterm:** [If midterms exist, state "Yes" and include count if specified (e.g. "Yes (2 exams)"). If no midterms mentioned, state "Not specified"]
        **Final:** [If final exam exists, state "Yes" and include any details about timing/format. If no final mentioned, state "Not specified"]  
        **Weekly Quiz:** [If weekly/regular quizzes exist, state "Yes" and include frequency/details. If no weekly quizzes mentioned, state "Not specified"]
        
        Only include information that is explicitly mentioned in the uploaded documents. Do not make assumptions.
        """
        
        # Use direct pinecone service to avoid template formatting
        from .pinecone_service import pinecone_service
        summary_content = await pinecone_service.query_notebook(notebook_id, summary_prompt)
        assessment_content = await pinecone_service.query_notebook(notebook_id, assessment_prompt)
        
        if not summary_content:
            raise HTTPException(status_code=500, detail="Failed to generate summary")
        
        # Combine summary and assessment information
        combined_summary = f"""
# Course Summary

## Syllabus Overview
{summary_content}

## Assessment Structure
{assessment_content if assessment_content else "*Assessment details not found in syllabus.*"}
"""
        
        # Cache the generated summary
        await cache_study_feature(notebook_id, "summary", combined_summary)
        
        return StudyFeatureResponse(
            id=str(uuid.uuid4()),
            content=combined_summary,
            created=datetime.now().isoformat()
        )
        
    except Exception as e:
        sanitized_error = sanitize_error_message(e)
        raise HTTPException(status_code=500, detail=sanitized_error)

@app.post("/notebooks/{notebook_id}/generate-sample-exam/", response_model=StudyFeatureResponse)
@limiter.limit("10/minute")
async def generate_sample_exam(request: Request, notebook_id: str):
    """Generate sample exam questions for a notebook"""
    if not notebook_exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    try:
        # Check if exam is already cached
        cached_exam = await get_cached_study_feature(notebook_id, "exam")
        if cached_exam:
            return StudyFeatureResponse(
                id=str(uuid.uuid4()),
                content=cached_exam,
                created=datetime.now().isoformat()
            )
        
        # Get documents for this notebook
        res = supabase.table("documents").select("*").eq("notebook_id", notebook_id).eq("status", True).execute()
        documents = res.data or []
        
        if not documents:
            raise HTTPException(status_code=400, detail="No documents found for this notebook")
        
        # Create a comprehensive prompt for exam generation
        exam_prompt = f"""
        Based on the uploaded documents for this notebook, generate exactly 10 comprehensive sample exam questions that would test understanding of the key concepts.

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

        Continue this pattern for exactly 10 questions. Generate questions that would be appropriate for a midterm or final exam in this subject area.
        """
        
        # Use direct function to generate exam questions
        exam_content = await query_index_for_notebook(exam_prompt, notebook_id)
        
        if not exam_content:
            raise HTTPException(status_code=500, detail="Failed to generate exam questions")
        
        # Cache the generated exam
        await cache_study_feature(notebook_id, "exam", exam_content)
        
        return StudyFeatureResponse(
            id=str(uuid.uuid4()),
            content=exam_content,
            created=datetime.now().isoformat()
        )
        
    except Exception as e:
        sanitized_error = sanitize_error_message(e)
        raise HTTPException(status_code=500, detail=sanitized_error)

@app.post("/notebooks/{notebook_id}/generate-flashcards/", response_model=StudyFeatureResponse)
@limiter.limit("10/minute")
async def generate_flashcards(request: Request, notebook_id: str):
    """Generate flashcards for a notebook"""
    if not notebook_exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    try:
        # Check if flashcards are already cached
        cached_flashcards = await get_cached_study_feature(notebook_id, "flashcards")
        if cached_flashcards:
            return StudyFeatureResponse(
                id=str(uuid.uuid4()),
                content=cached_flashcards,
                created=datetime.now().isoformat()
            )
        
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
        
        # Use direct function to generate flashcards
        flashcard_content = await query_index_for_notebook(flashcard_prompt, notebook_id)
        
        if not flashcard_content:
            raise HTTPException(status_code=500, detail="Failed to generate flashcards")
        
        # Cache the generated flashcards
        await cache_study_feature(notebook_id, "flashcards", flashcard_content)
        
        return StudyFeatureResponse(
            id=str(uuid.uuid4()),
            content=flashcard_content,
            created=datetime.now().isoformat()
        )
        
    except Exception as e:
        sanitized_error = sanitize_error_message(e)
        raise HTTPException(status_code=500, detail=sanitized_error)


@app.delete("/notebooks/{notebook_id}/clear-cache/")
async def clear_study_features_cache(notebook_id: str, feature_type: Optional[str] = None):
    """Clear cached study features for a notebook"""
    if not notebook_exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    try:
        if feature_type:
            # Clear specific feature type
            if feature_type not in ["summary", "exam", "flashcards"]:
                raise HTTPException(status_code=400, detail="Invalid feature type. Must be 'summary', 'exam', or 'flashcards'")
            
            success = await clear_cached_study_feature(notebook_id, feature_type)
            if success:
                return {"message": f"Cleared {feature_type} cache for notebook {notebook_id}"}
            else:
                raise HTTPException(status_code=500, detail=f"Failed to clear {feature_type} cache")
        else:
            # Clear all feature types
            success_summary = await clear_cached_study_feature(notebook_id, "summary")
            success_exam = await clear_cached_study_feature(notebook_id, "exam")
            success_flashcards = await clear_cached_study_feature(notebook_id, "flashcards")
            
            if success_summary and success_exam and success_flashcards:
                return {"message": f"Cleared all study features cache for notebook {notebook_id}"}
            else:
                raise HTTPException(status_code=500, detail="Failed to clear some or all cached features")
                
    except Exception as e:
        sanitized_error = sanitize_error_message(e)
        raise HTTPException(status_code=500, detail=sanitized_error)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=API_HOST, port=API_PORT, log_level="info") 