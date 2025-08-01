from dotenv import load_dotenv
import pandas as pd
import json
import os
import uuid
import warnings
from datetime import datetime
import re
from jinja2 import Template, Environment, FileSystemLoader
from pathlib import Path

from pydantic import BaseModel, Field, model_validator
from openai import OpenAI
from openai.types.chat import ChatCompletionMessageParam as ChatMessage
from .pinecone_service import pinecone_service
from typing_extensions import override
from typing import List, Tuple, Union, Optional, Dict, cast
from typing_extensions import Self
from pyvis.network import Network
from .database import supabase


load_dotenv()

# Initialize Jinja2 environment for templating
def get_template_environment():
    """Get Jinja2 template environment."""
    template_dir = Path(__file__).parent / "prompts"
    return Environment(loader=FileSystemLoader(template_dir))

def format_response_with_template(raw_response: str, question: str) -> str:
    """
    Format the raw response using the response template.
    """
    try:
        env = get_template_environment()
        template = env.get_template("response_template.jinja")
        
        # Render the template with the response data
        formatted_response = template.render(
            question=question,
            raw_response=raw_response
        )
        
        return formatted_response
        
    except Exception as e:
        print(f"Error formatting response with template: {e}")
        # Fallback to simple formatting
        return f"**Answer:**\n\n{raw_response}\n\n---\n\n*This response is based on your uploaded documents.*"





class Node(BaseModel):
    id: str
    content: str


class Edge(BaseModel):
    from_id: str
    to_id: str


class MindMap(BaseModel):
    nodes: List[Node] = Field(
        description="List of nodes in the mind map, each represented as a Node object with an 'id' and concise 'content' (no more than 5 words).",
        examples=[
            [
                Node(id="A", content="Fall of the Roman Empire"),
                Node(id="B", content="476 AD"),
                Node(id="C", content="Barbarian invasions"),
            ],
            [
                Node(id="A", content="Auxin is released"),
                Node(id="B", content="Travels to the roots"),
                Node(id="C", content="Root cells grow"),
            ],
        ],
    )
    edges: List[Edge] = Field(
        description="The edges connecting the nodes of the mind map, as a list of Edge objects with from_id and to_id fields representing the source and target node IDs.",
        examples=[
            [
                Edge(from_id="A", to_id="B"),
                Edge(from_id="A", to_id="C"),
                Edge(from_id="B", to_id="C"),
            ],
            [
                Edge(from_id="C", to_id="A"),
                Edge(from_id="B", to_id="C"),
                Edge(from_id="A", to_id="B"),
            ],
        ],
    )

    @model_validator(mode="after")
    def validate_mind_map(self) -> Self:
        all_nodes = [el.id for el in self.nodes]
        all_edges = [el.from_id for el in self.edges] + [el.to_id for el in self.edges]
        if set(all_nodes).issubset(set(all_edges)) and set(all_nodes) != set(all_edges):
            raise ValueError(
                "There are non-existing nodes listed as source or target in the edges"
            )
        return self


class MindMapCreationFailedWarning(Warning):
    """A warning returned if the mind map creation failed"""


class ClaimVerification(BaseModel):
    claim_is_true: bool = Field(
        description="Based on the provided sources information, the claim passes or not."
    )
    supporting_citations: Optional[List[str]] = Field(
        description="A minimum of one and a maximum of three citations from the sources supporting the claim. If the claim is not supported, please leave empty",
        default=None,
        min_length=1,
        max_length=3,
    )

    @model_validator(mode="after")
    def validate_claim_ver(self) -> Self:
        if not self.claim_is_true and self.supporting_citations is not None:
            self.supporting_citations = ["The claim was deemed false."]
        return self


# Initialize OpenAI client
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize LLM for structured output (simplified for now)
LLM_STRUCT = openai_client
LLM_VERIFIER = openai_client

# Cache DocumentConverter at module level with memory-optimized settings
try:
    from docling.document_converter import DocumentConverter
    # Configure Docling with memory-optimized settings
    DOC_CONVERTER = DocumentConverter(
        # Use only one OCR engine instead of all 5 to reduce memory usage
        ocr_engines=['easyocr'],  # Reduces memory from ~1.5GB to ~300MB
        # Disable image processing to save memory
        with_images=False,
        # Force CPU-only processing to avoid GPU memory usage
        device='cpu'
    )
except Exception as e:
    DOC_CONVERTER = None
    print(f"Warning: Could not initialize DocumentConverter at startup: {e}")


async def parse_file(
    file_path: str, with_images: bool = False, with_tables: bool = False
) -> Union[Tuple[Optional[str], Optional[List[str]], Optional[List[pd.DataFrame]]]]:
    """
    Parse a file using Docling for better document processing.
    """
    images: Optional[List[str]] = None
    text: Optional[str] = None
    tables: Optional[List[pd.DataFrame]] = None
    
    try:
        # Use cached DocumentConverter
        if DOC_CONVERTER is None:
            from docling.document_converter import DocumentConverter
            from docling.datamodel.pipeline_options import PdfPipelineOptions
            from docling.datamodel.base_models import InputFormat
            from docling.backend.pypdfium2_backend import PyPdfiumDocumentBackend
            from docling.document_converter import (DocumentConverter,PdfFormatOption,WordFormatOption)

            pipeline_options = PdfPipelineOptions()
            pipeline_options.do_ocr = False
            pipeline_options.do_table_structure = True
            # Use memory-optimized settings for fallback converter
            converter = DocumentConverter(
                format_options={
                    InputFormat.PDF: PdfFormatOption(
                                        pipeline_options=pipeline_options, backend=PyPdfiumDocumentBackend), # pipeline options go here.
                }
            )
        else:
            converter = DOC_CONVERTER
        result = converter.convert(file_path)
        # Extract text content from markdown
        text = result.document.export_to_markdown()
        # Extract tables if requested
        if with_tables:
            tables = []
        # Extract images if requested
        if with_images:
            images = []
        return text, images, tables
    except Exception as e:
        print(f"Error parsing file {file_path}: {e}")
        import traceback
        traceback.print_exc()
        return None, None, None
    finally:
        # Do not delete the cached converter
        # Force garbage collection
        import gc
        gc.collect()


async def process_file(
    filename: str,
) -> Union[Tuple[str, None], Tuple[None, None], Tuple[str, str]]:
    """
    Process a file locally without using LlamaCloud.
    """
    # Resolve file path - try multiple locations
    file_path = filename
    possible_paths = [
        filename,  # Try as-is
        os.path.join(os.getcwd(), filename),  # Try from current working directory
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), filename),  # Try from project root
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            file_path = path
            break
    else:
        print(f"File not found: {filename}")
        print(f"Tried paths: {possible_paths}")
        return None, None
    
    text, _, _ = await parse_file(file_path=file_path)
    if text is None:
        return None, None
    
    # For now, return the text content directly
    # In the future, you could add local extraction logic here
    return "File processed successfully", text


async def get_mind_map(summary: str, highlights: List[str]) -> Union[str, None]:
    try:
        keypoints = "\n- ".join(highlights)
        messages = [
            {
                "role": "user",
                "content": f"This is the summary for my document: {summary}\n\nAnd these are the key points:\n- {keypoints}",
            }
        ]
        response = await LLM_STRUCT.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            response_format={"type": "json_object"}
        )
        response_json = json.loads(response.choices[0].message.content)
        net = Network(directed=True, height="750px", width="100%")
        net.set_options("""
            var options = {
            "physics": {
                "enabled": false
            }
            }
            """)
        nodes = response_json["nodes"]
        edges = response_json["edges"]
        for node in nodes:
            net.add_node(n_id=node["id"], label=node["content"])
        for edge in edges:
            net.add_edge(source=edge["from_id"], to=edge["to_id"])
        name = str(uuid.uuid4())
        net.save_graph(name + ".html")
        return name + ".html"
    except Exception as e:
        warnings.warn(
            message=f"An error occurred during the creation of the mind map: {e}",
            category=MindMapCreationFailedWarning,
        )
        return None


async def query_index(question: str) -> Union[str, None]:
    """
    Query the global index (placeholder for now).
    In the future, this could query a global Pinecone index.
    """
    return f"Query: {question}\n\nThis is a placeholder response. Use query_index_for_notebook for notebook-specific queries."


async def process_file_for_notebook(
    filename: str,
    notebook_id: str,
    document_type: str = "general_review",
) -> Union[Tuple[str, None], Tuple[None, None], Tuple[str, str]]:
    """
    Process a file and create embeddings specific to a notebook using Pinecone.
    This function processes the file and adds it to the notebook's Pinecone index.
    """
    text = None
    text_chunks = None
    documents = None
    try:
        # Resolve file path - try multiple locations
        file_path = filename
        possible_paths = [
            filename,  # Try as-is
            os.path.join(os.getcwd(), filename),  # Try from current working directory
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), filename),  # Try from project root
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                file_path = path
                break
        else:
            print(f"File not found: {filename}")
            return None, None
        
        # Parse the file to get text content using Docling
        text, _, _ = await parse_file(file_path=file_path)
        if text is None:
            print(f"Could not parse file: {file_path}")
            return None, None
        
        # Process text in chunks to reduce memory usage
        chunk_size = 10000  # Process 10KB chunks
        text_chunks = []
        
        for i in range(0, len(text), chunk_size):
            chunk = text[i:i + chunk_size]
            text_chunks.append(chunk)
        
        # Create document dict for Pinecone with chunked content
        documents = []
        for i, chunk in enumerate(text_chunks):
            document = {
                "text": chunk,
                "filename": os.path.basename(file_path),
                "notebook_id": notebook_id,
                "chunk_index": i,
                "total_chunks": len(text_chunks),
                "processed_at": datetime.now().isoformat()
            }
            documents.append(document)
        
        # Add documents to Pinecone index for this notebook
        success = await pinecone_service.add_documents_to_notebook(
            notebook_id=notebook_id,
            documents=documents,
            metadata={"filename": os.path.basename(file_path)}
        )
        
        # Store chunk count before cleanup
        chunk_count = len(text_chunks) if text_chunks else 0
        
        # Clean up large variables immediately
        if text is not None:
            del text
        if text_chunks is not None:
            del text_chunks
        if documents is not None:
            del documents
        
        if success:
            return "Document processed and added to notebook index", f"Processed {chunk_count} chunks"
        
        return None, None
        
    except Exception as e:
        print(f"Error processing file for notebook: {e}")
        import traceback
        traceback.print_exc()
        return None, None
    finally:
        # Clean up any remaining large variables - use try/except to handle unbound variables
        try:
            if 'text' in locals() and text is not None:
                del text
        except UnboundLocalError:
            pass
        try:
            if 'text_chunks' in locals() and text_chunks is not None:
                del text_chunks
        except UnboundLocalError:
            pass
        try:
            if 'documents' in locals() and documents is not None:
                del documents
        except UnboundLocalError:
            pass
        # Force garbage collection after processing
        import gc
        gc.collect()





async def query_index_for_notebook(question: str, notebook_id: str) -> Union[str, None]:
    """
    Query the Pinecone index for a specific notebook context.
    This function queries only documents from the specified notebook.
    """
    try:
        # Query the notebook-specific Pinecone index
        raw_response = await pinecone_service.query_notebook(notebook_id, question)
        
        if not raw_response:
            return None
        
        # Format the response using template
        formatted_response = format_response_with_template(raw_response, question)
        
        return formatted_response
        
    except Exception as e:
        print(f"Error in query_index_for_notebook: {e}")
        return None


async def get_plots_and_tables(
    file_path: str,
) -> Union[Tuple[Optional[List[str]], Optional[List[pd.DataFrame]]]]:
    # Resolve file path - try multiple locations
    resolved_path = file_path
    possible_paths = [
        file_path,  # Try as-is
        os.path.join(os.getcwd(), file_path),  # Try from current working directory
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), file_path),  # Try from project root
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            resolved_path = path
            break
    else:
        print(f"File not found: {file_path}")
        print(f"Tried paths: {possible_paths}")
        return None, None
    
    _, images, tables = await parse_file(
        file_path=resolved_path, with_images=True, with_tables=True
    )
    return images, tables


def verify_claim(
    claim: str,
    sources: str,
) -> Tuple[bool, Optional[List[str]]]:
    response = LLM_VERIFIER.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "user",
                "content": f"I have this claim: {claim} that is allegedly supported by these sources:\n\n'''\n{sources}\n'''\n\nCan you please tell me whether or not this claim is truthful and, if it is, identify one to three passages in the sources specifically supporting the claim?",
            }
        ],
        response_format={"type": "json_object"}
    )
    response_json = json.loads(response.choices[0].message.content)
    return response_json["claim_is_true"], response_json["supporting_citations"]
