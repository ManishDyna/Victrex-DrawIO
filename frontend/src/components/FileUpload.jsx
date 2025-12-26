import { useRef, forwardRef, useImperativeHandle } from 'react';

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
const FileUpload = forwardRef(({ onFileSelect, disabled }, ref) => {
  const fileInputRef = useRef(null);

  // Expose trigger method to parent component
  useImperativeHandle(ref, () => ({
    triggerUpload: () => {
      fileInputRef.current?.click();
    }
  }));

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
    <div className="file-upload" style={{ display: 'none' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".drawio,.xml,.mxfile,.vsdx,.vsd"
        onChange={handleFileChange}
      />
    </div>
  );
});

FileUpload.displayName = 'FileUpload';

export default FileUpload;

