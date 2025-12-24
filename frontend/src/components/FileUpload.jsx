import { useRef } from 'react';

/**
 * FileUpload Component
 * 
 * Provides a file upload button for diagram files.
 * Supports .drawio, .xml, .mxfile, and .vsdx formats.
 * 
 * When a file is selected:
 * 1. Validates file type
 * 2. Calls onFileSelect callback with the file
 *    - Text files (.drawio, .xml, .mxfile) are read as text
 *    - Binary files (.vsdx) are read as ArrayBuffer
 */
function FileUpload({ onFileSelect, disabled }) {
  const fileInputRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    
    if (!file) {
      return;
    }

    // Validate file extension
    const fileName = file.name.toLowerCase();
    const validExtensions = ['.drawio', '.xml', '.mxfile', '.vsdx', '.vsd'];
    const isValidFile = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isValidFile) {
      alert('Please select a valid diagram file (.drawio, .xml, .mxfile, or .vsdx)');
      return;
    }

    // Call parent callback with the file
    if (onFileSelect) {
      onFileSelect(file);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="file-upload">
      <input
        ref={fileInputRef}
        type="file"
        accept=".drawio,.xml,.mxfile,.vsdx,.vsd"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button
        onClick={handleButtonClick}
        disabled={disabled}
        className="upload-button"
      >
        {disabled ? 'Loading Editor...' : 'Upload Diagram'}
      </button>
      {disabled && (
        <p className="upload-hint">Please wait for the editor to load...</p>
      )}
    </div>
  );
}

export default FileUpload;

