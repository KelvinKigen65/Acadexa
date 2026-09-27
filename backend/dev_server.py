"""Local development fallback for testing Acadexa's upload-to-answer flow.

This server is deliberately limited to localhost. Production uses Django, PyMuPDF,
PostgreSQL, pgvector, and LangGraph; this fallback keeps the same HTTP contract when
those container images are unavailable on a development machine.
"""

from __future__ import annotations
import cgi

import base64
import re
import hashlib
import json
import os
import secrets
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent / ".dev-data"
STATE_FILE = ROOT / "state.json"
FILES_DIR = ROOT / "files"


def empty_state() -> dict:
    return {"next_id": 1, "users": [], "sessions": {}, "courses": [], "documents": [], "chunks": [], "conversations": [], "messages": []}


def load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return empty_state()


def save_state(state: dict) -> None:
    ROOT.mkdir(exist_ok=True)
    FILES_DIR.mkdir(exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, dir=ROOT) as handle:
        json.dump(state, handle)
        temporary_name = handle.name
    os.replace(temporary_name, STATE_FILE)


def allocate_id(state: dict) -> int:
    value = state["next_id"]
    state["next_id"] += 1
    return value


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
    return f"{base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def password_matches(password: str, stored: str) -> bool:
    try:
        salt_text, digest_text = stored.split("$", 1)
        return secrets.compare_digest(password_hash(password, base64.b64decode(salt_text)), stored)
    except (ValueError, UnicodeError):
        return False


def token_set(value: str) -> set[str]:
    return {word.lower() for word in re.findall(r"[A-Za-z0-9]+", value) if len(word) > 2}


def concise_excerpt(question_terms: set[str], content: str) -> str:
    text = " ".join(content.split())
    sentences = [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", text) if sentence.strip()]
    if not sentences:
        return text[:280].rsplit(" ", 1)[0].rstrip() if len(text) > 280 else text
    best = max(sentences, key=lambda sentence: len(question_terms & token_set(sentence)))
    return best[:280].rsplit(" ", 1)[0].rstrip() if len(best) > 280 else best


def split_page(value: str, size: int = 900, overlap: int = 160) -> list[str]:
    text = " ".join(value.split())
    if not text:
        return []
    chunks, start = [], 0
    while start < len(text):
        end = min(start + size, len(text))
        boundary = text.rfind(" ", start + size // 2, end)
        if end < len(text) and boundary > start:
            end = boundary
        part = text[start:end].strip()
        if part:
            chunks.append(part)
        if end >= len(text):
            break
        start = max(start + 1, end - overlap)
    return chunks


def extract_pdf(pdf_path: Path) -> list[tuple[int, str]]:
    try:
        result = subprocess.run(["pdftotext", "-layout", str(pdf_path), "-"], capture_output=True, text=True, timeout=60, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ValueError("The PDF text extractor could not run.") from error
    if result.returncode != 0:
        raise ValueError("The uploaded file could not be read as a PDF.")
    pages = [(number, text) for number, text in enumerate(result.stdout.split("\f"), start=1) if text.strip()]
    if not pages:
        raise ValueError("No selectable text was found in this PDF. OCR is not available yet.")
    return pages


class AcadexaDevelopmentHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def respond(self, status: int, payload: dict | list | None = None) -> None:
        body = b"" if payload is None else json.dumps(payload).encode("utf-8")
        origin = self.headers.get("Origin", "http://localhost:5173")
        if origin not in {"http://localhost:5173", "http://127.0.0.1:5173"}:
            origin = "http://localhost:5173"
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return {}

    def current_user(self, state: dict) -> dict | None:
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return None
        user_id = state["sessions"].get(header.removeprefix("Bearer "))
        return next((user for user in state["users"] if user["id"] == user_id), None)

    def require_user(self, state: dict) -> dict | None:
        user = self.current_user(state)
        if not user:
            self.respond(401, {"detail": "Authentication credentials were not provided."})
            return None
        return user

    def do_OPTIONS(self) -> None:
        self.respond(204)

    @staticmethod
    def public_user(user: dict) -> dict:
        return {"id": user["id"], "email": user["email"], "first_name": user.get("first_name", ""), "last_name": user.get("last_name", ""), "display_name": user.get("first_name") or user["email"], "role": "student"}

    def do_GET(self) -> None:
        path = self.path.rstrip("/")
        if path == "/api/health":
            self.respond(200, {"status": "ok", "mode": "local-development-fallback"})
            return
        state = load_state()
        user = self.require_user(state)
        if not user:
            return
        if path == "/api/auth/me":
            self.respond(200, self.public_user(user))
            return
        if path == "/api/courses":
            self.respond(200, [course for course in state["courses"] if course["owner_id"] == user["id"]])
            return
        if path == "/api/conversations":
            self.respond(200, [conversation for conversation in state["conversations"] if conversation["user_id"] == user["id"]])
            return
        if path == "/api/documents":
            course_ids = {course["id"] for course in state["courses"] if course["owner_id"] == user["id"]}
            self.respond(200, [document for document in state["documents"] if document["course"] in course_ids])
            return

    def do_POST(self) -> None:
        path = self.path.rstrip("/")
        if path == "/api/auth/register":
            self.register()
            return
        if path == "/api/auth/token":
            self.login()
            return
        state = load_state()
        user = self.require_user(state)
        if not user:
            return
        if path == "/api/courses":
            self.create_course(state, user)
            return
        if path == "/api/conversations":
            self.create_conversation(state, user)
            return
        if path == "/api/documents":
            self.upload_document(state, user)
            return
        parts = path.split("/")
        if len(parts) == 5 and parts[:3] == ["", "api", "conversations"] and parts[-1] == "ask":
            self.answer_question(state, user, int(parts[3]))
            return
        self.respond(404, {"detail": "Not found."})

    def register(self) -> None:
        body = self.json_body()
        email = str(body.get("email", "")).strip().lower()
        password = str(body.get("password", ""))
        if "@" not in email or len(password) < 12:
            self.respond(400, {"detail": "Use a valid email address and a password of at least 12 characters."})
            return
        state = load_state()
        if any(user["email"] == email for user in state["users"]):
            self.respond(400, {"email": ["A user with that email already exists."]})
            return
        user = {"id": allocate_id(state), "email": email, "password": password_hash(password), "first_name": str(body.get("first_name", "")).strip(), "last_name": str(body.get("last_name", "")).strip()}
        state["users"].append(user)
        save_state(state)
        self.respond(201, self.public_user(user))

    def login(self) -> None:
        body = self.json_body()
        state = load_state()
        user = next((item for item in state["users"] if item["email"] == str(body.get("email", "")).strip().lower()), None)
        if not user or not password_matches(str(body.get("password", "")), user["password"]):
            self.respond(401, {"detail": "No active account found with the given credentials."})
            return
        token = secrets.token_urlsafe(32)
        state["sessions"][token] = user["id"]
        save_state(state)
        self.respond(200, {"access": token, "refresh": token})

    def create_course(self, state: dict, user: dict) -> None:
        body = self.json_body()
        title, code = str(body.get("title", "")).strip(), str(body.get("code", "")).strip()
        if not title or not code:
            self.respond(400, {"detail": "Course title and code are required."})
            return
        course = {"id": allocate_id(state), "owner_id": user["id"], "title": title, "code": code, "description": "", "color": body.get("color", "#5577BD"), "documents_count": 0}
        state["courses"].append(course)
        save_state(state)
        self.respond(201, course)

    def create_conversation(self, state: dict, user: dict) -> None:
        body = self.json_body()
        course_id = int(body.get("course", 0))
        course = next((item for item in state["courses"] if item["id"] == course_id and item["owner_id"] == user["id"]), None)
        if not course:
            self.respond(404, {"detail": "Course not found."})
            return
        conversation = {"id": allocate_id(state), "user_id": user["id"], "course": course_id, "course_name": course["title"], "title": ""}
        state["conversations"].append(conversation)
        save_state(state)
        self.respond(201, conversation)

    def upload_document(self, state: dict, user: dict) -> None:
        if "multipart/form-data" not in self.headers.get("Content-Type", ""):
            self.respond(415, {"detail": "Use multipart form data for PDF uploads."})
            return
        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": self.headers["Content-Type"], "CONTENT_LENGTH": self.headers.get("Content-Length", "0")})
        file_item = form["file"] if "file" in form else None
        if file_item is None or not getattr(file_item, "filename", None):
            self.respond(400, {"file": ["A PDF file is required."]})
            return
        try:
            course_id = int(form.getvalue("course"))
        except (TypeError, ValueError):
            self.respond(400, {"course": ["A valid course is required."]})
            return
        course = next((item for item in state["courses"] if item["id"] == course_id and item["owner_id"] == user["id"]), None)
        if not course:
            self.respond(404, {"detail": "Course not found."})
            return
        payload = file_item.file.read()
        if len(payload) > 30 * 1024 * 1024 or not payload.startswith(b"%PDF-"):
            self.respond(400, {"file": ["Upload a valid PDF smaller than 30 MB."]})
            return
        original_filename = Path(file_item.filename).name
        document_id = allocate_id(state)
        ROOT.mkdir(exist_ok=True)
        FILES_DIR.mkdir(exist_ok=True)
        pdf_path = FILES_DIR / f"{document_id}-{original_filename}"
        pdf_path.write_bytes(payload)
        try:
            pages = extract_pdf(pdf_path)
        except ValueError as error:
            pdf_path.unlink(missing_ok=True)
            self.respond(422, {"detail": str(error)})
            return
        chunks = []
        for page_number, page_text in pages:
            for content in split_page(page_text):
                chunks.append({"id": allocate_id(state), "document_id": document_id, "course_id": course_id, "page_number": page_number, "content": content})
        document = {"id": document_id, "course": course_id, "course_name": course["title"], "title": Path(original_filename).stem, "original_filename": original_filename, "file_size": len(payload), "page_count": len(pages), "status": "ready", "extraction_error": "", "chunks_count": len(chunks)}
        state["documents"].append(document)
        state["chunks"].extend(chunks)
        course["documents_count"] += 1
        save_state(state)
        self.respond(201, document)

    def answer_question(self, state: dict, user: dict, conversation_id: int) -> None:
        body = self.json_body()
        question = str(body.get("question", "")).strip()
        conversation = next((item for item in state["conversations"] if item["id"] == conversation_id and item["user_id"] == user["id"]), None)
        if not conversation or not question:
            self.respond(400, {"detail": "A valid conversation and question are required."})
            return
        selected_document_id = body.get("document_id")
        if selected_document_id is not None:
            try:
                selected_document_id = int(selected_document_id)
            except (TypeError, ValueError):
                self.respond(400, {"document_id": ["Choose a valid uploaded PDF."]})
                return
            selected_document = next((document for document in state["documents"] if document["id"] == selected_document_id and document["course"] == conversation["course"]), None)
            if not selected_document:
                self.respond(404, {"detail": "Selected PDF not found in this course."})
                return
            candidates = [chunk for chunk in state["chunks"] if chunk["document_id"] == selected_document_id]
        else:
            candidates = [chunk for chunk in state["chunks"] if chunk["course_id"] == conversation["course"]]
        focus_topic = str(body.get("focus_topic", "")).strip()
        question_terms = token_set(f"{focus_topic} {question}")
        ranked = []
        for chunk in candidates:
            score = len(question_terms & token_set(chunk["content"]))
            if score:
                ranked.append((score, chunk))
        top_chunks = sorted(ranked, key=lambda item: item[0], reverse=True)[:1]
        assistant_id = allocate_id(state)
        if top_chunks:
            score, chunk = top_chunks[0]
            document = next(item for item in state["documents"] if item["id"] == chunk["document_id"])
            content = concise_excerpt(question_terms, chunk["content"])
            citations = [{"id": allocate_id(state), "chunk_id": chunk["id"], "document_id": document["id"], "document_title": document["title"], "page_number": chunk["page_number"], "relevance": round(score / max(len(question_terms), 1), 3)}]
            generation_mode = "retrieval_only"
        else:
            content, citations, generation_mode = "I couldn’t find sufficiently relevant information in your uploaded course materials to answer that confidently.", [], "insufficient_context"
        user_message = {"id": allocate_id(state), "conversation_id": conversation_id, "role": "user", "content": question, "citations": []}
        assistant_message = {"id": assistant_id, "conversation_id": conversation_id, "role": "assistant", "content": content, "generation_mode": generation_mode, "citations": citations}
        state["messages"].extend([user_message, assistant_message])
        if not conversation["title"]:
            conversation["title"] = question[:160]
        save_state(state)
        self.respond(201, assistant_message)


def main() -> None:
    ROOT.mkdir(exist_ok=True)
    FILES_DIR.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 8000), AcadexaDevelopmentHandler)
    print("Acadexa local development API listening on http://127.0.0.1:8000/api/health/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()



if __name__ == "__main__":
    main()
