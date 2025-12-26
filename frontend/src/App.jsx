import './App.css';
import { Routes, Route, NavLink, useNavigate, Navigate } from 'react-router-dom';
import { useRef, useState } from 'react';
import EditorPage from './components/EditorPage';
import HistoryPage from './components/HistoryPage';
import FormView from './components/FormView';
import CreateProcessModal from './components/CreateProcessModal';

/**
 * App component: defines top-level navigation and routes.
 */
function App() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

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

  const handleCreateProcess = () => {
    setIsCreateModalOpen(true);
  };

  const handleCreateModalClose = () => {
    setIsCreateModalOpen(false);
  };

  const handleCreateModalContinue = (data) => {
    const { processName, ownerName, file } = data;

    if (file) {
      // If file is uploaded, navigate to editor with file and metadata
      navigate('/editor', { 
        state: { 
          uploadedFile: file,
          processName,
          processOwner: ownerName
        } 
      });
    } else {
      // If no file, navigate to editor with empty diagram and metadata
      const emptyDiagram = createEmptyDiagram();
      navigate('/editor', { 
        state: { 
          emptyDiagram,
          processName,
          processOwner: ownerName,
          isNewProcess: true
        } 
      });
    }
  };

  const createEmptyDiagram = () => {
    // Create a minimal empty draw.io diagram XML
    const emptyXml = `<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="Victrex Flowstudio" version="21.1.2" etag="${Date.now()}" type="device">
  <diagram name="Page-1" id="page-${Date.now()}">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
    return emptyXml;
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
            onClick={handleCreateProcess}
            className="nav-link nav-link-create"
          >
            <i className="fa fa-plus-circle"></i>
            <span>Create Process</span>
          </button>
          {/* <button
            onClick={handleUploadClick}
            className="nav-link nav-link-upload"
          >
            <i className="fa fa-upload"></i>
            <span>Upload Diagram</span>
          </button> */}
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
          {/* Default route - Available Processes page */}
          <Route path="/" element={<HistoryPage />} />
          
          {/* Editor page */}
          <Route path="/editor" element={<EditorPage />} />
          
          {/* Form view (standalone) */}
          <Route path="/form/:id" element={<FormView />} />
          
          {/* Redirect /history to root (for backward compatibility) */}
          <Route path="/history" element={<Navigate to="/" replace />} />
          
          {/* Catch-all route - redirect unknown paths to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <CreateProcessModal 
        isOpen={isCreateModalOpen}
        onClose={handleCreateModalClose}
        onContinue={handleCreateModalContinue}
      />
    </div>
  );
}

export default App;
