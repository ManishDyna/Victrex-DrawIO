import { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DrawIOEditor from './DrawIOEditor';
import FileUpload from './FileUpload';
import FormView from './FormView';

/**
 * EditorPage
 *
 * Hosts the upload button, save button, and the embedded draw.io editor.
 * Talks to the backend to persist diagrams in MongoDB.
 * Also includes Form View toggle to switch between Diagram and Form views.
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
  const [isNewFileUpload, setIsNewFileUpload] = useState(false); // Track if current diagram is from file upload
  const [currentView, setCurrentView] = useState('diagram'); // 'diagram' or 'form'
  const [pendingHeaderFile, setPendingHeaderFile] = useState(null); // Store file from header until editor is ready
  const [pendingProcessName, setPendingProcessName] = useState(null); // Store process name from Create Process modal
  const [pendingProcessOwner, setPendingProcessOwner] = useState(null); // Store process owner from Create Process modal
  const [isNewProcess, setIsNewProcess] = useState(false); // Track if this is a new process from Create Process modal
  
  const formViewRef = useRef(null); // Ref for FormView to access save method
  const fileUploadRef = useRef(null); // Ref for FileUpload to trigger upload programmatically
  const processedFileRef = useRef(null); // Track processed files to prevent re-processing

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

  // Store file or empty diagram from header navigation (Upload Diagram or Create Process)
  useEffect(() => {
    const uploadedFile = location.state?.uploadedFile;
    const emptyDiagram = location.state?.emptyDiagram;
    const processName = location.state?.processName;
    const processOwner = location.state?.processOwner;
    const isNew = location.state?.isNewProcess;
    
    // Handle file upload from Upload Diagram or Create Process with file
    if (uploadedFile && uploadedFile !== processedFileRef.current && !pendingHeaderFile) {
      console.log('Received file from header:', uploadedFile.name);
      setPendingHeaderFile(uploadedFile);
      processedFileRef.current = uploadedFile;
      
      // Store metadata if provided
      if (processName) setPendingProcessName(processName);
      if (processOwner) setPendingProcessOwner(processOwner);
      
      // Clear the state to prevent re-processing on page refresh
      setTimeout(() => {
        navigate(location.pathname + location.search, { replace: true, state: {} });
      }, 0);
    }
    // Handle empty diagram from Create Process without file
    else if (emptyDiagram && isNew) {
      console.log('Received empty diagram for new process:', processName);
      setPendingProcessName(processName);
      setPendingProcessOwner(processOwner);
      setIsNewProcess(true);
      setIsNewFileUpload(true);
      setLastSavedId(null);
      setActiveProcessId(null);
      
      // Set the empty diagram XML immediately
      setDiagramXml(emptyDiagram);
      
      // Clear the state to prevent re-processing on page refresh
      setTimeout(() => {
        navigate(location.pathname + location.search, { replace: true, state: {} });
      }, 0);
    }
  }, [location.state]);

  // Process pending file once editor is ready
  useEffect(() => {
    if (pendingHeaderFile && editorReady) {
      console.log('Editor ready, processing file:', pendingHeaderFile.name);
      handleFileUpload(pendingHeaderFile);
      setPendingHeaderFile(null);
    }
  }, [pendingHeaderFile, editorReady]);

  // If navigated from history with a diagram ID, load it from backend
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const diagramId = params.get('id');
    const viewParam = params.get('view'); // Check for view parameter

    // Set initial view based on URL parameter
    if (viewParam === 'form') {
      setCurrentView('form');
    } else if (viewParam === 'diagram') {
      setCurrentView('diagram');
    }

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
          // Clear new file flag - this is an existing diagram
          setIsNewFileUpload(false);
          // Clear pending file - not a new upload
          setPendingFile(null);
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
    // Mark as new file upload - this will always create new diagram
    setIsNewFileUpload(true);
    // Clear lastSavedId so it creates new diagram
    setLastSavedId(null);
    setActiveProcessId(null);

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
          setActiveProcessId(null);
          // Don't clear pendingFile - keep it for save operation
        } else {
          // Needs conversion: load first, then export to get compressed version
          setIsConverting(true);
          setDiagramXml(content);
          setLastSavedId(null);
          setActiveProcessId(null);
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

    // Debug: Check for edges in exported XML (for manually created connections)
    // Note: If XML is compressed, edges will be in base64, so we need to check after decompression
    const isCompressed = xml.includes('<diagram') && !xml.includes('<mxGraphModel>');
    let edgeCount = 0;
    let sourceTargetCount = 0;
    
    if (isCompressed) {
      // For compressed XML, we can't easily count edges in the base64 string
      // But we can check if the diagram tag has content
      const diagramMatch = xml.match(/<diagram[^>]*>([\s\S]*?)<\/diagram>/);
      if (diagramMatch && diagramMatch[1].trim().length > 0) {
        console.log('📦 Exported XML is compressed (base64). Edges will be counted after decompression.');
      }
    } else {
      // For uncompressed XML, count edges directly
      edgeCount = (xml.match(/edge="1"/g) || []).length;
      sourceTargetCount = (xml.match(/source="[^"]+"/g) || []).length;
      console.log(`🔗 Exported XML edge check (uncompressed): ${edgeCount} edges, ${sourceTargetCount} cells with source`);
    }
    
    console.log(`💾 Export received: XML length=${xml.length}, compressed=${isCompressed}`);

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
    // Determine if this is a new file upload or editing existing diagram
    const isNewFile = isNewFileUpload || !lastSavedId;
    
    let name;
    let processOwner = null;
    
    // If saving an existing file, use the existing name without prompting
    if (!isNewFile && lastSavedId) {
      const existingProcess = processList.find(p => p.id === lastSavedId);
      name = existingProcess?.name || `Diagram ${new Date().toLocaleString()}`;
      processOwner = existingProcess?.processOwner || null;
    } else {
      // For new files, check if we have pendingProcessName (from Create Process modal)
      if (pendingProcessName) {
        name = pendingProcessName;
        processOwner = pendingProcessOwner;
        // Clear pending data after use
        setPendingProcessName(null);
        setPendingProcessOwner(null);
      } else {
        // Otherwise, ask user for a human-friendly name
        const defaultName = pendingFile?.fileName?.replace(/\.[^/.]+$/, '') || `Diagram ${new Date().toLocaleString()}`;
        name = window.prompt('Enter a name for this new diagram:', defaultName);

        if (!name) {
          setIsSaving(false);
          return;
        }
      }
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
      console.log(`   - Is new file upload: ${isNewFile}`);
      console.log(`   - Last saved ID: ${lastSavedId}`);
      console.log(`   - Diagram ID: ${diagramId || 'Page-1 (default)'}`);
      console.log(`   - XML length: ${xml.length} chars`);
      
      // If this is a new file upload OR no lastSavedId, always create new (POST)
      // If editing existing diagram (has lastSavedId and NOT new file), update (PUT)
      const url = (!isNewFile && lastSavedId)
        ? `http://localhost:3001/api/diagrams/${lastSavedId}`
        : 'http://localhost:3001/api/diagrams';
      const method = (!isNewFile && lastSavedId) ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          xml,
          sourceFileName: sourceFileName || undefined,
          diagramId: diagramId || undefined,
          processOwner: processOwner || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save diagram');
      }

      const data = await res.json();
      
      // If this was a new file upload, mark it as saved but keep isNewFileUpload flag
      // so subsequent saves will update the same diagram
      if (isNewFile) {
        setLastSavedId(data.id);
        setActiveProcessId(data.id);
        // Clear new file flag after first save - now it's an existing diagram
        setIsNewFileUpload(false);
        // Clear pendingFile after successful save
        setPendingFile(null);
      } else {
        // Updating existing diagram - keep the same ID
        setLastSavedId(data.id);
        setActiveProcessId(data.id);
      }
      
      loadProcessList();
      
      // Show success message
      if (!isNewFile) {
        // For existing files, show simple "File saved" message
        alert('File saved successfully!');
      } else {
        // For new files, show detailed message with parsing info
        const parsedInfo = data.parsedData 
          ? ` (${data.parsedData.nodes?.length || 0} nodes, ${data.parsedData.connections?.length || 0} connections)`
          : ' (parsing failed - check server logs)';
        alert(`Diagram created in MongoDB${parsedInfo}.`);
      }
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
   * Called when FormView save completes - reload diagram XML to sync changes
   */
  const handleFormSaveComplete = async (updatedDiagram) => {
    console.log('📥 Form save complete, reloading diagram XML...');
    
    if (updatedDiagram && updatedDiagram.xml) {
      // Reload the diagram XML to reflect form changes
      setDiagramXml(updatedDiagram.xml);
      console.log('✅ Diagram XML reloaded with form changes');
    }
    
    // Reload process list to reflect any changes
    loadProcessList();
  };

  /**
   * Toggle between diagram and form view
   * When switching views, reload data to show latest changes
   */
  const handleViewToggle = async () => {
    const newView = currentView === 'diagram' ? 'form' : 'diagram';
    
    // If switching to diagram view, reload the diagram to show form changes
    if (newView === 'diagram' && activeProcessId) {
      console.log('🔄 Switching to diagram view, reloading diagram...');
      try {
        const res = await fetch(`http://localhost:3001/api/diagrams/${activeProcessId}`);
        if (res.ok) {
          const data = await res.json();
          setDiagramXml(data.xml);
          console.log('✅ Diagram reloaded with latest changes');
        }
      } catch (err) {
        console.error('Failed to reload diagram:', err);
      }
    }
    
    // If switching to form view, FormView will reload via useEffect with [id] dependency
    // But we can help by triggering a reload flag
    if (newView === 'form') {
      console.log('🔄 Switching to form view, it will reload latest data...');
    }
    
    setCurrentView(newView);
  };

  /**
   * When user clicks Save:
   * - For Diagram view: trigger an export request into the embedded draw.io editor
   * - For Form view: call the FormView save method
   */
  const handleSaveClick = () => {
    if (currentView === 'form') {
      // Call FormView's save method
      if (formViewRef.current) {
        formViewRef.current.save();
      }
    } else {
      // Diagram view - export XML
      if (!editorReady) {
        alert('Editor is not ready yet.');
        return;
      }

      setIsSaving(true);
      setSaveRequestId((prev) => prev + 1);
    }
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
        // Clear new file flag - this is an existing diagram
        setIsNewFileUpload(false);
        // Clear pending file - not a new upload
        setPendingFile(null);
      })
      .catch((err) => {
        console.error(err);
        alert('Failed to load diagram.');
      });
  };

  return (
    <>
      {/* Hidden FileUpload component for programmatic triggering from header */}
      <FileUpload 
        ref={fileUploadRef}
        onFileSelect={handleFileUpload} 
        disabled={!editorReady} 
      />

      <div className="upload-section">
        {pendingHeaderFile && !editorReady && (
          <div className="upload-status">
            <i className="fa fa-spinner fa-spin"></i>
            <span>Loading editor and preparing your file...</span>
          </div>
        )}
        
        {pendingHeaderFile && editorReady && (
          <div className="upload-status">
            <i className="fa fa-spinner fa-spin"></i>
            <span>Processing {pendingHeaderFile.name}...</span>
          </div>
        )}

        <button
          type="button"
          className="upload-button"
          onClick={handleSaveClick}
          disabled={currentView === 'diagram' ? (!editorReady || !diagramXml || isSaving) : false}
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

        {activeProcessId && (
          <button
            type="button"
            className="upload-button secondary"
            onClick={handleViewToggle}
          >
            {currentView === 'diagram' ? 'Form View' : 'Diagram View'}
          </button>
        )}
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
              >
                <div onClick={() => handleSelectProcess(item)}>
                  <div className="process-list-name">{item.name}</div>
                  {item.processOwner && (
                    <div className="process-list-owner">
                      Owner: {item.processOwner}
                    </div>
                  )}
                  <div className="process-list-meta">
                    {item.updatedAt
                      ? new Date(item.updatedAt).toLocaleString()
                      : ''}
                  </div>
                </div>
                <div className="process-list-actions">
                  <button
                    className="process-action-button view-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectProcess(item);
                      setCurrentView('diagram');
                    }}
                    title="View Diagram"
                  >
                    <i className="fa fa-eye"></i>
                  </button>
                  <button
                    className="process-action-button edit-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectProcess(item);
                      setCurrentView('form');
                    }}
                    title="Edit Form"
                  >
                    <i className="fa fa-edit"></i>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <div className="editor-main">
          {currentView === 'diagram' ? (
            <DrawIOEditor
              diagramXml={diagramXml}
              onReady={() => setEditorReady(true)}
              onExport={handleExport}
              saveRequestId={saveRequestId}
              convertRequestId={convertRequestId}
              onLoad={handleDiagramLoad}
            />
          ) : (
            activeProcessId && (
              <FormView 
                key={`form-${activeProcessId}-${currentView}`}
                ref={formViewRef} 
                diagramId={activeProcessId} 
                embedded={true}
                onSaveComplete={handleFormSaveComplete}
              />
            )
          )}
        </div>
      </div>
    </>
  );
}

export default EditorPage;


