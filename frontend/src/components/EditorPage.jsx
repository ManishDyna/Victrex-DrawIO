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
  const [isConverting, setIsConverting] = useState(false);
  const [convertRequestId, setConvertRequestId] = useState(0);
  const [pendingFile, setPendingFile] = useState(null);

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
   * 
   * NEW BEHAVIOR: Files are converted to compressed XML format before opening
   * - VSDX/VSD files: Load → Export as compressed XML → Reload
   * - XML files: Load → Export as compressed XML → Reload
   */
  const handleFileUpload = (file) => {
    if (!editorReady) {
      alert('Please wait for the editor to load before uploading files.');
      return;
    }

    const fileName = file.name.toLowerCase();
    const isBinary = fileName.endsWith('.vsdx') || fileName.endsWith('.vsd');

    // Store file info for conversion
    setPendingFile({ file, fileName, isBinary });

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
          
          // Set flag to convert after load
          setIsConverting(true);
          setDiagramXml(dataUrl);
          setLastSavedId(null);
        } catch (error) {
          console.error('Error processing VSDX file:', error);
          alert('Error processing VSDX file. Please try again.');
          setPendingFile(null);
        }
      };

      reader.onerror = (error) => {
        console.error('Error reading VSDX file:', error);
        alert('Error reading VSDX file. Please try again.');
        setPendingFile(null);
      };

      // Read file as ArrayBuffer for binary files
      reader.readAsArrayBuffer(file);
    } else {
      // For text-based files (.drawio, .xml, .mxfile), read as text
      const reader = new FileReader();

      reader.onload = (e) => {
        const content = e.target.result;
        
        // Check if the XML is already in compressed format
        // Compressed format has <diagram> tag with base64-encoded content
        // Uncompressed format has <mxGraphModel> directly in the diagram or as root
        const hasMxFile = content.includes('<mxfile');
        const hasDiagram = content.includes('<diagram');
        const hasMxGraphModel = content.includes('<mxGraphModel>');
        
        // If it has mxfile and diagram but no mxGraphModel, it's likely compressed
        // Also check if diagram content looks like base64 (compressed) vs XML (uncompressed)
        const diagramMatch = content.match(/<diagram[^>]*>([\s\S]*?)<\/diagram>/);
        const isCompressedContent = diagramMatch && 
          diagramMatch[1].trim().length > 0 && 
          !diagramMatch[1].trim().startsWith('<');
        
        const isAlreadyCompressed = hasMxFile && hasDiagram && 
          (isCompressedContent || !hasMxGraphModel);
        
        if (isAlreadyCompressed) {
          // Already compressed, load directly
          setDiagramXml(content);
          setLastSavedId(null);
          setPendingFile(null);
        } else {
          // Needs conversion: load first, then export to get compressed version
          setIsConverting(true);
          setDiagramXml(content);
          setLastSavedId(null);
        }
      };

      reader.onerror = (error) => {
        console.error('Error reading file:', error);
        alert('Error reading file. Please try again.');
        setPendingFile(null);
      };

      // Read file as text (draw.io files are XML-based)
      reader.readAsText(file);
    }
  };

  /**
   * Called when draw.io sends an export event with the current XML.
   * This handles both:
   * 1. Saving diagrams to MongoDB (when isSaving is true)
   * 2. Converting uploaded files to compressed XML (when isConverting is true)
   */
  const handleExport = async (exportPayload) => {
    const xml = exportPayload?.xml;

    if (!xml) {
      if (isConverting) {
        alert('Failed to convert file to compressed XML format.');
        setIsConverting(false);
        setPendingFile(null);
      } else {
        alert('Export did not contain diagram XML.');
        setIsSaving(false);
      }
      return;
    }

    // Validate XML structure
    const isValidXml = xml.trim().length > 0 && 
      (xml.includes('<mxfile') || xml.includes('<mxGraphModel'));
    
    if (!isValidXml) {
      console.error('Invalid XML structure received:', xml.substring(0, 200));
      if (isConverting) {
        alert('Invalid XML format received during conversion. Please try again.');
        setIsConverting(false);
        setPendingFile(null);
      } else {
        alert('Invalid diagram XML. Please try saving again.');
        setIsSaving(false);
      }
      return;
    }

    setLastExportedXml(xml);

    // If we're converting an uploaded file, reload with compressed XML
    if (isConverting) {
      console.log('✅ Converting uploaded file to compressed XML format...');
      console.log('   Converted XML length:', xml.length);
      console.log('   Converted XML preview:', xml.substring(0, 300));
      console.log('   Has <mxfile>:', xml.includes('<mxfile'));
      console.log('   Has <diagram>:', xml.includes('<diagram'));
      console.log('   Has mxGraphModel:', xml.includes('mxGraphModel'));
      
      setIsConverting(false);
      // Keep pendingFile for when we save later (don't clear it)
      // Reload the editor with the compressed XML
      // The DrawIOEditor will detect the change and reload
      setDiagramXml(xml);
      return;
    }

    // Otherwise, this is a save operation
    // Ask user for a human-friendly name (fallback to timestamp)
    const defaultName = `Diagram ${new Date().toLocaleString()}`;
    const name = window.prompt('Enter a name for this diagram:', defaultName);

    if (!name) {
      setIsSaving(false);
      return;
    }

    try {
      // Extract sourceFileName from pendingFile if available
      const sourceFileName = pendingFile?.fileName || null;
      
      // Extract diagramId from XML if available (for better parsing)
      let diagramId = null;
      if (xml.includes('<diagram')) {
        const nameMatch = xml.match(/<diagram[^>]*name="([^"]+)"/);
        if (nameMatch) {
          diagramId = nameMatch[1];
        } else {
          // Try id attribute
          const idMatch = xml.match(/<diagram[^>]*id="([^"]+)"/);
          if (idMatch) {
            diagramId = idMatch[1];
          }
        }
      }
      
      // Log the XML being sent for debugging
      console.log('💾 Saving diagram to database:');
      console.log(`   - Name: ${name}`);
      console.log(`   - Source: ${sourceFileName || 'manual'}`);
      console.log(`   - Diagram ID: ${diagramId || 'Page-1 (default)'}`);
      console.log(`   - XML length: ${xml.length} chars`);
      console.log(`   - XML preview (first 200 chars): ${xml.substring(0, 200)}`);
      console.log(`   - Has <mxfile>: ${xml.includes('<mxfile')}`);
      console.log(`   - Has <diagram>: ${xml.includes('<diagram')}`);
      console.log(`   - Has mxGraphModel: ${xml.includes('mxGraphModel')}`);
      
      const res = await fetch('http://localhost:3001/api/diagrams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          xml,
          sourceFileName: sourceFileName || undefined,
          diagramId: diagramId || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save diagram');
      }

      const data = await res.json();
      setLastSavedId(data.id);
      setActiveProcessId(data.id);
      
      // Clear pendingFile after successful save
      setPendingFile(null);
      
      loadProcessList();
      
      // Show success message with parsing info
      const parsedInfo = data.parsedData 
        ? ` (${data.parsedData.nodes?.length || 0} nodes, ${data.parsedData.connections?.length || 0} connections)`
        : ' (parsing failed - check server logs)';
      alert(`Diagram saved to MongoDB${parsedInfo}.`);
    } catch (err) {
      console.error(err);
      alert('Failed to save diagram.');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Called when a diagram is loaded in the editor.
   * If we're converting a file, trigger an export to get compressed XML.
   */
  const handleDiagramLoad = () => {
    if (isConverting && editorReady) {
      console.log('📥 Diagram loaded, triggering conversion export...');
      // Wait a bit for the diagram to fully render, then trigger export
      setTimeout(() => {
        console.log('🔄 Requesting export for conversion...');
        setConvertRequestId((prev) => prev + 1);
      }, 500);
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
            convertRequestId={convertRequestId}
            onLoad={handleDiagramLoad}
          />
        </div>
      </div>
    </>
  );
}

export default EditorPage;


