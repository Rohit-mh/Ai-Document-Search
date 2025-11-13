import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './components/Login';
import Register from './components/Register';
import Chat from './components/Chat';

const API_BASE = 'http://localhost:8000';

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/login" />;
};

const App: React.FC = () => {
  // State for options
  const [languages, setLanguages] = useState<string[]>([]);
  const [answerFormats, setAnswerFormats] = useState<string[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [selectedFormat, setSelectedFormat] = useState('points');
  const [responseLanguage, setResponseLanguage] = useState('English');

  // State for PDF upload
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfFilename, setPdfFilename] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');

  // State for chat
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch options on mount
  useEffect(() => {
    axios.get(`${API_BASE}/options/languages`).then(res => setLanguages(res.data));
    axios.get(`${API_BASE}/options/answer-formats`).then(res => setAnswerFormats(res.data));
  }, []);

  // Handle PDF upload
  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPdfFile(e.target.files[0]);
    }
  };

  const handlePdfUpload = async () => {
    if (!pdfFile) return;
    setUploadStatus('Uploading...');
    const formData = new FormData();
    formData.append('file', pdfFile);
    try {
      const res = await axios.post(`${API_BASE}/upload-pdf`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPdfFilename(res.data.filename);
      setUploadStatus('Upload successful!');
    } catch (err: any) {
      setUploadStatus(err.response?.data?.error || 'Upload failed');
    }
  };

  // Handle chat
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAnswer('');
    try {
      const formData = new FormData();
      formData.append('question', question);
      formData.append('pdf_filename', pdfFilename);
      formData.append('answer_format', selectedFormat);
      formData.append('response_language', responseLanguage);
      const res = await axios.post(`${API_BASE}/chat`, formData);
      setAnswer(res.data.answer);
    } catch (err: any) {
      setAnswer('Error getting answer.');
    }
    setLoading(false);
  };

  useEffect(() => {
    document.title = 'Hermes';
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/chat" element={<PrivateRoute><Chat /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/chat" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
