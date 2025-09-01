import os
import uuid
from typing import List, Dict, Optional, Union
from datetime import datetime
import json
from pathlib import Path

from pinecone import Pinecone, ServerlessSpec
from openai import OpenAI

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
        else:
            pass
        
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
            import traceback
            traceback.print_exc()
            return False
        finally:
            # Force garbage collection after embedding generation
            import gc
            gc.collect()
    
    def _get_specialized_prompt(self, question: str) -> str:
        """Get specialized prompt based on question type"""
        question_lower = question.lower()
        
        # 1. Asking specific concept/content details
        if any(keyword in question_lower for keyword in ['what is', 'what are', 'define', 'definition', 'explain', 'meaning of', 'concept of', 'tell me about', 'describe', 'how does', 'what does', 'theory', 'principle', 'law of', 'model', 'framework']):
            return """You are a concept explanation specialist. Extract and explain specific academic concepts from course materials with tactical learning focus:

FIND AND EXPLAIN:
1. Precise definitions and key characteristics
2. Core principles and mechanisms
3. Real-world applications and examples from course materials
4. Relationship to other concepts in the course
5. Common misconceptions or tricky aspects mentioned by professor
6. Specific examples, case studies, or problems provided

RESPONSE FORMAT:
• **Core Definition**: [Precise definition from course materials]
• **Key Components**: [Essential parts/characteristics to understand]
• **Professor's Emphasis**: [What the instructor specifically highlights about this concept]
• **Learning Priority**: [Why this concept matters for exams/assignments - point value if mentioned]
• **Connection Points**: [How this links to other course topics]
• **Application Examples**: [Specific examples from course materials]

Focus on making complex concepts clear and highlighting what the professor emphasizes for exam success."""

        # 2. Grade optimization & Workload balance  
        elif any(keyword in question_lower for keyword in ['get an a', 'get a good grade', 'maximize grade', 'improve grade', 'boost grade', 'raise grade', 'better grade', 'higher grade', 'workload', 'time management', 'balance', 'schedule', 'manage time', 'efficient', 'priority', 'optimize']):
            return """You are a strategic grade optimization and workload management specialist. Analyze course materials for tactical advice:

EXTRACT AND PRIORITIZE:
1. Exact grading breakdown (percentages, points, weighting)
2. High-impact, low-effort opportunities (attendance policies, participation, extra credit)
3. Drop policies and grade calculation strategies
4. Time investment ROI analysis
5. Workload distribution and peak periods
6. Strategic resource allocation opportunities

RESPONSE FORMAT:
• **Grade Impact**: [Specific percentage/points] - [Effort level: Low/Medium/High]
• **Strategic Action**: [Exact steps to maximize grade efficiency]
• **Time Budget**: [Hours per week for different grade targets]
• **Quick Wins**: [Low-effort, high-impact opportunities]
• **Risk Management**: [Ways to protect your grade with minimal time]

Focus on game-theoretic thinking: maximum grade return for optimal time investment."""

        # 3. Specific Exam/Assignment Help (includes study strategy)
        elif any(keyword in question_lower for keyword in ['exam', 'test', 'quiz', 'midterm', 'final', 'assignment', 'homework', 'project', 'paper', 'essay', 'report', 'study', 'prepare', 'review', 'material', 'textbook', 'reading', 'due date', 'deadline', 'submit']):
            return """You are a tactical exam and assignment strategist. Extract specific guidance for academic performance:

ANALYZE FOR:
1. Exact exam formats, question types, and point distributions
2. Specific study materials and high-yield resources
3. Assignment requirements, rubrics, and success criteria
4. Professor hints, preferences, and grading patterns
5. Time allocation strategies based on point values
6. Past exam patterns and reused content
7. Submission requirements and penalty policies

RESPONSE FORMAT:
• **Priority Focus**: [Specific topics/materials] - [Points/percentage worth]
• **Study Strategy**: [Efficient preparation methods with time estimates]
• **Success Criteria**: [Exact requirements for A-level work]
• **Tactical Shortcuts**: [Professor-mentioned shortcuts or high-yield strategies]
• **Risk Mitigation**: [Common mistakes to avoid]
• **Resource Leverage**: [Office hours, TAs, study groups, practice materials]

Provide precise, time-efficient battle plans for academic success."""

        # 4. Default
        else:
            return """You are a strategic academic study assistant that provides specific, actionable "study hacking" advice based on course materials. Your goal is to give students concrete, tactical guidance that goes beyond generic study tips.

FOCUS ON SPECIFICITY:
- Extract exact percentages, point values, and grading breakdowns from syllabi
- Identify specific assignment types, due dates, and weighting
- Find concrete attendance policies, late submission penalties, and extra credit opportunities
- Look for professor preferences, exam formats, and study materials mentioned
- Note office hours, TA information, and resources explicitly mentioned

RESPONSE STYLE:
- Lead with the most actionable, specific advice
- Use numbers, percentages, and concrete details whenever possible
- Provide tactical shortcuts and optimization strategies
- Mention specific course policies that affect grades
- Include exact quotes from course materials when relevant
- Format as actionable bullet points with specific details

EXAMPLES OF GOOD RESPONSES:
❌ "Attend lectures regularly" 
✅ "Attendance is worth 10% of your grade - each missed class = -2% penalty, so perfect attendance gives you a 20-point buffer on other assignments"

❌ "Do the homework"
✅ "Homework is 30% of grade, but only your top 8 out of 10 scores count - you can skip 2 assignments without penalty if strategic"

❌ "Study for exams" 
✅ "Midterm = 25%, Final = 35%. Prof says 'I reuse 40% of questions from practice exams' - focus heavily on practice problems from pages 15-20 of the study guide"

When course materials don't provide specific details, acknowledge this and provide the best strategic advice possible based on typical academic patterns."""

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
            
            # Get specialized prompt based on question type
            system_prompt = self._get_specialized_prompt(question)
            
            # Generate response using OpenAI
            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Context from uploaded documents:\n{context}\n\nQuestion: {question}\n\nAnswer:"}
                ],
                temperature=0.1,
                max_completion_tokens=2000
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            return None
    
    async def delete_notebook_documents(self, notebook_id: str) -> bool:
        """Delete all documents for a specific notebook from the main index."""
        try:
            # Ensure index exists
            self.create_index_if_not_exists()
            index = self.pc.Index(self.index_name)
            
            # Delete all vectors with the specific notebook_id
            index.delete(filter={"notebook_id": {"$eq": notebook_id}})
            
            # Remove from database
            await self._remove_document_reference(notebook_id)
            
            return True
            
        except Exception as e:
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
            # For now, we'll just pass
            
        except Exception as e:
            pass
    
    async def _remove_document_reference(self, notebook_id: str):
        """Remove document reference from database."""
        try:
            pass
        except Exception as e:
            pass
    
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
            return []

# Global instance
pinecone_service = PineconeService() 