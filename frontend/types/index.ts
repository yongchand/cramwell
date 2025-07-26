export interface Notebook {
  id: string
  name: string
  description: string
  created: string
  updated: string
  archived?: boolean
}

export interface Source {
  id: string
  title?: string
  full_text?: string
  created: string
  updated: string
}

export interface Note {
  id: string
  title?: string
  content?: string
  note_type?: 'human' | 'ai'
  created: string
  updated: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface CreateNotebookRequest {
  name: string
  description: string
  file?: File
}

export interface UploadSourceRequest {
  notebookId: string
  file: File
}

export interface ChatRequest {
  notebookId: string
  message: string
} 