"""Auditable LangGraph workflow for source-grounded course question answering."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import TypedDict
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from langgraph.graph import END, START, StateGraph
from pgvector.django import CosineDistance

from documents.embeddings import EmbeddingError, embedding_provider
from documents.models import Document, DocumentChunk


class GenerationError(RuntimeError):
    """A configured LLM could not return a usable grounded response."""


@dataclass(frozen=True)
class RetrievedChunk:
    id: int
    document_id: int
    document_title: str
    page_number: int
    content: str
    relevance: float


class RagState(TypedDict, total=False):
    question: str
    user_id: int
    course_id: int
    retrieved: list[RetrievedChunk]
    sufficient: bool
    answer: str
    generation_mode: str


@dataclass(frozen=True)
class RagResult:
    answer: str
    chunks: list[RetrievedChunk]
    generation_mode: str


def retrieve_chunks(*, question: str, user_id: int, course_id: int) -> list[RetrievedChunk]:
    vector = embedding_provider().embed_many([question])[0]
    max_distance = 1 - settings.RAG_MIN_RELEVANCE
    matches = (
        DocumentChunk.objects.filter(
            document__course_id=course_id,
            document__course__owner_id=user_id,
            document__status=Document.Status.READY,
        )
        .select_related("document")
        .annotate(distance=CosineDistance("embedding", vector))
        .filter(distance__lte=max_distance)
        .order_by("distance")[:settings.RAG_TOP_K]
    )
    return [
        RetrievedChunk(
            id=chunk.id,
            document_id=chunk.document_id,
            document_title=chunk.document.title,
            page_number=chunk.page_number,
            content=chunk.content,
            relevance=max(0.0, min(1.0, 1.0 - float(chunk.distance))),
        )
        for chunk in matches
    ]


def format_context(chunks: list[RetrievedChunk]) -> str:
    return "\n\n".join(
        f"[SOURCE id={chunk.id}; document={chunk.document_title}; page={chunk.page_number}]\n{chunk.content}"
        for chunk in chunks
    )


def extractive_answer(chunks: list[RetrievedChunk]) -> str:
    """Safe fallback when no LLM is configured: expose retrieved material without invention."""
    excerpts = "\n\n".join(
        f"From {chunk.document_title}, page {chunk.page_number}: {chunk.content}"
        for chunk in chunks[:2]
    )
    return f"I found the following relevant material in your course documents:\n\n{excerpts}"


def generate_grounded_answer(question: str, chunks: list[RetrievedChunk]) -> tuple[str, str]:
    if settings.LLM_BACKEND == "none":
        return extractive_answer(chunks), "retrieval_only"
    if settings.LLM_BACKEND != "external":
        raise ImproperlyConfigured(f"Unsupported LLM_BACKEND: {settings.LLM_BACKEND}")
    if not all([settings.LLM_API_URL, settings.LLM_API_KEY, settings.LLM_MODEL]):
        raise ImproperlyConfigured("External generation requires LLM_API_URL, LLM_API_KEY, and LLM_MODEL.")

    system_prompt = (
        "You are Acadexa, an academic assistant. Answer only from the supplied source context. "
        "If the context does not support an answer, say that it is insufficient. Do not create citations, "
        "document names, page numbers, or facts. Keep the response concise and explain uncertainty."
    )
    body = json.dumps({
        "model": settings.LLM_MODEL,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Question:\n{question}\n\nSource context:\n{format_context(chunks)}"},
        ],
    }).encode("utf-8")
    request = Request(
        settings.LLM_API_URL,
        data=body,
        headers={"Authorization": f"Bearer {settings.LLM_API_KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=45) as response:  # nosec B310 - endpoint is explicit configuration
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError) as exc:
        raise GenerationError("The configured language model could not be reached.") from exc

    try:
        answer = payload["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, AttributeError) as exc:
        raise GenerationError("The configured language model returned an unexpected response.") from exc
    if not answer:
        raise GenerationError("The configured language model returned an empty response.")
    return answer, "llm_grounded"


def retrieve_node(state: RagState) -> RagState:
    return {"retrieved": retrieve_chunks(question=state["question"], user_id=state["user_id"], course_id=state["course_id"])}


def assess_relevance_node(state: RagState) -> RagState:
    return {"sufficient": bool(state["retrieved"])}


def choose_answer_path(state: RagState) -> str:
    return "answer" if state["sufficient"] else "insufficient"


def answer_node(state: RagState) -> RagState:
    answer, generation_mode = generate_grounded_answer(state["question"], state["retrieved"])
    return {"answer": answer, "generation_mode": generation_mode}


def insufficient_node(state: RagState) -> RagState:
    return {
        "answer": "I couldn’t find sufficiently relevant information in the selected course materials to answer that confidently.",
        "generation_mode": "insufficient_context",
    }


def build_rag_graph():
    graph = StateGraph(RagState)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("assess_relevance", assess_relevance_node)
    graph.add_node("answer", answer_node)
    graph.add_node("insufficient", insufficient_node)
    graph.add_edge(START, "retrieve")
    graph.add_edge("retrieve", "assess_relevance")
    graph.add_conditional_edges("assess_relevance", choose_answer_path, {"answer": "answer", "insufficient": "insufficient"})
    graph.add_edge("answer", END)
    graph.add_edge("insufficient", END)
    return graph.compile()


RAG_GRAPH = build_rag_graph()


def answer_question(*, question: str, user_id: int, course_id: int) -> RagResult:
    if not question.strip():
        raise ValueError("A question is required.")
    try:
        result = RAG_GRAPH.invoke({"question": question.strip(), "user_id": user_id, "course_id": course_id})
    except (EmbeddingError, GenerationError, ImproperlyConfigured):
        raise
    return RagResult(
        answer=result["answer"],
        chunks=result.get("retrieved", []),
        generation_mode=result["generation_mode"],
    )
