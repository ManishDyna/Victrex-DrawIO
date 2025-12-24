import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DrawIOEditor from './DrawIOEditor';
import FileUpload from './FileUpload';

/**
 * EditorPage
 *
 * Hosts the upload button, save button, and the embedded draw.io editor.
 * Talks to the backend to persist diagrams in MongoDB.
 */
function EditorPage() {
  const [diagramXml, setDiagramXml] = useState(null);
  const [editorReady, setEditorReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedId, setLastSavedId] = useState(null);
  const [lastExportedXml, setLastExportedXml] = useState(null);
  const [saveRequestId, setSaveRequestId] = useState(0);
  const [processList, setProcessList] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState(null);
  const [activeProcessId, setActiveProcessId] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();

  const loadProcessList = () => {
    setIsLoadingList(true);
    setListError(null);

    fetch('http://localhost:3001/api/diagrams')
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch process list');
        }
        return res.json();
      })
      .then((data) => {
        setProcessList(data);
      })
      .catch((err) => {
        console.error(err);
        setListError('Failed to load processes.');
      })
      .finally(() => {
        setIsLoadingList(false);
      });
  };

  // Initial load of processes for side pane
  useEffect(() => {
    loadProcessList();
  }, []);

  // If navigated from history with a diagram ID, load it from backend
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const diagramId = params.get('id');

    if (diagramId) {
      fetch(`http://localhost:3001/api/diagrams/${diagramId}`)
        .then((res) => {
          if (!res.ok) {
            throw new Error('Failed to fetch diagram');
          }
          return res.json();
        })
        .then((data) => {
          setDiagramXml(data.xml);
          setLastSavedId(data.id);
          setActiveProcessId(data.id);
        })
        .catch((err) => {
          console.error(err);
          alert('Failed to load diagram from history.');
        });
    }
  }, [location.search]);

  /**
   * Handles file upload and reads the diagram content
   * Supports .drawio, .xml, .mxfile (text) and .vsdx, .vsd (binary) formats
   */
  const handleFileUpload = (file) => {
    const fileName = file.name.toLowerCase();
    const isBinary = fileName.endsWith('.vsdx') || fileName.endsWith('.vsd');

    if (isBinary) {
      // For VSDX/VSD files, read as ArrayBuffer and convert to base64 data URL
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target.result;
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          // Create data URL for VSDX file - draw.io expects this format
          const dataUrl = `data:application/vnd.visio;base64,${base64}`;
          setDiagramXml(dataUrl);
          setLastSavedId(null);
        } catch (error) {
          console.error('Error processing VSDX file:', error);
          alert('Error processing VSDX file. Please try again.');
        }
      };

      reader.onerror = (error) => {
        console.error('Error reading VSDX file:', error);
        alert('Error reading VSDX file. Please try again.');
      };

      // Read file as ArrayBuffer for binary files
      reader.readAsArrayBuffer(file);
    } else {
      // For text-based files (.drawio, .xml, .mxfile), read as text
      const reader = new FileReader();

      reader.onload = (e) => {
        const content = e.target.result;
        setDiagramXml(content);
        setLastSavedId(null);
      };

      reader.onerror = (error) => {
        console.error('Error reading file:', error);
        alert('Error reading file. Please try again.');
      };

      // Read file as text (draw.io files are XML-based)
      reader.readAsText(file);
    }
  };

  /**
   * Called when draw.io sends an export event with the current XML.
   * This is where the diagram is actually persisted to MongoDB.
   */
  const handleExport = async (exportPayload) => {
    const xml = exportPayload?.xml;

    if (!xml) {
      alert('Export did not contain diagram XML.');
      setIsSaving(false);
      return;
    }

    setLastExportedXml(xml);

    // Ask user for a human-friendly name (fallback to timestamp)
    const defaultName = `Diagram ${new Date().toLocaleString()}`;
    const name = window.prompt('Enter a name for this diagram:', defaultName);

    if (!name) {
      setIsSaving(false);
      return;
    }

    try {
      const res = await fetch('http://localhost:3001/api/diagrams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          xml,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save diagram');
      }

      const data = await res.json();
      setLastSavedId(data.id);
      setActiveProcessId(data.id);
      loadProcessList();
      alert('Diagram saved to MongoDB.');
    } catch (err) {
      console.error(err);
      alert('Failed to save diagram.');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * When user clicks Save:
   * - We trigger an export request into the embedded draw.io editor
   * - The editor responds with an "export" event that we handle in handleExport
   */
  const handleSaveClick = () => {
    if (!editorReady) {
      alert('Editor is not ready yet.');
      return;
    }

    setIsSaving(true);
    setSaveRequestId((prev) => prev + 1);
  };

  const goToHistory = () => {
    navigate('/history');
  };

  const handleSelectProcess = (item) => {
    if (!item?.id) return;

    fetch(`http://localhost:3001/api/diagrams/${item.id}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch diagram');
        }
        return res.json();
      })
      .then((data) => {
        setDiagramXml(data.xml);
        setLastSavedId(data.id);
        setActiveProcessId(data.id);
      })
      .catch((err) => {
        console.error(err);
        alert('Failed to load diagram.');
      });
  };

  return (
    <>
      <div className="upload-section">
        <FileUpload onFileSelect={handleFileUpload} disabled={!editorReady} />

        <button
          type="button"
          className="upload-button"
          onClick={handleSaveClick}
          disabled={!editorReady || !diagramXml || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Process'}
        </button>

        <button
          type="button"
          className="upload-button secondary"
          onClick={goToHistory}
        >
          View History
        </button>
      </div>

      <div className="editor-section editor-layout">
        <aside className="process-sidebar">
          <div className="process-sidebar-header">
            <h3>Processes</h3>
          </div>
          {isLoadingList && <p className="sidebar-status">Loading...</p>}
          {listError && (
            <p className="sidebar-status sidebar-status-error">{listError}</p>
          )}
          {!isLoadingList && !listError && processList.length === 0 && (
            <p className="sidebar-status">No processes saved yet.</p>
          )}
          <ul className="process-list">
            {processList.map((item) => (
              <li
                key={item.id}
                className={
                  item.id === activeProcessId
                    ? 'process-list-item process-list-item-active'
                    : 'process-list-item'
                }
                onClick={() => handleSelectProcess(item)}
              >
                <div className="process-list-name">{item.name}</div>
                <div className="process-list-meta">
                  {item.updatedAt
                    ? new Date(item.updatedAt).toLocaleString()
                    : ''}
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <div className="editor-main">
          <DrawIOEditor
            diagramXml={diagramXml}
            onReady={() => setEditorReady(true)}
            onExport={handleExport}
            saveRequestId={saveRequestId}
          />
        </div>
      </div>
    </>
  );
}

export default EditorPage;


