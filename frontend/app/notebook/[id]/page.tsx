'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Send, Upload, ArrowLeft, ChevronLeft, ChevronRight, FileText, MessageSquare, BookOpen, HelpCircle, FileText as FileTextIcon, Share2, Check, Plus, History, Trash2, Menu, Share, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { UploadDialog } from '@/components/upload-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { createClient } from '@/utils/supabase/client'
import ReactMarkdown from 'react-markdown'
import { CourseStatsCharts } from '@/components/CourseStatsPieChart'

interface Notebook {
  id: string
  name: string
  description: string
  created: string
  updated: string
  archived: boolean
}

interface Source {
  id: string
  title?: string
  full_text?: string
  created: string
  updated: string
  review_data?: {
    document_id: string
    notebook_id: string
    taken_year?: number
    taken_semester?: string
    grade?: string
    course_review?: number
    professor_review?: number
    input_hours?: number
    created_at: string
  } | null
}

interface ChatSession {
  id: string
  user_id: string
  notebook_id: string
  active: boolean
  created_at: string
}

interface ChatMessage {
  id: string
  session_id: string
  user_id?: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

interface StudyFeature {
  id: string
  content: string
  created: string
}

interface Flashcard {
  front: string
  back: string
}

interface ExamQuestion {
  question: string
  options: string[]
  correctAnswer: number
  explanation?: string
}

export default function NotebookPage() {
  const params = useParams()
  const router = useRouter()
  const notebookId = params.id as string
  const { toast } = useToast()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const [notebook, setNotebook] = useState<Notebook | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [activeTab, setActiveTab] = useState<'exam' | 'flashcards' | 'documents' | 'summary'>('summary')
  const [studyFeatures, setStudyFeatures] = useState<{
    exam?: StudyFeature
    flashcards?: StudyFeature
    summary?: StudyFeature
  }>({})
  const [summaryStats, setSummaryStats] = useState<{
    average_gpa?: number
    average_hours?: number
    prof_ratings?: number
    course_ratings?: number
  }>({})
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([])
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: number }>({})
  const [showAnswers, setShowAnswers] = useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionsDialogOpen, setSessionsDialogOpen] = useState(false)
  const [pastSessions, setPastSessions] = useState<ChatSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)

  const [isHoveringLeft, setIsHoveringLeft] = useState(false)
  const [showFloatingButtons, setShowFloatingButtons] = useState(false)

  useEffect(() => {
    loadNotebook()
    loadSources()
    loadChatHistory()
    loadSummary()
  }, [notebookId])

  // Handle hover for floating buttons
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const leftEdge = 100 // pixels from left edge
      if (e.clientX <= leftEdge) {
        setShowFloatingButtons(true)
      } else {
        setShowFloatingButtons(false)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    return () => document.removeEventListener('mousemove', handleMouseMove)
  }, [])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadNotebook = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/notebooks/${notebookId}`)
      if (!response.ok) {
        throw new Error('Notebook not found')
      }
      const data = await response.json()
      setNotebook(data)
    } catch (error) {
      console.error('Failed to load notebook:', error)
      toast({
        title: "Error",
        description: "Failed to load notebook",
        variant: "destructive",
      })
      router.push('/')
    }
  }

  const loadSources = async () => {
    try {
      const supabase = createClient()
      const { data: documents, error } = await supabase
        .from('documents')
        .select(`
          id,
          document_name,
          document_type,
          document_path,
          file_size,
          document_info,
          created_at,
          updated_at
        `)
        .eq('notebook_id', notebookId)
        .eq('status', true)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Transform documents to Source format and fetch review data
      const sources = await Promise.all((documents || []).map(async (doc) => {
        let reviewData = null;
        
        // Try to fetch review metadata for general_review documents
        if (doc.document_type === 'general_review') {
          try {
            const reviewFileName = `review_${doc.id}.json`;
            const reviewFilePath = `private/${notebookId}/reviews/${reviewFileName}`;
            
            const { data: reviewFile, error: reviewError } = await supabase.storage
              .from('documents')
              .download(reviewFilePath);
            
            if (!reviewError && reviewFile) {
              const reviewText = await reviewFile.text();
              reviewData = JSON.parse(reviewText);
            }
          } catch (e) {
            console.warn(`Failed to load review data for ${doc.document_name}:`, e);
          }
        }

        return {
          id: doc.id,
          title: doc.document_name,
          full_text: `Document: ${doc.document_name} (${doc.document_type})`,
          created: doc.created_at,
          updated: doc.updated_at,
          review_data: reviewData
        };
      }));

      setSources(sources)
    } catch (error) {
      console.error('Failed to load sources:', error)
      toast({
        title: "Error",
        description: "Failed to load documents",
        variant: "destructive",
      })
    }
  }

  const loadSummary = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/notebooks/${notebookId}/summary`)
      if (response.ok) {
        const data = await response.json()
        if (data) {
          setStudyFeatures(prev => ({
            ...prev,
            summary: data
          }))
          
          // Extract statistics from the summary content
          const content = data.content || ''
          const statsMatch = content.match(/\*\*Average GPA\*\*: ([\d.]+)/)
          const hoursMatch = content.match(/\*\*Average Hours\*\*: ([\d.]+)/)
          const profMatch = content.match(/\*\*Professor Rating\*\*: ([\d.]+)\/5\.0/)
          const courseMatch = content.match(/\*\*Course Rating\*\*: ([\d.]+)\/5\.0/)
          
          const stats = {
            average_gpa: statsMatch ? parseFloat(statsMatch[1]) : undefined,
            average_hours: hoursMatch ? parseFloat(hoursMatch[1]) : undefined,
            prof_ratings: profMatch ? parseFloat(profMatch[1]) : undefined,
            course_ratings: courseMatch ? parseFloat(courseMatch[1]) : undefined
          }
          
          console.log('Extracted stats:', stats)
          console.log('Content:', content)
          console.log('Matches:', { statsMatch, hoursMatch, profMatch, courseMatch })
          
          setSummaryStats(stats)
        }
      } else if (response.status === 404) {
        // No summary exists yet, that's okay
        console.log('No existing summary found')
      }
    } catch (error) {
      console.error('Error loading summary:', error)
    }
  }

  const loadChatHistory = async () => {
    try {
      setSessionLoading(true)
      const supabase = createClient()
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id
      if (!userId) return

      // Get or create the newest active chat session for this user and notebook
      let { data: session, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('notebook_id', notebookId)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!session) {
        // Create new session if none exists
        const { data: newSession, error: createError } = await supabase
          .from('chat_sessions')
          .insert({ user_id: userId, notebook_id: notebookId, active: true })
          .select()
          .single()
        if (createError) throw createError
        session = newSession
      }

      setCurrentSession(session)

      // Load messages for this session
      const { data: messages, error: messagesError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true })

      if (messagesError) throw messagesError
      setMessages(messages || [])
    } catch (error) {
      console.error('Failed to load chat history:', error)
      toast({
        title: "Error",
        description: "Failed to load chat history",
        variant: "destructive",
      })
    } finally {
      setSessionLoading(false)
    }
  }

  const createNewSession = async () => {
    try {
      const supabase = createClient()
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id
      if (!userId) return

      // Create new session
      const { data: newSession, error } = await supabase
        .from('chat_sessions')
        .insert({ user_id: userId, notebook_id: notebookId, active: true })
        .select()
        .single()

      if (error) throw error

      setCurrentSession(newSession)
      setMessages([])
      toast({
        title: "New Chat Session",
        description: "Started a new chat session",
      })
    } catch (error) {
      console.error('Failed to create new session:', error)
      toast({
        title: "Error",
        description: "Failed to create new session",
        variant: "destructive",
      })
    }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || isSending || !currentSession) return

    try {
      setIsSending(true)
      const supabase = createClient()
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id
      if (!userId) throw new Error("User not authenticated")

      // Add user message immediately to UI (optimistic update)
      const userMessage: ChatMessage = {
        id: 'temp-user-' + Date.now(), // Temporary ID for UI
        session_id: currentSession.id,
        user_id: userId, // Use the same user_id as chat_sessions
        role: 'user',
        content: newMessage,
        created_at: new Date().toISOString()
      }
      setMessages(prev => [...prev, userMessage])

      // Send to API for processing
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/notebooks/${notebookId}/chat/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: newMessage,
          user_id: userId
        })
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      const result = await response.json()
      
      // Add assistant response to UI
      const assistantMessage: ChatMessage = {
        id: 'temp-assistant-' + Date.now(), // Temporary ID for UI
        session_id: currentSession.id,
        user_id: undefined, // Assistant messages don't have user_id
        role: 'assistant',
        content: result.content || result.message || 'No response received',
        created_at: new Date().toISOString()
      }
      setMessages(prev => [...prev, assistantMessage])
      
      setNewMessage('')
    } catch (error) {
      console.error('Failed to send message:', error)
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      })
    } finally {
      setIsSending(false)
    }
  }

  const handleFileUpload = async (files: FileList | File[], kind: string, metadata?: any) => {
    if (!files || files.length === 0) return;

    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB limit
    const ALLOWED_TYPES = /\.(pdf|doc|docx|pptx|ppt)$/i;

    const formatFileSize = (bytes: number) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Show upload started toast
    toast({
      title: "Upload Started",
      description: `Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`,
    });

    // Validate file types
    const invalidTypeFiles = Array.from(files).filter(file =>
      !file.name.match(ALLOWED_TYPES)
    );

    if (invalidTypeFiles.length > 0) {
      toast({
        title: "Invalid file type",
        description: `Please upload only PDF, DOC, DOCX, PPT, or PPTX files. Invalid files: ${invalidTypeFiles.map(f => f.name).join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    // Validate file sizes
    const oversizedFiles = Array.from(files).filter(file =>
      file.size > MAX_FILE_SIZE
    );

    if (oversizedFiles.length > 0) {
      toast({
        title: "File too large",
        description: `Files must be under 25MB. Large files: ${oversizedFiles.map(f => `${f.name} (${formatFileSize(f.size)})`).join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    try {
      console.log('handleFileUpload: Starting upload process');
      setIsUploading(true);
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("User not authenticated");
      console.log('handleFileUpload: User authenticated, userId:', userId);

      const uploadedFiles = [];
      const duplicateFiles = [];

      // Upload files one by one to Supabase Storage and store metadata
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = `private/${notebookId}/${userId}/${kind}/${file.name}`;
        
        // For general_review, skip file upload and only save metadata
        if (kind === 'general_review') {
          console.log('handleFileUpload: General review - skipping file upload, saving metadata only');
          
          // Create a placeholder document record for general review
          const documentDataToInsert: any = {
            notebook_id: notebookId,
            document_type: kind,
            document_name: `Review_${new Date().toISOString().split('T')[0]}`,
            document_path: `general_review_metadata`,
            file_size: 0,
            document_info: {
              mime_type: 'application/json',
              upload_timestamp: new Date().toISOString()
            }
          };

          const { data: documentData, error: documentError } = await supabase
            .from('documents')
            .insert(documentDataToInsert)
            .select()
            .single();

          if (documentError) {
            throw new Error(`Failed to store review metadata: ${documentError.message}`);
          }

          // Save review metadata as JSON file in S3
          if (metadata) {
            const reviewData = {
              document_id: documentData.id,
              notebook_id: notebookId,
              taken_year: metadata.takenYear,
              taken_semester: metadata.takenSemester,
              grade: metadata.grade,
              course_review: metadata.courseReview,
              professor_review: metadata.professorReview,
              input_hours: metadata.inputHours,
              created_at: new Date().toISOString()
            };

            const reviewFileName = `review_${documentData.id}.json`;
            const reviewFilePath = `private/${notebookId}/${userId}/reviews/${reviewFileName}`;
            
            // Upload review metadata as JSON file
            const { error: reviewError } = await supabase.storage
              .from('documents')
              .upload(reviewFilePath, new Blob([JSON.stringify(reviewData, null, 2)], { type: 'application/json' }), { upsert: false });
            
            if (reviewError) {
              console.warn(`Failed to save review metadata: ${reviewError.message}`);
            } else {
              console.log(`Successfully saved review metadata`);
            }
          }

          uploadedFiles.push(`Review_${new Date().toISOString().split('T')[0]}`);
          continue;
        }

        // Check for duplicate by name, size, and path
        const { data: existingDocs } = await supabase
          .from('documents')
          .select('document_name, file_size, document_path')
          .eq('notebook_id', notebookId)
          .eq('document_name', file.name)
          .eq('file_size', file.size);

        if (existingDocs && existingDocs.length > 0) {
          duplicateFiles.push(file.name);
          continue; // Skip this file
        }
        
        // Upload to storage
        const { error: storageError } = await supabase.storage
          .from('documents')
          .upload(filePath, file, { upsert: false });
        if (storageError) {
          throw new Error(`Failed to upload ${file.name}: ${storageError.message}`);
        }

        // Store document metadata in database
        const documentDataToInsert: any = {
          notebook_id: notebookId,
          document_type: kind,
          document_name: file.name,
          document_path: filePath,
          file_size: file.size,
          document_info: {
            mime_type: file.type,
            last_modified: file.lastModified,
            upload_timestamp: new Date().toISOString()
          }
        };

        const { data: documentData, error: documentError } = await supabase
          .from('documents')
          .insert(documentDataToInsert)
          .select()
          .single();

        if (documentError) {
          throw new Error(`Failed to store document metadata for ${file.name}: ${documentError.message}`);
        }

        // Create upload_documents record (optional - skip if table doesn't exist)
        try {
          const { error: uploadError } = await supabase
            .from('upload_documents')
            .insert({
              document_id: documentData.id,
              user_id: userId
            });

          if (uploadError) {
            console.warn(`Failed to create upload record for ${file.name}: ${uploadError.message}`);
          }
        } catch (uploadException) {
          console.warn(`Exception creating upload record for ${file.name}:`, uploadException);
        }

        uploadedFiles.push(file.name);
      }

      // Process uploaded files through the backend API to add them to Pinecone
      if (uploadedFiles.length > 0 && kind !== 'general_review') {
        console.log('handleFileUpload: Processing files through backend API');
        
        for (const fileName of uploadedFiles) {
          try {
            // Get the file from the uploaded files array
            const file = Array.from(files).find(f => f.name === fileName);
            if (!file) {
              console.warn(`File not found for processing: ${fileName}`);
              continue;
            }

            // Create FormData to send the file to the backend
            const formData = new FormData();
            formData.append('file', file);

            console.log(`Processing file: ${fileName} for notebook: ${notebookId}`);
            
            // Call the backend API to process the file and add to Pinecone
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/notebooks/${notebookId}/upload/?document_type=${kind}`, {
              method: 'POST',
              body: formData,
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error(`Failed to process file ${fileName}: ${response.status} ${errorText}`);
              throw new Error(`Failed to process file ${fileName}: ${errorText}`);
            }

            const result = await response.json();
            console.log(`Successfully processed file ${fileName}:`, result);
            
          } catch (error) {
            console.error(`Error processing file ${fileName}:`, error);
            // Don't fail the entire upload, just log the error
            toast({
              title: "Warning",
              description: `File ${fileName} was uploaded but failed to process for chat: ${error instanceof Error ? error.message : 'Unknown error'}`,
              variant: "destructive",
            });
          }
        }
      }

      // Handle case where no files are provided for general_review
      if (kind === 'general_review' && files.length === 0 && metadata) {
        console.log('handleFileUpload: General review with no files - saving metadata only');
        
        // Create a placeholder document record for general review
        const documentDataToInsert: any = {
          notebook_id: notebookId,
          document_type: kind,
          document_name: `Review_${new Date().toISOString().split('T')[0]}`,
          document_path: `general_review_metadata`,
          file_size: 0,
          document_info: {
            mime_type: 'application/json',
            upload_timestamp: new Date().toISOString()
          }
        };

        const { data: documentData, error: documentError } = await supabase
          .from('documents')
          .insert(documentDataToInsert)
          .select()
          .single();

        if (documentError) {
          throw new Error(`Failed to store review metadata: ${documentError.message}`);
        }

        // Save review metadata as JSON file in S3
        const reviewData = {
          document_id: documentData.id,
          notebook_id: notebookId,
          taken_year: metadata.takenYear,
          taken_semester: metadata.takenSemester,
          grade: metadata.grade,
          course_review: metadata.courseReview,
          professor_review: metadata.professorReview,
          input_hours: metadata.inputHours,
          created_at: new Date().toISOString()
        };

        const reviewFileName = `review_${documentData.id}.json`;
        const reviewFilePath = `private/${notebookId}/${userId}/reviews/${reviewFileName}`;
        
        // Upload review metadata as JSON file
        const { error: reviewError } = await supabase.storage
          .from('documents')
          .upload(reviewFilePath, new Blob([JSON.stringify(reviewData, null, 2)], { type: 'application/json' }), { upsert: false });
        
        if (reviewError) {
          console.warn(`Failed to save review metadata: ${reviewError.message}`);
        } else {
          console.log(`Successfully saved review metadata`);
        }

        uploadedFiles.push(`Review_${new Date().toISOString().split('T')[0]}`);
      }

      // Show results
      let successMessage = "";
      if (uploadedFiles.length > 0) {
        successMessage += `${uploadedFiles.length} file${uploadedFiles.length > 1 ? 's' : ''} uploaded successfully.`;
      }
      
      if (duplicateFiles.length > 0) {
        successMessage += ` ${duplicateFiles.length} duplicate${duplicateFiles.length > 1 ? 's' : ''} skipped: ${duplicateFiles.join(', ')}`;
      }

      toast({
        title: uploadedFiles.length > 0 ? "Upload Complete" : "No New Files Uploaded",
        description: successMessage || "All files were duplicates",
        variant: uploadedFiles.length > 0 ? "default" : "destructive",
      });

      // Reload sources to show new documents
      if (uploadedFiles.length > 0) {
        console.log('handleFileUpload: Reloading sources');
        await loadSources();
      }
      console.log('handleFileUpload: Upload process completed successfully');
    } catch (error: any) {
      console.error('Failed to upload files:', error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload and process documents",
        variant: "destructive",
      });
    } finally {
      console.log('handleFileUpload: Setting isUploading to false');
      setIsUploading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const parseFlashcards = (content: string): Flashcard[] => {
    const flashcards: Flashcard[] = []
    const lines = content.split('\n')
    
    let currentFront = ''
    let currentBack = ''
    let inFlashcard = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      // Skip empty lines and headers
      if (!line || line.startsWith('#') || line.startsWith('##')) {
        continue
      }
      
      // Check for **Front:** marker
      if (line.includes('**Front:**')) {
        // If we have a previous flashcard, save it
        if (currentFront && currentBack) {
          flashcards.push({ front: currentFront, back: currentBack })
        }
        
        // Start new flashcard
        currentFront = line.replace('**Front:**', '').trim()
        currentBack = ''
        inFlashcard = true
      }
      // Check for **Back:** marker
      else if (line.includes('**Back:**') && inFlashcard) {
        currentBack = line.replace('**Back:**', '').trim()
        // Complete the flashcard
        if (currentFront && currentBack) {
          flashcards.push({ front: currentFront, back: currentBack })
          currentFront = ''
          currentBack = ''
          inFlashcard = false
        }
      }
      // Handle multi-line content
      else if (inFlashcard && line) {
        if (!currentBack) {
          // Still building the front
          currentFront += ' ' + line
        } else {
          // Building the back
          currentBack += ' ' + line
        }
      }
    }
    
    // Don't forget the last flashcard
    if (currentFront && currentBack) {
      flashcards.push({ front: currentFront, back: currentBack })
    }
    
    // Fallback to old format if no flashcards found
    if (flashcards.length === 0) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.startsWith('Front:') && line.includes('|')) {
          // Handle format: "Front: [question] | Back: [answer]"
          const parts = line.split('|')
          if (parts.length === 2) {
            const front = parts[0].replace('Front:', '').trim()
            const back = parts[1].replace('Back:', '').trim()
            flashcards.push({ front, back })
          }
        } else if (line.startsWith('Front:') && i + 1 < lines.length) {
          // Handle format: "Front: [question]\nBack: [answer]"
          const front = line.replace('Front:', '').trim()
          const nextLine = lines[i + 1].trim()
          if (nextLine.startsWith('Back:')) {
            const back = nextLine.replace('Back:', '').trim()
            flashcards.push({ front, back })
          }
        }
      }
    }
    
    return flashcards
  }

  const parseExamQuestions = (content: string): ExamQuestion[] => {
    const questions: ExamQuestion[] = []
    const lines = content.split('\n')
    
    let currentQuestion = ''
    let currentOptions: string[] = []
    let currentCorrectAnswer = -1
    let currentExplanation = ''
    let inQuestion = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      // Skip empty lines and headers
      if (!line || line.startsWith('#') || line.startsWith('##')) {
        continue
      }
      
      // Check for question number
      if (/^\d+\./.test(line)) {
        // Save previous question if exists
        if (currentQuestion && currentOptions.length > 0) {
          questions.push({
            question: currentQuestion,
            options: currentOptions,
            correctAnswer: currentCorrectAnswer,
            explanation: currentExplanation
          })
        }
        
        // Start new question
        currentQuestion = line.replace(/^\d+\./, '').trim()
        currentOptions = []
        currentCorrectAnswer = -1
        currentExplanation = ''
        inQuestion = true
      }
      // Check for options A), B), C), D)
      else if (inQuestion && /^[A-D]\)/.test(line)) {
        const option = line.replace(/^[A-D]\)/, '').trim()
        currentOptions.push(option)
        
        // Check if this is the correct answer
        if (line.includes('**Answer:**') || line.includes('**Correct:**')) {
          currentCorrectAnswer = currentOptions.length - 1
        }
      }
      // Check for answer explanation
      else if (inQuestion && line.includes('**Answer:**')) {
        currentExplanation = line.replace('**Answer:**', '').trim()
        // Extract correct answer from explanation
        const match = line.match(/[A-D]\)/)
        if (match) {
          const answerIndex = 'ABCD'.indexOf(match[0].replace(')', ''))
          if (answerIndex >= 0) {
            currentCorrectAnswer = answerIndex
          }
        }
      }
      // Handle multi-line questions
      else if (inQuestion && line && !line.startsWith('**')) {
        if (currentOptions.length === 0) {
          // Still building the question
          currentQuestion += ' ' + line
        }
      }
    }
    
    // Don't forget the last question
    if (currentQuestion && currentOptions.length > 0) {
      questions.push({
        question: currentQuestion,
        options: currentOptions,
        correctAnswer: currentCorrectAnswer,
        explanation: currentExplanation
      })
    }
    
    return questions
  }

  const generateStudyFeature = async (featureType: 'exam' | 'flashcards' | 'summary') => {
    if (isGenerating) return

    // Check if there are sources available
    if (sources.length === 0) {
      toast({
        title: "No Documents",
        description: "Please upload at least one document before generating study materials",
        variant: "destructive",
      })
      return
    }

    try {
      setIsGenerating(true)
      console.log(`Generating ${featureType} for notebook ${notebookId}`)
      console.log(`Notebook ID from params: ${notebookId}`)
      console.log(`Available sources: ${sources.length}`)
      
      // Map feature types to correct endpoint names
      const endpointMap = {
        'exam': 'sample-exam',
        'flashcards': 'flashcards',
        'summary': 'summary'
      }
      const endpointName = endpointMap[featureType]
      const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/notebooks/${notebookId}/generate-${endpointName}/`
      console.log(`Making request to: ${url}`)
      console.log(`Request method: POST`)
      console.log(`Request headers:`, { 'Content-Type': 'application/json' })
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      console.log(`Response received:`, response)
      console.log(`Response URL:`, response.url)
      console.log(`Response status: ${response.status}`)
      console.log(`Response status text: ${response.statusText}`)

      console.log(`Response status: ${response.status}`)
      console.log(`Response headers:`, response.headers)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`Server error: ${errorText}`)
        throw new Error(`Failed to generate ${featureType}: ${response.status} ${errorText}`)
      }

      const data = await response.json()
      console.log(`Generated ${featureType}:`, data)
      
      // Debug flashcard parsing
      if (featureType === 'flashcards') {
        console.log(`Flashcard content:`, data.content)
        const parsedFlashcards = parseFlashcards(data.content)
        console.log(`Parsed flashcards:`, parsedFlashcards)
        console.log(`Number of flashcards found:`, parsedFlashcards.length)
      }
      
      // Parse exam questions if generating exam
      if (featureType === 'exam') {
        console.log(`Exam content:`, data.content)
        const parsedQuestions = parseExamQuestions(data.content)
        console.log(`Parsed questions:`, parsedQuestions)
        console.log(`Number of questions found:`, parsedQuestions.length)
        setExamQuestions(parsedQuestions)
        setSelectedAnswers({})
        setShowAnswers(false)
      }
      
      setStudyFeatures(prev => ({
        ...prev,
        [featureType]: data
      }))

      // Reset flashcard state when generating new flashcards
      if (featureType === 'flashcards') {
        setCurrentFlashcardIndex(0)
        setIsFlipped(false)
      }

      toast({
        title: "Success",
        description: `${featureType.charAt(0).toUpperCase() + featureType.slice(1)} generated successfully`,
      })
    } catch (error) {
      console.error(`Failed to generate ${featureType}:`, error)
      toast({
        title: "Error",
        description: `Failed to generate ${featureType}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleShare = () => {
    setShareDialogOpen(true);
  };
  const closeShareDialog = () => {
    setShareDialogOpen(false);
    setCopied(false);
  };
  const shareUrl = typeof window !== 'undefined' && notebook ? `${window.location.origin}/notebook/${notebook.id}` : '';
  const handleCopy = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const openUploadDialog = () => {
    setUploadDialogOpen(true);
  };

  const closeUploadDialog = () => {
    setUploadDialogOpen(false);
  };

  const loadPastSessions = async () => {
    try {
      setSessionsLoading(true)
      const supabase = createClient()
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id
      if (!userId) return

      const { data: sessions, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('notebook_id', notebookId)
        .eq('active', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      setPastSessions(sessions || [])
    } catch (error) {
      console.error('Failed to load past sessions:', error)
      toast({
        title: "Error",
        description: "Failed to load past sessions",
        variant: "destructive",
      })
    } finally {
      setSessionsLoading(false)
    }
  }

  const deleteSession = async (sessionId: string) => {
    try {
      const supabase = createClient()
      
      // Set session as inactive instead of deleting
      const { error } = await supabase
        .from('chat_sessions')
        .update({ active: false })
        .eq('id', sessionId)

      if (error) throw error

      // Remove from local state
      setPastSessions(prev => prev.filter(s => s.id !== sessionId))
      
      // If current session was deactivated, create a new one
      if (currentSession?.id === sessionId) {
        await createNewSession()
      }

      toast({
        title: "Session Deactivated",
        description: "Chat session has been deactivated (messages preserved for monitoring)",
      })
    } catch (error) {
      console.error('Failed to deactivate session:', error)
      toast({
        title: "Error",
        description: "Failed to deactivate session",
        variant: "destructive",
      })
    }
  }

  const openSessionsDialog = () => {
    setSessionsDialogOpen(true)
    loadPastSessions()
  }

  if (!notebook) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <header className="flex items-center justify-between px-8 py-6 border-b border-muted bg-uchicago-crimson">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="mr-2 text-white hover:bg-uchicago-maroon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold truncate max-w-xs md:max-w-md lg:max-w-2xl text-white">{notebook.name}</h1>
          <span className="text-white/80 text-sm hidden md:inline">{notebook.description}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="default" onClick={handleShare} className="flex items-center gap-2 bg-white text-uchicago-crimson border border-uchicago-crimson hover:bg-uchicago-maroon hover:text-white">
            <Share2 className="h-4 w-4" /> Share
          </Button>
        </div>
      </header>

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={closeShareDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Notebook</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 border rounded-md p-2 bg-muted">
            <Input readOnly value={shareUrl} className="flex-1 bg-background text-foreground border-none focus:ring-0" />
            <Button onClick={handleCopy} variant="outline" size="icon">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Share2 className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={closeShareDialog} type="button">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog (drag & drop) */}
      <UploadDialog 
        open={uploadDialogOpen} 
        onClose={closeUploadDialog} 
        onUpload={(files, kind) => handleFileUpload(files, kind)}
        isUploading={isUploading}
      />

      {/* Add modern floating sidebar for upload */}
      <div className={`fixed left-4 top-1/2 transform -translate-y-1/2 z-30 transition-all duration-300 ${
        showFloatingButtons ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
      }`}>
        <div className="flex flex-col items-center bg-white/80 backdrop-blur-md shadow-xl rounded-2xl py-4 px-2 space-y-4 border border-uchicago-crimson">
          <button
            onClick={openUploadDialog}
            disabled={isUploading}
            className={`group flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all shadow-lg focus:outline-none ${
              isUploading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-uchicago-crimson hover:bg-uchicago-maroon'
            }`}
            aria-label="Upload Documents"
            tabIndex={0}
          >
            {isUploading ? (
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-white" />
            ) : (
              <Upload className="h-7 w-7 text-white group-hover:scale-110 transition-transform" />
            )}
            <span className="sr-only">Upload</span>
          </button>
          <button
            onClick={createNewSession}
            className="group flex flex-col items-center justify-center w-14 h-14 rounded-full bg-uchicago-crimson hover:bg-uchicago-maroon transition-all shadow-lg focus:outline-none"
            aria-label="New Chat Session"
            tabIndex={0}
          >
            <Plus className="h-7 w-7 text-white group-hover:scale-110 transition-transform" />
            <span className="sr-only">New Chat</span>
          </button>
          <button
            onClick={openSessionsDialog}
            className="group flex flex-col items-center justify-center w-14 h-14 rounded-full bg-uchicago-crimson hover:bg-uchicago-maroon transition-all shadow-lg focus:outline-none"
            aria-label="View Past Sessions"
            tabIndex={0}
          >
            <History className="h-7 w-7 text-white group-hover:scale-110 transition-transform" />
            <span className="sr-only">Past Sessions</span>
          </button>
        </div>
      </div>

      {/* Add sessions dialog after the upload dialog */}
      <Dialog open={sessionsDialogOpen} onOpenChange={setSessionsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Past Chat Sessions</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {sessionsLoading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-sm text-muted-foreground">Loading sessions...</p>
              </div>
            ) : pastSessions.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-muted-foreground">No past sessions found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pastSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex-1">
                      <p className="font-medium">Session {session.id.slice(0, 8)}...</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(session.created_at).toLocaleDateString()} at{' '}
                        {new Date(session.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCurrentSession(session)
                          setSessionsDialogOpen(false)
                          loadChatHistory()
                        }}
                      >
                        Load
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteSession(session.id)}
                        title="Deactivate session (messages preserved for monitoring)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSessionsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Content: Split Chat/Tools */}
      <main className="flex-1 min-h-screen grid grid-cols-1 lg:grid-cols-2">
        {/* Left: Chat Interface */}
        <section className="flex flex-col h-full min-h-0 bg-background">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-muted">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-xl font-semibold">{notebook?.name || 'Loading...'}</h1>
                <p className="text-sm text-muted-foreground">{notebook?.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={openSessionsDialog}
                disabled={sessionsLoading}
              >
                <History className="h-4 w-4 mr-2" />
                History
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
              >
                <Share className="h-4 w-4 mr-2" />
                Share
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 px-2 max-h-[calc(100vh-200px)]">
            {sessionLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <Card
                      className={
                        `max-w-[80%] shadow-lg rounded-2xl px-6 py-4 ` +
                        (message.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-none ml-auto'
                          : 'bg-muted/70 text-card-foreground rounded-bl-none mr-auto')
                      }
                    >
                      <CardContent className="p-0">
                        {message.role === 'assistant' ? (
                          <div className="text-base prose prose-sm max-w-none">
                            <ReactMarkdown>
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-base">{message.content}</p>
                        )}
                        <p className="text-xs opacity-60 mt-2 text-right">
                          {new Date(message.created_at).toLocaleTimeString()}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                ))}
                {isSending && (
                  <div className="flex justify-start">
                    <Card className="max-w-[80%] bg-muted/70 text-card-foreground shadow-lg rounded-2xl px-6 py-4">
                      <CardContent className="p-0 flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        <p className="text-base text-muted-foreground">Generating response...</p>
                      </CardContent>
                    </Card>
                  </div>
                )}
                
                {/* Recommended Prompts */}
                {messages.length === 0 && !isSending && (
                  <div className="flex flex-col items-center justify-center h-full space-y-4">
                    <div className="text-center">
                      <h3 className="text-lg font-semibold mb-2">How can I help you with this course?</h3>
                      <p className="text-sm text-muted-foreground mb-6">Try asking one of these questions:</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 w-full max-w-md">
                      <button
                        onClick={() => setNewMessage("How should I prepare for the exam for this course?")}
                        className="text-left p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="font-medium text-sm">How should I prepare for the exam for this course?</div>
                        <div className="text-xs text-muted-foreground mt-1">Get exam preparation tips and strategies</div>
                      </button>
                      <button
                        onClick={() => setNewMessage("What is the most important concept of this course?")}
                        className="text-left p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="font-medium text-sm">What is the most important concept of this course?</div>
                        <div className="text-xs text-muted-foreground mt-1">Understand the key learning objectives</div>
                      </button>
                      <button
                        onClick={() => setNewMessage("How difficult is this course?")}
                        className="text-left p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="font-medium text-sm">How difficult is this course?</div>
                        <div className="text-xs text-muted-foreground mt-1">Learn about the course difficulty and workload</div>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="flex gap-2 mt-2 bg-muted/70 rounded-xl p-2 shadow-inner sticky bottom-0 z-10">
            <Input
              placeholder="Ask any question about this course..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isSending}
              className="flex-1 bg-background text-foreground border-none focus:ring-0"
            />
            <Button
              onClick={handleSendMessage}
              disabled={isSending || !newMessage.trim()}
              className="rounded-xl"
            >
              {isSending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                  Sending...
                </>
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </section>

        {/* Right: Tools (Tabs) */}
        <section className="flex flex-col h-full min-h-0 bg-muted/50 p-6 border-l border-muted">
            {/* Tabs and study tools content (Sample Exam, Flash Cards, Summary) */}
        <div className="mb-4">
          <div className="flex w-full gap-4 mb-6">
            <Button
              variant={activeTab === 'summary' ? 'default' : 'outline'}
              size="lg"
              onClick={() => setActiveTab('summary')}
              className={`flex-1 text-lg py-6 ${activeTab === 'summary' ? 'bg-uchicago-crimson text-white font-bold' : 'text-uchicago-crimson border-uchicago-crimson'} hover:bg-uchicago-maroon`}
            >
              <FileText className="h-6 w-6 mr-2" /> Summary
            </Button>
            <Button
              variant={activeTab === 'exam' ? 'default' : 'outline'}
              size="lg"
              onClick={() => setActiveTab('exam')}
              className={`flex-1 text-lg py-6 ${activeTab === 'exam' ? 'bg-uchicago-crimson text-white font-bold' : 'text-uchicago-crimson border-uchicago-crimson'} hover:bg-uchicago-maroon`}
            >
              <HelpCircle className="h-6 w-6 mr-2" /> Sample Exam
            </Button>
            <Button
              variant={activeTab === 'flashcards' ? 'default' : 'outline'}
              size="lg"
              onClick={() => setActiveTab('flashcards')}
              className={`flex-1 text-lg py-6 ${activeTab === 'flashcards' ? 'bg-uchicago-crimson text-white font-bold' : 'text-uchicago-crimson border-uchicago-crimson'} hover:bg-uchicago-maroon`}
            >
              <FileTextIcon className="h-6 w-6 mr-2" /> Flash Cards
            </Button>
            <Button
              variant={activeTab === 'documents' ? 'default' : 'outline'}
              size="lg"
              onClick={() => setActiveTab('documents')}
              className={`flex-1 text-lg py-6 ${activeTab === 'documents' ? 'bg-uchicago-crimson text-white font-bold' : 'text-uchicago-crimson border-uchicago-crimson'} hover:bg-uchicago-maroon`}
            >
              <BookOpen className="h-6 w-6 mr-2" /> Documents
            </Button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'exam' && (
            <div className="space-y-4">
              {!studyFeatures.exam ? (
                <div className="text-center py-8">
                  <HelpCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Generate sample exam questions from past classes
                  </p>
                  <Button
                    onClick={() => generateStudyFeature('exam')}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                        Generating...
                      </>
                    ) : (
                      <>
                        <HelpCircle className="h-4 w-4 mr-2" />
                        Generate Sample Exam
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Sample Exam Questions</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => generateStudyFeature('exam')}
                      disabled={isGenerating}
                    >
                      Regenerate
                    </Button>
                  </div>
                  {examQuestions.length > 0 ? (
                    <div className="space-y-6 max-h-[calc(100vh-300px)] overflow-y-auto">
                      {examQuestions.map((question, index) => (
                        <Card key={index} className="p-6">
                          <div className="space-y-4">
                            <h4 className="text-lg font-semibold">
                              Question {index + 1}
                            </h4>
                            <p className="text-base">{question.question}</p>
                            
                            <div className="space-y-2">
                              {question.options.map((option, optionIndex) => (
                                <button
                                  key={optionIndex}
                                  onClick={() => {
                                    if (!showAnswers) {
                                      setSelectedAnswers(prev => ({
                                        ...prev,
                                        [index]: optionIndex
                                      }))
                                    }
                                  }}
                                  disabled={showAnswers}
                                  className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                                    selectedAnswers[index] === optionIndex
                                      ? showAnswers
                                        ? optionIndex === question.correctAnswer
                                          ? 'border-green-500 bg-green-50'
                                          : 'border-red-500 bg-red-50'
                                        : 'border-blue-500 bg-blue-50'
                                      : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-sm font-medium ${
                                      selectedAnswers[index] === optionIndex
                                        ? showAnswers
                                          ? optionIndex === question.correctAnswer
                                            ? 'border-green-500 bg-green-500 text-white'
                                            : 'border-red-500 bg-red-500 text-white'
                                          : 'border-blue-500 bg-blue-500 text-white'
                                        : 'border-gray-300 bg-white'
                                    }`}>
                                      {String.fromCharCode(65 + optionIndex)}
                                    </div>
                                    <span className="flex-1">{option}</span>
                                    {showAnswers && optionIndex === question.correctAnswer && (
                                      <Check className="h-5 w-5 text-green-600" />
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                            
                            {showAnswers && question.explanation && (
                              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                                <p className="text-sm text-blue-800">
                                  <strong>Explanation:</strong> {question.explanation}
                                </p>
                              </div>
                            )}
                          </div>
                        </Card>
                      ))}
                      
                      <div className="flex justify-between items-center sticky bottom-0 bg-white dark:bg-gray-900 py-4 border-t">
                        <Button
                          variant="outline"
                          onClick={() => setShowAnswers(!showAnswers)}
                        >
                          {showAnswers ? 'Hide Answers' : 'Show Answers'}
                        </Button>
                        
                        <div className="text-sm text-muted-foreground">
                          {Object.keys(selectedAnswers).length} of {examQuestions.length} questions answered
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="prose prose-sm max-w-none bg-muted p-6 rounded-lg">
                      <ReactMarkdown>
                        {studyFeatures.exam?.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'flashcards' && (
            <div className="space-y-4">
              {!studyFeatures.flashcards ? (
                <div className="text-center py-8">
                  <FileTextIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Generate flashcards from your documents
                  </p>
                  <Button
                    onClick={() => generateStudyFeature('flashcards')}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                        Generating...
                      </>
                    ) : (
                      <>
                        <FileTextIcon className="h-4 w-4 mr-2" />
                        Generate Flashcards
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Flashcards</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => generateStudyFeature('flashcards')}
                      disabled={isGenerating}
                    >
                      Regenerate
                    </Button>
                  </div>
                  
                  {/* Interactive Flashcards */}
                  {(() => {
                    const flashcards = parseFlashcards(studyFeatures.flashcards.content)
                    if (flashcards.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground">
                            No flashcards found in the generated content
                          </p>
                        </div>
                      )
                    }
                    
                    const currentCard = flashcards[currentFlashcardIndex]
                    
                    return (
                      <div className="flex flex-col items-center space-y-6">
                        {/* Card Counter */}
                        <div className="text-sm text-muted-foreground">
                          Card {currentFlashcardIndex + 1} of {flashcards.length}
                        </div>
                        
                        {/* Flashcard */}
                        <div className="w-full max-w-md h-64 perspective-1000">
                          <div 
                            className="w-full h-full relative transition-transform duration-500 cursor-pointer"
                            style={{
                              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                              transformStyle: 'preserve-3d'
                            }}
                            onClick={() => setIsFlipped(!isFlipped)}
                          >
                            {/* Front of card (Question) */}
                            <div 
                              className={`absolute w-full h-full bg-white border-2 border-gray-300 rounded-lg p-6 flex flex-col justify-center items-center text-center ${
                                isFlipped ? 'opacity-0' : 'opacity-100'
                              } transition-opacity duration-300`}
                              style={{ backfaceVisibility: 'hidden' }}
                            >
                              <div className="text-lg font-medium text-black">
                                {currentCard.front}
                              </div>
                              <div className="text-sm text-gray-600 mt-2">
                                Question - Click to flip
                              </div>
                            </div>
                            
                            {/* Back of card (Answer) */}
                            <div 
                              className={`absolute w-full h-full bg-white border-2 border-gray-300 rounded-lg p-6 flex flex-col justify-center items-center text-center ${
                                isFlipped ? 'opacity-100' : 'opacity-0'
                              } transition-opacity duration-300`}
                              style={{ 
                                backfaceVisibility: 'hidden',
                                transform: 'rotateY(180deg)'
                              }}
                            >
                              <div className="text-lg font-medium text-black">
                                {currentCard.back}
                              </div>
                              <div className="text-sm text-gray-600 mt-2">
                                Answer - Click to flip
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Navigation Controls */}
                        <div className="flex items-center gap-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (currentFlashcardIndex > 0) {
                                setCurrentFlashcardIndex(currentFlashcardIndex - 1)
                                setIsFlipped(false)
                              }
                            }}
                            disabled={currentFlashcardIndex === 0}
                          >
                            <ChevronLeft className="h-4 w-4 mr-2" />
                            Previous
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsFlipped(!isFlipped)}
                          >
                            {isFlipped ? 'Show Question' : 'Show Answer'}
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (currentFlashcardIndex < flashcards.length - 1) {
                                setCurrentFlashcardIndex(currentFlashcardIndex + 1)
                                setIsFlipped(false)
                              }
                            }}
                            disabled={currentFlashcardIndex === flashcards.length - 1}
                          >
                            Next
                            <ChevronRight className="h-4 w-4 ml-2" />
                          </Button>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="w-full max-w-md">
                          <div className="w-full bg-muted rounded-full h-2">
                            <div 
                              className="bg-primary h-2 rounded-full transition-all duration-300"
                              style={{ width: `${((currentFlashcardIndex + 1) / flashcards.length) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Uploaded Documents</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openUploadDialog}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload More
                </Button>
              </div>
              
              {sources.length === 0 ? (
                <div className="text-center py-8">
                  <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">
                    No documents uploaded yet
                  </p>
                  <Button onClick={openUploadDialog}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Documents
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {sources.map((source) => (
                    <Card key={source.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">{source.title}</h4>
                          <p className="text-xs text-muted-foreground">
                            Uploaded {new Date(source.created).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-muted px-2 py-1 rounded">
                            {source.full_text?.split('(')[1]?.split(')')[0] || 'Document'}
                          </span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'summary' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Course Summary</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateStudyFeature('summary')}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-2" />
                      Regenerate
                    </>
                  )}
                </Button>
              </div>
              
              {/* Course Statistics Charts */}
              {(summaryStats.average_gpa || summaryStats.average_hours || summaryStats.prof_ratings || summaryStats.course_ratings) && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
                  <h4 className="text-lg font-semibold mb-4">Course Statistics</h4>
                  <CourseStatsCharts stats={summaryStats} />
                </div>
              )}
              
              <div className="prose prose-sm max-w-none bg-muted p-6 rounded-lg">
                {studyFeatures.summary?.content ? (
                  <ReactMarkdown>
                    {studyFeatures.summary.content.replace(/## Course Statistics[\s\S]*?(?=##|$)/g, '')}
                  </ReactMarkdown>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">
                      No summary available yet. Click "Regenerate" to create a comprehensive summary from your documents.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  </>
)
} 