import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { FaUser, FaLock } from 'react-icons/fa';

const Register = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await axios.post('http://localhost:8000/register', new URLSearchParams({
        username, password
      }));
      navigate('/login');
    } catch {
      setError('Registration failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#e0e5ec' }}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-[#e0e5ec] p-8 rounded-3xl shadow-neumorph flex flex-col items-center gap-6" style={{ boxShadow: '8px 8px 24px #b8bac0, -8px -8px 24px #ffffff' }}>
        <div className="flex flex-col items-center mb-2">
          <div className="w-20 h-20 rounded-full bg-[#232344] flex items-center justify-center shadow-neumorph mb-4" style={{ boxShadow: '4px 4px 16px #b8bac0, -4px -4px 16px #ffffff' }}>
            <img src="https://sdmntprwestus2.oaiusercontent.com/files/00000000-be30-61f8-9018-17ba652ae7f1/raw?se=2025-05-11T19%3A32%3A44Z&sp=r&sv=2024-08-04&sr=b&scid=00000000-0000-0000-0000-000000000000&skoid=30ec2761-8f41-44db-b282-7a0f8809659b&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skt=2025-05-11T12%3A02%3A06Z&ske=2025-05-12T12%3A02%3A06Z&sks=b&skv=2024-08-04&sig=Hxzi6q7VAYhErO5YBAKHEmu90hJBN8UNEeEmRzPuLCg%3D" alt="Hermes Logo" className="w-full h-full object-contain" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Sign Up</h2>
          <p className="text-gray-500 text-sm">Create your account</p>
        </div>
        <div className="w-full flex flex-col gap-4">
          <div className="flex items-center bg-[#e0e5ec] rounded-xl px-4 py-2 shadow-inner" style={{ boxShadow: 'inset 2px 2px 6px #b8bac0, inset -2px -2px 6px #ffffff' }}>
            <FaUser className="text-gray-400 mr-2" />
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="username"
              required
              className="flex-1 bg-transparent outline-none text-gray-700 placeholder-gray-400 text-base"
              autoComplete="username"
            />
          </div>
          <div className="flex items-center bg-[#e0e5ec] rounded-xl px-4 py-2 shadow-inner" style={{ boxShadow: 'inset 2px 2px 6px #b8bac0, inset -2px -2px 6px #ffffff' }}>
            <FaLock className="text-gray-400 mr-2" />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="password"
              required
              className="flex-1 bg-transparent outline-none text-gray-700 placeholder-gray-400 text-base"
              autoComplete="new-password"
            />
          </div>
        </div>
        <button
          type="submit"
          className="w-full py-3 rounded-xl text-white text-lg font-semibold mt-2 shadow-lg transition-all duration-200 focus:outline-none"
          style={{ background: '#4fc3df', boxShadow: '2px 2px 8px #b8bac0, -2px -2px 8px #ffffff' }}
        >
          Register
        </button>
        {error && <div className="text-red-400 text-center w-full">{error}</div>}
        <div className="text-center w-full text-gray-500 text-sm mt-2">
          Already have an account? <Link to="/login" className="font-semibold text-[#4fc3df] hover:underline">Login</Link>
        </div>
      </form>
    </div>
  );
};

export default Register; 