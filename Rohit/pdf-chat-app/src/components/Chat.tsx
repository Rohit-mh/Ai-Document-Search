import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import { FaFilePdf, FaComments, FaGlobe, FaCog, FaTrash, FaUpload, FaInfoCircle, FaBars, FaTimes } from 'react-icons/fa';

interface PDFItem {
  file_id: string;
  filename: string;
}

const API_BASE = 'http://localhost:8000';

const TUTORIAL_STEPS = [
  {
    title: 'Welcome to Hermes!',
    content: 'Hermes is your smart PDF assistant. I will guide you through the main features.'
  },
  {
    title: 'Step 1: Upload a PDF',
    content: 'Click the "Browse" button or drag & drop a PDF file to upload. PDFs are processed securely.'
  },
  {
    title: 'Step 2: Select a PDF',
    content: 'Choose a PDF from the sidebar to start asking questions about its content.'
  },
  {
    title: 'Step 3: Ask Questions',
    content: 'Type your question in the input box and click "Submit Question". Hermes will analyze your PDF and answer.'
  },
  {
    title: 'Step 4: View Answers & History',
    content: 'See answers in the main panel. You can also view and clear your chat history.'
  },
  {
    title: 'Step 5: Manage PDFs',
    content: 'Delete PDFs you no longer need using the red X button next to each file.'
  },
  {
    title: 'All Set!',
    content: 'You are ready to use Hermes. Enjoy exploring your PDFs with AI!'
  }
];

const Chat = () => {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [languages, setLanguages] = useState<string[]>(["English"]);
  const [answerFormats, setAnswerFormats] = useState<string[]>(["points"]);
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [selectedFormat, setSelectedFormat] = useState('points');
  const [responseLanguage, setResponseLanguage] = useState('English');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfFilename, setPdfFilename] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [pdfList, setPdfList] = useState<PDFItem[]>([]);
  const [pdfFileId, setPdfFileId] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ question: string, answer: string }[]>([]);
  const [chatError, setChatError] = useState('');
  const [selectedHistoryIdx, setSelectedHistoryIdx] = useState<number | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [answerPage, setAnswerPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingPdf, setPendingPdf] = useState<File | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<number | null>(() => {
    return localStorage.getItem('hermes_tutorial_done') ? null : 0;
  });
  const [answerImages, setAnswerImages] = useState<string[]>([]);

  // Fetch chat history for selected PDF
  const fetchChatHistory = async () => {
    try {
      const res = await axios.get(`${API_BASE}/chat-history?file_id=${encodeURIComponent(pdfFileId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setChatHistory(res.data);
    } catch {
      setChatHistory([]);
    }
  };

  // Fetch user's PDFs
  const fetchPDFs = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/user-pdfs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Deduplicate by filename
      const pdfArray = res.data as PDFItem[];
      const uniquePDFs: PDFItem[] = Array.from(
        new Map(pdfArray.map((pdf: PDFItem) => [pdf.filename, pdf])).values()
      );
      setPdfList(uniquePDFs);
      if (uniquePDFs.length > 0 && !pdfFileId) {
        setPdfFileId(uniquePDFs[0].file_id);
      }
    } catch {
      setPdfList([]);
    }
  }, [token, pdfFileId]);

  useEffect(() => {
    axios.get(`${API_BASE}/options/languages`).then(res => setLanguages(res.data));
    axios.get(`${API_BASE}/options/answer-formats`).then(res => setAnswerFormats(res.data));
    fetchPDFs();
  }, [fetchPDFs]);

  useEffect(() => {
    if (pdfFileId) fetchChatHistory();
    // eslint-disable-next-line
  }, [pdfFileId]);

  const handlePdfChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 500 * 1024 * 1024) {
        setToastMsg('❌ Only PDFs under 500MB allowed');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
        return;
      }
      setPendingPdf(file);
      setPdfFile(file);
      setUploadStatus('');
      setUploadProgress(0);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 500 * 1024 * 1024) {
        setToastMsg('❌ Only PDFs under 500MB allowed');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
        return;
      }
      setPendingPdf(file);
      setPdfFile(file);
      setUploadStatus('');
      setUploadProgress(0);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handlePdfUpload = async () => {
    if (!pendingPdf) return;
    setUploadStatus('Uploading...');
    setUploadProgress(0);
    const formData = new FormData();
    formData.append('file', pendingPdf);
    try {
      const res = await axios.post(`${API_BASE}/upload-pdf`, formData, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
          }
        },
      });
      setPdfFileId(res.data.file_id);
      setUploadStatus('Uploaded');
      setUploadProgress(100);
      setPendingPdf(null);
      fetchPDFs();
    } catch (err: any) {
      setUploadStatus(err.response?.data?.error || 'Upload failed');
      setUploadProgress(0);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAnswer('');
    setAnswerImages([]);
    setChatError('');
    try {
      const formData = new FormData();
      formData.append('question', question);
      formData.append('file_id', pdfFileId);
      formData.append('answer_format', selectedFormat);
      formData.append('response_language', responseLanguage);
      const res = await axios.post(`${API_BASE}/chat`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAnswer(res.data.answer);
      setAnswerImages(res.data.images || []);
      setChatHistory(prev => [...prev, { question, answer: res.data.answer }]);
      setQuestion('');
      setPdfList((prev: PDFItem[]) => prev.filter((pdf: PDFItem) => pdf.file_id !== pdfFileId));
      setPdfFileId('');
    } catch (err: any) {
      setAnswer('');
      setAnswerImages([]);
      setChatError(err.response?.data?.error || 'Error getting answer.');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleDeleteHistory = async (idx: number) => {
    setChatHistory(prev => prev.filter((_, i) => i !== idx));
    if (selectedHistoryIdx === idx) setSelectedHistoryIdx(null);
  };

  // Add a handler to delete a PDF
  const handleDeletePdf = async (fileId: string) => {
    try {
      await axios.delete(`${API_BASE}/delete-pdf?file_id=${encodeURIComponent(fileId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPdfList(prev => prev.filter(pdf => pdf.file_id !== fileId));
      if (pdfFileId === fileId) setPdfFileId('');
    } catch (err) {
      setToastMsg('Failed to delete PDF');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  };

  const handleNextTutorial = () => {
    if (tutorialStep !== null && tutorialStep < TUTORIAL_STEPS.length - 1) {
      setTutorialStep(tutorialStep + 1);
    } else {
      setTutorialStep(null);
      localStorage.setItem('hermes_tutorial_done', '1');
    }
  };
  const handleSkipTutorial = () => {
    setTutorialStep(null);
    localStorage.setItem('hermes_tutorial_done', '1');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: '#e0e5ec' }}>
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 shadow" style={{ background: '#e0e5ec' }}>
        <button onClick={() => setSidebarOpen(true)} className="text-2xl text-[#232344] focus:outline-none">
          <FaBars />
        </button>
        <h1 className="text-xl font-bold" style={{ color: '#232344' }}>Hermes</h1>
        <div style={{ width: 32 }} /> {/* Spacer for symmetry */}
      </div>
      {/* Sidebar Drawer for Mobile */}
      <div
        className={`fixed inset-0 z-40 bg-black bg-opacity-40 transition-opacity duration-300 md:hidden ${sidebarOpen ? 'block' : 'hidden'}`}
        onClick={() => setSidebarOpen(false)}
      ></div>
      <aside
        className={`fixed z-50 top-0 left-0 h-full w-72 bg-[#e0e5ec] p-6 flex flex-col gap-8 shadow-lg transform transition-transform duration-300 md:static md:translate-x-0 md:w-96 md:p-8 md:shadow-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:flex`}
        style={{ boxShadow: '8px 0 24px #b8bac0, -8px 0 24px #ffffff' }}
      >
        {/* Close button for mobile */}
        <button
          className="md:hidden absolute top-4 right-4 text-2xl text-[#232344] focus:outline-none"
          onClick={() => setSidebarOpen(false)}
        >
          <FaTimes />
        </button>
        <button onClick={handleLogout} className="mb-6 text-left text-primary-400 hover:underline">Logout</button>
        {/* PDFs Section */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl font-bold" style={{ color: '#232344' }}><FaFilePdf className="inline mr-2 text-[#A78BFA]" />Your PDFs</span>
          </div>
          {/* In the 'Your PDFs' section, show each PDF as a row with a delete (X) button */}
          {pdfList.length > 0 ? (
            <div className="mb-4">
              {pdfList.map(pdf => (
                <div key={pdf.file_id} className="flex items-center justify-between rounded-xl px-2 py-1 mb-2" style={{ background: '#d1d9e6', boxShadow: '2px 2px 8px #b8bac0, -2px -2px 8px #ffffff' }}>
                  <button
                    className={`flex-1 text-left px-2 py-2 rounded-lg font-semibold flex items-center gap-2 ${pdfFileId === pdf.file_id ? 'bg-[#7ed6df] text-[#232344]' : 'text-[#232344]'}`}
                    style={pdfFileId === pdf.file_id ? { background: '#7ed6df', color: '#232344' } : {}}
                    onClick={() => setPdfFileId(pdf.file_id)}
                  >
                    <FaFilePdf className="inline mr-2 text-[#A78BFA]" />{pdf.filename}
                  </button>
                  <button
                    className="ml-2 text-red-400 hover:text-red-600 text-lg font-bold px-2"
                    onClick={() => handleDeletePdf(pdf.file_id)}
                    title="Delete PDF"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-400 mb-4">No PDFs available. Upload a PDF to get started.</div>
          )}
        </div>
        {/* Chat History Section */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl font-bold" style={{ color: '#232344' }}><FaComments className="inline mr-2 text-[#4FD1C5]" />Chat History</span>
          </div>
          {chatHistory.length > 0 ? (
            <select
              className="w-full p-2 rounded bg-[#e0e5ec] text-[#232344] mb-4 shadow-inner"
              value={selectedHistoryIdx !== null ? selectedHistoryIdx : ''}
              onChange={e => setSelectedHistoryIdx(Number(e.target.value))}
            >
              <option value="">Select a chat</option>
              {chatHistory.slice(-5).map((item, idx) => (
                <option key={idx} value={idx}>
                  💬 {pdfList.find(pdf => pdf.file_id === pdfFileId)?.filename || 'PDF'} - Chat {chatHistory.length - 5 + idx + 1} - {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-gray-400 mb-4">No chats yet.</div>
          )}
          {selectedHistoryIdx !== null && chatHistory[selectedHistoryIdx] && (
            <div className="bg-[#d1d9e6] p-4 rounded shadow mb-2 flex flex-col gap-2 relative">
              <button
                className="absolute top-2 right-2 text-red-400 hover:text-red-600"
                onClick={() => handleDeleteHistory(selectedHistoryIdx)}
                title="Delete this chat"
              >
                <FaTrash />
              </button>
              <div className="font-semibold text-primary-400 mb-2">Q: {chatHistory[selectedHistoryIdx].question}</div>
              <div className="text-gray-200 mb-2">A: {chatHistory[selectedHistoryIdx].answer}</div>
            </div>
          )}
          {chatHistory.length > 0 && (
            <button
              className="text-xs text-gray-400 hover:text-red-400 flex items-center gap-1 mt-2"
              onClick={() => { setChatHistory([]); setSelectedHistoryIdx(null); }}
              title="Clear all chat history"
            >
              <span>✖</span> Clear History
            </button>
          )}
        </div>
        {/* Menu Section */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FaCog className="inline text-[#A78BFA]" />
            <span className="text-xl font-bold" style={{ color: '#232344' }}>Menu</span>
          </div>
          <label className="block mb-2 flex items-center gap-1 font-bold" style={{ color: '#232344' }}>Select Answer Format <FaInfoCircle title="Choose how you want the answer to be formatted." className="text-[#CBD5E0] cursor-pointer" /></label>
          <select
            className="w-full p-2 rounded bg-[#e0e5ec] text-[#232344] mb-4 shadow-inner"
            value={selectedFormat}
            onChange={e => setSelectedFormat(e.target.value)}
            style={{ boxShadow: 'inset 2px 2px 6px #b8bac0, inset -2px -2px 6px #ffffff' }}
          >
            {answerFormats.map(fmt => (
              <option key={fmt} value={fmt}>{fmt}</option>
            ))}
          </select>
          <label className="block mb-2 flex items-center gap-1 font-bold" style={{ color: '#232344' }}>Select Language for the Response <FaInfoCircle title="Choose the language for Hermes' answer." className="text-[#CBD5E0] cursor-pointer" /></label>
          <select
            className="w-full p-2 rounded bg-[#e0e5ec] text-[#232344] mb-4 shadow-inner"
            value={responseLanguage}
            onChange={e => setResponseLanguage(e.target.value)}
            style={{ boxShadow: 'inset 2px 2px 6px #b8bac0, inset -2px -2px 6px #ffffff' }}
          >
            {languages.map(lang => (
              <option key={lang} value={lang}>🌐 {lang}</option>
            ))}
          </select>
        </div>
        {/* PDF Upload Section */}
        <div>
          <label className="block mb-2 flex items-center gap-1 font-bold" style={{ color: '#232344' }}>Upload your PDF Files <FaInfoCircle title="Upload a PDF file (max 500MB)." className="text-[#CBD5E0] cursor-pointer" /></label>
          <div
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-4 mb-2 transition-colors duration-200`}
            style={{ borderColor: '#b8bac0', background: '#e0e5ec', boxShadow: '2px 2px 8px #b8bac0, -2px -2px 8px #ffffff' }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              ref={fileInputRef}
              onChange={handlePdfChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-[#4fc3df] hover:bg-[#7ed6df] text-white px-4 py-2 rounded cursor-pointer shadow-md transition-all duration-200 flex items-center gap-2 mb-2"
              style={{ boxShadow: '2px 2px 8px #b8bac0, -2px -2px 8px #ffffff' }}
            >
              <FaUpload /> Browse
            </button>
            <span className="text-gray-400 text-xs mb-2">or drag & drop here</span>
            {pendingPdf && <div className="text-[#4FD1C5] text-sm font-semibold">{pendingPdf.name}</div>}
          </div>
          {pendingPdf && (
            <button
              onClick={handlePdfUpload}
              className={`bg-[#4fc3df] hover:bg-[#7ed6df] text-white px-4 py-2 rounded shadow-md mt-2 transition-all duration-200 flex items-center gap-2 ${uploadStatus === 'Uploaded' ? 'opacity-60 cursor-default' : ''}`}
              style={{ boxShadow: '2px 2px 8px #b8bac0, -2px -2px 8px #ffffff' }}
              disabled={uploadStatus === 'Uploaded' || (uploadProgress > 0 && uploadProgress < 100)}
            >
              <FaUpload />
              {uploadProgress > 0 && uploadProgress < 100
                ? `Uploading... ${uploadProgress}%`
                : uploadStatus === 'Uploaded'
                  ? 'Uploaded'
                  : 'Upload'}
            </button>
          )}
          {uploadStatus && <div className="text-sm text-green-400 mb-2">{uploadStatus}</div>}
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="w-full bg-[#d1d9e6] rounded h-2 mb-2">
              <div className="bg-[#4fc3df] h-2 rounded" style={{ width: `${uploadProgress}%` }}></div>
            </div>
          )}
          <div className="text-sm text-gray-400 mb-2">Limit 500MB per file • PDF</div>
        </div>
        {/* Toast Notification */}
        {showToast && (
          <div className="fixed top-6 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded shadow-lg z-50 flex items-center gap-2">
            <FaInfoCircle /> {toastMsg}
          </div>
        )}
      </aside>
      {/* Main Panel */}
      <main className="flex-1 flex flex-col items-center justify-start p-4 md:p-12" style={{ background: '#e0e5ec' }}>
        <h1 className="text-2xl md:text-4xl font-bold mb-4 text-center" style={{ color: '#232344' }}>Hermes <span className="text-[#4FD1C5]">– Your Smart PDF Assistant</span></h1>
        <form onSubmit={handleSubmit} className="w-full max-w-2xl mb-8 flex flex-col gap-4">
          <label className="block mb-2 text-base md:text-lg" style={{ color: '#232344' }}>Ask Hermes a Question:</label>
          <div className="relative">
            <textarea
              className="w-full p-4 md:p-6 rounded-2xl mb-2 min-h-[100px] md:min-h-[120px] text-base md:text-lg focus:outline-none focus:ring-2 focus:ring-[#4FD1C5] placeholder-gray-400 pr-12 animate-pulse-cursor"
              style={{ background: '#e0e5ec', color: '#232344', boxShadow: 'inset 2px 2px 8px #b8bac0, inset -2px -2px 8px #ffffff', resize: 'vertical', fontFamily: 'inherit' }}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Type your question here..."
              required
            />
            <button
              type="button"
              className="absolute right-12 top-4 md:top-6 text-gray-400 hover:text-red-400 text-xl font-bold focus:outline-none"
              onClick={() => setQuestion('')}
              title="Clear question"
              style={{ zIndex: 2 }}
            >
              ×
            </button>
            <span className="absolute right-6 top-4 md:top-6 text-[#4FD1C5] animate-pulse">|</span>
          </div>
          <button
            type="submit"
            className="px-8 py-3 rounded-2xl text-xl font-semibold shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#4FD1C5] flex items-center justify-center gap-2 text-white"
            style={{ background: '#4fc3df', boxShadow: '2px 2px 8px #b8bac0, -2px -2px 8px #ffffff' }}
            disabled={loading || !pdfFileId}
          >
            {loading && <span className="loader mr-2"></span>}
            Submit Question
          </button>
        </form>
        {chatError && <div className="text-red-400 mt-4">{chatError}</div>}
        {answer && (
          <div className="mt-8 w-full max-w-2xl p-4 md:p-8 rounded-2xl shadow-lg flex flex-col gap-4" style={{ background: '#e0e5ec', boxShadow: '2px 2px 8px #b8bac0, -2px -2px 8px #ffffff' }}>
            <h2 className="text-lg md:text-xl font-semibold mb-2 text-[#4FD1C5]">Hermes' Answer:</h2>
            {/* Paginated answer bubble */}
            {Array.isArray(answer) ? (
              <>
                <div className="p-4 md:p-6 rounded-xl shadow-inner text-base md:text-lg whitespace-pre-line" style={{ background: '#e0e5ec', color: '#232344', boxShadow: 'inset 2px 2px 8px #b8bac0, inset -2px -2px 8px #ffffff' }}>
                  {answer[answerPage]}
                </div>
                <div className="flex justify-between mt-2">
                  <button
                    className="text-[#A78BFA] hover:text-[#4FD1C5] px-4 py-1 rounded"
                    onClick={() => setAnswerPage(p => Math.max(0, p - 1))}
                    disabled={answerPage === 0}
                  >Prev</button>
                  <span className="text-[#232344]">Page {answerPage + 1} / {answer.length}</span>
                  <button
                    className="text-[#A78BFA] hover:text-[#4FD1C5] px-4 py-1 rounded"
                    onClick={() => setAnswerPage(p => Math.min(answer.length - 1, p + 1))}
                    disabled={answerPage === answer.length - 1}
                  >Next</button>
                </div>
              </>
            ) : (
              <div className="p-4 md:p-6 rounded-xl shadow-inner text-base md:text-lg whitespace-pre-line" style={{ background: '#e0e5ec', color: '#232344', boxShadow: 'inset 2px 2px 8px #b8bac0, inset -2px -2px 8px #ffffff' }}>
                {answer}
              </div>
            )}
            {/* Display images if present */}
            {answerImages.length > 0 && (
              <div className="flex flex-wrap gap-4 mt-4 justify-center">
                {answerImages.map((imgUrl, idx) => (
                  <div key={idx} className="rounded-lg overflow-hidden border border-gray-300 bg-white shadow" style={{ maxWidth: 320 }}>
                    <img src={imgUrl} alt={`PDF Image ${idx + 1}`} className="w-full h-auto object-contain" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Pulsing cursor animation CSS */}
        <style>{`
          .animate-pulse-cursor::after {
            content: '';
            display: inline-block;
            width: 2px;
            height: 1.2em;
            background: #4FD1C5;
            margin-left: 2px;
            animation: pulse-cursor 1s steps(2, start) infinite;
            vertical-align: middle;
          }
          @keyframes pulse-cursor {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
          .loader {
            border: 4px solid #CBD5E0;
            border-top: 4px solid #4FD1C5;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </main>
      {/* Tutorial Modal */}
      {tutorialStep !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full flex flex-col items-center gap-4 relative animate-fade-in">
            <h2 className="text-2xl font-bold text-[#232344] mb-2 text-center">{TUTORIAL_STEPS[tutorialStep].title}</h2>
            <p className="text-gray-700 text-center mb-4">{TUTORIAL_STEPS[tutorialStep].content}</p>
            <div className="flex gap-4 w-full justify-center">
              <button
                className="px-6 py-2 rounded-lg bg-[#4fc3df] text-white font-semibold shadow hover:bg-[#7ed6df] transition"
                onClick={handleNextTutorial}
              >
                {tutorialStep === TUTORIAL_STEPS.length - 1 ? 'Finish' : 'Next'}
              </button>
              <button
                className="px-6 py-2 rounded-lg bg-gray-200 text-[#232344] font-semibold shadow hover:bg-gray-300 transition"
                onClick={handleSkipTutorial}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat; 