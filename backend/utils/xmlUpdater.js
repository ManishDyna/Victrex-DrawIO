const zlib = require('zlib');

/**
 * Updates diagram XML with changes from Form View using string manipulation
 * This preserves the XML structure and avoids parsing/rebuilding issues
 * @param {string} xml - Original XML string
 * @param {Array} updatedNodes - Array of updated node objects with id, editedLabel, owner, etc.
 * @returns {string} - Updated XML string
 */
function updateDiagramXml(xml, updatedNodes) {
  if (!xml || !updatedNodes || updatedNodes.length === 0) {
    return xml;
  }

  try {
    // Check if it's a compressed mxfile format
    const isCompressed = xml.includes('<mxfile') && xml.includes('<diagram');
    
    let diagramContent = xml;
    let mxfileWrapper = null;
    let diagramTag = null;

    if (isCompressed) {
      // Parse mxfile structure
      const mxfileMatch = xml.match(/<mxfile[^>]*>([\s\S]*?)<\/mxfile>/);
      if (mxfileMatch) {
        mxfileWrapper = xml.substring(0, xml.indexOf('<diagram'));
        const diagramMatch = xml.match(/<diagram([^>]*)>([\s\S]*?)<\/diagram>/);
        if (diagramMatch) {
          diagramTag = diagramMatch[1]; // Save diagram attributes
          diagramContent = diagramMatch[2].trim();
        }
      }
    }

    // Check if diagram content is base64 compressed
    const isBase64Compressed = diagramContent.length > 0 && 
      !diagramContent.trim().startsWith('<') &&
      !diagramContent.includes('<mxGraphModel');

    let decodedXml = diagramContent;

    if (isBase64Compressed) {
      // Decompress
      try {
        const buffer = Buffer.from(diagramContent, 'base64');
        const inflated = zlib.inflateRawSync(buffer).toString('utf8');
        decodedXml = decodeURIComponent(inflated);
      } catch (e) {
        // If decompression fails, try inflateSync
        try {
          const buffer = Buffer.from(diagramContent, 'base64');
          const inflated = zlib.inflateSync(buffer).toString('utf8');
          decodedXml = decodeURIComponent(inflated);
        } catch (e2) {
          console.error('Failed to decompress diagram:', e2);
          return xml; // Return original if decompression fails
        }
      }
    }

    // Use string manipulation to update labels and add subprocesses
    let updatedXml = decodedXml;
    
    // Create a map of updated nodes by ID for position lookup
    const nodePositionMap = new Map();
    updatedNodes.forEach(node => {
      nodePositionMap.set(String(node.id), { x: node.x || 0, y: node.y || 0 });
    });

    // Create a map to find actual cell IDs in XML (in case node.id doesn't match)
    const cellIdMap = new Map();
    
    // Strategy: Extract ALL id="X" attributes from the XML, then we'll use them
    // This is more reliable than trying to match specific tag structures
    const allIdPattern = /\bid\s*=\s*"([^"]+)"/g;
    let match;
    const allIds = new Set();
    while ((match = allIdPattern.exec(decodedXml)) !== null) {
      const id = match[1];
      allIds.add(id);
    }
    
    // Add all found IDs to the map (we'll use them for source/target matching)
    allIds.forEach(id => {
      cellIdMap.set(id, true);
    });
    
    // Also specifically look for mxCell IDs (they might be nested)
    // Pattern 1: Direct mxCell tags
    const mxCellPattern = /<mxCell[^>]*?\bid\s*=\s*"([^"]+)"[^>]*?>/gi;
    while ((match = mxCellPattern.exec(decodedXml)) !== null) {
      const cellId = match[1];
      cellIdMap.set(cellId, true);
    }
    
    // Pattern 2: mxCell tags that might span multiple lines (using dotall flag)
    const mxCellMultilinePattern = /<mxCell[\s\S]*?\bid\s*=\s*"([^"]+)"[\s\S]*?>/gi;
    while ((match = mxCellMultilinePattern.exec(decodedXml)) !== null) {
      const cellId = match[1];
      cellIdMap.set(cellId, true);
    }
    
    // Find an example of an existing edge to match its format
    const existingEdgePattern = /<mxCell[^>]*edge="1"[^>]*source="([^"]+)"[^>]*target="([^"]+)"[^>]*>[\s\S]*?<\/mxCell>/i;
    const existingEdgeMatch = decodedXml.match(existingEdgePattern);
    let edgeFormatExample = null;
    if (existingEdgeMatch) {
      edgeFormatExample = existingEdgeMatch[0];
      console.log(`   📋 Found example edge format (first 300 chars): ${edgeFormatExample.substring(0, 300)}...`);
    } else {
      console.log(`   ⚠️  No existing edge found to use as format example`);
    }
    
    console.log(`   📋 Found ${cellIdMap.size} existing cell IDs in XML`);
    if (cellIdMap.size > 0) {
      const sortedIds = Array.from(cellIdMap.keys()).sort((a, b) => {
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return String(a).localeCompare(String(b));
      });
      const sampleIds = sortedIds.slice(0, 20).join(', ');
      console.log(`   📋 Sample cell IDs: ${sampleIds}${cellIdMap.size > 20 ? '...' : ''}`);
    } else {
      console.warn(`   ⚠️  No cell IDs found! This might cause connection issues.`);
      console.warn(`   XML preview (first 1000 chars): ${decodedXml.substring(0, 1000)}`);
    }

    // Update labels using string replacement (safer than parsing/rebuilding)
    updatedNodes.forEach(node => {
      if (node.editedLabel !== undefined && node.editedLabel !== null) {
        const htmlLabel = node.editedLabel.includes('<') && node.editedLabel.includes('>')
          ? node.editedLabel
          : `<div><p>${node.editedLabel.replace(/\n/g, '</p><p>')}</p></div>`;
        
        // Escape for XML attribute
        const escapedLabel = htmlLabel
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
        
        // Try to find and replace the label in UserObject label attribute
        // Pattern: <UserObject label="..." ... id="nodeId" or parent="nodeId"
        const userObjectPattern = new RegExp(
          `(<UserObject[^>]*label=")[^"]*("[^>]*(?:id|parent)="${node.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>)`,
          'gs'
        );
        updatedXml = updatedXml.replace(userObjectPattern, `$1${escapedLabel}$2`);
        
        // Also try to replace in mxCell value attributes
        const valuePattern = new RegExp(
          `(<mxCell[^>]*id="${node.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*value=")[^"]*(")`,
          'gs'
        );
        updatedXml = updatedXml.replace(valuePattern, `$1${escapedLabel}$2`);
        
        console.log(`   ✅ Updated label for node ${node.id}`);
      }
    });

    // Add subprocess nodes and their edges as XML strings before </root> tag
    const subprocessNodesXml = [];
    const subprocessEdgesXml = [];
    
    // Find the highest existing ID to avoid conflicts
    let maxId = 0;
    cellIdMap.forEach(id => {
      const numId = parseInt(id);
      if (!isNaN(numId) && numId > maxId) {
        maxId = numId;
      }
    });
    
    // Start subprocess IDs from maxId + 1000 to ensure they're unique
    // Use a high starting point to avoid conflicts with draw.io's auto-assigned IDs
    // Draw.io typically uses sequential IDs starting from 0, so we use much higher numbers
    let nextSubprocessId = Math.max(10000, maxId + 1000);
    // Start edge IDs from maxId + 2000 to ensure they're unique
    let nextEdgeId = Math.max(20000, maxId + 2000);
    
    // CRITICAL: Check if any of our planned IDs conflict with existing IDs
    // If they do, start from a higher number
    while (cellIdMap.has(String(nextSubprocessId))) {
      nextSubprocessId++;
      console.log(`   ⚠️  Subprocess ID conflict detected, using ${nextSubprocessId} instead`);
    }
    while (cellIdMap.has(String(nextEdgeId))) {
      nextEdgeId++;
      console.log(`   ⚠️  Edge ID conflict detected, using ${nextEdgeId} instead`);
    }
    
    console.log(`   🔢 Max existing ID: ${maxId}, Starting subprocess IDs from: ${nextSubprocessId}, Starting edge IDs from: ${nextEdgeId}`);
    
    updatedNodes.forEach(node => {
      if (!node.subprocesses || node.subprocesses.length === 0) return;
      
      const parentPos = nodePositionMap.get(String(node.id)) || { x: 0, y: 0 };
      const parentWidth = 120;
      const parentHeight = 60;
      const minSpacing = 100; // Minimum spacing for visible connectors
      const spacing = Math.max(30, minSpacing); // Spacing between parent and subprocesses (minimum 100px for visibility)
      const subprocessSpacing = 80; // Vertical spacing between multiple subprocesses
      
      node.subprocesses.forEach((subprocess, index) => {
        const subprocessObj = typeof subprocess === 'string' 
          ? { name: subprocess, shape: 'rectangle' }
          : subprocess;
        
        if (!subprocessObj.name || !subprocessObj.name.trim()) return;
        
        // Check if a subprocess node with this name already exists in the XML
        // This handles cases where draw.io has already created/reassigned the node
        // We need to check BOTH formats:
        // 1. UserObject wrapped: <UserObject><mxCell id="X" value="..."></mxCell></UserObject>
        // 2. Plain mxCell: <mxCell id="X" value="..."></mxCell>
        const escapedNameForSearch = subprocessObj.name
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
        
        // Search for existing node with this name - look for the value attribute containing the name
        const nameInValue = `&lt;div&gt;&lt;p&gt;${escapedNameForSearch}&lt;/p&gt;&lt;/div&gt;`;
        const escapedValue = nameInValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Pattern 1: UserObject wrapped node
        const userObjectPattern = new RegExp(`<UserObject[^>]*>\\s*<mxCell[^>]*id="([^"]+)"[^>]*value="${escapedValue}"[^>]*vertex="1"`, 'i');
        // Pattern 2: Plain mxCell (not wrapped in UserObject)
        const plainMxCellPattern = new RegExp(`<mxCell[^>]*id="([^"]+)"[^>]*value="${escapedValue}"[^>]*vertex="1"`, 'i');
        
        const userObjectMatch = decodedXml.match(userObjectPattern);
        const plainCellMatch = decodedXml.match(plainMxCellPattern);
        
        let subprocessId;
        let shouldCreateNode = true;
        
        // Check both patterns - prefer UserObject match first, then plain mxCell
        if (userObjectMatch && userObjectMatch[1]) {
          subprocessId = userObjectMatch[1];
          shouldCreateNode = false;
          console.log(`   🔄 Found existing UserObject-wrapped subprocess node "${subprocessObj.name}" with ID ${subprocessId}, reusing it`);
        } else if (plainCellMatch && plainCellMatch[1]) {
          subprocessId = plainCellMatch[1];
          shouldCreateNode = false;
          console.log(`   🔄 Found existing plain mxCell subprocess node "${subprocessObj.name}" with ID ${subprocessId}, reusing it`);
        } else {
          // Create new node with unique ID
          subprocessId = nextSubprocessId++;
          // Ensure ID doesn't conflict
          while (cellIdMap.has(String(subprocessId))) {
            subprocessId = nextSubprocessId++;
            console.log(`   ⚠️  ID conflict, using ${subprocessId} instead`);
          }
          console.log(`   ✨ Creating new subprocess node "${subprocessObj.name}" with ID ${subprocessId}`);
        }
        
        // CRITICAL: Add subprocess ID to cellIdMap so edges can reference it
        cellIdMap.set(String(subprocessId), true);
        
        // Position subprocesses to the right of parent, vertically aligned
        const subprocessX = parentPos.x + parentWidth + spacing;
        const subprocessY = parentPos.y + (index * subprocessSpacing);
        
        // Get shape style
        const getShapeStyle = (shape) => {
          const baseStyle = 'whiteSpace=wrap;html=1;';
          switch (shape) {
            case 'ellipse':
              return baseStyle + 'shape=ellipse;';
            case 'decision':
              return baseStyle + 'shape=rhombus;';
            case 'data':
              return baseStyle + 'shape=parallelogram;';
            case 'document':
              return baseStyle + 'shape=document;';
            case 'subprocess':
              return baseStyle + 'shape=process;';
            default:
              return baseStyle + 'shape=rect;';
          }
        };
        
        const style = getShapeStyle(subprocessObj.shape || 'rectangle');
        const escapedName = subprocessObj.name
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
        
        // Only create the node if it doesn't already exist
        if (shouldCreateNode) {
          // Create XML string for subprocess cell - use simple mxCell format (not UserObject)
          // This matches the format of existing simple nodes and prevents ID reassignment
          // Format: <mxCell id="..." parent="1" style="..." value="..." vertex="1">
          const subprocessXml = `<mxCell id="${subprocessId}" parent="1" style="${style}" value="&lt;div&gt;&lt;p&gt;${escapedName}&lt;/p&gt;&lt;/div&gt;" vertex="1">
          <mxGeometry x="${subprocessX}" y="${subprocessY}" width="120" height="60" as="geometry" />
        </mxCell>`;
          subprocessNodesXml.push(subprocessXml);
          console.log(`   ✅ Created subprocess node: ${subprocessObj.name} (ID: ${subprocessId}) at (${subprocessX}, ${subprocessY})`);
        } else {
          console.log(`   ⏭️  Skipped creating subprocess node "${subprocessObj.name}" - already exists with ID ${subprocessId}`);
        }
        
        // IMPORTANT: Get source ID BEFORE checking for existing edges
        // Verify source ID exists in XML
        const sourceId = String(node.id);
        if (!cellIdMap.has(sourceId)) {
          console.warn(`   ⚠️  Source node ID ${sourceId} not found in XML! Available IDs: ${Array.from(cellIdMap.keys()).slice(0, 10).join(', ')}`);
          console.warn(`   ⚠️  Edge may not connect properly. Trying anyway with source="${sourceId}"`);
        } else {
          console.log(`   ✅ Source node ID ${sourceId} found in XML`);
        }
        
        // Find the actual mxCell ID for the source node
        // The sourceId from node.id should match the mxCell ID inside UserObject
        // But let's verify and find the exact ID to use
        let actualSourceId = sourceId;
        
        // Check if there's a UserObject with this ID that contains an mxCell
        // Pattern: <UserObject ... id="X">...<mxCell id="Y">
        const userObjectWithIdPattern = new RegExp(
          `<UserObject[^>]*>\\s*<mxCell[^>]*id\\s*=\\s*"${sourceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`,
          'i'
        );
        
        // Also check if the ID is directly on an mxCell (not in UserObject)
        const directMxCellPattern = new RegExp(
          `<mxCell[^>]*id\\s*=\\s*"${sourceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`,
          'i'
        );
        
        if (userObjectWithIdPattern.test(decodedXml) || directMxCellPattern.test(decodedXml)) {
          actualSourceId = sourceId;
          console.log(`   ✅ Confirmed source mxCell ID exists: ${actualSourceId}`);
        } else {
          console.warn(`   ⚠️  Source ID ${sourceId} not found as mxCell ID, but will try anyway`);
        }
        
        // ALWAYS create a NEW connector for subprocesses - never modify existing connectors
        // Each subprocess should have its own dedicated connector arrow from the parent node
        // We don't check for existing edges - we always create a fresh one
        console.log(`   🔗 Creating NEW connector from parent node ${actualSourceId} to subprocess ${subprocessObj.name} (${subprocessId})`);
        
        // Create edge/connection from parent node to subprocess
        {
          // Create edge/connection from parent node to subprocess
          // Edge style: solid black line with arrow (same as regular connectors)
          const edgeId = nextEdgeId++;
          // Use standard black connector style matching regular diagram connectors
          // exitX=1 (right), exitY=0.5 (middle), entryX=0 (left), entryY=0.5 (middle)
          const edgeStyle = 'edgeStyle=none;startArrow=none;endArrow=block;startSize=5;endSize=5;strokeColor=#000000;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;';
          
          // Create edge - match the format of existing edges exactly
          // CRITICAL: Ensure target ID matches the subprocess node ID exactly (could be existing ID like "13" or new ID)
          
          // Verify both source and target IDs exist
          const sourceExists = cellIdMap.has(actualSourceId);
          const targetExists = cellIdMap.has(String(subprocessId));
          
          if (!sourceExists) {
            console.warn(`   ⚠️  WARNING: Source ID "${actualSourceId}" not found in cellIdMap!`);
            console.warn(`   ⚠️  Available IDs: ${Array.from(cellIdMap.keys()).slice(0, 15).join(', ')}`);
          } else {
            console.log(`   ✅ Source ID "${actualSourceId}" verified in cellIdMap`);
          }
          
          if (!targetExists) {
            console.warn(`   ⚠️  WARNING: Target ID "${subprocessId}" not found in cellIdMap! This should not happen.`);
          } else {
            console.log(`   ✅ Target ID "${subprocessId}" verified in cellIdMap`);
          }
          
          // Create edge XML with explicit geometry points to ensure visible length
          // Calculate waypoints to make the connector visible and properly routed
          // The connector should go from parent node (right side) to subprocess node (left side)
          // Add intermediate waypoints to ensure the connector is visible
          const subprocessHeight = 60; // Standard subprocess node height
          const waypointX1 = parentPos.x + parentWidth + 20; // 20px to the right of parent
          const waypointY1 = parentPos.y + (parentHeight / 2); // Middle of parent
          const waypointX2 = subprocessX - 20; // 20px to the left of subprocess
          const waypointY2 = subprocessY + (subprocessHeight / 2); // Middle of subprocess
          
          // Create edge XML with waypoints to ensure visible connector
          // Format: id, value, style, edge, parent, source, target, then geometry with waypoints
          const edgeXml = `<mxCell id="${edgeId}" value="" style="${edgeStyle}" edge="1" parent="1" source="${actualSourceId}" target="${subprocessId}">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="${waypointX1}" y="${waypointY1}" />
              <mxPoint x="${waypointX2}" y="${waypointY2}" />
            </Array>
          </mxGeometry>
        </mxCell>`;
          
          subprocessEdgesXml.push(edgeXml);
          
          // Log the full edge XML for debugging
          console.log(`   🔗 Edge XML (full): ${edgeXml}`);
          console.log(`   🔗 Source ID: "${actualSourceId}", Target ID: "${subprocessId}", Edge ID: "${edgeId}"`);
          console.log(`   ✅ Created NEW edge connecting node ${sourceId} -> subprocess ${subprocessObj.name} (${subprocessId}) via edge ${edgeId}`);
          
          // If there are multiple subprocesses, connect them with arrows too
          if (index > 0) {
            // Calculate previous subprocess ID (the one created before this one)
            const prevSubprocessId = nextSubprocessId - (node.subprocesses.length - index + 1);
            
            // Verify previous subprocess ID exists
            if (cellIdMap.has(String(prevSubprocessId))) {
              const connectorEdgeId = nextEdgeId++;
              const connectorStyle = 'edgeStyle=none;startArrow=none;endArrow=block;startSize=5;endSize=5;strokeColor=#000000;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;';
              const connectorXml = `<mxCell id="${connectorEdgeId}" value="" style="${connectorStyle}" edge="1" parent="1" source="${prevSubprocessId}" target="${subprocessId}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
              subprocessEdgesXml.push(connectorXml);
              console.log(`   ✅ Created connector between subprocesses: ${prevSubprocessId} -> ${subprocessId} via edge ${connectorEdgeId}`);
            } else {
              console.warn(`   ⚠️  Previous subprocess ID ${prevSubprocessId} not found, skipping connector`);
            }
          }
        }
      });
    });
    
    // Combine nodes and edges - nodes first, then edges
    const subprocessXmlParts = [...subprocessNodesXml, ...subprocessEdgesXml];
    
    // Insert subprocess XML before </root> tag
    if (subprocessXmlParts.length > 0) {
      const rootEndIndex = updatedXml.lastIndexOf('</root>');
      if (rootEndIndex > 0) {
        const nodesCount = subprocessNodesXml.length;
        const edgesCount = subprocessEdgesXml.length;
        
        // Find a good insertion point - look for the last </mxCell> or </UserObject> before </root>
        // This ensures edges come after nodes
        let insertIndex = rootEndIndex;
        
        // Try to find the last cell before </root> to insert after it
        const lastCellPattern = /<\/UserObject>|<\/mxCell>/g;
        let lastMatch;
        let lastCellEnd = -1;
        while ((lastMatch = lastCellPattern.exec(updatedXml.substring(0, rootEndIndex))) !== null) {
          lastCellEnd = lastMatch.index + lastMatch[0].length;
        }
        
        if (lastCellEnd > 0) {
          insertIndex = lastCellEnd;
          console.log(`   📍 Inserting subprocesses after last cell at position ${insertIndex}`);
        } else {
          insertIndex = rootEndIndex;
          console.log(`   📍 Inserting subprocesses before </root> at position ${insertIndex}`);
        }
        
        // Insert subprocess XML - nodes first, then edges
        // Add a newline for readability (draw.io can handle it)
        const subprocessXmlString = '\n    ' + subprocessXmlParts.join('\n    ') + '\n  ';
        updatedXml = updatedXml.substring(0, insertIndex) + 
                     subprocessXmlString + 
                     updatedXml.substring(insertIndex);
        console.log(`   ✅ Inserted ${nodesCount} subprocess nodes and ${edgesCount} edges into XML`);
        console.log(`   📊 Total subprocess elements: ${subprocessXmlParts.length}`);
        
        // Verify edges were inserted and check their format
        const edgeCountInXml = (updatedXml.match(/edge="1"/g) || []).length;
        console.log(`   🔍 Total edges in XML after insertion: ${edgeCountInXml}`);
        
        // Verify each edge we created is in the XML
        if (subprocessEdgesXml.length > 0) {
          console.log(`   🔍 Verifying ${subprocessEdgesXml.length} subprocess edges in XML...`);
          subprocessEdgesXml.forEach((edgeXml, idx) => {
            const edgeId = edgeXml.match(/id="(\d+)"/)?.[1];
            const sourceId = edgeXml.match(/source="([^"]+)"/)?.[1];
            const targetId = edgeXml.match(/target="([^"]+)"/)?.[1];
            
            if (edgeId && updatedXml.includes(`id="${edgeId}"`)) {
              console.log(`   ✅ Edge ${idx + 1}/${subprocessEdgesXml.length}: ID ${edgeId} (${sourceId} -> ${targetId}) verified in XML`);
            } else {
              console.warn(`   ⚠️  Edge ${idx + 1}/${subprocessEdgesXml.length}: ID ${edgeId} NOT found in XML!`);
            }
          });
        }
        
        // Verify subprocess nodes are also present
        if (subprocessNodesXml.length > 0) {
          console.log(`   🔍 Verifying ${subprocessNodesXml.length} subprocess nodes in XML...`);
          subprocessNodesXml.forEach((nodeXml, idx) => {
            const nodeId = nodeXml.match(/id="(\d+)"/)?.[1];
            if (nodeId && updatedXml.includes(`id="${nodeId}"`)) {
              console.log(`   ✅ Node ${idx + 1}/${subprocessNodesXml.length}: ID ${nodeId} verified in XML`);
            } else {
              console.warn(`   ⚠️  Node ${idx + 1}/${subprocessNodesXml.length}: ID ${nodeId} NOT found in XML!`);
            }
          });
        }
        
        // CRITICAL: Ensure all existing edges (manually created) are preserved
        // Check if any edges are missing geometry attributes and fix them
        // This ensures manually created connectors will render properly
        const edgePattern = /<mxCell([^>]*edge="1"[^>]*)>([\s\S]*?)<\/mxCell>/gi;
        let edgeMatches;
        let fixedEdges = 0;
        
        while ((edgeMatches = edgePattern.exec(updatedXml)) !== null) {
          const fullEdge = edgeMatches[0];
          const edgeAttrs = edgeMatches[1];
          const edgeContent = edgeMatches[2];
          
          // Check if edge has geometry
          if (!edgeContent.includes('<mxGeometry')) {
            // Edge is missing geometry - add it
            const fixedEdge = fullEdge.replace(
              /(<mxCell[^>]*>)([\s\S]*?)(<\/mxCell>)/i,
              `$1<mxGeometry relative="1" as="geometry"/>$3`
            );
            updatedXml = updatedXml.replace(fullEdge, fixedEdge);
            fixedEdges++;
            console.log(`   🔧 Fixed edge missing geometry: ${edgeAttrs.match(/id="([^"]+)"/)?.[1] || 'unknown'}`);
          }
        }
        
        if (fixedEdges > 0) {
          console.log(`   ✅ Fixed ${fixedEdges} edges that were missing geometry attributes`);
        }
      } else {
        console.warn('   ⚠️  Could not find </root> tag to insert subprocesses');
        // Don't fail - just skip subprocess insertion
      }
    }
    
    // Validate the updated XML before returning
    if (!updatedXml || updatedXml.trim().length === 0) {
      console.error('❌ Updated XML is empty! Returning original.');
      return xml;
    }
    
    // Check if essential tags are present
    if (!updatedXml.includes('<mxGraphModel') && !updatedXml.includes('<mxGraphModel>')) {
      console.error('❌ Updated XML missing mxGraphModel tag! Returning original.');
      return xml;
    }
    
    if (!updatedXml.includes('<root') && !updatedXml.includes('</root>')) {
      console.error('❌ Updated XML missing root tag! Returning original.');
      return xml;
    }
    
    console.log('✅ Updated XML using string manipulation, length:', updatedXml.length);

    // If it was compressed, recompress
    if (isBase64Compressed) {
      try {
        const encoded = encodeURIComponent(updatedXml);
        const buffer = Buffer.from(encoded, 'utf8');
        const compressed = zlib.deflateRawSync(buffer);
        const base64 = compressed.toString('base64');
        
        if (mxfileWrapper && diagramTag !== null) {
          // Reconstruct mxfile with compressed content
          return mxfileWrapper + `<diagram${diagramTag}>${base64}</diagram></mxfile>`;
        }
        return base64;
      } catch (e) {
        console.error('Failed to recompress diagram:', e);
        // Return uncompressed if recompression fails
        if (mxfileWrapper && diagramTag !== null) {
          return mxfileWrapper + `<diagram${diagramTag}>${updatedXml}</diagram></mxfile>`;
        }
        return updatedXml;
      }
    }

    // If it had mxfile wrapper, reconstruct it
    if (mxfileWrapper && diagramTag !== null) {
      return mxfileWrapper + `<diagram${diagramTag}>${updatedXml}</diagram></mxfile>`;
    }

    return updatedXml;
  } catch (error) {
    console.error('Error updating diagram XML:', error);
    console.error('   Stack:', error.stack);
    return xml; // Return original XML if update fails
  }
}

module.exports = {
  updateDiagramXml,
};
