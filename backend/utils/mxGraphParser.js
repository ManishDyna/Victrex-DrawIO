const { XMLParser } = require('fast-xml-parser');
const zlib = require('zlib');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true, // Convert string "1" to number 1
  trimValues: true,
});

/* -------------------- helpers -------------------- */

function inferShapeFromStyle(style = '') {
  const s = style.toLowerCase();

  if (s.includes('ellipse')) return 'ellipse';
  if (s.includes('rhombus') || s.includes('diamond')) return 'decision';
  if (s.includes('parallelogram')) return 'data';
  if (s.includes('document')) return 'document';
  // Check for subprocess/swimlane - draw.io uses various style strings
  // Check for shape=swimlane or shape=subprocess in style first (more specific)
  if (s.includes('shape=swimlane') || s.includes('shape=subprocess')) return 'subprocess';
  // Then check for keywords in style string
  if (s.includes('swimlane') || s.includes('subprocess')) return 'subprocess';

  return 'rectangle';
}

function decodeCompressedDiagram(base64) {
  const buffer = Buffer.from(base64, 'base64');

  try {
    const inflated = zlib.inflateRawSync(buffer).toString('utf8');
    return decodeURIComponent(inflated);
  } catch {
    const inflated = zlib.inflateSync(buffer).toString('utf8');
    return decodeURIComponent(inflated);
  }
}

/**
 * Recursively collect all mxCell elements from nested structures
 */
function collectAllCells(obj, cells = [], visited = new Set()) {
  if (!obj) return cells;
  
  // Prevent infinite loops with circular references
  if (visited.has(obj)) return cells;
  visited.add(obj);

  // If it's an array, process each item
  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectAllCells(item, cells, visited);
    }
    return cells;
  }

  // If it's an object
  if (typeof obj === 'object') {
    // Check if this is an mxCell (more lenient check - any object with id)
    // This will catch root cells too, but we'll filter them later
    if (obj.id !== undefined) {
      cells.push(obj);
    }

    // Recursively check all properties
    for (const key in obj) {
      if (key === 'mxCell') {
        // Handle wrapped mxCell
        const wrapped = Array.isArray(obj.mxCell) ? obj.mxCell : [obj.mxCell];
        wrapped.forEach(cell => {
          if (cell && cell.id !== undefined) {
            cells.push(cell);
            // Also recurse into the cell to find nested cells
            collectAllCells(cell, cells, visited);
          }
        });
      } else if (key === 'UserObject') {
        // UserObject often contains cells - recurse into it
        const userObj = Array.isArray(obj.UserObject) ? obj.UserObject : [obj.UserObject];
        userObj.forEach(item => {
          if (item) collectAllCells(item, cells, visited);
        });
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        // Skip null and primitive values
        collectAllCells(obj[key], cells, visited);
      }
    }
  }

  return cells;
}

/**
 * Normalize mxCell list:
 * - supports direct mxCell
 * - supports wrapped { mxCell: {...} }
 * - supports nested structures
 */
function normalizeCells(mxCells) {
  if (!mxCells) return [];

  // Use recursive collection to get all cells
  const allCells = collectAllCells(mxCells);

  // If we found cells recursively, use those
  if (allCells.length > 0) {
    return allCells;
  }

  // Fallback to original logic
  if (!Array.isArray(mxCells)) {
    mxCells = [mxCells];
  }

  const normalized = [];

  for (const item of mxCells) {
    if (item.mxCell) {
      // wrapped form (Visio / tagged)
      const wrapped = Array.isArray(item.mxCell) ? item.mxCell : [item.mxCell];
      wrapped.forEach(cell => {
        if (cell) normalized.push(cell);
      });
    } else if (item.id !== undefined) {
      // normal draw.io mxCell
      normalized.push(item);
    }
  }

  return normalized;
}

/* -------------------- main parser -------------------- */

function parseMxGraphXml(xml, defaultDiagramId = 'Page-1') {
  if (!xml || typeof xml !== 'string') {
    throw new Error('XML must be a non-empty string');
  }

  let diagramId = defaultDiagramId;
  let model;

  /* ---------- mxfile with compressed diagram ---------- */
  if (xml.includes('<mxfile') && xml.includes('<diagram')) {
    const diagramMatch = xml.match(/<diagram[^>]*>([\s\S]*?)<\/diagram>/);
    if (!diagramMatch) {
      throw new Error('Invalid mxfile: <diagram> not found');
    }

    const nameMatch = xml.match(/<diagram[^>]*name="([^"]+)"/);
    if (nameMatch) diagramId = nameMatch[1];

    const diagramContent = diagramMatch[1].trim();
    
    // Check if diagram content is compressed (base64) or uncompressed (XML)
    const isCompressed = diagramContent.length > 0 && 
      !diagramContent.trim().startsWith('<') &&
      !diagramContent.includes('<mxGraphModel');
    
    let decodedXml;
    
    if (isCompressed) {
      // Try to decode compressed content
      try {
        decodedXml = decodeCompressedDiagram(diagramContent);
        console.log('✅ Successfully decompressed diagram content');
        console.log('   Decompressed XML length:', decodedXml.length);
        console.log('   Decompressed XML preview (first 500 chars):', decodedXml.substring(0, 500));
        console.log('   Has <mxGraphModel>:', decodedXml.includes('<mxGraphModel'));
        console.log('   Has <mxCell>:', decodedXml.includes('<mxCell'));
      } catch (decompressError) {
        console.error('❌ Failed to decompress diagram:', decompressError.message);
        // If decompression fails, try parsing as-is (might be uncompressed)
        decodedXml = diagramContent;
      }
    } else {
      // Content is already uncompressed XML
      decodedXml = diagramContent;
      console.log('📄 Diagram content is already uncompressed');
    }
    
    try {
      const parsed = parser.parse(decodedXml);
      model = parsed.mxGraphModel;
      
      if (!model) {
        console.warn('⚠️  Parsed XML but mxGraphModel not found. Structure:', 
          Object.keys(parsed).join(', '));
        console.warn('   Full parsed structure:', JSON.stringify(parsed, null, 2).substring(0, 1000));
      } else {
        // Log model structure for debugging
        console.log('📊 Parsed mxGraphModel structure:');
        console.log('   - Has root:', !!model.root);
        if (model.root) {
          console.log('   - Root keys:', Object.keys(model.root).join(', '));
          if (model.root.mxCell) {
            const cells = Array.isArray(model.root.mxCell) ? model.root.mxCell : [model.root.mxCell];
            console.log('   - Root mxCell count:', cells.length);
            if (cells.length > 0) {
              console.log('   - First cell keys:', Object.keys(cells[0] || {}).join(', '));
            }
          } else {
            console.log('   - No mxCell found in root');
            // Log a sample of root structure
            const rootStr = JSON.stringify(model.root, null, 2);
            console.log('   - Root structure sample (first 800 chars):', rootStr.substring(0, 800));
          }
        }
      }
    } catch (parseError) {
      console.error('❌ Failed to parse decoded XML:', parseError.message);
      console.error('   Decoded XML preview (first 500 chars):', decodedXml.substring(0, 500));
      throw new Error(`Failed to parse diagram XML: ${parseError.message}`);
    }
  }

  /* ---------- plain mxGraphModel ---------- */
  if (!model) {
    const parsed = parser.parse(xml);
    model = parsed.mxGraphModel;
  }

  if (!model?.root) {
    throw new Error('Invalid mxGraphModel: root not found');
  }

  /* ---------- normalize cells ---------- */
  // Use recursive collection to find ALL cells in the structure (not just direct children)
  console.log('🔍 Collecting all cells recursively from root...');
  let cells = collectAllCells(model.root);
  
  console.log(`📋 Found ${cells.length} total cells via recursive search`);
  
  // If recursive search found nothing, try direct access as fallback
  if (cells.length === 0) {
    console.warn('⚠️  No cells found after recursive search, trying direct access...');
    const rootCells = model.root.mxCell || model.root;
    cells = normalizeCells(rootCells);
    console.log(`📋 Fallback: Found ${cells.length} cells via direct access`);
  }

  // Filter out root cells (id="0" and id="1") and cells without meaningful content
  console.log(`📋 Found ${cells.length} total cells before filtering`);
  
  // Log sample cells to understand their FULL structure
  if (cells.length > 0) {
    console.log('   Sample cells (first 5, FULL structure):');
    for (let i = 0; i < Math.min(5, cells.length); i++) {
      const cell = cells[i];
      // Log the FULL cell structure (not just selected fields)
      const cellStr = JSON.stringify(cell, null, 2);
      console.log(`   Cell ${i + 1} (id=${cell.id}):`, cellStr.substring(0, 800));
    }
  }
  
  // Also check UserObject structure if present
  if (model.root.UserObject) {
    console.log('   📦 UserObject structure found:');
    const userObj = Array.isArray(model.root.UserObject) ? model.root.UserObject : [model.root.UserObject];
    console.log(`   Found ${userObj.length} UserObject(s)`);
    if (userObj.length > 0) {
      const userObjStr = JSON.stringify(userObj[0], null, 2);
      console.log('   First UserObject:', userObjStr.substring(0, 500));
    }
  }
  
  const filteredCells = cells.filter(cell => {
    // Skip root cells (id="0" and id="1")
    if (cell.id === '0' || cell.id === 0 || cell.id === '1' || cell.id === 1) {
      return false;
    }
    
    // VERY lenient filtering - include ALL cells except root cells
    // The actual data (geometry, style, value) might be in nested structures
    // or associated via parent relationships
    // We'll process them all and let the node/edge detection logic handle it
    
    // Check if cell has ANY meaningful attributes beyond just id
    const hasAnyAttribute = Object.keys(cell).length > 1; // More than just 'id'
    
    if (!hasAnyAttribute) {
      console.log(`   Filtering out cell id=${cell.id} (only has id, no other attributes)`);
      return false;
    }
    
    // Include all cells that have more than just an id
    return true;
  });
  
  console.log(`📋 After filtering: ${filteredCells.length} cells (removed ${cells.length - filteredCells.length} root/empty cells)`);
  
  if (filteredCells.length > 0) {
    console.log('   ✅ Sample filtered cell keys:', Object.keys(filteredCells[0] || {}).join(', '));
    console.log('   ✅ Sample filtered cell:', JSON.stringify(filteredCells[0], null, 2).substring(0, 400));
  }
  
  cells = filteredCells;

  const nodes = [];
  const connections = [];
  const edgeDebugLog = []; // Track edge detection for debugging
  const allCellsWithSourceTarget = []; // Track all cells with source/target for debugging

  for (const cell of cells) {
    // Unwrap cell if it has nested mxCell structure
    // Some cells come as { mxCell: {...}, label: "..." } 
    // Others come as direct mxCell objects
    const actualCell = cell.mxCell || cell;
    const cellId = actualCell.id || cell.id;
    
    // Get label from multiple possible locations
    const label = cell.label || actualCell.value || cell.value || actualCell.label || '';
    
    // More flexible vertex/edge detection - check both cell and actualCell
    const vertexValue = actualCell.vertex !== undefined ? actualCell.vertex : cell.vertex;
    const edgeValue = actualCell.edge !== undefined ? actualCell.edge : cell.edge;
    const source = actualCell.source !== undefined ? actualCell.source : cell.source;
    const target = actualCell.target !== undefined ? actualCell.target : cell.target;
    
    // Track all cells with source/target for debugging
    if (source || target) {
      allCellsWithSourceTarget.push({
        cellId,
        source: source ? String(source) : null,
        target: target ? String(target) : null,
        edge: edgeValue,
        vertex: vertexValue,
        hasBoth: !!(source && target)
      });
    }
    
    // CRITICAL: If a cell has both source and target, it's ALWAYS an edge/connection
    // This must be checked FIRST before determining if it's a vertex
    // Use explicit checks to handle 0, empty strings, etc.
    const hasSourceAndTarget = (source !== undefined && source !== null && source !== '') && 
                                (target !== undefined && target !== null && target !== '');
    
    // Determine if it's a vertex (only if it doesn't have source/target)
    // Vertices are shapes/nodes, edges are connections
    const isVertex = !hasSourceAndTarget && (
      vertexValue === 1 || 
      vertexValue === '1' || 
      vertexValue === true || 
      vertexValue === 'true' ||
      (vertexValue !== undefined && edgeValue === undefined)
    );
    
    // Determine if it's explicitly marked as an edge
    const isExplicitEdge = 
      edgeValue === 1 || 
      edgeValue === '1' || 
      edgeValue === true || 
      edgeValue === 'true' ||
      (edgeValue !== undefined && vertexValue === undefined);

    /* ---------- nodes ---------- */
    if (isVertex) {
      // Check geometry in both locations
      const geom = actualCell.mxGeometry || cell.mxGeometry || {};
      // Get style from both locations
      const style = actualCell.style || cell.style || '';
      
      const inferredShape = inferShapeFromStyle(style);
      
      // Log subprocess detection for debugging
      if (inferredShape === 'subprocess') {
        console.log(`   🔷 Subprocess detected: cell id=${cellId}, style preview: ${style.substring(0, 100)}`);
      }
      
      nodes.push({
        id: cellId,
        label: label,
        shape: inferredShape,
        x: geom.x != null ? Number(geom.x) : 0,
        y: geom.y != null ? Number(geom.y) : 0,
      });
    }
  
    /* ---------- edges ---------- */
    // PRIORITY: If it has source and target, it's ALWAYS a connection/edge
    // This handles manually created connections in draw.io that might not have edge="1"
    if (hasSourceAndTarget) {
      const connection = {
        from: String(source), // Ensure string IDs for consistency
        to: String(target),
      };
      connections.push(connection);
      edgeDebugLog.push(`✅ Edge found (source+target): ${connection.from} -> ${connection.to} (cell id=${cellId}, edge=${edgeValue}, vertex=${vertexValue})`);
    } else if (isExplicitEdge && source && target) {
      // Fallback: explicit edge attribute with source/target
      const connection = {
        from: String(source),
        to: String(target),
      };
      connections.push(connection);
      edgeDebugLog.push(`✅ Edge found (explicit edge attr): ${connection.from} -> ${connection.to} (cell id=${cellId})`);
    } else if (source || target) {
      // Log potential edge that's missing source or target (incomplete connection)
      edgeDebugLog.push(`⚠️  Incomplete edge: cell ${cellId} has source=${source} but target=${target} (missing one endpoint)`);
    } else if (isExplicitEdge) {
      // Edge marked but no source/target - might be a template or incomplete
      edgeDebugLog.push(`⚠️  Edge marked but no source/target: cell ${cellId} (edge=${edgeValue})`);
    }
  }
  
  // Log all cells with source/target for debugging
  if (allCellsWithSourceTarget.length > 0) {
    console.log(`🔍 Found ${allCellsWithSourceTarget.length} cells with source/target attributes:`);
    allCellsWithSourceTarget.forEach(cellInfo => {
      console.log(`   - Cell ${cellInfo.cellId}: source=${cellInfo.source}, target=${cellInfo.target}, edge=${cellInfo.edge}, vertex=${cellInfo.vertex}, hasBoth=${cellInfo.hasBoth}`);
    });
  }
  
  // Remove duplicate connections (same from->to pair)
  const connectionMap = new Map();
  const uniqueConnections = [];
  
  for (const conn of connections) {
    const key = `${conn.from}->${conn.to}`;
    if (!connectionMap.has(key)) {
      connectionMap.set(key, conn);
      uniqueConnections.push(conn);
    } else {
      console.log(`   🔄 Skipping duplicate connection: ${key}`);
    }
  }
  
  if (connections.length !== uniqueConnections.length) {
    console.log(`🔄 Removed ${connections.length - uniqueConnections.length} duplicate connections`);
  }
  
  connections.length = 0;
  connections.push(...uniqueConnections);
  
  // Validate that all connection source/target IDs match existing node IDs
  const nodeIds = new Set(nodes.map(n => String(n.id)));
  const invalidConnections = connections.filter(conn => {
    const fromExists = nodeIds.has(String(conn.from));
    const toExists = nodeIds.has(String(conn.to));
    return !fromExists || !toExists;
  });
  
  if (invalidConnections.length > 0) {
    console.warn(`⚠️  WARNING: Found ${invalidConnections.length} connections with invalid node IDs:`);
    invalidConnections.forEach(conn => {
      const fromExists = nodeIds.has(String(conn.from));
      const toExists = nodeIds.has(String(conn.to));
      console.warn(`   - Connection ${conn.from} -> ${conn.to}: from exists=${fromExists}, to exists=${toExists}`);
      console.warn(`     Available node IDs: ${Array.from(nodeIds).slice(0, 10).join(', ')}${nodeIds.size > 10 ? '...' : ''}`);
    });
    
    // Remove invalid connections
    const validConnections = connections.filter(conn => {
      const fromExists = nodeIds.has(String(conn.from));
      const toExists = nodeIds.has(String(conn.to));
      return fromExists && toExists;
    });
    
    if (validConnections.length !== connections.length) {
      console.log(`🗑️  Removed ${connections.length - validConnections.length} invalid connections`);
      connections.length = 0;
      connections.push(...validConnections);
    }
  } else if (connections.length > 0) {
    console.log(`✅ All ${connections.length} connections have valid source/target node IDs`);
  }
  
  // Log edge detection summary
  if (edgeDebugLog.length > 0) {
    console.log(`🔗 Edge detection summary (${edgeDebugLog.length} edge-related cells):`);
    edgeDebugLog.forEach(log => console.log(`   ${log}`));
  } else {
    console.log(`⚠️  No edges detected! This might indicate a problem with edge detection.`);
    console.log(`   Total cells processed: ${cells.length}`);
    console.log(`   Total nodes found: ${nodes.length}`);
    if (allCellsWithSourceTarget.length > 0) {
      console.log(`   ⚠️  However, found ${allCellsWithSourceTarget.length} cells with source/target - these should be edges!`);
    }
  }
  
  // Additional debug: Log a sample of cells that might be edges but weren't detected
  if (connections.length === 0 && cells.length > 0) {
    console.log(`🔍 Debugging: No connections found. Checking first few cells for edge indicators...`);
    for (let i = 0; i < Math.min(5, cells.length); i++) {
      const cell = cells[i];
      const actualCell = cell.mxCell || cell;
      const hasSource = actualCell.source !== undefined || cell.source !== undefined;
      const hasTarget = actualCell.target !== undefined || cell.target !== undefined;
      const hasEdge = actualCell.edge !== undefined || cell.edge !== undefined;
      const hasVertex = actualCell.vertex !== undefined || cell.vertex !== undefined;
      
      if (hasSource || hasTarget || hasEdge) {
        console.log(`   Cell ${i} (id=${actualCell.id || cell.id}): source=${hasSource}, target=${hasTarget}, edge=${hasEdge}, vertex=${hasVertex}`);
        console.log(`      Full cell structure:`, JSON.stringify(cell, null, 2).substring(0, 500));
      }
    }
  }
  
  // for (const cell of cells) {
  //   /* ---------- nodes ---------- */
  //   if (cell.vertex === '1') {
  //     const geom = cell.mxGeometry || {};

  //     nodes.push({
  //       id: cell.id,
  //       label: cell.value || '',
  //       shape: inferShapeFromStyle(cell.style),
  //       x: geom.x != null ? Number(geom.x) : 0,
  //       y: geom.y != null ? Number(geom.y) : 0,
  //     });
  //   }

  //   /* ---------- edges ---------- */
  //   if (cell.edge === '1' && cell.source && cell.target) {
  //     connections.push({
  //       from: cell.source,
  //       to: cell.target,
  //     });
  //   }
  // }

  // Final summary
  console.log(`\n📊 Parsing Summary:`);
  console.log(`   - Total cells processed: ${cells.length}`);
  console.log(`   - Nodes found: ${nodes.length}`);
  console.log(`   - Unique connections found: ${connections.length}`);
  if (connections.length > 0) {
    console.log(`   - Sample connections: ${connections.slice(0, 3).map(c => `${c.from}->${c.to}`).join(', ')}${connections.length > 3 ? '...' : ''}`);
  }
  
  return {
    diagramId,
    nodes,
    connections,
  };
}

module.exports = {
  parseMxGraphXml,
};
