import os
import uuid
from typing import List, Dict, Optional, Union
from datetime import datetime
import json
from pathlib import Path

import os
from pinecone import Pinecone, ServerlessSpec
from openai import OpenAI
import uuid
from typing import List, Dict, Optional, Union
from datetime import datetime
import json
from pathlib import Path

from .database import supabase

class PineconeService:
    """Service for managing Pinecone vector store operations with a single index."""
    
    def __init__(self):
        self.pinecone_api_key = os.getenv("PINECONE_API_KEY")
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        
        if not self.pinecone_api_key:
            raise ValueError("PINECONE_API_KEY must be set")
        
        # Initialize Pinecone
        self.pc = Pinecone(api_key=self.pinecone_api_key)
        
        # Initialize OpenAI
        self.openai_client = OpenAI(api_key=self.openai_api_key)
        
        # Single index name for all notebooks
        self.index_name = "cramwell-index"
    
    def create_index_if_not_exists(self) -> str:
        """Create the main Pinecone index if it doesn't exist."""
        # Check if index exists
        existing_indexes = self.pc.list_indexes()
        
        if self.index_name not in existing_indexes.names():
            # Create new index
            self.pc.create_index(
                name=self.index_name,
                dimension=1536,  # OpenAI text-embedding-3-small embedding dimension
                metric="cosine",
                spec=ServerlessSpec(
                    cloud="aws",
                    region="us-east-1"
                )
            )
            print(f"Created Pinecone index: {self.index_name}")
        else:
            print(f"Using existing Pinecone index: {self.index_name}")
        
        return self.index_name
    
    def get_embedding(self, text: str) -> List[float]:
        """Get embedding for text using OpenAI."""
        response = self.openai_client.embeddings.create(
            input=text,
            model="text-embedding-3-small"
        )
        return response.data[0].embedding
    
    async def add_documents_to_notebook(
        self, 
        notebook_id: str, 
        documents: List[Dict],
        metadata: Optional[Dict] = None
    ) -> bool:
        """Add documents to the main index with notebook metadata filtering."""
        try:
            # Ensure index exists
            self.create_index_if_not_exists()
            index = self.pc.Index(self.index_name)
            
            # Prepare vectors for Pinecone
            vectors = []
            for i, doc in enumerate(documents):
                # Get embedding for document text
                embedding = self.get_embedding(doc['text'])
                
                # Create vector record with notebook_id in metadata
                vector = {
                    'id': f"{notebook_id}_{i}_{uuid.uuid4().hex[:8]}",
                    'values': embedding,
                    'metadata': {
                        'notebook_id': notebook_id,
                        'text': doc['text'],
                        'filename': doc.get('filename', 'unknown'),
                        'processed_at': datetime.now().isoformat()
                    }
                }
                vectors.append(vector)
            
            # Upsert vectors to Pinecone
            index.upsert(vectors=vectors)
            
            # Store document reference in database
            await self._store_document_reference(notebook_id, metadata)
            
            return True
            
        except Exception as e:
            print(f"Error adding documents to notebook {notebook_id}: {e}")
            import traceback
            traceback.print_exc()
            return False
        finally:
            # Force garbage collection after embedding generation
            import gc
            gc.collect()
    
    async def query_notebook(
        self, 
        notebook_id: str, 
        question: str,
        top_k: int = 5
    ) -> Optional[str]:
        """Query the main index with notebook metadata filtering."""
        try:
            # Ensure index exists
            self.create_index_if_not_exists()
            index = self.pc.Index(self.index_name)
            
            # Get embedding for the question
            question_embedding = self.get_embedding(question)
            
            # Query Pinecone with notebook_id filter
            query_response = index.query(
                vector=question_embedding,
                top_k=top_k,
                include_metadata=True,
                filter={"notebook_id": {"$eq": notebook_id}}
            )
            
            if not query_response.matches:
                return None
            
            # Get relevant documents
            relevant_docs = [match.metadata['text'] for match in query_response.matches]
            
            # Create context from relevant documents
            context = "\n\n".join(relevant_docs)
            
            # Generate response using OpenAI
            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that answers questions based on the provided context. Only use information from the context to answer questions. Format your responses using markdown for better readability. Use **bold** for emphasis, *italic* for important terms, and bullet points for lists."},
                    {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}\n\nAnswer:"}
                ],
                temperature=0.1,
                max_tokens=500
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            print(f"Error querying notebook {notebook_id}: {e}")
            return None
    
    async def delete_notebook_documents(self, notebook_id: str) -> bool:
        """Delete all documents for a specific notebook from the main index."""
        try:
            # Ensure index exists
            self.create_index_if_not_exists()
            index = self.pc.Index(self.index_name)
            
            # Delete all vectors with the specific notebook_id
            index.delete(filter={"notebook_id": {"$eq": notebook_id}})
            
            print(f"Deleted all documents for notebook {notebook_id}")
            
            # Remove from database
            await self._remove_document_reference(notebook_id)
            
            return True
            
        except Exception as e:
            print(f"Error deleting notebook documents {notebook_id}: {e}")
            return False
    
    async def _store_document_reference(self, notebook_id: str, metadata: Optional[Dict] = None):
        """Store document reference in database."""
        try:
            data = {
                "notebook_id": notebook_id,
                "index_name": self.index_name,
                "created_at": datetime.utcnow().isoformat(),
                "metadata": metadata or {}
            }
            
            # Store in Supabase (you can create a table for this)
            # For now, we'll just print it
            print(f"Stored document reference: {data}")
            
        except Exception as e:
            print(f"Error storing document reference: {e}")
    
    async def _remove_document_reference(self, notebook_id: str):
        """Remove document reference from database."""
        try:
            print(f"Removed document reference for notebook: {notebook_id}")
        except Exception as e:
            print(f"Error removing document reference: {e}")
    
    def list_notebooks(self) -> List[str]:
        """List all notebooks that have documents in the index."""
        try:
            # Ensure index exists
            self.create_index_if_not_exists()
            index = self.pc.Index(self.index_name)
            
            # Get all vectors and extract unique notebook_ids
            # Note: This is a simplified approach. In production, you might want to store this in a database
            stats = index.describe_index_stats()
            if hasattr(stats, 'namespaces') and stats.namespaces:
                return list(stats.namespaces.keys())
            else:
                return []
                
        except Exception as e:
            print(f"Error listing notebooks: {e}")
            return []

# Global instance
pinecone_service = PineconeService() 