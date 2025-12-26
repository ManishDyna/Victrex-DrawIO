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
const { buildMxGraphXml } = require('./utils/mxGraphBuilder');

const app = express();
const PORT = process.env.PORT || 3001;

// ---- MongoDB Setup --------------------------------------------------------

// Connection string, override with MONGODB_URI env var if desired
// NOTE: This default points at your MongoDB Atlas cluster.
// For production, consider moving this into an environment variable only.
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://jatinsharma_db_user:YVFmtZaQ5Z3XG3rF@cluster0.42xy9cc.mongodb.net/?appName=Cluster0';

// Diagram schema: stores XML plus parsed structure and metadata
const diagramSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    xml: { type: String, required: true },
    sourceFileName: { type: String },
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
          businessOwner: { type: String },
        },
      ],
      connections: [
        {
          from: { type: String },
          to: { type: String },
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
    // modern Mongoose works without extra options
  })
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
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
 * POST /api/diagrams
 * Creates a new diagram entry in MongoDB.
 * Parses the XML and stores both raw XML and parsed structure.
 *
 * Body: { name: string, xml: string, sourceFileName?: string, diagramId?: string }
 */
app.post('/api/diagrams', async (req, res) => {
  try {
    const { name, xml, sourceFileName, diagramId } = req.body || {};

    if (!name || !xml) {
      return res.status(400).json({
        error: 'Both "name" and "xml" fields are required.',
      });
    }

    let parsedData;

    try {
      parsedData = parseMxGraphXml(xml, diagramId || 'Page-1');
      console.log(`Successfully parsed XML for new diagram. Nodes: ${parsedData.nodes?.length || 0}, Connections: ${parsedData.connections?.length || 0}`);
    } catch (err) {
      console.warn('Failed to parse XML for new diagram:', err.message);
      // Set empty parsedData structure if parsing fails
      parsedData = {
        diagramId: diagramId || 'Page-1',
        nodes: [],
        connections: [],
      };
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
    const { id } = req.params;
    const doc = await Diagram.findById(id);

    if (!doc) {
      return res.status(404).json({ error: 'Diagram not found.' });
    }

    return res.json({
      id: doc._id,
      name: doc.name,
      sourceFileName: doc.sourceFileName,
      xml: doc.xml,
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
 * Used by FormPage to load form data when a process is selected.
 * 
 * Response format:
 * {
 *   id: string,
 *   name: string,
 *   diagramId: string,
 *   nodes: [{ id, label, shape, x, y }],
 *   connections: [{ from, to }]
 * }
 */
app.get('/api/diagrams/:id/parsed', async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Diagram.findById(id).select('parsedData name');

    if (!doc) {
      return res.status(404).json({ error: 'Diagram not found.' });
    }

    if (!doc.parsedData) {
      return res.status(404).json({ 
        error: 'Parsed data not available for this diagram.',
        message: 'This diagram may need to be re-saved to generate parsed data.'
      });
    }

    // Ensure nodes and connections are arrays (handle null/undefined)
    const response = {
      id: doc._id.toString(),
      name: doc.name,
      diagramId: doc.parsedData.diagramId || 'Page-1',
      nodes: Array.isArray(doc.parsedData.nodes) ? doc.parsedData.nodes : [],
      connections: Array.isArray(doc.parsedData.connections) ? doc.parsedData.connections : [],
    };

    return res.json(response);
  } catch (err) {
    console.error('Error fetching parsed diagram:', err);
    return res.status(500).json({ error: 'Failed to fetch parsed diagram.' });
  }
});

/**
 * PUT /api/diagrams/:id
 * Updates an existing diagram's XML and optionally its name.
 * Automatically parses the XML to update parsedData so form data stays in sync.
 * 
 * Body: { xml: string, name?: string }
 */
app.put('/api/diagrams/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { xml, name } = req.body;

    if (!xml) {
      return res.status(400).json({ error: 'XML is required.' });
    }

    const doc = await Diagram.findById(id);

    if (!doc) {
      return res.status(404).json({ error: 'Diagram not found.' });
    }

    // Preserve existing diagramId or use default
    const diagramId = doc.parsedData?.diagramId || 'Page-1';

    // Parse XML to update parsedData (this ensures form data stays in sync)
    let parsedData = null;
    try {
      parsedData = parseMxGraphXml(xml, diagramId);
      
      // Preserve existing businessOwner values from old parsedData
      if (doc.parsedData?.nodes && Array.isArray(doc.parsedData.nodes)) {
        const existingNodesMap = new Map();
        doc.parsedData.nodes.forEach((oldNode) => {
          if (oldNode.id && oldNode.businessOwner) {
            existingNodesMap.set(oldNode.id, oldNode.businessOwner);
          }
        });
        
        // Merge businessOwner into newly parsed nodes
        if (parsedData.nodes && Array.isArray(parsedData.nodes)) {
          parsedData.nodes = parsedData.nodes.map((newNode) => {
            if (existingNodesMap.has(newNode.id)) {
              return {
                ...newNode,
                businessOwner: existingNodesMap.get(newNode.id),
              };
            }
            return newNode;
          });
        }
      }
      
      console.log(`Successfully parsed XML for diagram ${id}. Nodes: ${parsedData.nodes?.length || 0}, Connections: ${parsedData.connections?.length || 0}`);
    } catch (parseErr) {
      console.error('Failed to parse XML during update:', parseErr.message);
      console.error('Parse error details:', parseErr);
      // If parsing fails, we still update XML but keep old parsedData or set empty
      // This allows the diagram to be saved even if parsing fails
      if (!doc.parsedData) {
        parsedData = {
          diagramId: diagramId,
          nodes: [],
          connections: [],
        };
      }
    }

    // Update XML
    doc.xml = xml;

    // Update name if provided
    if (name) {
      doc.name = name;
    }

    // Update parsedData if parsing was successful
    if (parsedData) {
      doc.parsedData = parsedData;
    }

    await doc.save();

    return res.json({
      id: doc._id.toString(),
      name: doc.name,
      sourceFileName: doc.sourceFileName,
      xml: doc.xml,
      parsedData: doc.parsedData,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error('Error updating diagram:', err);
    return res.status(500).json({ error: 'Failed to update diagram.' });
  }
});

/**
 * PUT /api/diagrams/:id/parsed
 * Updates the parsed data (nodes and connections) for a diagram.
 * 
 * Body: { nodes: Array, connections: Array, diagramId?: string }
 */
app.put('/api/diagrams/:id/parsed', async (req, res) => {
  try {
    const { id } = req.params;
    const { nodes, connections, diagramId } = req.body;

    if (!nodes || !Array.isArray(nodes)) {
      return res.status(400).json({ error: 'Nodes array is required.' });
    }

    if (!connections || !Array.isArray(connections)) {
      return res.status(400).json({ error: 'Connections array is required.' });
    }

    const doc = await Diagram.findById(id);

    if (!doc) {
      return res.status(404).json({ error: 'Diagram not found.' });
    }

    // Update parsedData
    const updatedDiagramId = diagramId || doc.parsedData?.diagramId || 'Page-1';
    doc.parsedData = {
      diagramId: updatedDiagramId,
      nodes: nodes,
      connections: connections,
    };

    // Rebuild XML from updated parsedData to keep editor in sync
    try {
      const updatedXml = buildMxGraphXml({
        diagramId: updatedDiagramId,
        nodes: nodes,
        connections: connections,
      });
      doc.xml = updatedXml;
    } catch (xmlErr) {
      console.warn('Failed to rebuild XML from parsedData:', xmlErr.message);
      // Continue without updating XML if rebuild fails
    }

    await doc.save();

    return res.json({
      id: doc._id.toString(),
      name: doc.name,
      diagramId: doc.parsedData.diagramId,
      nodes: doc.parsedData.nodes,
      connections: doc.parsedData.connections,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error('Error updating parsed diagram:', err);
    return res.status(500).json({ error: 'Failed to update diagram.' });
  }
});

// ---- Start server --------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Draw.io server running at http://localhost:${PORT}`);
  console.log(`Serving files from: ${DRAWIO_WEBAPP_PATH}`);
});


