import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000/api';
const ACCESS_TOKEN_KEY = 'acadexa.access-token';
const REFRESH_TOKEN_KEY = 'acadexa.refresh-token';

const client = axios.create({ baseURL: API_BASE_URL, timeout: 45000 });

client.interceptors.request.use((config) => {
  const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function clearSession() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function authenticate({ email, password, firstName, lastName, register }) {
  if (register) {
    await client.post('/auth/register/', {
      email,
      password,
      first_name: firstName,
      last_name: lastName,
    });
  }
  const { data: tokens } = await client.post('/auth/token/', { email, password });
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
  const { data: user } = await client.get('/auth/me/');
  return user;
}

export async function provisionWorkspace() {
  const { data: courses } = await client.get('/courses/');
  const course = courses[0] ?? (await client.post('/courses/', {
    title: 'Computer Networks', code: 'CS 304', color: '#ef9f68',
  })).data;
  const { data: conversations } = await client.get('/conversations/');
  const conversation = conversations.find((item) => item.course === course.id)
    ?? (await client.post('/conversations/', { course: course.id })).data;
  return { course, conversation };
}

export async function createConversation(courseId) {
  const { data } = await client.post('/conversations/', { course: courseId });
  return data;
}

export async function uploadPdf({ courseId, file }) {
  const formData = new FormData();
  formData.append('course', courseId);
  formData.append('file', file);
  const { data } = await client.post('/documents/', formData);
  return data;
}

export async function askCourseQuestion(conversationId, question) {
  const { data } = await client.post(`/conversations/${conversationId}/ask/`, { question });
  return data;
}

export function apiErrorMessage(error) {
  const payload = error.response?.data;
  if (typeof payload?.detail === 'string') return payload.detail;
  if (payload && typeof payload === 'object') {
    const first = Object.values(payload).flat().find(Boolean);
    if (typeof first === 'string') return first;
  }
  if (error.code === 'ECONNABORTED') return 'Acadexa took too long to respond. Please try again.';
  if (!error.response) return 'Acadexa cannot reach the local API. Start the Django and PostgreSQL services, then try again.';
  return 'That request could not be completed. Please try again.';
}
