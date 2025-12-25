import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './FormView.css';

/**
 * FormView Component
 * 
 * Displays a flowchart in an editable form view where users can:
 * - Edit process content and labels
 * - Add owner names for each main step
 * - Add a whole process owner name
 * - Edit subprocesses
 */
function FormView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [diagram, setDiagram] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [processOwner, setProcessOwner] = useState('');
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  // Load diagram data
  useEffect(() => {
    if (!id) {
      setError('No diagram ID provided');
      setLoading(false);
      return;
    }

    fetch(`http://localhost:3001/api/diagrams/${id}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch diagram');
        }
        return res.json();
      })
      .then((data) => {
        setDiagram(data);
        setProcessOwner(data.processOwner || '');
        
        // Initialize nodes with editable content
        if (data.parsedData?.nodes) {
          const editableNodes = data.parsedData.nodes.map(node => ({
            ...node,
            editedLabel: extractTextFromHtml(node.label || ''),
            owner: node.owner || '',
            subprocesses: node.subprocesses || [],
          }));
          setNodes(editableNodes);
          // Expand all nodes by default
          setExpandedNodes(new Set(editableNodes.map(n => n.id)));
        } else {
          setNodes([]);
        }
        
        if (data.parsedData?.connections) {
          setConnections(data.parsedData.connections);
        } else {
          setConnections([]);
        }
        
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError('Failed to load diagram');
        setLoading(false);
      });
  }, [id]);

  // Extract plain text from HTML label
  const extractTextFromHtml = (html) => {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  };

  // Convert plain text back to simple HTML format (for display)
  const textToHtml = (text) => {
    if (!text) return '';
    // Simple conversion - preserve line breaks
    return text.split('\n').map(line => `<p>${line}</p>`).join('');
  };

  // Handle node label change
  const handleNodeLabelChange = (nodeId, newLabel) => {
    setNodes(prevNodes =>
      prevNodes.map(node =>
        node.id === nodeId ? { ...node, editedLabel: newLabel } : node
      )
    );
  };

  // Handle node owner change
  const handleNodeOwnerChange = (nodeId, owner) => {
    setNodes(prevNodes =>
      prevNodes.map(node =>
        node.id === nodeId ? { ...node, owner } : node
      )
    );
  };

  // Handle subprocess change
  const handleSubprocessChange = (nodeId, subprocessIndex, value) => {
    setNodes(prevNodes =>
      prevNodes.map(node => {
        if (node.id === nodeId) {
          const newSubprocesses = [...(node.subprocesses || [])];
          if (subprocessIndex >= 0 && subprocessIndex < newSubprocesses.length) {
            newSubprocesses[subprocessIndex] = value;
          } else {
            newSubprocesses.push(value);
          }
          return { ...node, subprocesses: newSubprocesses };
        }
        return node;
      })
    );
  };

  // Add new subprocess
  const handleAddSubprocess = (nodeId) => {
    setNodes(prevNodes =>
      prevNodes.map(node =>
        node.id === nodeId
          ? { ...node, subprocesses: [...(node.subprocesses || []), ''] }
          : node
      )
    );
  };

  // Remove subprocess
  const handleRemoveSubprocess = (nodeId, subprocessIndex) => {
    setNodes(prevNodes =>
      prevNodes.map(node => {
        if (node.id === nodeId) {
          const newSubprocesses = [...(node.subprocesses || [])];
          newSubprocesses.splice(subprocessIndex, 1);
          return { ...node, subprocesses: newSubprocesses };
        }
        return node;
      })
    );
  };

  // Save changes
  const handleSave = async () => {
    if (!diagram) return;

    setSaving(true);
    try {
      // Update parsedData with edited nodes
      const updatedNodes = nodes.map(node => ({
        ...node,
        label: textToHtml(node.editedLabel), // Convert back to HTML format
      }));

      const response = await fetch(`http://localhost:3001/api/diagrams/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          processOwner,
          parsedData: {
            ...diagram.parsedData,
            nodes: updatedNodes,
            connections,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save changes');
      }

      const updated = await response.json();
      setDiagram(updated);
      alert('Changes saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Get connections for a node (to show flow)
  const getNodeConnections = (nodeId) => {
    const outgoing = connections.filter(c => c.from === nodeId);
    const incoming = connections.filter(c => c.to === nodeId);
    return { outgoing, incoming };
  };

  // Find the main process flow (longest path from start to end)
  const findMainFlow = (nodes, connections) => {
    if (!connections || connections.length === 0) {
      return { mainFlowNodes: nodes, branchNodes: new Map() };
    }

    const nodeMap = new Map();
    const children = new Map();
    const parents = new Map();
    const inDegree = new Map();

    // Initialize all nodes
    nodes.forEach(node => {
      nodeMap.set(node.id, node);
      children.set(node.id, []);
      parents.set(node.id, []);
      inDegree.set(node.id, 0);
    });

    // Build graph
    connections.forEach(conn => {
      if (nodeMap.has(conn.from) && nodeMap.has(conn.to)) {
        children.get(conn.from).push(conn.to);
        parents.get(conn.to).push(conn.from);
        inDegree.set(conn.to, (inDegree.get(conn.to) || 0) + 1);
      }
    });

    // Find start nodes (no incoming edges)
    const startNodes = nodes.filter(node => (inDegree.get(node.id) || 0) === 0);
    
    // Find end nodes (no outgoing edges)
    const endNodes = nodes.filter(node => (children.get(node.id) || []).length === 0);

    // Find longest path from any start to any end (main flow)
    let longestPath = [];
    let maxLength = 0;

    const findLongestPath = (currentId, path, visited) => {
      const currentPath = [...path, currentId];
      
      // If this is an end node, check if it's the longest path
      if (endNodes.some(n => n.id === currentId)) {
        if (currentPath.length > maxLength) {
          maxLength = currentPath.length;
          longestPath = [...currentPath];
        }
        return;
      }

      // Continue to children
      const childIds = children.get(currentId) || [];
      childIds.forEach(childId => {
        if (!visited.has(childId)) {
          visited.add(childId);
          findLongestPath(childId, currentPath, visited);
          visited.delete(childId);
        }
      });
    };

    // Start from each start node
    startNodes.forEach(startNode => {
      const visited = new Set([startNode.id]);
      findLongestPath(startNode.id, [], visited);
    });

    // If no path found, use topological sort as fallback
    if (longestPath.length === 0) {
      const queue = startNodes.length > 0 ? [startNodes[0].id] : [nodes[0]?.id].filter(Boolean);
      const sorted = [];
      const visited = new Set();
      const tempInDegree = new Map(inDegree);

      while (queue.length > 0) {
        const currentId = queue.shift();
        if (visited.has(currentId)) continue;
        
        visited.add(currentId);
        const node = nodeMap.get(currentId);
        if (node) sorted.push(node);

        const childIds = children.get(currentId) || [];
        childIds.forEach(childId => {
          const deg = (tempInDegree.get(childId) || 0) - 1;
          tempInDegree.set(childId, deg);
          if (deg === 0 && !visited.has(childId)) {
            queue.push(childId);
          }
        });
      }

      longestPath = sorted.map(n => n.id);
    }

    // Identify main flow nodes
    const mainFlowNodeIds = new Set(longestPath);
    const mainFlowNodes = longestPath.map(id => nodeMap.get(id)).filter(Boolean);

    // Identify branch nodes (nodes not in main flow but connected to main flow)
    const branchNodesMap = new Map(); // parentId -> [branch nodes]

    nodes.forEach(node => {
      if (!mainFlowNodeIds.has(node.id)) {
        // This is a branch node, find which main flow node it connects from
        const parentIds = parents.get(node.id) || [];
        const mainFlowParent = parentIds.find(id => mainFlowNodeIds.has(id));
        
        if (mainFlowParent) {
          if (!branchNodesMap.has(mainFlowParent)) {
            branchNodesMap.set(mainFlowParent, []);
          }
          branchNodesMap.get(mainFlowParent).push(node);
        }
      }
    });

    return { mainFlowNodes, branchNodes: branchNodesMap };
  };

  // Toggle node expansion
  const toggleNodeExpansion = (nodeId) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  // Expand all nodes
  const expandAll = () => {
    const allNodeIds = new Set(nodes.map(n => n.id));
    setExpandedNodes(allNodeIds);
  };

  // Collapse all nodes
  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  // Get main flow nodes and branch nodes
  const { mainFlowNodes, branchNodes } = findMainFlow(nodes, connections);
  
  // Merge branch nodes into subprocesses of their parent nodes
  const nodesWithBranches = mainFlowNodes.map(node => {
    const branchNodesForThis = branchNodes.get(node.id) || [];
    // Add branch nodes as subprocesses if they're not already in subprocesses
    const existingSubprocesses = node.subprocesses || [];
    const branchSubprocesses = branchNodesForThis.map(branch => {
      const label = extractTextFromHtml(branch.label || '');
      return label || branch.id;
    });
    
    // Merge but avoid duplicates
    const allSubprocesses = [...existingSubprocesses];
    branchSubprocesses.forEach(sub => {
      if (!allSubprocesses.includes(sub)) {
        allSubprocesses.push(sub);
      }
    });

    return {
      ...node,
      subprocesses: allSubprocesses.length > 0 ? allSubprocesses : node.subprocesses,
      branchNodes: branchNodesForThis, // Store branch nodes for reference
    };
  });

  if (loading) {
    return (
      <div className="form-view-container">
        <div className="form-view-loading">Loading diagram...</div>
      </div>
    );
  }

  if (error || !diagram) {
    return (
      <div className="form-view-container">
        <div className="form-view-error">
          <p>{error || 'Diagram not found'}</p>
          <button onClick={() => navigate('/')}>Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="form-view-container">
      <div className="form-view-header">
        <h2>Process Form View: {diagram.name}</h2>
        <div className="form-view-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate(`/?id=${id}`)}
          >
            Back to Editor
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="form-view-content">
        {/* Process Owner Section */}
        <div className="form-section">
          <h3>Process Owner</h3>
          <div className="form-field">
            <label htmlFor="process-owner">Whole Process Owner Name:</label>
            <input
              id="process-owner"
              type="text"
              value={processOwner}
              onChange={(e) => setProcessOwner(e.target.value)}
              placeholder="Enter process owner name"
              className="form-input"
            />
          </div>
        </div>

        {/* Process Steps Section */}
        <div className="form-section">
          <div className="form-section-header">
            <h3>Process Steps</h3>
            {nodesWithBranches.length > 0 && (
              <div className="expand-controls">
                <button
                  type="button"
                  className="btn-expand-all"
                  onClick={expandAll}
                >
                  Expand All
                </button>
                <button
                  type="button"
                  className="btn-collapse-all"
                  onClick={collapseAll}
                >
                  Collapse All
                </button>
              </div>
            )}
          </div>
          {nodesWithBranches.length === 0 ? (
            <p className="form-empty">No process steps found in this diagram.</p>
          ) : (
            <div className="nodes-list">
              {nodesWithBranches.map((node, index) => {
                const { outgoing, incoming } = getNodeConnections(node.id);
                const isExpanded = expandedNodes.has(node.id);
                return (
                  <div key={node.id} className="node-card">
                    <div 
                      className="node-header-collapsible"
                      onClick={() => toggleNodeExpansion(node.id)}
                    >
                      <div className="node-header-left">
                        <span className="node-number">Step {index + 1}</span>
                        <span className="node-shape-badge">{node.shape}</span>
                        <span className="node-label-preview">
                          {node.editedLabel || 'No content'}
                        </span>
                      </div>
                      <div className="node-header-right">
                        {node.owner && (
                          <span className="node-owner-badge">Owner: {node.owner}</span>
                        )}
                        <span className="node-expand-icon">
                          {isExpanded ? '▼' : '▶'}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="node-content">
                      {/* Node Label/Content */}
                      <div className="form-field" style={{ flex: '2', minWidth: '300px' }}>
                        <label htmlFor={`node-label-${node.id}`}>
                          Process Content:
                        </label>
                        <input
                          id={`node-label-${node.id}`}
                          type="text"
                          value={node.editedLabel}
                          onChange={(e) =>
                            handleNodeLabelChange(node.id, e.target.value)
                          }
                          placeholder="Enter process step description"
                          className="form-input"
                        />
                      </div>

                      {/* Node Owner */}
                      <div className="form-field" style={{ flex: '1', minWidth: '200px' }}>
                        <label htmlFor={`node-owner-${node.id}`}>
                          Step Owner:
                        </label>
                        <input
                          id={`node-owner-${node.id}`}
                          type="text"
                          value={node.owner}
                          onChange={(e) =>
                            handleNodeOwnerChange(node.id, e.target.value)
                          }
                          placeholder="Owner name"
                          className="form-input"
                        />
                      </div>

                      {/* Subprocesses */}
                      <div className="form-field" style={{ flex: '1.5', minWidth: '250px' }}>
                        <label>
                          Subprocesses:
                          <button
                            type="button"
                            className="btn-add-subprocess"
                            onClick={() => handleAddSubprocess(node.id)}
                          >
                            + Add
                          </button>
                        </label>
                        {node.subprocesses && node.subprocesses.length > 0 ? (
                          <div className="subprocesses-list">
                            {node.subprocesses.map((subprocess, subIndex) => (
                              <div key={subIndex} className="subprocess-item">
                                <input
                                  type="text"
                                  value={subprocess}
                                  onChange={(e) =>
                                    handleSubprocessChange(
                                      node.id,
                                      subIndex,
                                      e.target.value
                                    )
                                  }
                                  placeholder="Subprocess"
                                  className="form-input subprocess-input"
                                />
                                <button
                                  type="button"
                                  className="btn-remove"
                                  onClick={() =>
                                    handleRemoveSubprocess(node.id, subIndex)
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <input
                            type="text"
                            placeholder="No subprocesses"
                            className="form-input"
                            disabled
                            style={{ opacity: 0.5 }}
                          />
                        )}
                      </div>

                      {/* Connection Info */}
                      {(outgoing.length > 0 || incoming.length > 0) && (
                        <div className="node-connections">
                          {incoming.length > 0 && (
                            <div className="connection-info">
                              <strong>From:</strong>{' '}
                              {incoming
                                .map((c) => {
                                  // Only show connections from main flow nodes
                                  const fromNodeIndex = nodesWithBranches.findIndex((n) => n.id === c.from);
                                  return fromNodeIndex >= 0
                                    ? `Step ${fromNodeIndex + 1}`
                                    : null;
                                })
                                .filter(Boolean)
                                .join(', ') || 'None'}
                            </div>
                          )}
                          {outgoing.length > 0 && (
                            <div className="connection-info">
                              <strong>To:</strong>{' '}
                              {outgoing
                                .map((c) => {
                                  // Only show connections to main flow nodes
                                  const toNodeIndex = nodesWithBranches.findIndex((n) => n.id === c.to);
                                  return toNodeIndex >= 0
                                    ? `Step ${toNodeIndex + 1}`
                                    : null;
                                })
                                .filter(Boolean)
                                .join(', ') || 'None'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FormView;

