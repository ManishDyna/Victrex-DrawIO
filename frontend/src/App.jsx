import './App.css';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useRef } from 'react';
import EditorPage from './components/EditorPage';
import HistoryPage from './components/HistoryPage';
import FormView from './components/FormView';

/**
 * App component: defines top-level navigation and routes.
 */
function App() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const handleUploadClick = (e) => {
    e.preventDefault();
    fileInputRef.current?.click();
  };

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    
    if (!file) {
      return;
    }

    // Validate file extension
    const fileName = file.name.toLowerCase();
    const validExtensions = ['.drawio', '.xml', '.mxfile', '.vsdx', '.vsd'];
    const isValidFile = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isValidFile) {
      alert('Please select a valid diagram file (.drawio, .xml, .mxfile, or .vsdx)');
      return;
    }

    // Navigate to editor with file
    navigate('/editor', { state: { uploadedFile: file } });
    
    // Reset file input
    event.target.value = '';
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <i className="fa fa-project-diagram header-icon"></i>
          <h1>Victrex Flowstudio</h1>
        </div>
        <nav className="app-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? 'nav-link nav-link-active' : 'nav-link'
            }
          >
            <i className="fa fa-list"></i>
            <span>Available Processes</span>
          </NavLink>
          <button
            onClick={handleUploadClick}
            className="nav-link nav-link-upload"
          >
            <i className="fa fa-upload"></i>
            <span>Upload Diagram</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".drawio,.xml,.mxfile,.vsdx,.vsd"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </nav>
      </header>

      <main className="app-content">
        <Routes>
          <Route path="/" element={<HistoryPage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/form/:id" element={<FormView />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
