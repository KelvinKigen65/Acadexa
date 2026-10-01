import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ACCESS_TOKEN_KEY = "acadexa.access-token";
const REFRESH_TOKEN_KEY = "acadexa.refresh-token";
const TOKENLESS_AUTH_ENDPOINTS = new Set([
  "/auth/register/",
  "/auth/token/",
  "/auth/token/refresh/",
]);

const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
const developmentBaseUrl = Platform.select({
  android: "http://10.0.2.2:8000/api",
  default: "http://localhost:8000/api",
});

export const API_BASE_URL = configuredBaseUrl ?? developmentBaseUrl;

const client = axios.create({ baseURL: API_BASE_URL, timeout: 45000 });

client.interceptors.request.use(async (config) => {
  if (!TOKENLESS_AUTH_ENDPOINTS.has(config.url)) {
    const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function hasSession() {
  return Boolean(await SecureStore.getItemAsync(ACCESS_TOKEN_KEY));
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

export async function authenticate({ email, password, firstName, lastName, register }) {
  if (register) {
    await client.post("/auth/register/", {
      email,
      password,
      first_name: firstName,
      last_name: lastName,
    });
  }
  const { data: tokens } = await client.post("/auth/token/", { email, password });
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.access),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refresh),
  ]);
  return getCurrentUser();
}

export async function getCurrentUser() {
  const { data } = await client.get("/auth/me/");
  return data;
}

export async function listCourses() {
  const { data } = await client.get("/courses/");
  return data;
}

export async function provisionWorkspace() {
  const courses = await listCourses();
  const course = courses[0] ?? (await client.post("/courses/", {
    title: "Computer Networks",
    code: "CS 304",
    color: "#ef9f68",
  })).data;
  const { data: conversations } = await client.get("/conversations/");
  const conversation = conversations.find((item) => item.course === course.id)
    ?? (await client.post("/conversations/", { course: course.id })).data;
  return { course, conversation };
}

export async function createConversation(courseId) {
  const { data } = await client.post("/conversations/", { course: courseId });
  return data;
}

export async function listDocuments() {
  const { data } = await client.get("/documents/");
  return data;
}

export async function uploadPdf({ courseId, file }) {
  const formData = new FormData();
  formData.append("course", String(courseId));
  formData.append("file", {
    uri: file.uri,
    name: file.name ?? "lecture-notes.pdf",
    type: file.mimeType ?? "application/pdf",
  });
  const { data } = await client.post("/documents/", formData);
  return data;
}

export async function askCourseQuestion(conversationId, question, documentId, focusTopic) {
  const payload = { question };
  if (documentId) payload.document_id = documentId;
  if (focusTopic?.trim()) payload.focus_topic = focusTopic.trim();
  const { data } = await client.post(`/conversations/${conversationId}/ask/`, payload);
  return data;
}

export function apiErrorMessage(error) {
  const payload = error.response?.data;
  if (typeof payload?.detail === "string") return payload.detail;
  if (payload && typeof payload === "object") {
    const first = Object.values(payload).flat().find(Boolean);
    if (typeof first === "string") return first;
  }
  if (error.code === "ECONNABORTED") return "Acadexa took too long to respond. Please try again.";
  if (!error.response) return "Acadexa cannot reach the API. Check EXPO_PUBLIC_API_BASE_URL and try again.";
  return "That request could not be completed. Please try again.";
}
