import { useMemo, useRef, useState } from 'react';
import { apiErrorMessage, askCourseQuestion, authenticate, createConversation, listDocuments, provisionWorkspace, uploadPdf } from './services/api.js';

const iconPaths = {
  archive: <><path d="M4 7.5h16"/><path d="M5.5 7.5v10.7c0 .9.7 1.6 1.6 1.6h9.8c.9 0 1.6-.7 1.6-1.6V7.5"/><path d="M3.8 4.2h16.4v3.3H3.8z"/><path d="M9 12h6"/></>,
  book: <><path d="M4.7 5.4A2.4 2.4 0 0 1 7 3.2h10v15.6H7a2.4 2.4 0 0 0-2.3 2.1z"/><path d="M4.7 5.4v15.5"/><path d="M7 18.8h10"/></>,
  bubble: <><path d="M20 11.2a7.5 7.5 0 0 1-8 7.4 8.7 8.7 0 0 1-3.2-.6l-4.3 1.3 1.4-3.8a7.1 7.1 0 0 1-1.3-4.1A7.5 7.5 0 0 1 12.5 4 7.5 7.5 0 0 1 20 11.2Z"/></>,
  chevron: <path d="m8.5 10 3.5 3.5 3.5-3.5"/>,
  close: <><path d="m7 7 10 10M17 7 7 17"/></>,
  dots: <><circle cx="6" cy="12" r=".8" fill="currentColor"/><circle cx="12" cy="12" r=".8" fill="currentColor"/><circle cx="18" cy="12" r=".8" fill="currentColor"/></>,
  file: <><path d="M6 3.5h7l5 5v12H6z"/><path d="M13 3.5v5h5"/><path d="M9 14h6M9 17h4"/></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
  link: <><path d="M9.2 14.8 14.8 9.2"/><path d="M7.2 17.7 5.4 19.5a3.3 3.3 0 1 1-4.7-4.7l3.1-3.1a3.3 3.3 0 0 1 4.7 0"/><path d="m16.8 6.3 1.8-1.8a3.3 3.3 0 1 1 4.7 4.7l-3.1 3.1a3.3 3.3 0 0 1-4.7 0"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  search: <><circle cx="10.8" cy="10.8" r="5.8"/><path d="m15.2 15.2 4.5 4.5"/></>,
  send: <><path d="m21 3-7.4 18-2.8-7.8L3 10.4z"/><path d="M10.8 13.2 21 3"/></>,
  spark: <><path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/></>,
  upload: <><path d="M12 15V3"/><path d="m7.8 7.2 4.2-4.2 4.2 4.2"/><path d="M5 14.5v4.2c0 .8.6 1.3 1.3 1.3h11.4c.7 0 1.3-.5 1.3-1.3v-4.2"/></>,
  user: <><circle cx="12" cy="8" r="3"/><path d="M5.5 20c.6-3.2 2.9-5 6.5-5s5.9 1.8 6.5 5"/></>,
  arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
};

function Icon({ name, size = 20, className = '' }) {
  return <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

const initialCourses = [
  { id: 'net', name: 'Computer Networks', code: 'CS 304', color: '#ef9f68', count: 12 },
  { id: 'os', name: 'Operating Systems', code: 'CS 302', color: '#97b8ef', count: 8 },
  { id: 'db', name: 'Database Systems', code: 'CS 306', color: '#c5a7e9', count: 6 },
  { id: 'se', name: 'Software Engineering', code: 'CS 308', color: '#79c6af', count: 10 },
];

const conversations = [
  { id: 1, title: 'TCP vs UDP', course: 'Computer Networks', date: 'Just now' },
  { id: 2, title: 'Subnetting practice', course: 'Computer Networks', date: 'Yesterday' },
  { id: 3, title: 'OSI model layers', course: 'Computer Networks', date: 'Sep 20' },
];

const initialSourceDocuments = [
  { id: 'tcp', title: 'Lecture 05 — Transport Layer', meta: 'PDF · 32 pages', pages: 'p. 14–16', updated: 'Indexed 2 days ago' },
  { id: 'ports', title: 'Lecture 06 — Application Layer', meta: 'PDF · 27 pages', pages: 'p. 6–7', updated: 'Indexed 2 days ago' },
  { id: 'guide', title: 'Networks revision guide', meta: 'PDF · 11 pages', pages: 'p. 3', updated: 'Indexed last week' },
];

const firstAnswer = {
  id: 'answer-1',
  role: 'assistant',
  text: <>TCP is connection-oriented: it establishes a session before data moves, sequences packets, and retransmits lost data. UDP sends independent datagrams with less overhead, so it trades delivery and ordering guarantees for speed.</>,
  citations: ['tcp', 'ports'],
};

const previewPassages = {
  tcp: {
    terms: ['tcp', 'reliable', 'connection', 'sequence', 'retransmit', 'transport', 'delivery', 'flow'],
    answer: 'TCP establishes a connection before data is exchanged and uses sequencing, acknowledgements, retransmission, and flow control to provide reliable, ordered delivery.',
  },
  ports: {
    terms: ['udp', 'datagram', 'connectionless', 'latency', 'loss', 'application', 'port'],
    answer: 'UDP is connectionless and sends independent datagrams. It has less overhead than TCP, so applications can choose it when low latency matters more than guaranteed delivery or ordering.',
  },
  guide: {
    terms: ['network', 'osi', 'subnet', 'ip', 'routing', 'revision'],
    answer: 'The selected preview material covers core networking concepts. Add the relevant lecture notes to get a more specific, source-backed explanation.',
  },
};

function answerFromPreview(question) {
  const terms = question.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const scoredSources = initialSourceDocuments.map((source) => ({
    id: source.id,
    score: terms.filter((term) => previewPassages[source.id].terms.includes(term)).length,
  }));
  const citations = scoredSources.filter((source) => source.score > 0).sort((a, b) => b.score - a.score).map((source) => source.id);

  if (!citations.length) {
    return {
      text: <>I couldn’t find enough relevant material in this course preview to answer that confidently. Try a question about TCP, UDP, routing, subnetting, or upload the lecture notes you want to study.</>,
      citations: [],
      mode: 'insufficient-context',
    };
  }

  if (citations.includes('tcp') && citations.includes('ports')) {
    return { text: firstAnswer.text, citations: ['tcp', 'ports'], mode: 'preview' };
  }

  const primarySource = citations[0];
  return {
    text: <>Based on the indexed course preview: {previewPassages[primarySource].answer}</>,
    citations: [primarySource],
    mode: 'preview',
  };
}

function sourceFromCitation(citation) {
  return {
    id: `chunk-${citation.chunk_id}`,
    title: citation.document_title,
    meta: 'PDF · retrieved chunk',
    pages: `p. ${citation.page_number}`,
    updated: 'Retrieved just now',
  };
}

function Citation({ source, onOpen }) {
  return (
    <button className="citation" onClick={() => onOpen(source.id)} type="button">
      <span className="citation-mark">{source.id === 'tcp' ? '1' : '2'}</span>
      <span>
        <strong>{source.title}</strong>
        <small>{source.pages}</small>
      </span>
      <Icon name="arrow" size={15} />
    </button>
  );
}

function App() {
  const [courses, setCourses] = useState(initialCourses);
  const [selectedCourse, setSelectedCourse] = useState('net');
  const [activeConversation, setActiveConversation] = useState(1);
  const [messages, setMessages] = useState([
    { id: 'question-1', role: 'user', text: 'What is the difference between TCP and UDP?' },
    firstAnswer,
  ]);
  const [query, setQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState('tcp');
  const [showInspector, setShowInspector] = useState(() => window.innerWidth > 760);
  const [toast, setToast] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [sources, setSources] = useState(initialSourceDocuments);
  const [account, setAccount] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState('register');
  const [authForm, setAuthForm] = useState({ email: '', password: '', firstName: '', lastName: '' });
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [resources, setResources] = useState([]);
  const [selectedResourceId, setSelectedResourceId] = useState(null);
  const [focusTopic, setFocusTopic] = useState('');
  const fileInput = useRef(null);

  const currentCourse = courses.find((course) => course.id === selectedCourse) ?? courses[0];
  const activeSource = useMemo(
    () => sources.find((document) => document.id === selectedSource) ?? sources[0],
    [selectedSource],
  );
  const latestAnswer = [...messages].reverse().find((message) => message.role === 'assistant');
  const evidenceSources = (latestAnswer?.citations ?? []).map((id) => sources.find((source) => source.id === id)).filter(Boolean);
  const hasEvidence = evidenceSources.length > 0;
  const canPreviewSource = hasEvidence && !String(activeSource?.id ?? '').startsWith('chunk-');

  const greetingName = account?.display_name?.trim() || '';
  const welcomeQuestion = greetingName
    ? `What are you working through, ${greetingName.split(/\s+/)[0]}?`
    : 'What are you working through?';
  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };

  const addCourse = () => {
    const exists = courses.some((course) => course.id === 'research');
    if (!exists) {
      setCourses((items) => [...items, { id: 'research', name: 'Research Methods', code: 'CS 310', color: '#e5c16d', count: 0 }]);
      setSelectedCourse('research');
      notify('Research Methods is ready for its first document.');
      return;
    }
    setSelectedCourse('research');
    notify('Research Methods is already in your library.');
  };

  const connectAccount = async (event) => {
    event.preventDefault();
    setAuthError('');
    try {
      setIsAuthenticating(true);
      const user = await authenticate({ ...authForm, register: authMode === 'register' });
      const documents = await listDocuments();
      const setup = await provisionWorkspace();
      const linkedCourse = { id: String(setup.course.id), name: setup.course.title, code: setup.course.code, color: setup.course.color, count: setup.course.documents_count };
      setAccount(user);
      setResources(documents.filter((document) => document.course === setup.course.id));
      setSelectedResourceId((documents.find((document) => document.course === setup.course.id) ?? {}).id ?? null);
      setWorkspace({ courseId: setup.course.id, conversationId: setup.conversation.id });
      setCourses((items) => [linkedCourse, ...items.filter((course) => course.id !== linkedCourse.id)]);
      setSelectedCourse(linkedCourse.id);
      setShowAuth(false);
      notify(`Connected as ${user.display_name}. Upload a PDF to start studying.`);
    } catch (error) {
      setAuthError(apiErrorMessage(error));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const sendQuestion = async (event) => {
    event.preventDefault();
    const cleaned = query.trim();
    if (!cleaned || isAnswering) return;

    const timestamp = Date.now();
    const userMessage = { id: `question-${timestamp}`, role: 'user', text: cleaned };
    setMessages((items) => [...items, userMessage]);
    setQuery('');
    setShowInspector(true);

    if (!workspace) {
      const preview = answerFromPreview(cleaned);
      setMessages((items) => [...items, { id: `answer-${timestamp}`, role: 'assistant', ...preview }]);
      if (preview.citations.length) setSelectedSource(preview.citations[0]);
      return;
    }

    if (!selectedResourceId) {
      setMessages((items) => [...items, { id: `answer-${timestamp}`, role: 'assistant', text: 'Select one uploaded PDF before asking a question, so I can keep the answer tied to that resource.', citations: [], mode: 'insufficient-context' }]);
      notify('Select an uploaded PDF to ask from it.');
      return;
    }

    try {
      setIsAnswering(true);
      const answer = await askCourseQuestion(workspace.conversationId, cleaned, selectedResourceId, focusTopic);
      const apiSources = answer.citations.map(sourceFromCitation);
      setSources((items) => [...apiSources, ...items.filter((source) => !apiSources.some((next) => next.id === source.id))]);
      setMessages((items) => [...items, {
        id: `answer-${answer.id}`,
        role: 'assistant',
        text: answer.content,
        citations: apiSources.map((source) => source.id),
        mode: answer.generation_mode,
      }]);
      if (apiSources.length) setSelectedSource(apiSources[0].id);
    } catch (error) {
      const message = apiErrorMessage(error);
      setMessages((items) => [...items, { id: `answer-${timestamp}`, role: 'assistant', text: message, citations: [], mode: 'api-error' }]);
      notify(message);
    } finally {
      setIsAnswering(false);
    }
  };

  const uploadDocument = async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    if (!workspace) {
      setShowAuth(true);
      notify('Sign in first so Acadexa can save this PDF to your course.');
      return;
    }
    try {
      const document = await uploadPdf({ courseId: workspace.courseId, file });
      setUploadedFile(`${document.original_filename} · ${document.status}`);
      setResources((items) => [document, ...items.filter((item) => item.id !== document.id)]);
      setSelectedResourceId(document.id);
      if (document.status === 'failed') {
        notify(document.extraction_error || 'Acadexa could not process that PDF.');
        return;
      }
      notify(`${document.original_filename} is saved and ready to answer from.`);
    } catch (error) {
      notify(apiErrorMessage(error));
    } finally {
      event.target.value = '';
    }
  };

  const newConversation = async () => {
    setMessages([]);
    setActiveConversation(null);
    setQuery('');
    if (workspace) {
      try {
        const conversation = await createConversation(workspace.courseId);
        setWorkspace((current) => ({ ...current, conversationId: conversation.id }));
        notify(`New conversation started in ${currentCourse.name}.`);
        return;
      } catch (error) {
        notify(apiErrorMessage(error));
      }
    }
    notify(`New conversation started in ${currentCourse.name}.`);
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <a className="brand" href="#top" aria-label="Acadexa home"><span className="brand-mark"><span/></span>acadexa</a>
          <button className="icon-button sidebar-more" type="button" aria-label="More workspace options"><Icon name="dots" size={20}/></button>
        </div>

        <div className="sidebar-upload">
          <div><span className="upload-icon"><Icon name="upload" size={17}/></span><p><strong>Add a new source</strong><small>PDF lecture notes or study guides</small></p></div>
          <button type="button" onClick={() => account ? fileInput.current?.click() : setShowAuth(true)}>Upload</button>
        </div>

        <nav className="primary-nav" aria-label="Primary">
          <a className="nav-link active" href="#workspace"><Icon name="bubble"/>Ask Acadexa</a>
        </nav>

        <section className="course-nav" id="resources" aria-labelledby="resources-heading">
          <div className="section-label"><span id="resources-heading">Your resources</span><button type="button" onClick={() => account ? fileInput.current?.click() : setShowAuth(true)} aria-label="Upload resource"><Icon name="upload" size={16}/></button></div>
          <div className="course-list">
            {!account ? <p className="sidebar-empty">Sign in to view your saved PDFs.</p> : resources.length ? resources.map((document) => <button className={`course-link ${selectedResourceId === document.id ? 'selected' : ''}`} key={document.id} onClick={() => setSelectedResourceId(document.id)} type="button"><Icon name="file" size={15}/><span>{document.title}</span><small>{document.page_count}p</small></button>) : <p className="sidebar-empty">No PDFs yet. Update resources to add one.</p>}
          </div>
        </section>
        {false && <label className="topic-focus sidebar-topic"><span>Focus topic</span><input list="topic-suggestions" value={focusTopic} onChange={(event) => setFocusTopic(event.target.value)} placeholder="e.g. Warehousing"/><datalist id="topic-suggestions"><option value="Warehousing"/><option value="Inventory management"/><option value="Transportation"/><option value="Procurement"/><option value="Supply chain"/></datalist></label>}

        <div className="sidebar-user">
          <div className="avatar">KK</div><div><strong>Kelvin Kigen</strong><span>Student account</span></div><Icon name="chevron" size={17}/>
        </div>
      </aside>

      <section className="workspace" id="workspace">
        <header className="workspace-header" id="top">
          <div className="crumb"><span className="course-dot" style={{ background: currentCourse.color }}/><button type="button" onClick={() => notify(`${currentCourse.name} is the active library.`)}>{currentCourse.name}</button><Icon name="chevron" size={16}/></div>
          <div className="header-actions">
            {account ? <span className="account-status"><Icon name="user" size={15}/>{account.display_name}</span> : <button className="text-button" type="button" onClick={() => { setAuthMode('login'); setShowAuth(true); }}><Icon name="user" size={16}/>Sign in</button>}
            <button className="text-button" type="button" onClick={() => notify('Sharing is enabled when your account is connected.')}><Icon name="link" size={16}/>Share</button>
            <button className="icon-button" type="button" aria-label="Workspace options"><Icon name="dots" size={20}/></button>
          </div>
        </header>

        <div className="chat-stage">
          <div className="chat-heading">
            <p className="eyebrow">Source-grounded study assistant</p>
            <h1>{welcomeQuestion}</h1>
            <p>Ask about your course material. Every answer is designed to point you back to the page it came from.</p>
          </div>

          <div className="messages" aria-live="polite">
            {messages.length === 0 && <div className="empty-conversation"><span className="empty-spark"><Icon name="spark" size={20}/></span><h2>A fresh page.</h2><p>Ask a focused question or upload a lecture note to begin.</p></div>}
            {messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                {message.role === 'assistant' && <div className="assistant-avatar"><Icon name="spark" size={17}/></div>}
                <div className="message-body">
                  <div className="message-label">{message.role === 'user' ? 'You' : message.mode === 'insufficient-context' ? 'Acadexa · Insufficient material' : message.mode === 'preview' ? 'Acadexa · Course preview' : 'Acadexa'}</div>
                  <div className="message-copy">{message.text}</div>
                  {message.citations && <div className="citations">{message.citations.map((citationId) => <Citation source={sources.find((source) => source.id === citationId)} key={citationId} onOpen={(id) => { setSelectedSource(id); setShowInspector(true); }}/>)}</div>}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={sendQuestion}>
            <textarea value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Ask anything about ${currentCourse.name}…`} rows="1" aria-label="Ask Acadexa" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }}/>
            <div className="composer-bottom"><button className="attach-button" type="button" onClick={() => fileInput.current?.click()}><Icon name="plus" size={16}/>Add context</button><span className="composer-hint">⌘ ↵ to send</span><button className="send-button" type="submit" aria-label="Send question"><Icon name="send" size={17}/></button></div>
          </form>
          <input ref={fileInput} type="file" accept="application/pdf" className="visually-hidden" onChange={uploadDocument}/>
          <p className="grounding-note"><Icon name="spark" size={14}/>{focusTopic ? `Focused on: ${focusTopic}.` : 'Select a resource and optionally set a topic before asking.'}</p>
        </div>
      </section>

      {showInspector && <aside className="inspector" aria-label="Sources">
        <header className="inspector-header"><div><p className="eyebrow">Answer evidence</p><h2>Sources</h2></div><button className="icon-button" type="button" onClick={() => setShowInspector(false)} aria-label="Close sources"><Icon name="close" size={19}/></button></header>
        <div className="source-count"><span><Icon name="spark" size={15}/>{hasEvidence ? `${evidenceSources.length} verified source${evidenceSources.length === 1 ? '' : 's'}` : 'No matching sources'}</span><small>{hasEvidence ? 'Matched to this answer' : 'Ask about the indexed material'}</small></div>
        <div className="source-list">
          {evidenceSources.map((source, index) => <button className={`source-item ${selectedSource === source.id ? 'open' : ''}`} key={source.id} onClick={() => setSelectedSource(source.id)} type="button"><span className="source-number">{index + 1}</span><span className="source-info"><strong>{source.title}</strong><small>{source.pages} · {source.meta}</small></span><Icon name="chevron" size={16}/></button>)}
        </div>
        {workspace && <div className="resource-picker"><p>Ask from this uploaded PDF</p>{resources.length ? resources.map((document) => <button className={`resource-option ${selectedResourceId === document.id ? 'selected' : ''}`} type="button" key={document.id} onClick={() => setSelectedResourceId(document.id)}><Icon name="file" size={15}/><span><strong>{document.title}</strong><small>{document.page_count} page{document.page_count === 1 ? '' : 's'} · {document.status}</small></span></button>) : <span className="resource-empty">Upload a PDF, then select it here.</span>}</div>}
        {workspace && <label className="topic-focus"><span>Focus topic</span><input list="topic-suggestions" value={focusTopic} onChange={(event) => setFocusTopic(event.target.value)} placeholder="e.g. Warehousing"/><datalist id="topic-suggestions"><option value="Warehousing"/><option value="Inventory management"/><option value="Transportation"/><option value="Procurement"/><option value="Supply chain"/></datalist></label>}
        {canPreviewSource && <div className="document-preview">
          <div className="paper">
            <div className="paper-top"><span>CS 304 · COMPUTER NETWORKS</span><span>{activeSource.pages}</span></div>
            <h3>{activeSource.title.replace('Lecture 05 — ', '')}</h3>
            <div className="paper-rule"/><p><mark>TCP provides a reliable, connection-oriented service to applications.</mark> It uses acknowledgements, sequence numbers, and flow control to support ordered delivery.</p><p>UDP offers a connectionless datagram service. Applications that value low latency and can tolerate loss may choose UDP.</p>
            <div className="paper-lines"><i/><i/><i/><i/></div>
          </div>
          <button className="open-source" type="button" onClick={() => notify(`${activeSource.title} would open at ${activeSource.pages}.`)}><Icon name="file" size={16}/>Open source document<Icon name="arrow" size={16}/></button>
        </div>}
      </aside>}

      {!showInspector && <button className="open-inspector" type="button" onClick={() => setShowInspector(true)}><Icon name="book" size={17}/>Show sources</button>}
      {showAuth && <div className="auth-backdrop" role="presentation"><form className="auth-dialog" onSubmit={connectAccount}><button className="auth-close" type="button" onClick={() => setShowAuth(false)} aria-label="Close">×</button><p className="eyebrow">Secure workspace</p><h2>{authMode === 'register' ? 'Create your Acadexa account' : 'Welcome back'}</h2><p>Sign in to save PDFs to your own course library.</p><label>Email<input type="email" required value={authForm.email} onChange={(event) => setAuthForm((form) => ({ ...form, email: event.target.value }))}/></label><label>Password<input type="password" minLength="12" required value={authForm.password} onChange={(event) => setAuthForm((form) => ({ ...form, password: event.target.value }))}/></label>{authError && <p className="auth-error">{authError}</p>}<div className="auth-actions"><button type="button" onClick={() => { setAuthMode((mode) => mode === 'register' ? 'login' : 'register'); setAuthError(''); }}>{authMode === 'register' ? 'I already have an account' : 'Create an account'}</button><button type="submit" disabled={isAuthenticating}>{isAuthenticating ? 'Connecting…' : authMode === 'register' ? 'Create account' : 'Sign in'}</button></div></form></div>}
      {toast && <div className="toast" role="status"><Icon name="spark" size={16}/>{toast}</div>}
    </main>
  );
}

export default App;
