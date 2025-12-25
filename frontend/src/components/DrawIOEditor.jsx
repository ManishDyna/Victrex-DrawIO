import { useEffect, useRef } from 'react';

/**
 * DrawIOEditor Component
 *
 * Embeds draw.io in an iframe and handles communication via postMessage API.
 *
 * How it works:
 * 1. Creates an iframe pointing to draw.io with embed=1&proto=json parameters
 * 2. Listens for 'init' event from draw.io indicating it's ready
 * 3. When diagram XML is provided, sends it to draw.io via postMessage
 * 4. When a save is requested, sends an 'export' action and forwards the result
 *
 * Props:
 * - diagramXml: XML string to load into the editor
 * - onReady: callback when editor has sent the 'init' event
 * - onExport: callback when an 'export' event is received from draw.io
 * - saveRequestId: monotonically increasing number to trigger an export request
 * - convertRequestId: monotonically increasing number to trigger a conversion export
 * - onLoad: callback when diagram has been loaded
 */
function DrawIOEditor({ diagramXml, onReady, onExport, saveRequestId, convertRequestId, onLoad }) {
  const iframeRef = useRef(null);
  const isReadyRef = useRef(false);
  const lastSentXmlRef = useRef(null);

  useEffect(() => {
    // Draw.io server URL (backend serves draw.io on port 3001)
    const drawioUrl = 'http://localhost:3001/index.html?embed=1&proto=json&spin=1';
    
    if (iframeRef.current) {
      iframeRef.current.src = drawioUrl;
    }
  }, []);

  useEffect(() => {
    /**
     * Message handler for communication with draw.io iframe
     *
     * Draw.io sends various events (proto=json):
     * - { event: 'init' }        -> editor ready
     * - { event: 'load' }        -> diagram loaded
     * - { event: 'autosave' }    -> diagram changed (with xml)
     * - { event: 'export', ... } -> result of an export request
     */
    const handleMessage = (event) => {
      // Security: Only accept messages from our draw.io server
      if (event.origin !== 'http://localhost:3001') {
        return;
      }

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        
        if (data.event === 'init') {
          // Editor is ready
          isReadyRef.current = true;
          if (onReady) {
            onReady();
          }
          // If diagram XML is already available, send it now
          if (diagramXml && iframeRef.current?.contentWindow && lastSentXmlRef.current !== diagramXml) {
            const message = {
              action: 'load',
              xml: diagramXml
            };
            iframeRef.current.contentWindow.postMessage(
              JSON.stringify(message),
              'http://localhost:3001'
            );
            lastSentXmlRef.current = diagramXml;
            console.log('Sent diagram to draw.io editor (on init)');
          }
        } else if (data.event === 'load') {
          console.log('Diagram loaded successfully');
          if (onLoad) {
            onLoad();
          }
        } else if (data.event === 'autosave') {
          console.log('Diagram modified');
        } else if (data.event === 'export') {
          // Export result from the editor (contains xml and possibly other data)
          if (onExport) {
            onExport(data);
          }
        }
      } catch (error) {
        // Ignore non-JSON messages
        console.debug('Non-JSON message from draw.io:', event.data);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [onReady, diagramXml, onExport]);

  useEffect(() => {
    /**
     * Send diagram data to draw.io when it's available and editor is ready
     *
     * Message format (JSON protocol):
     * {
     *   action: 'load',
     *   xml: '<mxfile>...</mxfile>' or 'data:application/vnd.visio;base64,...' for VSDX
     * }
     * 
     * Supports:
     * - XML-based formats (.drawio, .xml, .mxfile) - sent as XML string
     * - VSDX/VSD files - sent as base64 data URL (draw.io will auto-import)
     */
    if (diagramXml && isReadyRef.current && iframeRef.current?.contentWindow && lastSentXmlRef.current !== diagramXml) {
      const message = {
        action: 'load',
        xml: diagramXml
      };
      
      // Send message to draw.io iframe
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify(message),
        'http://localhost:3001'
      );
      
      lastSentXmlRef.current = diagramXml;
      console.log('Sent diagram to draw.io editor');
    }
  }, [diagramXml]);

  useEffect(() => {
    /**
     * When saveRequestId changes, request an export from draw.io.
     * We use format 'xml' to get the full mxfile structure with all diagram data.
     * This ensures VSDX-imported diagrams are properly exported with their structure.
     *
     * Message format (JSON protocol):
     * {
     *   action: 'export',
     *   format: 'xml'
     * }
     */
    if (!saveRequestId || !isReadyRef.current || !iframeRef.current?.contentWindow) {
      return;
    }

    const message = {
      action: 'export',
      format: 'xml',
    };

    iframeRef.current.contentWindow.postMessage(
      JSON.stringify(message),
      'http://localhost:3001'
    );
  }, [saveRequestId]);

  useEffect(() => {
    /**
     * When convertRequestId changes, request an export for conversion.
     * This is used to convert uploaded files to compressed XML format.
     */
    if (!convertRequestId || !isReadyRef.current || !iframeRef.current?.contentWindow) {
      return;
    }

    const message = {
      action: 'export',
      format: 'xml',
    };

    iframeRef.current.contentWindow.postMessage(
      JSON.stringify(message),
      'http://localhost:3001'
    );
  }, [convertRequestId]);

  return (
    <div className="drawio-editor">
      <iframe
        ref={iframeRef}
        title="Draw.io Editor"
        className="drawio-iframe"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}

export default DrawIOEditor;

