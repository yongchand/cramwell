import axios from 'axios';
import { Notebook, Source, Note, ChatMessage, CreateNotebookRequest, UploadSourceRequest, ChatRequest } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Notebook API
export const notebookApi = {
  getAll: async (): Promise<Notebook[]> => {
    const response = await api.get('/notebooks/');
    return response.data;
  },

  create: async (data: CreateNotebookRequest): Promise<Notebook> => {
    const response = await api.post('/notebooks/', null, {
      params: {
        name: data.name,
        description: data.description,
      },
    });
    return response.data;
  },

  getById: async (id: string): Promise<Notebook> => {
    const response = await api.get(`/notebooks/${id}`);
    return response.data;
  },

  update: async (id: string, data: { name?: string; description?: string }): Promise<Notebook> => {
    const response = await api.put(`/notebooks/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/notebooks/${id}`);
  },

  archive: async (id: string): Promise<void> => {
    await api.post(`/notebooks/${id}/archive`);
  },

  unarchive: async (id: string): Promise<void> => {
    await api.post(`/notebooks/${id}/unarchive`);
  },
};

// Source API
export const sourceApi = {
  upload: async (data: UploadSourceRequest): Promise<Source> => {
    const formData = new FormData();
    formData.append('file', data.file);

    const response = await api.post(`/notebooks/${data.notebookId}/upload/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getByNotebookId: async (notebookId: string): Promise<Source[]> => {
    const response = await api.get(`/notebooks/${notebookId}/sources`);
    return response.data;
  },
};

// Chat API
export const chatApi = {
  sendMessage: async (data: ChatRequest): Promise<ChatMessage> => {
    const response = await api.post(`/notebooks/${data.notebookId}/chat/`, {
      message: data.message,
    });
    return response.data;
  },

  getHistory: async (notebookId: string): Promise<ChatMessage[]> => {
    const chatSessions = await api.get(`/notebooks/${notebookId}/chat_sessions/`);
    if (chatSessions.data.length > 0) {
      const sessionId = chatSessions.data[0].id;
      const response = await api.get(`/chat_sessions/${sessionId}/messages/`);
      return response.data;
    }
    return [];
  },
};

// Note API
export const noteApi = {
  getByNotebookId: async (notebookId: string): Promise<Note[]> => {
    const response = await api.get(`/notebooks/${notebookId}/notes`);
    return response.data;
  },

  create: async (notebookId: string, data: { title: string; content: string }): Promise<Note> => {
    const response = await api.post(`/notebooks/${notebookId}/notes`, data);
    return response.data;
  },
};

// Search API
export const searchApi = {
  textSearch: async (term: string, searchSources: boolean, searchNotes: boolean): Promise<any[]> => {
    const response = await api.post('/search/text', {
      term,
      search_sources: searchSources,
      search_notes: searchNotes,
    });
    return response.data;
  },

  vectorSearch: async (term: string, searchSources: boolean, searchNotes: boolean): Promise<any[]> => {
    const response = await api.post('/search/vector', {
      term,
      search_sources: searchSources,
      search_notes: searchNotes,
    });
    return response.data;
  },
};

// Podcast API
export const podcastApi = {
  getEpisodes: async (): Promise<any[]> => {
    const response = await api.get('/podcasts/episodes');
    return response.data;
  },

  deleteEpisode: async (episodeId: string): Promise<void> => {
    await api.delete(`/podcasts/episodes/${episodeId}`);
  },

  getTemplates: async (): Promise<any[]> => {
    const response = await api.get('/podcasts/templates');
    return response.data;
  },

  createTemplate: async (template: any): Promise<any> => {
    const response = await api.post('/podcasts/templates', template);
    return response.data;
  },

  updateTemplate: async (templateId: string, template: any): Promise<any> => {
    const response = await api.put(`/podcasts/templates/${templateId}`, template);
    return response.data;
  },

  deleteTemplate: async (templateId: string): Promise<void> => {
    await api.delete(`/podcasts/templates/${templateId}`);
  },
};
 