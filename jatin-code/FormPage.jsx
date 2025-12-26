import { useState, useEffect } from 'react';
import './FormPage.css';
import { DRAWIO_SHAPES } from '../constants/drawioShapes';

/**
 * FormPage component: Process Flow Editor form interface
 * Similar to the image layout with sidebar and main content area
 */
function FormPage() {
  // Block types as per draw.io shapes
  const blockTypes = [
    { id: 'start', name: 'Start/End', icon: '○', description: 'Start or end point' },
    { id: 'decision', name: 'Decision', icon: '◇', description: 'Decision point' },
    { id: 'subprocess', name: 'Subprocess', icon: '▭', description: 'Subprocess block' },
    { id: 'process', name: 'Process', icon: '▬', description: 'Process step' },
    { id: 'data', name: 'Data/IO', icon: '▱', description: 'Data input/output' },
    { id: 'document', name: 'Document', icon: '📄', description: 'Document reference' },
  ];

  // Processes list (same API as EditorPage left panel)
  const [processList, setProcessList] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState(null);
  const [activeProcessId, setActiveProcessId] = useState(null);
  
  // Form data state
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [isLoadingFormData, setIsLoadingFormData] = useState(false);
  const [formDataError, setFormDataError] = useState(null);
  
  // Local state for tracking changes (for localStorage)
  const [localFlowData, setLocalFlowData] = useState(null);

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

  useEffect(() => {
    loadProcessList();
  }, []);

  const handleSelectProcess = (item) => {
    if (!item?.id) return;
    setActiveProcessId(item.id);
    loadFormData(item.id, item.name);
  };

  const loadFormData = (processId, processName) => {
    setIsLoadingFormData(true);
    setFormDataError(null);
    setSelectedProcess({ id: processId, name: processName });

    // First check localStorage for unsaved changes
    const stored = localStorage.getItem(`flow_${processId}`);
    if (stored) {
      try {
        const flowData = JSON.parse(stored);
        // Check if localStorage data is newer (has unsaved changes)
        // For now, we'll load from API first, then user can continue editing
        // localStorage will be updated when user makes changes
      } catch (e) {
        console.error('Failed to parse localStorage data:', e);
      }
    }

    fetch(`http://localhost:3001/api/diagrams/${processId}/parsed`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch form data');
        }
        return res.json();
      })
      .then((data) => {
        console.log('Form data:', data);
        const initialNodes = data.nodes || [];
        const initialConnections = data.connections || [];
        setNodes(initialNodes);
        setConnections(initialConnections);
        
        // Save to localStorage as initial state
        const flowData = {
          processId,
          processName,
          nodes: initialNodes,
          connections: initialConnections,
          timestamp: new Date().toISOString()
        };
        setLocalFlowData(flowData);
        localStorage.setItem(`flow_${processId}`, JSON.stringify(flowData));
      })
      .catch((err) => {
        console.error(err);
        setFormDataError('Failed to load form data.');
        setNodes([]);
        setConnections([]);
        setLocalFlowData(null);
      })
      .finally(() => {
        setIsLoadingFormData(false);
      });
  };

  // Sync to localStorage whenever nodes or connections change (but not on initial load)
  useEffect(() => {
    if (selectedProcess?.id && !isLoadingFormData) {
      const flowData = {
        processId: selectedProcess.id,
        processName: selectedProcess.name,
        nodes,
        connections,
        timestamp: new Date().toISOString()
      };
      setLocalFlowData(flowData);
      localStorage.setItem(`flow_${selectedProcess.id}`, JSON.stringify(flowData));
    }
  }, [nodes, connections, selectedProcess, isLoadingFormData]);

  // Helper function to get connections for a specific node
  const getConnectionsForNode = (nodeId) => {
    return connections.filter((conn) => conn.from === nodeId);
  };

  // Handler to add a new node/process
  const handleAddProcess = () => {
    if (!selectedProcess) return;
    
    // Generate a simple numeric ID like "19", "20", "22"
    // Find the highest numeric ID and increment
    const numericIds = nodes
      .map((n) => {
        const numId = parseInt(n.id);
        return isNaN(numId) ? 0 : numId;
      })
      .filter((id) => id > 0);
    
    const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
    const newId = String(maxId + 1);
    
    const newNode = {
      id: newId,
      label: '',
      shape: 'rectangle',
      x: 100,
      y: 100,
      businessOwner: ''
    };
    
    setNodes([...nodes, newNode]);
  };

  // Handler to add a new connection
  const handleAddConnection = (fromNodeId, toNodeId) => {
    if (!toNodeId || toNodeId === '') return;

    // Check if connection already exists
    const exists = connections.some(
      (conn) => conn.from === fromNodeId && conn.to === toNodeId
    );

    if (exists) {
      alert('Connection already exists');
      return;
    }

    const newConnection = { from: fromNodeId, to: toNodeId };
    setConnections([...connections, newConnection]);
  };

  // Handler to update an existing connection (change target)
  const handleUpdateConnection = (fromNodeId, oldToNodeId, newToNodeId) => {
    // If empty value, remove the connection
    if (!newToNodeId || newToNodeId === '') {
      if (oldToNodeId) {
        setConnections(
          connections.filter(
            (conn) => !(conn.from === fromNodeId && conn.to === oldToNodeId)
          )
        );
      }
      return;
    }

    // Check if new connection already exists (different from current)
    const exists = connections.some(
      (conn) => conn.from === fromNodeId && conn.to === newToNodeId && conn.to !== oldToNodeId
    );

    if (exists) {
      alert('Connection already exists');
      return;
    }

    // Update the connection
    setConnections(
      connections.map((conn) =>
        conn.from === fromNodeId && conn.to === oldToNodeId
          ? { ...conn, to: newToNodeId }
          : conn
      )
    );
  };

  // Handler to remove a connection
  const handleRemoveConnection = (fromNodeId, toNodeId) => {
    setConnections(
      connections.filter(
        (conn) => !(conn.from === fromNodeId && conn.to === toNodeId)
      )
    );
  };

  // Handler to remove a node
  const handleRemoveNode = (nodeId) => {
    // Remove the node
    setNodes(nodes.filter((n) => n.id !== nodeId));
    // Remove all connections involving this node
    setConnections(
      connections.filter(
        (conn) => conn.from !== nodeId && conn.to !== nodeId
      )
    );
  };

  // Handler to update node field
  const handleUpdateNode = (nodeId, field, value) => {
    setNodes(
      nodes.map((node) =>
        node.id === nodeId ? { ...node, [field]: value } : node
      )
    );
  };

  // Handler to save changes
  const handleSave = async () => {
    if (!selectedProcess) {
      alert('No process selected');
      return;
    }

    if (!nodes || nodes.length === 0) {
      alert('No nodes to save');
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:3001/api/diagrams/${selectedProcess.id}/parsed`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            nodes: nodes,
            connections: connections,
            diagramId: 'Page-1', // You can make this dynamic if needed
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save changes');
      }

      const data = await response.json();
      console.log('Saved successfully:', data);
      
      // Update localStorage with saved data
      const flowData = {
        processId: selectedProcess.id,
        processName: selectedProcess.name,
        nodes: data.nodes,
        connections: data.connections,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(`flow_${selectedProcess.id}`, JSON.stringify(flowData));
      setLocalFlowData(flowData);

      alert('Items updated successfully!');
    } catch (err) {
      console.error('Error saving changes:', err);
      alert(`Failed to save: ${err.message}`);
    }
  };

  return (
    <div className="form-page">
      <div className="form-page-layout">
        {/* Left Sidebar */}
        <aside className="form-sidebar">
          {/* Processes Section (from API) */}
          <div className="form-processes-section">
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
          </div>

          {/* Block Types Section */}
          {/* <div className="block-types-section">
            <div className="block-types-header">
              <h3>BLOCK TYPES</h3>
            </div>
            <div className="block-types-list">
              {blockTypes.map((block) => (
                <div key={block.id} className="block-type-item">
                  <div className="block-type-icon">{block.icon}</div>
                  <div className="block-type-info">
                    <div className="block-type-name">{block.name}</div>
                    <div className="block-type-description">{block.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div> */}
        </aside>

        {/* Main Content Area */}
        <div className="form-main-content">
          {/* Header Section */}
          <header className="form-page-header">
            <div className="form-page-title-section">
              <h1>Process Flow Editor</h1>
              <p className="form-page-subtitle">Upload, Edit, and Visualize Your Process Diagrams</p>
            </div>
            

            {/* Breadcrumb */}
            <div className="form-breadcrumb">
              <span className="breadcrumb-item">
                {selectedProcess ? `Process: ${selectedProcess.name}` : 'No process selected'}
              </span>
              {selectedProcess && (
                <>
                  <span className="breadcrumb-separator">|</span>
                  <span className="breadcrumb-item">
                    {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'} • {connections.length} {connections.length === 1 ? 'connection' : 'connections'}
                  </span>
                </>
              )}
              {selectedProcess && (
                <button className="form-save-button" onClick={handleSave}>
                  Save
                </button>
              )}
            </div>
          </header>

          {/* Form Content Area */}
          <div className="form-content-area">
            {!selectedProcess ? (
              <div className="form-empty-state">
                <p>Select a process from the left panel to view and edit its details.</p>
              </div>
            ) : (
              <div className="form-section">
                <div className="form-section-header">
                  <h2>{selectedProcess.name}</h2>
                  <p className="form-section-subtitle">
                    {nodes.length} {nodes.length === 1 ? 'step' : 'steps'} • {connections.length} {connections.length === 1 ? 'connection' : 'connections'}
                  </p>
                  {/* <button 
                    className="form-section-close"
                    onClick={() => {
                      setSelectedProcess(null);
                      setNodes([]);
                      setConnections([]);
                      setActiveProcessId(null);
                    }}
                  >
                    ×
                  </button> */}
                </div>

                {isLoadingFormData ? (
                  <div className="form-loading-state">
                    <p>Loading form data...</p>
                  </div>
                ) : formDataError ? (
                  <div className="form-error-state">
                    <p>{formDataError}</p>
                  </div>
                ) : (
                  <>
                    {/* Form Fields - Dynamic based on nodes */}
                    <div className="form-fields-container">
                      {nodes.length === 0 ? (
                        <div className="form-empty-nodes">
                          <p>No nodes found in this process.</p>
                        </div>
                      ) : (
                        nodes.map((node) => {
                          const nodeConnections = getConnectionsForNode(node.id);
                          return (
                            <div key={node.id} className="form-field-card">
                              <div className="form-field-header">
                                <div className="form-field-icon">
                                  {node.shape === 'ellipse' ? '○' : 
                                   node.shape === 'decision' ? '◇' : 
                                   node.shape === 'data' ? '▱' : 
                                   node.shape === 'document' ? '📄' : 
                                   node.shape === 'subprocess' ? '▭' : '▬'}
                                </div>
                                <select 
                                  className="form-field-type" 
                                  value={node.shape}
                                  onChange={(e) => handleUpdateNode(node.id, 'shape', e.target.value)}
                                >
                                  {DRAWIO_SHAPES.map((shape) => (
                                    <option key={shape.value} value={shape.value}>
                                      {shape.label}
                                    </option>
                                  ))}
                                </select>
                                <button 
                                  className="form-field-remove" 
                                  title="Remove step"
                                  onClick={() => handleRemoveNode(node.id)}
                                >
                                  ×
                                </button>
                              </div>
                              <div className="form-field-body">
                                <div className="form-field-group">
                                  <label>Description</label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Enter step description"
                                    value={node.label || ''}
                                    onChange={(e) => handleUpdateNode(node.id, 'label', e.target.value)}
                                  />
                                </div>
                                <div className="form-field-group">
                                  <label>Business Owner</label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Enter business owner name"
                                    value={node.businessOwner || ''}
                                    onChange={(e) => handleUpdateNode(node.id, 'businessOwner', e.target.value)}
                                  />
                                </div>
                                <div className="form-field-group">
                                  <label>Shape</label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Shape type"
                                    value={node.shape}
                                    readOnly
                                  />
                                </div>
                                <div className="form-field-group">
                                  <label>Position</label>
                                  <div className="form-position-inputs">
                                    <input
                                      type="number"
                                      className="form-input form-input-small"
                                      placeholder="X"
                                      value={node.x || ''}
                                      onChange={(e) => handleUpdateNode(node.id, 'x', parseInt(e.target.value) || 0)}
                                    />
                                    <input
                                      type="number"
                                      className="form-input form-input-small"
                                      placeholder="Y"
                                      value={node.y || ''}
                                      onChange={(e) => handleUpdateNode(node.id, 'y', parseInt(e.target.value) || 0)}
                                    />
                                  </div>
                                </div>
                                <div className="form-field-group">
                                  <label>CONNECTIONS</label>
                                  <div className="form-connections-list">
                                    {/* Show existing connections as editable dropdowns */}
                                    {nodeConnections.map((conn, idx) => {
                                      return (
                                        <div key={idx} className="form-connection-item">
                                          <select
                                            className="form-connection-select"
                                            value={conn.to}
                                            onChange={(e) => handleUpdateConnection(node.id, conn.to, e.target.value)}
                                          >
                                            <option value="">-- Remove connection --</option>
                                            {nodes
                                              .filter((n) => {
                                                // Show nodes that:
                                                // 1. Are not the current node
                                                // 2. Have a label
                                                // 3. Are either the current target OR not already connected to this node
                                                return n.id !== node.id && 
                                                  n.label && 
                                                  n.label.trim() !== '' &&
                                                  (n.id === conn.to || !nodeConnections.some((c) => c.to === n.id));
                                              })
                                              .map((n) => (
                                                <option key={n.id} value={n.id}>
                                                  {n.label}
                                                </option>
                                              ))}
                                          </select>
                                          <button
                                            className="form-connection-remove"
                                            title="Remove connection"
                                            onClick={() => handleRemoveConnection(node.id, conn.to)}
                                          >
                                            ×
                                          </button>
                                        </div>
                                      );
                                    })}
                                    {/* Add new connection dropdown (only if there are available nodes) */}
                                    {nodes.filter((n) => {
                                      return n.id !== node.id && 
                                        n.label && 
                                        n.label.trim() !== '' &&
                                        !nodeConnections.some((conn) => conn.to === n.id);
                                    }).length > 0 && (
                                      <select
                                        className="form-connection-select"
                                        defaultValue=""
                                        onChange={(e) => {
                                          if (e.target.value) {
                                            handleAddConnection(node.id, e.target.value);
                                            // Reset the select
                                            e.target.value = '';
                                          }
                                        }}
                                      >
                                        <option value="">+ Add connection...</option>
                                        {nodes
                                          .filter((n) => {
                                            // Only show nodes that aren't already connected
                                            return n.id !== node.id && 
                                              n.label && 
                                              n.label.trim() !== '' &&
                                              !nodeConnections.some((conn) => conn.to === n.id);
                                          })
                                          .map((n) => (
                                            <option key={n.id} value={n.id}>
                                              {n.label}
                                            </option>
                                          ))}
                                      </select>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Add Block Buttons */}
                    <div className="form-add-blocks">
                      <button className="form-add-button" onClick={handleAddProcess}>
                        + Process
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FormPage;

