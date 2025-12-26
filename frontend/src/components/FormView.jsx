import { useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react';
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
 * 
 * @param {object} props - Component props
 * @param {string} props.diagramId - Optional diagram ID (for embedded mode)
 * @param {boolean} props.embedded - Whether this is embedded in EditorPage
 * @param {function} props.onSaveComplete - Callback when save completes (for syncing)
 * @param {React.Ref} ref - Ref for exposing methods (save, etc.)
 */
const FormView = forwardRef(({ diagramId: propDiagramId, embedded = false, onSaveComplete }, ref) => {
  const { id: paramId } = useParams();
  const navigate = useNavigate();
  
  // Use prop diagramId if provided (embedded mode), otherwise use URL param
  const id = propDiagramId || paramId;
  
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
                  // Assign unique ID if not present (for stable React keys)
                  if (!sub.id && !sub.branchId) {
                    sub.id = `loaded-${nodeIndex}-${subIndex}-${Date.now()}`;
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
  // userSubprocessIndex is the index in the USER-ADDED subprocesses array ONLY (not the merged display array)
  // If the subprocess is detected (isDetected=true), we need to convert it to user-added first
  const handleSubprocessChange = (nodeId, indexOrMergedIndex, field, value) => {
    console.log(`🔄 handleSubprocessChange: nodeId=${nodeId}, index=${indexOrMergedIndex}, field=${field}, value="${value}"`);
    
    setNodes(prevNodes => {
      return prevNodes.map(node => {
        if (node.id !== nodeId) return node;
        
        // CRITICAL: node.subprocesses in state contains ONLY user-added subprocesses
        // NOT the merged array with detected subprocesses
        const userAddedSubprocesses = node.subprocesses || [];
        
        // Check if this is a valid user-added index
        if (indexOrMergedIndex >= 0 && indexOrMergedIndex < userAddedSubprocesses.length) {
          // It's a user-added subprocess - update it
          const subprocess = userAddedSubprocesses[indexOrMergedIndex];
          
          const updatedSubprocess = {
            ...(typeof subprocess === 'string' ? { name: subprocess, shape: 'rectangle' } : subprocess),
            [field]: value
          };
          
          console.log(`   Updated user subprocess[${indexOrMergedIndex}] ${field}="${value}"`);
          
          const updatedSubprocesses = [...userAddedSubprocesses];
          updatedSubprocesses[indexOrMergedIndex] = updatedSubprocess;
          
          return { ...node, subprocesses: updatedSubprocesses };
        } else {
          // Index is out of bounds for user-added array
          // This might be a detected subprocess being edited - we need to find it in the merged array
          console.warn(`⚠️  Index ${indexOrMergedIndex} out of bounds for user-added subprocesses (length: ${userAddedSubprocesses.length})`);
          console.log(`   This appears to be editing a detected subprocess - changes may not persist correctly`);
          return node;
        }
      });
    });
  };

  // Add new subprocess
  const handleAddSubprocess = (nodeId) => {
    console.log(`➕ handleAddSubprocess called for node: ${nodeId}`);
    
    setNodes(prevNodes => {
      return prevNodes.map(node => {
        if (node.id !== nodeId) return node;
        
        // Get ALL current subprocesses (including detected ones in the merged list)
        const allSubprocesses = node.subprocesses || [];
        
        // Calculate default parent based on the NEW index that will be assigned
        // The new subprocess will be at index allSubprocesses.length
        let defaultParent = 'main';
        if (allSubprocesses.length > 0) {
          // Connect to the last subprocess (which is at index length - 1)
          // But the parent reference should be to the last existing subprocess
          // Find the last subprocess that has a name (non-empty)
          let lastValidIndex = allSubprocesses.length - 1;
          while (lastValidIndex >= 0) {
            const sub = allSubprocesses[lastValidIndex];
            const subName = typeof sub === 'string' ? sub : (sub.name || '');
            if (subName && subName.trim()) {
              break;
            }
            lastValidIndex--;
          }
          
          if (lastValidIndex >= 0) {
            defaultParent = `subprocess-${lastValidIndex}`;
          } else {
            defaultParent = 'main';
          }
        }
        
        console.log(`➕ Adding new subprocess to node "${nodeId}":`, {
          currentSubprocessCount: allSubprocesses.length,
          defaultParent,
          nodeLabel: extractTextFromHtml(node.label || node.id)
        });
        
        // Add new empty subprocess at the end
        // Generate a unique ID for this subprocess to ensure stable React keys
        const uniqueId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newSubprocess = { 
          name: '', 
          shape: 'rectangle',
          parent: defaultParent,
          isDetected: false, // Mark as user-added
          id: uniqueId // Add unique ID for stable React keys
        };
        
        const updatedSubprocesses = [...allSubprocesses, newSubprocess];
        
        console.log(`✅ Added subprocess. Total count: ${updatedSubprocesses.length}`);
        
        return { 
          ...node, 
          subprocesses: updatedSubprocesses
        };
      });
    });
  };

  // Remove subprocess - works for both detected and user-added subprocesses
  // For detected subprocesses, mark them as deleted
  // For user-added subprocesses, remove from the array
  // mergedIndex is in the MERGED display array
  const handleRemoveSubprocess = (nodeId, mergedIndex, isDetected, subprocessName, branchId) => {
    console.log(`🗑️ handleRemoveSubprocess: nodeId=${nodeId}, mergedIndex=${mergedIndex}, isDetected=${isDetected}, name="${subprocessName}", branchId=${branchId}`);
    
    if (isDetected && branchId) {
      // It's a detected subprocess (branch node) - mark as deleted by branchId
      const normalizedName = (subprocessName || '').trim().toLowerCase();
      setDeletedSubprocessNames(prev => {
        const newSet = new Set([...prev, normalizedName]);
        console.log(`   Marked "${normalizedName}" (branchId: ${branchId}) as deleted. Deleted list:`, Array.from(newSet));
        return newSet;
      });
    } else {
      // It's a user-added subprocess - remove from node.subprocesses
      // Need to find it by name or ID
      setNodes(prevNodes => {
        return prevNodes.map(node => {
          if (node.id !== nodeId) return node;
          
          const userAddedSubprocesses = node.subprocesses || [];
          
          // Find the subprocess by name or branchId to remove
          const indexToRemove = userAddedSubprocesses.findIndex(sub => {
            const subObj = typeof sub === 'string' ? { name: sub } : sub;
            const subName = (subObj.name || '').trim();
            const subBranchId = subObj.branchId;
            
            // Match by branchId first (most reliable), then by name (case-insensitive)
            if (branchId && subBranchId === branchId) return true;
            if (subName.toLowerCase() === subprocessName.toLowerCase()) return true;
            return false;
          });
          
          if (indexToRemove === -1) {
            console.warn(`   Could not find user subprocess to remove: "${subprocessName}" (branchId: ${branchId})`);
            return node;
          }
          
          const updatedSubprocesses = userAddedSubprocesses.filter((_, idx) => idx !== indexToRemove);
          console.log(`   Removed user-added subprocess at index ${indexToRemove}. Remaining: ${updatedSubprocesses.length}`);
          return { ...node, subprocesses: updatedSubprocesses };
        });
      });
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
      
      console.log('💾 Saving Form View changes...');
      console.log('   Current nodes state:', nodes.map(n => ({
        id: n.id,
        label: n.editedLabel,
        userSubprocesses: n.subprocesses
      })));
      
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
          // Remove internal tracking fields before saving
          const cleanedSub = { ...subObj };
          delete cleanedSub.isDetected; // Don't save this flag
          delete cleanedSub.id; // Don't save internal ID
          return cleanedSub;
        }),
      }));
      
      console.log('   Sending updated nodes to backend:', updatedNodes.map(n => ({
        id: n.id,
        label: n.editedLabel,
        subprocessCount: n.subprocesses?.length || 0,
        subprocesses: n.subprocesses
      })));

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
      
      // Notify parent component that save is complete (for syncing diagram)
      if (onSaveComplete) {
        onSaveComplete(updated);
      }
      
      // Show success message with connection info
      const connectionCount = updated.parsedData?.connections?.length || 0;
      const subprocessCount = updated.parsedData?.nodes?.reduce((sum, n) => 
        sum + (n.subprocesses?.length || 0), 0) || 0;
      
      console.log('✅ Save complete:', {
        subprocessCount,
        connectionCount,
        nodesUpdated: updated.parsedData?.nodes?.length || 0
      });
      
      if (embedded) {
        // In embedded mode, show simpler message
        alert(`Form changes saved! The diagram will reload with your changes.`);
      } else if (subprocessCount > 0) {
        alert(`Changes saved successfully!\n\n${subprocessCount} subprocess(es) saved.\n${connectionCount} total connection(s) in diagram.\n\nNote: Please reload the diagram in the editor to see the changes.`);
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

  // Expose handleSave for embedded mode via ref
  useImperativeHandle(ref, () => ({
    save: handleSave,
    isSaving: saving
  }));

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
    <div className={`form-view-container ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
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
                          // Assign unique ID if not present (for stable React keys)
                          if (!subObj.id && !subObj.branchId) {
                            subObj.id = `refreshed-${nodeIndex}-${subIndex}-${Date.now()}`;
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
      )}

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
                            {node.subprocesses.map((subprocess, mergedIndex) => {
                              // CRITICAL: node.subprocesses here is the MERGED array (detected + user-added)
                              // But the state only contains user-added subprocesses
                              // We need to calculate the correct index in the user-added array
                              
                              const isDetected = subprocess.isDetected || false;
                              
                              // Calculate userAddedIndex: count how many non-detected subprocesses came before this one
                              let userAddedIndex = -1;
                              if (!isDetected) {
                                userAddedIndex = node.subprocesses
                                  .slice(0, mergedIndex)
                                  .filter(s => !(s.isDetected || false))
                                  .length;
                              }
                              
                              // CRITICAL: Use a stable key that doesn't change when editing
                              // Priority: 1. subprocess.id (for user-added), 2. branchId (for detected), 3. index-based fallback
                              const subprocessKey = subprocess.id 
                                ? `user-${subprocess.id}`
                                : subprocess.branchId 
                                  ? `branch-${subprocess.branchId}` 
                                  : `fallback-${node.id}-sub-${mergedIndex}`;
                              
                              // Ensure subprocess is an object with all required fields
                              const subprocessObj = typeof subprocess === 'string' 
                                ? { name: subprocess, shape: 'rectangle', parent: mergedIndex === 0 ? 'main' : `subprocess-${mergedIndex - 1}` }
                                : { 
                                    name: subprocess.name || '', 
                                    shape: subprocess.shape || 'rectangle', 
                                    parent: subprocess.parent || (mergedIndex === 0 ? 'main' : `subprocess-${mergedIndex - 1}`),
                                    isDetected: subprocess.isDetected || false,
                                    branchId: subprocess.branchId || null,
                                    id: subprocess.id || null
                                  };
                              
                              // Build parent options: main step + ALL existing subprocesses (except current one)
                              const parentOptions = [
                                { value: 'main', label: `Main Step: ${node.editedLabel || 'Step'}` }
                              ];
                              
                              // Add ALL existing subprocesses as parent options (except the current one)
                              for (let i = 0; i < node.subprocesses.length; i++) {
                                if (i === mergedIndex) continue; // Skip current subprocess
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
                                      onChange={(e) => {
                                        if (isDetected) {
                                          console.warn('⚠️ Editing detected subprocess - this will convert it to user-added');
                                        }
                                        handleSubprocessChange(
                                          node.id,
                                          userAddedIndex >= 0 ? userAddedIndex : mergedIndex,
                                          'name',
                                          e.target.value
                                        );
                                      }}
                                      placeholder="Subprocess name"
                                      className="form-input subprocess-input"
                                      title={isDetected ? 'Detected subprocess from editor (editable)' : 'Enter subprocess name'}
                                    />
                                    <select
                                      value={subprocessObj.shape || 'rectangle'}
                                      onChange={(e) => {
                                        if (isDetected) {
                                          console.warn('⚠️ Editing detected subprocess - this will convert it to user-added');
                                        }
                                        handleSubprocessChange(
                                          node.id,
                                          userAddedIndex >= 0 ? userAddedIndex : mergedIndex,
                                          'shape',
                                          e.target.value
                                        );
                                      }}
                                      className="form-select subprocess-shape"
                                      title={isDetected ? 'Detected subprocess from editor (editable)' : 'Select subprocess shape'}
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
                                        handleRemoveSubprocess(node.id, mergedIndex, isDetected, subprocessObj.name, subprocessObj.branchId)
                                      }
                                      title={isDetected ? 'Remove this detected subprocess' : 'Remove this subprocess'}
                                    >
                                      ×
                                    </button>
                                  </div>
                                  <div className="subprocess-parent-row">
                                    <label className="subprocess-parent-label">Connect to:</label>
                                    <select
                                      value={subprocessObj.parent || (mergedIndex === 0 ? 'main' : `subprocess-${mergedIndex - 1}`)}
                                      onChange={(e) => {
                                        if (isDetected) {
                                          console.warn('⚠️ Editing detected subprocess - this will convert it to user-added');
                                        }
                                        handleSubprocessChange(
                                          node.id,
                                          userAddedIndex >= 0 ? userAddedIndex : mergedIndex,
                                          'parent',
                                          e.target.value
                                        );
                                      }}
                                      className="form-select subprocess-parent"
                                      title={isDetected ? 'Detected subprocess from editor (editable)' : 'Select which node this subprocess connects to'}
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
});

FormView.displayName = 'FormView';

export default FormView;

