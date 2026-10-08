export const initialCourses = [
  { id: "net", name: "Computer Networks", code: "CS 304", color: "#ef9f68", count: 12 },
  { id: "os", name: "Operating Systems", code: "CS 302", color: "#97b8ef", count: 8 },
  { id: "db", name: "Database Systems", code: "CS 306", color: "#c5a7e9", count: 6 },
  { id: "se", name: "Software Engineering", code: "CS 308", color: "#79c6af", count: 10 },
];

export const previewSources = [
  {
    id: "tcp",
    title: "Lecture 05 — Transport Layer",
    meta: "PDF · 32 pages",
    pages: "p. 14–16",
    updated: "Indexed 2 days ago",
  },
  {
    id: "ports",
    title: "Lecture 06 — Application Layer",
    meta: "PDF · 27 pages",
    pages: "p. 6–7",
    updated: "Indexed 2 days ago",
  },
  {
    id: "guide",
    title: "Networks revision guide",
    meta: "PDF · 11 pages",
    pages: "p. 3",
    updated: "Indexed last week",
  },
];

export const firstAnswer = {
  id: "answer-1",
  role: "assistant",
  mode: "preview",
  text: "TCP is connection-oriented: it establishes a session before data moves, sequences packets, and retransmits lost data. UDP sends independent datagrams with less overhead, so it trades delivery and ordering guarantees for speed.",
  citations: ["tcp", "ports"],
};

export const initialMessages = [
  { id: "question-1", role: "user", text: "What is the difference between TCP and UDP?" },
  firstAnswer,
];

const previewPassages = {
  tcp: {
    terms: ["tcp", "reliable", "connection", "sequence", "retransmit", "transport", "delivery", "flow"],
    answer: "TCP establishes a connection before data is exchanged and uses sequencing, acknowledgements, retransmission, and flow control to provide reliable, ordered delivery.",
  },
  ports: {
    terms: ["udp", "datagram", "connectionless", "latency", "loss", "application", "port"],
    answer: "UDP is connectionless and sends independent datagrams. It has less overhead than TCP, so applications can choose it when low latency matters more than guaranteed delivery or ordering.",
  },
  guide: {
    terms: ["network", "osi", "subnet", "ip", "routing", "revision"],
    answer: "The selected preview material covers core networking concepts. Add the relevant lecture notes to get a more specific, source-backed explanation.",
  },
};

export function answerFromPreview(question) {
  const terms = question.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const citations = previewSources
    .map((source) => ({
      id: source.id,
      score: terms.filter((term) => previewPassages[source.id].terms.includes(term)).length,
    }))
    .filter((source) => source.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((source) => source.id);

  if (!citations.length) {
    return {
      text: "I couldn’t find enough relevant material in this course preview to answer that confidently. Try a question about TCP, UDP, routing, subnetting, or upload the lecture notes you want to study.",
      citations: [],
      mode: "insufficient-context",
    };
  }

  if (citations.includes("tcp") && citations.includes("ports")) return firstAnswer;

  const primarySource = citations[0];
  return {
    text: `Based on the indexed course preview: ${previewPassages[primarySource].answer}`,
    citations: [primarySource],
    mode: "preview",
  };
}

export function sourceFromCitation(citation) {
  return {
    id: `chunk-${citation.chunk_id}`,
    title: citation.document_title,
    meta: "PDF · retrieved chunk",
    pages: `p. ${citation.page_number}`,
    updated: "Retrieved just now",
  };
}
