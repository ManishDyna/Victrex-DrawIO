/**
 * Backend server for draw.io
 *
 * Responsibilities:
 * - Serve the local draw.io webapp (unmodified)
 * - Provide a REST API for storing and retrieving diagrams in MongoDB
 * - Handle CORS for iframe embedding and frontend API calls
 */

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { parseMxGraphXml } = require('./utils/mxGraphParser');
const { updateDiagramXml } = require('./utils/xmlUpdater');

const app = express();
const PORT = process.env.PORT || 3001;

// ---- MongoDB Setup --------------------------------------------------------

// Connection string, override with MONGODB_URI env var if desired
// NOTE: This default points at your MongoDB Atlas cluster.
// For production, consider moving this into an environment variable only.
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://manishsoni_db_user:zFcvZnoOojXytiZI@cluster0.8ctpqtn.mongodb.net/';

// Diagram schema: stores XML plus parsed structure and metadata
const diagramSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    xml: { type: String, required: true },
    sourceFileName: { type: String },
    // Process owner information
    processOwner: { type: String }, // Overall process owner
    // Parsed structure from XML
    parsedData: {
      diagramId: { type: String },
      nodes: [
        {
          id: { type: String },
          label: { type: String },
          shape: { type: String },
          x: { type: Number },
          y: { type: Number },
          owner: { type: String }, // Owner name for this specific step
          subprocesses: [{
            name: { type: String },
            shape: { type: String, default: 'rectangle' },
            parent: { type: String, default: 'main' } // 'main' for main step, or 'subprocess-{index}' for previous subprocess
          }], // Subprocesses with name, shape, and parent connection
        },
      ],
      connections: [
        {
          from: { type: String },
          to: { type: String },
          // Connector properties from VSDX/XML
          style: { type: String }, // Full style string (strokeWidth, strokeColor, endArrow, etc.)
          id: { type: String }, // Edge cell ID
          // Extracted style properties for easier access
          strokeWidth: { type: Number },
          strokeColor: { type: String },
          endArrow: { type: String },
          startArrow: { type: String },
          dashed: { type: Boolean },
          dashPattern: { type: String },
        },
      ],
    },
  },
  { timestamps: true }
);

const Diagram = mongoose.model('Diagram', diagramSchema);

// Connect to MongoDB once at startup
mongoose
  .connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  })
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    console.error('Full error:', err);
  });

// ---- Middleware -----------------------------------------------------------

// Parse JSON bodies for API routes
app.use(express.json({ limit: '5mb' }));

// Enable CORS for all routes (needed for iframe embedding and API)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  );
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// ---- Static draw.io hosting ----------------------------------------------

// Path to draw.io webapp directory
const DRAWIO_WEBAPP_PATH = path.join(
  __dirname,
  '..',
  'drawio',
  'src',
  'main',
  'webapp'
);

// Serve static files from draw.io webapp directory
app.use(express.static(DRAWIO_WEBAPP_PATH));

// ---- REST API for diagrams -----------------------------------------------

/**
 * PUT /api/diagrams/:id
 * Updates an existing diagram's XML (used when editor saves).
 * Re-parses the XML to update parsedData.
 */
app.put('/api/diagrams/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database not connected. Please check MongoDB connection.' 
      });
    }

    const { id } = req.params;
    const { xml, name } = req.body || {};

    if (!xml) {
      return res.status(400).json({
        error: '"xml" field is required.',
      });
    }

    const doc = await Diagram.findById(id);
    if (!doc) {
      return res.status(404).json({ error: 'Diagram not found.' });
    }

    // Update XML
    doc.xml = xml;
    if (name) {
      doc.name = name;
    }

    // Re-parse XML to update parsedData
    // IMPORTANT: Preserve existing parsedData fields (like owner, subprocesses) that aren't in XML
    try {
      const diagramId = doc.parsedData?.diagramId || 'Page-1';
      const freshParsedData = parseMxGraphXml(xml, diagramId);
      
      // Preserve existing node metadata (owner, subprocesses) by merging with fresh parsed data
      if (doc.parsedData?.nodes && freshParsedData.nodes) {
        // Create a map of existing nodes by ID for quick lookup
        const existingNodesMap = new Map();
        doc.parsedData.nodes.forEach(node => {
          existingNodesMap.set(node.id, node);
        });
        
        // Merge fresh parsed nodes with existing metadata
        freshParsedData.nodes = freshParsedData.nodes.map(freshNode => {
          const existingNode = existingNodesMap.get(freshNode.id);
          if (existingNode) {
            // Preserve owner and subprocesses from existing node
            return {
              ...freshNode, // Fresh data from XML (label, shape, position, etc.)
              owner: existingNode.owner || freshNode.owner || '', // Preserve owner
              subprocesses: existingNode.subprocesses || freshNode.subprocesses || [], // Preserve subprocesses
            };
          }
          return freshNode;
        });
        
        // Also preserve any nodes that exist in old data but not in fresh (shouldn't happen, but safe)
        const freshNodeIds = new Set(freshParsedData.nodes.map(n => n.id));
        doc.parsedData.nodes.forEach(existingNode => {
          if (!freshNodeIds.has(existingNode.id)) {
            // Node was removed from XML, but we keep it with its metadata
            // Actually, if it's not in XML, it shouldn't be in parsedData either
            // So we skip this case
          }
        });
      }
      
      // Update parsedData with merged data
      doc.parsedData = {
        ...freshParsedData,
        diagramId: freshParsedData.diagramId || doc.parsedData?.diagramId || diagramId,
      };
      
      console.log(`✅ Re-parsed diagram XML: ${freshParsedData.nodes.length} nodes, ${freshParsedData.connections.length} connections`);
      console.log(`   - Preserved metadata (owners, subprocesses) from existing parsedData`);
    } catch (parseError) {
      console.error('⚠️  Failed to re-parse XML:', parseError.message);
      // Continue without failing - XML is still updated, but parsedData might be stale
    }

    await doc.save();

    return res.json({
      id: doc._id,
      name: doc.name,
      sourceFileName: doc.sourceFileName,
      processOwner: doc.processOwner,
      parsedData: doc.parsedData,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error('Error updating diagram XML:', err);
    return res.status(500).json({ error: 'Failed to update diagram.' });
  }
});

/**
 * POST /api/diagrams
 * Creates a new diagram entry in MongoDB.
 * Parses the XML and stores both raw XML and parsed structure.
 *
 * Body: { name: string, xml: string, sourceFileName?: string, diagramId?: string }
 */
app.post('/api/diagrams', async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database not connected. Please check MongoDB connection.' 
      });
    }

    const { name, xml, sourceFileName, diagramId } = req.body || {};

    if (!name || !xml) {
      return res.status(400).json({
        error: 'Both "name" and "xml" fields are required.',
      });
    }

    let parsedData;

    // Debug: Log XML structure info
    const isVSDX = sourceFileName?.toLowerCase().endsWith('.vsdx') || sourceFileName?.toLowerCase().endsWith('.vsd');
    
    // Count edges in XML before parsing
    // NOTE: If XML is compressed (base64 in <diagram> tag), edges won't be visible in the string
    // We'll count them after decompression in the parser
    const isCompressedXml = xml.includes('<diagram') && !xml.includes('<mxGraphModel>');
    let edgeCountInXml = 0;
    let sourceTargetCount = 0;
    let targetCount = 0;
    
    if (!isCompressedXml) {
      // Only count edges if XML is uncompressed
      edgeCountInXml = (xml.match(/edge="1"/g) || []).length;
      sourceTargetCount = (xml.match(/source="[^"]+"/g) || []).length;
      targetCount = (xml.match(/target="[^"]+"/g) || []).length;
    } else {
      // For compressed XML, we can't count edges in the base64 string
      // The parser will count them after decompression
      edgeCountInXml = -1; // -1 indicates compressed (unknown until decompressed)
    }
    
    const cellsWithSourceTarget = sourceTargetCount > 0 ? Math.min(sourceTargetCount, targetCount) : 0;
    
    console.log('\n📄 Diagram save request:');
    console.log(`   - Name: ${name}`);
    console.log(`   - Source: ${sourceFileName || 'manual'}`);
    console.log(`   - Is VSDX: ${isVSDX}`);
    console.log(`   - XML length: ${xml.length} chars`);
    console.log(`   - XML starts with: ${xml.substring(0, 100)}`);
    console.log(`   - Has <mxfile>: ${xml.includes('<mxfile')}`);
    console.log(`   - Has <diagram>: ${xml.includes('<diagram')}`);
    console.log(`   - Has mxGraphModel: ${xml.includes('mxGraphModel')}`);
    console.log(`   - Has mxCell: ${xml.includes('mxCell')}`);
    if (isCompressedXml) {
      console.log(`   - XML is COMPRESSED (base64) - edges will be counted after decompression`);
    } else {
      console.log(`   - Edges in XML (edge="1"): ${edgeCountInXml}`);
      console.log(`   - Cells with source: ${sourceTargetCount}, with target: ${targetCount}`);
      console.log(`   - Estimated connections in XML: ${cellsWithSourceTarget}`);
    }

    try {
      parsedData = parseMxGraphXml(xml, diagramId || 'Page-1');
      console.log('✅ Parsed diagram successfully:');
      console.log(`   - Nodes: ${parsedData.nodes.length}`);
      console.log(`   - Connections: ${parsedData.connections.length}`);
      
      if (isCompressedXml) {
        console.log(`   - XML was compressed - found ${parsedData.connections.length} connections after decompression`);
      } else {
        console.log(`   - Edges in XML: ${edgeCountInXml}, Parsed connections: ${parsedData.connections.length}`);
        if (edgeCountInXml > 0 && parsedData.connections.length === 0) {
          console.error('❌ CRITICAL: XML has edges but parser found 0 connections!');
          console.error('   This indicates an edge detection problem in the parser.');
        } else if (edgeCountInXml !== parsedData.connections.length) {
          console.warn(`⚠️  WARNING: Edge count mismatch! XML has ${edgeCountInXml} edges, parser found ${parsedData.connections.length} connections.`);
        }
      }
      
      if (parsedData.nodes.length === 0 && parsedData.connections.length === 0) {
        console.warn('⚠️  WARNING: Parsed successfully but found 0 nodes and 0 connections!');
        console.warn('   This might indicate the XML structure is different from expected.');
      }
    } catch (err) {
      console.error('❌ Diagram parsing failed:', err.message);
      console.error('   Error stack:', err.stack);
      console.error('   XML preview (first 500 chars):', xml.substring(0, 500));
      // Don't set parsedData, let it remain undefined
    }

    const doc = await Diagram.create({
      name,
      xml,
      sourceFileName: sourceFileName || undefined,
      parsedData: parsedData || undefined,
    });

    return res.status(201).json({
      id: doc._id,
      name: doc.name,
      sourceFileName: doc.sourceFileName,
      processOwner: doc.processOwner,
      parsedData: doc.parsedData,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error('Error creating diagram:', err);
    return res.status(500).json({ error: 'Failed to create diagram.' });
  }
});


/**
 * GET /api/diagrams
 * Returns a list of diagrams with basic metadata (no XML payload).
 */
app.get('/api/diagrams', async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database not connected. Please check MongoDB connection.' 
      });
    }

    const diagrams = await Diagram.find(
      {},
      'name sourceFileName createdAt updatedAt'
    )
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json(
      diagrams.map((d) => ({
        id: d._id,
        name: d.name,
        sourceFileName: d.sourceFileName,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }))
    );
  } catch (err) {
    console.error('Error listing diagrams:', err);
    return res.status(500).json({ error: 'Failed to list diagrams.' });
  }
});

/**
 * GET /api/diagrams/:id
 * Returns a single diagram including XML payload and parsed data.
 */
app.get('/api/diagrams/:id', async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database not connected. Please check MongoDB connection.' 
      });
    }

    const { id } = req.params;
    const doc = await Diagram.findById(id);

    if (!doc) {
      return res.status(404).json({ error: 'Diagram not found.' });
    }

    // Log XML structure when loading
    if (doc.xml) {
      const isCompressed = doc.xml.includes('<diagram') && !doc.xml.includes('<mxGraphModel>');
      let edgeCountInXml = 0;
      let sourceTargetCount = 0;
      let targetCount = 0;
      
      if (!isCompressed) {
        edgeCountInXml = (doc.xml.match(/edge="1"/g) || []).length;
        sourceTargetCount = (doc.xml.match(/source="[^"]+"/g) || []).length;
        targetCount = (doc.xml.match(/target="[^"]+"/g) || []).length;
      }
      
      console.log(`\n📥 Loading diagram "${doc.name}" (ID: ${id}):`);
      console.log(`   - XML length: ${doc.xml.length} chars`);
      if (isCompressed) {
        console.log(`   - XML is COMPRESSED (base64) - edges are encoded, will be visible after draw.io decompresses`);
      } else {
        console.log(`   - Edges in XML (edge="1"): ${edgeCountInXml}`);
        console.log(`   - Cells with source: ${sourceTargetCount}, with target: ${targetCount}`);
      }
      console.log(`   - Parsed connections: ${doc.parsedData?.connections?.length || 0}`);
    }

    return res.json({
      id: doc._id,
      name: doc.name,
      sourceFileName: doc.sourceFileName,
      xml: doc.xml,
      processOwner: doc.processOwner,
      parsedData: doc.parsedData,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error('Error fetching diagram:', err);
    return res.status(500).json({ error: 'Failed to fetch diagram.' });
  }
});

/**
 * GET /api/diagrams/:id/parsed
 * Returns only the parsed structure (nodes and connections) for a diagram.
 */
app.get('/api/diagrams/:id/parsed', async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Diagram.findById(id).select('parsedData name');

    if (!doc) {
      return res.status(404).json({ error: 'Diagram not found.' });
    }

    if (!doc.parsedData) {
      return res.status(404).json({ error: 'Parsed data not available for this diagram.' });
    }

    return res.json({
      id: doc._id,
      name: doc.name,
      ...doc.parsedData,
    });
  } catch (err) {
    console.error('Error fetching parsed diagram:', err);
    return res.status(500).json({ error: 'Failed to fetch parsed diagram.' });
  }
});

/**
 * PATCH /api/diagrams/:id
 * Updates a diagram with owner information and edited content.
 * 
 * Body: { processOwner?: string, parsedData?: { nodes?: [...], connections?: [...] } }
 */
app.patch('/api/diagrams/:id', async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database not connected. Please check MongoDB connection.' 
      });
    }

    const { id } = req.params;
    const { processOwner, parsedData } = req.body;

    const doc = await Diagram.findById(id);

    if (!doc) {
      return res.status(404).json({ error: 'Diagram not found.' });
    }

    // Update process owner if provided
    if (processOwner !== undefined) {
      doc.processOwner = processOwner;
    }

    // Update parsed data if provided
    if (parsedData) {
      if (!doc.parsedData) {
        doc.parsedData = {};
      }

      if (parsedData.nodes) {
        doc.parsedData.nodes = parsedData.nodes;
        
        // Also update the XML to reflect changes in the diagram
        try {
          console.log('🔄 Updating diagram XML with form view changes...');
          console.log(`   - Nodes to update: ${parsedData.nodes.length}`);
          const nodesWithSubprocesses = parsedData.nodes.filter(n => 
            n.subprocesses && n.subprocesses.length > 0
          );
          console.log(`   - Nodes with subprocesses: ${nodesWithSubprocesses.length}`);
          
          const updatedXml = updateDiagramXml(doc.xml, parsedData.nodes);
          if (updatedXml && updatedXml !== doc.xml) {
            doc.xml = updatedXml;
            console.log('✅ Updated diagram XML with form view changes');
            
            // CRITICAL: Re-parse the updated XML to get ALL connections including newly added ones
            // This ensures edges added for subprocesses are included in parsedData
            try {
              const diagramId = doc.parsedData?.diagramId || parsedData.diagramId || 'Page-1';
              const reParsedData = parseMxGraphXml(updatedXml, diagramId);
              
              console.log(`   🔄 Re-parsed updated XML: ${reParsedData.nodes.length} nodes, ${reParsedData.connections.length} connections`);
              
              // Update connections with the re-parsed data (includes new subprocess edges)
              if (reParsedData.connections && reParsedData.connections.length > 0) {
                // Merge with form view connections to preserve any manual edits
                const formConnections = parsedData.connections || [];
                const reParsedConnections = reParsedData.connections;
                
                // Create a map to merge connections
                const connectionMap = new Map();
                reParsedConnections.forEach(conn => {
                  const key = `${conn.from}->${conn.to}`;
                  connectionMap.set(key, conn);
                });
                
                // Add form view connections (these might have manual edits)
                formConnections.forEach(conn => {
                  const key = `${conn.from}->${conn.to}`;
                  connectionMap.set(key, conn);
                });
                
                const allConnections = Array.from(connectionMap.values());
                console.log(`   🔗 Merged connections: ${reParsedConnections.length} from XML + ${formConnections.length} from form = ${allConnections.length} total`);
                
                // Update parsedData with merged connections
                if (!doc.parsedData) {
                  doc.parsedData = {};
                }
                doc.parsedData.connections = allConnections;
              }
            } catch (reParseError) {
              console.warn('⚠️  Failed to re-parse updated XML for connections:', reParseError.message);
              // Continue without failing - connections will be merged below
            }
          } else {
            console.warn('⚠️  XML update returned same or empty XML');
          }
        } catch (xmlError) {
          console.error('⚠️  Failed to update XML, keeping original:', xmlError.message);
          console.error('   Error stack:', xmlError.stack);
          // Continue without failing - parsedData is still updated
        }
      }

      // If connections weren't updated from XML re-parsing above, merge them now
      // This handles cases where XML wasn't updated or re-parsing failed
      if (parsedData.connections) {
        // Check if connections were already set from re-parsing
        if (!doc.parsedData?.connections || doc.parsedData.connections.length === 0) {
          // Merge connections from form view with existing connections from database
          const existingConnections = doc.parsedData?.connections || [];
          const formConnections = parsedData.connections;
          
          // Create a map of existing connections (from->to as key)
          const existingConnMap = new Map();
          existingConnections.forEach(conn => {
            const key = `${conn.from}->${conn.to}`;
            existingConnMap.set(key, conn);
          });
          
          // Add/update connections from form view
          formConnections.forEach(conn => {
            const key = `${conn.from}->${conn.to}`;
            existingConnMap.set(key, conn);
          });
          
          // Convert back to array
          const mergedConnections = Array.from(existingConnMap.values());
          
          console.log(`   🔗 Merging connections (fallback): ${existingConnections.length} existing + ${formConnections.length} from form = ${mergedConnections.length} total`);
          
          if (!doc.parsedData) {
            doc.parsedData = {};
          }
          doc.parsedData.connections = mergedConnections;
        } else {
          console.log(`   ✅ Connections already updated from XML re-parsing (${doc.parsedData.connections.length} connections)`);
        }
      }

      // Preserve other parsedData fields if they exist
      if (parsedData.diagramId) {
        doc.parsedData.diagramId = parsedData.diagramId;
      }
    }

    await doc.save();

    return res.json({
      id: doc._id,
      name: doc.name,
      sourceFileName: doc.sourceFileName,
      processOwner: doc.processOwner,
      parsedData: doc.parsedData,
      xml: doc.xml, // Include XML so diagram can be reloaded
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error('Error updating diagram:', err);
    return res.status(500).json({ error: 'Failed to update diagram.' });
  }
});

// ---- Start server --------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Draw.io server running at http://localhost:${PORT}`);
  console.log(`Serving files from: ${DRAWIO_WEBAPP_PATH}`);
});


