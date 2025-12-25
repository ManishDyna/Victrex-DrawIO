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
    let nextSubprocessId = Math.max(10000, maxId + 1000);
    // Start edge IDs from maxId + 2000 to ensure they're unique
    let nextEdgeId = Math.max(20000, maxId + 2000);
    
    console.log(`   🔢 Max existing ID: ${maxId}, Starting subprocess IDs from: ${nextSubprocessId}, Starting edge IDs from: ${nextEdgeId}`);
    
    updatedNodes.forEach(node => {
      if (!node.subprocesses || node.subprocesses.length === 0) return;
      
      const parentPos = nodePositionMap.get(String(node.id)) || { x: 0, y: 0 };
      const parentWidth = 120;
      const parentHeight = 60;
      const spacing = 30; // Spacing between parent and subprocesses
      const subprocessSpacing = 80; // Vertical spacing between multiple subprocesses
      
      node.subprocesses.forEach((subprocess, index) => {
        const subprocessObj = typeof subprocess === 'string' 
          ? { name: subprocess, shape: 'rectangle' }
          : subprocess;
        
        if (!subprocessObj.name || !subprocessObj.name.trim()) return;
        
        const subprocessId = nextSubprocessId++;
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
        
        // Create XML string for subprocess cell matching the UserObject format
        const subprocessXml = `<UserObject label="&lt;div&gt;&lt;p&gt;${escapedName}&lt;/p&gt;&lt;/div&gt;"><mxCell id="${subprocessId}" value="&lt;div&gt;&lt;p&gt;${escapedName}&lt;/p&gt;&lt;/div&gt;" style="${style}" vertex="1" parent="1"><mxGeometry x="${subprocessX}" y="${subprocessY}" width="120" height="60" as="geometry"/></mxCell></UserObject>`;
        subprocessNodesXml.push(subprocessXml);
        
        // Create edge/connection from parent node to subprocess
        // Edge style: dashed line with arrow to indicate subprocess relationship
        const edgeId = nextEdgeId++;
        // Use a more visible dashed arrow style - thicker line, blue color, larger arrow
        // exitX=1 (right), exitY=0.5 (middle), entryX=0 (left), entryY=0.5 (middle)
        const edgeStyle = 'endArrow=classic;html=1;rounded=0;strokeWidth=2.5;strokeColor=#0066CC;dashed=1;dashPattern=8 4;endSize=10;endFill=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;';
        
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
        
        // Create edge - match the format of existing edges exactly
        // Use the example edge format if available, otherwise use standard format
        let edgeXml;
        if (edgeFormatExample) {
          // Extract the basic structure from example, but use our custom style
          // The example shows us the exact attribute order and format
          edgeXml = `<mxCell id="${edgeId}" value="" style="${edgeStyle}" edge="1" parent="1" source="${actualSourceId}" target="${subprocessId}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
          console.log(`   📋 Using example edge format as reference`);
        } else {
          // Standard edge format - ensure all required attributes are present
          edgeXml = `<mxCell id="${edgeId}" value="" style="${edgeStyle}" edge="1" parent="1" source="${actualSourceId}" target="${subprocessId}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
        }
        
        subprocessEdgesXml.push(edgeXml);
        
        // Log the full edge XML for debugging
        console.log(`   🔗 Edge XML (full): ${edgeXml}`);
        console.log(`   🔗 Source ID: "${actualSourceId}", Target ID: "${subprocessId}"`);
        
        // Verify source ID exists in cellIdMap
        if (!cellIdMap.has(actualSourceId)) {
          console.warn(`   ⚠️  WARNING: Source ID "${actualSourceId}" not found in cellIdMap!`);
          console.warn(`   ⚠️  Available IDs: ${Array.from(cellIdMap.keys()).slice(0, 15).join(', ')}`);
          console.warn(`   ⚠️  Edge may not render correctly.`);
        } else {
          console.log(`   ✅ Source ID "${actualSourceId}" verified in cellIdMap`);
        }
        
        console.log(`   ✅ Created subprocess: ${subprocessObj.name} (ID: ${subprocessId}) connected to node ${sourceId} via edge ${edgeId}`);
        
        // If there are multiple subprocesses, connect them with arrows too
        if (index > 0) {
          const prevSubprocessId = nextSubprocessId - (node.subprocesses.length - index);
          const connectorEdgeId = nextEdgeId++;
          const connectorStyle = 'endArrow=classic;html=1;rounded=0;strokeWidth=2;strokeColor=#999999;dashed=1;dashPattern=4 4;endSize=8;endFill=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;';
          const connectorXml = `<mxCell id="${connectorEdgeId}" value="" style="${connectorStyle}" edge="1" parent="1" source="${prevSubprocessId}" target="${subprocessId}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
          subprocessEdgesXml.push(connectorXml);
          console.log(`   ✅ Created connector between subprocesses: ${prevSubprocessId} -> ${subprocessId} via edge ${connectorEdgeId}`);
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
        
        updatedXml = updatedXml.substring(0, insertIndex) + 
                     subprocessXmlParts.join('') + 
                     updatedXml.substring(insertIndex);
        console.log(`   ✅ Inserted ${nodesCount} subprocess nodes and ${edgesCount} edges into XML`);
        console.log(`   📊 Total subprocess elements: ${subprocessXmlParts.length}`);
        
        // Verify edges were inserted and check their format
        const edgeCountInXml = (updatedXml.match(/edge="1"/g) || []).length;
        console.log(`   🔍 Total edges in XML after insertion: ${edgeCountInXml}`);
        
        // Verify the edge we created is in the XML
        if (subprocessEdgesXml.length > 0) {
          const firstEdgeId = subprocessEdgesXml[0].match(/id="(\d+)"/)?.[1];
          if (firstEdgeId && updatedXml.includes(`id="${firstEdgeId}"`)) {
            console.log(`   ✅ Verified edge ${firstEdgeId} is present in XML`);
          } else {
            console.warn(`   ⚠️  Edge ${firstEdgeId} might not be in XML correctly`);
          }
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
