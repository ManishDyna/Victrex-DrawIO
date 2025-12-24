# Business Process Management System

A custom React application that embeds draw.io as an editor with custom file upload and persistence to MongoDB, tailored for business process management.

## Project Structure

```
Victrex-DrawIO/
├── drawio/              # Cloned draw.io repository (unmodified)
├── frontend/            # React application (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── DrawIOEditor.jsx    # Iframe wrapper for draw.io
│   │   │   └── FileUpload.jsx      # File upload component
│   │   ├── App.jsx                 # Main app component
│   │   └── main.jsx               # Entry point
│   └── package.json
├── backend/             # Node.js server to serve draw.io
│   ├── server.js
│   └── package.json
└── README.md
```

## Architecture

### Frontend (React)
- **DrawIOEditor Component**: Embeds draw.io in an iframe and handles postMessage communication
- **FileUpload Component**: Provides file upload button for .drawio, .xml, and .mxfile formats
- **App Component**: Orchestrates file upload and editor communication

### Backend (Node.js/Express)
- Serves draw.io static files from the local `drawio` repository
- Handles CORS for iframe embedding
- Runs on port 3001

### Communication Flow

1. **Editor Initialization**:
   - Frontend creates iframe pointing to `http://localhost:3001/index.html?embed=1&proto=json&spin=1`
   - Draw.io loads in embed mode and sends `init` event when ready

2. **File Upload**:
   - User clicks "Upload Diagram" button
   - File is read as text (XML content)
   - XML is sent to draw.io via postMessage:
     ```javascript
     {
       action: 'load',
       xml: '<mxfile>...</mxfile>'
     }
     ```

3. **Diagram Loading**:
   - Draw.io receives the message and loads the diagram
   - Draw.io sends `load` event when diagram is loaded

## Setup Instructions

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

   The server will run on `http://localhost:3001`

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

   The frontend will run on `http://localhost:5173` (or another port if 5173 is busy)

## Usage

1. **Start Backend**: Make sure the backend server is running on port 3001
2. **Start Frontend**: Start the React development server
3. **Open Browser**: Navigate to the frontend URL (usually `http://localhost:5173`)
4. **Wait for Editor**: Wait for the draw.io editor to load (you'll see "Loading Editor..." button)
5. **Upload Diagram**: Click "Upload Diagram" and select a .drawio, .xml, or .mxfile file
6. **View Diagram**: The diagram will load automatically in the embedded editor

## How It Works

### Embedding draw.io

Draw.io is embedded using an iframe with the following URL parameters:
- `embed=1`: Enables embed mode (minimizes UI, disables file operations)
- `proto=json`: Uses JSON message protocol for communication
- `spin=1`: Shows loading spinner while waiting for data

### File Upload Bypass

The custom file upload button:
- Reads files directly from the user's file system
- Sends the XML content to draw.io via postMessage API
- Bypasses draw.io's internal file upload mechanism

### PostMessage API

Communication between React app and draw.io iframe:

**From React to draw.io**:
```javascript
{
  action: 'load',
  xml: '<mxfile>...</mxfile>'
}
```

**From draw.io to React**:
```javascript
{
  event: 'init'      // Editor ready
  event: 'load'      // Diagram loaded
  event: 'autosave'   // Diagram modified
}
```

## Technical Details

### Draw.io Embed Mode

When `embed=1` is set:
- Draw.io enters embed mode via `initializeEmbedMode()` function
- File operations are disabled
- UI is minimized
- Communication happens via postMessage API

### Message Handler

Draw.io's `installMessageHandler()` function:
- Listens for postMessage events from parent window
- Handles JSON protocol when `proto=json` is set
- Processes `action: 'load'` messages to load diagram XML
- Calls callback function with XML data to load into editor

### File Format Support

The application supports:
- `.drawio`: Draw.io native format (compressed XML)
- `.xml`: Standard XML format
- `.mxfile`: mxGraph file format

All formats are read as text and sent as XML to draw.io, which handles decompression and parsing automatically.

## Notes

- Draw.io code remains unmodified
- All communication uses standard postMessage API
- No authentication required (single-user, local usage)
- Architecture is modular and extensible for future features

## Troubleshooting

**Editor doesn't load**:
- Check that backend server is running on port 3001
- Check browser console for CORS errors
- Verify draw.io files exist in `drawio/src/main/webapp/`

**File doesn't load**:
- Check browser console for postMessage errors
- Verify file format is supported (.drawio, .xml, .mxfile)
- Ensure editor has sent 'init' event before uploading

**CORS errors**:
- Backend server should set CORS headers (already configured)
- Both frontend and backend should be running

## Future Enhancements

This is Phase 1. Future phases may include:
- Save/export functionality
- Authentication
- Multi-user support
- Custom UI controls
- Diagram persistence

