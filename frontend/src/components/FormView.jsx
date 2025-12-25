import { useEffect, useState, useRef } from 'react';
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
  const [deletedSubprocessNames, setDeletedSubprocessNames] = useState(new Set()); // Track deleted subprocesses by name
  const lastReloadTimeRef = useRef(0); // Track last reload time to avoid excessive reloads

  // Load diagram data
  useEffect(() => {
    if (!id) {
      setError('No diagram ID provided');
      setLoading(false);
      return;
    }

    const loadData = () => {
      setLoading(true);
      fetch(`http://localhost:3001/api/diagrams/${id}`)
        .then((res) => {
          if (!res.ok) {
            throw new Error('Failed to fetch diagram');
          }
          return res.json();
        })
        .then((data) => {
          console.log('📥 FormView: Loaded diagram data:', {
            nodeCount: data.parsedData?.nodes?.length || 0,
            connectionCount: data.parsedData?.connections?.length || 0,
            nodeIds: data.parsedData?.nodes?.map(n => ({ id: n.id, label: extractTextFromHtml(n.label || '') })) || []
          });
          
          setDiagram(data);
          setProcessOwner(data.processOwner || '');
          
          // Initialize nodes with editable content
          if (data.parsedData?.nodes) {
            const editableNodes = data.parsedData.nodes.map((node, nodeIndex) => {
              // Convert subprocesses to objects if they're strings
              // IMPORTANT: Only include user-added subprocesses here (not detected ones)
              // Detected subprocesses will be added dynamically from branch nodes
              const processedSubprocesses = (node.subprocesses || [])
                .map(sub => typeof sub === 'string' ? { name: sub, shape: 'rectangle' } : sub)
                .map((sub, subIndex) => {
                  // Set default parent if not present
                  if (!sub.parent) {
                    sub.parent = subIndex === 0 ? 'main' : `subprocess-${subIndex - 1}`;
                  }
                  return sub;
                });
              
              return {
                ...node,
                editedLabel: extractTextFromHtml(node.label || ''),
                owner: node.owner || '',
                subprocesses: processedSubprocesses, // Only user-added subprocesses
              };
            });
            setNodes(editableNodes);
            // Expand all nodes by default
            setExpandedNodes(new Set(editableNodes.map(n => n.id)));
            
            console.log('📋 FormView: Initialized nodes:', editableNodes.map(n => ({
              id: n.id,
              label: n.editedLabel,
              userAddedSubprocessCount: n.subprocesses?.length || 0
            })));
          } else {
            setNodes([]);
          }
          
          if (data.parsedData?.connections) {
            setConnections(data.parsedData.connections);
            console.log('🔗 FormView: Loaded connections:', data.parsedData.connections.map(c => ({
              from: c.from,
              to: c.to
            })));
          } else {
            setConnections([]);
          }
          
          // Clear deleted subprocess names when reloading to allow newly detected ones to appear
          setDeletedSubprocessNames(new Set());
          
          setLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setError('Failed to load diagram');
          setLoading(false);
        });
    };

    loadData();

    // Reload data when component becomes visible (user navigates back from Editor)
    // Use a debounce mechanism to avoid excessive reloads
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && id) {
        const now = Date.now();
        // Only reload if at least 2 seconds have passed since last reload
        if (now - lastReloadTimeRef.current > 2000) {
          console.log('FormView: Page became visible, reloading diagram data...');
          lastReloadTimeRef.current = now;
          loadData();
        }
      }
    };

    let focusTimeoutId = null;
    const handleFocus = () => {
      if (id) {
        // Clear any pending focus reload
        if (focusTimeoutId) {
          clearTimeout(focusTimeoutId);
        }
        // Debounce focus events - only reload if window was unfocused for a while
        focusTimeoutId = setTimeout(() => {
          const now = Date.now();
          // Only reload if at least 2 seconds have passed since last reload
          if (now - lastReloadTimeRef.current > 2000) {
            console.log('FormView: Window focused after being away, reloading diagram data...');
            lastReloadTimeRef.current = now;
            loadData();
          }
          focusTimeoutId = null;
        }, 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      if (focusTimeoutId) {
        clearTimeout(focusTimeoutId);
      }
    };
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
  // IMPORTANT: subprocessIndex is the index in the DISPLAYED list (nodesWithBranches)
  // We need to find the corresponding subprocess in node.subprocesses or handle detected ones
  const handleSubprocessChange = (nodeId, subprocessIndex, field, value) => {
    console.log(`🔄 handleSubprocessChange: nodeId=${nodeId}, subprocessIndex=${subprocessIndex}, field=${field}, value="${value}"`);
    
    setNodes(prevNodes => {
      // Get the current displayed subprocesses to find what we're updating
      const { mainFlowNodes, branchNodes } = findMainFlow(prevNodes, connections);
      const currentNode = mainFlowNodes.find(n => n.id === nodeId);
      if (!currentNode) {
        console.warn(`⚠️  Node ${nodeId} not found in main flow`);
        return prevNodes;
      }
      
      const branchNodesForThis = branchNodes.get(nodeId) || [];
      const userAddedSubprocesses = (currentNode.subprocesses || []).map(sub => 
        typeof sub === 'string' ? { name: sub, shape: 'rectangle' } : sub
      );
      
      const userAddedSubprocessNames = new Set(
        userAddedSubprocesses
          .map(sub => (sub.name || '').trim().toLowerCase())
          .filter(name => name.length > 0)
      );
      
      const detectedSubprocesses = branchNodesForThis
        .map(branch => {
          const label = extractTextFromHtml(branch.label || '');
          return {
            name: label || branch.id,
            shape: branch.shape || 'rectangle',
            parent: 'main',
            isDetected: true,
            branchId: branch.id
          };
        })
        .filter(branchSub => {
          const branchName = (branchSub.name || '').trim().toLowerCase();
          return branchName.length > 0 && 
                 !userAddedSubprocessNames.has(branchName) &&
                 !deletedSubprocessNames.has(branchName);
        });
      
      // Display order: detected first, then user-added
      const displayedSubprocesses = [...detectedSubprocesses, ...userAddedSubprocesses];
      
      if (subprocessIndex >= 0 && subprocessIndex < displayedSubprocesses.length) {
        const subprocessToUpdate = displayedSubprocesses[subprocessIndex];
        const isDetected = subprocessToUpdate.isDetected || subprocessIndex < detectedSubprocesses.length;
        
        console.log(`   Subprocess to update:`, {
          isDetected,
          subprocessIndex,
          detectedCount: detectedSubprocesses.length,
          userAddedCount: userAddedSubprocesses.length,
          subprocessToUpdate
        });
        
        return prevNodes.map(node => {
          if (node.id === nodeId) {
            if (isDetected) {
              // For detected subprocesses, we need to add them to node.subprocesses first
              // Then update them
              const subprocessName = (subprocessToUpdate.name || '').trim().toLowerCase();
              const existingIndex = userAddedSubprocesses.findIndex(sub => {
                const subName = (sub.name || '').trim().toLowerCase();
                return subName === subprocessName || (sub.branchId === subprocessToUpdate.branchId && subprocessToUpdate.branchId);
              });
              
              let updatedSubprocesses = [...userAddedSubprocesses];
              
              if (existingIndex >= 0) {
                // Already exists in user-added, update it
                const subprocess = { ...updatedSubprocesses[existingIndex] };
                subprocess[field] = value;
                updatedSubprocesses[existingIndex] = subprocess;
                console.log(`   ✅ Updated existing user-added subprocess at index ${existingIndex}`);
              } else {
                // Check if we're updating an empty subprocess that matches this detected one
                // (This can happen when user starts typing in an empty subprocess that happens to match a detected name)
                const emptySubprocessIndex = userAddedSubprocesses.findIndex(sub => 
                  (!sub.name || sub.name.trim() === '') && field === 'name'
                );
                
                if (emptySubprocessIndex >= 0 && field === 'name') {
                  // Update the empty subprocess instead of creating a new one
                  const subprocess = { ...userAddedSubprocesses[emptySubprocessIndex] };
                  subprocess[field] = value;
                  subprocess.branchId = subprocessToUpdate.branchId; // Link to detected branch
                  updatedSubprocesses[emptySubprocessIndex] = subprocess;
                  console.log(`   ✅ Updated empty subprocess at index ${emptySubprocessIndex} with detected branch info`);
                } else {
                  // Doesn't exist yet, add it as a new user-added subprocess
                  const newSubprocess = {
                    name: subprocessToUpdate.name,
                    shape: subprocessToUpdate.shape || 'rectangle',
                    parent: subprocessToUpdate.parent || 'main',
                    branchId: subprocessToUpdate.branchId,
                    [field]: value
                  };
                  updatedSubprocesses.push(newSubprocess);
                  console.log(`   ➕ Added new user-added subprocess from detected`);
                }
              }
              
              return { ...node, subprocesses: updatedSubprocesses };
            } else {
              // It's a user-added subprocess - update directly by index in userAddedSubprocesses
              const userAddedIndex = subprocessIndex - detectedSubprocesses.length;
              const updatedSubprocesses = [...userAddedSubprocesses];
              
              if (userAddedIndex >= 0 && userAddedIndex < updatedSubprocesses.length) {
                // Get the existing subprocess
                const existingSubprocess = updatedSubprocesses[userAddedIndex];
                const subprocess = typeof existingSubprocess === 'string'
                  ? { name: existingSubprocess, shape: 'rectangle' }
                  : { ...existingSubprocess };
                
                // Update the field
                subprocess[field] = value;
                
                // IMPORTANT: Preserve all existing properties to avoid creating a new object
                updatedSubprocesses[userAddedIndex] = subprocess;
                
                console.log(`   ✅ Updated user-added subprocess at index ${userAddedIndex} (display index ${subprocessIndex}):`, {
                  before: existingSubprocess,
                  after: subprocess
                });
              } else {
                console.warn(`⚠️  Invalid userAddedIndex: ${userAddedIndex} (subprocessIndex: ${subprocessIndex}, detectedCount: ${detectedSubprocesses.length}, userAddedCount: ${userAddedSubprocesses.length})`);
                // Don't modify if index is invalid
                return prevNodes;
              }
              
              return { ...node, subprocesses: updatedSubprocesses };
            }
          }
          return node;
        });
      }
      
      console.warn(`⚠️  Invalid subprocessIndex: ${subprocessIndex} (total displayed: ${displayedSubprocesses.length})`);
      return prevNodes;
    });
  };

  // Add new subprocess
  const handleAddSubprocess = (nodeId) => {
    console.log(`➕ handleAddSubprocess called for node: ${nodeId}`);
    
    setNodes(prevNodes => {
      // Find the node in the current state
      const currentNode = prevNodes.find(n => n.id === nodeId);
      if (!currentNode) {
        console.warn(`⚠️  Cannot add subprocess: Node ${nodeId} not found in nodes state`);
        console.warn(`   Available node IDs:`, prevNodes.map(n => n.id));
        return prevNodes;
      }

      // Get existing user-added subprocesses (not detected ones)
      const existingSubprocesses = (currentNode.subprocesses || []).map(sub => 
        typeof sub === 'string' ? { name: sub, shape: 'rectangle' } : sub
      );

      // Calculate default parent based on the DISPLAYED subprocesses (detected + user-added)
      // We need to check what's actually displayed to determine the correct parent index
      let detectedCount = 0;
      try {
        const { mainFlowNodes, branchNodes } = findMainFlow(prevNodes, connections);
        const branchNodesForThis = branchNodes.get(nodeId) || [];
        detectedCount = branchNodesForThis.length;
      } catch (error) {
        console.warn('⚠️  Error calculating detected subprocesses:', error);
        detectedCount = 0;
      }
      
      // Default parent: 'main' for first subprocess, last existing subprocess for others
      let defaultParent = 'main';
      if (existingSubprocesses.length > 0) {
        // Find the last subprocess with a name (skip empty ones)
        for (let i = existingSubprocesses.length - 1; i >= 0; i--) {
          const lastSub = existingSubprocesses[i];
          if (lastSub.name && lastSub.name.trim()) {
            // Parent index needs to account for detected subprocesses that appear first
            // In display: detected subprocesses are at indices 0 to detectedCount-1
            // User-added subprocesses start at index detectedCount
            // So the parent index for user-added is: detectedCount + i
            defaultParent = `subprocess-${detectedCount + i}`;
            break;
          }
        }
      } else if (detectedCount > 0) {
        // If no user-added subprocesses yet, but there are detected ones,
        // default to connecting to the last detected subprocess
        defaultParent = `subprocess-${detectedCount - 1}`;
      }
      
      console.log(`➕ Adding new subprocess to node "${nodeId}":`, {
        existingUserAddedCount: existingSubprocesses.length,
        detectedCount,
        defaultParent,
        currentNodeLabel: extractTextFromHtml(currentNode.label || currentNode.id)
      });
      
      // Always add new subprocess at the END of the user-added array
      // (It will appear after detected subprocesses in the display)
      const updatedNodes = prevNodes.map(node => {
        if (node.id === nodeId) {
          const newSubprocess = { 
            name: '', 
            shape: 'rectangle',
            parent: defaultParent
          };
          const updatedSubprocesses = [...existingSubprocesses, newSubprocess];
          
          console.log(`✅ Updated node ${nodeId} subprocesses:`, {
            before: existingSubprocesses.length,
            after: updatedSubprocesses.length,
            newSubprocess
          });
          
          return { 
            ...node, 
            subprocesses: updatedSubprocesses
          };
        }
        return node;
      });
      
      return updatedNodes;
    });
  };

  // Remove subprocess - works for both detected and user-added subprocesses
  const handleRemoveSubprocess = (nodeId, subprocessIndex) => {
    // Get the current displayed subprocesses (detected first, then user-added)
    const { mainFlowNodes, branchNodes } = findMainFlow(nodes, connections);
    const currentNode = mainFlowNodes.find(n => n.id === nodeId);
    if (!currentNode) return;
    
    const branchNodesForThis = branchNodes.get(nodeId) || [];
    const userAddedSubprocesses = (currentNode.subprocesses || []).map(sub => 
      typeof sub === 'string' ? { name: sub, shape: 'rectangle' } : sub
    );
    
    const userAddedSubprocessNames = new Set(
      userAddedSubprocesses
        .map(sub => (sub.name || '').trim().toLowerCase())
        .filter(name => name.length > 0)
    );
    
    const detectedSubprocesses = branchNodesForThis
      .map(branch => {
        const label = extractTextFromHtml(branch.label || '');
        return {
          name: label || branch.id,
          shape: branch.shape || 'rectangle',
          parent: 'main',
          isDetected: true
        };
      })
      .filter(branchSub => {
        const branchName = (branchSub.name || '').trim().toLowerCase();
        return branchName.length > 0 && 
               !userAddedSubprocessNames.has(branchName) &&
               !deletedSubprocessNames.has(branchName);
      });
    
    // Display order: detected first, then user-added
    const displayedSubprocesses = [...detectedSubprocesses, ...userAddedSubprocesses];
    
    if (subprocessIndex >= 0 && subprocessIndex < displayedSubprocesses.length) {
      const subprocessToDelete = displayedSubprocesses[subprocessIndex];
      const subprocessName = (subprocessToDelete.name || '').trim().toLowerCase();
      const isDetected = subprocessToDelete.isDetected || subprocessIndex < detectedSubprocesses.length;
      
      if (isDetected) {
        // It's a detected subprocess (branch node) - mark as deleted
        setDeletedSubprocessNames(prev => new Set([...prev, subprocessName]));
      } else {
        // It's a user-added subprocess - remove from node.subprocesses
        setNodes(prevNodes =>
          prevNodes.map(node => {
            if (node.id === nodeId) {
              const updatedSubprocesses = (node.subprocesses || [])
                .map(sub => typeof sub === 'string' ? { name: sub, shape: 'rectangle' } : sub)
                .filter(sub => {
                  const subName = (sub.name || '').trim().toLowerCase();
                  return subName !== subprocessName;
                });
              return { ...node, subprocesses: updatedSubprocesses };
            }
            return node;
          })
        );
      }
    }
  };

  // Save changes
  const handleSave = async () => {
    if (!diagram) return;

    setSaving(true);
    try {
      // First, fetch the latest diagram data to ensure we have the most recent connections
      // This prevents overwriting Editor changes that happened after FormView loaded
      const latestResponse = await fetch(`http://localhost:3001/api/diagrams/${id}`);
      if (!latestResponse.ok) {
        throw new Error('Failed to fetch latest diagram data');
      }
      const latestDiagram = await latestResponse.json();
      
      // Update parsedData with edited nodes
      const updatedNodes = nodes.map((node, nodeIndex) => ({
        ...node,
        label: textToHtml(node.editedLabel), // Convert back to HTML format
        editedLabel: node.editedLabel, // Keep editedLabel for XML update
        subprocesses: (node.subprocesses || []).map((sub, subIndex) => {
          const subObj = typeof sub === 'string' 
            ? { name: sub, shape: 'rectangle' } 
            : sub;
          // Ensure parent is set (default if missing)
          if (!subObj.parent) {
            subObj.parent = subIndex === 0 ? 'main' : `subprocess-${subIndex - 1}`;
          }
          return subObj;
        }),
      }));

      // Use latest connections from database to preserve Editor changes
      const latestConnections = latestDiagram.parsedData?.connections || connections;

      const response = await fetch(`http://localhost:3001/api/diagrams/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          processOwner,
          parsedData: {
            ...latestDiagram.parsedData, // Use latest parsedData as base
            nodes: updatedNodes, // Override with FormView edits
            connections: latestConnections, // Use latest connections
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save changes');
      }

      const updated = await response.json();
      setDiagram(updated);
      
      // Show success message with connection info
      const connectionCount = updated.parsedData?.connections?.length || 0;
      const subprocessCount = updated.parsedData?.nodes?.reduce((sum, n) => 
        sum + (n.subprocesses?.length || 0), 0) || 0;
      
      if (subprocessCount > 0) {
        alert(`Changes saved successfully!\n\n${subprocessCount} subprocess(es) added.\n${connectionCount} total connection(s) in diagram.\n\nNote: Please reload the diagram in the editor to see the new connectors.`);
      } else {
        alert('Changes saved successfully!');
      }
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

    // Helper function to find the ultimate main flow ancestor of a branch node
    const findMainFlowAncestor = (nodeId, visited = new Set()) => {
      if (visited.has(nodeId)) {
        return null; // Cycle detected
      }
      visited.add(nodeId);

      // If this node is in main flow, return it
      if (mainFlowNodeIds.has(nodeId)) {
        return nodeId;
      }

      // Check direct parents
      const parentIds = parents.get(nodeId) || [];
      for (const parentId of parentIds) {
        if (mainFlowNodeIds.has(parentId)) {
          return parentId; // Found direct main flow parent
        }
      }

      // Recursively check branch node parents to find ultimate main flow ancestor
      for (const parentId of parentIds) {
        const ancestor = findMainFlowAncestor(parentId, visited);
        if (ancestor) {
          return ancestor;
        }
      }

      // Also check if any child connects to main flow (reverse direction)
      const childIds = children.get(nodeId) || [];
      for (const childId of childIds) {
        if (mainFlowNodeIds.has(childId)) {
          // This branch node feeds into a main flow node
          // Find which main flow node comes before this child in the flow
          const childParents = parents.get(childId) || [];
          const mainFlowParent = childParents.find(id => mainFlowNodeIds.has(id));
          if (mainFlowParent) {
            return mainFlowParent;
          }
        }
      }

      return null;
    };

    nodes.forEach(node => {
      if (!mainFlowNodeIds.has(node.id)) {
        // This is a branch node, find its ultimate main flow ancestor
        const mainFlowAncestor = findMainFlowAncestor(node.id);
        
        if (mainFlowAncestor) {
          if (!branchNodesMap.has(mainFlowAncestor)) {
            branchNodesMap.set(mainFlowAncestor, []);
          }
          branchNodesMap.get(mainFlowAncestor).push(node);
          console.log(`🔗 Branch node "${node.id}" (${extractTextFromHtml(node.label || node.id)}) associated with main flow node "${mainFlowAncestor}"`);
        } else {
          // Could not find main flow ancestor - log for debugging
          console.warn(`⚠️  Branch node "${node.id}" (${extractTextFromHtml(node.label || node.id)}) has no main flow ancestor - may be orphaned`);
        }
      }
    });
    
    // Debug: Log branch nodes found
    if (branchNodesMap.size > 0) {
      console.log('🔍 Branch nodes detected:', Array.from(branchNodesMap.entries()).map(([parentId, branches]) => {
        const parentNode = nodeMap.get(parentId);
        const parentLabel = parentNode ? extractTextFromHtml(parentNode.label || parentNode.id) : parentId;
        const branchLabels = branches.map(b => {
          const label = extractTextFromHtml(b.label || b.id);
          return `${b.id} (${label})`;
        });
        return `${parentLabel} [${parentId}]: [${branchLabels.join(', ')}]`;
      }).join('; '));
    } else {
      console.log('⚠️  No branch nodes detected. Total nodes:', nodes.length, 'Main flow nodes:', mainFlowNodes.length);
    }

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
  
  // Track all branch node IDs that have been added to avoid duplicates across all nodes
  const allAddedBranchIds = new Set();
  
  // Merge branch nodes into subprocesses of their parent nodes
  // CRITICAL: Display order should be: detected subprocesses (branch nodes) FIRST, then user-added ones
  // This ensures new subprocesses always appear at the end
  const nodesWithBranches = mainFlowNodes.map(node => {
    const branchNodesForThis = branchNodes.get(node.id) || [];
    
    // Get user-added subprocesses from node state
    const userAddedSubprocesses = (node.subprocesses || []).map(sub => 
      typeof sub === 'string' ? { name: sub, shape: 'rectangle' } : sub
    );
    
    // Get names AND IDs of user-added subprocesses (to avoid duplicates with branch nodes)
    const userAddedSubprocessNames = new Set(
      userAddedSubprocesses
        .map(sub => (sub.name || '').trim().toLowerCase())
        .filter(name => name.length > 0)
    );
    // Check both branchId (if it was a detected branch node that got saved) and any ID field
    const userAddedSubprocessIds = new Set(
      userAddedSubprocesses
        .map(sub => {
          // Check for branchId first (if it was a detected branch node)
          if (sub.branchId) return sub.branchId;
          // Also check if the name matches a branch node ID (for cases where name = ID)
          if (sub.name && branchNodesForThis.some(b => b.id === sub.name)) {
            return sub.name;
          }
          return null;
        })
        .filter(id => id)
    );
    
    // Convert branch nodes (detected subprocesses) to subprocess format
    // Filter out deleted ones, ones that already exist in user-added list, and duplicates
    const detectedSubprocesses = branchNodesForThis
      .map((branch, branchIndex) => {
        // Extract label - handle both HTML and plain text
        let branchName = '';
        if (branch.label) {
          branchName = extractTextFromHtml(branch.label);
        }
        // Fallback to ID if label is empty or just whitespace
        if (!branchName || !branchName.trim()) {
          // Use the node ID as name (e.g., "s1", "s2", "s3", "s4")
          branchName = branch.id || `Branch-${branchIndex}`;
        }
        
        // Ensure we have a valid name (trim and use ID as final fallback)
        branchName = branchName.trim();
        if (!branchName) {
          branchName = branch.id || `Subprocess-${branchIndex + 1}`;
        }
        
        // Map shape correctly - ellipse should be 'ellipse', not 'circle'
        let branchShape = branch.shape || 'rectangle';
        if (branchShape === 'circle') {
          branchShape = 'ellipse';
        }
        
        return {
          name: branchName,
          shape: branchShape,
          parent: 'main', // Default parent for branch nodes
          isDetected: true, // Mark as detected for tracking
          branchId: branch.id // Store original branch ID for reference
        };
      })
      .filter(branchSub => {
        const branchName = (branchSub.name || '').trim().toLowerCase();
        const branchId = branchSub.branchId;
        
        // Filter out if:
        // 1. Empty name
        // 2. Already in user-added list (by name or by branchId)
        // 3. Was deleted
        // 4. Already added to another node (duplicate across nodes)
        const shouldInclude = branchName.length > 0 && 
               !userAddedSubprocessNames.has(branchName) &&
               !userAddedSubprocessIds.has(branchId) &&
               !deletedSubprocessNames.has(branchName) &&
               !allAddedBranchIds.has(branchId);
        
        if (!shouldInclude && branchName.length > 0) {
          console.log(`⚠️  Filtered out subprocess "${branchSub.name}" (${branchId}):`, {
            inUserAddedByName: userAddedSubprocessNames.has(branchName),
            inUserAddedById: userAddedSubprocessIds.has(branchId),
            isDeleted: deletedSubprocessNames.has(branchName),
            alreadyAddedToAnotherNode: allAddedBranchIds.has(branchId)
          });
        } else if (shouldInclude) {
          // Mark this branch ID as added to prevent duplicates
          allAddedBranchIds.add(branchId);
        }
        
        return shouldInclude;
      });
    
    // Debug: Log detected subprocesses
    if (detectedSubprocesses.length > 0) {
      console.log(`✅ Detected ${detectedSubprocesses.length} subprocess(es) for node "${extractTextFromHtml(node.label || node.id)}" [${node.id}]:`, 
        detectedSubprocesses.map(s => `"${s.name}" (${s.shape}, branchId: ${s.branchId})`).join(', '));
    } else if (branchNodesForThis.length > 0) {
      console.warn(`⚠️  Found ${branchNodesForThis.length} branch node(s) but none passed filters for node "${extractTextFromHtml(node.label || node.id)}" [${node.id}]:`, 
        branchNodesForThis.map(b => `${b.id} (${extractTextFromHtml(b.label || b.id)})`).join(', '));
    }
    
    // Debug: Log detected subprocesses
    if (detectedSubprocesses.length > 0) {
      console.log(`✅ Detected ${detectedSubprocesses.length} subprocess(es) for node "${extractTextFromHtml(node.label || node.id)}" [${node.id}]:`, 
        detectedSubprocesses.map(s => `"${s.name}" (${s.shape}, branchId: ${s.branchId})`).join(', '));
    } else if (branchNodesForThis.length > 0) {
      console.warn(`⚠️  Found ${branchNodesForThis.length} branch node(s) but none passed filters for node "${extractTextFromHtml(node.label || node.id)}" [${node.id}]:`, 
        branchNodesForThis.map(b => `${b.id} (${extractTextFromHtml(b.label || b.id)})`).join(', '));
    }
    
    // CRITICAL: Display order - detected subprocesses FIRST, then user-added ones
    // This ensures new subprocesses always appear at the end
    const allSubprocesses = [...detectedSubprocesses, ...userAddedSubprocesses];

    return {
      ...node,
      // Use the merged list with detected first, then user-added
      subprocesses: allSubprocesses,
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
            onClick={() => {
              // Reload diagram data from server to sync with editor changes
              setLoading(true);
              // Clear deleted subprocess names so newly added subprocesses from editor can appear
              setDeletedSubprocessNames(new Set());
              
              fetch(`http://localhost:3001/api/diagrams/${id}`)
                .then((res) => {
                  if (!res.ok) throw new Error('Failed to fetch diagram');
                  return res.json();
                })
                .then((data) => {
                  setDiagram(data);
                  setProcessOwner(data.processOwner || '');
                  
                  if (data.parsedData?.nodes) {
                    const editableNodes = data.parsedData.nodes.map((node, nodeIndex) => {
                      // Process subprocesses from database (these are user-added ones)
                      const processedSubprocesses = (node.subprocesses || []).map((sub, subIndex) => {
                        const subObj = typeof sub === 'string' 
                          ? { name: sub, shape: 'rectangle' } 
                          : sub;
                        if (!subObj.parent) {
                          subObj.parent = subIndex === 0 ? 'main' : `subprocess-${subIndex - 1}`;
                        }
                        return subObj;
                      });
                      return {
                        ...node,
                        editedLabel: extractTextFromHtml(node.label || ''),
                        owner: node.owner || '',
                        subprocesses: processedSubprocesses,
                      };
                    });
                    setNodes(editableNodes);
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
                  alert('Form view refreshed from editor! New subprocesses added in the editor should now be visible.');
                })
                .catch((err) => {
                  console.error(err);
                  setError('Failed to refresh diagram');
                  setLoading(false);
                  alert('Failed to refresh. Please try again.');
                });
            }}
            title="Refresh form view with latest changes from editor"
          >
            🔄 Refresh from Editor
          </button>
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
                      <div className="form-field" style={{ flex: '1.5', minWidth: '250px', maxWidth: '400px' }}>
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
                      <div className="form-field" style={{ flex: '1', minWidth: '180px', maxWidth: '250px' }}>
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
                            {node.subprocesses.map((subprocess, subIndex) => {
                              // CRITICAL: Use a stable key based on the subprocess itself, not just index
                              // This prevents React from creating new elements on each render
                              const subprocessKey = subprocess.branchId 
                                ? `branch-${subprocess.branchId}` 
                                : `user-${node.id}-${subIndex}-${subprocess.name || 'empty'}`;
                              // Ensure subprocess is an object with all required fields
                              const subprocessObj = typeof subprocess === 'string' 
                                ? { name: subprocess, shape: 'rectangle', parent: subIndex === 0 ? 'main' : `subprocess-${subIndex - 1}` }
                                : { 
                                    name: subprocess.name || '', 
                                    shape: subprocess.shape || 'rectangle', 
                                    parent: subprocess.parent || (subIndex === 0 ? 'main' : `subprocess-${subIndex - 1}`),
                                    isDetected: subprocess.isDetected || false,
                                    branchId: subprocess.branchId || null
                                  };
                              
                              // Build parent options: main step + ALL existing subprocesses (except current one)
                              const parentOptions = [
                                { value: 'main', label: `Main Step: ${node.editedLabel || 'Step'}` }
                              ];
                              
                              // Add ALL existing subprocesses as parent options (except the current one)
                              for (let i = 0; i < node.subprocesses.length; i++) {
                                if (i === subIndex) continue; // Skip current subprocess
                                const existingSub = node.subprocesses[i];
                                const existingSubObj = typeof existingSub === 'string' 
                                  ? { name: existingSub, shape: 'rectangle' } 
                                  : existingSub;
                                const subName = existingSubObj.name || `S${i + 1}`;
                                // Only add if it has a name (don't show empty subprocesses)
                                if (subName && subName.trim()) {
                                  parentOptions.push({
                                    value: `subprocess-${i}`,
                                    label: `Subprocess: ${subName}`
                                  });
                                }
                              }
                              
                              // Use the stable key we created above
                              return (
                                <div key={subprocessKey} className="subprocess-item-wrapper">
                                  <div className="subprocess-item">
                                    <input
                                      type="text"
                                      value={subprocessObj.name || ''}
                                      onChange={(e) =>
                                        handleSubprocessChange(
                                          node.id,
                                          subIndex,
                                          'name',
                                          e.target.value
                                        )
                                      }
                                      placeholder="Subprocess name"
                                      className="form-input subprocess-input"
                                    />
                                    <select
                                      value={subprocessObj.shape || 'rectangle'}
                                      onChange={(e) =>
                                        handleSubprocessChange(
                                          node.id,
                                          subIndex,
                                          'shape',
                                          e.target.value
                                        )
                                      }
                                      className="form-select subprocess-shape"
                                    >
                                      <option value="rectangle">Rectangle</option>
                                      <option value="ellipse">Circle/Ellipse</option>
                                      <option value="decision">Decision/Diamond</option>
                                      <option value="data">Data/Parallelogram</option>
                                      <option value="document">Document</option>
                                      <option value="subprocess">Subprocess</option>
                                    </select>
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
                                  <div className="subprocess-parent-row">
                                    <label className="subprocess-parent-label">Connect to:</label>
                                    <select
                                      value={subprocessObj.parent || (subIndex === 0 ? 'main' : `subprocess-${subIndex - 1}`)}
                                      onChange={(e) =>
                                        handleSubprocessChange(
                                          node.id,
                                          subIndex,
                                          'parent',
                                          e.target.value
                                        )
                                      }
                                      className="form-select subprocess-parent"
                                      title="Select which node this subprocess connects to"
                                    >
                                      {parentOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              );
                            })}
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

